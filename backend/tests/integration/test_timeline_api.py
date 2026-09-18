"""The application timeline API (R-001..R-006, R-010, R-011, R-030).

Ported from mynextjob's ``test_timeline_api.py`` onto applika's fixtures
(the ``async_client`` acts as base user 1) and applika's deltas: archived is
a 422 business-rule violation and closed a 409 that says to reopen, every
event carries ``interview_type``, and an application holds one initial
screening at most. End to end: router, use case, repository, Postgres.
"""

import logging
from datetime import UTC, date, datetime
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
from app.domain.models import CycleModel, TimelineEventModel
from app.main import app as main_app
from app.presentation.dependencies import get_current_user
from tests.integration import timeline_seed as ts

BASE = '/applications/1/timeline'
EVENT_KEYS = {
    'id',
    'application_id',
    'user_id',
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
    'created_at',
    'updated_at',
}


def _note(**overrides: object) -> dict:
    data: dict = {'event_type': 'note', 'event_date': '2025-12-02'}
    data.update(overrides)
    return data


def _offer(**overrides: object) -> dict:
    data: dict = {
        'event_type': 'offer',
        'event_date': '2025-12-05',
        'salary_period': 'annually',
        'salary_amount': '150000',
        'salary_currency': 'USD',
    }
    data.update(overrides)
    return data


def _interview(kind: str | None = None, **overrides: object) -> dict:
    data: dict = {'event_type': 'interview', 'event_date': '2025-12-03'}
    if kind is not None:
        data['interview_type'] = kind
    data.update(overrides)
    return data


def _denied(reason: str | None = None, **overrides: object) -> dict:
    data: dict = {'event_type': 'denied', 'event_date': '2025-12-08'}
    if reason is not None:
        data['denied_reason'] = reason
    data.update(overrides)
    return data


async def _row(engine: AsyncEngine, event_id: str) -> TimelineEventModel:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        row = await session.scalar(
            select(TimelineEventModel).where(
                TimelineEventModel.id == int(event_id)
            )
        )
    assert row is not None
    return row


# ---------------------------------------------------------------------------
# Authentication
# ---------------------------------------------------------------------------


async def test_timeline_endpoints_require_authentication(
    async_client: AsyncClient, db_session: AsyncSession
):
    override = main_app.dependency_overrides.pop(get_current_user)
    try:
        responses = [
            await async_client.get(BASE),
            await async_client.post(BASE, json=_note()),
            await async_client.put(f'{BASE}/1', json=_note()),
            await async_client.delete(f'{BASE}/1'),
            await async_client.post('/applications/1/reopen'),
            await async_client.post('/applications/1/finalize'),
        ]
    finally:
        main_app.dependency_overrides[get_current_user] = override
    assert {r.status_code for r in responses} <= {401, 403}


# ---------------------------------------------------------------------------
# CRUD happy path (R-006)
# ---------------------------------------------------------------------------


