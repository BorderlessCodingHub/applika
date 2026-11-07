"""``BorderlessSignInUseCase`` (ADR-0024 §1, ADR-0026 §5, §6, §7) on a real
database, with an in-memory access-token store.

The identity is one the OpenID Connect client verified. Resolution, by
``sub``: (1) the bound account; (2) the account whose email equals the
Borderless email ignoring case (exact spelling first), bound now, refused
when bound to another Borderless account or ambiguous; (3) a new account.
The refresh token is stored encrypted, the access token goes to the store,
the membership claim becomes the badge.
"""

import pytest
from sqlalchemy import func, select

from app.application.dto.user import UserCreateDTO
from app.application.services.borderless_oidc import (
    BorderlessGrant,
    BorderlessIdentity,
)
from app.application.use_cases.borderless.sign_in import (
    BorderlessSignInUseCase,
    username_for,
)
from app.config.settings import envs
from app.core.crypto import decrypt_borderless_token
from app.core.exceptions import (
    BindingConflict,
    EmailAmbiguous,
    EmailUnusable,
    EmailUnverified,
    ServiceUnavailable,
)
from app.domain.models import BorderlessAccountModel, UserBadgeModel, UserModel
from tests.base_db_setup import base_data
from tests.conftest import MemoryAccessStore, bind_borderless


def identity(
    sub: str = 'bl-new',
    email: str = 'new@example.com',
    *,
    verified: bool = True,
    membership: str | None = 'PSP',
    name: str | None = 'New Person',
    preferred_username: str | None = 'new-person',
) -> BorderlessIdentity:
    return BorderlessIdentity(
        sub=sub,
        email=email,
        email_verified=verified,
        name=name,
        preferred_username=preferred_username,
        membership=membership,
    )


def grant(
    who: BorderlessIdentity, refresh: str | None = 'refresh-1'
) -> BorderlessGrant:
    return BorderlessGrant(
        identity=who,
        refresh_token=refresh,
        access_token='access-1',
        expires_in=3600,
    )


async def sign_in(db_session, store, who, **grant_args):
    use_case = BorderlessSignInUseCase(db_session, store)
    return await use_case.execute(who, grant(who, **grant_args))


@pytest.fixture
def store() -> MemoryAccessStore:
    return MemoryAccessStore()


async def _users(db_session) -> int:
    return await db_session.scalar(select(func.count()).select_from(UserModel))


async def _bindings(db_session) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(BorderlessAccountModel)
    )


async def _badges(db_session) -> int:
    return await db_session.scalar(
        select(func.count()).select_from(UserBadgeModel)
    )


async def _binding(db_session, user_id) -> BorderlessAccountModel:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == user_id
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    return binding


async def _live_badges(db_session, user_id) -> list[str]:
    rows = await db_session.scalars(
        select(UserBadgeModel.badge).where(
            UserBadgeModel.user_id == user_id,
            UserBadgeModel.revoked_at.is_(None),
        )
    )
    return list(rows)


async def test_new_email_creates_an_account_bound_with_a_badge(
    db_session, store
):
    result = await sign_in(db_session, store, identity())

    assert result.new_account is True
    user = await db_session.get(UserModel, result.user_id)
    assert user.email == 'new@example.com'
    assert user.username == 'New Person'
    binding = await _binding(db_session, result.user_id)
    assert binding.borderless_user_id == 'bl-new'
    assert binding.status == 'active'
    assert binding.profile_read_at is not None
    # The refresh token only, encrypted; never in plain text.
    assert binding.encrypted_refresh_token != 'refresh-1'
    assert decrypt_borderless_token(
        binding.encrypted_refresh_token or ''
    ) == ('refresh-1')
    assert await _live_badges(db_session, result.user_id) == ['borderless_psp']
    # The access token goes to the short-term store, never the database.
    assert store.tokens == {result.user_id: ('access-1', 3600)}
    columns = {c.name for c in BorderlessAccountModel.__table__.columns}
    assert not any('access' in name for name in columns)


