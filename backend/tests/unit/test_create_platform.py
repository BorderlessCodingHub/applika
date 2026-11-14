from datetime import datetime, timezone
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest
from sqlalchemy.exc import IntegrityError

from app.application.dto.platform import PlatformCreateDTO
from app.application.use_cases.platforms.create_platform import (
    CreatePlatformUseCase,
)
from app.core.exceptions import ResourceConflict


def _dto(**overrides) -> PlatformCreateDTO:
    defaults: dict[str, Any] = dict(name='  My Board  ', url=None)
    defaults.update(overrides)
    return PlatformCreateDTO(**defaults)


async def test_create_platform_trims_the_name():
    platform_repo = AsyncMock()
    platform_repo.find_visible_by_name.return_value = None
    platform_repo.create.return_value = SimpleNamespace(
        id=1,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=None,
        name='My Board',
        url=None,
        is_public=False,
        created_by=7,
        created_by_user=None,
    )

    uc = CreatePlatformUseCase(platform_repo)
    await uc.execute(_dto(), user_id=7)

    platform_repo.find_visible_by_name.assert_awaited_once_with('My Board', 7)
    platform_repo.create.assert_awaited_once_with(
        name='My Board', url=None, is_public=False, created_by=7
    )


async def test_create_platform_case_insensitive_match_on_public_conflicts():
    platform_repo = AsyncMock()
    platform_repo.find_visible_by_name.return_value = SimpleNamespace(
        id=1, name='LinkedIn'
    )

    uc = CreatePlatformUseCase(platform_repo)

    with pytest.raises(ResourceConflict, match='LinkedIn'):
        await uc.execute(_dto(name='linkedin'), user_id=7)
    platform_repo.create.assert_not_called()


async def test_create_platform_case_insensitive_match_on_own_private_conflicts():
    """A platform the user already privately holds also blocks a duplicate,
    named the same as the public case (R-020)."""
    platform_repo = AsyncMock()
    platform_repo.find_visible_by_name.return_value = SimpleNamespace(
        id=2, name='Founder Board'
    )

    uc = CreatePlatformUseCase(platform_repo)

    with pytest.raises(ResourceConflict, match='Founder Board'):
        await uc.execute(_dto(name='founder board'), user_id=7)


async def test_create_platform_foreign_private_same_name_is_created():
    """Another user's private platform with the same name is invisible, so
    it is not a match - a new private row is created (R-018/R-024)."""
    platform_repo = AsyncMock()
    platform_repo.find_visible_by_name.return_value = None
    platform_repo.create.return_value = SimpleNamespace(
        id=3,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=None,
        name='Founder Board',
        url=None,
        is_public=False,
        created_by=9,
        created_by_user=None,
    )

    uc = CreatePlatformUseCase(platform_repo)
    dto = await uc.execute(_dto(name='Founder Board'), user_id=9)

    assert dto.is_public is False
    assert dto.created_by == 9


async def test_create_platform_admin_still_gets_a_private_row():
    """Owner decision, 2026-09-25: an admin adding a platform through the
    ordinary flow is no different from any other user."""
    platform_repo = AsyncMock()
    platform_repo.find_visible_by_name.return_value = None
    platform_repo.create.return_value = SimpleNamespace(
        id=4,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        updated_at=None,
        name='Admin Board',
        url=None,
        is_public=False,
        created_by=1,
        created_by_user=None,
    )

    uc = CreatePlatformUseCase(platform_repo)
    dto = await uc.execute(_dto(name='Admin Board'), user_id=1)

    platform_repo.create.assert_awaited_once_with(
        name='Admin Board', url=None, is_public=False, created_by=1
    )
    assert dto.is_public is False


async def test_create_platform_integrity_error_is_a_named_conflict():
    """A same-instant race that slips past the pre-check hits the database's
    own partial unique index; the use case turns that into the same 409."""
    platform_repo = AsyncMock()
    platform_repo.find_visible_by_name.return_value = None
    platform_repo.create.side_effect = IntegrityError('stmt', {}, Exception())

    uc = CreatePlatformUseCase(platform_repo)

    with pytest.raises(ResourceConflict, match='My Board'):
        await uc.execute(_dto(), user_id=7)
