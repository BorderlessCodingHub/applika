from types import SimpleNamespace
from unittest.mock import AsyncMock
from urllib.parse import parse_qs, urlparse

from cryptography.fernet import Fernet
from fastapi import Response
from starlette.requests import Request

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
        return SimpleNamespace(
            id='123',
            display_name='cli-user',
            email='cli@example.com',
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
        is_org_member=False,
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


async def test_auth_callback_keeps_web_behavior(monkeypatch):
    monkeypatch.setattr(
        envs,
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(oauth_api, 'github_sso', FakeGithubSSO())

    create_refresh_token = AsyncMock(
        side_effect=lambda user_id, redis_client, response: response.set_cookie(
            '__refresh',
            'refresh-token',
        )
    )
    monkeypatch.setattr(
        oauth_api,
        'create_refresh_token',
        create_refresh_token,
    )

    user_repo = _make_user_repo()
    gh_service = AsyncMock()
    auth_handoff_state_use_case = AsyncMock()
    redis_client = object()

    response = await oauth_api.auth_callback(
        _make_request('/auth/github/callback'),
        Response(),
        user_repo,
        gh_service,
        redis_client,
        auth_handoff_state_use_case,
    )

    assert response.status_code in {302, 307}
    assert response.headers['location'] == envs.LOGIN_REDIRECT_URI
    cookies = response.headers.getlist('set-cookie')
    assert any('__access=' in cookie for cookie in cookies)
    assert any('__refresh=' in cookie for cookie in cookies)
    gh_service.invalidate_cache.assert_awaited_once_with(1)
    create_refresh_token.assert_awaited_once()


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

    response = await oauth_api.auth_callback(
        _make_request(
            '/auth/github/callback',
            cookies={CLI_LOGIN_COOKIE_NAME: 'login-123'},
        ),
        Response(),
        user_repo,
        gh_service,
        object(),
        auth_handoff_state_use_case,
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
