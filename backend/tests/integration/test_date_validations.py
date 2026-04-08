"""Integration tests for application/step date validation rules.

These tests rely on ``freezegun`` to pin the notion of "today" so the
"no future dates" rule is deterministic regardless of when the suite
runs. The allowed upper bound for any user-provided date is
``UTC today + 1 day``, so with time frozen at ``2026-04-07`` the
maximum accepted date is ``2026-04-08``.

The ``ignore=['snowflake']`` option keeps the Snowflake ID generator
on the real wall clock — otherwise its cached ``last_timestamp`` from
prior tests would be ahead of the frozen time, causing it to raise
``InvalidSystemClock`` and produce ``id=None`` on inserts.
"""

from datetime import date

from freezegun import freeze_time
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel, StepDefinitionModel
from tests import msg
from tests.base_db_setup import base_data

FROZEN_NOW = '2026-04-07 12:00:00'
TODAY = date(2026, 4, 7)
MAX_ALLOWED = date(2026, 4, 8)          # UTC today + 1 day
ONE_DAY_PAST_MAX = date(2026, 4, 9)     # first rejected date


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


async def _seed_steps_and_app(
    db_session: AsyncSession, application_date: date
) -> None:
    db_session.add_all([
        StepDefinitionModel(
            id=1, name='Applied', color='#007bff', strict=False
        ),
        StepDefinitionModel(
            id=2, name='Interview', color='#17a2b8', strict=False
        ),
    ])
    db_session.add(ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=application_date,
    ))
    await db_session.commit()


# ---------------------------------------------------------------------------
# Application.application_date cannot be in the future
# ---------------------------------------------------------------------------


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_application_with_today_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload(TODAY.isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_application_at_max_allowed_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    """UTC today + 1 day is still accepted (upper bound inclusive)."""
    response = await async_client.post(
        '/applications', json=_app_payload(MAX_ALLOWED.isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_application_past_upper_bound_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload(ONE_DAY_PAST_MAX.isoformat())
    )

    assert response.status_code == 422, msg(422, response.status_code)
    body = response.json()
    assert 'application_date' in str(body), msg('application_date', body)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_application_far_future_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload('2099-01-01')
    )

    assert response.status_code == 422, msg(422, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_application_in_the_past_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/applications', json=_app_payload('2025-12-01')
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_update_application_with_future_date_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    db_session.add(ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    ))
    await db_session.commit()

    response = await async_client.put(
        '/applications/1',
        json=_app_payload(ONE_DAY_PAST_MAX.isoformat()),
    )

    assert response.status_code == 422, msg(422, response.status_code)


# ---------------------------------------------------------------------------
# ApplicationStep.step_date must be >= application.application_date
# ---------------------------------------------------------------------------


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_step_before_application_date_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_steps_and_app(db_session, application_date=date(2026, 4, 1))

    payload = {'step_id': 1, 'step_date': '2026-03-31'}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)
    body = response.json()
    assert 'application_date' in str(body), msg('application_date', body)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_step_on_application_date_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    """step_date == application_date is allowed (bound is inclusive)."""
    await _seed_steps_and_app(db_session, application_date=date(2026, 4, 1))

    payload = {'step_id': 1, 'step_date': '2026-04-01'}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_step_after_application_date_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_steps_and_app(db_session, application_date=date(2026, 4, 1))

    payload = {'step_id': 1, 'step_date': '2026-04-03'}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 201, msg(201, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_step_with_future_date_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_steps_and_app(db_session, application_date=date(2026, 4, 1))

    payload = {'step_id': 1, 'step_date': ONE_DAY_PAST_MAX.isoformat()}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_create_step_earlier_than_previous_step_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Chronological order: new step cannot regress past the last one."""
    await _seed_steps_and_app(db_session, application_date=date(2026, 4, 1))

    first = await async_client.post(
        '/applications/1/steps',
        json={'step_id': 1, 'step_date': '2026-04-05'},
    )
    assert first.status_code == 201, msg(201, first.status_code)

    second = await async_client.post(
        '/applications/1/steps',
        json={'step_id': 2, 'step_date': '2026-04-03'},
    )

    assert second.status_code == 422, msg(422, second.status_code)
    body = second.json()
    assert 'previous step' in str(body), msg('previous step', body)


@freeze_time(FROZEN_NOW, ignore=['snowflake'])
async def test_update_step_before_application_date_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_steps_and_app(db_session, application_date=date(2026, 4, 1))

    create = await async_client.post(
        '/applications/1/steps',
        json={'step_id': 1, 'step_date': '2026-04-05'},
    )
    assert create.status_code == 201, msg(201, create.status_code)
    step_id = create.json()['id']

    update = await async_client.put(
        f'/applications/1/steps/{step_id}',
        json={'step_id': 1, 'step_date': '2026-03-20'},
    )

    assert update.status_code == 422, msg(422, update.status_code)
