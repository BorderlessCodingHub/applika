from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import (
    JSONResponse,
    PlainTextResponse,
    RedirectResponse,
)
from fastapi_sso import OpenID
from fastapi_sso.sso.github import GithubSSO

from app.application.dto.user_session import SessionTokensDTO
from app.application.use_cases.cli_auth.authorize import (
    OOB_REDIRECT_URI,
    PKCE_FLOW,
)
from app.application.use_cases.user_registration import (
    UserRegistrationUseCase,
)
from app.config.settings import REFRESH_COOKIE_NAME, envs
from app.core.exceptions import InvalidSession
from app.core.tokens import (
    clear_access_cookie,
    clear_refresh_cookie,
    set_access_cookie,
    set_refresh_cookie,
)
from app.presentation.api.auth_handoff import (
    CLI_LOGIN_COOKIE_NAME,
    build_callback_redirect_url,
    validate_cli_callback_url,
)
from app.presentation.dependencies import (
    AuthHandoffStateUseCaseDp,
    EndSessionUseCaseDp,
    GitHubServiceDp,
    OpenSessionUseCaseDp,
    RefreshSessionUseCaseDp,
    UserRepositoryDp,
    client_ip,
    client_user_agent,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.cli_auth import (
    CliExchangeRequest,
    CliExchangeResponse,
    CliLoginStartRequest,
    CliLoginStartResponse,
)

router = APIRouter(prefix='/auth', tags=['OAuth'])


github_sso = GithubSSO(
    client_id=envs.GITHUB_CLIENT_ID,
    client_secret=envs.GITHUB_CLIENT_SECRET,
    redirect_uri=envs.GITHUB_REDIRECT_URI,
    allow_insecure_http=True,
    scope=['user:email'],
)


async def _build_auth_handoff_response(
    request: Request,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
    *,
    user_id: int,
    github_id: int,
):
    handoff_login_id = request.cookies.get(CLI_LOGIN_COOKIE_NAME)
    if not handoff_login_id:
        return None

    login_state = await auth_handoff_state_use_case.get_login(handoff_login_id)
    if login_state is None:
        error_response = PlainTextResponse(
            'CLI login expired',
            status_code=400,
        )
        error_response.delete_cookie(CLI_LOGIN_COOKIE_NAME)
        return error_response

    handoff_response = RedirectResponse(envs.LOGIN_REDIRECT_URI)
    handoff_response.delete_cookie(CLI_LOGIN_COOKIE_NAME)

    if login_state.get('flow') == PKCE_FLOW:
        # KODI-057: the code is bound to the challenge and the redirect_uri
        # it goes back to; ``oob`` shows it on the web to paste (R-018).
        # The login is spent here, the code on POST /auth/token.
        await auth_handoff_state_use_case.delete_login(handoff_login_id)
        callback_url = login_state['callback_url']
        code = await auth_handoff_state_use_case.create_exchange_code(
            login_id=handoff_login_id,
            user_id=user_id,
            github_id=github_id,
            flow=PKCE_FLOW,
            code_challenge=login_state.get('code_challenge'),
            redirect_uri=callback_url,
        )
        target = (
            envs.CLI_MANUAL_REDIRECT_URI
            if callback_url == OOB_REDIRECT_URI
            else callback_url
        )
        handoff_response.headers['location'] = build_callback_redirect_url(
            target, code=code, state=login_state['state']
        )
        return handoff_response

    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=handoff_login_id,
        user_id=user_id,
        github_id=github_id,
    )

    handoff_response.headers['location'] = build_callback_redirect_url(
        login_state['callback_url'],
        code=code,
        state=login_state['state'],
    )

    return handoff_response


def set_session_cookies(tokens: SessionTokensDTO, response: Response) -> None:
    """``__access`` (the JWT, with ``sid``) and ``__refresh`` (the uuid7,
    full Max-Age)."""
    set_access_cookie(str(tokens.github_id), str(tokens.session_id), response)
    set_refresh_cookie(
        tokens.refresh_token, tokens.refresh_expires_in, response
    )


async def redirect_to_github_for_cli(login_id: str, ttl_seconds: int):
    """Redirect into GitHub OAuth with the ``__cli_login`` marker, so the
    callback hands the sign-in back to the CLI."""
    async with github_sso:
        response = await github_sso.get_login_redirect()

    response.set_cookie(
        key=CLI_LOGIN_COOKIE_NAME,
        value=login_id,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=ttl_seconds,
    )
    return response


@router.get('/github/login')
async def auth_init():
    """Initialize auth and redirect"""
    async with github_sso:
        return await github_sso.get_login_redirect()


@router.post(
    '/cli/start',
    response_model=CliLoginStartResponse,
    status_code=status.HTTP_201_CREATED,
    deprecated=True,
)
async def cli_start(
    payload: CliLoginStartRequest,
    request: Request,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
):
    """Start the CLI auth handoff and return the browser entry URL."""
    callback_url = validate_cli_callback_url(payload.callback_url)
    login_id = await auth_handoff_state_use_case.create_login(
        callback_url=callback_url,
        state=payload.state,
    )
    login_url = str(request.url_for('cli_login', login_id=login_id))
    return CliLoginStartResponse(
        login_id=login_id,
        login_url=login_url,
    )


