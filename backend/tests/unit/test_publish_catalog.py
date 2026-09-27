from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.application.use_cases.admin.companies.publish_company import (
    PublishCompanyUseCase,
)
from app.application.use_cases.admin.platforms.publish_platform import (
    PublishPlatformUseCase,
)
from app.core.exceptions import ResourceConflict, ResourceNotFound

_NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)


def _company(**overrides):
    defaults = dict(
        id=1,
        name='Acme',
        url='https://acme.example.com',
        is_public=False,
        created_by=7,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _admin_row(**overrides):
    defaults = dict(
        id=1,
        name='Acme',
        url='https://acme.example.com',
        is_active=True,
        is_public=True,
        applications_count=0,
        created_by=7,
        created_by_username='the_user',
        created_at=_NOW,
    )
    defaults.update(overrides)
    return defaults


# ---------------------------------------------------------------------------
# Companies
# ---------------------------------------------------------------------------


async def test_publish_company_flips_private_to_public_keeping_created_by():
    company_repo = AsyncMock()
    admin_repo = AsyncMock()
    company = _company()
    company_repo.get_by_id_unfiltered.return_value = company
    company_repo.find_public_collision.return_value = None
    admin_repo.get_admin_company_row.return_value = _admin_row()

    uc = PublishCompanyUseCase(company_repo, admin_repo)
    dto = await uc.execute(1, admin_id=99)

    assert company.is_public is True
    company_repo.update.assert_awaited_once_with(company)
    assert dto.created_by == 7


async def test_publish_company_already_public_is_idempotent():
    company_repo = AsyncMock()
    admin_repo = AsyncMock()
    company_repo.get_by_id_unfiltered.return_value = _company(is_public=True)
    admin_repo.get_admin_company_row.return_value = _admin_row()

    uc = PublishCompanyUseCase(company_repo, admin_repo)
    await uc.execute(1, admin_id=99)

    company_repo.update.assert_not_called()


async def test_publish_company_not_found():
    company_repo = AsyncMock()
    admin_repo = AsyncMock()
    company_repo.get_by_id_unfiltered.return_value = None

    uc = PublishCompanyUseCase(company_repo, admin_repo)

    with pytest.raises(ResourceNotFound, match='Company not found'):
        await uc.execute(999, admin_id=99)


async def test_publish_company_collision_names_the_public_row():
    company_repo = AsyncMock()
    admin_repo = AsyncMock()
    company_repo.get_by_id_unfiltered.return_value = _company()
    company_repo.find_public_collision.return_value = _company(
        id=5, is_public=True
    )

    uc = PublishCompanyUseCase(company_repo, admin_repo)

    with pytest.raises(ResourceConflict, match='id 5'):
        await uc.execute(1, admin_id=99)
    company_repo.update.assert_not_called()


# ---------------------------------------------------------------------------
# Platforms
# ---------------------------------------------------------------------------


def _platform(**overrides):
    defaults = dict(
        id=1,
        name='Founder Board',
        url=None,
        is_public=False,
        created_by=7,
        created_by_user=SimpleNamespace(username='the_user'),
        created_at=_NOW,
        updated_at=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


async def test_publish_platform_flips_private_to_public_keeping_created_by():
    platform_repo = AsyncMock()
    platform = _platform()
    platform_repo.get_by_id.return_value = platform
    platform_repo.find_public_by_name.return_value = None
    platform_repo.update.return_value = platform

    uc = PublishPlatformUseCase(platform_repo)
    dto = await uc.execute(1, admin_id=99)

    assert platform.is_public is True
    assert dto.created_by == 7


async def test_publish_platform_already_public_is_idempotent():
    platform_repo = AsyncMock()
    platform_repo.get_by_id.return_value = _platform(is_public=True)

    uc = PublishPlatformUseCase(platform_repo)
    await uc.execute(1, admin_id=99)

    platform_repo.update.assert_not_called()


async def test_publish_platform_not_found():
    platform_repo = AsyncMock()
    platform_repo.get_by_id.return_value = None

    uc = PublishPlatformUseCase(platform_repo)

    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await uc.execute(999, admin_id=99)


async def test_publish_platform_collision_names_the_public_row():
    platform_repo = AsyncMock()
    platform_repo.get_by_id.return_value = _platform()
    platform_repo.find_public_by_name.return_value = _platform(
        id=6, is_public=True
    )

    uc = PublishPlatformUseCase(platform_repo)

    with pytest.raises(ResourceConflict, match='id 6'):
        await uc.execute(1, admin_id=99)
    platform_repo.update.assert_not_called()
