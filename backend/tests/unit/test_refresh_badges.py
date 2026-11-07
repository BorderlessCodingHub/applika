"""``RefreshBadgesUseCase`` (ADR-0026 §8, §9): every outcome, against the
fake Borderless. The Redis access token is the freshness marker; a refresh
rotates the refresh token and applies the claim; a refused grant runs
``EndBorderlessGrantUseCase``; Borderless failing never raises."""

from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.application.services.borderless_oidc import (
    BorderlessGrant,
    BorderlessIdentity,
    BorderlessRejected,
    BorderlessUnavailable,
)
from app.application.use_cases.borderless.refresh_badges import (
    FAILURE_BACKOFF_SECONDS,
    RefreshBadgesUseCase,
)
from app.config.settings import envs
from app.core.crypto import decrypt_borderless_token
from app.core.enums import BadgeKey
from app.domain.models import BorderlessAccountModel, UserBadgeModel
from app.domain.repositories.borderless_account_repository import (
    BorderlessAccountRepository,
)
from tests.base_db_setup import base_data
from tests.conftest import MemoryAccessStore, bind_borderless

USER_ID = base_data()['user'].id
SUB = f'bl-{USER_ID}'


class RecordingEndGrant:
    def __init__(self) -> None:
        self.calls: list[int] = []

    async def execute(self, user_id: int) -> int:
        self.calls.append(user_id)
        return 0


@pytest.fixture
def end_grant() -> RecordingEndGrant:
    return RecordingEndGrant()


def use_case(db_session, oidc_client, store, end_grant):
    return RefreshBadgesUseCase(db_session, oidc_client, store, end_grant)


async def _rows(db_session) -> list[UserBadgeModel]:
    return list(
        await db_session.scalars(
            select(UserBadgeModel)
            .where(UserBadgeModel.user_id == USER_ID)
            .order_by(UserBadgeModel.granted_at)
        )
    )


async def _live(db_session) -> list[str]:
    return [r.badge for r in await _rows(db_session) if r.revoked_at is None]


async def _binding(db_session) -> BorderlessAccountModel:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == USER_ID
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    return binding


def _grants(fake) -> list[dict]:
    return fake.log['grants'].get(SUB, [])


