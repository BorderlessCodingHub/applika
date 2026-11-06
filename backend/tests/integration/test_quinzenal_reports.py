"""Biweekly reports (ADR-0024): only BASE and PSP members, routed by
badge.

The tests that exercise report content run as a PSP member
(``reports_badge``). The gate: no recorded badge → 403 ``badge_required``
(administrators included); a recorded badge whose Borderless access
expired or was refused → 403 ``membership_unconfirmed``, until a
confirmation. A report goes to the webhooks of the badges its author holds.
"""

from datetime import UTC, date, datetime, timedelta

import pytest
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BadgeKey, EventType, InterviewType
from app.domain.models import (
    BorderlessAccountModel,
    QuinzenalReportModel,
    ReportWebhookBadgeModel,
    ReportWebhookModel,
    UserBadgeModel,
)
from app.main import app as main_app
from app.presentation.dependencies import get_discord_service
from tests import msg
from tests.base_db_setup import base_data
from tests.conftest import FakeBorderlessClient, bind_borderless
from tests.integration import timeline_seed as ts

USER_ID = base_data()['user'].id


class RecordingDiscordService:
    """Records each post's message and URL instead of hitting a webhook.
    URLs in ``fail_urls`` answer as a failed post (never with the URL in
    the error)."""

    def __init__(self, fail_urls: set[str] | None = None):
        self.urls: list[str | None] = []
        self.messages: list[str] = []
        self.fail_urls = fail_urls or set()

    async def post_report_message(
        self, message: str, webhook_url: str | None = None
    ) -> tuple[bool, str | None]:
        self.urls.append(webhook_url)
        self.messages.append(message)
        if webhook_url in self.fail_urls:
            return False, 'Webhook returned status 500'
        return True, None


@pytest.fixture
def recording():
    service = RecordingDiscordService()
    main_app.dependency_overrides[get_discord_service] = lambda: service
    yield service
    main_app.dependency_overrides.pop(get_discord_service, None)


async def _hook(
    db_session: AsyncSession,
    url: str,
    badge: str | list[str] | None,
    age_days: int = 0,
) -> None:
    """A webhook holding ``badge`` (one, a list, or none)."""
    if badge is None:
        badges: list[str] = []
    elif isinstance(badge, str):
        badges = [badge]
    else:
        badges = badge
    db_session.add(
        ReportWebhookModel(
            url=url,
            created_at=datetime(2026, 1, 1, tzinfo=UTC)
            + timedelta(days=age_days),
            badge_links=[ReportWebhookBadgeModel(badge=b) for b in badges],
        )
    )
    await db_session.commit()


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


@pytest.mark.usefixtures('reports_badge')
async def test_list_reports(async_client: AsyncClient):
    response = await async_client.get('/reports')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data['reports']) == 10, msg(10, len(data['reports']))
    assert data['reports'][0]['day'] == 1, msg(1, data['reports'][0]['day'])
    assert data['reports'][0]['status'] == 'pending', msg(
        'pending', data['reports'][0]['status']
    )


@pytest.mark.usefixtures('reports_badge')
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

    assert response.status_code == 201, msg(201, response.status_code)
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
    # Interview events held, of every type.
    assert report_data['metrics']['interviews_completed_fortnight'] == 4
    # Open applications past their initial screening.
    assert report_data['metrics']['active_processes_count'] == 1
    assert report_data['metrics']['offers_count'] == 1
    assert report_data['metrics']['offer_rate'] == 50
    assert report_data['metrics']['total_applications_count'] == 2
    assert report_data['metrics']['total_initial_screenings_count'] == 2
    assert report_data['metrics']['overall_conversion_rate'] == 100


@pytest.mark.usefixtures('reports_badge')
async def test_submit_future_report_is_forbidden(async_client: AsyncClient):
    response = await async_client.post('/reports/14/submit', json=_payload())
    assert response.status_code == 403, msg(403, response.status_code)


