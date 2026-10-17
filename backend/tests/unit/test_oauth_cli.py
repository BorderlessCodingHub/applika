from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet
from fastapi_sso import OpenID
from starlette.requests import Request

from app.application.dto.user_session import SessionTokensDTO
from app.config.settings import envs
from app.presentation.api import oauth as oauth_api
from app.presentation.api.auth_handoff import CLI_LOGIN_COOKIE_NAME
from tests.unit.conftest import make_user


class FakeGithubSSO:
    def __init__(self):
        self.oauth_client = SimpleNamespace(
            token={'access_token': 'github-token'}
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get_login_redirect(self):
        from fastapi.responses import RedirectResponse

        return RedirectResponse('https://github.example/login')

    async def verify_and_process(self, request):
        return OpenID(
            id='123',
            display_name='cli-user',
            email='cli@example.com',
            provider='github',
        )


def _make_request(path: str, cookies: dict[str, str] | None = None) -> Request:
    headers = []
    if cookies:
        cookie_header = '; '.join(
            f'{name}={value}' for name, value in cookies.items()
        )
        headers.append((b'cookie', cookie_header.encode()))

    scope = {
        'type': 'http',
        'http_version': '1.1',
        'method': 'GET',
        'scheme': 'http',
        'path': path,
        'raw_path': path.encode(),
        'query_string': b'',
        'headers': headers,
        'client': ('testclient', 123),
        'server': ('testserver', 80),
    }
    return Request(scope)


def _make_user_repo():
    user = make_user(
        id=1,
        github_id=123,
        username='cli-user',
        email='cli@example.com',
        encrypted_github_token=None,
        is_admin=False,
    )
    repo = AsyncMock()
    repo.get_by_github_id.return_value = None
    repo.create.return_value = user
    repo.update.side_effect = lambda updated_user: updated_user
    return repo


async def test_cli_login_sets_marker_cookie(monkeypatch):
    fake_github_sso = FakeGithubSSO()
    monkeypatch.setattr(oauth_api, 'github_sso', fake_github_sso)

    auth_handoff_state_use_case = AsyncMock()
    auth_handoff_state_use_case.get_login.return_value = {
        'login_id': 'login-123',
        'callback_url': 'http://127.0.0.1:43129/callback',
        'state': 'abc',
    }
    auth_handoff_state_use_case.login_ttl_seconds = 300

    response = await oauth_api.cli_login(
        'login-123',
        auth_handoff_state_use_case,
    )

    assert response.status_code in {302, 307}
    assert response.headers['location'] == 'https://github.example/login'
    assert CLI_LOGIN_COOKIE_NAME in response.headers.get('set-cookie', '')


def _tokens() -> SessionTokensDTO:
    return SessionTokensDTO(
        session_id=77,
        github_id=123,
        access_token='access-jwt',
        access_expires_in=900,
        refresh_token='0192f0e1-0000-7000-8000-000000000000',
        refresh_expires_in=604800,
    )


async def test_auth_callback_keeps_web_behavior(monkeypatch):
    """The web branch opens a ``github_web`` session (KODI-057) and sets
    both cookies; a valid same-user ``__refresh`` session ends as
    ``replaced``."""
    monkeypatch.setattr(
        envs,
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(oauth_api, 'github_sso', FakeGithubSSO())

    user_repo = _make_user_repo()
    gh_service = AsyncMock()
    auth_handoff_state_use_case = AsyncMock()
    open_session = AsyncMock()
    open_session.execute.return_value = _tokens()
    end_session = AsyncMock()

    response = await oauth_api.auth_callback(
        _make_request(
            '/auth/github/callback', cookies={'__refresh': 'old-browser'}
        ),
        user_repo,
        gh_service,
        auth_handoff_state_use_case,
        open_session,
        end_session,
    )

    assert response.status_code in {302, 307}
    assert response.headers['location'] == envs.LOGIN_REDIRECT_URI
    cookies = response.headers.getlist('set-cookie')
    assert any('__access=' in cookie for cookie in cookies)
    assert any(
        '__refresh=0192f0e1-0000-7000-8000-000000000000' in cookie
        and 'Max-Age=604800' in cookie
        for cookie in cookies
    )
    gh_service.invalidate_cache.assert_awaited_once_with(1)
    end_session.end_by_refresh.assert_awaited_once_with(
        'old-browser', 'replaced', user_id=1
    )
    kwargs = open_session.execute.await_args.kwargs
    assert kwargs['client_type'] == 'web'
    assert kwargs['sign_in_method'] == 'github_web'
    assert kwargs['ip'] == 'testclient'


async def test_auth_callback_redirects_cli_to_loopback(monkeypatch):
    monkeypatch.setattr(
        envs,
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(oauth_api, 'github_sso', FakeGithubSSO())

    user_repo = _make_user_repo()
    gh_service = AsyncMock()
    auth_handoff_state_use_case = AsyncMock()
    auth_handoff_state_use_case.get_login.return_value = {
        'login_id': 'login-123',
        'callback_url': 'http://127.0.0.1:43129/callback',
        'state': 'xyz',
    }
    auth_handoff_state_use_case.create_exchange_code.return_value = (
        'exchange-code'
    )
    open_session = AsyncMock()
    end_session = AsyncMock()

    response = await oauth_api.auth_callback(
        _make_request(
            '/auth/github/callback',
            cookies={
                CLI_LOGIN_COOKIE_NAME: 'login-123',
                '__refresh': 'the-browser-session',
            },
        ),
        user_repo,
        gh_service,
        auth_handoff_state_use_case,
        open_session,
        end_session,
    )

    assert response.status_code in {302, 307}
    location = response.headers['location']
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert parsed.scheme == 'http'
    assert parsed.netloc == '127.0.0.1:43129'
    assert params['state'] == ['xyz']
    assert params['code'] == ['exchange-code']
    assert CLI_LOGIN_COOKIE_NAME in response.headers.get('set-cookie', '')
    gh_service.invalidate_cache.assert_awaited_once_with(1)
    # Plan correction 13: a CLI sign-in never ends the browser's own
    # session, and opens none at the callback (the exchange does).
    end_session.end_by_refresh.assert_not_awaited()
    open_session.execute.assert_not_awaited()
    assert '__access=' not in response.headers.get('set-cookie', '')


async def test_auth_callback_pkce_oob_goes_to_the_manual_page(monkeypatch):
    monkeypatch.setattr(
        envs,
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(oauth_api, 'github_sso', FakeGithubSSO())
    monkeypatch.setattr(
        envs, 'CLI_MANUAL_REDIRECT_URI', 'https://web.example/cli/code'
    )

    auth_handoff_state_use_case = AsyncMock()
    auth_handoff_state_use_case.get_login.return_value = {
        'login_id': 'login-9',
        'callback_url': 'oob',
        'state': 's1',
        'flow': 'pkce',
        'code_challenge': 'c' * 43,
    }
    auth_handoff_state_use_case.create_exchange_code.return_value = 'pk-code'
    end_session = AsyncMock()

    response = await oauth_api.auth_callback(
        _make_request(
            '/auth/github/callback',
            cookies={CLI_LOGIN_COOKIE_NAME: 'login-9', '__refresh': 'web'},
        ),
        _make_user_repo(),
        AsyncMock(),
        auth_handoff_state_use_case,
        AsyncMock(),
        end_session,
    )

    parsed = urlparse(response.headers['location'])
    assert f'{parsed.scheme}://{parsed.netloc}{parsed.path}' == (
        'https://web.example/cli/code'
    )
    assert parse_qs(parsed.query) == {'code': ['pk-code'], 'state': ['s1']}
    auth_handoff_state_use_case.create_exchange_code.assert_awaited_once_with(
        login_id='login-9',
        user_id=1,
        github_id=123,
        flow='pkce',
        code_challenge='c' * 43,
        redirect_uri='oob',
    )
    auth_handoff_state_use_case.delete_login.assert_awaited_once_with('login-9')
    end_session.end_by_refresh.assert_not_awaited()
