"""``GitHubOAuthService`` against a mocked transport (ADR-0024): the
restore asks for ``read:user`` only, reads the identity once, revokes the
grant best-effort and never logs the token. Nobody calls GitHub."""

import json
import logging
from urllib.parse import parse_qs, urlparse

import httpx
import pytest

from app.application.services.github_service import (
    GitHubIdentity,
    GitHubOAuthError,
    GitHubOAuthService,
)
from app.config.settings import envs

TOKEN = 'gho_secret_token_value'


def _service(handler) -> GitHubOAuthService:
    return GitHubOAuthService(transport=httpx.MockTransport(handler))


def test_authorize_url_asks_for_read_user_only():
    url = GitHubOAuthService().authorize_url('the-state')
    parsed = urlparse(url)
    query = parse_qs(parsed.query)
    assert f'{parsed.scheme}://{parsed.netloc}{parsed.path}' == (
        'https://github.com/login/oauth/authorize'
    )
    assert query['scope'] == ['read:user']
    assert query['state'] == ['the-state']
    assert query['client_id'] == [envs.GITHUB_CLIENT_ID]
    assert query['redirect_uri'] == [envs.GITHUB_REDIRECT_URI]


def test_is_configured_needs_id_and_secret(monkeypatch: pytest.MonkeyPatch):
    assert GitHubOAuthService().is_configured() is True
    monkeypatch.setattr(envs, 'GITHUB_CLIENT_SECRET', None)
    assert GitHubOAuthService().is_configured() is False


async def test_exchange_code_posts_the_code_and_reads_the_token():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen['url'] = str(request.url)
        seen['body'] = parse_qs(request.content.decode())
        return httpx.Response(200, json={'access_token': TOKEN})

    grant = await _service(handler).exchange_code('the-code')

    assert grant.access_token == TOKEN
    assert TOKEN not in repr(grant)
    assert seen['url'] == 'https://github.com/login/oauth/access_token'
    assert seen['body']['code'] == ['the-code']
    assert seen['body']['client_id'] == [envs.GITHUB_CLIENT_ID]


@pytest.mark.parametrize(
    'response',
    [
        httpx.Response(400, json={'access_token': TOKEN}),
        httpx.Response(200, text='not json'),
        httpx.Response(200, json={'error': 'bad_verification_code'}),
        httpx.Response(200, json=['x']),
    ],
)
async def test_exchange_code_failures_raise(response):
    with pytest.raises(GitHubOAuthError):
        await _service(lambda r: response).exchange_code('c')


async def test_exchange_code_network_error_raises():
    def handler(request):
        raise httpx.ConnectError('down', request=request)

    with pytest.raises(GitHubOAuthError):
        await _service(handler).exchange_code('c')


async def test_fetch_identity_reads_id_and_login():
    seen = {}

    def handler(request):
        seen['auth'] = request.headers['Authorization']
        seen['url'] = str(request.url)
        return httpx.Response(200, json={'id': 42, 'login': 'octocat'})

    identity = await _service(handler).fetch_identity(TOKEN)

    assert identity == GitHubIdentity(id=42, login='octocat')
    assert seen == {
        'auth': f'Bearer {TOKEN}',
        'url': 'https://api.github.com/user',
    }


@pytest.mark.parametrize(
    'response',
    [
        httpx.Response(401),
        httpx.Response(200, json={'login': 'octocat'}),
        httpx.Response(200, json={'id': 'x', 'login': 'o'}),
        httpx.Response(200, text='nope'),
    ],
)
async def test_fetch_identity_failures_raise(response):
    with pytest.raises(GitHubOAuthError):
        await _service(lambda r: response).fetch_identity(TOKEN)


async def test_fetch_identity_network_error_raises():
    def handler(request):
        raise httpx.ReadTimeout('slow', request=request)

    with pytest.raises(GitHubOAuthError):
        await _service(handler).fetch_identity(TOKEN)


async def test_revoke_deletes_the_grant_with_basic_auth(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.DEBUG)
    seen = {}

    def handler(request):
        seen['method'] = request.method
        seen['url'] = str(request.url)
        seen['auth'] = request.headers['Authorization']
        seen['body'] = json.loads(request.content)
        return httpx.Response(500)

    await _service(handler).revoke(TOKEN)

    assert seen['method'] == 'DELETE'
    assert seen['url'] == (
        f'https://api.github.com/applications/{envs.GITHUB_CLIENT_ID}/token'
    )
    assert seen['auth'].startswith('Basic ')
    assert seen['body'] == {'access_token': TOKEN}
    assert TOKEN not in caplog.text


async def test_revoke_swallows_network_errors(
    caplog: pytest.LogCaptureFixture,
):
    caplog.set_level(logging.DEBUG)

    def handler(request):
        raise httpx.ConnectError('down', request=request)

    await _service(handler).revoke(TOKEN)
    assert TOKEN not in caplog.text
