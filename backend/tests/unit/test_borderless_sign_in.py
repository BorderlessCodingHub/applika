"""``BorderlessSignInUseCase`` (ADR-0024) on a real database, with the fake
Borderless client and an in-memory Redis.

Resolution: (1) the bound account; (2) the account whose email equals the
Borderless email ignoring case (exact spelling first), bound now, refused
when bound to another Borderless account or ambiguous; (3) a new account.
"""

import pytest
from sqlalchemy import func, select

from app.application.services.borderless_client import (
    BorderlessRateLimited,
    BorderlessSignIn,
    BorderlessUnavailable,
)
from app.application.dto.user import UserCreateDTO
from app.application.use_cases.borderless.credentials import (
    email_counter_key,
)
from app.application.use_cases.borderless.sign_in import (
    BorderlessSignInUseCase,
    username_for,
)
from app.core.crypto import decrypt_borderless_token
from app.core.exceptions import (
    BindingConflict,
    EmailAmbiguous,
    EmailUnusable,
    EmailUnverified,
    InvalidCredentials,
    ServiceUnavailable,
    SignInRateLimited,
)
from app.domain.models import BorderlessAccountModel, UserBadgeModel, UserModel
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless
from tests.fake_redis import FakeRedis

PASSWORD = 'correct-horse'


@pytest.fixture
def fake_redis() -> FakeRedis:
    return FakeRedis()


def _use_case(db_session, fake_redis, borderless) -> BorderlessSignInUseCase:
    return BorderlessSignInUseCase(db_session, fake_redis, borderless)


async def _users(db_session) -> int:
    return await db_session.scalar(select(func.count()).select_from(UserModel))


async def _binding(db_session, user_id):
    return await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == user_id
        )
    )


async def _live_badges(db_session, user_id) -> list[str]:
    rows = await db_session.scalars(
        select(UserBadgeModel.badge).where(
            UserBadgeModel.user_id == user_id,
            UserBadgeModel.revoked_at.is_(None),
        )
    )
    return list(rows)


@pytest.mark.asyncio
async def test_new_email_creates_an_account_bound_with_a_badge(
    db_session, fake_redis, borderless
):
    borderless.add(
        id='bl-new', email='new@example.com', name='New Person', token='tok'
    )
    before = await _users(db_session)

    result = await _use_case(db_session, fake_redis, borderless).execute(
        'new@example.com', PASSWORD
    )

    assert result.new_account is True
    assert await _users(db_session) == before + 1
    user = await db_session.get(UserModel, result.user_id)
    assert (user.username, user.email) == ('New Person', 'new@example.com')
    binding = await _binding(db_session, result.user_id)
    assert binding.borderless_user_id == 'bl-new'
    assert binding.status == 'active'
    assert binding.encrypted_access_token != 'tok'
    assert decrypt_borderless_token(binding.encrypted_access_token) == 'tok'
    assert await _live_badges(db_session, result.user_id) == ['borderless_psp']


@pytest.mark.asyncio
async def test_email_match_ignoring_case_binds_the_existing_account(
    db_session, fake_redis, borderless
):
    borderless.add(id='bl-1', email='TEST@user.com', membership='base')
    before = await _users(db_session)

    result = await _use_case(db_session, fake_redis, borderless).execute(
        'TEST@user.com', PASSWORD
    )

    assert result.user_id == base_data()['user'].id
    assert result.new_account is False
    assert await _users(db_session) == before
    assert await _live_badges(db_session, result.user_id) == ['borderless_base']


@pytest.mark.asyncio
async def test_bound_account_signs_in_and_renews_its_token(
    db_session, fake_redis, borderless
):
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-1', badge=None)
    borderless.add(id='bl-1', email='changed@example.com', token='fresh-token')

    result = await _use_case(db_session, fake_redis, borderless).execute(
        'changed@example.com', PASSWORD
    )

    assert (result.user_id, result.new_account) == (user_id, False)
    binding = await _binding(db_session, user_id)
    await db_session.refresh(binding)
    assert decrypt_borderless_token(binding.encrypted_access_token) == (
        'fresh-token'
    )
    assert binding.email == 'changed@example.com'


