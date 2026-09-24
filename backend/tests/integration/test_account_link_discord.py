"""Integration tests for KODI-020: connect, conflict, disconnect, failed
consent.

``async_client`` (tests/conftest.py) overrides ``get_current_user`` with a
fixed user (id 1, github_id 1) and is used for the routes that go through
``CurrentUserDp`` (begin, disconnect). The callback resolves the ``__access``
cookie itself via ``GetCurrentUserUseCase`` and never goes through that
override, so callback tests mint a real access-token cookie
(``app.core.tokens.create_access_token``) instead, exactly like
``tests/integration/test_oauth_cli.py`` does for the CLI handoff.
"""

from urllib.parse import parse_qs, urlparse

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.application.services.discord_oauth_service import DiscordLinkError
from app.application.use_cases.account_link_state import (
    AccountLinkStateUseCase,
)
from app.config.db import get_session
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.tokens import create_access_token
from app.domain.models import UserModel
from app.main import app as main_app
from app.presentation.dependencies import get_discord_oauth_service
from tests import msg
from tests.base_db_setup import base_data


class FakeDiscordOAuthService:
    """A network-free stand-in for ``DiscordOAuthServiceDp`` (T020)."""

    def __init__(self, discord_id: int | None = 555, configured: bool = True):
        self.discord_id = discord_id
        self.configured = configured
        self.fetch_calls = 0

    def is_configured(self) -> bool:
        return self.configured

    def get_authorize_url(self, state: str) -> str:
        return (
            'https://discord.com/oauth2/authorize?client_id=x'
            f'&response_type=code&scope=identify&state={state}'
        )

    async def fetch_discord_id(self, code: str) -> int:
        self.fetch_calls += 1
        if self.discord_id is None:
            raise DiscordLinkError('fake failure')
        return self.discord_id


def _override_discord_service(fake: FakeDiscordOAuthService):
    main_app.dependency_overrides[get_discord_oauth_service] = lambda: fake


@pytest_asyncio.fixture
async def raw_client(async_engine):
    """A client with no auth override: exercises the real cookie/session
    flow the callback and the 401 paths need."""
    SessionLocal = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with SessionLocal() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=main_app)
    async with AsyncClient(
        transport=transport, base_url='http://test/api'
    ) as client:
        yield client

    main_app.dependency_overrides.pop(get_session, None)
    main_app.dependency_overrides.pop(get_discord_oauth_service, None)


def _cookie_for(github_id: int) -> str:
    token, _, _ = create_access_token(str(github_id))
    return token


def _status(location: str) -> str:
    query = parse_qs(urlparse(location).query)
    return query['status'][0]


async def _get_user(session: AsyncSession, user_id: int) -> UserModel:
    """``AsyncSession.get`` types as ``UserModel | None``; every caller here
    already knows the row must exist, so this narrows it once instead of
    repeating the assert at every call site."""
    user = await session.get(UserModel, user_id)
    assert user is not None
    return user


# --- Begin (T020) ---


async def test_begin_returns_authorize_url_with_scope_and_state(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService())

    response = await async_client.post('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    url = response.json()['authorize_url']
    assert 'scope=identify' in url
    assert 'state=' in url


async def test_begin_without_session_is_401(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    response = await raw_client.post('/auth/link/discord')
    assert response.status_code == 401, msg(401, response.status_code)


async def test_begin_unconfigured_is_503(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(configured=False))

    response = await async_client.post('/auth/link/discord')

    assert response.status_code == 503, msg(503, response.status_code)
    assert response.json()['detail'] == 'Discord linking is not configured'


# --- Callback happy path (T020) ---


async def test_callback_links_and_redirects_status_linked(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    nonce = await state_uc.create(user_id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert response.status_code == 307, msg(307, response.status_code)
    location = response.headers['location']
    assert location.startswith(envs.ACCOUNT_LINK_REDIRECT_URI)
    assert _status(location) == 'linked'
    assert 'set-cookie' not in {k.lower() for k in response.headers.keys()}

    user = await _get_user(db_session, user_id)
    assert user.discord_id == 555


async def test_callback_relink_same_account_stays_linked(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    first_nonce = await state_uc.create(user_id)
    first = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': first_nonce},
    )
    assert _status(first.headers['location']) == 'linked'

    second_nonce = await state_uc.create(user_id)
    second = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': second_nonce},
    )
    assert _status(second.headers['location']) == 'linked'

    user = await _get_user(db_session, user_id)
    assert user.discord_id == 555


# --- Callback refusals (T020, T037, T039) ---


async def test_callback_unknown_state_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': 'never-issued'},
    )

    assert _status(response.headers['location']) == 'error'
    user = await _get_user(db_session, base_data()['user'].id)
    assert user.discord_id is None


async def test_callback_replayed_state_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    nonce = await state_uc.create(user_id)
    # Consume it out from under the callback (a replay).
    assert await state_uc.consume(nonce) == user_id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'


async def test_callback_cookie_user_mismatch_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    state_uc = AccountLinkStateUseCase(redis_client)
    user_a_id = base_data()['user'].id
    nonce = await state_uc.create(user_a_id)
    # Session cookie belongs to a different user (admin_user, github_id=2).
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=2))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'
    user_a = await _get_user(db_session, user_a_id)
    assert user_a.discord_id is None


