"""The deprecated /steps routes on the timeline (R-015, R-016), unit level.

Pinned: add maps a non-strict step to its event (strict 404, offer gets
decision (b)'s salary); edit with the event's own reverse step keeps the
event as it is (0.1.4 ``steps edit`` without ``--step``), edit with another
step re-maps it (offer <-> other handles the salary); list shows every
event as its reverse step; the guards and R-030 apply as on the timeline.
"""

from datetime import UTC, date, datetime, time
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.dto.legacy_step import LegacyStepWriteDTO
from app.application.use_cases.compat.legacy_steps import (
    CreateLegacyStepUseCase,
    DeleteLegacyStepUseCase,
    ListLegacyStepsUseCase,
    UpdateLegacyStepUseCase,
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
from tests.unit.conftest import (
    make_application,
    make_event,
    make_step_definition,
)

IV = EventType.INTERVIEW
SCREEN = make_step_definition(
    id=1,
    name='Initial Screen',
    event_type=IV,
    interview_type=InterviewType.INITIAL_SCREENING,
)
PHASE_2 = make_step_definition(
    id=2, name='Phase 2', event_type=IV, interview_type=InterviewType.UNKNOWN
)
PHASE_3 = make_step_definition(
    id=3, name='Phase 3', event_type=IV, interview_type=InterviewType.UNKNOWN
)
OFFER = make_step_definition(
    id=5, name='Offer', strict=True, event_type=EventType.OFFER
)
LOOSE_OFFER = make_step_definition(
    id=7, name='Verbal offer', strict=False, event_type=EventType.OFFER
)
CATALOG = [SCREEN, PHASE_2, PHASE_3, OFFER, LOOSE_OFFER]
# A catalog WITH 'Denied', for the denied_reason preservation tests below -
# kept separate from CATALOG so ``test_list_shows_every_event_as_its_
# reverse_step`` still proves the "no matching name" fallback.
DENIED = make_step_definition(
    id=6, name='Denied', strict=True, event_type=EventType.DENIED
)
CATALOG_WITH_DENIED = [*CATALOG, DENIED]
SALARY = {
    'salary_amount': Decimal('9000.00'),
    'salary_currency': Currency.GBP,
    'salary_period': SalaryPeriod.ANNUALLY,
}


def _repos(application=None, event=None, screening=False, catalog=CATALOG):
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = (
        make_application(id=10) if application is None else application
    )
    step_repo = AsyncMock()
    step_repo.get_all.return_value = catalog
    step_repo.get_by_id_non_strict_only.side_effect = lambda sid: next(
        (s for s in catalog if s.id == sid and not s.strict), None
    )
    timeline_repo = AsyncMock()
    timeline_repo.get_by_id_and_user_id.return_value = event
    timeline_repo.has_initial_screening.return_value = screening
    timeline_repo.create.side_effect = lambda values: make_event(
        id=500, **values
    )
    timeline_repo.update.side_effect = lambda current, changes: make_event(
        id=current.id,
        application_id=current.application_id,
        user_id=current.user_id,
        **changes,
    )
    return app_repo, step_repo, timeline_repo


def _body(**overrides) -> LegacyStepWriteDTO:
    data: dict = {'step_id': 2, 'step_date': date(2025, 12, 5)}
    data.update(overrides)
    return LegacyStepWriteDTO(**data)


# -- Add -----------------------------------------------------------------------


async def test_add_maps_the_step_and_echoes_it():
    repos = _repos()
    result = await CreateLegacyStepUseCase(*repos).execute(
        10,
        1,
        _body(
            step_id=3,
            start_time=time(9),
            end_time=time(10),
            timezone='UTC',
            observation='Tech',
        ),
    )

    values = repos[2].create.call_args.args[0]
    assert (values['event_type'], values['interview_type']) == (
        IV,
        InterviewType.UNKNOWN,
    )
    assert values['event_date'] == date(2025, 12, 5)
    assert (result.step_id, result.step_name) == (3, 'Phase 3')
    assert result.id == 500
    assert (result.start_time, result.timezone) == (time(9), 'UTC')
    assert result.observation == 'Tech'


async def test_add_strict_step_is_404_as_today():
    repos = _repos()
    with pytest.raises(ResourceNotFound, match='Step not found'):
        await CreateLegacyStepUseCase(*repos).execute(10, 1, _body(step_id=5))
    repos[2].create.assert_not_called()


async def test_add_offer_step_gets_decision_b_salary():
    repos = _repos(
        application=make_application(
            id=10, currency=Currency.BRL, salary_period=SalaryPeriod.HOURLY
        )
    )
    await CreateLegacyStepUseCase(*repos).execute(10, 1, _body(step_id=7))
    values = repos[2].create.call_args.args[0]
    assert values['event_type'] is EventType.OFFER
    assert values['salary_amount'] == Decimal(0)
    assert values['salary_currency'] is Currency.BRL
    assert values['salary_period'] is SalaryPeriod.HOURLY


async def test_add_non_interview_step_with_times_drops_them_never_422():
    """KODI-016 (R-038/R-039): a 0.1.4 client always sends
    start_time/end_time/timezone; a step mapping to a non-interview event
    stores none of them, silently - never a 422
    (``.claude/rules/cli-compatibility.md``)."""
    repos = _repos()
    result = await CreateLegacyStepUseCase(*repos).execute(
        10,
        1,
        _body(
            step_id=7,  # Verbal offer -> offer, not interview.
            start_time=time(9),
            end_time=time(10),
            timezone='UTC',
        ),
    )

    values = repos[2].create.call_args.args[0]
    assert values['event_type'] is EventType.OFFER
    assert 'start_time' not in values or values['start_time'] is None
    assert 'end_time' not in values or values['end_time'] is None
    assert 'timezone' not in values or values['timezone'] is None
    assert result.start_time is None
    assert result.end_time is None
    assert result.timezone is None


async def test_add_second_initial_screening_is_409():
    repos = _repos(screening=True)
    with pytest.raises(ResourceConflict):
        await CreateLegacyStepUseCase(*repos).execute(10, 1, _body(step_id=1))


async def test_add_on_closed_is_409_and_on_archived_422():
    repos = _repos(
        application=make_application(
            finalized_at=datetime(2026, 1, 1, tzinfo=UTC)
        )
    )
    with pytest.raises(ApplicationFinalized, match='Reopen'):
        await CreateLegacyStepUseCase(*repos).execute(10, 1, _body())
    repos = _repos(application=make_application(cycle_id=4))
    with pytest.raises(BusinessRuleViolation, match='archived'):
        await CreateLegacyStepUseCase(*repos).execute(10, 1, _body())


async def test_add_on_foreign_application_is_404():
    repos = _repos()
    repos[0].get_by_id_and_user_id.return_value = None
    with pytest.raises(ResourceNotFound):
        await CreateLegacyStepUseCase(*repos).execute(10, 1, _body())


# -- Edit ----------------------------------------------------------------------


@pytest.mark.parametrize(
    ('event_type', 'interview_type', 'salary', 'reverse_id'),
    [
        (IV, InterviewType.UNKNOWN, {}, 2),
        (IV, InterviewType.TECHNICAL, {}, 2),
        (EventType.OFFER, None, SALARY, 5),
    ],
)
async def test_edit_with_its_own_reverse_step_keeps_the_event(
    event_type, interview_type, salary, reverse_id
):
    """0.1.4 `steps edit` without --step resends the listed step_id."""
    event = make_event(
        id=42,
        application_id=10,
        event_type=event_type,
        interview_type=interview_type,
        **salary,
    )
    repos = _repos(event=event)

    result = await UpdateLegacyStepUseCase(*repos).execute(
        42, 10, 1, _body(step_id=reverse_id, observation='moved')
    )

    changes = repos[2].update.call_args.args[1]
    assert changes['event_type'] is event_type
    assert changes['interview_type'] is interview_type
    for field, value in salary.items():
        assert changes[field] == value
    assert changes['observation'] == 'moved'
    assert result.step_id == reverse_id


async def test_edit_with_another_step_remaps_it():
    event = make_event(id=42, application_id=10)
    repos = _repos(event=event)

    result = await UpdateLegacyStepUseCase(*repos).execute(
        42, 10, 1, _body(step_id=1)
    )

    changes = repos[2].update.call_args.args[1]
    assert changes['interview_type'] is InterviewType.INITIAL_SCREENING
    assert (result.step_id, result.step_name) == (1, 'Initial Screen')


async def test_edit_offer_to_interview_drops_the_salary():
    event = make_event(
        id=42, application_id=10, event_type=EventType.OFFER, **SALARY
    )
    repos = _repos(event=event)

    await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body(step_id=3))

    changes = repos[2].update.call_args.args[1]
    assert changes['event_type'] is IV
    assert changes['salary_amount'] is None
    assert changes['salary_currency'] is None


