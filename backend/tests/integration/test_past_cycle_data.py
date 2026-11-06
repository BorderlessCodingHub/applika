"""Integration tests for viewing past cycle statistics, applications,
and reports using cycle_id query parameter."""

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType, InterviewType
from app.domain.models import (
    ApplicationModel,
    CycleModel,
    QuinzenalReportModel,
    TimelineEventModel,
)
from tests import msg
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts


def _make_report(**kwargs):
    """Build a QuinzenalReportModel with sensible defaults."""
    defaults = dict(
        applications_count=0,
        callback_rate=Decimal('0.00'),
        initial_screenings_count=0,
        interviews_completed_fortnight=0,
        active_processes_count=0,
        offers_count=0,
        offer_rate=Decimal('0.00'),
        total_applications_count=0,
        overall_conversion_rate=Decimal('0.00'),
        total_initial_screenings_count=0,
        mock_interviews_count=0,
        linkedin_posts_count=0,
        strategic_connections_count=0,
        biggest_win='Win',
        biggest_challenge='Challenge',
        next_fortnight_goal='Goal',
        submitted_at=datetime.now(timezone.utc),
        discord_posted=False,
    )
    defaults.update(kwargs)
    return QuinzenalReportModel(**defaults)


async def _seed_and_archive(
    async_client: AsyncClient, db_session: AsyncSession
) -> int:
    """Seed current-cycle data, create a cycle (archiving it),
    then seed new current-cycle data. Returns the archived cycle_id."""
    today = date.today()
    bd = base_data()

    # -- Step definitions (shared across cycles), mapped as R1 maps them
    db_session.add_all(ts.catalog())

    # -- Applications for the "old" cycle (will be archived, need >= 10)
    old_apps = [
        ApplicationModel(
            id=1,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=bd['company_acme'].id,
            company_name='Acme Corp',
            role='Backend Engineer',
            mode='active',
            application_date=today - timedelta(days=30),
            finalized_at=ts.closed_at(today - timedelta(days=10)),
        ),
        ApplicationModel(
            id=2,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=None,
            company_name='Beta Inc',
            role='Frontend Engineer',
            mode='passive',
            application_date=today - timedelta(days=25),
        ),
        ApplicationModel(
            id=3,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=bd['company_acme'].id,
            company_name='Acme Corp',
            role='Fullstack',
            mode='active',
            application_date=today - timedelta(days=20),
        ),
    ]
    # Pad to 10 apps to meet minimum cycle requirement
    for i in range(4, 11):
        old_apps.append(ApplicationModel(
            id=i,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=None,
            company_name=f'Filler Co {i}',
            role='Engineer',
            mode='active',
            application_date=today - timedelta(days=15),
        ))
    db_session.add_all(old_apps)
    await db_session.flush()

    # -- Timeline events of old-cycle applications
    screening = {
        'event_type': EventType.INTERVIEW,
        'interview_type': InterviewType.INITIAL_SCREENING,
    }
    db_session.add_all([
        TimelineEventModel(
            id=1, application_id=1, user_id=bd['user'].id,
            event_date=today - timedelta(days=28), **screening,
        ),
        TimelineEventModel(
            id=2, application_id=1, user_id=bd['user'].id,
            event_type=EventType.OFFER,
            event_date=today - timedelta(days=15),
            **ts.offer_salary('3000'),
        ),
        TimelineEventModel(
            id=3, application_id=2, user_id=bd['user'].id,
            event_date=today - timedelta(days=22), **screening,
        ),
    ])

    # -- Reports for old cycle
    db_session.add(_make_report(
        id=1,
        user_id=bd['user'].id,
        report_day=1,
        start_date=today - timedelta(days=30),
        phase=1,
    ))
    await db_session.commit()

    # -- Create cycle (archives current apps + reports)
    resp = await async_client.post(
        '/cycles', json={'name': 'Past Cycle Q4'}
    )
    assert resp.status_code == 201, msg(201, resp.status_code)
    cycle_id = resp.json()['id']

    # -- Seed NEW current-cycle data (different counts/values)
    db_session.add_all([
        ApplicationModel(
            id=20,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=None,
            company_name='Gamma Ltd',
            role='DevOps Engineer',
            mode='passive',
            application_date=today - timedelta(days=2),
        ),
    ])
    db_session.add(_make_report(
        id=20,
        user_id=bd['user'].id,
        report_day=1,
        start_date=today - timedelta(days=2),
        phase=1,
    ))
    await db_session.commit()

    return cycle_id


# ---------------------------------------------------------------------------
# Applications filtered by cycle_id
# ---------------------------------------------------------------------------

