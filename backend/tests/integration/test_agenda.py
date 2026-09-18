"""GET /users/me/agenda on the timeline (R-026, criterion 25).

Ported behaviour from the steps-era agenda (PRD 0008 non-goal: the agenda
rules do not change): every event dated inside the window (default 30 days
either side of today, or the explicit `from_date`/`to_date`), scoped to the
acting user, ordered by `event_date` then `start_time` (unscheduled last on
a day). Each item now also carries `event_type` and `interview_type`
alongside its reverse-mapped legacy step fields.
"""

from datetime import date, time, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType, InterviewType
from tests import msg
from tests.integration import timeline_seed as ts

TODAY = date.today()


async def test_agenda_lists_events_inside_the_default_window(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(),
        # Inside the default ±30-day window.
        ts.event(
            1,
            event_date=TODAY + timedelta(days=5),
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            start_time=time(10, 0),
            end_time=time(10, 45),
        ),
        # Outside the window on both sides.
        ts.event(2, event_date=TODAY - timedelta(days=40)),
        ts.event(3, event_date=TODAY + timedelta(days=40)),
    )

    response = await async_client.get('/users/me/agenda')

    assert response.status_code == 200, msg(200, response.status_code)
    [item] = response.json()
    assert item['id'] == '1'
    assert item['event_type'] == 'interview'
    assert item['interview_type'] == 'initial_screening'
    assert item['step_id'] == str(ts.STEP_SCREEN)
    assert item['step_name'] == 'Initial Screen'
    assert item['step_color'] == '#111111'
    assert item['start_time'] == '10:00:00'
    assert item['end_time'] == '10:45:00'
    assert item['application_id'] == '1'
    assert item['company_name'] == 'Acme Corp'
    assert item['role'] == 'Software Engineer'


async def test_agenda_respects_explicit_from_and_to_date(
    async_client: AsyncClient, db_session: AsyncSession
):
    # KODI-016: the agenda is interview events only.
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(),
        ts.event(
            1,
            event_date=TODAY + timedelta(days=2),
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
        ts.event(
            2,
            event_date=TODAY + timedelta(days=50),
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
    )

    response = await async_client.get(
        '/users/me/agenda',
        params={
            'from_date': (TODAY + timedelta(days=45)).isoformat(),
            'to_date': (TODAY + timedelta(days=55)).isoformat(),
        },
    )

    assert response.status_code == 200, response.text
    assert [item['id'] for item in response.json()] == ['2']


async def test_agenda_is_ordered_by_date_then_start_time_unscheduled_last(
    async_client: AsyncClient, db_session: AsyncSession
):
    # KODI-016: the agenda is interview events only, so every seeded row
    # here is an interview (only interview events may carry a schedule).
    day = TODAY + timedelta(days=1)
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(),
        ts.event(
            1,
            event_date=day,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
            start_time=time(15, 0),
            end_time=time(16, 0),
        ),
        ts.event(
            2,
            event_date=day,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),  # unscheduled: no start_time
        ts.event(
            3,
            event_date=day,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
            start_time=time(9, 0),
            end_time=time(9, 30),
        ),
        ts.event(
            4,
            event_date=day - timedelta(days=1),
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
    )

    response = await async_client.get('/users/me/agenda')

    assert [item['id'] for item in response.json()] == ['4', '3', '1', '2']


async def test_agenda_is_scoped_to_the_acting_user(
    async_client: AsyncClient, db_session: AsyncSession
):
    # KODI-016: the agenda is interview events only.
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(),
        ts.event(
            1,
            event_date=TODAY + timedelta(days=1),
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
        ts.application(id=77, user_id=ts.OTHER_USER_ID),
        ts.event(
            2,
            application_id=77,
            user_id=ts.OTHER_USER_ID,
            event_date=TODAY + timedelta(days=1),
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
    )

    response = await async_client.get('/users/me/agenda')

    assert [item['id'] for item in response.json()] == ['1']


async def test_agenda_excludes_non_interview_events(
    async_client: AsyncClient, db_session: AsyncSession
):
    """KODI-016 (R-038/R-039): a non-interview event carries no schedule
    any more, so the agenda - once the steps agenda's window/order for
    scheduled entries - now shows interview events only."""
    day = TODAY + timedelta(days=1)
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(),
        ts.event(1, event_date=day, event_type=EventType.NOTE),
        ts.event(
            2, event_date=day, event_type=EventType.OFFER, **ts.offer_salary()
        ),
        ts.event(3, event_date=day, event_type=EventType.DENIED),
        ts.event(
            4,
            event_date=day,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
    )

    response = await async_client.get('/users/me/agenda')

    assert response.status_code == 200, response.text
    assert [item['id'] for item in response.json()] == ['4']


async def test_agenda_empty_returns_empty_list(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/users/me/agenda')

    assert response.status_code == 200
    assert response.json() == []


async def test_agenda_requires_authentication(async_client: AsyncClient):
    from app.main import app as main_app
    from app.presentation.dependencies import get_current_user

    override = main_app.dependency_overrides.pop(get_current_user)
    try:
        response = await async_client.get('/users/me/agenda')
    finally:
        main_app.dependency_overrides[get_current_user] = override

    assert response.status_code in (401, 403)
