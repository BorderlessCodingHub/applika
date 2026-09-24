from datetime import date, timedelta

from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import envs
from app.core.crypto import encrypt_token
from app.core.enums import EventType, InterviewType
from app.domain.models import QuinzenalReportModel, UserModel
from app.main import app as main_app
from app.presentation.dependencies import (
    get_discord_service,
    get_github_service,
)
from tests import msg
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts


class FakeGitHubService:
    """A network-free org-membership stand-in (T046)."""

    def __init__(self, is_member: bool):
        self.is_member = is_member

    async def check_org_membership(self, github_token: str) -> bool:
        return self.is_member


class RecordingDiscordService:
    """Records ``mention_user_id`` and ``message`` instead of hitting a real
    webhook, so a test can assert the mention actually reached the posted
    content (T046) and not just the ``mention_user_id`` argument."""

    def __init__(self):
        self.calls: list[int | None] = []
        self.messages: list[str] = []

    async def post_report_message(
        self, message: str, mention_user_id: int | None = None
    ) -> tuple[bool, str | None]:
        self.calls.append(mention_user_id)
        self.messages.append(message)
        return True, None


async def _make_org_member(
    monkeypatch, db_session: AsyncSession, is_member: bool
) -> RecordingDiscordService:
    """DISCORD_CLIENT_ID/SECRET are forced unset for this whole test module
    (T046): a server without a Discord app must still mention linked users,
    since the webhook mentions are unrelated to the OAuth link app."""
    monkeypatch.setattr(envs, 'DISCORD_CLIENT_ID', None)
    monkeypatch.setattr(envs, 'DISCORD_CLIENT_SECRET', None)
    monkeypatch.setattr(
        envs, 'GITHUB_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    user = await db_session.get(UserModel, base_data()['user'].id)
    assert user is not None
    user.encrypted_github_token = encrypt_token('gh-token')
    await db_session.commit()

    recording = RecordingDiscordService()
    main_app.dependency_overrides[get_github_service] = lambda: (
        FakeGitHubService(is_member)
    )
    main_app.dependency_overrides[get_discord_service] = lambda: recording
    return recording


SCREENING = {
    'event_type': EventType.INTERVIEW,
    'interview_type': InterviewType.INITIAL_SCREENING,
}
UNKNOWN_INTERVIEW = {
    'event_type': EventType.INTERVIEW,
    'interview_type': InterviewType.UNKNOWN,
}


def _payload(start_date: str | None = None) -> dict:
    payload = {
        'mock_interviews_count': 2,
        'linkedin_posts_count': 4,
        'strategic_connections_count': 15,
        'biggest_win': 'First technical interview passed!',
        'biggest_challenge': 'System Design difficulty',
        'next_fortnight_goal': 'Do 3 System Design focused mocks',
    }
    if start_date is not None:
        payload['start_date'] = start_date
    return payload


async def test_list_reports(async_client: AsyncClient):
    response = await async_client.get('/reports')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data['reports']) == 10, msg(10, len(data['reports']))
    assert data['reports'][0]['day'] == 1, msg(1, data['reports'][0]['day'])
    assert data['reports'][0]['status'] == 'pending', msg(
        'pending', data['reports'][0]['status']
    )