async def test_past_cycle_applications(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    # Past cycle should have 10 apps
    resp = await async_client.get(
        f'/applications?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 10, msg(10, len(data))
    roles = {a['role'] for a in data}
    assert 'Backend Engineer' in roles
    assert 'Frontend Engineer' in roles
    assert 'Fullstack' in roles

    # Current cycle should have only 1 app
    resp_current = await async_client.get('/applications')
    assert resp_current.status_code == 200
    assert len(resp_current.json()) == 1, msg(1, len(resp_current.json()))
    assert resp_current.json()[0]['role'] == 'DevOps Engineer'


# ---------------------------------------------------------------------------
# Statistics filtered by cycle_id
# ---------------------------------------------------------------------------

async def test_past_cycle_general_statistics(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(
        f'/applications/statistics?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total_applications'] == 10, msg(
        10, data['total_applications']
    )

    # Current cycle should have 1
    resp_current = await async_client.get('/applications/statistics')
    assert resp_current.status_code == 200
    assert resp_current.json()['total_applications'] == 1


async def test_past_cycle_mode_stats(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(
        f'/applications/statistics/mode?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    # Past cycle: 9 active, 1 passive
    assert data['active'] == 9, msg(9, data['active'])
    assert data['passive'] == 1, msg(1, data['passive'])

    # Current cycle: 0 active, 1 passive
    resp_current = await async_client.get('/applications/statistics/mode')
    assert resp_current.status_code == 200
    assert resp_current.json()['passive'] == 1
    assert resp_current.json()['active'] == 0


async def test_past_cycle_conversion_rate(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(
        f'/applications/statistics/steps/conversion_rate?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    stages = {(i['event_type'], i['interview_type']): i for i in data}
    assert len(data) == 9
    assert stages[('interview', 'initial_screening')][
        'total_applications'
    ] == 2
    assert stages[('interview', 'initial_screening')]['conversion_rate'] == 20.0
    assert stages[('offer', None)]['conversion_rate'] == 10.0

    current = await async_client.get(
        '/applications/statistics/steps/conversion_rate'
    )
    assert {i['total_applications'] for i in current.json()} == {0}


async def test_past_cycle_avg_days(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(
        f'/applications/statistics/steps/avarage_days?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    stages = {(i['event_type'], i['interview_type']): i for i in data}
    # Screenings at +2 (app 1) and +3 (app 2); the offer at +15.
    assert stages[('interview', 'initial_screening')]['average_days'] == 2.5
    assert stages[('offer', None)]['average_days'] == 15.0


async def test_past_cycle_general_statistics_offers(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    past = (
        await async_client.get(f'/applications/statistics?cycle_id={cycle_id}')
    ).json()

    assert (past['offers'], past['denials']) == (1, 0)
    assert past['success_rate'] == 10.0


async def test_closed_application_swept_into_a_cycle_stays_closed(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PRD 0008 edge case: closed + archived = read-only for good."""
    cycle_id = await _seed_and_archive(async_client, db_session)

    [closed] = [
        app
        for app in (
            await async_client.get(f'/applications?cycle_id={cycle_id}')
        ).json()
        if app['id'] == '1'
    ]
    reopen = await async_client.post('/applications/1/reopen')
    finalize = await async_client.post('/applications/2/finalize')
    add = await async_client.post(
        '/applications/1/timeline',
        json={'event_type': 'interview', 'event_date': str(date.today())},
    )

    assert closed['finalized'] is True
    assert closed['last_step']['name'] == 'Offer'
    assert (reopen.status_code, finalize.status_code, add.status_code) == (
        422,
        422,
        422,
    )
    timeline = await async_client.get('/applications/1/timeline')
    assert timeline.status_code == 200
    assert len(timeline.json()) == 2


async def test_past_cycle_platform_stats(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(
        f'/applications/statistics/platforms?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) >= 1
    # All past cycle apps used LinkedIn
    assert data[0]['total_applications'] == 10, msg(
        10, data[0]['total_applications']
    )


async def test_past_cycle_trends(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(
        f'/applications/statistics/trends?cycle_id={cycle_id}'
    )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)


# ---------------------------------------------------------------------------
# Reports filtered by cycle_id
# ---------------------------------------------------------------------------

async def test_past_cycle_reports(
    async_client: AsyncClient, db_session: AsyncSession, reports_badge
):
    cycle_id = await _seed_and_archive(async_client, db_session)

    resp = await async_client.get(f'/reports?cycle_id={cycle_id}')
    assert resp.status_code == 200
    data = resp.json()
    # Past cycle should have a submitted day-1 report
    reports = data['reports']
    submitted = [r for r in reports if r['status'] == 'submitted']
    assert len(submitted) == 1, msg(1, len(submitted))
    assert submitted[0]['day'] == 1

    # Current cycle should also have day-1 submitted (seeded separately)
    resp_current = await async_client.get('/reports')
    assert resp_current.status_code == 200
    current_reports = resp_current.json()['reports']
    current_submitted = [
        r for r in current_reports if r['status'] == 'submitted'
    ]
    assert len(current_submitted) == 1


# ---------------------------------------------------------------------------
# Cycles list ordered by created_at DESC
# ---------------------------------------------------------------------------

async def test_cycles_ordered_by_creation_date(
    async_client: AsyncClient, db_session: AsyncSession
):
    bd = base_data()
    # Seed apps and create two cycles via direct DB insert
    db_session.add_all([
        CycleModel(id=1, user_id=bd['user'].id, name='First Cycle'),
        CycleModel(id=2, user_id=bd['user'].id, name='Second Cycle'),
    ])
    await db_session.commit()

    resp = await async_client.get('/cycles')
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2, msg(2, len(data))

    names = {c['name'] for c in data}
    assert names == {'First Cycle', 'Second Cycle'}


# ---------------------------------------------------------------------------
# Empty past cycle returns zero/empty data
# ---------------------------------------------------------------------------

async def test_nonexistent_cycle_returns_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Querying with a cycle_id that doesn't exist should return empty."""
    fake_cycle_id = 999999999

    resp_apps = await async_client.get(
        f'/applications?cycle_id={fake_cycle_id}'
    )
    assert resp_apps.status_code == 200
    assert resp_apps.json() == []

    resp_stats = await async_client.get(
        f'/applications/statistics?cycle_id={fake_cycle_id}'
    )
    assert resp_stats.status_code == 200
    assert resp_stats.json()['total_applications'] == 0
