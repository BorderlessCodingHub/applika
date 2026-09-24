from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.application.services.discord_oauth_service import (
    DiscordGrant,
    DiscordProfile,
)
from app.application.use_cases.account_links.link_discord import (
    LinkDiscordUseCase,
)
from app.core.enums import DiscordConnectionStatus
from app.core.exceptions import ResourceConflict


def _connection(**kwargs) -> SimpleNamespace:
    defaults = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
        'updated_at': None,
        'user_id': 1,
        'discord_id': 999,
        'username': 'ada',
        'global_name': None,
        'avatar': None,
        'scopes': 'identify guilds guilds.members.read',
        'access_token_expires_at': None,
        'status': DiscordConnectionStatus.ACTIVE,
        'linked_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


_GRANT = DiscordGrant(
    access_token='access-tok',
    refresh_token='refresh-tok',
    expires_in=604800,
    scope='identify guilds guilds.members.read',
)
_PROFILE = DiscordProfile(id=999, username='ada', global_name=None, avatar=None)


@pytest.mark.asyncio
async def test_link_encrypts_refresh_token_and_stores(monkeypatch):
    conn_repo = AsyncMock()
    discord_oauth = AsyncMock()
    conn_repo.link.return_value = _connection()

    monkeypatch.setattr(
        'app.application.use_cases.account_links.link_discord.'
        'encrypt_discord_token',
        lambda plaintext: f'encrypted:{plaintext}',
    )

    uc = LinkDiscordUseCase(conn_repo, discord_oauth)
    await uc.execute(user_id=1, grant=_GRANT, profile=_PROFILE)

    conn_repo.link.assert_called_once()
    _, kwargs = conn_repo.link.call_args
    assert kwargs['encrypted_refresh_token'] == 'encrypted:refresh-tok'
    assert kwargs['discord_id'] == 999
    assert kwargs['username'] == 'ada'
    assert kwargs['scopes'] == 'identify guilds guilds.members.read'
    discord_oauth.revoke.assert_not_called()


@pytest.mark.asyncio
async def test_link_conflict_revokes_new_grant_and_reraises(monkeypatch):
    conn_repo = AsyncMock()
    discord_oauth = AsyncMock()
    conn_repo.link.side_effect = ResourceConflict('already linked')

    monkeypatch.setattr(
        'app.application.use_cases.account_links.link_discord.'
        'encrypt_discord_token',
        lambda plaintext: f'encrypted:{plaintext}',
    )

    uc = LinkDiscordUseCase(conn_repo, discord_oauth)

    with pytest.raises(ResourceConflict):
        await uc.execute(user_id=1, grant=_GRANT, profile=_PROFILE)

    discord_oauth.revoke.assert_called_once_with('refresh-tok')


@pytest.mark.asyncio
async def test_link_reconnect_updates_in_place(monkeypatch):
    """A reconnect (same or another account) delegates straight to the
    repository - the reconnect-in-place / clear-the-mark rule lives there
    (T095), exercised at the repository/integration level."""
    conn_repo = AsyncMock()
    discord_oauth = AsyncMock()
    conn_repo.link.return_value = _connection(
        status=DiscordConnectionStatus.ACTIVE
    )

    monkeypatch.setattr(
        'app.application.use_cases.account_links.link_discord.'
        'encrypt_discord_token',
        lambda plaintext: 'encrypted',
    )

    uc = LinkDiscordUseCase(conn_repo, discord_oauth)
    result = await uc.execute(user_id=1, grant=_GRANT, profile=_PROFILE)

    assert result.status == DiscordConnectionStatus.ACTIVE