async def test_submit_day_one_report(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-024: new reports are computed from the timeline.

    App 1 (closed): initial screening, an unknown interview, an offer.
    App 2 (open): initial screening, an unknown interview.
    """
    today = date.today()
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(
            1, application_date=today, finalized_at=ts.closed_at(today)
        ),
        ts.application(2, application_date=today, company_name='Beta'),
        ts.event(1, 1, event_date=today, **SCREENING),
        ts.event(2, 1, event_date=today, **UNKNOWN_INTERVIEW),
        ts.event(
            3,
            1,
            event_date=today,
            event_type=EventType.OFFER,
            **ts.offer_salary('1'),
        ),
        ts.event(4, 2, event_date=today, **SCREENING),
        ts.event(5, 2, event_date=today, **UNKNOWN_INTERVIEW),
    )

    response = await async_client.post(
        '/reports/1/submit',
        json=_payload(today.isoformat()),
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['success'] is True, msg(True, data['success'])
    assert isinstance(data['discord_posted'], bool)

    report_response = await async_client.get('/reports/1')
    assert report_response.status_code == 200, msg(
        200, report_response.status_code
    )
    report_data = report_response.json()
    assert report_data['report']['submitted'] is True
    assert report_data['metrics']['applications_count'] == 2
    assert report_data['metrics']['initial_screenings_count'] == 2
    assert report_data['metrics']['callback_rate'] == 100
    # Interview events held, of every type (mynextjob's rule).
    assert report_data['metrics']['interviews_completed_fortnight'] == 4
    # Open applications past their initial screening.
    assert report_data['metrics']['active_processes_count'] == 1
    assert report_data['metrics']['offers_count'] == 1
    assert report_data['metrics']['offer_rate'] == 50
    assert report_data['metrics']['total_applications_count'] == 2
    assert report_data['metrics']['total_initial_screenings_count'] == 2
    assert report_data['metrics']['overall_conversion_rate'] == 100


async def test_submit_future_report_is_forbidden(async_client: AsyncClient):
    response = await async_client.post('/reports/14/submit', json=_payload())
    assert response.status_code == 403, msg(403, response.status_code)


async def test_submit_day_one_requires_start_date(async_client: AsyncClient):
    response = await async_client.post('/reports/1/submit', json=_payload())
    assert response.status_code == 400, msg(400, response.status_code)


async def test_submit_same_report_twice_returns_conflict(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    first = await async_client.post(
        '/reports/1/submit',
        json=_payload(date.today().isoformat()),
    )
    assert first.status_code == 200, msg(200, first.status_code)

    second = await async_client.post(
        '/reports/1/submit',
        json=_payload(date.today().isoformat()),
    )
    assert second.status_code == 409, msg(409, second.status_code)


async def test_submit_day_fourteen_when_released(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    start_date = (date.today() - timedelta(days=13)).isoformat()

    first = await async_client.post(
        '/reports/1/submit', json=_payload(start_date)
    )
    assert first.status_code == 200, msg(200, first.status_code)

    second = await async_client.post('/reports/14/submit', json=_payload())
    assert second.status_code == 200, msg(200, second.status_code)


async def test_day_twenty_eight_uses_accumulated_rates(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    start_date = date.today() - timedelta(days=27)
    fortnight_start = date.today() - timedelta(days=13)

    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(
            1,
            application_date=start_date + timedelta(days=4),
            company_name='LegacyCo',
        ),
        ts.application(
            2,
            application_date=fortnight_start + timedelta(days=2),
            company_name='NewCo',
        ),
        ts.event(1, 1, event_date=start_date + timedelta(days=6), **SCREENING),
        ts.event(
            2,
            1,
            event_date=fortnight_start + timedelta(days=3),
            event_type=EventType.OFFER,
            **ts.offer_salary('1'),
        ),
    )

    day_one = await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date.isoformat()),
    )
    assert day_one.status_code == 200, msg(200, day_one.status_code)

    day_fourteen = await async_client.post(
        '/reports/14/submit', json=_payload()
    )
    assert day_fourteen.status_code == 200, msg(200, day_fourteen.status_code)

    day_twenty_eight = await async_client.post(
        '/reports/28/submit', json=_payload()
    )
    assert day_twenty_eight.status_code == 200, msg(
        200, day_twenty_eight.status_code
    )

    report_response = await async_client.get('/reports/28')
    assert report_response.status_code == 200, msg(
        200, report_response.status_code
    )
    report_data = report_response.json()

    assert report_data['metrics']['applications_count'] == 1
    assert report_data['metrics']['initial_screenings_count'] == 0
    assert report_data['metrics']['offers_count'] == 1

    assert report_data['metrics']['total_applications_count'] == 2
    assert report_data['metrics']['total_initial_screenings_count'] == 1
    assert report_data['metrics']['callback_rate'] == 50
    assert report_data['metrics']['offer_rate'] == 100
    assert report_data['metrics']['overall_conversion_rate'] == 50


async def test_unknown_only_user_reports_zero_screenings(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-024, owner 2026-09-15 "No, explicit only": interviews of type
    unknown or any other type are not initial screenings."""
    today = date.today()
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(1, application_date=today),
        ts.application(2, application_date=today, company_name='Beta'),
        ts.event(1, 1, event_date=today, **UNKNOWN_INTERVIEW),
        ts.event(
            2,
            2,
            event_date=today,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.TECHNICAL,
        ),
    )

    await async_client.post(
        '/reports/1/submit', json=_payload(today.isoformat())
    )
    metrics = (await async_client.get('/reports/1')).json()['metrics']

    assert metrics['applications_count'] == 2
    assert metrics['initial_screenings_count'] == 0
    assert metrics['total_initial_screenings_count'] == 0
    assert metrics['callback_rate'] == 0
    assert metrics['interviews_completed_fortnight'] == 2
    assert metrics['active_processes_count'] == 0


