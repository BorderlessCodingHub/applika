from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.application.use_cases.account_links.link_discord import (
    LinkDiscordUseCase,
)
from app.core.exceptions import ResourceConflict
from app.domain.repositories.user_repository import UserRepository
from tests.unit.conftest import make_user


@pytest.mark.asyncio
async def test_link_stores_the_id():
    repo = AsyncMock()
    user = make_user(id=1, discord_id=None)
    repo.link_discord.return_value = user

    uc = LinkDiscordUseCase(repo)
    result = await uc.execute(user_id=1, discord_id=999)

    repo.link_discord.assert_called_once_with(1, 999)
    assert result is user


@pytest.mark.asyncio
async def test_relink_same_user_same_id_is_a_no_op():
    repo = AsyncMock()
    user = make_user(id=1, discord_id=999)
    repo.link_discord.return_value = user

    uc = LinkDiscordUseCase(repo)
    result = await uc.execute(user_id=1, discord_id=999)

    assert result.discord_id == 999
    repo.link_discord.assert_called_once_with(1, 999)


# --- Repository-level tests (T026, T028) ---


@pytest.mark.asyncio
async def test_repository_link_discord_conflict_when_another_user_holds_id():
    session = AsyncMock()
    other_owner = make_user(id=2, discord_id=999)
    session.scalar.return_value = other_owner
    repo = UserRepository(session)

    with pytest.raises(ResourceConflict):
        await repo.link_discord(user_id=1, discord_id=999)

    session.commit.assert_not_called()
    session.add.assert_not_called()


@pytest.mark.asyncio
async def test_repository_link_discord_integrity_error_is_conflict():
    session = AsyncMock()
    user = make_user(id=1, discord_id=None)
    # First scalar() call: get_by_discord_id -> no owner.
    # Second scalar() call: get_by_id -> the target user.
    session.scalar.side_effect = [None, user]
    session.commit.side_effect = IntegrityError('stmt', {}, Exception('dup'))
    repo = UserRepository(session)

    with pytest.raises(ResourceConflict):
        await repo.link_discord(user_id=1, discord_id=999)

    session.rollback.assert_called_once()


@pytest.mark.asyncio
async def test_repository_link_discord_same_user_relink_is_no_op():
    session = AsyncMock()
    user = make_user(id=1, discord_id=999)
    session.scalar.side_effect = [user, user]
    repo = UserRepository(session)

    result = await repo.link_discord(user_id=1, discord_id=999)

    assert result is user
    session.commit.assert_not_called()
    session.add.assert_not_called()
