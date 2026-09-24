from unittest.mock import AsyncMock

import pytest

from app.application.use_cases.account_links.unlink_discord import (
    UnlinkDiscordUseCase,
)
from app.domain.repositories.user_repository import UserRepository
from tests.unit.conftest import make_user


@pytest.mark.asyncio
async def test_use_case_delegates_to_repository():
    repo = AsyncMock()
    user = make_user(id=1, discord_id=None)
    repo.unlink_discord.return_value = user

    uc = UnlinkDiscordUseCase(repo)
    result = await uc.execute(user_id=1)

    repo.unlink_discord.assert_called_once_with(1)
    assert result is user


# --- Repository-level tests (T031, T034) ---


@pytest.mark.asyncio
async def test_repository_unlink_clears_the_id():
    session = AsyncMock()
    user = make_user(id=1, discord_id=999)
    session.scalar.return_value = user
    repo = UserRepository(session)

    result = await repo.unlink_discord(user_id=1)

    assert result is not None
    assert result.discord_id is None
    session.commit.assert_called_once()


@pytest.mark.asyncio
async def test_repository_unlink_already_unlinked_is_no_op():
    session = AsyncMock()
    user = make_user(id=1, discord_id=None)
    session.scalar.return_value = user
    repo = UserRepository(session)

    result = await repo.unlink_discord(user_id=1)

    assert result is user
    session.commit.assert_not_called()
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_repository_unlink_missing_user_returns_none():
    session = AsyncMock()
    session.scalar.return_value = None
    repo = UserRepository(session)

    result = await repo.unlink_discord(user_id=999)

    assert result is None
    session.commit.assert_not_called()


@pytest.mark.asyncio
async def test_repository_unlink_makes_zero_http_requests(monkeypatch):
    """Disconnect never talks to Discord: no httpx client is even
    imported/used from the repository or the use case."""
    import httpx

    def _fail(*args, **kwargs):
        raise AssertionError('unlink must not perform HTTP requests')

    monkeypatch.setattr(httpx.AsyncClient, 'post', _fail)
    monkeypatch.setattr(httpx.AsyncClient, 'get', _fail)

    session = AsyncMock()
    user = make_user(id=1, discord_id=999)
    session.scalar.return_value = user
    repo = UserRepository(session)

    uc = UnlinkDiscordUseCase(repo)
    result = await uc.execute(user_id=1)

    assert result is not None
    assert result.discord_id is None
