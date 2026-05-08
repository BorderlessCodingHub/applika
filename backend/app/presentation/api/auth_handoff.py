from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from fastapi import HTTPException, status

CLI_LOGIN_COOKIE_NAME = '__cli_login'
_ALLOWED_LOOPBACK_HOSTS = {'127.0.0.1', 'localhost', '::1'}


def validate_cli_callback_url(callback_url: str) -> str:
    parsed = urlparse(callback_url)

    if parsed.scheme != 'http':
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='CLI callback URL must use http',
        )
    if parsed.hostname not in _ALLOWED_LOOPBACK_HOSTS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='CLI callback URL must target loopback',
        )
    if parsed.port is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='CLI callback URL must include a port',
        )
    if parsed.params or parsed.fragment:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail='CLI callback URL must not contain params or fragments',
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
