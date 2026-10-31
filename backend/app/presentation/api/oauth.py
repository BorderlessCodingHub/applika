"""Session routes and the browser half of every sign-in (ADR-0019,
ADR-0024).

Borderless is the only sign-in (``borderless_auth.py``). GitHub serves
only the one-shot data restore: ``/auth/github/callback`` is the restore
callback. Every CLI browser sign-in (``/auth/cli/authorize``, the legacy
``/auth/cli/login/{id}``) lands on applika's Borderless sign-in page with
the ``__cli_login`` marker; the sign-in route hands the result back to the
CLI.
"""

from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse

from app.application.dto.user_session import SessionTokensDTO
from app.application.services.github_service import GitHubOAuthError
from app.application.use_cases.cli_auth.authorize import (
    OOB_REDIRECT_URI,
    PKCE_FLOW,
)
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.application.use_cases.github_restore.complete import RestoreStatus
from app.config.logging import logger
from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    InvalidSession,
    ResourceNotFound,
    SessionServiceUnavailable,
)
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
    AccountLinkStateUseCaseDp,
    AuthHandoffStateUseCaseDp,
    CompleteGithubRestoreUseCaseDp,
    EndSessionUseCaseDp,
    GitHubOAuthServiceDp,
    OpenSessionUseCaseDp,
    RefreshSessionUseCaseDp,
    SessionStoreDp,
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


async def cli_handoff_redirect(
    login_id: str,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
    *,
    user_id: int,
) -> str | None:
    """Where the browser goes to hand a fresh sign-in back to the CLI, or
    ``None`` when the CLI login expired. Opens no session: the CLI redeems
    the code for a session of its own."""
    login_state = await auth_handoff_state_use_case.get_login(login_id)
    if login_state is None:
        return None

    if login_state.get('flow') == PKCE_FLOW:
        # The code is bound to the challenge and the redirect_uri it goes
        # back to; ``oob`` shows it on the web to paste. The login is spent
        # here, the code on POST /auth/token.
        await auth_handoff_state_use_case.delete_login(login_id)
        callback_url = login_state['callback_url']
        code = await auth_handoff_state_use_case.create_exchange_code(
            login_id=login_id,
            user_id=user_id,
            flow=PKCE_FLOW,
            code_challenge=login_state.get('code_challenge'),
            redirect_uri=callback_url,
        )
        target = (
            envs.CLI_MANUAL_REDIRECT_URI
            if callback_url == OOB_REDIRECT_URI
            else callback_url
        )
        return build_callback_redirect_url(
            target, code=code, state=login_state['state']
        )

    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=login_id, user_id=user_id
    )
    return build_callback_redirect_url(
        login_state['callback_url'], code=code, state=login_state['state']
    )


def set_session_cookies(tokens: SessionTokensDTO, response: Response) -> None:
    """``__access`` (the JWT, ``sub`` = ``users.id``, with ``sid``) and
    ``__refresh`` (the uuid7, full Max-Age)."""
    set_access_cookie(str(tokens.user_id), str(tokens.session_id), response)
    set_refresh_cookie(
        tokens.refresh_token, tokens.refresh_expires_in, response
    )


def redirect_to_signin_for_cli(
    login_id: str, ttl_seconds: int
) -> RedirectResponse:
    """307 to applika's Borderless sign-in page with the ``__cli_login``
    marker, so the sign-in hands the result back to the CLI."""
    response = RedirectResponse(
        f'{envs.WEB_SIGNIN_URI}?cli=1',
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )
    response.set_cookie(
        key=CLI_LOGIN_COOKIE_NAME,
        value=login_id,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=ttl_seconds,
    )
    return response


