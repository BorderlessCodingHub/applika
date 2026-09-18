"""Finalize (close) and the archived guard, unit level (R-007, R-009, R-011).

Ported from mynextjob's ``test_application_finalize_reopen_use_cases.py``
(the finalize half and the ``ensure_not_archived`` guard), adapted to
applika's deltas: the archived lock is a ``BusinessRuleViolation`` (422)
and finalize answers the ``Application`` read model. The reopen half is
``test_reopen_application.py``; the 0.1.4 body is ``test_legacy_finalize.py``.

Pinned:
1. finalize stamps ``finalized_at`` (open -> closed), server-side, UTC;
2. finalizing a closed application is a no-op: no write, no 409, the
   original ``finalized_at`` kept;
3. archived (``cycle_id`` set) is refused, no write;
4. no outcome coupling: ``finalized_at`` is the only field finalize touches;
5. a missing or foreign application is a 404;
6. a real finalize is logged as ``application.finalized``, a no-op is not.
"""

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from app.application.dto.application import FinalizeOutcomeDTO
from app.application.use_cases.applications.finalize_application import (
    FinalizeApplicationUseCase,
    FinalizeApplicationWithOutcomeUseCase,
)
from app.application.use_cases.applications.guards import (
    ARCHIVED_MESSAGE,
    CLOSED_MESSAGE,
    ensure_not_archived,
)
from app.application.use_cases.timeline_events.rules import (
    OFFER_PERIOD_INVALID,
)
from app.core.enums import Currency, EventType, SalaryPeriod
from app.core.exceptions import (
    ApplicationFinalized,
    BusinessRuleViolation,
    InvalidDate,
    ResourceNotFound,
)
from tests.unit.conftest import (
    make_application,
    make_event,
    make_read_model,
    make_step_definition,
)


def _events(caplog) -> list[str | None]:
    return [
        getattr(record, 'extra_data', {}).get('event')
        for record in caplog.records
        if hasattr(record, 'extra_data')
    ]


# --------------------------------------------------------------------------
# ensure_not_archived: the only lock on a lifecycle transition
# --------------------------------------------------------------------------


def test_ensure_not_archived_passes_for_open_application():
    ensure_not_archived(make_application())


def test_ensure_not_archived_passes_for_closed_application():
    """A closed application is not blocked: reopen must work on it."""
    ensure_not_archived(
        make_application(finalized_at=datetime(2026, 7, 2, tzinfo=UTC))
    )


def test_ensure_not_archived_rejects_archived_application():
    with pytest.raises(BusinessRuleViolation) as exc:
        ensure_not_archived(make_application(cycle_id=999))
    assert str(exc.value) == ARCHIVED_MESSAGE


# --------------------------------------------------------------------------
# FinalizeApplicationUseCase
# --------------------------------------------------------------------------


async def test_finalize_sets_finalized_at_on_open_application():
    app_repo = AsyncMock()
    application = make_application(finalized_at=None)
    app_repo.get_by_id_and_user_id.return_value = application
    stamped = datetime(2026, 7, 3, 9, 0, tzinfo=UTC)
    app_repo.update.return_value = make_application(finalized_at=stamped)

    before = datetime.now(UTC)
    result = await FinalizeApplicationUseCase(
        app_repo, make_read_model()
    ).execute(123, user_id=1)
    after = datetime.now(UTC)

    app_repo.get_by_id_and_user_id.assert_awaited_once_with(123, 1)
    written = app_repo.update.call_args.args[0]
    assert before <= written.finalized_at <= after
    assert written.finalized_at.tzinfo is not None
    assert result.finalized_at == stamped
    assert result.finalized is True


async def test_finalize_only_touches_finalized_at_no_outcome_coupling():
    """R-007/R-012: no step, feedback or salary is asked for or written."""
    app_repo = AsyncMock()
    application = make_application(finalized_at=None)
    snapshot = dict(vars(application))
    app_repo.get_by_id_and_user_id.return_value = application
    app_repo.update.return_value = make_application(
        finalized_at=datetime(2026, 7, 3, tzinfo=UTC)
    )

    await FinalizeApplicationUseCase(app_repo, make_read_model()).execute(
        123, user_id=1
    )

    written = vars(app_repo.update.call_args.args[0])
    changed = {key for key in written if written[key] != snapshot.get(key)}
    assert changed == {'finalized_at'}


async def test_finalize_idempotent_on_already_closed_no_write_no_conflict(
    caplog,
):
    existing_stamp = datetime(2026, 7, 1, tzinfo=UTC)
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(
        finalized_at=existing_stamp
    )

    with caplog.at_level(logging.INFO, logger='app'):
        result = await FinalizeApplicationUseCase(
            app_repo, make_read_model()
        ).execute(123, user_id=1)

    assert result.finalized_at == existing_stamp
    assert result.finalized is True
    app_repo.update.assert_not_called()
    assert 'application.finalized' not in _events(caplog)


async def test_finalize_missing_or_foreign_raises_not_found():
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await FinalizeApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )
    app_repo.update.assert_not_called()


