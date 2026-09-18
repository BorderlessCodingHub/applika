"""POST /applications/{id}/finalize with both bodies, and /reopen
(R-007..R-012, R-017, R-019, R-020).

* No body (or ``{}``/``null``): the new reversible close. 200, idempotent,
  only ``finalized_at`` changes, no Deprecation header.
* The 0.1.4 body ``{step_id, feedback_id, finalize_date, salary_offer?,
  observation?}``: deprecated but working for installed CLIs. 201, the
  outcome written as the mapped step's timeline event with the feedback
  name in its observation, ``Deprecation`` on every answer, 409 on a closed
  application, no Offer <-> Accepted coupling.

The new-body half is ported from mynextjob's
``test_application_finalize_reopen_api.py`` with applika's codes (archived
422, not 409).
"""

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Currency, EventType, InterviewType, SalaryPeriod
from app.domain.models import ApplicationModel, CycleModel, TimelineEventModel
from app.main import app as main_app
from app.presentation.deprecation import DEPRECATION_VALUE
from tests import msg
from tests.integration import timeline_seed as ts


def _legacy_body(**overrides) -> dict:
    body: dict = {
        'step_id': str(ts.STEP_OFFER),
        'feedback_id': str(ts.FB_ACCEPTED),
        'finalize_date': '2025-12-15',
    }
    body.update(overrides)
    return body


async def _events(db_session: AsyncSession, app_id: int = ts.APP_ID):
    db_session.expire_all()
    rows = await db_session.scalars(
        select(TimelineEventModel)
        .where(TimelineEventModel.application_id == app_id)
        .order_by(TimelineEventModel.event_date, TimelineEventModel.id)
    )
    return list(rows.all())


async def _application(db_session: AsyncSession, app_id: int = ts.APP_ID):
    db_session.expire_all()
    row = await db_session.get(ApplicationModel, app_id)
    assert row is not None
    return row


def _deprecated(response) -> None:
    assert response.headers.get('Deprecation') == DEPRECATION_VALUE
    assert 'Sunset' not in response.headers


# ===========================================================================
# New finalize (no body) and reopen
# ===========================================================================