async def test_edit_interview_to_a_non_interview_step_drops_the_schedule():
    """KODI-016 (R-038/R-039): same as the create path - never a 422, the
    schedule is silently dropped once the event stops being an interview."""
    event = make_event(
        id=42,
        application_id=10,
        event_type=IV,
        interview_type=InterviewType.TECHNICAL,
        start_time=time(9),
        end_time=time(10),
        timezone='UTC',
    )
    repos = _repos(event=event)

    result = await UpdateLegacyStepUseCase(*repos).execute(
        42,
        10,
        1,
        _body(
            step_id=7,  # Verbal offer -> offer, not interview.
            start_time=time(9),
            end_time=time(10),
            timezone='UTC',
        ),
    )

    changes = repos[2].update.call_args.args[1]
    assert changes['event_type'] is EventType.OFFER
    assert 'start_time' not in changes or changes['start_time'] is None
    assert 'end_time' not in changes or changes['end_time'] is None
    assert 'timezone' not in changes or changes['timezone'] is None
    assert result.start_time is None
    assert result.end_time is None
    assert result.timezone is None


async def test_edit_offer_to_another_offer_step_keeps_the_salary():
    event = make_event(
        id=42, application_id=10, event_type=EventType.OFFER, **SALARY
    )
    repos = _repos(event=event)

    await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body(step_id=7))

    changes = repos[2].update.call_args.args[1]
    assert changes['salary_amount'] == Decimal('9000.00')


