"""Unit tests for ``ResolveReportWebhooksUseCase`` (K8, T124/T130).

Fake repositories and a fake ``DiscordOAuthService`` stand in for the real
network/DB boundaries, so every branch runs without touching either. The
crypto functions are monkeypatched directly (not through a real Fernet key)
so a test can assert exactly what ciphertext value reaches ``store_grant``.
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import cast

import pytest

from app.application.services.discord_oauth_service import (
    DiscordGrant,
    DiscordGrantRevoked,
    DiscordOAuthService,
    DiscordUnavailable,
)
from app.application.use_cases.quinzenal_reports import (
    resolve_report_webhooks as rrw_module,
)
from app.application.use_cases.quinzenal_reports.resolve_report_webhooks import (
    ResolveReportWebhooksUseCase,
)
from app.core.enums import DiscordConnectionStatus
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)


def _connection(
    *,
    user_id: int = 1,
    discord_id: int = 999,
    scopes: str = 'identify guilds guilds.members.read',
    status: DiscordConnectionStatus = DiscordConnectionStatus.ACTIVE,
    encrypted_refresh_token: str = 'cipher-old',
):
    return SimpleNamespace(
        user_id=user_id,
        discord_id=discord_id,
        scopes=scopes,
        status=status,
        encrypted_refresh_token=encrypted_refresh_token,
    )


def _webhook(
    *,
    guild_id: int,
    webhook_url: str,
    role_ids: list[int] | None = None,
    created_at: datetime,
):
    return SimpleNamespace(
        guild_id=guild_id,
        webhook_url=webhook_url,
        role_ids=role_ids or [],
        created_at=created_at,
    )


class FakeConnRepo:
    def __init__(self, connection=None, calls: list[str] | None = None):
        self.connection = connection
        self.calls = calls if calls is not None else []
        self.store_grant_calls: list[tuple] = []
        self.mark_needs_reconnect_calls: list[int] = []
        self.rollback_calls = 0

    async def get_by_user_id_for_update(self, user_id):
        self.calls.append('lock')
        return self.connection

    async def rollback(self):
        self.calls.append('rollback')
        self.rollback_calls += 1

    async def mark_needs_reconnect(self, user_id):
        self.calls.append('mark_needs_reconnect')
        self.mark_needs_reconnect_calls.append(user_id)
        if self.connection is not None:
            self.connection.status = DiscordConnectionStatus.NEEDS_RECONNECT

    async def store_grant(
        self, user_id, encrypted_refresh_token, access_token_expires_at, scopes
    ):
        self.calls.append('store_grant')
        self.store_grant_calls.append((
            user_id,
            encrypted_refresh_token,
            access_token_expires_at,
            scopes,
        ))
        if self.connection is not None:
            self.connection.encrypted_refresh_token = encrypted_refresh_token
            self.connection.scopes = scopes
        return self.connection


class FakeWebhookRepo:
    def __init__(self, webhooks: list | None = None):
        self.webhooks = webhooks or []
        self.list_by_guild_ids_calls: list[set[int]] = []

    async def list_by_guild_ids(self, guild_ids):
        self.list_by_guild_ids_calls.append(set(guild_ids))
        ids = set(guild_ids)
        return [w for w in self.webhooks if w.guild_id in ids]


class FakeDiscordOAuth:
    def __init__(
        self,
        *,
        configured: bool = True,
        refresh_grant: DiscordGrant | None = None,
        refresh_error: Exception | None = None,
        guild_ids: set[int] | None = None,
        guild_ids_error: Exception | None = None,
        member_roles: dict[int, set[int]] | None = None,
        member_errors: set[int] | None = None,
        calls: list[str] | None = None,
    ):
        self.configured = configured
        self.refresh_grant = refresh_grant
        self.refresh_error = refresh_error
        self.guild_ids = guild_ids if guild_ids is not None else set()
        self.guild_ids_error = guild_ids_error
        self.member_roles = member_roles or {}
        self.member_errors = member_errors or set()
        self.member_calls: list[int] = []
        self.calls = calls if calls is not None else []

    def is_configured(self):
        return self.configured

    async def refresh(self, refresh_token):
        self.calls.append('refresh')
        if self.refresh_error:
            raise self.refresh_error
        return self.refresh_grant

    async def list_guild_ids(self, access_token):
        self.calls.append('list_guild_ids')
        if self.guild_ids_error:
            raise self.guild_ids_error
        return self.guild_ids

    async def get_member_role_ids(self, access_token, guild_id):
        self.calls.append(f'get_member_role_ids:{guild_id}')
        self.member_calls.append(guild_id)
        if guild_id in self.member_errors:
            raise DiscordUnavailable('boom')
        return self.member_roles.get(guild_id, set())


def _use_case(
    monkeypatch,
    *,
    conn_repo=None,
    webhook_repo=None,
    discord_oauth=None,
    decrypted_token: str | None = 'plain-old-refresh',
    encrypted_token: str | None = 'cipher-new',
    encrypt_calls: list[str] | None = None,
):
    monkeypatch.setattr(
        rrw_module, 'decrypt_discord_token', lambda _: decrypted_token
    )

    def _fake_encrypt(plaintext: str) -> str | None:
        if encrypt_calls is not None:
            encrypt_calls.append(plaintext)
        return encrypted_token

    monkeypatch.setattr(rrw_module, 'encrypt_discord_token', _fake_encrypt)
    return ResolveReportWebhooksUseCase(
        cast(DiscordConnectionRepository, conn_repo or FakeConnRepo()),
        cast(DiscordReportWebhookRepository, webhook_repo or FakeWebhookRepo()),
        cast(DiscordOAuthService, discord_oauth or FakeDiscordOAuth()),
    )


# --- Early exits (empty route) ---


@pytest.mark.asyncio
async def test_unconfigured_service_returns_empty_without_locking(
    monkeypatch,
):
    conn_repo = FakeConnRepo(connection=_connection())
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        discord_oauth=FakeDiscordOAuth(configured=False),
    )

    route = await use_case.execute(1)

    assert route.discord_id is None
    assert route.webhook_urls == []
    assert conn_repo.calls == []


@pytest.mark.asyncio
async def test_no_connection_returns_empty(monkeypatch):
    conn_repo = FakeConnRepo(connection=None)
    use_case = _use_case(monkeypatch, conn_repo=conn_repo)

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert route.discord_id is None


@pytest.mark.asyncio
async def test_needs_reconnect_row_releases_lock_and_returns_empty(
    monkeypatch,
):
    conn_repo = FakeConnRepo(
        connection=_connection(status=DiscordConnectionStatus.NEEDS_RECONNECT)
    )
    use_case = _use_case(monkeypatch, conn_repo=conn_repo)

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert conn_repo.rollback_calls == 1


@pytest.mark.asyncio
async def test_missing_guilds_scope_marks_needs_reconnect(monkeypatch):
    conn_repo = FakeConnRepo(connection=_connection(scopes='identify'))
    use_case = _use_case(monkeypatch, conn_repo=conn_repo)

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert conn_repo.mark_needs_reconnect_calls == [1]


@pytest.mark.asyncio
async def test_decrypt_failure_marks_needs_reconnect(monkeypatch):
    conn_repo = FakeConnRepo(connection=_connection())
    use_case = _use_case(monkeypatch, conn_repo=conn_repo, decrypted_token=None)

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert conn_repo.mark_needs_reconnect_calls == [1]


@pytest.mark.asyncio
async def test_grant_revoked_marks_needs_reconnect(monkeypatch):
    conn_repo = FakeConnRepo(connection=_connection())
    discord_oauth = FakeDiscordOAuth(
        refresh_error=DiscordGrantRevoked('revoked')
    )
    use_case = _use_case(
        monkeypatch, conn_repo=conn_repo, discord_oauth=discord_oauth
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert conn_repo.mark_needs_reconnect_calls == [1]


@pytest.mark.asyncio
async def test_refresh_unavailable_releases_lock_and_leaves_row_unchanged(
    monkeypatch,
):
    conn_repo = FakeConnRepo(connection=_connection())
    discord_oauth = FakeDiscordOAuth(
        refresh_error=DiscordUnavailable('unavailable')
    )
    use_case = _use_case(
        monkeypatch, conn_repo=conn_repo, discord_oauth=discord_oauth
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert conn_repo.rollback_calls == 1
    assert conn_repo.mark_needs_reconnect_calls == []
    assert conn_repo.store_grant_calls == []


# --- Happy path: rotation, call order, guild/role selection ---


def _grant(
    refresh_token='new-refresh', scope='identify guilds guilds.members.read'
):
    return DiscordGrant(
        access_token='fresh-access-token',
        refresh_token=refresh_token,
        expires_in=3600,
        scope=scope,
    )


@pytest.mark.asyncio
async def test_rotated_token_stored_before_guild_list_call(monkeypatch):
    calls: list[str] = []
    encrypt_calls: list[str] = []
    conn_repo = FakeConnRepo(connection=_connection(), calls=calls)
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(refresh_token='new-refresh'), calls=calls
    )
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        discord_oauth=discord_oauth,
        encrypt_calls=encrypt_calls,
    )

    await use_case.execute(1)

    store_index = calls.index('store_grant')
    list_index = calls.index('list_guild_ids')
    assert store_index < list_index
    assert conn_repo.store_grant_calls[0][1] == 'cipher-new'
    # The plaintext handed to encryption is the *new* rotated token, not
    # the stored/old one (backend-qa B3).
    assert encrypt_calls == ['new-refresh']


@pytest.mark.asyncio
async def test_no_guilds_returns_empty_without_webhook_lookup(monkeypatch):
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo()
    discord_oauth = FakeDiscordOAuth(refresh_grant=_grant(), guild_ids=set())
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    assert webhook_repo.list_by_guild_ids_calls == []


@pytest.mark.asyncio
async def test_unrestricted_hook_kept_without_a_member_call(monkeypatch):
    now = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo([
        _webhook(guild_id=10, webhook_url='https://hook/a', created_at=now)
    ])
    discord_oauth = FakeDiscordOAuth(refresh_grant=_grant(), guild_ids={10})
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == ['https://hook/a']
    assert discord_oauth.member_calls == []


@pytest.mark.asyncio
async def test_role_limited_hook_kept_when_any_role_matches(monkeypatch):
    now = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo([
        _webhook(
            guild_id=10,
            webhook_url='https://hook/a',
            role_ids=[1, 2],
            created_at=now,
        )
    ])
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(),
        guild_ids={10},
        member_roles={10: {2, 3}},
    )
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == ['https://hook/a']
    assert discord_oauth.member_calls == [10]


@pytest.mark.asyncio
async def test_role_limited_hook_dropped_when_no_role_matches(monkeypatch):
    now = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo([
        _webhook(
            guild_id=10,
            webhook_url='https://hook/a',
            role_ids=[1, 2],
            created_at=now,
        )
    ])
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(),
        guild_ids={10},
        member_roles={10: {9}},
    )
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == []


@pytest.mark.asyncio
async def test_one_member_call_per_distinct_role_limited_guild(monkeypatch):
    now = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo([
        _webhook(
            guild_id=10,
            webhook_url='https://hook/a',
            role_ids=[1],
            created_at=now,
        ),
        _webhook(
            guild_id=10,
            webhook_url='https://hook/b',
            role_ids=[2],
            created_at=now,
        ),
    ])
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(),
        guild_ids={10},
        member_roles={10: {1, 2}},
    )
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert discord_oauth.member_calls == [10]
    assert set(route.webhook_urls) == {'https://hook/a', 'https://hook/b'}


@pytest.mark.asyncio
async def test_member_call_failure_drops_only_that_guilds_role_hooks(
    monkeypatch,
):
    now = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo([
        _webhook(
            guild_id=10,
            webhook_url='https://hook/broken-guild',
            role_ids=[1],
            created_at=now,
        ),
        _webhook(
            guild_id=20,
            webhook_url='https://hook/open-guild',
            created_at=now,
        ),
    ])
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(),
        guild_ids={10, 20},
        member_errors={10},
    )
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == ['https://hook/open-guild']


@pytest.mark.asyncio
async def test_urls_are_distinct_and_ordered_by_created_at(monkeypatch):
    older = datetime.now(timezone.utc) - timedelta(days=1)
    newer = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    # ``dup`` collapses to one URL regardless of order; ``newer``/``older``
    # are each a *distinct* URL, and ``newer`` is listed first in the input
    # while ``older`` sorts first by ``created_at`` - only an actual sort
    # (not "dedup keeps input order", backend-qa non-blocking note)
    # produces the asserted output order.
    webhook_repo = FakeWebhookRepo([
        _webhook(guild_id=10, webhook_url='https://hook/dup', created_at=newer),
        _webhook(guild_id=10, webhook_url='https://hook/dup', created_at=older),
        _webhook(
            guild_id=10, webhook_url='https://hook/newer', created_at=newer
        ),
        _webhook(
            guild_id=10, webhook_url='https://hook/older', created_at=older
        ),
    ])
    discord_oauth = FakeDiscordOAuth(refresh_grant=_grant(), guild_ids={10})
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == [
        'https://hook/dup',
        'https://hook/older',
        'https://hook/newer',
    ]


@pytest.mark.asyncio
async def test_guild_list_unavailable_after_rotation_returns_empty(
    monkeypatch,
):
    conn_repo = FakeConnRepo(connection=_connection())
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(),
        guild_ids_error=DiscordUnavailable('unavailable'),
    )
    use_case = _use_case(
        monkeypatch, conn_repo=conn_repo, discord_oauth=discord_oauth
    )

    route = await use_case.execute(1)

    assert route.webhook_urls == []
    # The rotation itself already succeeded and committed.
    assert conn_repo.store_grant_calls


# --- Secrecy (T130) ---


def test_route_repr_hides_webhook_urls():
    from app.application.dto.discord import ReportRouteDTO

    route = ReportRouteDTO(
        discord_id=1, webhook_urls=['https://discord.test/super-secret']
    )
    text = repr(route)
    assert 'super-secret' not in text


@pytest.mark.asyncio
async def test_access_and_refresh_tokens_absent_from_logs(monkeypatch, caplog):
    import logging

    now = datetime.now(timezone.utc)
    conn_repo = FakeConnRepo(connection=_connection())
    webhook_repo = FakeWebhookRepo([
        _webhook(guild_id=10, webhook_url='https://hook/a', created_at=now)
    ])
    discord_oauth = FakeDiscordOAuth(
        refresh_grant=_grant(refresh_token='super-secret-new-refresh'),
        guild_ids={10},
    )
    use_case = _use_case(
        monkeypatch,
        conn_repo=conn_repo,
        webhook_repo=webhook_repo,
        discord_oauth=discord_oauth,
        decrypted_token='super-secret-old-refresh',
    )

    with caplog.at_level(logging.DEBUG):
        await use_case.execute(1)

    assert 'super-secret-new-refresh' not in caplog.text
    assert 'super-secret-old-refresh' not in caplog.text
    assert 'fresh-access-token' not in caplog.text
