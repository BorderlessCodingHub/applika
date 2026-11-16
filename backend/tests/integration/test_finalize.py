"""POST /applications/{id}/finalize and /reopen (R-007..R-012, R-019,
R-032).

* No body (or ``{}``/``null``): the reversible close. 200, idempotent, only
  ``finalized_at`` changes, no Deprecation header.
* The optional outcome body: an offer or denied event and ``finalized_at``
  written atomically.
* The retired 0.1.4 body ``{step_id, feedback_id, ...}`` is a 422 since
  ADR-0028 (``test_cli_removed.py``).

The outcome half pins the archived code (422, not 409).
"""

import logging
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    SalaryPeriod,
)
from app.domain.models import ApplicationModel, CycleModel, TimelineEventModel
from app.main import app as main_app
from tests import msg
from tests.integration import timeline_seed as ts


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
    note = {'event_type': 'interview', 'event_date': '2025-12-05'}
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
    assert 'salary_offer' not in body
    assert 'feedback' not in body
    assert body['last_event'] is None
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
    outcome = await async_client.post(
        '/applications/77/finalize', json={'outcome': 'denied'}
    )

    assert (finalize.status_code, reopen.status_code) == (404, 404)
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
    assert '/applications/{application_id}/reopen' in paths


def test_openapi_finalize_body_is_the_outcome_shape_only():
    """The finalize requestBody documents the optional outcome shape (R-032)
    alone, `required: false`: the 0.1.4 shape left with ADR-0028, and so did
    its 201 answer."""
    finalize = main_app.openapi()['paths'][
        '/applications/{application_id}/finalize'
    ]['post']
    request_body = finalize['requestBody']
    assert request_body['required'] is False
    assert '201' not in finalize['responses']
    assert '0.1.4' not in request_body['description']

    outcome = request_body['content']['application/json']['schema']
    assert outcome['title'] == 'FinalizeWithOutcome'
    assert 'oneOf' not in outcome
    assert 'step_id' not in outcome['properties']
    assert 'feedback_id' not in outcome['properties']
    assert outcome['additionalProperties'] is False
    assert 'outcome' in outcome['properties']
    assert 'salary_period' in outcome['properties']
    assert 'denied_reason' in outcome['properties']
    # Nested refs resolve against components/schemas, not a local $defs -
    # this branch was hoisted out of its own model_json_schema() output.
    assert '$defs' not in outcome
    assert (
        outcome['properties']['salary_currency']['anyOf'][0]['$ref']
        == '#/components/schemas/Currency'
    )
    assert (
        outcome['properties']['denied_reason']['anyOf'][0]['$ref']
        == '#/components/schemas/DeniedReason'
    )
    # And those refs are not dangling: both are really there, DeniedReason
    # with all ten values.
    schemas = main_app.openapi()['components']['schemas']
    assert 'Currency' in schemas
    assert schemas['DeniedReason']['enum'] == [
        'unknown',
        'not_good_enough',
        'skills_mismatch',
        'assessment_failed',
        'too_many_candidates',
        'position_filled',
        'role_closed',
        'ghosted',
        'salary_mismatch',
        'other',
    ]


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
    assert 'salary_offer' not in data
    assert data['last_event']['date'] == '2025-12-20'
    assert data['last_event']['event_type'] == 'offer'

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

    [event] = await _events(db_session)
    assert event.event_type is EventType.DENIED
    assert event.observation == 'Not a fit'
    assert event.salary_amount is None
    # no reason given defaults to unknown, same as /timeline.
    assert event.denied_reason is DeniedReason.UNKNOWN


async def test_finalize_denied_outcome_with_a_reason(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={'outcome': 'denied', 'denied_reason': 'ghosted'},
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['finalized'] is True
    [event] = await _events(db_session)
    assert event.denied_reason is DeniedReason.GHOSTED


async def test_finalize_outcome_denied_reason_on_offer_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={
            'outcome': 'offer',
            'salary_amount': '100.00',
            'salary_currency': 'USD',
            'salary_period': 'monthly',
            'denied_reason': 'ghosted',
        },
    )

    assert response.status_code == 422, msg(422, response.status_code)
    assert 'denied_reason' in response.text
    assert await _events(db_session) == []
    assert (await _application(db_session)).finalized_at is None


async def test_finalize_outcome_denied_reason_without_outcome_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize', json={'denied_reason': 'ghosted'}
    )

    assert response.status_code == 422, msg(422, response.status_code)
    assert await _events(db_session) == []
    assert (await _application(db_session)).finalized_at is None


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


async def test_finalize_outcome_offer_hourly_period_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Remediation round 1 (R-032): an offer outcome refuses
    ``hourly``, same as the timeline write schema - the defect being fixed
    let the same offer event be valid through ``/timeline`` and refused
    through ``/finalize``, or the reverse."""
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        '/applications/1/finalize',
        json={
            'outcome': 'offer',
            'salary_amount': '100.00',
            'salary_currency': 'USD',
            'salary_period': 'hourly',
        },
    )

    assert response.status_code == 422, msg(422, response.status_code)
    assert 'Deprecation' not in response.headers
    assert 'monthly or annually' in response.text
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
