from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.dto.application import ApplicationUpdateDTO
from app.application.use_cases.applications.update_application import (
    UpdateApplicationUseCase,
)
from app.core.exceptions import ResourceNotFound
from tests.unit.conftest import make_application


def _dto(**overrides) -> ApplicationUpdateDTO:
    defaults = dict(
        company=1, role='Eng', mode='active',
        platform_id=1, application_date='2025-12-01',
        user_id=1, link_to_job=None,
    )
    defaults.update(overrides)
    return ApplicationUpdateDTO(**defaults)


async def test_update_not_found():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = None

    uc = UpdateApplicationUseCase(app_repo, platform_repo, company_repo)

    with pytest.raises(ResourceNotFound, match='Application not found'):
        await uc.execute(id=1, data=_dto())


async def test_update_platform_not_found():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application()
    platform_repo.get_by_id.return_value = None

    uc = UpdateApplicationUseCase(app_repo, platform_repo, company_repo)

    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await uc.execute(id=1, data=_dto(platform_id=999))


async def test_update_success():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()

    app = make_application()
    app_repo.get_by_id_and_user_id.return_value = app
    platform_repo.get_by_id.return_value = MagicMock()
    company_repo.get_by_id.return_value = SimpleNamespace(id=1, name='Acme')
    app_repo.update.return_value = app

    uc = UpdateApplicationUseCase(app_repo, platform_repo, company_repo)
    await uc.execute(
        id=1, data=_dto(role='Senior Eng', mode='passive')
    )

    assert app.role == 'Senior Eng'
    assert app.mode == 'passive'
    app_repo.update.assert_called_once()
