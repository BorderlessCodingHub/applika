import argparse
import secrets
import webbrowser

import httpx

from api import ApiClient, create_session_from_exchange
from cli_context import CommandContext, require_session
from loopback import LoopbackLoginServer


def handle_login(args: argparse.Namespace, context: CommandContext) -> int:
    state = secrets.token_urlsafe(24)
    server = LoopbackLoginServer(expected_state=state)
    server.start()

    try:
        response = httpx.post(
            f'{context.api_base_url}/auth/cli/start',
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
            print(f'Open this URL to continue login:\n{login_url}')

        code = server.wait_for_code(timeout_seconds=300)
        exchange = httpx.post(
            f'{context.api_base_url}/auth/cli/exchange',
            json={'code': code},
            timeout=30,
        )
        exchange.raise_for_status()

        session = create_session_from_exchange(
            context.api_base_url,
            exchange.json(),
        )
        context.store.save(session)

        print('Login successful.')
        return 0
    finally:
        server.close()


def handle_logout(args: argparse.Namespace, context: CommandContext) -> int:
    session = require_session(context.store)
    client = ApiClient(session, context.store)

    try:
        client.logout()
    finally:
        client.close()

    print('Logged out.')
    return 0
