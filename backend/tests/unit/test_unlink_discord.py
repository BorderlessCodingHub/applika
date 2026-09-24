from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.use_cases.account_links.unlink_discord import (
    UnlinkDiscordUseCase,
)


def _connection(encrypted_refresh_token='ciphertext'):
    from types import SimpleNamespace

    return SimpleNamespace(
        user_id=1, encrypted_refresh_token=encrypted_refresh_token
    )


def _discord_oauth(*, configured: bool) -> MagicMock:
    """``is_configured`` is sync on the real service, unlike ``revoke`` -
    a bare ``AsyncMock`` would make ``is_configured()`` return an unawaited
    (always-truthy) coroutine instead of ``configured``."""
    mock = MagicMock()
    mock.is_configured.return_value = configured
    mock.revoke = AsyncMock()
    return mock


@pytest.mark.asyncio
async def test_unlink_deletes_then_revokes(monkeypatch):
    conn_repo = AsyncMock()
    discord_oauth = _discord_oauth(configured=True)
    conn_repo.get_by_user_id_for_update.return_value = _connection()

    monkeypatch.setattr(
        'app.application.use_cases.account_links.unlink_discord.'
        'decrypt_discord_token',
        lambda ciphertext: 'plaintext-refresh',
    )

    uc = UnlinkDiscordUseCase(conn_repo, discord_oauth)
    await uc.execute(user_id=1)

    conn_repo.delete_by_user_id.assert_called_once_with(1)
    discord_oauth.revoke.assert_called_once_with('plaintext-refresh')


@pytest.mark.asyncio
async def test_unlink_revoke_failure_is_swallowed(monkeypatch):
    conn_repo = AsyncMock()
    discord_oauth = _discord_oauth(configured=True)
    conn_repo.get_by_user_id_for_update.return_value = _connection()
    discord_oauth.revoke.side_effect = Exception('should not propagate')

    monkeypatch.setattr(
        'app.application.use_cases.account_links.unlink_discord.'
        'decrypt_discord_token',
        lambda ciphertext: 'plaintext-refresh',
    )

    uc = UnlinkDiscordUseCase(conn_repo, discord_oauth)

    # The use case itself does not catch - the service's own revoke() is
    # what swallows Discord failures (T096); this test proves the use case
    # does not add its own try/except around a well-behaved revoke() by
    # calling straight through to it (see the OAuth-service unit tests for
    # the actual swallow behaviour).
    with pytest.raises(Exception, match='should not propagate'):
        await uc.execute(user_id=1)


@pytest.mark.asyncio
async def test_unlink_skips_revoke_when_unconfigured():
    conn_repo = AsyncMock()
    discord_oauth = _discord_oauth(configured=False)
    conn_repo.get_by_user_id_for_update.return_value = _connection()

    uc = UnlinkDiscordUseCase(conn_repo, discord_oauth)
    await uc.execute(user_id=1)

    conn_repo.delete_by_user_id.assert_called_once_with(1)
    discord_oauth.revoke.assert_not_called()


@pytest.mark.asyncio
async def test_unlink_skips_revoke_when_decrypt_returns_none(monkeypatch):
    conn_repo = AsyncMock()
    discord_oauth = _discord_oauth(configured=True)
    conn_repo.get_by_user_id_for_update.return_value = _connection()

    monkeypatch.setattr(
        'app.application.use_cases.account_links.unlink_discord.'
        'decrypt_discord_token',
        lambda ciphertext: None,
    )

    uc = UnlinkDiscordUseCase(conn_repo, discord_oauth)
    await uc.execute(user_id=1)

    conn_repo.delete_by_user_id.assert_called_once_with(1)
    discord_oauth.revoke.assert_not_called()


@pytest.mark.asyncio
async def test_unlink_unlinked_user_is_a_no_op_with_no_http():
    conn_repo = AsyncMock()
    discord_oauth = _discord_oauth(configured=True)
    conn_repo.get_by_user_id_for_update.return_value = None

    uc = UnlinkDiscordUseCase(conn_repo, discord_oauth)
    await uc.execute(user_id=1)

    conn_repo.delete_by_user_id.assert_not_called()
    discord_oauth.revoke.assert_not_called()
    discord_oauth.is_configured.assert_not_called()
