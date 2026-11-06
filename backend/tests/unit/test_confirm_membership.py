"""``ConfirmMembershipUseCase`` (ADR-0024): renews the Borderless access of
the caller's own binding and reads the membership; never writes a
session."""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import func, select

from app.application.use_cases.borderless.confirm_membership import (
    NOT_YOUR_ACCOUNT,
    ConfirmMembershipUseCase,
)
from app.core.crypto import decrypt_borderless_token
from app.core.exceptions import (
    BindingConflict,
    EmailUnverified,
    InvalidCredentials,
)
from app.domain.models import UserBadgeModel, UserSessionModel
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless
from tests.fake_redis import FakeRedis

USER_ID = base_data()['user'].id


def _use_case(db_session, fake_redis, borderless):
    return ConfirmMembershipUseCase(db_session, fake_redis, borderless)


@pytest.mark.asyncio
async def test_confirm_renews_the_access_and_reads_the_membership(
    db_session, borderless
):
    binding = await bind_borderless(
        db_session,
        USER_ID,
        borderless_id='bl-1',
        status='needs_reconnect',
        expires_in=timedelta(seconds=-5),
    )
    borderless.add(id='bl-1', email='me@example.com', token='renewed')
    fake_redis = FakeRedis()

    await _use_case(db_session, fake_redis, borderless).execute(
        USER_ID, 'me@example.com', 'correct-horse'
    )

    await db_session.refresh(binding)
    assert binding.status == 'active'
    assert binding.access_token_expires_at > datetime.now(UTC) + timedelta(
        days=6
    )
    assert decrypt_borderless_token(binding.encrypted_access_token) == (
        'renewed'
    )
    assert binding.profile_read_at is not None
    assert borderless.read_calls == ['renewed']
    sessions = await db_session.scalar(
        select(func.count()).select_from(UserSessionModel)
    )
    assert sessions == 0
    assert fake_redis.data == {}


@pytest.mark.asyncio
async def test_another_borderless_account_is_409_and_nothing_changes(
    db_session, borderless
):
    binding = await bind_borderless(
        db_session, USER_ID, borderless_id='bl-1', token='old'
    )
    borderless.add(id='bl-2', email='other@example.com', token='other')

    with pytest.raises(BindingConflict) as excinfo:
        await _use_case(db_session, FakeRedis(), borderless).execute(
            USER_ID, 'other@example.com', 'correct-horse'
        )

    assert excinfo.value.message == NOT_YOUR_ACCOUNT
    await db_session.refresh(binding)
    assert decrypt_borderless_token(binding.encrypted_access_token) == 'old'
    assert borderless.read_calls == []


@pytest.mark.asyncio
async def test_unbound_caller_is_409(db_session, borderless):
    borderless.add(id='bl-1', email='me@example.com')
    with pytest.raises(BindingConflict):
        await _use_case(db_session, FakeRedis(), borderless).execute(
            USER_ID, 'me@example.com', 'correct-horse'
        )


@pytest.mark.asyncio
async def test_wrong_password_and_unverified_are_refused(
    db_session, borderless
):
    await bind_borderless(db_session, USER_ID, borderless_id='bl-1')
    borderless.add(id='bl-1', email='me@example.com', verified=False)
    use_case = _use_case(db_session, FakeRedis(), borderless)
    with pytest.raises(InvalidCredentials):
        await use_case.execute(USER_ID, 'me@example.com', 'wrong')
    with pytest.raises(EmailUnverified):
        await use_case.execute(USER_ID, 'me@example.com', 'correct-horse')


@pytest.mark.asyncio
async def test_confirm_regains_a_revoked_badge_as_a_new_row(
    db_session, borderless
):
    await bind_borderless(
        db_session,
        USER_ID,
        borderless_id='bl-1',
        badge=None,
        expires_in=timedelta(seconds=-5),
    )
    db_session.add(
        UserBadgeModel(
            user_id=USER_ID,
            badge='borderless_psp',
            source='borderless',
            revoked_at=datetime.now(UTC),
        )
    )
    await db_session.commit()
    borderless.add(id='bl-1', email='me@example.com', membership='PSP')

    await _use_case(db_session, FakeRedis(), borderless).execute(
        USER_ID, 'me@example.com', 'correct-horse'
    )

    rows = list(
        await db_session.scalars(
            select(UserBadgeModel).where(UserBadgeModel.user_id == USER_ID)
        )
    )
    assert len(rows) == 2
    assert sorted(r.revoked_at is None for r in rows) == [False, True]
