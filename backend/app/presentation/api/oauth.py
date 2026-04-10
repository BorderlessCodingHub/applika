from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi_sso.sso.github import GithubSSO

from app.application.use_cases.user_registration import (
    UserRegistrationUseCase,
)
from app.config.settings import REFRESH_COOKIE_NAME, envs
from app.core.crypto import decrypt_token
from app.core.tokens import (
    clear_access_cookie,
    clear_refresh_cookie,
    create_refresh_token,
    revoke_refresh_token,
    set_access_cookie,
    validate_refresh_token,
)
from app.presentation.dependencies import (
    GitHubServiceDp,
    RedisDp,
    UserRepositoryDp,
)
from app.presentation.schemas import DetailSchema

router = APIRouter(prefix='/auth', tags=['OAuth'])


github_sso = GithubSSO(
    client_id=envs.GITHUB_CLIENT_ID,
    client_secret=envs.GITHUB_CLIENT_SECRET,
    redirect_uri=envs.GITHUB_REDIRECT_URI,
    allow_insecure_http=True,
    scope=['user:email', 'read:org'],
)


@router.get('/github/login')
async def auth_init():
    """Initialize auth and redirect"""
    async with github_sso:
        return await github_sso.get_login_redirect()


@router.get('/github/callback')
async def auth_callback(
    request: Request,
    response: Response,
    user_repo: UserRepositoryDp,
    gh_service: GitHubServiceDp,
    redis_client: RedisDp,
):
    """Verify login, store encrypted GitHub token, issue tokens."""
    async with github_sso:
        user = await github_sso.verify_and_process(request)
        if not user:
            raise HTTPException(
                status_code=401, detail='Authentication failed'
            )
        github_token = github_sso.oauth_client.token.get(
            'access_token'
        )

    # Check org membership with the fresh GitHub token
    is_org_member = False
    if github_token and envs.DISCORD_REPORTS_ORGANIZATION:
        is_org_member = await gh_service.check_org_membership(
            0, github_token  # user_id=0 skips cache on first check
        )

    use_case = UserRegistrationUseCase(user_repo)
    user_data = await use_case.execute(
        user,
        github_token=github_token,
        is_org_member=is_org_member,
    )

    # Invalidate any stale cache for this user
    await gh_service.invalidate_cache(user_data.id)

    response = RedirectResponse(envs.LOGIN_REDIRECT_URI)
    set_access_cookie(str(user_data.github_id), response)
    await create_refresh_token(user_data.id, redis_client, response)

    return response


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
    if not refresh_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Not authenticated',
        )

    user_id = await validate_refresh_token(refresh_id, redis_client)
    if user_id is None:
        clear_access_cookie(response)
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid or expired refresh token',
        )

    user = await user_repo.get_by_id(user_id)
    if not user:
        await revoke_refresh_token(refresh_id, redis_client)
        clear_access_cookie(response)
        clear_refresh_cookie(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='User not found',
        )

    # Validate the stored GitHub token (cached in Redis)
    if user.encrypted_github_token:
        github_token = decrypt_token(user.encrypted_github_token)
        if github_token:
            is_valid = await gh_service.validate_token(
                user.id, github_token
            )
            if not is_valid:
                await revoke_refresh_token(refresh_id, redis_client)
                clear_access_cookie(response)
                clear_refresh_cookie(response)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail='GitHub token revoked',
                )

    set_access_cookie(str(user.github_id), response)
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