@pytest.mark.usefixtures('reports_badge')
async def test_submit_day_one_requires_start_date(async_client: AsyncClient):
    response = await async_client.post('/reports/1/submit', json=_payload())
    assert response.status_code == 400, msg(400, response.status_code)


@pytest.mark.usefixtures('reports_badge')
async def test_submit_same_report_twice_returns_conflict(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    first = await async_client.post(
        '/reports/1/submit',
        json=_payload(date.today().isoformat()),
    )
    assert first.status_code == 201, msg(201, first.status_code)

    second = await async_client.post(
        '/reports/1/submit',
        json=_payload(date.today().isoformat()),
    )
    assert second.status_code == 409, msg(409, second.status_code)


@pytest.mark.usefixtures('reports_badge')
async def test_submit_day_fourteen_when_released(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    start_date = (date.today() - timedelta(days=13)).isoformat()

    first = await async_client.post(
        '/reports/1/submit', json=_payload(start_date)
    )
    assert first.status_code == 201, msg(201, first.status_code)

    second = await async_client.post('/reports/14/submit', json=_payload())
    assert second.status_code == 201, msg(201, second.status_code)


@pytest.mark.usefixtures('reports_badge')
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
    assert day_one.status_code == 201, msg(201, day_one.status_code)

    day_fourteen = await async_client.post(
        '/reports/14/submit', json=_payload()
    )
    assert day_fourteen.status_code == 201, msg(201, day_fourteen.status_code)

    day_twenty_eight = await async_client.post(
        '/reports/28/submit', json=_payload()
    )
    assert day_twenty_eight.status_code == 201, msg(
        201, day_twenty_eight.status_code
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


@pytest.mark.usefixtures('reports_badge')
async def test_unknown_only_user_reports_zero_screenings(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-024, owner 2026-09-15 "No, explicit only": interviews of type
    unknown or any other type are not initial screenings. A former note or
    feedback is such an unknown interview (ADR-0020): it counts in
    ``interviews_completed_fortnight`` of a newly computed report, never in
    ``initial_screenings_count``."""
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


@pytest.mark.usefixtures('reports_badge')
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


@pytest.mark.usefixtures('reports_badge')
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


# ---------------------------------------------------------------------------
# Drafts are excluded from reports (KODI-032, ADR-0014)
# ---------------------------------------------------------------------------


@pytest.mark.usefixtures('reports_badge')
async def test_report_excludes_open_draft_with_events(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A draft's application and its events never count toward a report,
    even though it carries a real ``application_date`` and a real
    interview event - only ``is_draft`` decides."""
    today = date.today()
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(1, application_date=today),
        ts.event(
            1,
            1,
            event_date=today,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
        ),
        ts.application(2, application_date=today, is_draft=True),
        ts.event(
            2,
            2,
            event_date=today,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
        ),
    )

    await async_client.post(
        '/reports/1/submit', json=_payload(today.isoformat())
    )
    metrics = (await async_client.get('/reports/1')).json()['metrics']

    assert metrics['applications_count'] == 1, msg(
        1, metrics['applications_count']
    )
    assert metrics['initial_screenings_count'] == 1, msg(
        1, metrics['initial_screenings_count']
    )


# --- ADR-0024: the badge gate ---


ROUTES = [
    ('get', '/reports', None),
    ('get', '/reports/1', None),
    ('post', '/reports/1/submit', 'payload'),
]


async def _call(client: AsyncClient, method: str, path: str, body):
    if body is None:
        return await getattr(client, method)(path)
    return await client.post(
        path, json=_payload(start_date=date.today().isoformat())
    )


@pytest.mark.parametrize(('method', 'path', 'body'), ROUTES)
async def test_no_badge_is_403_badge_required(
    async_client: AsyncClient, method, path, body
):
    response = await _call(async_client, method, path, body)
    assert response.status_code == 403, msg(403, response.status_code)
    assert response.json() == {
        'detail': 'Reports are for Borderless BASE and PSP members',
        'code': 'badge_required',
    }


@pytest.mark.parametrize(('method', 'path', 'body'), ROUTES)
async def test_admin_without_a_badge_is_refused_too(
    admin_client: AsyncClient, method, path, body
):
    response = await _call(admin_client, method, path, body)
    assert response.status_code == 403
    assert response.json()['code'] == 'badge_required'


async def test_revoked_badge_only_is_badge_required(
    async_client: AsyncClient, db_session: AsyncSession
):
    await bind_borderless(db_session, USER_ID, badge=None)
    db_session.add(
        UserBadgeModel(
            user_id=USER_ID,
            badge='borderless_psp',
            source='borderless',
            revoked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    response = await async_client.get('/reports')
    assert response.json()['code'] == 'badge_required'


@pytest.mark.parametrize(('method', 'path', 'body'), ROUTES)
@pytest.mark.parametrize(
    ('status', 'expires_in'),
    [
        ('active', timedelta(seconds=-1)),
        ('needs_reconnect', timedelta(days=3)),
    ],
    ids=['expired', 'needs_reconnect'],
)
async def test_badge_that_does_not_count_is_403_membership_unconfirmed(
    async_client: AsyncClient,
    db_session: AsyncSession,
    method,
    path,
    body,
    status,
    expires_in,
):
    await bind_borderless(
        db_session, USER_ID, status=status, expires_in=expires_in
    )
    response = await _call(async_client, method, path, body)
    assert response.status_code == 403
    assert response.json() == {
        'detail': 'Sign in again to confirm your membership',
        'code': 'membership_unconfirmed',
    }


async def test_confirm_then_reports_load(
    async_client: AsyncClient,
    db_session: AsyncSession,
    borderless: FakeBorderlessClient,
):
    await bind_borderless(
        db_session,
        USER_ID,
        borderless_id='bl-me',
        expires_in=timedelta(seconds=-1),
    )
    borderless.add(id='bl-me', email='me@example.com', membership='PSP')
    assert (await async_client.get('/reports')).status_code == 403

    confirm = await async_client.post(
        '/auth/borderless/confirm',
        json={'email': 'me@example.com', 'password': 'correct-horse'},
    )
    assert confirm.status_code == 204, confirm.text

    assert (await async_client.get('/reports')).status_code == 200


async def test_reports_stored_before_a_loss_come_back_on_regain(
    async_client: AsyncClient, db_session: AsyncSession
):
    await bind_borderless(db_session, USER_ID)
    first = await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date=date.today().isoformat()),
    )
    assert first.status_code == 201
    await db_session.execute(
        update(UserBadgeModel).values(revoked_at=datetime.now(UTC))
    )
    await db_session.commit()
    assert (await async_client.get('/reports/1')).status_code == 403

    db_session.add(
        UserBadgeModel(
            user_id=USER_ID, badge='borderless_base', source='borderless'
        )
    )
    await db_session.commit()

    listing = await async_client.get('/reports')
    assert listing.status_code == 200
    assert listing.json()['reports'][0]['status'] == 'submitted'
    stored = await db_session.scalars(select(QuinzenalReportModel))
    assert len(list(stored)) == 1


# --- ADR-0024: report routing by badge ---


async def test_psp_member_posts_to_psp_hooks_only_without_mention(
    async_client: AsyncClient,
    db_session: AsyncSession,
    recording: RecordingDiscordService,
):
    await bind_borderless(db_session, USER_ID)
    await _hook(db_session, 'https://hook/psp-new', 'borderless_psp', 2)
    await _hook(db_session, 'https://hook/psp-old', 'borderless_psp', 1)
    await _hook(db_session, 'https://hook/base', 'borderless_base')
    await _hook(db_session, 'https://hook/unassigned', None)

    response = await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date=date.today().isoformat()),
    )

    assert response.status_code == 201
    assert response.json()['discord_posted'] is True
    assert recording.urls == ['https://hook/psp-old', 'https://hook/psp-new']
    username = base_data()['user'].username
    for message in recording.messages:
        assert f'- @{username}\n' in message
        assert '<@' not in message


async def test_base_member_posts_to_base_hooks_only(
    async_client: AsyncClient,
    db_session: AsyncSession,
    recording: RecordingDiscordService,
):
    await bind_borderless(db_session, USER_ID, badge=BadgeKey.BORDERLESS_BASE)
    await _hook(db_session, 'https://hook/psp', 'borderless_psp')
    await _hook(db_session, 'https://hook/base', 'borderless_base')

    await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date=date.today().isoformat()),
    )

    assert recording.urls == ['https://hook/base']