@pytest.mark.asyncio
async def test_email_of_an_account_bound_to_another_borderless_id_is_409(
    db_session, fake_redis, borderless
):
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-other')
    borderless.add(id='bl-new', email='Test@User.com')
    before = await _users(db_session)

    with pytest.raises(BindingConflict):
        await _use_case(db_session, fake_redis, borderless).execute(
            'Test@User.com', PASSWORD
        )

    assert await _users(db_session) == before
    binding = await _binding(db_session, user_id)
    assert binding.borderless_user_id == 'bl-other'


@pytest.mark.asyncio
async def test_exact_spelling_wins_over_other_case_matches(
    db_session, fake_redis, borderless
):
    db_session.add(UserModel(id=50, username='upper', email='Mixed@Case.com'))
    db_session.add(UserModel(id=51, username='lower', email='mixed@case.com'))
    await db_session.commit()
    borderless.add(id='bl-mix', email='mixed@case.com')

    result = await _use_case(db_session, fake_redis, borderless).execute(
        'mixed@case.com', PASSWORD
    )
    assert result.user_id == 51


@pytest.mark.asyncio
async def test_several_case_matches_and_none_exact_is_409_ambiguous(
    db_session, fake_redis, borderless
):
    db_session.add(UserModel(id=50, username='upper', email='Mixed@Case.com'))
    db_session.add(UserModel(id=51, username='lower', email='mixed@case.com'))
    await db_session.commit()
    borderless.add(id='bl-mix', email='MIXED@case.com')
    before = await _users(db_session)

    with pytest.raises(EmailAmbiguous):
        await _use_case(db_session, fake_redis, borderless).execute(
            'MIXED@case.com', PASSWORD
        )
    assert await _users(db_session) == before


@pytest.mark.asyncio
async def test_unverified_email_is_403_and_nothing_written(
    db_session, fake_redis, borderless
):
    borderless.add(id='bl-u', email='u@example.com', verified=False)
    before = await _users(db_session)
    with pytest.raises(EmailUnverified):
        await _use_case(db_session, fake_redis, borderless).execute(
            'u@example.com', PASSWORD
        )
    assert await _users(db_session) == before


# 113 characters, accepted by ``UserCreateDTO``: only the length refuses it.
LONG_EMAIL = 'a' * 60 + '@' + 'b' * 40 + '.example.com'


async def _bindings(db_session) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(BorderlessAccountModel)
    )


async def _badges(db_session) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(UserBadgeModel)
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    'email', [LONG_EMAIL, 'not-an-email'], ids=['over-100', 'invalid']
)
async def test_unusable_borderless_email_is_422_before_any_write(
    db_session, fake_redis, borderless, email
):
    if email == LONG_EMAIL:
        assert len(email) > 100
        UserCreateDTO(username='x', email=email)  # valid, just too long
    borderless.add(id='bl-long', email=email)
    before = (
        await _users(db_session),
        await _bindings(db_session),
        await _badges(db_session),
    )
    use_case = _use_case(db_session, fake_redis, borderless)

    # More refusals than the per-email limit: never a 429, never counted.
    for _ in range(6):
        with pytest.raises(EmailUnusable) as excinfo:
            await use_case.execute(email, PASSWORD)

    assert excinfo.value.status_code == 422
    assert excinfo.value.code == 'email_unusable'
    assert excinfo.value.message == (
        'This Borderless email cannot be used with applika: it must be a '
        'valid address of at most 100 characters'
    )
    assert await fake_redis.get(email_counter_key(email)) is None
    assert len(borderless.sign_in_calls) == 6
    assert (
        await _users(db_session),
        await _bindings(db_session),
        await _badges(db_session),
    ) == before


@pytest.mark.asyncio
async def test_bound_account_is_not_refused_for_a_long_borderless_email(
    db_session, fake_redis, borderless
):
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-1', badge=None)
    borderless.add(id='bl-1', email=LONG_EMAIL)

    result = await _use_case(db_session, fake_redis, borderless).execute(
        LONG_EMAIL, PASSWORD
    )

    assert (result.user_id, result.new_account) == (user_id, False)
    binding = await _binding(db_session, user_id)
    await db_session.refresh(binding)
    assert binding.email == LONG_EMAIL


@pytest.mark.asyncio
async def test_wrong_password_is_invalid_credentials(
    db_session, fake_redis, borderless
):
    borderless.add(id='bl-1', email='a@example.com')
    with pytest.raises(InvalidCredentials) as excinfo:
        await _use_case(db_session, fake_redis, borderless).execute(
            'a@example.com', 'wrong'
        )
    assert excinfo.value.message == 'Invalid email or password'