async def test_finalize_without_body_sets_finalized_at_then_reopen_clears_it(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    before = datetime.now(UTC)
    closed = await async_client.post('/applications/1/finalize')

    assert closed.status_code == 200, closed.text
    assert 'Deprecation' not in closed.headers
    body = closed.json()
    assert body['finalized'] is True
    finalized_at = datetime.fromisoformat(body['finalized_at'])
    assert before - timedelta(seconds=5) <= finalized_at
    assert finalized_at <= datetime.now(UTC) + timedelta(seconds=5)

    reopened = await async_client.post('/applications/1/reopen')

    assert reopened.status_code == 200
    assert reopened.json()['finalized'] is False
    assert reopened.json()['finalized_at'] is None
    assert (await _application(db_session)).finalized_at is None


async def test_finalize_with_empty_object_or_null_is_the_new_finalize(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    first = await async_client.post('/applications/1/finalize', json={})
    await async_client.post('/applications/1/reopen')
    second = await async_client.post(
        '/applications/1/finalize',
        content=b'null',
        headers={'Content-Type': 'application/json'},
    )

    assert (first.status_code, second.status_code) == (200, 200)
    assert 'Deprecation' not in first.headers
    assert await _events(db_session) == []


async def test_finalize_is_idempotent_and_preserves_the_timestamp(
    async_client: AsyncClient, db_session: AsyncSession
):
    stamp = datetime(2025, 12, 20, 8, 0, tzinfo=UTC)
    await ts.seed_open_application(db_session, finalized_at=stamp)

    response = await async_client.post('/applications/1/finalize')

    assert response.status_code == 200
    assert datetime.fromisoformat(response.json()['finalized_at']) == stamp
    assert (await _application(db_session)).finalized_at == stamp


async def test_reopen_is_idempotent_on_an_open_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post('/applications/1/reopen')

    assert response.status_code == 200
    assert response.json()['finalized_at'] is None


async def test_edit_blocked_while_closed_then_succeeds_after_reopen(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PRD 0008 edge case, through the real endpoints."""
    await ts.seed_open_application(db_session)
    note = {'event_type': 'note', 'event_date': '2025-12-05'}
    created = await async_client.post('/applications/1/timeline', json=note)
    event_id = created.json()['id']

    await async_client.post('/applications/1/finalize')
    refused = await async_client.post('/applications/1/timeline', json=note)
    put = await async_client.put(
        f'/applications/1/timeline/{event_id}', json=note
    )
    delete = await async_client.delete(f'/applications/1/timeline/{event_id}')
    assert (refused.status_code, put.status_code, delete.status_code) == (
        409,
        409,
        409,
    )
    assert 'Reopen the application to edit it' in refused.json()['detail']

    await async_client.post('/applications/1/reopen')
    accepted = await async_client.post('/applications/1/timeline', json=note)
    assert accepted.status_code == 201
    put = await async_client.put(
        f'/applications/1/timeline/{event_id}', json=note
    )
    assert put.status_code == 200


async def test_finalize_and_reopen_on_archived_application_are_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        CycleModel(id=900, user_id=ts.USER_ID, name='Past'),
        ts.application(cycle_id=900),
        ts.application(
            id=2,
            cycle_id=900,
            finalized_at=ts.closed_at(date(2025, 12, 2)),
        ),
    )

    finalize = await async_client.post('/applications/1/finalize')
    reopen = await async_client.post('/applications/2/reopen')

    assert (finalize.status_code, reopen.status_code) == (422, 422)
    assert 'archived' in finalize.json()['detail']
    assert (await _application(db_session)).finalized_at is None
    assert (await _application(db_session, 2)).finalized_at is not None


async def test_finalize_does_not_set_any_outcome(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-007/R-012: no step, feedback or salary; no event written."""
    await ts.seed_open_application(db_session)

    response = await async_client.post('/applications/1/finalize')

    body = response.json()
    assert body['salary_offer'] is None
    assert body['feedback'] is None
    assert body['last_step'] is None
    assert await _events(db_session) == []


async def test_cross_user_finalize_and_reopen_return_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(id=77, user_id=ts.OTHER_USER_ID),
    )

    finalize = await async_client.post('/applications/77/finalize')
    reopen = await async_client.post('/applications/77/reopen')
    legacy = await async_client.post(
        '/applications/77/finalize', json=_legacy_body()
    )
    outcome = await async_client.post(
        '/applications/77/finalize', json={'outcome': 'denied'}
    )

    assert (finalize.status_code, reopen.status_code) == (404, 404)
    assert legacy.status_code == 404
    _deprecated(legacy)
    assert outcome.status_code == 404, msg(404, outcome.status_code)
    assert 'Deprecation' not in outcome.headers
    assert await _events(db_session, app_id=77) == []


async def test_finalize_non_numeric_id_is_a_validation_error(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post('/applications/abc/finalize')
    assert response.status_code == 422


async def test_finalize_and_reopen_emit_audit_events(
    async_client: AsyncClient, db_session: AsyncSession, caplog
):
    await ts.seed_open_application(db_session)

    with caplog.at_level(logging.INFO, logger='app'):
        await async_client.post('/applications/1/finalize')
        await async_client.post('/applications/1/reopen')

    events = [
        getattr(r, 'extra_data', {}).get('event')
        for r in caplog.records
        if hasattr(r, 'extra_data')
    ]
    assert 'application.finalized' in events
    assert 'application.reopened' in events


def test_openapi_documents_reopen_and_the_optional_finalize_body():
    paths = main_app.openapi()['paths']
    finalize = paths['/applications/{application_id}/finalize']['post']
    assert finalize['requestBody']['required'] is False
    assert 'step_id' in (
        finalize['requestBody']['content']['application/json']['schema'][
            'properties'
        ]
    )
    assert '/applications/{application_id}/reopen' in paths


# ===========================================================================
# New optional outcome body (R-032)
# ===========================================================================


async def test_finalize_offer_outcome_writes_event_and_closes_no_deprecation(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={
            'outcome': 'offer',
            'event_date': '2025-12-20',
            'observation': 'Great offer',
            'salary_amount': '9500.00',
            'salary_currency': 'EUR',
            'salary_period': 'monthly',
        },
    )

    assert response.status_code == 200, msg(200, response.status_code)
    assert 'Deprecation' not in response.headers
    data = response.json()
    assert data['finalized'] is True
    assert data['finalized_at'] is not None
    assert data['salary_offer'] == 9500.0
    assert data['last_step']['date'] == '2025-12-20'

    [event] = await _events(db_session)
    assert event.event_type is EventType.OFFER
    assert event.interview_type is None
    assert event.event_date == date(2025, 12, 20)
    assert event.observation == 'Great offer'
    assert event.salary_amount == Decimal('9500.00')
    assert event.salary_currency is Currency.EUR
    assert event.salary_period is SalaryPeriod.MONTHLY
    application = await _application(db_session)
    assert application.finalized_at is not None


async def test_finalize_denied_outcome_writes_event_without_salary(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={'outcome': 'denied', 'observation': 'Not a fit'},
    )

    assert response.status_code == 200, msg(200, response.status_code)
    assert 'Deprecation' not in response.headers
    data = response.json()
    assert data['finalized'] is True
    assert data['salary_offer'] is None

    [event] = await _events(db_session)
    assert event.event_type is EventType.DENIED
    assert event.observation == 'Not a fit'
    assert event.salary_amount is None


async def test_finalize_outcome_event_date_defaults_to_today(
    async_client: AsyncClient, db_session: AsyncSession
):
    """The server's UTC ``today``, not the test runner's local date - this
    machine is not UTC, so pinning ``date.today()`` fails in the evening."""
    await ts.seed_open_application(db_session)

    before = datetime.now(UTC).date()
    response = await async_client.post(
        '/applications/1/finalize', json={'outcome': 'denied'}
    )
    after = datetime.now(UTC).date()

    assert response.status_code == 200, msg(200, response.status_code)
    [event] = await _events(db_session)
    assert before <= event.event_date <= after


async def test_finalize_outcome_offer_missing_salary_field_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={'outcome': 'offer', 'salary_amount': '100.00'},
    )

    assert response.status_code == 422, msg(422, response.status_code)
    assert 'Deprecation' not in response.headers
    assert await _events(db_session) == []
    assert (await _application(db_session)).finalized_at is None


async def test_finalize_outcome_salary_without_offer_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={
            'outcome': 'denied',
            'salary_amount': '100.00',
            'salary_currency': 'USD',
            'salary_period': 'monthly',
        },
    )

    assert response.status_code == 422, msg(422, response.status_code)
    assert await _events(db_session) == []


async def test_finalize_outcome_fields_without_outcome_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    """The orchestrator's pin: event_date/observation never silently
    dropped when there is no outcome."""
    await ts.seed_open_application(db_session)

    by_event_date = await async_client.post(
        '/applications/1/finalize', json={'event_date': '2025-12-20'}
    )
    by_observation = await async_client.post(
        '/applications/1/finalize', json={'observation': 'no outcome here'}
    )

    assert by_event_date.status_code == 422, msg(422, by_event_date.status_code)
    assert by_observation.status_code == 422, msg(
        422, by_observation.status_code
    )
    assert (await _application(db_session)).finalized_at is None


async def test_finalize_outcome_invalid_value_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize', json={'outcome': 'interview'}
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_finalize_all_null_outcome_body_is_the_idempotent_close(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A body whose only keys are absent/null counts as no outcome."""
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={
            'outcome': None,
            'event_date': None,
            'observation': None,
            'salary_amount': None,
            'salary_currency': None,
            'salary_period': None,
        },
    )

    assert response.status_code == 200, msg(200, response.status_code)
    assert 'Deprecation' not in response.headers
    assert response.json()['finalized'] is True
    assert await _events(db_session) == []

    again = await async_client.post(
        '/applications/1/finalize', json={'outcome': None}
    )
    assert again.status_code == 200
    assert again.json()['finalized_at'] == response.json()['finalized_at']


async def test_finalize_outcome_on_closed_application_is_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(
        db_session, finalized_at=ts.closed_at(date(2025, 12, 10))
    )

    response = await async_client.post(
        '/applications/1/finalize', json={'outcome': 'denied'}
    )

    assert response.status_code == 409, msg(409, response.status_code)
    assert response.json()['detail'] == (
        'Reopen the application to edit it (it is currently closed)'
    )
    assert 'Deprecation' not in response.headers


async def test_finalize_outcome_on_archived_application_is_422_before_closed(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        CycleModel(id=901, user_id=ts.USER_ID, name='Past'),
        ts.application(
            cycle_id=901, finalized_at=ts.closed_at(date(2025, 12, 10))
        ),
    )

    response = await async_client.post(
        '/applications/1/finalize', json={'outcome': 'denied'}
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_finalize_outcome_future_event_date_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    future = (date.today() + timedelta(days=10)).isoformat()

    response = await async_client.post(
        '/applications/1/finalize',
        json={'outcome': 'denied', 'event_date': future},
    )

    assert response.status_code == 422, msg(422, response.status_code)
    assert await _events(db_session) == []


async def test_finalize_outcome_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(db_session, *ts.catalog())

    response = await async_client.post(
        '/applications/999/finalize', json={'outcome': 'denied'}
    )

    assert response.status_code == 404, msg(404, response.status_code)
    assert 'Deprecation' not in response.headers


# ===========================================================================
# Legacy 0.1.4 body (deprecated)
# ===========================================================================


async def test_legacy_finalize_offer_records_the_outcome_event(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(
        db_session, currency=Currency.EUR, salary_period=SalaryPeriod.ANNUALLY
    )

    response = await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(salary_offer=95000.0, observation='Great offer!'),
    )

    assert response.status_code == 201, msg(201, response.status_code)
    _deprecated(response)
    data = response.json()
    assert data['finalized'] is True
    assert data['finalized_at'].startswith('2025-12-15T00:00:00')
    assert data['salary_offer'] == 95000.0
    assert data['feedback'] is None
    assert data['last_step']['id'] == str(ts.STEP_OFFER)
    assert data['last_step']['name'] == 'Offer'
    assert data['last_step']['date'] == '2025-12-15'

    [event] = await _events(db_session)
    assert event.event_type is EventType.OFFER
    assert event.event_date == date(2025, 12, 15)
    assert event.observation == 'Great offer!\n\nFeedback: Accepted'
    assert event.salary_amount == Decimal('95000.00')
    assert event.salary_currency is Currency.EUR
    assert event.salary_period is SalaryPeriod.ANNUALLY


async def test_legacy_finalize_offer_without_salary_is_decision_b(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize', json=_legacy_body()
    )

    assert response.status_code == 201
    [event] = await _events(db_session)
    assert (event.salary_amount, event.salary_currency, event.salary_period) == (
        Decimal('0.00'),
        Currency.USD,
        SalaryPeriod.MONTHLY,
    )
    assert event.observation == 'Feedback: Accepted'
    assert response.json()['salary_offer'] == 0.0


async def test_legacy_finalize_already_closed_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(
        db_session, finalized_at=ts.closed_at(date(2025, 12, 10))
    )

    response = await async_client.post(
        '/applications/1/finalize', json=_legacy_body()
    )

    assert response.status_code == 409, msg(409, response.status_code)
    assert response.json()['detail'] == (
        'This application has already been finalized'
    )
    _deprecated(response)


async def test_legacy_finalize_archived_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        CycleModel(id=901, user_id=ts.USER_ID, name='Past'),
        ts.application(cycle_id=901),
    )

    response = await async_client.post(
        '/applications/1/finalize', json=_legacy_body()
    )

    assert response.status_code == 422
    _deprecated(response)


async def test_legacy_finalize_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(db_session, *ts.catalog())

    response = await async_client.post(
        '/applications/999/finalize', json=_legacy_body()
    )

    assert response.status_code == 404, msg(404, response.status_code)
    _deprecated(response)


async def test_legacy_finalize_with_non_strict_step_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(step_id=str(ts.STEP_PHASE_2)),
    )

    assert response.status_code == 404, msg(404, response.status_code)
    assert await _events(db_session) == []


async def test_legacy_finalize_with_invalid_feedback_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize', json=_legacy_body(feedback_id='999')
    )

    assert response.status_code == 404, msg(404, response.status_code)
    assert (await _application(db_session)).finalized_at is None


async def test_legacy_finalize_future_date_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    future = (date.today() + timedelta(days=10)).isoformat()

    response = await async_client.post(
        '/applications/1/finalize', json=_legacy_body(finalize_date=future)
    )

    assert response.status_code == 422
    _deprecated(response)


async def test_legacy_finalize_salary_on_denied_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Edge case: a salary offer on a finalize whose step is not an offer
    is refused (the steps version stored it)."""
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(step_id=str(ts.STEP_DENIED), salary_offer=95000.0),
    )

    assert response.status_code == 422
    assert 'salary_offer' in response.json()['detail']
    _deprecated(response)
    assert await _events(db_session) == []
    assert (await _application(db_session)).finalized_at is None


async def test_legacy_finalize_invalid_body_is_422_with_deprecation(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize', json={'step_id': str(ts.STEP_OFFER)}
    )
    malformed = await async_client.post(
        '/applications/1/finalize',
        content=b'{not json',
        headers={'Content-Type': 'application/json'},
    )

    assert response.status_code == 422
    assert {e['loc'][-1] for e in response.json()['detail']} >= {
        'feedback_id',
        'finalize_date',
    }
    _deprecated(response)
    assert malformed.status_code == 422


async def test_legacy_finalize_offer_with_non_accepted_feedback_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-012: Offer is no longer coupled to Accepted."""
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(feedback_id=str(ts.FB_GHOST)),
    )

    assert response.status_code == 201, msg(201, response.status_code)
    [event] = await _events(db_session)
    assert event.observation == 'Feedback: Ghost'


async def test_legacy_finalize_denied_with_accepted_feedback_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(step_id=str(ts.STEP_DENIED)),
    )

    assert response.status_code == 201, msg(201, response.status_code)
    assert response.json()['finalized'] is True
    assert response.json()['salary_offer'] is None
    [event] = await _events(db_session)
    assert event.event_type is EventType.DENIED
    assert event.salary_amount is None


async def test_legacy_finalized_application_can_be_reopened(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    await async_client.post('/applications/1/finalize', json=_legacy_body())

    reopened = await async_client.post('/applications/1/reopen')
    again = await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(step_id=str(ts.STEP_DENIED)),
    )

    assert reopened.status_code == 200
    assert again.status_code == 201
    kinds = [event.event_type for event in await _events(db_session)]
    assert kinds == [EventType.OFFER, EventType.DENIED]


async def test_legacy_finalize_keeps_existing_interviews_untouched(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    await ts.seed(
        db_session,
        ts.event(
            5,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            observation='Screen',
        ),
    )

    await async_client.post(
        '/applications/1/finalize',
        json=_legacy_body(step_id=str(ts.STEP_DENIED)),
    )

    screen, denied = await _events(db_session)
    assert screen.observation == 'Screen'
    assert denied.observation == 'Feedback: Accepted'