@pytest.mark.parametrize(
    'member', [BadgeKey.BORDERLESS_BASE, BadgeKey.BORDERLESS_PSP]
)
async def test_a_hook_holding_both_badges_reaches_either_member_once(
    async_client: AsyncClient,
    db_session: AsyncSession,
    recording: RecordingDiscordService,
    member: BadgeKey,
):
    await bind_borderless(db_session, USER_ID, badge=member)
    await _hook(
        db_session, 'https://hook/both', ['borderless_base', 'borderless_psp']
    )
    await _hook(db_session, 'https://hook/psp', 'borderless_psp', 1)

    response = await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date=date.today().isoformat()),
    )

    assert response.status_code == 201
    expected = ['https://hook/both']
    if member is BadgeKey.BORDERLESS_PSP:
        expected.append('https://hook/psp')
    assert recording.urls == expected


async def test_unassigned_hooks_receive_nothing(
    async_client: AsyncClient,
    db_session: AsyncSession,
    recording: RecordingDiscordService,
):
    await bind_borderless(db_session, USER_ID)
    await _hook(db_session, 'https://hook/unassigned', None)

    response = await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date=date.today().isoformat()),
    )

    assert response.status_code == 201
    assert response.json()['discord_posted'] is False
    assert recording.urls == []


async def test_webhook_failure_never_fails_the_submission(
    async_client: AsyncClient, db_session: AsyncSession
):
    service = RecordingDiscordService(
        fail_urls={'https://hook/a', 'https://hook/b'}
    )
    main_app.dependency_overrides[get_discord_service] = lambda: service
    try:
        await bind_borderless(db_session, USER_ID)
        await _hook(db_session, 'https://hook/a', 'borderless_psp')
        await _hook(db_session, 'https://hook/b', 'borderless_psp', 1)

        response = await async_client.post(
            '/reports/1/submit',
            json=_payload(start_date=date.today().isoformat()),
        )
    finally:
        main_app.dependency_overrides.pop(get_discord_service, None)

    assert response.status_code == 201
    body = response.json()
    assert body['success'] is True
    assert body['discord_posted'] is False
    assert 'https://hook' not in (body['discord_error'] or '')
    stored = await db_session.scalars(select(QuinzenalReportModel))
    assert len(list(stored)) == 1


async def test_one_failed_post_still_counts_discord_posted(
    async_client: AsyncClient, db_session: AsyncSession
):
    service = RecordingDiscordService(fail_urls={'https://hook/b'})
    main_app.dependency_overrides[get_discord_service] = lambda: service
    try:
        await bind_borderless(db_session, USER_ID)
        await _hook(db_session, 'https://hook/a', 'borderless_psp')
        await _hook(db_session, 'https://hook/b', 'borderless_psp', 1)
        response = await async_client.post(
            '/reports/1/submit',
            json=_payload(start_date=date.today().isoformat()),
        )
    finally:
        main_app.dependency_overrides.pop(get_discord_service, None)

    body = response.json()
    assert body['discord_posted'] is True
    assert body['discord_error'] == 'Webhook returned status 500'


async def test_binding_row_is_unchanged_by_a_report(
    async_client: AsyncClient, db_session: AsyncSession
):
    binding = await bind_borderless(db_session, USER_ID)
    before = binding.updated_at
    await async_client.get('/reports')
    after = await db_session.scalar(
        select(BorderlessAccountModel.updated_at).where(
            BorderlessAccountModel.id == binding.id
        )
    )
    assert after == before
