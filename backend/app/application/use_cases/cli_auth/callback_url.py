"""Where a CLI browser sign-in may hand its code back (ADR-0019, ADR-0026
§3): the CLI's own loopback callback, or, for a PKCE ``oob`` login, the
web page that shows the code to paste (``CLI_MANUAL_REDIRECT_URI``).

``validate_cli_callback_url`` is the check ``/auth/cli/start`` and
``/auth/cli/authorize`` run on the URL a CLI sends; ``cli_handoff_target``
is the one hand-off a stored CLI login allows, re-checked the same way.
"""

from collections.abc import Mapping
from urllib.parse import urlparse

from app.application.use_cases.cli_auth.authorize import (
    OOB_REDIRECT_URI,
    PKCE_FLOW,
)
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


def cli_handoff_target(login: Mapping[str, object]) -> str | None:
    """The one place a stored CLI login hands its code back to: the PKCE
    ``oob`` login → ``CLI_MANUAL_REDIRECT_URI``; otherwise its callback URL,
    only while it still passes the loopback rules. ``None``: nowhere."""
    callback_url = login.get('callback_url')
    if not isinstance(callback_url, str):
        return None
    if login.get('flow') == PKCE_FLOW and callback_url == OOB_REDIRECT_URI:
        return envs.CLI_MANUAL_REDIRECT_URI
    try:
        return validate_cli_callback_url(callback_url)
    except InvalidRequest, ValueError:
        # ValueError: ``urlparse`` on a malformed port or IPv6 host.
        return None
