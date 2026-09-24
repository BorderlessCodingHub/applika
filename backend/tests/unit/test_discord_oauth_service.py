import logging

import httpx
import pytest

from app.application.services.discord_oauth_service import (
    DiscordLinkError,
    DiscordOAuthService,
)


def _service(monkeypatch, client_id='client-id', client_secret='secret'):
    monkeypatch.setattr(
        'app.application.services.discord_oauth_service.envs.DISCORD_CLIENT_ID',
        client_id,
    )
    monkeypatch.setattr(
        'app.application.services.discord_oauth_service.envs.'
        'DISCORD_CLIENT_SECRET',
        client_secret,
    )
    monkeypatch.setattr(
        'app.application.services.discord_oauth_service.envs.'
        'DISCORD_LINK_REDIRECT_URI',
        'http://127.0.0.1:8000/api/auth/link/discord/callback',
    )
    return DiscordOAuthService()


def test_is_configured_false_when_unset(monkeypatch):
    service = _service(monkeypatch, client_id=None, client_secret=None)
    assert service.is_configured() is False


def test_is_configured_true_when_set(monkeypatch):
    service = _service(monkeypatch)
    assert service.is_configured() is True


def test_authorize_url_scope_is_identify_only(monkeypatch):
    service = _service(monkeypatch)
    url = service.get_authorize_url('the-nonce')
    assert 'scope=identify' in url
    assert 'state=the-nonce' in url


def _mock_client(handler):
    transport = httpx.MockTransport(handler)

    class _Client(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, transport=transport, **kwargs)

    return _Client


@pytest.mark.asyncio
async def test_fetch_discord_id_revokes_after_reading_id(monkeypatch):
    service = _service(monkeypatch)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        if 'token/revoke' in str(request.url):
            return httpx.Response(200)
        if request.url.path == '/api/oauth2/token':
            return httpx.Response(200, json={'access_token': 'tok-123'})
        if request.url.path == '/api/users/@me':
            return httpx.Response(200, json={'id': '999'})
        raise AssertionError(f'unexpected request {request.url}')

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    discord_id = await service.fetch_discord_id('code-abc')

    assert discord_id == 999
    assert any('token/revoke' in c for c in calls)
    # revoke happens strictly after the id was read
    id_index = next(i for i, c in enumerate(calls) if 'users/@me' in c)
    revoke_index = next(i for i, c in enumerate(calls) if 'revoke' in c)
    assert revoke_index > id_index


@pytest.mark.asyncio
async def test_fetch_discord_id_returns_id_even_if_revoke_fails(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        if 'token/revoke' in str(request.url):
            return httpx.Response(500)
        if request.url.path == '/api/oauth2/token':
            return httpx.Response(200, json={'access_token': 'tok-123'})
        if request.url.path == '/api/users/@me':
            return httpx.Response(200, json={'id': '42'})
        raise AssertionError(f'unexpected request {request.url}')

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    discord_id = await service.fetch_discord_id('code-abc')
    assert discord_id == 42


@pytest.mark.asyncio
async def test_fetch_discord_id_raises_on_token_exchange_4xx(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={'error': 'invalid_grant'})

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.fetch_discord_id('bad-code')


@pytest.mark.asyncio
async def test_fetch_discord_id_raises_on_token_exchange_5xx(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.fetch_discord_id('any-code')


@pytest.mark.asyncio
async def test_fetch_discord_id_raises_on_network_error(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.fetch_discord_id('any-code')


@pytest.mark.asyncio
async def test_fetch_discord_id_raises_on_missing_id(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/oauth2/token':
            return httpx.Response(200, json={'access_token': 'tok-123'})
        if request.url.path == '/api/users/@me':
            return httpx.Response(200, json={})
        raise AssertionError(f'unexpected request {request.url}')

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.fetch_discord_id('any-code')


@pytest.mark.asyncio
async def test_no_revoke_call_without_a_token(monkeypatch):
    """A failed exchange never issues a revoke - there is no token yet."""
    service = _service(monkeypatch)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(400)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.fetch_discord_id('bad-code')

    assert not any('revoke' in c for c in calls)


@pytest.mark.asyncio
async def test_token_value_absent_from_logs(monkeypatch, caplog):
    service = _service(monkeypatch)
    secret_token = 'super-secret-access-token'

    def handler(request: httpx.Request) -> httpx.Response:
        if 'token/revoke' in str(request.url):
            return httpx.Response(500)
        if request.url.path == '/api/oauth2/token':
            return httpx.Response(200, json={'access_token': secret_token})
        if request.url.path == '/api/users/@me':
            return httpx.Response(200, json={'id': '1'})
        raise AssertionError(f'unexpected request {request.url}')

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with caplog.at_level(logging.DEBUG):
        await service.fetch_discord_id('code-abc')

    assert secret_token not in caplog.text
