from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import PlainTextResponse, RedirectResponse
from fastapi_sso.sso.github import GithubSSO

from app.application.use_cases.refresh_token import (
    RefreshTokenUseCase,
)
from app.application.use_cases.user_registration import (
    UserRegistrationUseCase,
)
from app.config.settings import REFRESH_COOKIE_NAME, envs
from app.core.tokens import (
    clear_access_cookie,
    clear_refresh_cookie,
    create_access_token,
    create_refresh_token,
    create_refresh_token_value,
    revoke_refresh_token,
    set_access_cookie,
)
from app.presentation.api.auth_handoff import (
    CLI_LOGIN_COOKIE_NAME,
    build_callback_redirect_url,
    validate_cli_callback_url,
)
from app.presentation.dependencies import (
    AuthHandoffStateUseCaseDp,
    GitHubServiceDp,
    RedisDp,
    UserRepositoryDp,
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
    scope=['user:email', 'read:org'],
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


@router.get('/github/login')
async def auth_init():
    """Initialize auth and redirect"""
    async with github_sso:
        return await github_sso.get_login_redirect()


@router.post(
    '/cli/start',
    response_model=CliLoginStartResponse,
    status_code=status.HTTP_201_CREATED,
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


@router.get('/cli/login/{login_id}')
async def cli_login(
    login_id: str,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
):
    """Mark the OAuth flow as a CLI login before redirecting to GitHub."""
    login_state = await auth_handoff_state_use_case.get_login(login_id)
    if login_state is None:
        raise HTTPException(status_code=404, detail='CLI login not found')

    async with github_sso:
        response = await github_sso.get_login_redirect()

    response.set_cookie(
        key=CLI_LOGIN_COOKIE_NAME,
        value=login_id,
        httponly=True,
        secure=envs.ENVIRONMENT == 'PROD',
        samesite='lax',
        max_age=auth_handoff_state_use_case.login_ttl_seconds,
    )

    return response


@router.get('/github/callback')
async def auth_callback(
    request: Request,
    response: Response,
    user_repo: UserRepositoryDp,
    gh_service: GitHubServiceDp,
    redis_client: RedisDp,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
):
    """Verify login, store encrypted GitHub token, issue tokens."""
    async with github_sso:
        user = await github_sso.verify_and_process(request)
        if not user:
            raise HTTPException(status_code=401, detail='Authentication failed')
        github_token = github_sso.oauth_client.token.get('access_token')

    # Check org membership with the fresh GitHub token
    is_org_member = False
    if github_token and envs.DISCORD_REPORTS_ORGANIZATION:
        is_org_member = await gh_service.check_org_membership(github_token)

    use_case = UserRegistrationUseCase(user_repo)
    user_data = await use_case.execute(
        user,
        github_token=github_token,
        is_org_member=is_org_member,
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

    response = RedirectResponse(envs.LOGIN_REDIRECT_URI)
    set_access_cookie(str(user_data.github_id), response)
    await create_refresh_token(user_data.id, redis_client, response)

    return response


@router.post('/cli/exchange', response_model=CliExchangeResponse)
async def cli_exchange(
    payload: CliExchangeRequest,
    redis_client: RedisDp,
    auth_handoff_state_use_case: AuthHandoffStateUseCaseDp,
):
    """Redeem the short-lived auth handoff code for the normal session."""
    code_state = await auth_handoff_state_use_case.pop_exchange_code(
        payload.code
    )
    if code_state is None:
        raise HTTPException(
            status_code=401,
            detail='Invalid or expired CLI exchange code',
        )

    access_token, _, access_expires_in = create_access_token(
        str(code_state['github_id'])
    )
    refresh_token, refresh_expires_in = await create_refresh_token_value(
        code_state['user_id'],
        redis_client,
    )
    await auth_handoff_state_use_case.delete_login(code_state['login_id'])

    return CliExchangeResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        access_expires_in=access_expires_in,
        refresh_expires_in=refresh_expires_in,
    )


@router.get(
    '/refresh',
    response_model=DetailSchema,
    responses={'401': {'model': DetailSchema}},
)
async def refresh_token(
    request: Request,
    response: Response,
    user_repo: UserRepositoryDp,
    gh_service: GitHubServiceDp,
    redis_client: RedisDp,
):
    """Validate refresh token, verify GitHub token, re-issue access."""
    refresh_id = request.cookies.get(REFRESH_COOKIE_NAME)
    use_case = RefreshTokenUseCase(user_repo, gh_service, redis_client)
    await use_case.execute(refresh_id, response)
    return DetailSchema(detail='Token refreshed')


@router.get('/logout', response_model=DetailSchema)
async def logout(
    request: Request,
    response: Response,
    redis_client: RedisDp,
):
    refresh_id = request.cookies.get(REFRESH_COOKIE_NAME)
    if refresh_id:
        await revoke_refresh_token(refresh_id, redis_client)

    clear_access_cookie(response)
    clear_refresh_cookie(response)
    return DetailSchema(detail='Logged out')
