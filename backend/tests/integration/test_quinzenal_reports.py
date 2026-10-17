from datetime import date, datetime, timedelta

from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.discord_oauth_service import (
    DiscordGrant,
    DiscordGrantRevoked,
    DiscordUnavailable,
)
from app.config.settings import envs
from app.core.crypto import decrypt_discord_token
from app.core.enums import DiscordConnectionStatus, EventType, InterviewType
from app.domain.models import (
    DiscordConnectionModel,
    DiscordReportWebhookModel,
    QuinzenalReportModel,
    UserModel,
)
from app.main import app as main_app
from app.presentation.dependencies import (
    get_discord_oauth_service,
    get_discord_service,
)
from tests import msg
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts
from tests.integration.test_account_link_discord import _seed_connection


class RecordingDiscordService:
    """Records ``mention_user_id``, ``message`` and ``webhook_url`` instead
    of hitting a real webhook (K8, T132), so a test can assert the mention
    reached the posted content and which URL each post went to. URLs listed
    in ``fail_urls`` answer as a failed post."""

    def __init__(self, fail_urls: set[str] | None = None):
        self.calls: list[tuple[int | None, str | None]] = []
        self.messages: list[str] = []
        self.fail_urls = fail_urls or set()

    async def post_report_message(
        self,
        message: str,
        mention_user_id: int | None = None,
        webhook_url: str | None = None,
    ) -> tuple[bool, str | None]:
        self.calls.append((mention_user_id, webhook_url))
        self.messages.append(message)
        if webhook_url in self.fail_urls:
            # Never the URL itself in the error text (R-030) - a real
            # ``DiscordService`` failure message never carries it either.
            return False, 'Webhook returned status 500'
        return True, None


class FakeDiscordOAuthService:
    """A network-free stand-in for ``DiscordOAuthService`` (K8, T132/T133/
    T134): ``refresh`` optionally raises, ``list_guild_ids``/
    ``get_member_role_ids`` return fixed sets."""

    def __init__(
        self,
        *,
        guild_ids: set[int] | None = None,
        member_roles: dict[int, set[int]] | None = None,
        refresh_error: Exception | None = None,
        list_guild_ids_error: Exception | None = None,
    ):
        self.guild_ids = guild_ids if guild_ids is not None else set()
        self.member_roles = member_roles or {}
        self.refresh_error = refresh_error
        self.list_guild_ids_error = list_guild_ids_error
        self.refresh_calls = 0
        self.list_guild_ids_calls = 0

    def is_configured(self) -> bool:
        return True

    async def refresh(self, refresh_token: str) -> DiscordGrant:
        self.refresh_calls += 1
        if self.refresh_error:
            raise self.refresh_error
        return DiscordGrant(
            access_token='fresh-access-token',
            refresh_token='rotated-refresh-token',
            expires_in=3600,
            scope='identify guilds guilds.members.read',
        )

    async def list_guild_ids(self, access_token: str) -> set[int]:
        self.list_guild_ids_calls += 1
        if self.list_guild_ids_error:
            raise self.list_guild_ids_error
        return self.guild_ids

    async def get_member_role_ids(
        self, access_token: str, guild_id: int
    ) -> set[int]:
        return self.member_roles.get(guild_id, set())


def _setup_discord(
    monkeypatch,
    *,
    guild_ids: set[int] | None = None,
    member_roles: dict[int, set[int]] | None = None,
    refresh_error: Exception | None = None,
    list_guild_ids_error: Exception | None = None,
    fail_urls: set[str] | None = None,
) -> tuple[RecordingDiscordService, FakeDiscordOAuthService]:
    monkeypatch.setattr(envs, 'DISCORD_CLIENT_ID', 'client-id')
    monkeypatch.setattr(envs, 'DISCORD_CLIENT_SECRET', 'client-secret')
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    recording = RecordingDiscordService(fail_urls=fail_urls)
    fake_oauth = FakeDiscordOAuthService(
        guild_ids=guild_ids,
        member_roles=member_roles,
        refresh_error=refresh_error,
        list_guild_ids_error=list_guild_ids_error,
    )
    main_app.dependency_overrides[get_discord_service] = lambda: recording
    main_app.dependency_overrides[get_discord_oauth_service] = lambda: (
        fake_oauth
    )
    return recording, fake_oauth