async def test_full_crud_round_trip(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    create = await async_client.post(BASE, json=_note(observation='kickoff'))
    assert create.status_code == 201, create.text
    body = create.json()
    assert set(body) == EVENT_KEYS
    event_id = body['id']
    assert isinstance(body['id'], str)
    assert body['application_id'] == '1'
    assert body['user_id'] == str(ts.USER_ID)
    assert isinstance(body['created_at'], str)
    assert body['event_type'] == 'note'
    assert body['interview_type'] is None
    assert body['observation'] == 'kickoff'
    assert body['salary_amount'] is None

    listing = await async_client.get(BASE)
    assert listing.status_code == 200
    assert [r['id'] for r in listing.json()] == [event_id]

    put = await async_client.put(
        f'{BASE}/{event_id}',
        json=_interview('technical', observation='call booked'),
    )
    assert put.status_code == 200
    updated = put.json()
    assert updated['event_type'] == 'interview'
    assert updated['interview_type'] == 'technical'
    assert updated['observation'] == 'call booked'
    assert updated['id'] == event_id
    assert updated['updated_at'] is not None

    delete = await async_client.delete(f'{BASE}/{event_id}')
    assert delete.status_code == 204
    assert (await async_client.get(BASE)).json() == []


async def test_put_is_a_full_replacement(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    created = await async_client.post(
        BASE,
        json=_note(
            observation='x',
            timezone='UTC',
            start_time='09:00',
            end_time='10:00',
        ),
    )

    put = await async_client.put(f'{BASE}/{created.json()["id"]}', json=_note())

    assert put.status_code == 200
    body = put.json()
    assert body['observation'] is None
    assert body['timezone'] is None
    assert body['start_time'] is None


@pytest.mark.parametrize('event_type', ['note', 'feedback', 'denied'])
async def test_each_event_type_is_stored(
    async_client: AsyncClient, db_session: AsyncSession, event_type
):
    """R-001: exactly one of the five types per event."""
    await ts.seed_open_application(db_session)
    response = await async_client.post(BASE, json=_note(event_type=event_type))
    assert response.status_code == 201
    assert response.json()['event_type'] == event_type


async def test_unknown_event_type_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(BASE, json=_note(event_type='applied'))
    assert response.status_code == 422


async def test_list_is_ordered_by_date_then_start_time_nulls_first(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    await ts.seed(
        db_session,
        ts.event(3, event_date=date(2025, 12, 5)),
        ts.event(
            2,
            event_date=date(2025, 12, 4),
            start_time=datetime(2025, 1, 1, 15).time(),
            end_time=datetime(2025, 1, 1, 16).time(),
        ),
        ts.event(1, event_date=date(2025, 12, 4)),
        ts.event(4, event_date=date(2025, 12, 1)),
    )

    listing = await async_client.get(BASE)

    assert [r['id'] for r in listing.json()] == ['4', '1', '2', '3']


# ---------------------------------------------------------------------------
# Interview type (R-002, R-003)
# ---------------------------------------------------------------------------


async def test_interview_without_type_is_stored_as_unknown(
    async_client: AsyncClient, db_session: AsyncSession, async_engine
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(BASE, json=_interview())

    assert response.status_code == 201
    assert response.json()['interview_type'] == 'unknown'
    row = await _row(async_engine, response.json()['id'])
    assert row.interview_type is InterviewType.UNKNOWN


@pytest.mark.parametrize('kind', [k.value for k in InterviewType])
async def test_every_interview_type_is_accepted(
    async_client: AsyncClient, db_session: AsyncSession, kind
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(BASE, json=_interview(kind))
    assert response.status_code == 201
    assert response.json()['interview_type'] == kind


@pytest.mark.parametrize('event_type', ['note', 'feedback', 'denied'])
async def test_interview_type_on_non_interview_is_422(
    async_client: AsyncClient, db_session: AsyncSession, event_type
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(
        BASE, json=_note(event_type=event_type, interview_type='technical')
    )
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Denied reason (KODI-014, R-033..R-036)
# ---------------------------------------------------------------------------


async def test_denied_without_reason_is_stored_as_unknown(
    async_client: AsyncClient, db_session: AsyncSession, async_engine
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(BASE, json=_denied())

    assert response.status_code == 201
    assert response.json()['denied_reason'] == 'unknown'
    row = await _row(async_engine, response.json()['id'])
    assert row.denied_reason is DeniedReason.UNKNOWN


@pytest.mark.parametrize('reason', [r.value for r in DeniedReason])
async def test_every_denied_reason_is_accepted(
    async_client: AsyncClient, db_session: AsyncSession, reason
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(BASE, json=_denied(reason))
    assert response.status_code == 201
    assert response.json()['denied_reason'] == reason


@pytest.mark.parametrize('event_type', ['note', 'interview', 'offer'])
async def test_denied_reason_on_non_denied_is_422(
    async_client: AsyncClient, db_session: AsyncSession, event_type
):
    await ts.seed_open_application(db_session)
    extra = _offer() if event_type == 'offer' else {'event_date': '2025-12-03'}
    body = {**extra, 'event_type': event_type, 'denied_reason': 'ghosted'}
    response = await async_client.post(BASE, json=body)
    assert response.status_code == 422


async def test_denied_changed_to_another_type_must_drop_the_reason(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PRD 0008 pattern (already true of ``interview_type``): the reason
    goes in the same request that changes the event away from denied."""
    await ts.seed_open_application(db_session)
    created = await async_client.post(BASE, json=_denied('skills_mismatch'))
    event_id = created.json()['id']

    put = await async_client.put(f'{BASE}/{event_id}', json=_note())

    assert put.status_code == 200
    assert put.json()['denied_reason'] is None


# ---------------------------------------------------------------------------
# Dates, times, timezone, observation (R-004)
# ---------------------------------------------------------------------------


async def test_scheduled_event_persists_its_scheduling_fields(
    async_client: AsyncClient, db_session: AsyncSession, async_engine
):
    await ts.seed_open_application(db_session)
    long_tz = 'America/Argentina/ComodRivadavia' + '/x' * 30

    response = await async_client.post(
        BASE,
        json=_interview(
            'cultural',
            start_time='09:00',
            end_time='10:30',
            timezone=long_tz[:100],
            observation='Panel',
        ),
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert (body['start_time'], body['end_time']) == ('09:00:00', '10:30:00')
    assert body['timezone'] == long_tz[:100]
    row = await _row(async_engine, body['id'])
    assert row.timezone == long_tz[:100]
    assert row.observation == 'Panel'


@pytest.mark.parametrize(
    'times',
    [
        {'start_time': '09:00'},
        {'end_time': '10:00'},
        {'start_time': '10:00', 'end_time': '10:00'},
        {'start_time': '11:00', 'end_time': '10:00'},
    ],
)
async def test_bad_schedule_is_422(
    async_client: AsyncClient, db_session: AsyncSession, times
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(BASE, json=_note(**times))
    assert response.status_code == 422


async def test_timezone_over_100_and_observation_over_5000_are_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    too_long_tz = await async_client.post(BASE, json=_note(timezone='x' * 101))
    too_long_obs = await async_client.post(
        BASE, json=_note(observation='x' * 5001)
    )
    assert (too_long_tz.status_code, too_long_obs.status_code) == (422, 422)


async def test_event_before_the_application_date_is_allowed(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(
        BASE, json=_note(event_date='2020-01-01')
    )
    assert response.status_code == 201


# ---------------------------------------------------------------------------
# Offer salary invariant (R-005, R-031)
# ---------------------------------------------------------------------------


async def test_create_offer_persists_salary_trio_as_strings(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(BASE, json=_offer())

    assert response.status_code == 201
    body = response.json()
    assert body['event_type'] == 'offer'
    assert body['interview_type'] is None
    assert body['salary_period'] == 'annually'
    assert body['salary_currency'] == 'USD'
    assert body['salary_amount'] == '150000.00'


async def test_offer_accepts_annual_and_a_new_currency(
    async_client: AsyncClient, db_session: AsyncSession, async_engine
):
    """R-031: `annual` stored and returned as annually; SEK is accepted."""
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        BASE, json=_offer(salary_period='annual', salary_currency='SEK')
    )

    assert response.status_code == 201, response.text
    assert response.json()['salary_period'] == 'annually'
    assert response.json()['salary_currency'] == 'SEK'
    row = await _row(async_engine, response.json()['id'])
    assert row.salary_period is SalaryPeriod.ANNUALLY
    maker = async_sessionmaker(bind=async_engine)
    async with maker() as session:
        label = await session.scalar(
            text(
                'SELECT salary_period::text FROM timeline_events WHERE id = :id'
            ),
            {'id': int(response.json()['id'])},
        )
    assert label == 'ANNUALLY'


@pytest.mark.parametrize(
    'missing', ['salary_period', 'salary_amount', 'salary_currency']
)
async def test_offer_missing_any_salary_field_returns_422(
    async_client: AsyncClient, db_session: AsyncSession, missing
):
    await ts.seed_open_application(db_session)
    body = _offer()
    body.pop(missing)
    response = await async_client.post(BASE, json=body)
    assert response.status_code == 422


@pytest.mark.parametrize(
    'salary_field',
    [
        {'salary_period': 'monthly'},
        {'salary_amount': '1000'},
        {'salary_currency': 'USD'},
    ],
)
async def test_non_offer_with_salary_field_returns_422(
    async_client: AsyncClient, db_session: AsyncSession, salary_field
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(
        BASE, json=_note(event_type='feedback', **salary_field)
    )
    assert response.status_code == 422


async def test_offer_hourly_period_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    response = await async_client.post(
        BASE, json=_offer(salary_period='hourly')
    )
    assert response.status_code == 422


async def test_offer_changed_to_interview_must_drop_the_salary(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PRD 0008 edge case: the salary goes in the same change."""
    await ts.seed_open_application(db_session)
    created = await async_client.post(BASE, json=_offer())
    url = f'{BASE}/{created.json()["id"]}'

    kept = await async_client.put(
        url,
        json=_interview(
            salary_amount='150000',
            salary_currency='USD',
            salary_period='annually',
        ),
    )
    dropped = await async_client.put(url, json=_interview())

    assert kept.status_code == 422
    assert dropped.status_code == 200
    assert dropped.json()['salary_amount'] is None
    assert dropped.json()['salary_currency'] is None


# ---------------------------------------------------------------------------
# DB CHECKs mirrored in the ORM (the create_all schema = R1's)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ('fields', 'constraint'),
    [
        ({'event_type': EventType.OFFER}, 'ck_timeline_events_offer_salary'),
        (
            {
                'event_type': EventType.NOTE,
                'salary_period': SalaryPeriod.MONTHLY,
                'salary_amount': 1000,
                'salary_currency': Currency.USD,
            },
            'ck_timeline_events_offer_salary',
        ),
        (
            {'event_type': EventType.INTERVIEW},
            'ck_timeline_events_interview_type',
        ),
        (
            {
                'event_type': EventType.NOTE,
                'interview_type': InterviewType.FINAL,
            },
            'ck_timeline_events_interview_type',
        ),
        (
            {'event_type': EventType.DENIED, 'denied_reason': None},
            'ck_timeline_events_denied_reason',
        ),
        (
            {
                'event_type': EventType.NOTE,
                'denied_reason': DeniedReason.GHOSTED,
            },
            'ck_timeline_events_denied_reason',
        ),
    ],
)
async def test_db_checks_back_the_rules(
    async_engine: AsyncEngine, db_session: AsyncSession, fields, constraint
):
    await ts.seed_open_application(db_session)
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        session.add(ts.event(9, **fields))
        with pytest.raises(IntegrityError) as exc:
            await session.commit()
    assert constraint in str(exc.value)


async def test_db_unique_index_backs_one_initial_screening(
    async_engine: AsyncEngine, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    screening: dict[str, Any] = {
        'event_type': EventType.INTERVIEW,
        'interview_type': InterviewType.INITIAL_SCREENING,
    }
    await ts.seed(db_session, ts.event(1, **screening))
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        session.add(ts.event(2, **screening))
        with pytest.raises(IntegrityError) as exc:
            await session.commit()
    assert 'uq_timeline_events_one_initial_screening' in str(exc.value)


async def test_salaryperiod_type_keeps_the_legacy_label(
    async_engine: AsyncEngine, db_session: AsyncSession
):
    maker = async_sessionmaker(bind=async_engine)
    async with maker() as session:
        rows = await session.execute(
            text(
                'SELECT e.enumlabel FROM pg_enum e '
                'JOIN pg_type t ON t.oid = e.enumtypid '
                "WHERE t.typname = 'salaryperiod'"
            )
        )
        labels = {r[0] for r in rows}
    assert labels == {'HOURLY', 'MONTHLY', 'ANNUAL', 'ANNUALLY'}


# ---------------------------------------------------------------------------
# One initial screening per application (R-030)
# ---------------------------------------------------------------------------


async def test_second_initial_screening_is_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    first = await async_client.post(BASE, json=_interview('initial_screening'))
    second = await async_client.post(BASE, json=_interview('initial_screening'))
    other = await async_client.post(BASE, json=_interview('technical'))

    assert first.status_code == 201
    assert second.status_code == 409
    assert second.json()['detail'] == (
        'This application already has an initial screening interview; '
        'an application can have only one'
    )
    assert other.status_code == 201


async def test_put_into_a_second_initial_screening_is_409_but_itself_is_ok(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    first = await async_client.post(BASE, json=_interview('initial_screening'))
    other = await async_client.post(BASE, json=_interview('unknown'))

    same = await async_client.put(
        f'{BASE}/{first.json()["id"]}',
        json=_interview('initial_screening', observation='rescheduled'),
    )
    second = await async_client.put(
        f'{BASE}/{other.json()["id"]}', json=_interview('initial_screening')
    )

    assert same.status_code == 200
    assert second.status_code == 409


async def test_initial_screening_is_per_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session, *ts.catalog(), ts.application(), ts.application(2)
    )

    one = await async_client.post(BASE, json=_interview('initial_screening'))
    two = await async_client.post(
        '/applications/2/timeline', json=_interview('initial_screening')
    )

    assert (one.status_code, two.status_code) == (201, 201)


# ---------------------------------------------------------------------------
# Ownership (ADR 0004)
# ---------------------------------------------------------------------------


async def test_cross_user_access_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(id=77, user_id=ts.OTHER_USER_ID),
        ts.event(78, application_id=77, user_id=ts.OTHER_USER_ID),
    )
    base = '/applications/77/timeline'

    assert (await async_client.get(base)).status_code == 404
    assert (await async_client.post(base, json=_note())).status_code == 404
    assert (
        await async_client.put(f'{base}/78', json=_note())
    ).status_code == 404
    assert (await async_client.delete(f'{base}/78')).status_code == 404


async def test_event_scoped_to_owning_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session, *ts.catalog(), ts.application(), ts.application(2)
    )
    created = await async_client.post(BASE, json=_note())
    event_id = created.json()['id']

    other_app = '/applications/2/timeline'
    assert (
        await async_client.put(f'{other_app}/{event_id}', json=_note())
    ).status_code == 404
    assert (
        await async_client.delete(f'{other_app}/{event_id}')
    ).status_code == 404


async def test_missing_application_and_event_are_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    assert (
        await async_client.get('/applications/999/timeline')
    ).status_code == 404
    assert (
        await async_client.put(f'{BASE}/999', json=_note())
    ).status_code == 404
    assert (await async_client.delete(f'{BASE}/999')).status_code == 404


# ---------------------------------------------------------------------------
# Write guards: closed 409, archived 422 (R-010, R-011)
# ---------------------------------------------------------------------------


async def test_writes_on_closed_application_conflict_then_reopen_lifts_it(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    created = await async_client.post(BASE, json=_note())
    event_id = created.json()['id']
    await async_client.post('/applications/1/finalize')

    post = await async_client.post(BASE, json=_note())
    put = await async_client.put(f'{BASE}/{event_id}', json=_note())
    delete = await async_client.delete(f'{BASE}/{event_id}')

    assert (post.status_code, put.status_code, delete.status_code) == (
        409,
        409,
        409,
    )
    for response in (post, put, delete):
        assert 'Reopen the application to edit it' in response.json()['detail']
    # Reads stay allowed on a closed application.
    assert (await async_client.get(BASE)).status_code == 200

    assert (
        await async_client.post('/applications/1/reopen')
    ).status_code == 200
    assert (await async_client.post(BASE, json=_note())).status_code == 201


async def test_writes_on_archived_application_are_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        CycleModel(id=900, user_id=ts.USER_ID, name='Past'),
        ts.application(
            cycle_id=900, finalized_at=datetime(2025, 12, 9, tzinfo=UTC)
        ),
        ts.event(5),
    )

    post = await async_client.post(BASE, json=_note())
    put = await async_client.put(f'{BASE}/5', json=_note())
    delete = await async_client.delete(f'{BASE}/5')
    reopen = await async_client.post('/applications/1/reopen')

    assert {post.status_code, put.status_code, delete.status_code} == {422}
    assert reopen.status_code == 422
    assert 'archived' in post.json()['detail']
    assert (await async_client.get(BASE)).status_code == 200


# ---------------------------------------------------------------------------
# Audit
# ---------------------------------------------------------------------------


async def test_write_paths_emit_audit_events(
    async_client: AsyncClient, db_session: AsyncSession, caplog
):
    await ts.seed_open_application(db_session)

    with caplog.at_level(logging.INFO, logger='app'):
        created = await async_client.post(BASE, json=_note())
        event_id = created.json()['id']
        await async_client.put(f'{BASE}/{event_id}', json=_note())
        await async_client.delete(f'{BASE}/{event_id}')

    events = [
        getattr(r, 'extra_data', {}).get('event')
        for r in caplog.records
        if hasattr(r, 'extra_data')
    ]
    assert 'timeline_event.created' in events
    assert 'timeline_event.updated' in events
    assert 'timeline_event.deleted' in events


# ---------------------------------------------------------------------------
# The Application's legacy fields follow the timeline (R-019)
# ---------------------------------------------------------------------------


async def test_application_list_derives_last_step_and_salary_offer(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)
    await async_client.post(BASE, json=_interview('initial_screening'))
    await async_client.post(BASE, json=_offer(salary_amount='4200.50'))

    [application] = (await async_client.get('/applications')).json()

    assert application['last_step'] == {
        'id': str(ts.STEP_OFFER),
        'name': 'Offer',
        'color': '#28a745',
        'date': '2025-12-05',
    }
    assert application['salary_offer'] == 4200.5
    assert application['feedback'] is None
    assert application['finalized'] is False
    assert application['finalized_at'] is None
