"""Timeline-event use cases, guards and rules, unit level (R-001..R-006,
R-010, R-011, R-030).

Ported from mynextjob's ``test_timeline_event_use_cases.py`` with mocked
repositories, plus applika's additions:

* the guard order: archived is a ``BusinessRuleViolation`` (422) checked
  first, closed an ``ApplicationFinalized`` (409) "Reopen the application to
  edit it" (mynextjob: 409 for both);
* the rules every write goes through (``normalize_event``): interview type
  default and refusal, the offer salary invariant both ways (so offer ->
  interview must drop the salary), the start/end pair, no date-order rule;
* one initial screening per application (409), the replaced event excluded.
"""

import logging
from datetime import UTC, date, datetime, time
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.dto.timeline_event import (
    CreateTimelineEventDTO,
    UpdateTimelineEventDTO,
)
from app.application.use_cases.applications.guards import (
    ARCHIVED_MESSAGE,
    CLOSED_MESSAGE,
    ensure_mutable,
)
from app.application.use_cases.timeline_events.create import (
    CreateTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.delete import (
    DeleteTimelineEventUseCase,
)
from app.application.use_cases.timeline_events.list import (
    ListTimelineEventsUseCase,
)
from app.application.use_cases.timeline_events.rules import (
    DENIED_REASON_ONLY_ON_DENIED,
    END_AFTER_START,
    INTERVIEW_TYPE_ONLY_ON_INTERVIEW,
    OFFER_NEEDS_SALARY,
    SALARY_ONLY_ON_OFFER,
    TIMES_TOGETHER,
    normalize_event,
)
from app.application.use_cases.timeline_events.update import (
    UpdateTimelineEventUseCase,
)
from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    ResourceConflict,
    ResourceNotFound,
)
from tests.unit.conftest import make_application, make_event

CLOSED_AT = datetime(2026, 7, 2, tzinfo=UTC)
OFFER_SALARY = {
    'salary_amount': Decimal('150000.00'),
    'salary_currency': Currency.USD,
    'salary_period': SalaryPeriod.ANNUALLY,
}


def _repos(application=None, event=None, has_screening=False):
    app_repo = AsyncMock()
    event_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = (
        make_application(id=800, user_id=1)
        if application is None
        else application
    )
    event_repo.get_by_id_and_user_id.return_value = event
    event_repo.has_initial_screening.return_value = has_screening
    event_repo.create.side_effect = lambda values: make_event(
        id=700, **{k: v for k, v in values.items() if k != 'id'}
    )
    event_repo.update.side_effect = lambda current, changes: make_event(
        id=current.id,
        application_id=current.application_id,
        user_id=current.user_id,
        **changes,
    )
    return app_repo, event_repo


def _create_dto(**overrides) -> CreateTimelineEventDTO:
    data: dict = {
        'user_id': 1,
        'application_id': 800,
        'event_type': 'note',
        'event_date': date(2026, 7, 1),
    }
    data.update(overrides)
    return CreateTimelineEventDTO(**data)


def _update_dto(**overrides) -> UpdateTimelineEventDTO:
    data: dict = {'event_type': 'note', 'event_date': date(2026, 7, 2)}
    data.update(overrides)
    return UpdateTimelineEventDTO(**data)


def _events_of(caplog) -> list[str | None]:
    return [
        getattr(r, 'extra_data', {}).get('event')
        for r in caplog.records
        if hasattr(r, 'extra_data')
    ]


# --------------------------------------------------------------------------
# Guards: archived (422) before closed (409)
# --------------------------------------------------------------------------


def test_ensure_mutable_passes_on_an_open_application():
    ensure_mutable(make_application())


def test_ensure_mutable_refuses_archived_as_business_rule_violation():
    with pytest.raises(BusinessRuleViolation) as exc:
        ensure_mutable(make_application(cycle_id=9))
    assert str(exc.value) == ARCHIVED_MESSAGE


