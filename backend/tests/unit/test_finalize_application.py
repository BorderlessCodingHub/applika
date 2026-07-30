from unittest.mock import AsyncMock, MagicMock
from types import SimpleNamespace

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
    uc.step_repo.get_by_id_strict_only.return_value = SimpleNamespace(
        id=2, name='Offer'
    )
    uc.feedback_repo.get_by_id.return_value = SimpleNamespace(
        id=3, name='Accepted'
    )
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


async def test_finalize_offer_requires_accepted_feedback():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_strict_only.return_value = SimpleNamespace(
        id=2, name='Offer'
    )
    uc.feedback_repo.get_by_id.return_value = SimpleNamespace(
        id=3, name='Rejected'
    )

    with pytest.raises(
        BusinessRuleViolation, match='Offer final step requires Accepted feedback'
    ):
        await uc.execute(id=1, user_id=1, data=_data(step_id=2, feedback_id=3))


async def test_finalize_accepted_requires_offer_step():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_strict_only.return_value = SimpleNamespace(
        id=2, name='Denied'
    )
    uc.feedback_repo.get_by_id.return_value = SimpleNamespace(
        id=3, name='Accepted'
    )

    with pytest.raises(
        BusinessRuleViolation,
        match='Accepted feedback requires the Offer final step',
    ):
        await uc.execute(id=1, user_id=1, data=_data(step_id=2, feedback_id=3))


async def test_finalize_salary_offer_requires_offer_and_accepted():
    uc = FinalizeApplicationUseCase(
        AsyncMock(), AsyncMock(), AsyncMock(), AsyncMock()
    )
    uc.application_repo.get_by_id_and_user_id.return_value = (
        make_application()
    )
    uc.step_repo.get_by_id_strict_only.return_value = SimpleNamespace(
        id=2, name='Denied'
    )
    uc.feedback_repo.get_by_id.return_value = SimpleNamespace(
        id=3, name='Rejected'
    )

    with pytest.raises(
        BusinessRuleViolation,
        match='salary_offer can only be set for Offer \\+ Accepted',
    ):
        await uc.execute(
            id=1,
            user_id=1,
            data=_data(step_id=2, feedback_id=3, salary_offer=90000.0),
        )
