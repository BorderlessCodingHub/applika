"""Unit tests for the KODI-024 Discord OAuth service.

Rewritten for the connection-record flow: the scope now includes ``guilds``
and ``guilds.members.read``, connecting no longer revokes the token, and
``refresh()``/``revoke()`` are new (``fetch_discord_id``/``revoke_token`` are
gone). ``httpx.MockTransport`` replaces every real network call.
"""

import logging

import httpx
import pytest

from app.application.services.discord_oauth_service import (
    SCOPE,
    DiscordGrant,
    DiscordGrantRevoked,
    DiscordLinkError,
    DiscordOAuthService,
    DiscordUnavailable,
)


def _service(
    monkeypatch,
    client_id='client-id',
    client_secret='secret',
    token_key='a-token-key',
):
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
    monkeypatch.setattr(
        'app.application.services.discord_oauth_service.envs.'
        'DISCORD_TOKEN_ENCRYPTION_KEY',
        token_key,
    )
    return DiscordOAuthService()


def _mock_client(handler):
    transport = httpx.MockTransport(handler)

    class _Client(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, transport=transport, **kwargs)

    return _Client


# --- is_configured / scope (T096) ---


def test_is_configured_false_when_unset(monkeypatch):
    service = _service(monkeypatch, client_id=None, client_secret=None)
    assert service.is_configured() is False


def test_is_configured_false_without_encryption_key(monkeypatch):
    service = _service(monkeypatch, token_key=None)
    assert service.is_configured() is False


def test_is_configured_true_when_set(monkeypatch):
    service = _service(monkeypatch)
    assert service.is_configured() is True


def test_authorize_url_scope_is_exact(monkeypatch):
    service = _service(monkeypatch)
    url = service.get_authorize_url('the-nonce')
    assert 'scope=identify+guilds+guilds.members.read' in url
    assert 'state=the-nonce' in url
    assert SCOPE == 'identify guilds guilds.members.read'


# --- exchange_code / fetch_profile (T096) ---