async def test_finalize_rejects_archived_application():
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(cycle_id=7)

    with pytest.raises(BusinessRuleViolation) as exc:
        await FinalizeApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )
    assert str(exc.value) == ARCHIVED_MESSAGE
    app_repo.update.assert_not_called()


async def test_finalize_rejects_archived_even_when_closed():
    """Archived wins over the no-op: a closed app in a cycle is frozen."""
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application(
        cycle_id=7, finalized_at=datetime(2026, 7, 1, tzinfo=UTC)
    )

    with pytest.raises(BusinessRuleViolation):
        await FinalizeApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )


async def test_finalize_emits_finalized_audit_event(caplog):
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = make_application()
    app_repo.update.return_value = make_application(
        finalized_at=datetime(2026, 7, 3, tzinfo=UTC)
    )

    with caplog.at_level(logging.INFO, logger='app'):
        await FinalizeApplicationUseCase(app_repo, make_read_model()).execute(
            123, user_id=1
        )

    assert 'application.finalized' in _events(caplog)


async def test_finalize_returns_the_legacy_fields_from_the_timeline():
    """R-019 through the read model: last step, salary offer, no feedback."""
    application = make_application(id=123)
    offer = make_event(
        application_id=123,
        event_type=EventType.OFFER,
        salary_amount=Decimal('5000.00'),
        salary_currency=Currency.EUR,
        salary_period=SalaryPeriod.MONTHLY,
    )
    read_model = make_read_model(
        latest={123: offer},
        offers={123: offer},
        catalog=[
            make_step_definition(
                id=5, name='Offer', color='#00ff00', strict=True
            )
        ],
    )
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = application
    app_repo.update.return_value = make_application(
        id=123, finalized_at=datetime(2026, 7, 3, tzinfo=UTC)
    )

    result = await FinalizeApplicationUseCase(app_repo, read_model).execute(
        123, user_id=1
    )

    assert result.last_step is not None
    assert (result.last_step.id, result.last_step.name) == (5, 'Offer')
    assert result.last_step.date == offer.event_date
    assert result.salary_offer == 5000.0
    assert result.feedback is None


# --------------------------------------------------------------------------
# FinalizeApplicationWithOutcomeUseCase (R-032)
# --------------------------------------------------------------------------


def _mimic_finalized_property(app):
    """``ApplicationModel.finalized`` is a property over ``finalized_at``;
    the test double is a plain ``SimpleNamespace``, so mutating
    ``finalized_at`` in place needs a hand to keep ``finalized`` in sync."""
    app.finalized = app.finalized_at is not None
    return app


def _outcome_use_case(application=None):
    app_repo = AsyncMock()
    app_repo.get_by_id_and_user_id.return_value = (
        make_application(id=10) if application is None else application
    )
    app_repo.update.side_effect = _mimic_finalized_property
    timeline_repo = AsyncMock()
    timeline_repo.create.side_effect = lambda values: make_event(id=1, **values)
    use_case = FinalizeApplicationWithOutcomeUseCase(
        application_repo=app_repo,
        timeline_event_repo=timeline_repo,
        read_model=make_read_model(),
    )
    return use_case, app_repo, timeline_repo


def _offer_dto(**overrides) -> FinalizeOutcomeDTO:
    data: dict = {
        'outcome': 'offer',
        'event_date': date(2026, 1, 5),
        'observation': 'Great offer',
        'salary_amount': Decimal('9500.00'),
        'salary_currency': Currency.EUR,
        'salary_period': SalaryPeriod.MONTHLY,
    }
    data.update(overrides)
    return FinalizeOutcomeDTO(**data)


async def test_offer_outcome_creates_event_and_closes_atomically():
    application = make_application(id=10)
    use_case, app_repo, timeline_repo = _outcome_use_case(application)

    result = await use_case.execute(10, 1, _offer_dto())

    values = timeline_repo.create.call_args.args[0]
    assert values['event_type'] is EventType.OFFER
    assert values['interview_type'] is None
    assert values['event_date'] == date(2026, 1, 5)
    assert values['observation'] == 'Great offer'
    assert values['salary_amount'] == Decimal('9500.00')
    assert values['salary_currency'] is Currency.EUR
    assert values['salary_period'] is SalaryPeriod.MONTHLY
    assert values['user_id'] == 1
    assert values['application_id'] == 10
    written = app_repo.update.call_args.args[0]
    assert written.finalized_at is not None
    assert result.finalized is True
    assert result.finalized_at is not None


async def test_denied_outcome_creates_event_without_salary():
    use_case, _, timeline_repo = _outcome_use_case()

    await use_case.execute(
        10,
        1,
        FinalizeOutcomeDTO(outcome='denied', event_date=date(2026, 1, 5)),
    )

    values = timeline_repo.create.call_args.args[0]
    assert values['event_type'] is EventType.DENIED
    assert values['interview_type'] is None
    assert values['salary_amount'] is None
    assert values['salary_currency'] is None
    assert values['salary_period'] is None