@router.get('/cli/login/{login_id}', deprecated=True)
async def cli_login(
    login_id: str,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
):
    """Mark the OAuth flow as a CLI login before redirecting to GitHub."""
    login_state = await auth_handoff_state_use_case.get_login(login_id)
    if login_state is None:
        raise HTTPException(status_code=404, detail='CLI login not found')

    return await redirect_to_github_for_cli(
        login_id, auth_handoff_state_use_case.login_ttl_seconds
    )


@router.get('/github/callback')
async def auth_callback(
    request: Request,
    user_repo: UserRepositoryDp,
    gh_service: GitHubServiceDp,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
    open_session: OpenSessionUseCaseDp,
    end_session: EndSessionUseCaseDp,
):
    """Verify login, store encrypted GitHub token, issue tokens."""
    async with github_sso:
        user = await github_sso.verify_and_process(request)
        if not user:
            raise HTTPException(status_code=401, detail='Authentication failed')
        # ``verify_and_process`` is typed to allow a raw dict when called
        # with ``return_response=False`` (not how it is called here) - the
        # default call always returns an ``OpenID`` instance.
        assert isinstance(user, OpenID)

        github_token = github_sso.oauth_client.token.get('access_token')

    use_case = UserRegistrationUseCase(user_repo)
    user_data = await use_case.execute(
        user,
        github_token=github_token,
    )

    # Invalidate any stale cache for this user
    await gh_service.invalidate_cache(user_data.id)

    handoff_response = await _build_auth_handoff_response(
        request,
        auth_handoff_state_use_case,
        user_id=user_data.id,
        github_id=user_data.github_id,
    )

    if handoff_response is not None:
        return handoff_response

    # Web branch only (plan correction 13): signing in again in the same
    # browser ends that browser's earlier session as ``replaced``. The CLI
    # branches above never end the browser's own session.
    await end_session.end_by_refresh(
        request.cookies.get(REFRESH_COOKIE_NAME),
        'replaced',
        user_id=user_data.id,
    )
    tokens = await open_session.execute(
        user_id=user_data.id,
        github_id=user_data.github_id,
        client_type='web',
        sign_in_method='github_web',
        user_agent=client_user_agent(request),
        ip=client_ip(request),
    )

    response = RedirectResponse(envs.LOGIN_REDIRECT_URI)
    set_session_cookies(tokens, response)
    return response


@router.post(
    '/cli/exchange', response_model=CliExchangeResponse, deprecated=True
)
async def cli_exchange(
    payload: CliExchangeRequest,
    request: Request,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
    open_session: OpenSessionUseCaseDp,
):
    """Redeem the short-lived auth handoff code for a session of its own
    (``cli_legacy``, KODI-057). Same JSON shape as before: the access value
    is now a JWT with ``sid`` and the refresh value a uuid7."""
    code_state = await auth_handoff_state_use_case.pop_exchange_code(
        payload.code
    )

    # A PKCE code is redeemed only on POST /auth/token, with its verifier.
    if code_state is None or code_state.get('flow') is not None:
        raise HTTPException(
            status_code=401,
            detail='Invalid or expired CLI exchange code',
        )

    tokens = await open_session.execute(
        user_id=int(code_state['user_id']),
        github_id=int(code_state['github_id']),
        client_type='cli',
        sign_in_method='cli_legacy',
        user_agent=client_user_agent(request),
        ip=client_ip(request),
    )

    await auth_handoff_state_use_case.delete_login(code_state['login_id'])

    return CliExchangeResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        access_expires_in=tokens.access_expires_in,
        refresh_expires_in=tokens.refresh_expires_in,
    )


@router.get(
    '/refresh',
    response_model=DetailSchema,
    responses={
        '401': {'model': DetailSchema},
        '503': {'model': DetailSchema},
    },
)
async def refresh_token(
    request: Request,
    response: Response,
    use_case: RefreshSessionUseCaseDp,
):
    """Resolve the ``__refresh`` session, re-check the GitHub token, slide
    the session 7 days ahead and re-set both cookies (``__refresh`` keeps
    its value, with the full Max-Age). 401 clears both cookies; a 503
    (session service down) clears nothing."""
    try:
        tokens = await use_case.execute(
            request.cookies.get(REFRESH_COOKIE_NAME)
        )
    except InvalidSession as err:
        refused = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content={'detail': err.message},
        )
        clear_access_cookie(refused)
        clear_refresh_cookie(refused)
        return refused

    set_session_cookies(tokens, response)
    return DetailSchema(detail='Token refreshed')


@router.get('/logout', response_model=DetailSchema)
async def logout(
    request: Request,
    response: Response,
    end_session: EndSessionUseCaseDp,
):
    """End this browser's (or installed CLI's) session as ``logout`` and
    clear both cookies."""
    await end_session.end_by_refresh(
        request.cookies.get(REFRESH_COOKIE_NAME), 'logout'
    )

    clear_access_cookie(response)
    clear_refresh_cookie(response)
    return DetailSchema(detail='Logged out')
