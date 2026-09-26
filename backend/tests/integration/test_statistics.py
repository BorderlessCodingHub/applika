from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import DeniedReason, EventType, InterviewType
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
            denied_reason=DeniedReason.UNKNOWN,
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
    # AC23: application 1 is closed, 2 and 3 are open.
    assert data['active'] == 2, msg(2, data['active'])


async def test_general_statistics_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/applications/statistics')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['total_applications'] == 0, msg(0, data['total_applications'])


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


async def test_active_count_open_closed_reopened_other_user_other_cycle(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC23: ``active`` = current user's applications in the same
    scope/cycle filter as ``total_applications`` whose ``finalized_at`` is
    NULL.

    Covers: an open application, one closed with a bodyless finalize, one
    closed with the new outcome finalize, one closed then reopened (active
    again), another user's application (never counted) and another cycle's
    application (counted only when ``cycle_id`` selects it).
    """
    today = date.today()
    user = base_data()['user'].id
    other_user = base_data()['admin_user'].id
    await ts.seed(
        db_session,
        *ts.catalog(),
        CycleModel(id=77, user_id=user, name='Past'),
        ts.application(id=1, application_date=today),  # stays open
        ts.application(id=2, application_date=today),  # bodyless finalize
        ts.application(id=3, application_date=today),  # outcome finalize
        ts.application(id=4, application_date=today),  # finalize then reopen
        ts.application(
            id=5, application_date=today, cycle_id=77
        ),  # other cycle
        ts.application(id=6, application_date=today, user_id=other_user),
    )

    bodyless = await async_client.post('/applications/2/finalize')
    assert bodyless.status_code == 200, msg(200, bodyless.status_code)

    outcome = await async_client.post(
        '/applications/3/finalize', json={'outcome': 'denied'}
    )
    assert outcome.status_code == 200, msg(200, outcome.status_code)

    closed_then_reopened = await async_client.post('/applications/4/finalize')
    assert closed_then_reopened.status_code == 200, msg(
        200, closed_then_reopened.status_code
    )
    reopened = await async_client.post('/applications/4/reopen')
    assert reopened.status_code == 200, msg(200, reopened.status_code)

    current = await async_client.get('/applications/statistics')
    assert current.status_code == 200, msg(200, current.status_code)
    current_data = current.json()
    # Applications 1-4 are in the default (cycle_id IS NULL) scope; 5 is in
    # cycle 77 and 6 belongs to another user, so neither is in scope here.
    assert current_data['total_applications'] == 4, msg(
        4, current_data['total_applications']
    )
    # Only 1 (open) and 4 (reopened) are not closed.
    assert current_data['active'] == 2, msg(2, current_data['active'])

    past = await async_client.get('/applications/statistics?cycle_id=77')
    assert past.status_code == 200, msg(200, past.status_code)
    past_data = past.json()
    assert past_data['total_applications'] == 1, msg(
        1, past_data['total_applications']
    )
    assert past_data['active'] == 1, msg(1, past_data['active'])


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
    assert past_rates[('interview', 'initial_screening')][
        'conversion_rate'
    ] == (100.0)


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


async def test_mode_stats(async_client: AsyncClient, db_session: AsyncSession):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/mode')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['active'] == 2, msg(2, data['active'])
    assert data['passive'] == 1, msg(1, data['passive'])


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------


async def test_trends(async_client: AsyncClient, db_session: AsyncSession):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/trends')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)


# ---------------------------------------------------------------------------
# Drafts are excluded (KODI-032, ADR-0014)
# ---------------------------------------------------------------------------


async def test_statistics_exclude_open_draft_with_cv_copy(
    async_client: AsyncClient, db_session: AsyncSession
):
    """An open draft, even with a CV copy attached, must not move any
    statistics number - it is not a real application until it is
    finished."""
    await _seed_stats_data(db_session)

    before_general = (await async_client.get('/applications/statistics')).json()
    before_platforms = (
        await async_client.get('/applications/statistics/platforms')
    ).json()
    before_mode = (
        await async_client.get('/applications/statistics/mode')
    ).json()

    draft_resp = await async_client.post(
        '/applications/drafts',
        json={
            'company_id': base_data()['company_acme'].id,
            'company_name': 'Acme Corp',
            'role': 'Draft Role',
            'platform_id': base_data()['plat_linkedin'].id,
        },
    )
    assert draft_resp.status_code == 201, msg(201, draft_resp.text)
    draft_id = draft_resp.json()['id']

    base_cv_resp = await async_client.post(
        '/base-cvs',
        json={
            'name': 'Draft Master',
            'full_name': 'Ada Lovelace',
            'headline': 'Engineer',
            'location': 'Lisbon, PT',
            'email': 'ada@example.com',
        },
    )
    assert base_cv_resp.status_code == 201, msg(201, base_cv_resp.text)
    cv_resp = await async_client.post(
        f'/applications/{draft_id}/cv',
        json={'base_cv_id': base_cv_resp.json()['id']},
    )
    assert cv_resp.status_code == 201, msg(201, cv_resp.text)

    after_general = (await async_client.get('/applications/statistics')).json()
    after_platforms = (
        await async_client.get('/applications/statistics/platforms')
    ).json()
    after_mode = (
        await async_client.get('/applications/statistics/mode')
    ).json()

    assert after_general == before_general, msg(before_general, after_general)
    assert after_platforms == before_platforms, msg(
        before_platforms, after_platforms
    )
    assert after_mode == before_mode, msg(before_mode, after_mode)
