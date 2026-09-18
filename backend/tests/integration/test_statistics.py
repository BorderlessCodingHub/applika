from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType, InterviewType
from app.domain.models import (
    ApplicationModel,
    CycleModel,
    TimelineEventModel,
)
from tests import msg
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts


async def _seed_stats_data(db_session: AsyncSession):
    """Three applications and their timelines.

    1: initial screening (day -3, i.e. +2 from applying), technical
       (+3), offer (+5), denied (+5); closed.
    2: initial screening (+2), a note (not a stage).
    3: nothing.
    """
    today = date.today()
    user = base_data()['user'].id
    await ts.seed(
        db_session,
        *ts.catalog(),
        ApplicationModel(
            id=1,
            user_id=user,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=today - timedelta(days=5),
            finalized_at=ts.closed_at(today),
        ),
        ApplicationModel(
            id=2,
            user_id=user,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=None,
            company_name='Beta Inc',
            role='Backend Engineer',
            mode='passive',
            application_date=today - timedelta(days=3),
        ),
        ApplicationModel(
            id=3,
            user_id=user,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Frontend Engineer',
            mode='active',
            application_date=today,
        ),
        TimelineEventModel(
            id=1,
            application_id=1,
            user_id=user,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            event_date=today - timedelta(days=3),
        ),
        TimelineEventModel(
            id=4,
            application_id=1,
            user_id=user,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.TECHNICAL,
            event_date=today - timedelta(days=2),
        ),
        TimelineEventModel(
            id=2,
            application_id=1,
            user_id=user,
            event_type=EventType.OFFER,
            event_date=today,
            **ts.offer_salary('100'),
        ),
        TimelineEventModel(
            id=5,
            application_id=1,
            user_id=user,
            event_type=EventType.DENIED,
            event_date=today,
        ),
        TimelineEventModel(
            id=3,
            application_id=2,
            user_id=user,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            event_date=today - timedelta(days=1),
        ),
        TimelineEventModel(
            id=6,
            application_id=2,
            user_id=user,
            event_type=EventType.NOTE,
            event_date=today,
        ),
    )


STAGE_ORDER = [
    ('interview', 'unknown'),
    ('interview', 'initial_screening'),
    ('interview', 'technical'),
    ('interview', 'cultural'),
    ('interview', 'hiring_manager'),
    ('interview', 'take_home'),
    ('interview', 'final'),
    ('offer', None),
    ('denied', None),
]


def _stages(data: list[dict]) -> dict[tuple, dict]:
    return {(item['event_type'], item['interview_type']): item for item in data}


# ---------------------------------------------------------------------------
# General statistics
# ---------------------------------------------------------------------------

async def test_general_statistics(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['total_applications'] == 3, msg(3, data['total_applications'])
    # R-022: applications with at least one offer / denied event; an
    # application with both counts in both.
    assert data['offers'] == 1, msg(1, data['offers'])
    assert data['denials'] == 1, msg(1, data['denials'])
    assert data['success_rate'] == 33.3


async def test_general_statistics_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/applications/statistics')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['total_applications'] == 0, msg(
        0, data['total_applications']
    )


# ---------------------------------------------------------------------------
# Conversion rate
# ---------------------------------------------------------------------------

async def test_step_conversion_rate(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get(
        '/applications/statistics/steps/conversion_rate'
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    # R-023: every stage, fixed order, new shape.
    assert [
        (item['event_type'], item['interview_type']) for item in data
    ] == STAGE_ORDER
    for item in data:
        assert set(item) == {
            'event_type',
            'interview_type',
            'total_applications',
            'conversion_rate',
        }
    stages = _stages(data)
    assert stages[('interview', 'initial_screening')]['total_applications'] == 2
    assert stages[('interview', 'initial_screening')]['conversion_rate'] == 66.7
    assert stages[('interview', 'technical')]['total_applications'] == 1
    assert stages[('interview', 'unknown')]['total_applications'] == 0
    assert stages[('offer', None)]['conversion_rate'] == 33.3
    assert stages[('denied', None)]['total_applications'] == 1


# ---------------------------------------------------------------------------
# Average days per step
# ---------------------------------------------------------------------------

async def test_step_average_days(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get(
        '/applications/statistics/steps/avarage_days'
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert [
        (item['event_type'], item['interview_type']) for item in data
    ] == STAGE_ORDER
    stages = _stages(data)
    # Screenings: +2 (app 1) and +2 (app 2).
    assert stages[('interview', 'initial_screening')]['average_days'] == 2.0
    assert stages[('interview', 'technical')]['average_days'] == 3.0
    assert stages[('offer', None)]['average_days'] == 5.0
    assert stages[('denied', None)]['average_days'] == 5.0
    assert stages[('interview', 'final')]['average_days'] == 0.0


async def test_statistics_per_cycle_scope(
    async_client: AsyncClient, db_session: AsyncSession
):
    """An archived cycle's statistics read that cycle's timelines only."""
    await _seed_stats_data(db_session)
    await ts.seed(
        db_session,
        CycleModel(id=77, user_id=base_data()['user'].id, name='Past'),
    )
    application = await db_session.get(ApplicationModel, 2)
    assert application is not None
    application.cycle_id = 77
    await db_session.commit()

    current = (await async_client.get('/applications/statistics')).json()
    past = (
        await async_client.get('/applications/statistics?cycle_id=77')
    ).json()
    past_rates = _stages(
        (
            await async_client.get(
                '/applications/statistics/steps/conversion_rate?cycle_id=77'
            )
        ).json()
    )

    assert current['total_applications'] == 2
    assert past['total_applications'] == 1
    assert past['offers'] == 0
    assert past_rates[('interview', 'initial_screening')]['conversion_rate'] == (
        100.0
    )


# ---------------------------------------------------------------------------
# Platform stats
# ---------------------------------------------------------------------------

async def test_platform_stats(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/platforms')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


# ---------------------------------------------------------------------------
# Mode stats
# ---------------------------------------------------------------------------

async def test_mode_stats(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/mode')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['active'] == 2, msg(2, data['active'])
    assert data['passive'] == 1, msg(1, data['passive'])


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------

async def test_trends(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/trends')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)
