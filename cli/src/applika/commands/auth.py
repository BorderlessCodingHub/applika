import contextlib
import os
import secrets
import socket
import sys
import webbrowser
from collections.abc import Iterator
from typing import Annotated, Any
from urllib.parse import urlencode

import httpx
import typer

from applika.config import AppConfig
from applika.lib import device_flow, pkce
from applika.lib.api import (
    ApiClient,
    ApiError,
    AuthError,
    error_detail,
    open_client,
    require_session,
    session_from_token,
)
from applika.lib.loopback import LoopbackLoginServer
from applika.lib.masked_input import prompt_masked

AUTHORIZATION_CODE_GRANT = 'authorization_code'
OOB_REDIRECT_URI = 'oob'
DEVICE_NAME_MAX_LENGTH = 100
DEFAULT_DEVICE_NAME = 'applika-cli'
LOOPBACK_TIMEOUT_SECONDS = 300
MANUAL_PROMPT = 'Paste the code shown in the browser'
DEVICES_HINT = (
    'Run `applika logout` again later, or revoke this device in the web '
    "profile's Devices tab."
)

# Tests swap this for an ``httpx.MockTransport``; ``None`` = the network.
_transport: httpx.BaseTransport | None = None


def login(
    ctx: typer.Context,
    device: Annotated[
        bool,
        typer.Option(
            '--device',
            help='Sign in with a short code approved in any signed-in '
            'browser (for machines without a browser).',
        ),
    ] = False,
    manual: Annotated[
        bool,
        typer.Option(
            '--manual',
            help='Paste the code shown in the browser instead of using a '
            'local callback.',
        ),
    ] = False,
    device_name: Annotated[
        str | None,
        typer.Option(
            '--device-name',
            help='Name this device in your Devices list (default: the host '
            'name; at most 100 characters).',
            show_default=False,
        ),
    ] = None,
) -> None:
    """Log in to Applika with Borderless. By default opens your browser.

    Use --manual to paste the code the browser shows, or --device to approve
    a short code in any signed-in browser.

    The CLI gets a session of its own, listed in your profile's Devices tab.
    """
    if device and manual:
        raise typer.BadParameter(
            '--device and --manual cannot be used together.',
            param_hint="'--device' / '--manual'",
        )
    name = _resolve_device_name(device_name)
    config: AppConfig = ctx.obj
    _end_existing_session(config)

    try:
        with open_client(config.api_base_url, _transport) as client:
            if device:
                tokens = _device_login(client, name)
            elif manual:
                tokens = _manual_login(client, config.api_base_url, name)
            else:
                tokens = _browser_login(client, config.api_base_url, name)
        session = session_from_token(config.api_base_url, tokens)
    except typer.Abort:
        raise
    except (RuntimeError, httpx.HTTPError, KeyError, ValueError) as exc:
        typer.echo(_error_text(exc), err=True)
        raise typer.Exit(1)

    config.store.save(session)
    api = ApiClient(session, config.store, transport=_transport)
    try:
        username = api.get_json('/users/me')['username']
    except AuthError as exc:
        typer.echo(exc.detail, err=True)
        raise typer.Exit(1)
    except (ApiError, httpx.HTTPError, KeyError, ValueError) as exc:
        typer.echo(f'Logged in on {name}.')
        typer.echo(f'Could not read your profile: {_error_text(exc)}', err=True)
        return
    finally:
        api.close()
    typer.echo(f'Logged in as {username} on {name}')


