"""The browser hops of a sign-in: the code handed back to the CLI
(ADR-0019; the allowed targets are ``use_cases/cli_auth/callback_url.py``)
and the applika attempt cookie and redirects (ADR-0026 §3)."""

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import Response, status
from fastapi.responses import RedirectResponse

from app.config.settings import envs
from app.core.error_codes import ErrorCode


def build_callback_redirect_url(
    callback_url: str,
    code: str,
    state: str,
) -> str:
    parsed = urlparse(callback_url)
    query = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query['code'] = code
    query['state'] = state

    return urlunparse(parsed._replace(query=urlencode(query)))


LOGIN_COOKIE_NAME = '__applika_login'


def login_cookie_path() -> str:
    return f'{envs.API_PREFIX}/auth/borderless'


def signin_redirect(
    code: ErrorCode | None = None, *, cli: bool = False
) -> RedirectResponse:
    """307 to the web sign-in page, with ``?error=<code>`` (and ``cli=1``)
    on a refusal."""
    query: dict[str, str] = {}
    if code is not None:
        query['error'] = code.value
        if cli:
            query['cli'] = '1'
    url = envs.WEB_SIGNIN_URI
    if query:
        url = f'{url}{"&" if "?" in url else "?"}{urlencode(query)}'
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
