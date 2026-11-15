"""Integration tests for application/event date validation rules.

These tests rely on ``freezegun`` to pin the notion of "today" so the
"no future dates" rule is deterministic regardless of when the suite
runs. The allowed upper bound for any user-provided date is
``UTC today + 1 day``, so with time frozen at ``2026-04-07`` the
maximum accepted date is ``2026-04-08``.

The frozen clock also reaches the Snowflake ID generator: a frozen time
behind its last timestamp is a clock that stepped back, and the generator
keeps issuing from the last timestamp it used (``app/lib/types.py``).
"""

from datetime import date

from freezegun import freeze_time
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel
from tests import msg
from tests.base_db_setup import base_data

FROZEN_NOW = '2026-04-07 12:00:00'
TODAY = date(2026, 4, 7)
MAX_ALLOWED = date(2026, 4, 8)  # UTC today + 1 day
ONE_DAY_PAST_MAX = date(2026, 4, 9)  # first rejected date


def _app_payload(application_date: str, **overrides) -> dict:
    payload = {
        'company': base_data()['company_acme'].id,
        'role': 'Software Engineer',
        'mode': 'active',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': application_date,
    }
    payload.update(overrides)
    return payload


async def _seed_app(db_session: AsyncSession, application_date: date) -> None:
    db_session.add(
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=application_date,
        )
    )
    await db_session.commit()


# ---------------------------------------------------------------------------
# Application.application_date cannot be in the future
# ---------------------------------------------------------------------------


@freeze_time(FROZEN_NOW)
async def test_create_application_with_today_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload(TODAY.isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_create_application_at_max_allowed_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    """UTC today + 1 day is still accepted (upper bound inclusive)."""
    response = await async_client.post(
        '/applications', json=_app_payload(MAX_ALLOWED.isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_create_application_past_upper_bound_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload(ONE_DAY_PAST_MAX.isoformat())
    )

    assert response.status_code == 422, msg(422, response.status_code)
    body = response.json()
    assert 'application_date' in str(body), msg('application_date', body)


@freeze_time(FROZEN_NOW)
async def test_create_application_far_future_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload('2099-01-01')
    )

    assert response.status_code == 422, msg(422, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_create_application_in_the_past_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload('2025-12-01')
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_update_application_with_future_date_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
        )
    )
    await db_session.commit()

    response = await async_client.put(
        '/applications/1',
        json=_app_payload(ONE_DAY_PAST_MAX.isoformat()),
    )

    assert response.status_code == 422, msg(422, response.status_code)


# ---------------------------------------------------------------------------
# Event dates: the order rules are gone (PRD 0008 "Assumptions")
#
# A step is a timeline event now (the /steps routes left with applika-cli,
# ADR-0028), and for timeline events no rule ties the date to the
# application date or to the previous event.
# ---------------------------------------------------------------------------

EVENTS = '/applications/1/timeline'


def _event(event_date: str) -> dict:
    return {'event_type': 'interview', 'event_date': event_date}


@freeze_time(FROZEN_NOW)
async def test_create_event_before_application_date_is_allowed(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app(db_session, application_date=date(2026, 4, 1))

    response = await async_client.post(EVENTS, json=_event('2026-03-31'))

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_create_event_on_application_date_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    """event_date == application_date is allowed (bound is inclusive)."""
    await _seed_app(db_session, application_date=date(2026, 4, 1))

    response = await async_client.post(EVENTS, json=_event('2026-04-01'))

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_create_event_after_application_date_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app(db_session, application_date=date(2026, 4, 1))

    response = await async_client.post(EVENTS, json=_event('2026-04-03'))

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW)
async def test_create_event_earlier_than_previous_event_is_allowed(
    async_client: AsyncClient, db_session: AsyncSession
):
    """No chronological rule any more: the timeline orders by date."""
    await _seed_app(db_session, application_date=date(2026, 4, 1))

    first = await async_client.post(EVENTS, json=_event('2026-04-05'))
    assert first.status_code == 201, msg(201, first.status_code)

    second = await async_client.post(EVENTS, json=_event('2026-04-03'))

    assert second.status_code == 201, msg(201, second.status_code)
    listed = await async_client.get(EVENTS)
    assert [e['event_date'] for e in listed.json()] == [
        '2026-04-03',
        '2026-04-05',
    ]


@freeze_time(FROZEN_NOW)
async def test_update_event_before_application_date_is_allowed(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app(db_session, application_date=date(2026, 4, 1))

    create = await async_client.post(EVENTS, json=_event('2026-04-05'))
    assert create.status_code == 201, msg(201, create.status_code)
    event_id = create.json()['id']

    update = await async_client.put(
        f'{EVENTS}/{event_id}', json=_event('2026-03-20')
    )

    assert update.status_code == 200, msg(200, update.status_code)
