from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.dto.application_step import (
    ApplicationStepCreateDTO,
    ApplicationStepUpdateDTO,
)
from app.application.use_cases.application_steps.create_application_step import (
    CreateApplicationStepUseCase,
)
from app.application.use_cases.application_steps.delete_application_step import (
    DeleteApplicationStepUseCase,
)
from app.application.use_cases.application_steps.list_application_steps import (
    ListApplicationStepsUseCase,
)
from app.application.use_cases.application_steps.update_application_step import (
    UpdateApplicationStepUseCase,
)
from app.core.exceptions import ApplicationFinalized, ResourceNotFound
from tests.unit.conftest import make_application, make_step


def _create_dto(**kw) -> ApplicationStepCreateDTO:
    defaults = dict(
        user_id=1, application_id=1, step_id=1,
        step_date='2025-12-05', observation=None,
    )
    defaults.update(kw)
    return ApplicationStepCreateDTO(**defaults)


def _update_dto(**kw) -> ApplicationStepUpdateDTO:
    defaults = dict(
        application_id=1, step_id=1,
        step_date='2025-12-05', observation=None,
    )
    defaults.update(kw)
    return ApplicationStepUpdateDTO(**defaults)


# ---------------------------------------------------------------------------
# Create step
# ---------------------------------------------------------------------------

async def test_create_step_app_not_found():
    uc = CreateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await uc.execute(user_id=1, data=_create_dto())


async def test_create_step_app_finalized():
    uc = CreateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application(feedback_id=1)
    )

    with pytest.raises(ApplicationFinalized):
        await uc.execute(user_id=1, data=_create_dto())


async def test_create_step_invalid_step():
    uc = CreateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_non_strict_only.return_value = None

    with pytest.raises(ResourceNotFound, match='Step not found'):
        await uc.execute(user_id=1, data=_create_dto(step_id=999))


async def test_create_step_success():
    uc = CreateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_non_strict_only.return_value = SimpleNamespace(
        id=1, name='Applied'
    )
    uc.application_step_repo.create.return_value = make_step()

    result = await uc.execute(user_id=1, data=_create_dto())

    assert result.step_name == 'Applied'
    uc.application_step_repo.create.assert_called_once()


# ---------------------------------------------------------------------------
# List steps
# ---------------------------------------------------------------------------

async def test_list_steps_app_not_found():
    uc = ListApplicationStepsUseCase(AsyncMock(), AsyncMock())
    uc.app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await uc.execute(application_id=999, user_id=1)


async def test_list_steps_success():
    uc = ListApplicationStepsUseCase(AsyncMock(), AsyncMock())
    uc.app_repo.get_by_id_and_user_id.return_value = make_application()
    uc.app_step_repo.get_all_by_app_id_and_user_id.return_value = []

    result = await uc.execute(application_id=1, user_id=1)
    assert result == []


# ---------------------------------------------------------------------------
# Delete step
# ---------------------------------------------------------------------------

async def test_delete_step_app_not_found():
    uc = DeleteApplicationStepUseCase(AsyncMock(), AsyncMock())
    uc.application_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await uc.execute(id=1, app_id=1, user_id=1)


async def test_delete_step_app_finalized():
    uc = DeleteApplicationStepUseCase(AsyncMock(), AsyncMock())
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application(feedback_id=1)
    )

    with pytest.raises(ApplicationFinalized):
        await uc.execute(id=1, app_id=1, user_id=1)


async def test_delete_step_not_found():
    uc = DeleteApplicationStepUseCase(AsyncMock(), AsyncMock())
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.application_step_repo.get_by_id_and_app_id_and_user_id.return_value = (
        None
    )

    with pytest.raises(ResourceNotFound, match='step not found'):
        await uc.execute(id=999, app_id=1, user_id=1)


async def test_delete_step_success():
    uc = DeleteApplicationStepUseCase(AsyncMock(), AsyncMock())
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    mock_step = MagicMock()
    uc.application_step_repo.get_by_id_and_app_id_and_user_id.return_value = (
        mock_step
    )

    await uc.execute(id=1, app_id=1, user_id=1)
    uc.application_step_repo.delete.assert_called_once_with(mock_step)


# ---------------------------------------------------------------------------
# Update step
# ---------------------------------------------------------------------------

async def test_update_step_app_not_found():
    uc = UpdateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await uc.execute(id=1, user_id=1, data=_update_dto())


async def test_update_step_app_finalized():
    uc = UpdateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application(feedback_id=1)
    )

    with pytest.raises(ApplicationFinalized):
        await uc.execute(id=1, user_id=1, data=_update_dto())


async def test_update_step_record_not_found():
    uc = UpdateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.application_step_repo.get_by_id_and_app_id_and_user_id.return_value = (
        None
    )

    with pytest.raises(ResourceNotFound, match='step not found'):
        await uc.execute(id=999, user_id=1, data=_update_dto())


async def test_update_step_invalid_step_def():
    uc = UpdateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.application_step_repo.get_by_id_and_app_id_and_user_id.return_value = (
        make_step()
    )
    uc.step_repo.get_by_id_non_strict_only.return_value = None

    with pytest.raises(ResourceNotFound, match='Step not found'):
        await uc.execute(id=1, user_id=1, data=_update_dto(step_id=999))


async def test_update_step_success():
    uc = UpdateApplicationStepUseCase(
        AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    step_obj = make_step()
    uc.application_step_repo.get_by_id_and_app_id_and_user_id.return_value = (
        step_obj
    )
    uc.step_repo.get_by_id_non_strict_only.return_value = SimpleNamespace(
        id=2, name='Interview'
    )
    uc.application_step_repo.update.return_value = step_obj

    result = await uc.execute(id=1, user_id=1, data=_update_dto(step_id=2))

    assert result.step_name == 'Interview'
    uc.application_step_repo.update.assert_called_once()