async def test_offer_outcome_missing_salary_triad_is_422():
    """Defense in depth: normalize_event refuses it even though the
    presentation schema already requires the triad on an offer outcome."""
    use_case, app_repo, timeline_repo = _outcome_use_case()

    with pytest.raises(BusinessRuleViolation):
        await use_case.execute(
            10, 1, FinalizeOutcomeDTO(outcome='offer', event_date=date.today())
        )
    timeline_repo.create.assert_not_called()
    app_repo.update.assert_not_called()


async def test_offer_outcome_hourly_period_is_422():
    """Defense in depth (KODI-011 remediation round 1, R-032):
    ``ensure_offer_period_allowed`` refuses ``hourly`` even though the
    presentation schema already restricts an offer outcome's
    ``salary_period`` to monthly/annually - the same restriction the
    timeline write schema enforces, so this offer event is never valid
    through ``/finalize`` and refused through ``/timeline``, or the
    reverse."""
    use_case, app_repo, timeline_repo = _outcome_use_case()

    with pytest.raises(BusinessRuleViolation, match=OFFER_PERIOD_INVALID):
        await use_case.execute(
            10, 1, _offer_dto(salary_period=SalaryPeriod.HOURLY)
        )
    timeline_repo.create.assert_not_called()
    app_repo.update.assert_not_called()


async def test_salary_on_denied_outcome_is_422():
    """Defense in depth: the presentation schema already refuses this."""
    use_case, app_repo, timeline_repo = _outcome_use_case()

    with pytest.raises(BusinessRuleViolation):
        await use_case.execute(
            10,
            1,
            FinalizeOutcomeDTO(
                outcome='denied',
                salary_amount=Decimal('10'),
                salary_currency=Currency.USD,
                salary_period=SalaryPeriod.MONTHLY,
            ),
        )
    timeline_repo.create.assert_not_called()
    app_repo.update.assert_not_called()


async def test_outcome_event_date_defaults_to_today():
    use_case, _, timeline_repo = _outcome_use_case()

    before = datetime.now(UTC).date()
    await use_case.execute(10, 1, FinalizeOutcomeDTO(outcome='denied'))
    after = datetime.now(UTC).date()

    event_date = timeline_repo.create.call_args.args[0]['event_date']
    assert before <= event_date <= after


async def test_outcome_future_event_date_is_422():
    use_case, app_repo, timeline_repo = _outcome_use_case()
    future = date.today() + timedelta(days=5)

    with pytest.raises(InvalidDate):
        await use_case.execute(
            10, 1, FinalizeOutcomeDTO(outcome='denied', event_date=future)
        )
    timeline_repo.create.assert_not_called()
    app_repo.update.assert_not_called()


async def test_outcome_on_already_closed_application_is_409():
    use_case, _, timeline_repo = _outcome_use_case(
        make_application(id=10, finalized_at=datetime(2026, 1, 1, tzinfo=UTC))
    )

    with pytest.raises(ApplicationFinalized) as exc:
        await use_case.execute(10, 1, _offer_dto())
    assert str(exc.value) == CLOSED_MESSAGE
    timeline_repo.create.assert_not_called()


async def test_outcome_on_archived_application_is_422_before_closed():
    use_case, _, timeline_repo = _outcome_use_case(
        make_application(
            id=10, cycle_id=3, finalized_at=datetime(2026, 1, 1, tzinfo=UTC)
        )
    )

    with pytest.raises(BusinessRuleViolation, match='archived cycle'):
        await use_case.execute(10, 1, _offer_dto())
    timeline_repo.create.assert_not_called()


async def test_outcome_missing_application_is_404():
    use_case, app_repo, timeline_repo = _outcome_use_case()
    app_repo.get_by_id_and_user_id.return_value = None

    with pytest.raises(ResourceNotFound):
        await use_case.execute(10, 1, _offer_dto())
    timeline_repo.create.assert_not_called()


async def test_outcome_write_is_atomic_event_failure_leaves_app_unwritten():
    """If the event insert fails, ``finalized_at`` is never committed.

    Mirrors ``LegacyFinalizeApplicationUseCase``: both repositories share
    the request's session, so ``timeline_event_repo.create``'s commit is
    what persists ``finalized_at`` too - a failed create means
    ``application_repo.update`` (called only after ``create`` returns) is
    never reached, and nothing the use case did was ever flushed.
    """
    use_case, app_repo, timeline_repo = _outcome_use_case()
    timeline_repo.create.side_effect = RuntimeError('boom')

    with pytest.raises(RuntimeError):
        await use_case.execute(10, 1, _offer_dto())

    app_repo.update.assert_not_called()


async def test_outcome_finalize_emits_finalized_audit_event(caplog):
    use_case, _, _ = _outcome_use_case()

    with caplog.at_level(logging.INFO, logger='app'):
        await use_case.execute(10, 1, _offer_dto())

    assert 'application.finalized' in _events(caplog)