@pytest.mark.asyncio
async def test_sixth_attempt_after_five_failures_is_429_without_a_call(
    db_session, fake_redis, borderless
):
    borderless.add(id='bl-1', email='a@example.com')
    use_case = _use_case(db_session, fake_redis, borderless)
    for _ in range(5):
        with pytest.raises(InvalidCredentials):
            await use_case.execute('A@example.com', 'wrong')
    calls = len(borderless.sign_in_calls)

    with pytest.raises(SignInRateLimited) as excinfo:
        await use_case.execute('a@example.com', PASSWORD)

    assert len(borderless.sign_in_calls) == calls
    assert 0 < excinfo.value.retry_after <= 900
    assert excinfo.value.message == (
        f'Too many sign-in attempts. Try again in '
        f'{excinfo.value.retry_after} seconds.'
    )
    assert excinfo.value.headers == {
        'Retry-After': str(excinfo.value.retry_after)
    }
    assert 'a@example.com' not in email_counter_key('a@example.com')


@pytest.mark.asyncio
async def test_success_clears_the_failure_counter(
    db_session, fake_redis, borderless
):
    borderless.add(id='bl-1', email='a@example.com')
    use_case = _use_case(db_session, fake_redis, borderless)
    for _ in range(4):
        with pytest.raises(InvalidCredentials):
            await use_case.execute('a@example.com', 'wrong')
    await use_case.execute('a@example.com', PASSWORD)
    assert await fake_redis.get(email_counter_key('a@example.com')) is None


@pytest.mark.asyncio
async def test_redis_down_fails_open(db_session, fake_redis, borderless):
    borderless.add(id='bl-1', email='a@example.com')
    fake_redis.fail = ConnectionError('down')
    result = await _use_case(db_session, fake_redis, borderless).execute(
        'a@example.com', PASSWORD
    )
    assert result.new_account is True


@pytest.mark.asyncio
async def test_borderless_rate_limit_is_429_with_its_wait(
    db_session, fake_redis, borderless
):
    borderless.sign_in_error = BorderlessRateLimited(30)
    with pytest.raises(SignInRateLimited) as excinfo:
        await _use_case(db_session, fake_redis, borderless).execute(
            'a@example.com', PASSWORD
        )
    assert excinfo.value.retry_after == 30


@pytest.mark.asyncio
async def test_borderless_unavailable_is_503_try_again_later(
    db_session, fake_redis, borderless
):
    borderless.sign_in_error = BorderlessUnavailable('down')
    with pytest.raises(ServiceUnavailable) as excinfo:
        await _use_case(db_session, fake_redis, borderless).execute(
            'a@example.com', PASSWORD
        )
    assert excinfo.value.message == (
        'Borderless is unavailable, try again later'
    )


@pytest.mark.asyncio
async def test_not_configured_is_503(db_session, fake_redis, borderless):
    borderless.configured = False
    with pytest.raises(ServiceUnavailable) as excinfo:
        await _use_case(db_session, fake_redis, borderless).execute(
            'a@example.com', PASSWORD
        )
    assert excinfo.value.message == 'Borderless sign-in is not configured'
    assert borderless.sign_in_calls == []


@pytest.mark.asyncio
async def test_membership_read_failure_never_blocks_the_sign_in(
    db_session, fake_redis, borderless
):
    borderless.add(id='bl-1', email='a@example.com')
    borderless.read_error = BorderlessUnavailable('slow')
    result = await _use_case(db_session, fake_redis, borderless).execute(
        'a@example.com', PASSWORD
    )
    binding = await _binding(db_session, result.user_id)
    assert binding.profile_read_failed_at is not None
    assert await _live_badges(db_session, result.user_id) == []


def _answer(name, username, email='ada@example.com'):
    return BorderlessSignIn(
        user_id='x',
        email=email,
        email_verified=True,
        name=name,
        username=username,
        access_token='t',
        expires_in=1,
    )


@pytest.mark.parametrize(
    ('answer', 'expected'),
    [
        (_answer('Ada', 'ada'), 'Ada'),
        (_answer(None, 'ada'), 'ada'),
        (_answer('  ', 'ada'), 'ada'),
        (_answer(None, None), 'ada'),
        (_answer('x' * 150, None), 'x' * 100),
        (_answer(None, None, email='@example.com'), 'user'),
    ],
)
def test_username_falls_back_and_is_cut_to_100(answer, expected):
    assert username_for(answer) == expected
