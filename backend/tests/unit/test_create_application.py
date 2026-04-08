from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.dto.application import ApplicationCreateDTO
from app.application.use_cases.applications.create_application import (
    CreateApplicationUseCase,
)
from app.core.exceptions import ResourceNotFound
from tests.unit.conftest import make_application


def _dto(**overrides) -> ApplicationCreateDTO:
    defaults = dict(
        company=1, role='Engineer', mode='active',
        platform_id=1, application_date='2025-12-01',
        user_id=1, link_to_job=None,
    )
    defaults.update(overrides)
    return ApplicationCreateDTO(**defaults)


async def test_create_application_platform_not_found():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_by_id.return_value = None

    uc = CreateApplicationUseCase(app_repo, platform_repo, company_repo)

    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await uc.execute(_dto(platform_id=999))


async def test_create_application_company_id_not_found():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_by_id.return_value = MagicMock()
    company_repo.get_by_id.return_value = None

    uc = CreateApplicationUseCase(app_repo, platform_repo, company_repo)

    with pytest.raises(ResourceNotFound, match='Company not found'):
        await uc.execute(_dto(company=999))


async def test_create_application_with_existing_company():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_by_id.return_value = MagicMock()
    company_repo.get_by_id.return_value = MagicMock(id=1, name='Acme')
    app_repo.create.return_value = make_application(company_id=1)

    uc = CreateApplicationUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(_dto(company=1))

    assert result.company_id == 1
    assert result.company_name == 'Acme'


async def test_create_application_anonymous_company():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_by_id.return_value = MagicMock()
    app_repo.create.return_value = make_application(
        company_id=None, company_name='Stealth'
    )

    uc = CreateApplicationUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(
        _dto(company={'name': 'Stealth', 'url': None})
    )

    assert result.company_id is None
    assert result.company_name == 'Stealth'