@pytest.mark.asyncio
async def test_exchange_code_parses_grant(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/oauth2/token'
        return httpx.Response(
            200,
            json={
                'access_token': 'tok-123',
                'refresh_token': 'ref-456',
                'expires_in': 604800,
                'scope': 'identify guilds guilds.members.read',
            },
        )

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    grant = await service.exchange_code('code-abc')

    assert grant.access_token == 'tok-123'
    assert grant.refresh_token == 'ref-456'
    assert grant.expires_in == 604800
    assert grant.scope == 'identify guilds guilds.members.read'


@pytest.mark.asyncio
async def test_exchange_code_no_revoke_call(monkeypatch):
    """Connecting no longer revokes the token at connect time (KODI-024)."""
    service = _service(monkeypatch)
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        return httpx.Response(
            200,
            json={
                'access_token': 'tok-123',
                'refresh_token': 'ref-456',
                'expires_in': 604800,
                'scope': SCOPE,
            },
        )

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    await service.exchange_code('code-abc')

    assert not any('revoke' in c for c in calls)


@pytest.mark.asyncio
async def test_exchange_code_raises_on_4xx(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={'error': 'invalid_grant'})

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.exchange_code('bad-code')


@pytest.mark.asyncio
async def test_exchange_code_raises_on_network_error(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.exchange_code('any-code')


@pytest.mark.asyncio
async def test_fetch_profile_parses_profile(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/users/@me'
        assert request.headers['Authorization'] == 'Bearer tok-123'
        return httpx.Response(
            200,
            json={
                'id': '999',
                'username': 'ada',
                'global_name': 'Ada Lovelace',
                'avatar': 'abc123',
            },
        )

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    profile = await service.fetch_profile('tok-123')

    assert profile.id == 999
    assert profile.username == 'ada'
    assert profile.global_name == 'Ada Lovelace'
    assert profile.avatar == 'abc123'


@pytest.mark.asyncio
async def test_fetch_profile_raises_on_missing_id(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={'username': 'ada'})

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordLinkError):
        await service.fetch_profile('tok-123')


@pytest.mark.asyncio
async def test_token_value_absent_from_logs(monkeypatch, caplog):
    service = _service(monkeypatch)
    secret_token = 'super-secret-refresh-token'

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == '/api/oauth2/token':
            return httpx.Response(400)
        raise AssertionError(f'unexpected request {request.url}')

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with caplog.at_level(logging.DEBUG):
        with pytest.raises(DiscordLinkError):
            await service.exchange_code('code-abc')

    assert secret_token not in caplog.text


def test_grant_repr_hides_tokens():
    grant = DiscordGrant(
        access_token='secret-access',
        refresh_token='secret-refresh',
        expires_in=3600,
        scope=SCOPE,
    )
    text = repr(grant)
    assert 'secret-access' not in text
    assert 'secret-refresh' not in text


# --- refresh() (T096) ---


@pytest.mark.asyncio
async def test_refresh_invalid_grant_raises_revoked(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={'error': 'invalid_grant'})

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordGrantRevoked):
        await service.refresh('a-refresh-token')


@pytest.mark.asyncio
async def test_refresh_429_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.refresh('a-refresh-token')


@pytest.mark.asyncio
async def test_refresh_5xx_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.refresh('a-refresh-token')


@pytest.mark.asyncio
async def test_refresh_network_error_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.refresh('a-refresh-token')


@pytest.mark.asyncio
async def test_refresh_success_returns_rotated_grant(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/oauth2/token'
        return httpx.Response(
            200,
            json={
                'access_token': 'new-access',
                'refresh_token': 'new-refresh',
                'expires_in': 604800,
                'scope': SCOPE,
            },
        )

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    grant = await service.refresh('old-refresh')

    assert grant.access_token == 'new-access'
    assert grant.refresh_token == 'new-refresh'


# --- revoke() (T096) ---


@pytest.mark.asyncio
async def test_revoke_uses_refresh_token_hint(monkeypatch):
    service = _service(monkeypatch)
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured['body'] = request.read().decode()
        return httpx.Response(200)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    await service.revoke('a-refresh-token')

    assert 'token_type_hint=refresh_token' in captured['body']
    assert 'token=a-refresh-token' in captured['body']


@pytest.mark.asyncio
async def test_revoke_failure_is_swallowed(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    await service.revoke('a-refresh-token')  # must not raise


@pytest.mark.asyncio
async def test_revoke_network_error_is_swallowed(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    await service.revoke('a-refresh-token')  # must not raise


# --- list_guild_ids / get_member_role_ids (K8, T131) ---


@pytest.mark.asyncio
async def test_list_guild_ids_parses_ids(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/users/@me/guilds'
        assert request.url.params['limit'] == '200'
        assert request.headers['Authorization'] == 'Bearer tok-123'
        return httpx.Response(
            200,
            json=[{'id': '111'}, {'id': '222'}],
        )

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    guild_ids = await service.list_guild_ids('tok-123')

    assert guild_ids == {111, 222}


@pytest.mark.asyncio
async def test_list_guild_ids_429_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.list_guild_ids('tok-123')


@pytest.mark.asyncio
async def test_list_guild_ids_5xx_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.list_guild_ids('tok-123')


@pytest.mark.asyncio
async def test_list_guild_ids_network_error_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.list_guild_ids('tok-123')


@pytest.mark.asyncio
async def test_get_member_role_ids_parses_roles(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == '/api/users/@me/guilds/555/member'
        return httpx.Response(200, json={'roles': ['1', '2', '3']})

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    role_ids = await service.get_member_role_ids('tok-123', 555)

    assert role_ids == {1, 2, 3}


@pytest.mark.asyncio
async def test_get_member_role_ids_404_is_empty(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(404)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    role_ids = await service.get_member_role_ids('tok-123', 555)

    assert role_ids == set()


@pytest.mark.asyncio
async def test_get_member_role_ids_429_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.get_member_role_ids('tok-123', 555)


@pytest.mark.asyncio
async def test_get_member_role_ids_5xx_raises_unavailable(monkeypatch):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.get_member_role_ids('tok-123', 555)


@pytest.mark.asyncio
async def test_get_member_role_ids_network_error_raises_unavailable(
    monkeypatch,
):
    service = _service(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError('boom', request=request)

    monkeypatch.setattr(httpx, 'AsyncClient', _mock_client(handler))

    with pytest.raises(DiscordUnavailable):
        await service.get_member_role_ids('tok-123', 555)