def test_ensure_mutable_refuses_closed_as_conflict_telling_to_reopen():
    with pytest.raises(ApplicationFinalized) as exc:
        ensure_mutable(make_application(finalized_at=CLOSED_AT))
    assert str(exc.value) == CLOSED_MESSAGE
    assert 'Reopen the application to edit it' in str(exc.value)


def test_ensure_mutable_reports_archived_first_when_both():
    """Reopening would not help an archived application: 422 wins."""
    with pytest.raises(BusinessRuleViolation):
        ensure_mutable(make_application(cycle_id=9, finalized_at=CLOSED_AT))


# --------------------------------------------------------------------------
# Rules (normalize_event)
# --------------------------------------------------------------------------


def test_interview_without_type_defaults_to_unknown():
    result = normalize_event(_update_dto(event_type='interview'))
    assert result.interview_type is InterviewType.UNKNOWN


@pytest.mark.parametrize('kind', list(InterviewType))
def test_interview_keeps_the_type_it_was_given(kind):
    result = normalize_event(
        _update_dto(event_type='interview', interview_type=kind)
    )
    assert result.interview_type is kind


@pytest.mark.parametrize('event_type', ['note', 'feedback', 'offer', 'denied'])
def test_interview_type_on_a_non_interview_is_refused(event_type):
    extra = OFFER_SALARY if event_type == 'offer' else {}
    with pytest.raises(BusinessRuleViolation) as exc:
        normalize_event(
            _update_dto(
                event_type=event_type, interview_type='technical', **extra
            )
        )
    assert str(exc.value) == INTERVIEW_TYPE_ONLY_ON_INTERVIEW


def test_denied_without_reason_defaults_to_unknown():
    result = normalize_event(_update_dto(event_type='denied'))
    assert result.denied_reason is DeniedReason.UNKNOWN


@pytest.mark.parametrize('reason', list(DeniedReason))
def test_denied_keeps_the_reason_it_was_given(reason):
    result = normalize_event(
        _update_dto(event_type='denied', denied_reason=reason)
    )
    assert result.denied_reason is reason


@pytest.mark.parametrize(
    'event_type', ['note', 'interview', 'feedback', 'offer']
)
def test_denied_reason_on_a_non_denied_is_refused(event_type):
    extra = OFFER_SALARY if event_type == 'offer' else {}
    with pytest.raises(BusinessRuleViolation) as exc:
        normalize_event(
            _update_dto(event_type=event_type, denied_reason='ghosted', **extra)
        )
    assert str(exc.value) == DENIED_REASON_ONLY_ON_DENIED


def test_denied_changed_to_note_must_drop_the_reason():
    """PRD 0008 edge case, symmetric to the offer/salary one below: the
    reason goes in the same change that moves the event away from denied."""
    with pytest.raises(BusinessRuleViolation):
        normalize_event(_update_dto(event_type='note', denied_reason='ghosted'))
    dropped = normalize_event(_update_dto(event_type='note'))
    assert dropped.denied_reason is None


def test_offer_with_the_salary_triple_is_valid():
    result = normalize_event(_update_dto(event_type='offer', **OFFER_SALARY))
    assert result.salary_amount == Decimal('150000.00')
    assert result.interview_type is None


@pytest.mark.parametrize(
    'missing', ['salary_amount', 'salary_currency', 'salary_period']
)
def test_offer_missing_any_salary_field_is_refused(missing):
    salary = {k: v for k, v in OFFER_SALARY.items() if k != missing}
    with pytest.raises(BusinessRuleViolation) as exc:
        normalize_event(_update_dto(event_type='offer', **salary))
    assert str(exc.value) == OFFER_NEEDS_SALARY


@pytest.mark.parametrize(
    'event_type', ['note', 'interview', 'feedback', 'denied']
)
@pytest.mark.parametrize('field', list(OFFER_SALARY))
def test_salary_on_a_non_offer_is_refused(event_type, field):
    with pytest.raises(BusinessRuleViolation) as exc:
        normalize_event(
            _update_dto(event_type=event_type, **{field: OFFER_SALARY[field]})
        )
    assert str(exc.value) == SALARY_ONLY_ON_OFFER