async def test_edit_denied_with_its_own_reverse_step_keeps_the_reason():
    """KODI-014, symmetric to the offer/salary case above: a 0.1.4 `steps
    edit` without `--step` resending the event's own (strict) reverse step
    keeps its denied_reason too."""
    event = make_event(
        id=42,
        application_id=10,
        event_type=EventType.DENIED,
        denied_reason=DeniedReason.TOO_MANY_CANDIDATES,
    )
    repos = _repos(event=event, catalog=CATALOG_WITH_DENIED)

    await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body(step_id=6))

    changes = repos[2].update.call_args.args[1]
    assert changes['event_type'] is EventType.DENIED
    assert changes['denied_reason'] is DeniedReason.TOO_MANY_CANDIDATES


async def test_edit_denied_to_interview_drops_the_reason():
    event = make_event(
        id=42,
        application_id=10,
        event_type=EventType.DENIED,
        denied_reason=DeniedReason.TOO_MANY_CANDIDATES,
    )
    repos = _repos(event=event, catalog=CATALOG_WITH_DENIED)

    await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body(step_id=3))

    changes = repos[2].update.call_args.args[1]
    assert changes['event_type'] is IV
    assert changes['denied_reason'] is None


async def test_edit_interview_to_offer_step_fills_decision_b():
    event = make_event(id=42, application_id=10)
    repos = _repos(event=event)

    await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body(step_id=7))

    changes = repos[2].update.call_args.args[1]
    assert changes['salary_amount'] == Decimal(0)
    assert changes['salary_currency'] is Currency.USD
    assert changes['salary_period'] is SalaryPeriod.MONTHLY


async def test_edit_to_a_strict_step_that_is_not_its_own_is_404():
    event = make_event(id=42, application_id=10)
    repos = _repos(event=event)
    with pytest.raises(ResourceNotFound, match='Step not found'):
        await UpdateLegacyStepUseCase(*repos).execute(
            42, 10, 1, _body(step_id=5)
        )


async def test_edit_missing_event_is_404():
    repos = _repos(event=None)
    with pytest.raises(ResourceNotFound, match='Application step not found'):
        await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body())


async def test_edit_on_closed_application_is_409():
    repos = _repos(
        application=make_application(
            finalized_at=datetime(2026, 1, 1, tzinfo=UTC)
        ),
        event=make_event(id=42),
    )
    with pytest.raises(ApplicationFinalized):
        await UpdateLegacyStepUseCase(*repos).execute(42, 10, 1, _body())


# -- List / delete -------------------------------------------------------------------


async def test_list_shows_every_event_as_its_reverse_step():
    repos = _repos()
    repos[2].list_by_application.return_value = [
        make_event(id=1),  # interview/unknown, a former note
        make_event(
            id=2, event_type=IV, interview_type=InterviewType.INITIAL_SCREENING
        ),
        make_event(id=3, event_type=EventType.OFFER, **SALARY),
        make_event(id=4, event_type=EventType.DENIED),
    ]

    result = await ListLegacyStepsUseCase(*repos).execute(10, 1)

    assert [(r.id, r.step_id, r.step_name) for r in result] == [
        (1, 2, 'Phase 2'),
        (2, 1, 'Initial Screen'),
        (3, 5, 'Offer'),
        # No 'Denied' row in this catalog: first non-strict row.
        (4, 1, 'Initial Screen'),
    ]


async def test_list_of_an_empty_timeline_reads_no_catalog():
    repos = _repos()
    repos[2].list_by_application.return_value = []
    assert await ListLegacyStepsUseCase(*repos).execute(10, 1) == []
    repos[1].get_all.assert_not_called()


async def test_delete_goes_through_the_timeline_guards():
    repos = _repos(event=make_event(id=42))
    await DeleteLegacyStepUseCase(*repos).execute(42, 10, 1)
    repos[2].delete.assert_awaited_once()

    repos = _repos(application=make_application(cycle_id=1))
    with pytest.raises(BusinessRuleViolation):
        await DeleteLegacyStepUseCase(*repos).execute(42, 10, 1)
