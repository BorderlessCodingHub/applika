from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.application.dto.application import ApplicationUpdateDTO
from app.application.use_cases.applications.update_application import (
    UpdateApplicationUseCase,
)
from app.core.exceptions import BusinessRuleViolation, ResourceNotFound
from tests import msg
from tests.unit.conftest import make_application


def _dto(**overrides) -> ApplicationUpdateDTO:
    defaults: dict[str, Any] = dict(
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


async def test_update_application_archived_cycle():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(
        cycle_id=42
    )

    uc = UpdateApplicationUseCase(app_repo, platform_repo, company_repo)

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
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


# ---------------------------------------------------------------------------
# job_description: sticky on omission, cleared on an explicit null
#
# These pin the two halves of the same invariant. A published applika-cli that
# has never heard of job_description must not wipe it, and every OTHER optional
# field must keep clearing on omission - the full-replace PUT semantics that
# same CLI has always relied on. Breaking either one is a silent data bug.
# ---------------------------------------------------------------------------


def _update_use_case(app):
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = app
    platform_repo.get_by_id.return_value = MagicMock()
    company_repo.get_by_id.return_value = SimpleNamespace(id=1, name='Acme')
    app_repo.update.return_value = app
    return UpdateApplicationUseCase(app_repo, platform_repo, company_repo)


async def test_update_without_job_description_keeps_the_stored_text():
    """AC13: an absent key leaves the stored job description alone."""
    app = make_application(job_description='The original posting.')
    uc = _update_use_case(app)

    # No job_description anywhere in the DTO - exactly what an old CLI sends.
    data = _dto()
    assert 'job_description' not in data.model_fields_set

    await uc.execute(id=1, data=data)

    assert app.job_description == 'The original posting.'


async def test_update_with_explicit_null_clears_the_job_description():
    """AC13's other half: sending null really does clear the text."""
    app = make_application(job_description='The original posting.')
    uc = _update_use_case(app)

    await uc.execute(id=1, data=_dto(job_description=None))

    assert app.job_description is None


async def test_update_with_a_new_job_description_replaces_it():
    app = make_application(job_description='Old.')
    uc = _update_use_case(app)

    await uc.execute(id=1, data=_dto(job_description='New posting text.'))

    assert app.job_description == 'New posting text.'


async def test_other_optional_fields_still_clear_when_omitted():
    """The regression guard: PUT semantics did NOT change for anything else.

    ``observation``, ``link_to_job`` and ``expected_salary`` are full-replace
    fields. Omitting them must still blank the stored value, or the published
    CLI's update would silently stop clearing data it has always cleared.
    """
    app = make_application(
        observation='Stale note',
        link_to_job='https://old.example.com/job',
        expected_salary=1234.0,
    )
    uc = _update_use_case(app)

    await uc.execute(id=1, data=_dto())

    assert app.observation is None, msg(None, app.observation)
    assert app.link_to_job is None, msg(None, app.link_to_job)
    assert app.expected_salary is None, msg(None, app.expected_salary)
