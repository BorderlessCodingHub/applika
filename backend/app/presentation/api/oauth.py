import jwt
from fastapi import APIRouter, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from fastapi_sso.sso.github import GithubSSO

from app.application.use_cases.user_registration import UserRegistrationUseCase
from app.config.settings import REFRESH_COOKIE_NAME, envs
from app.core.tokens import clear_cookies, decode_token, set_cookies
from app.presentation.dependencies import UserRepositoryDp
from app.presentation.schemas import DetailSchema

router = APIRouter(prefix='/auth', tags=['OAuth'])


github_sso = GithubSSO(
    client_id=envs.GITHUB_CLIENT_ID,
    client_secret=envs.GITHUB_CLIENT_SECRET,
    redirect_uri=envs.GITHUB_CALLBACK_URI,
    allow_insecure_http=True,
)


@router.get('/github/login')
async def auth_init():
    """Initialize auth and redirect"""
    async with github_sso:
        return await github_sso.get_login_redirect()


@router.get('/github/callback')
async def auth_callback(
    request: Request, response: Response, user_repo: UserRepositoryDp
):
    """Verify login"""
    async with github_sso:
        user = await github_sso.verify_and_process(request)
        if not user:
            raise HTTPException(
                status_code=401, detail='Authentication failed'
            )

    use_case = UserRegistrationUseCase(user_repo)
    user_data = await use_case.execute(user)

    response = RedirectResponse(envs.LOGIN_REDIRECT_URI)
    set_cookies(str(user_data.github_id), response)

    return response


@router.get('/refresh', response_model=DetailSchema)
def refresh_token(request: Request, response: Response):
    refresh_token = request.cookies.get(REFRESH_COOKIE_NAME)
    if not refresh_token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Not authenticated',
        )

    try:
        payload = decode_token(refresh_token)
        if payload['kind'] != 'refresh':
            raise jwt.InvalidTokenError()
    except jwt.ExpiredSignatureError:
        clear_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Token expired',
        )
    except jwt.InvalidTokenError:
        clear_cookies(response)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Invalid token',
        )

    set_cookies(payload.get('sub'), response)
    return DetailSchema(detail='Token refreshed')


@router.get('/logout', response_model=DetailSchema)
def logout(response: Response):
    clear_cookies(response)
    return DetailSchema(detail='Logged out')