def test_offer_changed_to_interview_must_drop_the_salary():
    """PRD 0008 edge case: the salary goes in the same change."""
    with pytest.raises(BusinessRuleViolation):
        normalize_event(_update_dto(event_type='interview', **OFFER_SALARY))
    dropped = normalize_event(_update_dto(event_type='interview'))
    assert dropped.salary_amount is None


@pytest.mark.parametrize(
    'times', [{'start_time': time(9)}, {'end_time': time(10)}]
)
def test_start_and_end_come_together(times):
    with pytest.raises(BusinessRuleViolation) as exc:
        normalize_event(_update_dto(**times))
    assert str(exc.value) == TIMES_TOGETHER


@pytest.mark.parametrize(
    ('start', 'end'), [(time(10), time(10)), (time(11), time(10))]
)
def test_end_must_be_after_start(start, end):
    with pytest.raises(BusinessRuleViolation) as exc:
        normalize_event(_update_dto(start_time=start, end_time=end))
    assert str(exc.value) == END_AFTER_START


def test_a_scheduled_event_with_timezone_and_observation_is_valid():
    result = normalize_event(
        _update_dto(
            start_time=time(9),
            end_time=time(10, 30),
            timezone='America/Sao_Paulo',
            observation='Panel',
        )
    )
    assert (result.start_time, result.end_time) == (time(9), time(10, 30))
    assert result.timezone == 'America/Sao_Paulo'


async def test_no_date_order_rule_against_application_or_previous_event():
    """PRD 0008 "Assumptions": an event may predate the application."""
    app_repo, event_repo = _repos(
        application=make_application(id=800, application_date=date(2026, 7, 10))
    )
    result = await CreateTimelineEventUseCase(app_repo, event_repo).execute(
        _create_dto(event_date=date(2020, 1, 1))
    )
    assert result.event_date == date(2020, 1, 1)


# --------------------------------------------------------------------------
# CreateTimelineEventUseCase
# --------------------------------------------------------------------------


async def test_create_on_owned_app_persists_and_returns_dto():
    app_repo, event_repo = _repos()

    result = await CreateTimelineEventUseCase(app_repo, event_repo).execute(
        _create_dto()
    )

    app_repo.get_by_id_and_user_id.assert_awaited_once_with(800, 1)
    event_repo.create.assert_awaited_once()
    assert result.id == 700
    assert result.application_id == 800
    assert result.user_id == 1


async def test_create_stores_the_normalized_interview_type():
    app_repo, event_repo = _repos()

    result = await CreateTimelineEventUseCase(app_repo, event_repo).execute(
        _create_dto(event_type='interview')
    )

    values = event_repo.create.call_args.args[0]
    assert values['interview_type'] is InterviewType.UNKNOWN
    assert values['user_id'] == 1
    assert values['application_id'] == 800
    assert result.interview_type is InterviewType.UNKNOWN


async def test_create_on_missing_or_foreign_app_raises_not_found():
    app_repo, event_repo = _repos()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await CreateTimelineEventUseCase(app_repo, event_repo).execute(
            _create_dto()
        )
    event_repo.create.assert_not_called()


async def test_create_rejects_archived_app():
    app_repo, event_repo = _repos(application=make_application(cycle_id=9))

    with pytest.raises(BusinessRuleViolation) as exc:
        await CreateTimelineEventUseCase(app_repo, event_repo).execute(
            _create_dto()
        )
    assert str(exc.value) == ARCHIVED_MESSAGE
    event_repo.create.assert_not_called()


async def test_create_rejects_closed_app():
    app_repo, event_repo = _repos(
        application=make_application(finalized_at=CLOSED_AT)
    )

    with pytest.raises(ApplicationFinalized) as exc:
        await CreateTimelineEventUseCase(app_repo, event_repo).execute(
            _create_dto()
        )
    assert str(exc.value) == CLOSED_MESSAGE
    event_repo.create.assert_not_called()