async def test_a_live_access_token_means_no_call(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    await access_store.put(USER_ID, 'access', 3600)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'fresh'
    assert _grants(fake_borderless) == []


async def test_fresh_after_the_lock_means_no_call(
    db_session, fake_borderless, oidc_client, end_grant
):
    """Another request refreshed while this one waited for the row lock."""
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)

    class LateStore(MemoryAccessStore):
        def __init__(self) -> None:
            super().__init__()
            self.reads = 0

        async def present(self, user_id: int) -> bool:
            self.reads += 1
            return self.reads > 1

    outcome = await use_case(
        db_session, oidc_client, LateStore(), end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'fresh'
    assert _grants(fake_borderless) == []


@pytest.mark.parametrize(
    ('membership', 'expected'),
    [
        ('PSP', ['borderless_psp']),
        ('base', ['borderless_base']),
        ('FREE', []),
        ('STARTER', []),
        (None, []),
    ],
)
async def test_a_refresh_rotates_the_token_and_applies_the_claim(
    db_session,
    fake_borderless,
    oidc_client,
    access_store,
    end_grant,
    membership,
    expected,
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    before = await _binding(db_session)
    old_ciphertext = before.encrypted_refresh_token
    old_token = decrypt_borderless_token(old_ciphertext or '')
    fake_borderless.set_account(SUB, membership=membership)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'ok'
    assert [g['grant_type'] for g in _grants(fake_borderless)] == [
        'refresh_token'
    ]
    binding = await _binding(db_session)
    new_token = decrypt_borderless_token(binding.encrypted_refresh_token or '')
    assert binding.encrypted_refresh_token != old_ciphertext
    assert new_token not in (None, old_token)
    assert binding.profile_read_at is not None
    assert binding.status == 'active'
    assert await _live(db_session) == expected
    # The new access token, for its own lifetime.
    assert access_store.tokens[USER_ID][1] == 3600
    # The stored token is the newest: it refreshes again.
    access_store.tokens.clear()
    assert (
        await use_case(
            db_session, oidc_client, access_store, end_grant
        ).execute(USER_ID, 1.0)
        == 'ok'
    )


async def test_psp_to_base_keeps_at_most_one_live_badge_and_history(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    fake_borderless.set_account(SUB, membership='BASE')

    await use_case(db_session, oidc_client, access_store, end_grant).execute(
        USER_ID
    )

    rows = await _rows(db_session)
    assert [r.badge for r in rows if r.revoked_at is None] == [
        'borderless_base'
    ]
    assert len(rows) == 2


async def test_borderless_refusing_the_grant_ends_it(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    fake_borderless.revoke_grants(SUB)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'ended'
    assert end_grant.calls == [USER_ID]
    assert USER_ID not in access_store.tokens
    # The badge row stays: it counts again after the next sign-in.
    assert await _live(db_session) == ['borderless_psp']


async def test_thirty_days_after_the_sign_in_the_grant_ends(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    fake_borderless.advance(30 * 24 * 3600 + 1)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'ended'
    assert end_grant.calls == [USER_ID]


async def test_a_token_that_no_longer_decrypts_ends_the_grant_without_a_call(
    db_session, fake_borderless, oidc_client, access_store, end_grant,
    monkeypatch,
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    monkeypatch.setattr(
        envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'ended'
    assert end_grant.calls == [USER_ID]
    assert _grants(fake_borderless) == []


async def test_an_active_binding_with_no_refresh_token_ends_the_grant(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    """A password-era binding (Plan corrections 4): no grant to refresh,
    so it is handled like a refused one."""
    await bind_borderless(db_session, USER_ID, token='')

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'ended'
    assert end_grant.calls == [USER_ID]


async def test_needs_reconnect_or_no_binding_makes_no_call(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)
    assert outcome == 'disconnected'

    await bind_borderless(
        db_session, USER_ID, fake=fake_borderless, status='needs_reconnect'
    )
    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'disconnected'
    assert end_grant.calls == []
    assert _grants(fake_borderless) == []


@pytest.mark.parametrize(
    'error',
    [BorderlessUnavailable('5xx'), BorderlessRejected('bad id_token')],
)
async def test_borderless_failing_keeps_the_badges_and_stores_nothing(
    db_session,
    fake_borderless,
    oidc_client,
    access_store,
    end_grant,
    monkeypatch,
    error,
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    before = (await _binding(db_session)).encrypted_refresh_token

    async def refuse(token, timeout=None):
        raise error

    monkeypatch.setattr(oidc_client, 'refresh', refuse)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'failed'
    binding = await _binding(db_session)
    assert binding.profile_read_failed_at is not None
    assert binding.encrypted_refresh_token == before
    assert binding.status == 'active'
    assert await _live(db_session) == ['borderless_psp']
    assert access_store.tokens == {}
    assert end_grant.calls == []


async def test_a_request_queued_behind_a_failed_refresh_does_not_retry(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    """One user's concurrent requests queue on the row lock: one that finds
    a refresh failed seconds ago answers ``failed`` without a call."""
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    binding = await _binding(db_session)
    binding.profile_read_failed_at = datetime.now(UTC)
    await db_session.commit()

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'failed'
    assert _grants(fake_borderless) == []


async def test_an_older_failure_or_a_later_success_tries_again(
    db_session, fake_borderless, oidc_client, access_store, end_grant
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    binding = await _binding(db_session)
    binding.profile_read_failed_at = datetime.now(UTC) - timedelta(
        seconds=FAILURE_BACKOFF_SECONDS + 1
    )
    await db_session.commit()

    first = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)
    assert first == 'ok'

    binding = await _binding(db_session)
    binding.profile_read_failed_at = datetime.now(UTC) - timedelta(seconds=1)
    binding.profile_read_at = datetime.now(UTC)
    await db_session.commit()
    access_store.tokens.clear()

    second = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)
    assert second == 'ok'
    assert len(_grants(fake_borderless)) == 2


async def test_an_answer_for_another_account_is_a_failure(
    db_session,
    fake_borderless,
    oidc_client,
    access_store,
    end_grant,
    monkeypatch,
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)

    async def someone_else(token, timeout=None):
        return BorderlessGrant(
            identity=BorderlessIdentity(
                sub='bl-intruder',
                email='intruder@example.com',
                email_verified=True,
                name=None,
                preferred_username=None,
                membership='BASE',
            ),
            refresh_token='other',
            access_token='other',
            expires_in=3600,
        )

    monkeypatch.setattr(oidc_client, 'refresh', someone_else)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'failed'
    assert await _live(db_session) == ['borderless_psp']
    assert access_store.tokens == {}


async def test_redis_down_refreshes_from_the_database(
    db_session, fake_borderless, oidc_client, end_grant
):
    """The access-token store unreachable counts as missing: the
    membership is read from the database's refresh token."""
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)

    class DownRedis:
        async def exists(self, *args):
            raise RedisConnectionError('down')

        async def set(self, *args, **kwargs):
            raise RedisConnectionError('down')

    store = BorderlessAccessStore(DownRedis())  # ty: ignore[invalid-argument-type]

    outcome = await use_case(db_session, oidc_client, store, end_grant).execute(
        USER_ID, 1.0
    )

    assert outcome == 'ok'
    assert len(_grants(fake_borderless)) == 1


async def test_an_unexpected_error_never_raises(
    db_session, fake_borderless, oidc_client, access_store, end_grant,
    monkeypatch,
):
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)

    async def boom(token, timeout=None):
        raise RuntimeError('boom')

    monkeypatch.setattr(oidc_client, 'refresh', boom)

    outcome = await use_case(
        db_session, oidc_client, access_store, end_grant
    ).execute(USER_ID, 1.0)

    assert outcome == 'failed'
    assert await _live(db_session) == ['borderless_psp']


async def test_the_locked_read_sees_a_rotation_made_meanwhile(
    db_session, async_engine, fake_borderless, oidc_client, end_grant
):
    """A session that read the binding before another one rotated its
    refresh token must not send the rotated-out token once it holds the
    lock (Borderless would take it as a reuse and end the grant)."""
    await bind_borderless(db_session, USER_ID, fake=fake_borderless)
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as first, maker() as second:
        kept = await BorderlessAccountRepository(first).get_by_user_id(
            USER_ID
        )
        assert kept is not None
        rotated = await use_case(
            second, oidc_client, MemoryAccessStore(), end_grant
        ).execute(USER_ID, 1.0)
        assert rotated == 'ok'

        outcome = await use_case(
            first, oidc_client, MemoryAccessStore(), end_grant
        ).execute(USER_ID, 1.0)

    assert outcome == 'ok'
    assert end_grant.calls == []


def test_badge_key_values_match_the_check_constraint():
    assert {key.value for key in BadgeKey} == {
        'borderless_base',
        'borderless_psp',
    }