async def test_pending_report_preview_counts_only_initial_screenings(
    async_client: AsyncClient, db_session: AsyncSession
):
    today = date.today()
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(1, application_date=today),
        ts.event(1, 1, event_date=today, **UNKNOWN_INTERVIEW),
    )
    await async_client.post(
        '/reports/1/submit',
        json=_payload((today - timedelta(days=13)).isoformat()),
    )

    preview = (await async_client.get('/reports/14')).json()

    assert preview['metrics']['initial_screenings_count'] == 0


async def test_stored_report_is_never_recomputed(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-025: a report submitted with the steps-era numbers keeps them,
    whatever the timeline says now."""
    today = date.today()
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(1, application_date=today),
        QuinzenalReportModel(
            user_id=base_data()['user'].id,
            report_day=1,
            start_date=today,
            phase=1,
            applications_count=7,
            callback_rate=42.5,
            initial_screenings_count=3,
            interviews_completed_fortnight=9,
            active_processes_count=2,
            offers_count=1,
            offer_rate=33.33,
            total_applications_count=7,
            overall_conversion_rate=42.5,
            total_initial_screenings_count=3,
            mock_interviews_count=1,
            linkedin_posts_count=1,
            strategic_connections_count=1,
            biggest_win='w',
            biggest_challenge='c',
            next_fortnight_goal='g',
            submitted_at=ts.closed_at(today),
        ),
        ts.event(1, 1, event_date=today, **SCREENING),
    )

    metrics = (await async_client.get('/reports/1')).json()['metrics']

    assert metrics['applications_count'] == 7
    assert metrics['initial_screenings_count'] == 3
    assert metrics['interviews_completed_fortnight'] == 9
    assert metrics['callback_rate'] == 42.5
    assert metrics['offers_count'] == 1


# --- KODI-021: Discord webhook mentions (T046) ---


async def test_linked_org_member_report_mentions_user(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording = await _make_org_member(monkeypatch, db_session, is_member=True)
    user = await db_session.get(UserModel, base_data()['user'].id)
    assert user is not None
    user.discord_id = 555
    await db_session.commit()

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 200, msg(200, response.status_code)
    assert recording.calls == [555], msg([555], recording.calls)
    header = recording.messages[0].splitlines()[0]
    assert header == (
        f'\U0001f3c1 **REPORT - DAY 1 OF 120** - @{base_data()["user"].username} <@555>'
    ), msg('header ending in <@555>', header)


async def test_unlinked_org_member_report_mentions_nobody(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording = await _make_org_member(monkeypatch, db_session, is_member=True)

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 200, msg(200, response.status_code)
    assert recording.calls == [None], msg([None], recording.calls)
    header = recording.messages[0].splitlines()[0]
    assert header == (
        f'\U0001f3c1 **REPORT - DAY 1 OF 120** - @{base_data()["user"].username}'
    ), msg('unlinked header with no mention', header)


async def test_non_member_report_never_posts_to_discord(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording = await _make_org_member(monkeypatch, db_session, is_member=False)
    user = await db_session.get(UserModel, base_data()['user'].id)
    assert user is not None
    user.discord_id = 555
    await db_session.commit()

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 200, msg(200, response.status_code)
    assert recording.calls == [], msg([], recording.calls)
