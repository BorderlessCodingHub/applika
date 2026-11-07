"""The browser hops of a sign-in: the CLI's loopback callback (ADR-0019)
and the Borderless attempt cookie and redirects (ADR-0026)."""

from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import Response, status
from fastapi.responses import RedirectResponse

from app.config.settings import envs
from app.core.error_codes import ErrorCode
from app.core.exceptions import InvalidRequest

_ALLOWED_LOOPBACK_HOSTS = {'127.0.0.1', 'localhost', '::1'}


def validate_cli_callback_url(callback_url: str) -> str:
    parsed = urlparse(callback_url)

    if parsed.scheme != 'http':
        raise InvalidRequest(
            'CLI callback URL must use http',
            ErrorCode.AUTH_CLI_CALLBACK_NOT_HTTP,
        )
    if parsed.hostname not in _ALLOWED_LOOPBACK_HOSTS:
        raise InvalidRequest(
            'CLI callback URL must target loopback',
            ErrorCode.AUTH_CLI_CALLBACK_NOT_LOOPBACK,
        )
    if parsed.port is None:
        raise InvalidRequest(
            'CLI callback URL must include a port',
            ErrorCode.AUTH_CLI_CALLBACK_NO_PORT,
        )
    if parsed.params or parsed.fragment:
        raise InvalidRequest(
            'CLI callback URL must not contain params or fragments',
            ErrorCode.AUTH_CLI_CALLBACK_HAS_PARAMS,
        )

    return callback_url


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


LOGIN_COOKIE_NAME = '__borderless_login'


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