async def test_email_match_ignoring_case_binds_the_existing_account(
    db_session, store
):
    before = await _users(db_session)

    result = await sign_in(
        db_session,
        store,
        identity('bl-1', 'TEST@user.com', membership='base'),
    )

    assert result.user_id == base_data()['user'].id
    assert result.new_account is False
    assert await _users(db_session) == before
    assert await _live_badges(db_session, result.user_id) == ['borderless_base']


async def test_bound_account_signs_in_and_stores_the_new_refresh_token(
    db_session, store
):
    user_id = base_data()['user'].id
    await bind_borderless(
        db_session, user_id, borderless_id='bl-1', status='needs_reconnect'
    )

    result = await sign_in(
        db_session,
        store,
        identity('bl-1', 'changed@example.com'),
        refresh='refresh-2',
    )

    assert (result.user_id, result.new_account) == (user_id, False)
    binding = await _binding(db_session, user_id)
    assert decrypt_borderless_token(
        binding.encrypted_refresh_token or ''
    ) == ('refresh-2')
    assert binding.email == 'changed@example.com'
    # A new sign-in unlocks member access again.
    assert binding.status == 'active'


async def test_the_account_is_known_by_sub_never_by_email(db_session, store):
    """A bound ``sub`` opens its account whatever the email says."""
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-1')
    db_session.add(UserModel(id=60, username='other', email='other@x.com'))
    await db_session.commit()

    result = await sign_in(db_session, store, identity('bl-1', 'other@x.com'))

    assert result.user_id == user_id


async def test_email_of_an_account_bound_to_another_borderless_id_is_409(
    db_session, store
):
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-other')
    before = await _users(db_session)

    with pytest.raises(BindingConflict) as excinfo:
        await sign_in(db_session, store, identity('bl-new', 'Test@User.com'))

    assert excinfo.value.code == 'AUTH-1006'
    assert await _users(db_session) == before
    binding = await _binding(db_session, user_id)
    assert binding.borderless_user_id == 'bl-other'
    assert store.tokens == {}


async def test_exact_spelling_wins_over_other_case_matches(db_session, store):
    db_session.add(UserModel(id=50, username='upper', email='Mixed@Case.com'))
    db_session.add(UserModel(id=51, username='lower', email='mixed@case.com'))
    await db_session.commit()

    result = await sign_in(
        db_session, store, identity('bl-mix', 'mixed@case.com')
    )
    assert result.user_id == 51


async def test_several_case_matches_and_none_exact_is_409_ambiguous(
    db_session, store
):
    db_session.add(UserModel(id=50, username='upper', email='Mixed@Case.com'))
    db_session.add(UserModel(id=51, username='lower', email='mixed@case.com'))
    await db_session.commit()
    before = await _users(db_session)

    with pytest.raises(EmailAmbiguous) as excinfo:
        await sign_in(db_session, store, identity('bl-mix', 'MIXED@case.com'))
    assert excinfo.value.code == 'AUTH-1007'
    assert await _users(db_session) == before


async def test_unverified_email_is_refused_and_nothing_written(
    db_session, store
):
    before = (await _users(db_session), await _bindings(db_session))
    with pytest.raises(EmailUnverified) as excinfo:
        await sign_in(db_session, store, identity(verified=False))
    assert excinfo.value.code == 'AUTH-1005'
    assert excinfo.value.message == 'Verify your email on Borderless first'
    assert (await _users(db_session), await _bindings(db_session)) == before
    assert store.tokens == {}


