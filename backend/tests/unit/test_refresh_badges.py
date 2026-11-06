"""``RefreshBadgesUseCase`` (ADR-0024 §4): every branch. It never raises;
only a 200 that answers another membership revokes, keeping history."""

from datetime import UTC, datetime, timedelta

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from app.application.services.borderless_client import (
    BorderlessAccessRefused,
    BorderlessRateLimited,
    BorderlessUnavailable,
)
from app.application.use_cases.borderless.refresh_badges import (
    RefreshBadgesUseCase,
)
from app.config.settings import envs
from app.core.enums import BadgeKey
from app.domain.models import BorderlessAccountModel, UserBadgeModel
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless

USER_ID = base_data()['user'].id


async def _rows(db_session) -> list[UserBadgeModel]:
    return list(
        await db_session.scalars(
            select(UserBadgeModel)
            .where(UserBadgeModel.user_id == USER_ID)
            .order_by(UserBadgeModel.granted_at)
        )
    )


async def _binding(db_session) -> BorderlessAccountModel:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == USER_ID
        )
    )
    await db_session.refresh(binding)
    return binding


async def _run(db_session, borderless):
    await RefreshBadgesUseCase(db_session, borderless).execute(USER_ID, 1.0)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('membership', 'expected'),
    [('PSP', 'borderless_psp'), ('base', 'borderless_base')],
)
async def test_200_records_the_badge(
    db_session, borderless, membership, expected
):
    await bind_borderless(db_session, USER_ID, badge=None, token='t')
    borderless.add(id='bl', email='x@y.z', token='t', membership=membership)

    await _run(db_session, borderless)

    assert [r.badge for r in await _rows(db_session)] == [expected]
    assert (await _binding(db_session)).profile_read_at is not None


@pytest.mark.asyncio
async def test_200_other_membership_revokes_and_keeps_history(
    db_session, borderless
):
    await bind_borderless(db_session, USER_ID, token='t')
    borderless.add(id='bl', email='x@y.z', token='t', membership='FREE')

    await _run(db_session, borderless)

    [row] = await _rows(db_session)
    assert row.badge == 'borderless_psp'
    assert row.revoked_at is not None


@pytest.mark.asyncio
async def test_switch_from_psp_to_base_keeps_at_most_one_live(
    db_session, borderless
):
    await bind_borderless(db_session, USER_ID, token='t')
    borderless.add(id='bl', email='x@y.z', token='t', membership='BASE')

    await _run(db_session, borderless)

    rows = await _rows(db_session)
    live = [r.badge for r in rows if r.revoked_at is None]
    assert live == ['borderless_base']
    assert len(rows) == 2


@pytest.mark.asyncio
async def test_same_membership_writes_no_new_row(db_session, borderless):
    await bind_borderless(db_session, USER_ID, token='t')
    borderless.add(id='bl', email='x@y.z', token='t', membership='PSP')
    await _run(db_session, borderless)
    assert len(await _rows(db_session)) == 1


@pytest.mark.asyncio
async def test_regain_after_revoke_is_a_new_row(db_session, borderless):
    await bind_borderless(db_session, USER_ID, token='t')
    account = borderless.add(
        id='bl', email='x@y.z', token='t', membership='FREE'
    )
    await _run(db_session, borderless)
    account['membership'] = 'PSP'
    await _run(db_session, borderless)

    rows = await _rows(db_session)
    assert len(rows) == 2
    assert [r.revoked_at is None for r in rows] == [False, True]


@pytest.mark.asyncio
async def test_refused_marks_needs_reconnect_and_keeps_rows(
    db_session, borderless
):
    await bind_borderless(db_session, USER_ID, token='t')
    borderless.read_error = BorderlessAccessRefused('401')

    await _run(db_session, borderless)

    assert (await _binding(db_session)).status == 'needs_reconnect'
    [row] = await _rows(db_session)
    assert row.revoked_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'error', [BorderlessUnavailable('5xx'), BorderlessRateLimited(5)]
)
async def test_unavailable_marks_read_failed_and_keeps_rows(
    db_session, borderless, error
):
    await bind_borderless(db_session, USER_ID, token='t')
    borderless.read_error = error

    await _run(db_session, borderless)

    binding = await _binding(db_session)
    assert binding.status == 'active'
    assert binding.profile_read_failed_at is not None
    [row] = await _rows(db_session)
    assert row.revoked_at is None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ('status', 'expires_in'),
    [
        ('needs_reconnect', timedelta(days=1)),
        ('active', timedelta(seconds=-1)),
    ],
)
async def test_expired_or_needs_reconnect_makes_no_call_and_writes_nothing(
    db_session, borderless, status, expires_in
):
    await bind_borderless(
        db_session, USER_ID, token='t', status=status, expires_in=expires_in
    )
    before = await _binding(db_session)
    snapshot = (before.status, before.profile_read_at, before.updated_at)

    await _run(db_session, borderless)

    assert borderless.read_calls == []
    after = await _binding(db_session)
    assert (after.status, after.profile_read_at, after.updated_at) == snapshot
    [row] = await _rows(db_session)
    assert row.revoked_at is None


@pytest.mark.asyncio
async def test_token_that_no_longer_decrypts_needs_reconnect_without_a_call(
    db_session, borderless, monkeypatch: pytest.MonkeyPatch
):
    await bind_borderless(db_session, USER_ID, token='t')
    monkeypatch.setattr(
        envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    await _run(db_session, borderless)

    assert borderless.read_calls == []
    assert (await _binding(db_session)).status == 'needs_reconnect'


@pytest.mark.asyncio
async def test_no_binding_is_a_no_op(db_session, borderless):
    await _run(db_session, borderless)
    assert borderless.read_calls == []


@pytest.mark.asyncio
async def test_unexpected_error_never_raises(db_session, borderless):
    await bind_borderless(db_session, USER_ID, token='t')
    borderless.read_error = RuntimeError('boom')
    await _run(db_session, borderless)
    assert (await _binding(db_session)).status == 'active'


@pytest.mark.asyncio
async def test_badge_key_values_match_the_check_constraint():
    assert {k.value for k in BadgeKey} == {'borderless_base', 'borderless_psp'}
    assert datetime.now(UTC)
