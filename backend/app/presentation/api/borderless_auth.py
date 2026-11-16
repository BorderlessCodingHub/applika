"""Sign in with Borderless through OpenID Connect (ADR-0026 §2, §3, §11).

- ``GET /auth/borderless/login``: 307 to Borderless's authorize endpoint
  for a web sign-in (no ``prompt``: the Borderless browser session is
  reused), with the ``__applika_login`` cookie that binds the attempt to
  this browser.
- ``GET /auth/borderless/callback``: Borderless's return, always a 307, to
  the target the attempt stored in Redis at its start once it is checked
  again: ``WEB_SIGNIN_URI`` with a new web session; a refusal goes to
  ``WEB_SIGNIN_URI?error=<code>``. The attempt cookie is cleared on every
  answer but AUTH-1046 (no attempt matched: the cookie may be a newer
  attempt's, in another tab).

Applika never sees a Borderless password, and no Borderless token, code or
state reaches a response body, the browser or a log; the request log
redacts the callback's query (``config/middleware.py``). No query value
decides where the browser goes. Not behind a beta gate (ADR-0024 §9).
"""

from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response, status
from fastapi.responses import RedirectResponse

from app.application.use_cases.borderless.complete_login import (
    BorderlessLoginFailed,
)
from app.config.logging import logger
from app.config.settings import REFRESH_COOKIE_NAME, envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import CodedRefusal, ServiceUnavailable
from app.presentation.api.oauth import set_session_cookies
from app.presentation.dependencies import (
    BeginBorderlessLoginUseCaseDp,
    CompleteBorderlessLoginUseCaseDp,
    EndSessionUseCaseDp,
    OpenSessionUseCaseDp,
    client_ip,
    client_user_agent,
)
from app.presentation.no_input_echo import NoInputEchoRoute

router = APIRouter(
    prefix='/auth/borderless',
    tags=['Borderless'],
    route_class=NoInputEchoRoute,
)

LOGIN_COOKIE_NAME = '__applika_login'


def login_cookie_path() -> str:
    return f'{envs.API_PREFIX}/auth/borderless'


def signin_redirect(code: ErrorCode | None = None) -> RedirectResponse:
    """307 to the web sign-in page, with ``?error=<code>`` on a refusal."""
    url = envs.WEB_SIGNIN_URI
    if code is not None:
        query = urlencode({'error': code.value})
        url = f'{url}{"&" if "?" in url else "?"}{query}'
    return RedirectResponse(url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)


def attempt_redirect(authorize_url: str, binding: str) -> RedirectResponse:
    """307 to Borderless with the attempt's browser binding: HttpOnly,
    Secure in PROD, SameSite=Lax (Borderless's top-level GET back carries
    it), scoped to ``/auth/borderless``, ten minutes. A newer attempt in the
    same browser overwrites it."""
    response = RedirectResponse(
        authorize_url, status_code=status.HTTP_307_TEMPORARY_REDIRECT
    )
    response.set_cookie(
        key=LOGIN_COOKIE_NAME,
        value=binding,
        max_age=envs.BORDERLESS_LOGIN_TTL_SECONDS,
        path=login_cookie_path(),
        secure=envs.ENVIRONMENT == 'PROD',
        httponly=True,
        samesite='lax',
    )
    return response


def clear_login_cookie(response: Response) -> None:
    response.delete_cookie(
        LOGIN_COOKIE_NAME,
        path=login_cookie_path(),
        secure=envs.ENVIRONMENT == 'PROD',
        httponly=True,
        samesite='lax',
    )


def _unexpected(where: str, exc: BaseException) -> None:
    # The type only: never the query, a code or a token.
    logger.error(f'Borderless {where} failed ({type(exc).__name__})')


@router.get('/login', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def borderless_login(begin: BeginBorderlessLoginUseCaseDp):
    """Start a web sign-in: 307 to Borderless's authorize endpoint, or to
    the sign-in page with AUTH-1018 (not configured) or AUTH-1017
    (Borderless unavailable)."""
    try:
        authorize_url, binding = await begin.execute()
    except (CodedRefusal, ServiceUnavailable) as exc:
        return signin_redirect(exc.code)
    except Exception as exc:
        _unexpected('sign-in start', exc)
        return signin_redirect(ErrorCode.GEN_INTERNAL_ERROR)
    return attempt_redirect(authorize_url, binding)


@router.get('/callback', status_code=status.HTTP_307_TEMPORARY_REDIRECT)
async def borderless_callback(
    request: Request,
    complete: CompleteBorderlessLoginUseCaseDp,
    open_session: OpenSessionUseCaseDp,
    end_session: EndSessionUseCaseDp,
):
    """Borderless's return (``code``, ``state``, ``iss``, or ``error``).
    This browser's earlier session ends ``replaced``, a ``borderless``
    session opens, both cookies are set."""
    params = {key: value for key, value in request.query_params.items()}
    response: Response
    try:
        outcome = await complete.execute(
            params, request.cookies.get(LOGIN_COOKIE_NAME)
        )
    except BorderlessLoginFailed as failed:
        if failed.unexpected and failed.__cause__ is not None:
            _unexpected('callback', failed.__cause__)
        response = signin_redirect(failed.code)
        # No attempt matched this return: the cookie may belong to a newer
        # attempt in this browser (two tabs), which must still complete.
        if failed.code != ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED:
            clear_login_cookie(response)
        return response

    try:
        if outcome.target != envs.WEB_SIGNIN_URI:
            # The use case checked it already: a web sign-in ends on the
            # web sign-in page and nowhere else.
            response = signin_redirect(ErrorCode.AUTH_BORDERLESS_LOGIN_EXPIRED)
        else:
            await end_session.end_by_refresh(
                request.cookies.get(REFRESH_COOKIE_NAME),
                'replaced',
                user_id=outcome.user_id,
            )
            tokens = await open_session.execute(
                user_id=outcome.user_id,
                client_type='web',
                sign_in_method='borderless',
                user_agent=client_user_agent(request),
                ip=client_ip(request),
            )
            response = RedirectResponse(
                outcome.target, status_code=status.HTTP_307_TEMPORARY_REDIRECT
            )
            set_session_cookies(tokens, response)
    except ServiceUnavailable as exc:
        response = signin_redirect(exc.code)
    except Exception as exc:
        _unexpected('callback', exc)
        response = signin_redirect(ErrorCode.GEN_INTERNAL_ERROR)
    clear_login_cookie(response)
    return response
