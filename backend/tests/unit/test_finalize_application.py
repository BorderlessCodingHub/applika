from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.dto.application import FinalizeApplicationDTO
from app.application.use_cases.applications.finalize_application import (
    FinalizeApplicationUseCase,
)
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    ResourceNotFound,
)
from tests.unit.conftest import make_application


def _data(**overrides) -> FinalizeApplicationDTO:
    defaults = dict(
        step_id=1, feedback_id=1, finalize_date='2025-12-15'
    )
    defaults.update(overrides)
    return FinalizeApplicationDTO(**defaults)


async def test_finalize_not_found():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await uc.execute(id=999, user_id=1, data=_data())


async def test_finalize_archived_cycle():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application(cycle_id=42)
    )

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await uc.execute(id=1, user_id=1, data=_data())


async def test_finalize_already_finalized():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application(feedback_id=1)
    )

    with pytest.raises(ApplicationFinalized):
        await uc.execute(id=1, user_id=1, data=_data())


async def test_finalize_step_not_found():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_strict_only.return_value = None

    with pytest.raises(ResourceNotFound, match='Step not found'):
        await uc.execute(id=1, user_id=1, data=_data(step_id=999))


async def test_finalize_feedback_not_found():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_strict_only.return_value = MagicMock(id=1)
    uc.feedback_repo.get_by_id.return_value = None

    with pytest.raises(ResourceNotFound, match='Feedback not found'):
        await uc.execute(id=1, user_id=1, data=_data(feedback_id=999))


async def test_finalize_success():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    app = make_application()
    uc.application_repo.get_by_id_and_user_id.return_value = app
    uc.step_repo.get_by_id_strict_only.return_value = MagicMock(id=2)
    uc.feedback_repo.get_by_id.return_value = MagicMock(id=3)
    uc.application_repo.update.return_value = app

    await uc.execute(
        id=1, user_id=1,
        data=_data(step_id=2, feedback_id=3, salary_offer=90000.0),
    )

    uc.application_step_repo.create.assert_called_once()
    uc.application_repo.update.assert_called_once()
    assert app.feedback_id == 3
    assert app.last_step_id == 2
    assert app.salary_offer == 90000.0