async def test_no_refresh_token_or_no_key_is_refused(
    db_session, store, monkeypatch
):
    with pytest.raises(ServiceUnavailable):
        await sign_in(db_session, store, identity(), refresh=None)
    monkeypatch.setattr(envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', None)
    with pytest.raises(ServiceUnavailable) as excinfo:
        await sign_in(db_session, store, identity())
    assert excinfo.value.code == 'AUTH-1018'
    assert await _bindings(db_session) == 0


@pytest.mark.parametrize(
    ('membership', 'badges'),
    [
        ('BASE', ['borderless_base']),
        ('PSP', ['borderless_psp']),
        ('psp', ['borderless_psp']),
        (' Base ', ['borderless_base']),
        ('FREE', []),
        ('STARTER', []),
        ('GOLD', []),
        (None, []),
    ],
)
async def test_the_membership_claim_becomes_the_badge(
    db_session, store, membership, badges
):
    result = await sign_in(
        db_session, store, identity(membership=membership)
    )
    assert await _live_badges(db_session, result.user_id) == badges


async def test_a_lost_membership_revokes_the_badge_and_keeps_history(
    db_session, store
):
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-1')

    await sign_in(db_session, store, identity('bl-1', membership='FREE'))

    assert await _live_badges(db_session, user_id) == []
    assert await _badges(db_session) == 1  # the PSP row, revoked


# 113 characters, accepted by ``UserCreateDTO``: only the length refuses it.
LONG_EMAIL = 'a' * 60 + '@' + 'b' * 40 + '.example.com'
EMAIL_100 = 'a' * 60 + '@' + 'b' * 27 + '.example.com'
EMAIL_101 = 'a' * 60 + '@' + 'b' * 28 + '.example.com'
# 95 characters that normalize to 115 (U+2121 maps to "tel").
GROWS_ON_NORMALIZING = 'a' * 80 + '@' + '℡' * 10 + '.com'
# 99 characters that normalize to exactly 101.
NORMALIZES_TO_101 = 'a' * 93 + '@' + '℡' + '.com'


@pytest.mark.parametrize(
    'email',
    [
        LONG_EMAIL,
        EMAIL_101,
        GROWS_ON_NORMALIZING,
        NORMALIZES_TO_101,
        'not-an-email',
    ],
    ids=[
        'over-100',
        'exactly-101',
        'grows-on-normalizing',
        'normalizes-to-101',
        'invalid',
    ],
)
async def test_unusable_borderless_email_is_refused_before_any_write(
    db_session, store, email
):
    if email != 'not-an-email':
        assert len(UserCreateDTO(username='x', email=email).email) > 100
    before = (
        await _users(db_session),
        await _bindings(db_session),
        await _badges(db_session),
    )

    with pytest.raises(EmailUnusable) as excinfo:
        await sign_in(db_session, store, identity('bl-long', email))

    assert excinfo.value.code == 'AUTH-1008'
    assert (
        await _users(db_session),
        await _bindings(db_session),
        await _badges(db_session),
    ) == before


async def test_exactly_100_character_borderless_email_creates_the_account(
    db_session, store
):
    assert len(EMAIL_100) == 100
    result = await sign_in(db_session, store, identity('bl-100', EMAIL_100))
    assert result.new_account is True
    user = await db_session.get(UserModel, result.user_id)
    assert user.email == EMAIL_100


async def test_bound_account_is_not_refused_for_a_long_borderless_email(
    db_session, store
):
    user_id = base_data()['user'].id
    await bind_borderless(db_session, user_id, borderless_id='bl-1', badge=None)

    result = await sign_in(db_session, store, identity('bl-1', LONG_EMAIL))

    assert (result.user_id, result.new_account) == (user_id, False)
    assert (await _binding(db_session, user_id)).email == LONG_EMAIL


@pytest.mark.parametrize(
    ('who', 'expected'),
    [
        (identity(name='Ada', preferred_username='ada'), 'Ada'),
        (identity(name=None, preferred_username='ada'), 'ada'),
        (identity(name='  ', preferred_username='ada'), 'ada'),
        (identity('x', 'ada@example.com', name=None, preferred_username=None), 'ada'),
        (identity(name='x' * 150), 'x' * 100),
        (
            identity('x', '@example.com', name=None, preferred_username=None),
            'user',
        ),
    ],
)
def test_username_is_the_name_else_the_username(who, expected):
    assert username_for(who) == expected


def test_the_grant_never_shows_its_tokens():
    shown = repr(grant(identity()))
    assert 'refresh-1' not in shown
    assert 'access-1' not in shown