def logout(ctx: typer.Context) -> None:
    """Log out: end this CLI's session on the server, then clear it locally."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store, transport=_transport)

    try:
        status = client.logout()
    except ApiError as exc:
        typer.echo(
            f'The server could not end the session: {exc.detail}\n'
            f'Your local session was kept. {DEVICES_HINT}',
            err=True,
        )
        raise typer.Exit(1)
    finally:
        client.close()

    typer.echo('Logged out.')
    if status != 204:
        typer.echo(
            f'Note: the server answered {status}; the local session was '
            'cleared.',
            err=True,
        )


def _resolve_device_name(given: str | None) -> str:
    if given is not None:
        name = given.strip()
        if not name:
            raise typer.BadParameter(
                'must not be blank.', param_hint="'--device-name'"
            )
        if len(name) > DEVICE_NAME_MAX_LENGTH:
            raise typer.BadParameter(
                f'must be at most {DEVICE_NAME_MAX_LENGTH} characters.',
                param_hint="'--device-name'",
            )
        return name
    host = socket.gethostname().strip()[:DEVICE_NAME_MAX_LENGTH].strip()
    return host or DEFAULT_DEVICE_NAME


def _end_existing_session(config: AppConfig) -> None:
    """Re-login ends the stored session first (owner decision D2). A
    transient failure keeps the old file and warns; login goes on."""
    try:
        existing = config.store.try_load()
    except (OSError, ValueError, TypeError):
        return
    if existing is None:
        return
    client = ApiClient(existing, config.store, transport=_transport)
    try:
        client.logout()
    except ApiError as exc:
        typer.echo(
            f'Warning: the previous session could not be ended on the '
            f'server ({exc.detail}); it may still be listed in the web '
            "profile's Devices tab.",
            err=True,
        )
    finally:
        client.close()


def _authorize_url(
    api_base_url: str, redirect_uri: str, challenge: str, state: str
) -> str:
    query = urlencode({
        'redirect_uri': redirect_uri,
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
        'state': state,
    })
    return f'{api_base_url.rstrip("/")}/auth/cli/authorize?{query}'


def _exchange_code(
    client: httpx.Client,
    code: str,
    verifier: str,
    redirect_uri: str,
    device_name: str,
) -> dict[str, Any]:
    response = client.post(
        '/auth/token',
        json={
            'grant_type': AUTHORIZATION_CODE_GRANT,
            'code': code,
            'code_verifier': verifier,
            'redirect_uri': redirect_uri,
            'device_name': device_name,
        },
    )
    if response.status_code != 200:
        raise ApiError(error_detail(response), response.status_code)
    return response.json()


def _browser_login(
    client: httpx.Client, api_base_url: str, device_name: str
) -> dict[str, Any]:
    verifier = pkce.generate_verifier()
    state = pkce.generate_state()
    server = LoopbackLoginServer(expected_state=state)
    server.start()
    try:
        url = _authorize_url(
            api_base_url,
            server.callback_url,
            pkce.s256_challenge(verifier),
            state,
        )
        typer.echo('Opening your browser to sign in...')
        typer.echo(
            "Browser didn't open? "
            + _link(url, 'Click here to sign in', 'Use this URL to sign in:')
        )
        typer.echo(
            "Browser can't reach this machine? Press Ctrl+C and run "
            '`applika login --manual` or `applika login --device`.'
        )
        with _quiet_stderr():
            webbrowser.open(url)
        code = server.wait_for_code(timeout_seconds=LOOPBACK_TIMEOUT_SECONDS)
        return _exchange_code(
            client, code, verifier, server.callback_url, device_name
        )
    finally:
        server.close()


def _link(url: str, label: str, fallback: str) -> str:
    """``label`` as a clickable OSC 8 hyperlink to ``url`` in a terminal.

    Anywhere else (a pipe, CI, an AI agent) the full URL is printed after
    ``fallback`` instead, so it can still be copied or read.
    """
    if sys.stdout.isatty():
        return f'\033]8;;{url}\033\\{label}\033]8;;\033\\'
    return f'{fallback}\n{url}'


@contextlib.contextmanager
def _quiet_stderr() -> Iterator[None]:
    """Silence what a browser launcher prints (``gio: ... Operation not
    supported``) while it starts: the fd is redirected, so a launcher it
    spawns inherits the silence too."""
    try:
        saved = os.dup(2)
    except OSError:
        yield
        return
    try:
        with open(os.devnull, 'w') as devnull:
            os.dup2(devnull.fileno(), 2)
            yield
    finally:
        os.dup2(saved, 2)
        os.close(saved)


def _manual_login(
    client: httpx.Client, api_base_url: str, device_name: str
) -> dict[str, Any]:
    verifier = pkce.generate_verifier()
    state = pkce.generate_state()
    url = _authorize_url(
        api_base_url, OOB_REDIRECT_URI, pkce.s256_challenge(verifier), state
    )
    typer.echo(
        'Sign in from any browser: '
        + _link(url, 'Click here to sign in', 'Open this URL:')
    )
    pasted = prompt_masked(MANUAL_PROMPT).strip()
    code, separator, pasted_state = pasted.partition('#')
    if not separator or not code:
        raise RuntimeError(
            'Expected the value shown in the browser, in the form code#state.'
        )
    if not secrets.compare_digest(pasted_state.encode(), state.encode()):
        raise RuntimeError('Login state mismatch')
    return _exchange_code(client, code, verifier, OOB_REDIRECT_URI, device_name)


def _device_login(client: httpx.Client, device_name: str) -> dict[str, Any]:
    code = device_flow.start(client, device_name)
    typer.echo(f'To sign in, open: {code.verification_uri}')
    typer.echo(f'and enter the code: {code.user_code}')
    typer.echo(f'Or open this link: {code.verification_uri_complete}')
    typer.echo('Waiting for approval in the browser...')
    return device_flow.poll(client, code)


def _error_text(exc: Exception) -> str:
    if isinstance(exc, httpx.TransportError):
        return f'Could not reach the server ({exc}).'
    if isinstance(exc, KeyError):
        return f'Unexpected answer from the server (missing {exc}).'
    return str(exc)


def whoami(ctx: typer.Context) -> None:
    """Show the currently authenticated user."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        user = client.get_json('/users/me')
        name = ' '.join(
            filter(None, [user.get('first_name'), user.get('last_name')])
        )
        parts = [f'username={user["username"]}']
        if name:
            parts.append(f'name={name}')
        if user.get('email'):
            parts.append(f'email={user["email"]}')
        typer.echo('Logged in as: ' + '  '.join(parts))
    finally:
        client.close()
