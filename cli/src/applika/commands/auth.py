import secrets
import webbrowser

import httpx
import typer

from applika.config import AppConfig
from applika.lib.api import (
    ApiClient,
    create_session_from_exchange,
    require_session,
)
from applika.lib.loopback import LoopbackLoginServer


def login(ctx: typer.Context) -> None:
    """Log in to Applika via GitHub OAuth. Opens your browser to authenticate."""
    config: AppConfig = ctx.obj
    state = secrets.token_urlsafe(24)
    server = LoopbackLoginServer(expected_state=state)
    server.start()

    try:
        response = httpx.post(
            f'{config.api_base_url}/auth/cli/start',
            json={
                'callback_url': server.callback_url,
                'state': state,
            },
            timeout=30,
        )
        response.raise_for_status()

        data = response.json()
        login_url = data['login_url']
        browser_opened = webbrowser.open(login_url)
        if not browser_opened:
            typer.echo(f'Open this URL to continue login:\n{login_url}')

        code = server.wait_for_code(timeout_seconds=300)
        exchange = httpx.post(
            f'{config.api_base_url}/auth/cli/exchange',
            json={'code': code},
            timeout=30,
        )
        exchange.raise_for_status()

        session = create_session_from_exchange(
            config.api_base_url,
            exchange.json(),
        )
        config.store.save(session)
        typer.echo('Login successful.')
    except (RuntimeError, httpx.HTTPError) as exc:
        typer.echo(str(exc), err=True)
        raise typer.Exit(1)
    finally:
        server.close()


def logout(ctx: typer.Context) -> None:
    """Log out and clear the local session."""
    config: AppConfig = ctx.obj
    session = require_session(config.store)
    client = ApiClient(session, config.store)

    try:
        client.logout()
    finally:
        client.close()

    typer.echo('Logged out.')


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