async def test_callback_missing_cookie_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(base_data()['user'].id)

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'


async def test_callback_discord_error_param_never_calls_discord(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    fake = FakeDiscordOAuthService(discord_id=555)
    _override_discord_service(fake)
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(base_data()['user'].id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'error': 'access_denied', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'
    assert fake.fetch_calls == 0


async def test_callback_missing_code_never_calls_discord(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    fake = FakeDiscordOAuthService(discord_id=555)
    _override_discord_service(fake)
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(base_data()['user'].id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'
    assert fake.fetch_calls == 0


async def test_callback_discord_link_error_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(discord_id=None))
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    nonce = await state_uc.create(user_id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'
    user = await _get_user(db_session, user_id)
    assert user.discord_id is None


async def test_callback_unconfigured_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(configured=False))
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(base_data()['user'].id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    # An unconfigured service also cannot yield a Discord id.
    assert _status(response.headers['location']) == 'error'


async def test_after_failure_retry_with_new_nonce_links(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    _override_discord_service(FakeDiscordOAuthService(discord_id=None))
    failing_nonce = await state_uc.create(user_id)
    failed = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': failing_nonce},
    )
    assert _status(failed.headers['location']) == 'error'

    _override_discord_service(FakeDiscordOAuthService(discord_id=777))
    retry_nonce = await state_uc.create(user_id)
    retried = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': retry_nonce},
    )
    assert _status(retried.headers['location']) == 'linked'


# --- Conflict (T029) ---


async def test_callback_conflict_when_id_belongs_to_another_user(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    state_uc = AccountLinkStateUseCase(redis_client)
    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id

    # User A links Discord id 555 first.
    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))
    nonce_a = await state_uc.create(user_a_id)
    first = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce_a},
    )
    assert _status(first.headers['location']) == 'linked'

    # User B tries to link the same Discord id.
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=2))
    nonce_b = await state_uc.create(user_b_id)
    second = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'def', 'state': nonce_b},
    )

    assert _status(second.headers['location']) == 'conflict'

    user_a = await _get_user(db_session, user_a_id)
    user_b = await _get_user(db_session, user_b_id)
    assert user_a.discord_id == 555
    assert user_b.discord_id is None


# --- Disconnect (T035) ---


async def test_disconnect_linked_returns_unlinked(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    user = await _get_user(db_session, base_data()['user'].id)
    user.discord_id = 555
    await db_session.commit()

    response = await async_client.delete('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    assert response.json() == {'provider': 'discord', 'linked': False}

    await db_session.refresh(user)
    assert user.discord_id is None


async def test_disconnect_already_unlinked_returns_200(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    response = await async_client.delete('/auth/link/discord')
    assert response.status_code == 200, msg(200, response.status_code)


async def test_disconnect_anonymous_is_401(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    response = await raw_client.delete('/auth/link/discord')
    assert response.status_code == 401, msg(401, response.status_code)


async def test_disconnect_works_when_unconfigured(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService(configured=False))
    user = await _get_user(db_session, base_data()['user'].id)
    user.discord_id = 555
    await db_session.commit()

    response = await async_client.delete('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    assert response.json()['linked'] is False


# --- Relink after disconnect (T035) ---


async def test_relink_same_id_after_disconnect(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    nonce = await state_uc.create(user_id)
    await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'a', 'state': nonce}
    )

    user = await _get_user(db_session, user_id)
    user.discord_id = None
    await db_session.commit()

    nonce2 = await state_uc.create(user_id)
    response = await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'b', 'state': nonce2}
    )
    assert _status(response.headers['location']) == 'linked'


async def test_relink_another_id_after_disconnect(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    nonce = await state_uc.create(user_id)
    await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'a', 'state': nonce}
    )
    user = await _get_user(db_session, user_id)
    user.discord_id = None
    await db_session.commit()

    _override_discord_service(FakeDiscordOAuthService(discord_id=888))
    nonce2 = await state_uc.create(user_id)
    response = await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'b', 'state': nonce2}
    )
    assert _status(response.headers['location']) == 'linked'
    await db_session.refresh(user)
    assert user.discord_id == 888


async def test_another_user_can_link_the_freed_id(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    state_uc = AccountLinkStateUseCase(redis_client)
    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))
    nonce_a = await state_uc.create(user_a_id)
    await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'a', 'state': nonce_a}
    )

    user_a = await _get_user(db_session, user_a_id)
    user_a.discord_id = None
    await db_session.commit()

    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=2))
    nonce_b = await state_uc.create(user_b_id)
    response = await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'b', 'state': nonce_b}
    )
    assert _status(response.headers['location']) == 'linked'
    user_b = await _get_user(db_session, user_b_id)
    assert user_b.discord_id == 555
