"""Unit tests for the draft applications use cases and their wire schema
(KODI-032, ADR-0014).

Mirrors ``tests/unit/test_create_application.py``'s style: mocked repos, no
database. ``_draft`` is a ``SimpleNamespace`` mimicking ``ApplicationModel``
plus its ``tailored_cv`` relationship, which ``make_application`` in
``tests/unit/conftest.py`` does not carry (that helper is shared by the
ordinary application read-model tests, which never touch the CV copy).
"""

from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest
from pydantic import ValidationError

from app.application.dto.application_draft import DraftFinishDTO, DraftInputDTO
from app.application.use_cases.application_drafts.create_draft import (
    CreateDraftUseCase,
)
from app.application.use_cases.application_drafts.finish_draft import (
    NEEDS_CV_MESSAGE,
    FinishDraftUseCase,
)
from app.application.use_cases.application_drafts.update_draft import (
    UpdateDraftUseCase,
)
from app.core.exceptions import (
    BusinessRuleViolation,
    InvalidDate,
    ResourceNotFound,
)
from app.presentation.schemas.application_draft import DraftInput


def _draft(**kwargs) -> SimpleNamespace:
    defaults: dict[str, Any] = {
        'id': 1,
        'created_at': datetime(2026, 1, 1, tzinfo=UTC),
        'updated_at': None,
        'company_id': None,
        'company_name': 'Acme',
        'role': 'Engineer',
        'mode': 'active',
        'platform_id': 1,
        'application_date': date(2026, 1, 1),
        'link_to_job': None,
        'observation': None,
        'expected_salary': None,
        'salary_range_min': None,
        'salary_range_max': None,
        'currency': None,
        'salary_period': None,
        'experience_level': None,
        'work_mode': None,
        'country': None,
        'job_description': None,
        'cycle_id': None,
        'finalized_at': None,
        'is_draft': True,
        'tailored_cv': None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


def _input_dto(**overrides) -> DraftInputDTO:
    defaults: dict[str, Any] = dict(
        user_id=1,
        company_id=None,
        company_name='Acme',
        role='Engineer',
        platform_id=1,
    )
    defaults.update(overrides)
    return DraftInputDTO(**defaults)


# ---------------------------------------------------------------------------
# CreateDraftUseCase / UpdateDraftUseCase - company resolution
# ---------------------------------------------------------------------------


async def test_create_draft_company_id_wins_over_company_name():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_visible.return_value = MagicMock()
    company_repo.get_visible.return_value = SimpleNamespace(
        id=7, name='Acme Corp'
    )
    app_repo.create_draft.return_value = _draft(
        company_id=7, company_name='Acme Corp'
    )

    uc = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(
        _input_dto(company_id=7, company_name='Ignored Name')
    )

    assert result.company_id == 7
    assert result.company_name == 'Acme Corp'
    company_repo.get_visible.assert_awaited_once_with(7, 1)


async def test_create_draft_company_id_not_visible_is_404_and_writes_nothing():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_visible.return_value = MagicMock()
    company_repo.get_visible.return_value = None

    uc = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    with pytest.raises(ResourceNotFound, match='Company not found'):
        await uc.execute(_input_dto(company_id=999))
    app_repo.create_draft.assert_not_called()


async def test_create_draft_platform_not_visible_is_404_and_writes_nothing():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_visible.return_value = None

    uc = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    with pytest.raises(ResourceNotFound, match='Platform not found'):
        await uc.execute(_input_dto(platform_id=999))
    app_repo.create_draft.assert_not_called()
    company_repo.get_visible.assert_not_called()


async def test_create_draft_name_only_company_stays_free_text():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_visible.return_value = MagicMock()
    app_repo.create_draft.return_value = _draft(
        company_id=None, company_name='Stealth Startup'
    )

    uc = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(
        _input_dto(company_id=None, company_name='Stealth Startup')
    )

    assert result.company_id is None
    assert result.company_name == 'Stealth Startup'
    company_repo.get_visible.assert_not_called()


async def test_create_draft_stores_given_application_date():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    platform_repo.get_visible.return_value = MagicMock()
    given = date(2026, 1, 2)
    app_repo.create_draft.return_value = _draft(application_date=given)

    uc = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(_input_dto(application_date=given))

    assert result.application_date == given
    passed_dto = app_repo.create_draft.call_args.args[0]
    assert passed_dto.application_date == given


async def test_create_draft_future_date_is_422_and_writes_nothing():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    too_far = (datetime.now(UTC) + timedelta(days=2)).date()

    uc = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    with pytest.raises(InvalidDate):
        await uc.execute(_input_dto(application_date=too_far))
    app_repo.create_draft.assert_not_called()
    platform_repo.get_visible.assert_not_called()


async def test_update_draft_not_found_is_404():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    app_repo.get_draft.return_value = None

    uc = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    with pytest.raises(ResourceNotFound, match='Draft not found'):
        await uc.execute(1, _input_dto())


async def test_update_draft_keeps_cv_copy_untouched():
    """PUT never reads or writes ``tailored_cv`` (acceptance #4)."""
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    existing_copy = SimpleNamespace(id=55)
    draft = _draft(tailored_cv=existing_copy)
    app_repo.get_draft.return_value = draft
    platform_repo.get_visible.return_value = MagicMock()
    app_repo.update.side_effect = lambda application: application

    uc = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(1, _input_dto(role='Staff Engineer'))

    assert result.has_cv is True
    assert draft.tailored_cv is existing_copy


async def test_update_draft_without_application_date_keeps_stored_value():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    stored = date(2026, 1, 1)
    draft = _draft(application_date=stored)
    app_repo.get_draft.return_value = draft
    platform_repo.get_visible.return_value = MagicMock()
    app_repo.update.side_effect = lambda application: application

    uc = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(
        1, _input_dto(role='Staff Engineer', application_date=None)
    )

    assert draft.application_date == stored
    assert result.application_date == stored


async def test_update_draft_explicit_none_keeps_stored_value():
    """Explicit ``null`` on PUT is treated exactly like an absent key -
    never clears the stored date (API contract, KODI-036)."""
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    stored = date(2026, 1, 1)
    draft = _draft(application_date=stored)
    app_repo.get_draft.return_value = draft
    platform_repo.get_visible.return_value = MagicMock()
    app_repo.update.side_effect = lambda application: application

    payload = DraftInput(**_draft_input_payload(application_date=None))
    assert 'application_date' in payload.model_fields_set

    uc = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    dto = _input_dto(application_date=payload.application_date)
    result = await uc.execute(1, dto)

    assert draft.application_date == stored
    assert result.application_date == stored


async def test_update_draft_with_application_date_overwrites_stored_value():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    draft = _draft(application_date=date(2026, 1, 1))
    app_repo.get_draft.return_value = draft
    platform_repo.get_visible.return_value = MagicMock()
    app_repo.update.side_effect = lambda application: application

    new_date = date(2026, 2, 2)
    uc = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    result = await uc.execute(1, _input_dto(application_date=new_date))

    assert draft.application_date == new_date
    assert result.application_date == new_date


async def test_update_draft_future_date_is_422_and_writes_nothing():
    app_repo = AsyncMock()
    platform_repo = AsyncMock()
    company_repo = AsyncMock()
    too_far = (datetime.now(UTC) + timedelta(days=2)).date()

    uc = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    with pytest.raises(InvalidDate):
        await uc.execute(1, _input_dto(application_date=too_far))
    app_repo.get_draft.assert_not_called()
    app_repo.update.assert_not_called()


# ---------------------------------------------------------------------------
# FinishDraftUseCase
# ---------------------------------------------------------------------------


async def test_finish_draft_without_cv_copy_is_422_with_message():
    app_repo = AsyncMock()
    read_model = AsyncMock()
    app_repo.get_draft.return_value = _draft(tailored_cv=None)

    uc = FinishDraftUseCase(app_repo, read_model)
    with pytest.raises(BusinessRuleViolation, match=NEEDS_CV_MESSAGE):
        await uc.execute(
            1,
            DraftFinishDTO(user_id=1, application_date=date.today()),
        )
    app_repo.update.assert_not_called()


async def test_finish_draft_date_beyond_utc_plus_one_is_422():
    app_repo = AsyncMock()
    read_model = AsyncMock()
    app_repo.get_draft.return_value = _draft(tailored_cv=SimpleNamespace(id=1))
    too_far = (datetime.now(UTC) + timedelta(days=2)).date()

    uc = FinishDraftUseCase(app_repo, read_model)
    with pytest.raises(InvalidDate):
        await uc.execute(1, DraftFinishDTO(user_id=1, application_date=too_far))
    app_repo.update.assert_not_called()


async def test_finish_draft_not_found_is_404():
    app_repo = AsyncMock()
    read_model = AsyncMock()
    app_repo.get_draft.return_value = None

    uc = FinishDraftUseCase(app_repo, read_model)
    with pytest.raises(ResourceNotFound, match='Draft not found'):
        await uc.execute(
            1, DraftFinishDTO(user_id=1, application_date=date.today())
        )


async def test_finish_draft_no_body_uses_stored_date():
    app_repo = AsyncMock()
    read_model = AsyncMock()
    stored = date(2026, 1, 5)
    draft = _draft(tailored_cv=SimpleNamespace(id=1), application_date=stored)
    app_repo.get_draft.return_value = draft
    app_repo.update.side_effect = lambda application: application
    read_model.one.return_value = SimpleNamespace(id=draft.id)

    uc = FinishDraftUseCase(app_repo, read_model)
    await uc.execute(1, DraftFinishDTO(user_id=1, application_date=None))

    assert draft.application_date == stored
    assert draft.is_draft is False


async def test_finish_draft_body_date_overrides_stored_value():
    app_repo = AsyncMock()
    read_model = AsyncMock()
    draft = _draft(
        tailored_cv=SimpleNamespace(id=1), application_date=date(2026, 1, 5)
    )
    app_repo.get_draft.return_value = draft
    app_repo.update.side_effect = lambda application: application
    read_model.one.return_value = SimpleNamespace(id=draft.id)

    override = date(2026, 1, 20)
    uc = FinishDraftUseCase(app_repo, read_model)
    await uc.execute(1, DraftFinishDTO(user_id=1, application_date=override))

    assert draft.application_date == override


async def test_finish_draft_sets_is_draft_false_and_the_given_date():
    app_repo = AsyncMock()
    read_model = AsyncMock()
    draft = _draft(tailored_cv=SimpleNamespace(id=1), is_draft=True)
    app_repo.get_draft.return_value = draft
    app_repo.update.side_effect = lambda application: application
    read_model.one.return_value = SimpleNamespace(id=draft.id)

    finish_date = date(2026, 1, 15)
    uc = FinishDraftUseCase(app_repo, read_model)
    await uc.execute(1, DraftFinishDTO(user_id=1, application_date=finish_date))

    assert draft.is_draft is False
    assert draft.application_date == finish_date
    assert draft.cycle_id is None
    read_model.one.assert_awaited_once_with(draft)


# ---------------------------------------------------------------------------
# DraftInput wire schema
# ---------------------------------------------------------------------------


def _draft_input_payload(**overrides) -> dict:
    payload = {
        'company_name': 'Acme',
        'role': 'Engineer',
        'platform_id': '1',
    }
    payload.update(overrides)
    return payload


def test_draft_input_mode_defaults_to_active():
    draft = DraftInput(**_draft_input_payload())
    assert draft.mode == 'active'


def test_draft_input_refuses_blank_company_name():
    with pytest.raises(ValidationError):
        DraftInput(**_draft_input_payload(company_name='   '))


def test_draft_input_refuses_blank_role():
    with pytest.raises(ValidationError):
        DraftInput(**_draft_input_payload(role=''))


def test_draft_input_requires_platform_id():
    payload = _draft_input_payload()
    del payload['platform_id']
    with pytest.raises(ValidationError):
        DraftInput(**payload)


def test_draft_input_refuses_job_description_over_max_length():
    with pytest.raises(ValidationError):
        DraftInput(**_draft_input_payload(job_description='x' * 50_001))


def test_draft_input_accepts_job_description_at_max_length():
    draft = DraftInput(**_draft_input_payload(job_description='x' * 50_000))
    assert draft.job_description is not None
    assert len(draft.job_description) == 50_000


def test_draft_input_application_date_defaults_to_none():
    draft = DraftInput(**_draft_input_payload())
    assert draft.application_date is None
    assert 'application_date' not in draft.model_fields_set


def test_draft_input_accepts_an_explicit_application_date():
    draft = DraftInput(**_draft_input_payload(application_date='2026-01-15'))
    assert draft.application_date == date(2026, 1, 15)
