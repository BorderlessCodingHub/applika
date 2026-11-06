from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from app.core.error_codes import ErrorCode
from app.core.exceptions import InvalidRequest

CLI_LOGIN_COOKIE_NAME = '__cli_login'
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
