"""The 0.1.4 finalize body on the timeline (R-012, R-014, R-017), unit level.

Pinned: the checks in the steps version's order (future date 422, 404,
archived 422, closed 409, strict step 404, feedback 404), salary only on a
step mapped to offer (else 422), the terminal event of the mapped step with
the feedback name in its observation, decision (b)'s salary fill, and
``finalized_at`` = ``finalize_date`` 00:00 UTC. No Offer <-> Accepted rule.
"""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.dto.application import LegacyFinalizeApplicationDTO
from app.application.use_cases.compat.legacy_finalize import (
    ALREADY_FINALIZED,
    SALARY_ONLY_ON_OFFER_STEP,
    LegacyFinalizeApplicationUseCase,
    append_feedback,
)
from app.core.enums import Currency, EventType, InterviewType, SalaryPeriod
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    InvalidDate,
    ResourceConflict,
    ResourceNotFound,
)
from tests.unit.conftest import (
    make_application,
    make_event,
    make_model,
    make_read_model,
    make_step_definition,
)

OFFER = make_step_definition(
    id=5, name='Offer', strict=True, event_type=EventType.OFFER
)
DENIED = make_step_definition(
    id=6, name='Denied', strict=True, event_type=EventType.DENIED
)
ACCEPTED = make_model(id=200, name='Accepted', color='#00a800')
POSITION_FILLED = make_model(id=201, name='Position filled', color='#999')
DAY = date(2025, 8, 31)


def _use_case(application=None, step=OFFER, feedback=ACCEPTED, screening=False):
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = (
        make_application(id=10) if application is None else application
    )
    app_repo.update.side_effect = lambda app: app
    step_repo = AsyncMock()
    step_repo.get_by_id_strict_only.return_value = step
    feedback_repo = AsyncMock()
    feedback_repo.get_by_id.return_value = feedback
    timeline_repo = AsyncMock()
    timeline_repo.has_initial_screening.return_value = screening
    timeline_repo.create.side_effect = lambda values: make_event(id=1, **values)
    use_case = LegacyFinalizeApplicationUseCase(
        application_repo=app_repo,
        step_repo=step_repo,
        feedback_repo=feedback_repo,
        timeline_event_repo=timeline_repo,
        read_model=make_read_model(),
    )
    return use_case, app_repo, timeline_repo


def _body(**overrides) -> LegacyFinalizeApplicationDTO:
    data: dict = {'step_id': 5, 'feedback_id': 200, 'finalize_date': DAY}
    data.update(overrides)
    return LegacyFinalizeApplicationDTO(**data)


def test_append_feedback_matches_the_migration_convention():
    assert append_feedback(None, 'Accepted') == 'Feedback: Accepted'
    assert append_feedback('', 'Ghost') == 'Feedback: Ghost'
    assert (
        append_feedback('Great team', 'Accepted')
        == 'Great team\n\nFeedback: Accepted'
    )


async def test_offer_creates_terminal_event_and_closes():
    application = make_application(
        id=10, currency=Currency.EUR, salary_period=SalaryPeriod.ANNUALLY
    )
    use_case, app_repo, timeline_repo = _use_case(application)

    result = await use_case.execute(
        10, 1, _body(salary_offer=1234.5, observation='Great team')
    )

    values = timeline_repo.create.call_args.args[0]
    assert values['event_type'] is EventType.OFFER
    assert values['interview_type'] is None
    assert values['event_date'] == DAY
    assert values['observation'] == 'Great team\n\nFeedback: Accepted'
    assert values['salary_amount'] == Decimal('1234.5')
    assert values['salary_currency'] is Currency.EUR
    assert values['salary_period'] is SalaryPeriod.ANNUALLY
    assert values['user_id'] == 1
    assert values['application_id'] == 10
    written = app_repo.update.call_args.args[0]
    assert written.finalized_at == datetime(2025, 8, 31, tzinfo=UTC)
    assert result.finalized_at == datetime(2025, 8, 31, tzinfo=UTC)