async def _seed_webhook(
    db_session: AsyncSession,
    *,
    guild_id: int,
    webhook_url: str,
    role_ids: list[int] | None = None,
    created_at: datetime | None = None,
) -> DiscordReportWebhookModel:
    webhook = DiscordReportWebhookModel(
        guild_id=guild_id,
        webhook_url=webhook_url,
        role_ids=role_ids or [],
    )
    if created_at is not None:
        webhook.created_at = created_at
    db_session.add(webhook)
    await db_session.commit()
    await db_session.refresh(webhook)
    return webhook


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
    assert first.status_code == 201, msg(201, first.status_code)

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
    assert first.status_code == 201, msg(201, first.status_code)

    second = await async_client.post('/reports/14/submit', json=_payload())
    assert second.status_code == 201, msg(201, second.status_code)


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


# --- K8: report routing by live Discord servers and roles (T132/T133/T134) ---


async def test_no_connection_report_posts_nowhere(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(monkeypatch, guild_ids={10})
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/a')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is False
    assert recording.calls == []

    await db_session.commit()
    stored = await db_session.get(
        QuinzenalReportModel, int(data['report_id']), populate_existing=True
    )
    assert stored is not None
    assert stored.discord_posted is False


async def test_member_of_configured_server_posts_to_each_hook_with_mention(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(monkeypatch, guild_ids={10})
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/a')
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/b')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is True
    assert data['discord_error'] is None
    posted_urls = {url for _, url in recording.calls}
    assert posted_urls == {'https://hook/a', 'https://hook/b'}
    for mention_id, _ in recording.calls:
        assert mention_id == 555
    header = recording.messages[0].splitlines()[0]
    assert header == (
        f'\U0001f3c1 **REPORT - DAY 1 OF 120** - @{base_data()["user"].username} <@555>'
    ), msg('header ending in <@555>', header)

    await db_session.commit()
    stored = await db_session.get(
        QuinzenalReportModel, int(data['report_id']), populate_existing=True
    )
    assert stored is not None
    assert stored.discord_posted is True


async def test_role_limited_hook_kept_or_dropped_by_the_users_roles(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(
        monkeypatch, guild_ids={10}, member_roles={10: {2}}
    )
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)
    await _seed_webhook(
        db_session, guild_id=10, webhook_url='https://hook/open'
    )
    await _seed_webhook(
        db_session,
        guild_id=10,
        webhook_url='https://hook/role-locked',
        role_ids=[2, 3],
    )

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    posted_urls = {url for _, url in recording.calls}
    assert posted_urls == {'https://hook/open', 'https://hook/role-locked'}


async def test_role_limited_hook_dropped_when_user_lacks_the_role(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(
        monkeypatch, guild_ids={10}, member_roles={10: {9}}
    )
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)
    await _seed_webhook(
        db_session, guild_id=10, webhook_url='https://hook/open'
    )
    await _seed_webhook(
        db_session,
        guild_id=10,
        webhook_url='https://hook/role-locked',
        role_ids=[2, 3],
    )

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    posted_urls = {url for _, url in recording.calls}
    assert posted_urls == {'https://hook/open'}


async def test_user_in_no_configured_server_posts_nowhere(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(monkeypatch, guild_ids={999})
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/a')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is False
    assert recording.calls == []


async def test_one_failed_post_still_counts_discord_posted_and_sets_error(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(
        monkeypatch, guild_ids={10}, fail_urls={'https://hook/bad'}
    )
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/ok')
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/bad')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is True
    assert data['discord_error'] is not None
    # The failure is reported, but never the webhook address (R-030).
    assert 'Webhook returned status 500' in data['discord_error']
    assert 'https://hook/bad' not in data['discord_error']
    assert 'https://hook/ok' not in data['discord_error']


async def test_no_column_stores_servers_or_roles():
    """R-014/R-042: guild ids and role ids are read live, never stored on
    the connection or on the user."""
    connection_columns = set(DiscordConnectionModel.__table__.columns.keys())
    user_columns = set(UserModel.__table__.columns.keys())
    for columns in (connection_columns, user_columns):
        assert 'guild_id' not in columns
        assert 'guild_ids' not in columns
        assert 'role_ids' not in columns


async def test_invalid_grant_marks_needs_reconnect_and_users_me_reflects_it(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(
        monkeypatch,
        guild_ids={10},
        refresh_error=DiscordGrantRevoked('revoked'),
    )
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/a')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is False
    assert recording.calls == []

    me = await async_client.get('/users/me')
    assert me.status_code == 200, msg(200, me.status_code)
    assert me.json()['discord']['status'] == 'needs_reconnect'


async def test_needs_reconnect_connection_makes_no_discord_call(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, fake_oauth = _setup_discord(monkeypatch, guild_ids={10})
    await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=555,
        status=DiscordConnectionStatus.NEEDS_RECONNECT,
    )
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/a')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    assert fake_oauth.refresh_calls == 0
    assert recording.calls == []


async def test_successful_refresh_stores_rotated_token(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    _setup_discord(monkeypatch, guild_ids=set())
    connection = await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=555,
        refresh_token='original-refresh-token',
    )
    original_ciphertext = connection.encrypted_refresh_token

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )
    assert response.status_code == 201, msg(201, response.status_code)

    await db_session.commit()
    refreshed = await db_session.get(
        DiscordConnectionModel,
        connection.id,
        populate_existing=True,
    )
    assert refreshed is not None
    assert refreshed.encrypted_refresh_token != original_ciphertext
    # Not just "changed" - the *new* token from the fake refresh, decrypted
    # back (backend-qa B3: Fernet's random IV alone would make any
    # re-encryption of the same plaintext differ from the original).
    assert (
        decrypt_discord_token(refreshed.encrypted_refresh_token)
        == 'rotated-refresh-token'
    )
    assert refreshed.status == DiscordConnectionStatus.ACTIVE


async def test_refresh_unavailable_leaves_report_unposted_and_row_unchanged(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(
        monkeypatch,
        guild_ids={10},
        refresh_error=DiscordUnavailable('unavailable'),
    )
    connection = await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=555,
        refresh_token='original-refresh-token',
    )
    original_ciphertext = connection.encrypted_refresh_token
    await _seed_webhook(db_session, guild_id=10, webhook_url='https://hook/a')

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is False
    assert recording.calls == []

    await db_session.commit()
    refreshed = await db_session.get(
        DiscordConnectionModel,
        connection.id,
        populate_existing=True,
    )
    assert refreshed is not None
    assert refreshed.encrypted_refresh_token == original_ciphertext
    assert refreshed.status == DiscordConnectionStatus.ACTIVE


async def test_guild_list_unavailable_leaves_report_unposted_and_row_active(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    recording, _ = _setup_discord(
        monkeypatch,
        list_guild_ids_error=DiscordUnavailable('unavailable'),
    )
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)

    response = await async_client.post(
        '/reports/1/submit', json=_payload(date.today().isoformat())
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['discord_posted'] is False
    assert recording.calls == []

    me = await async_client.get('/users/me')
    assert me.json()['discord']['status'] == 'active'


# ---------------------------------------------------------------------------
# Drafts are excluded from reports (KODI-032, ADR-0014)
# ---------------------------------------------------------------------------


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
