"""The browser half of a CLI sign-in (ADR-0024): every CLI browser entry
307s to applika's Borderless sign-in page with the ``__cli_login`` marker,
and the Borderless sign-in hands the result back to the CLI with no cookie
and without touching the browser's own session."""

import json
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

from starlette.requests import Request

from app.application.dto.user_session import SessionTokensDTO
from app.application.use_cases.borderless.sign_in import SignInResult
from app.config.settings import envs
from app.presentation.api import borderless_auth
from app.presentation.api import oauth as oauth_api
from app.presentation.api.auth_handoff import CLI_LOGIN_COOKIE_NAME
from app.presentation.schemas.borderless_auth import BorderlessCredentials

CREDENTIALS = BorderlessCredentials(email='a@b.co', password='pw')


def _make_request(path: str, cookies: dict[str, str] | None = None) -> Request:
    headers = []
    if cookies:
        cookie_header = '; '.join(
            f'{name}={value}' for name, value in cookies.items()
        )
        headers.append((b'cookie', cookie_header.encode()))
    return Request({
        'type': 'http',
        'http_version': '1.1',
        'method': 'POST',
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode(),
        'query_string': b'',
        'headers': headers,
        'client': ('testclient', 123),
        'server': ('testserver', 80),
    })


def _sign_in(user_id: int = 1, new_account: bool = False) -> AsyncMock:
    use_case = AsyncMock()
    use_case.execute.return_value = SignInResult(user_id, new_account)
    return use_case


def _tokens() -> SessionTokensDTO:
    return SessionTokensDTO(
        session_id=77,
        user_id=1,
        access_token='access-jwt',
        access_expires_in=900,
        refresh_token='0192f0e1-0000-7000-8000-000000000000',
        refresh_expires_in=604800,
    )


async def test_cli_login_redirects_to_the_signin_page_with_the_marker():
    handoff = AsyncMock()
    handoff.get_login.return_value = {'login_id': 'login-123'}
    handoff.login_ttl_seconds = 300

    response = await oauth_api.cli_login('login-123', handoff)

    assert response.status_code == 307
    assert response.headers['location'] == f'{envs.WEB_SIGNIN_URI}?cli=1'
    cookie = response.headers.get('set-cookie', '')
    assert f'{CLI_LOGIN_COOKIE_NAME}=login-123' in cookie
    assert 'Max-Age=300' in cookie


async def test_github_login_redirects_to_the_signin_page():
    response = await oauth_api.auth_init()
    assert response.status_code == 307
    assert response.headers['location'] == envs.WEB_SIGNIN_URI


async def test_web_sign_in_opens_a_borderless_session_and_sets_cookies():
    open_session = AsyncMock()
    open_session.execute.return_value = _tokens()
    end_session = AsyncMock()

    response = await borderless_auth.borderless_sign_in(
        CREDENTIALS,
        _make_request('/auth/borderless/signin', {'__refresh': 'old'}),
        _sign_in(new_account=True),
        AsyncMock(),
        open_session,
        end_session,
    )

    assert response.status_code == 200
    assert json.loads(bytes(response.body)) == {
        'redirect_to': None,
        'new_account': True,
    }
    cookies = response.headers.getlist('set-cookie')
    assert any('__access=' in c for c in cookies)
    assert any(
        '__refresh=0192f0e1-0000-7000-8000-000000000000' in c
        and 'Max-Age=604800' in c
        for c in cookies
    )
    end_session.end_by_refresh.assert_awaited_once_with(
        'old', 'replaced', user_id=1
    )
    kwargs = open_session.execute.await_args.kwargs
    assert (kwargs['client_type'], kwargs['sign_in_method']) == (
        'web',
        'borderless',
    )


async def test_cli_sign_in_answers_the_loopback_url_with_no_cookie():
    handoff = AsyncMock()
    handoff.get_login.return_value = {
        'login_id': 'login-123',
        'callback_url': 'http://127.0.0.1:43129/callback',
        'state': 'xyz',
    }
    handoff.create_exchange_code.return_value = 'exchange-code'
    open_session = AsyncMock()
    end_session = AsyncMock()

    response = await borderless_auth.borderless_sign_in(
        CREDENTIALS,
        _make_request(
            '/auth/borderless/signin',
            {CLI_LOGIN_COOKIE_NAME: 'login-123', '__refresh': 'browser'},
        ),
        _sign_in(),
        handoff,
        open_session,
        end_session,
    )

    body = json.loads(bytes(response.body))
    parsed = urlparse(body['redirect_to'])
    assert parsed.netloc == '127.0.0.1:43129'
    assert parse_qs(parsed.query) == {
        'code': ['exchange-code'],
        'state': ['xyz'],
    }
    assert body['new_account'] is False
    handoff.create_exchange_code.assert_awaited_once_with(
        login_id='login-123', user_id=1
    )
    end_session.end_by_refresh.assert_not_awaited()
    open_session.execute.assert_not_awaited()
    set_cookie = response.headers.get('set-cookie', '')
    assert '__access=' not in set_cookie
    assert f'{CLI_LOGIN_COOKIE_NAME}=""' in set_cookie


async def test_cli_pkce_oob_goes_to_the_manual_page(monkeypatch):
    monkeypatch.setattr(
        envs, 'CLI_MANUAL_REDIRECT_URI', 'https://web.example/cli/code'
    )
    handoff = AsyncMock()
    handoff.get_login.return_value = {
        'login_id': 'login-9',
        'callback_url': 'oob',
        'state': 's1',
        'flow': 'pkce',
        'code_challenge': 'c' * 43,
    }
    handoff.create_exchange_code.return_value = 'pk-code'

    url = await oauth_api.cli_handoff_redirect('login-9', handoff, user_id=1)

    parsed = urlparse(url or '')
    assert f'{parsed.scheme}://{parsed.netloc}{parsed.path}' == (
        'https://web.example/cli/code'
    )
    assert parse_qs(parsed.query) == {'code': ['pk-code'], 'state': ['s1']}
    handoff.create_exchange_code.assert_awaited_once_with(
        login_id='login-9',
        user_id=1,
        flow='pkce',
        code_challenge='c' * 43,
        redirect_uri='oob',
    )
    handoff.delete_login.assert_awaited_once_with('login-9')


async def test_expired_cli_login_is_400_and_clears_the_marker():
    handoff = AsyncMock()
    handoff.get_login.return_value = None

    response = await borderless_auth.borderless_sign_in(
        CREDENTIALS,
        _make_request(
            '/auth/borderless/signin', {CLI_LOGIN_COOKIE_NAME: 'gone'}
        ),
        _sign_in(),
        handoff,
        AsyncMock(),
        AsyncMock(),
    )

    assert response.status_code == 400
    assert json.loads(bytes(response.body)) == {'detail': 'CLI login expired'}
    assert CLI_LOGIN_COOKIE_NAME in response.headers.get('set-cookie', '')