@router.get('/github/login', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def auth_init():
    """GitHub sign-in is gone (ADR-0024): 307 to the Borderless sign-in
    page."""
    return RedirectResponse(
        envs.WEB_SIGNIN_URI, status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )


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


@router.get(
    '/cli/login/{login_id}',
    deprecated=True,
    status_code=status.HTTP_307_TEMPORARY_REDIRECT,
)
async def cli_login(
    login_id: str,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
):
    """Mark the sign-in as a CLI login, then 307 to the Borderless sign-in
    page."""
    login_state = await auth_handoff_state_use_case.get_login(login_id)
    if login_state is None:
        raise ResourceNotFound(
            'CLI login not found', ErrorCode.AUTH_CLI_LOGIN_NOT_FOUND
        )

    return redirect_to_signin_for_cli(
        login_id, auth_handoff_state_use_case.login_ttl_seconds
    )


def _restore_redirect(outcome: RestoreStatus | str) -> RedirectResponse:
    query = urlencode({'account': 'github', 'status': outcome})
    return RedirectResponse(
        f'{envs.ACCOUNT_LINK_REDIRECT_URI}?{query}',
        status_code=status.HTTP_307_TEMPORARY_REDIRECT,
    )


def _restore_failed(reason: str) -> RedirectResponse:
    logger.info(
        f'GitHub restore callback failed: {reason}',
        extra={
            'extra_data': {'event': 'github_restore_failed', 'reason': reason}
        },
    )
    return _restore_redirect('error')


@router.get('/github/callback', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def github_restore_callback(
    request: Request,
    user_repo: UserRepositoryDp,
    session_store: SessionStoreDp,
    github: GitHubOAuthServiceDp,
    state_use_case: AccountLinkStateUseCaseDp,
    complete: CompleteGithubRestoreUseCaseDp,
    open_session: OpenSessionUseCaseDp,
):
    """The GitHub restore callback (ADR-0024). Always a 307 to
    ``ACCOUNT_LINK_REDIRECT_URI?account=github&status=<outcome>``.

    Order: consume the nonce (a replay never matches again), resolve the
    caller's own session, require both to name the same user, exchange the
    code, read the identity once, revoke the grant, then complete. No
    GitHub token is stored. ``restored`` signs the browser in as the old
    account.
    """
    nonce = request.query_params.get('state')
    nonce_user_id = await state_use_case.consume(nonce) if nonce else None
    if nonce_user_id is None:
        return _restore_failed('state')
    code = request.query_params.get('code')
    if request.query_params.get('error') or not code:
        return _restore_failed('consent')

    try:
        authenticated = await GetCurrentUserUseCase(
            user_repo, session_store
        ).execute(request.cookies.get(ACCESS_COOKIE_NAME), client_ip(request))
    except InvalidSession, SessionServiceUnavailable:
        return _restore_failed('session')
    if authenticated.user.id != nonce_user_id:
        return _restore_failed('session_mismatch')
    if not github.is_configured():
        return _restore_failed('not_configured')

    try:
        grant = await github.exchange_code(code)
    except GitHubOAuthError:
        return _restore_failed('exchange')
    try:
        identity = await github.fetch_identity(grant.access_token)
    except GitHubOAuthError:
        await github.revoke(grant.access_token)
        return _restore_failed('identity')
    await github.revoke(grant.access_token)

    result = await complete.execute(nonce_user_id, identity.id)
    response = _restore_redirect(result.status)
    if result.status == 'restored' and result.user_id is not None:
        tokens = await open_session.execute(
            user_id=result.user_id,
            client_type='web',
            sign_in_method='borderless',
            user_agent=client_user_agent(request),
            ip=client_ip(request),
        )
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
        raise InvalidSession(
            'Invalid or expired CLI exchange code',
            ErrorCode.AUTH_CLI_EXCHANGE_INVALID,
        )

    tokens = await open_session.execute(
        user_id=int(code_state['user_id']),
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
    """Resolve the ``__refresh`` session, read the Borderless membership
    (never fails the refresh), slide the session 7 days ahead and re-set both cookies (``__refresh`` keeps
    its value, with the full Max-Age). 401 clears both cookies; a 503
    (session service down) clears nothing."""
    try:
        tokens = await use_case.execute(
            request.cookies.get(REFRESH_COOKIE_NAME)
        )
    except InvalidSession as err:
        refused = JSONResponse(
            status_code=status.HTTP_401_UNAUTHORIZED,
            content=err.body(),
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