async def test_create_refuses_invalid_event_before_writing():
    app_repo, event_repo = _repos()

    with pytest.raises(BusinessRuleViolation):
        await CreateTimelineEventUseCase(app_repo, event_repo).execute(
            _create_dto(event_type='note', interview_type='cultural')
        )
    event_repo.create.assert_not_called()


async def test_create_refuses_a_second_initial_screening():
    app_repo, event_repo = _repos(has_screening=True)

    with pytest.raises(ResourceConflict, match='initial screening'):
        await CreateTimelineEventUseCase(app_repo, event_repo).execute(
            _create_dto(
                event_type='interview', interview_type='initial_screening'
            )
        )
    event_repo.has_initial_screening.assert_awaited_once_with(
        800, exclude_id=None
    )
    event_repo.create.assert_not_called()


async def test_create_does_not_check_screenings_for_other_types():
    app_repo, event_repo = _repos(has_screening=True)

    await CreateTimelineEventUseCase(app_repo, event_repo).execute(
        _create_dto(event_type='interview', interview_type='technical')
    )
    event_repo.has_initial_screening.assert_not_called()


async def test_create_emits_created_audit_event(caplog):
    app_repo, event_repo = _repos()

    with caplog.at_level(logging.INFO, logger='app'):
        await CreateTimelineEventUseCase(app_repo, event_repo).execute(
            _create_dto()
        )

    assert 'timeline_event.created' in _events_of(caplog)


# --------------------------------------------------------------------------
# ListTimelineEventsUseCase
# --------------------------------------------------------------------------


async def test_list_on_owned_app_maps_rows_to_dtos():
    app_repo, event_repo = _repos()
    event_repo.list_by_application.return_value = [
        make_event(id=1),
        make_event(id=2),
    ]

    result = await ListTimelineEventsUseCase(app_repo, event_repo).execute(
        800, user_id=1
    )

    assert [dto.id for dto in result] == [1, 2]
    event_repo.list_by_application.assert_awaited_once_with(800)


async def test_list_on_foreign_app_raises_not_found():
    app_repo, event_repo = _repos()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await ListTimelineEventsUseCase(app_repo, event_repo).execute(
            800, user_id=1
        )
    event_repo.list_by_application.assert_not_called()


async def test_list_reads_a_closed_archived_application_without_guarding():
    app_repo, event_repo = _repos(
        application=make_application(finalized_at=CLOSED_AT, cycle_id=9)
    )
    event_repo.list_by_application.return_value = [make_event()]

    result = await ListTimelineEventsUseCase(app_repo, event_repo).execute(
        800, user_id=1
    )
    assert len(result) == 1


# --------------------------------------------------------------------------
# UpdateTimelineEventUseCase
# --------------------------------------------------------------------------


async def test_update_on_foreign_app_raises_not_found():
    app_repo, event_repo = _repos()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1, _update_dto()
        )
    event_repo.get_by_id_and_user_id.assert_not_called()
    event_repo.update.assert_not_called()


async def test_update_missing_event_raises_not_found():
    app_repo, event_repo = _repos(event=None)

    with pytest.raises(ResourceNotFound):
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1, _update_dto()
        )
    event_repo.get_by_id_and_user_id.assert_awaited_once_with(700, 800, 1)
    event_repo.update.assert_not_called()


async def test_update_rejects_archived_app():
    app_repo, event_repo = _repos(application=make_application(cycle_id=9))

    with pytest.raises(BusinessRuleViolation) as exc:
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1, _update_dto()
        )
    assert str(exc.value) == ARCHIVED_MESSAGE
    event_repo.update.assert_not_called()


async def test_update_rejects_closed_app():
    app_repo, event_repo = _repos(
        application=make_application(finalized_at=CLOSED_AT)
    )

    with pytest.raises(ApplicationFinalized) as exc:
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1, _update_dto()
        )
    assert str(exc.value) == CLOSED_MESSAGE
    event_repo.update.assert_not_called()