async def test_offer_without_salary_gets_decision_b_fill():
    """Amount 0, currency USD, period monthly when the app has none."""
    use_case, _, timeline_repo = _use_case(make_application(id=10))

    await use_case.execute(10, 1, _body())

    values = timeline_repo.create.call_args.args[0]
    assert values['salary_amount'] == Decimal(0)
    assert values['salary_currency'] is Currency.USD
    assert values['salary_period'] is SalaryPeriod.MONTHLY


async def test_denied_with_any_feedback_no_offer_accepted_coupling():
    """R-012: Offer + a non-Accepted feedback, Denied + Accepted: both fine."""
    use_case, _, timeline_repo = _use_case(step=DENIED, feedback=ACCEPTED)
    await use_case.execute(10, 1, _body(step_id=6))
    values = timeline_repo.create.call_args.args[0]
    assert values['event_type'] is EventType.DENIED
    assert values['salary_amount'] is None
    assert values['observation'] == 'Feedback: Accepted'

    use_case, _, timeline_repo = _use_case(step=OFFER, feedback=POSITION_FILLED)
    await use_case.execute(10, 1, _body(feedback_id=201))
    assert timeline_repo.create.call_args.args[0]['event_type'] is (
        EventType.OFFER
    )


async def test_salary_on_a_step_that_is_not_an_offer_is_422():
    use_case, app_repo, timeline_repo = _use_case(step=DENIED)

    with pytest.raises(BusinessRuleViolation) as exc:
        await use_case.execute(10, 1, _body(step_id=6, salary_offer=10.0))
    assert str(exc.value) == SALARY_ONLY_ON_OFFER_STEP
    timeline_repo.create.assert_not_called()
    app_repo.update.assert_not_called()


async def test_already_closed_is_409():
    use_case, _, timeline_repo = _use_case(
        make_application(finalized_at=datetime(2026, 1, 1, tzinfo=UTC))
    )

    with pytest.raises(ApplicationFinalized) as exc:
        await use_case.execute(10, 1, _body())
    assert str(exc.value) == ALREADY_FINALIZED
    timeline_repo.create.assert_not_called()


async def test_archived_is_422_before_closed():
    use_case, _, _ = _use_case(
        make_application(
            cycle_id=3, finalized_at=datetime(2026, 1, 1, tzinfo=UTC)
        )
    )
    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await use_case.execute(10, 1, _body())


async def test_future_finalize_date_is_422_first():
    use_case, app_repo, _ = _use_case()
    with pytest.raises(InvalidDate):
        await use_case.execute(
            10, 1, _body(finalize_date=date.today() + timedelta(days=5))
        )
    app_repo.get_by_id_and_user_id.assert_not_called()


async def test_missing_application_is_404():
    use_case, app_repo, _ = _use_case()
    app_repo.get_by_id_and_user_id.return_value = None
    with pytest.raises(ResourceNotFound, match='Application'):
        await use_case.execute(10, 1, _body())


async def test_unknown_or_non_strict_step_is_404():
    use_case, _, timeline_repo = _use_case(step=None)
    with pytest.raises(ResourceNotFound, match='Step not found'):
        await use_case.execute(10, 1, _body())
    timeline_repo.create.assert_not_called()


async def test_unknown_feedback_is_404():
    use_case, _, timeline_repo = _use_case(feedback=None)
    with pytest.raises(ResourceNotFound, match='Feedback not found'):
        await use_case.execute(10, 1, _body())
    timeline_repo.create.assert_not_called()


async def test_strict_step_mapped_to_initial_screening_respects_r030():
    screening = make_step_definition(
        id=9,
        name='Screened out',
        strict=True,
        event_type=EventType.INTERVIEW,
        interview_type=InterviewType.INITIAL_SCREENING,
    )
    use_case, _, timeline_repo = _use_case(step=screening, screening=True)
    with pytest.raises(ResourceConflict):
        await use_case.execute(10, 1, _body(step_id=9))
    timeline_repo.create.assert_not_called()