async def test_update_applies_full_replacement():
    app_repo, event_repo = _repos(event=make_event(application_id=800))

    result = await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
        700,
        800,
        1,
        _update_dto(event_type='interview', observation='rescheduled'),
    )

    _, changes = event_repo.update.call_args.args
    assert changes['event_type'] is EventType.INTERVIEW
    assert changes['interview_type'] is InterviewType.UNKNOWN
    assert changes['observation'] == 'rescheduled'
    # A PUT writes every field, so an omitted one is cleared.
    assert set(changes) == {
        'event_type',
        'interview_type',
        'denied_reason',
        'event_date',
        'start_time',
        'end_time',
        'timezone',
        'observation',
        'salary_amount',
        'salary_currency',
        'salary_period',
    }
    assert changes['timezone'] is None
    assert result.event_type is EventType.INTERVIEW


async def test_update_offer_to_interview_with_salary_is_refused():
    app_repo, event_repo = _repos(
        event=make_event(event_type=EventType.OFFER, **OFFER_SALARY)
    )

    with pytest.raises(BusinessRuleViolation):
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1, _update_dto(event_type='interview', **OFFER_SALARY)
        )
    event_repo.update.assert_not_called()


async def test_update_the_initial_screening_itself_is_not_a_second_one():
    app_repo, event_repo = _repos(
        event=make_event(
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
        ),
        has_screening=False,
    )

    await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
        700,
        800,
        1,
        _update_dto(event_type='interview', interview_type='initial_screening'),
    )

    event_repo.has_initial_screening.assert_awaited_once_with(
        800, exclude_id=700
    )
    event_repo.update.assert_awaited_once()


async def test_update_into_a_second_initial_screening_is_refused():
    app_repo, event_repo = _repos(event=make_event(), has_screening=True)

    with pytest.raises(ResourceConflict):
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700,
            800,
            1,
            _update_dto(
                event_type='interview', interview_type='initial_screening'
            ),
        )
    event_repo.update.assert_not_called()


async def test_update_emits_updated_audit_event(caplog):
    app_repo, event_repo = _repos(event=make_event())

    with caplog.at_level(logging.INFO, logger='app'):
        await UpdateTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1, _update_dto(observation='changed')
        )

    assert 'timeline_event.updated' in _events_of(caplog)


# --------------------------------------------------------------------------
# DeleteTimelineEventUseCase
# --------------------------------------------------------------------------


async def test_delete_on_foreign_app_raises_not_found():
    app_repo, event_repo = _repos()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await DeleteTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1
        )
    event_repo.delete.assert_not_called()


async def test_delete_missing_event_raises_not_found():
    app_repo, event_repo = _repos(event=None)

    with pytest.raises(ResourceNotFound):
        await DeleteTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1
        )
    event_repo.delete.assert_not_called()


async def test_delete_rejects_archived_app():
    app_repo, event_repo = _repos(application=make_application(cycle_id=9))

    with pytest.raises(BusinessRuleViolation):
        await DeleteTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1
        )
    event_repo.delete.assert_not_called()


async def test_delete_rejects_closed_app():
    app_repo, event_repo = _repos(
        application=make_application(finalized_at=CLOSED_AT)
    )

    with pytest.raises(ApplicationFinalized):
        await DeleteTimelineEventUseCase(app_repo, event_repo).execute(
            700, 800, 1
        )
    event_repo.delete.assert_not_called()


async def test_delete_happy_path_emits_audit_event(caplog):
    app_repo, event_repo = _repos(event=make_event(id=77))

    with caplog.at_level(logging.INFO, logger='app'):
        await DeleteTimelineEventUseCase(app_repo, event_repo).execute(
            77, 800, 1
        )

    event_repo.delete.assert_awaited_once()
    assert 'timeline_event.deleted' in _events_of(caplog)
