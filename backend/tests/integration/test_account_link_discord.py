"""Integration tests for KODI-024: connect, conflict, disconnect, reconnect,
failed consent - the connection-record flow (ADR-0013, supersedes ADR-0008).

``async_client`` (tests/conftest.py) overrides ``get_current_user`` with a
fixed user (id 1, github_id 1) and is used for the routes that go through
``CurrentUserDp`` (begin, disconnect). The callback resolves the ``__access``
cookie itself via ``GetCurrentUserUseCase`` and never goes through that
override, so callback tests mint a real access-token cookie
(``app.core.tokens.create_access_token``) instead.

``DiscordOAuthServiceDp`` is overridden by ``FakeDiscordOAuthService``, a
network-free stand-in for the KODI-024 ``exchange_code``/``fetch_profile``/
``revoke`` surface (T105).
"""

from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.application.services.discord_oauth_service import (
    DiscordGrant,
    DiscordLinkError,
    DiscordProfile,
)
from app.config.db import get_session
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.crypto import encrypt_discord_token
from app.core.enums import DiscordConnectionStatus
from app.core.tokens import create_access_token
from app.domain.models import DiscordConnectionModel, UserModel
from app.main import app as main_app
from app.presentation.dependencies import get_discord_oauth_service
from tests import msg
from tests.base_db_setup import base_data


@pytest.fixture(autouse=True)
def _discord_encryption_key(monkeypatch):
    """A fixed, valid Fernet key for the whole module: disconnect tests
    decrypt the seeded refresh token with the *real* ``crypto`` module, not
    the fake OAuth service."""
    monkeypatch.setattr(
        envs, 'DISCORD_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )


class FakeDiscordOAuthService:
    """A network-free stand-in for ``DiscordOAuthServiceDp`` (T105)."""

    def __init__(
        self,
        discord_id: int | None = 555,
        username: str = 'ada',
        global_name: str | None = None,
        avatar: str | None = None,
        configured: bool = True,
    ):
        self.discord_id = discord_id
        self.username = username
        self.global_name = global_name
        self.avatar = avatar
        self.configured = configured
        self.exchange_calls = 0
        self.revoke_calls: list[str] = []

    def is_configured(self) -> bool:
        return self.configured

    def get_authorize_url(self, state: str) -> str:
        return (
            'https://discord.com/oauth2/authorize?client_id=x'
            '&response_type=code&scope=identify+guilds+guilds.members.read'
            f'&state={state}'
        )

    async def exchange_code(self, code: str) -> DiscordGrant:
        self.exchange_calls += 1
        if self.discord_id is None:
            raise DiscordLinkError('fake failure')
        return DiscordGrant(
            access_token=f'fake-access-{self.discord_id}',
            refresh_token=f'fake-refresh-{self.discord_id}',
            expires_in=604800,
            scope='identify guilds guilds.members.read',
        )

    async def fetch_profile(self, access_token: str) -> DiscordProfile:
        assert self.discord_id is not None
        return DiscordProfile(
            id=self.discord_id,
            username=self.username,
            global_name=self.global_name,
            avatar=self.avatar,
        )

    async def revoke(self, refresh_token: str) -> None:
        self.revoke_calls.append(refresh_token)


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


async def _get_connection(
    session: AsyncSession, user_id: int
) -> DiscordConnectionModel | None:
    """Read the connection row fresh from the database.

    ``db_session`` is built with ``expire_on_commit=False``
    (``tests/conftest.py``), so a plain ``session.commit()`` followed by a
    plain ``select()`` can return the SAME, now-stale Python object out of
    the session's identity map whenever the caller (or an earlier
    ``_seed_connection``) still holds a live reference to it - the row was
    written by the app's own request-scoped session, not this one.
    ``populate_existing()`` forces the freshly queried row to overwrite
    whatever is already tracked, closing that gap deterministically instead
    of relying on the identity map entry having been garbage collected.
    """
    await session.commit()
    return await session.scalar(
        select(DiscordConnectionModel)
        .where(DiscordConnectionModel.user_id == user_id)
        .execution_options(populate_existing=True)
    )


async def _seed_connection(
    session: AsyncSession,
    user_id: int,
    discord_id: int,
    *,
    username: str = 'ada',
    status: DiscordConnectionStatus = DiscordConnectionStatus.ACTIVE,
    refresh_token: str = 'seeded-refresh-token',
) -> DiscordConnectionModel:
    encrypted = encrypt_discord_token(refresh_token)
    assert encrypted is not None
    connection = DiscordConnectionModel(
        user_id=user_id,
        discord_id=discord_id,
        username=username,
        global_name=None,
        avatar=None,
        scopes='identify guilds guilds.members.read',
        encrypted_refresh_token=encrypted,
        access_token_expires_at=None,
        status=status,
        linked_at=datetime.now(timezone.utc),
    )
    session.add(connection)
    await session.commit()
    await session.refresh(connection)
    return connection


# --- Begin (T105) ---


async def test_begin_returns_authorize_url_with_scope_and_state(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    _override_discord_service(FakeDiscordOAuthService())

    response = await async_client.post('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    url = response.json()['authorize_url']
    assert 'scope=identify+guilds+guilds.members.read' in url
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


# --- Callback happy path (T105) ---


async def test_callback_links_and_redirects_status_linked(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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

    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    assert connection.discord_id == 555
    assert connection.username == 'ada'
    assert connection.status == DiscordConnectionStatus.ACTIVE
    assert connection.scopes == 'identify guilds guilds.members.read'


async def test_callback_links_every_r021_field(
    raw_client: AsyncClient,
    db_session: AsyncSession,
    redis_client,
    monkeypatch,
):
    """AC12: identity, consent, expiry, state, linked/updated times - and
    the encrypted refresh token decrypts with the Discord key only."""
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    fake = FakeDiscordOAuthService(
        discord_id=777,
        username='lovelace',
        global_name='Ada Lovelace',
        avatar='avatar-hash',
    )
    _override_discord_service(fake)
    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    nonce = await state_uc.create(user_id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    assert connection.discord_id == 777
    assert connection.username == 'lovelace'
    assert connection.global_name == 'Ada Lovelace'
    assert connection.avatar == 'avatar-hash'
    assert connection.scopes == 'identify guilds guilds.members.read'
    assert connection.status == DiscordConnectionStatus.ACTIVE
    assert connection.linked_at is not None
    assert connection.created_at is not None
    # AC12 (access expiry): the fake grant's expires_in is 604800s (7 days),
    # so the stored expiry sits within a wide, deterministic tolerance of
    # now + 604800s.
    assert connection.access_token_expires_at is not None
    expected_expiry = datetime.now(timezone.utc) + timedelta(seconds=604800)
    assert (
        abs(
            (
                connection.access_token_expires_at - expected_expiry
            ).total_seconds()
        )
        < 60
    )

    from app.core.crypto import decrypt_discord_token, decrypt_token

    decrypted = decrypt_discord_token(connection.encrypted_refresh_token)
    assert decrypted == 'fake-refresh-777'
    # The Discord ciphertext is never readable with a (valid) GitHub key.
    monkeypatch.setattr(
        envs, 'GITHUB_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    assert decrypt_token(connection.encrypted_refresh_token) is None


def test_users_model_has_no_discord_column():
    column_names = {c.name for c in UserModel.__table__.columns}
    assert 'discord_id' not in column_names


async def test_callback_relink_same_account_stays_linked(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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

    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    assert connection.discord_id == 555


# --- Callback refusals (T105) ---


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
    connection = await _get_connection(db_session, base_data()['user'].id)
    assert connection is None


async def test_callback_replayed_state_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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


async def test_callback_expired_state_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': 'expired-or-unknown'},
    )

    assert _status(response.headers['location']) == 'error'


async def test_callback_cookie_user_mismatch_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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
    connection = await _get_connection(db_session, user_a_id)
    assert connection is None


async def test_callback_missing_cookie_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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
    assert fake.exchange_calls == 0


async def test_callback_missing_code_never_calls_discord(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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
    assert fake.exchange_calls == 0


async def test_callback_discord_link_error_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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
    connection = await _get_connection(db_session, user_id)
    assert connection is None


async def test_callback_unconfigured_is_error(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    _override_discord_service(FakeDiscordOAuthService(configured=False))
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(base_data()['user'].id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'error'


async def test_after_failure_retry_with_new_nonce_links(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

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


# --- Conflict (T105) ---


async def test_callback_conflict_when_id_belongs_to_another_user(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    state_uc = AccountLinkStateUseCase(redis_client)
    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id

    # User A links Discord id 555 first.
    fake_a = FakeDiscordOAuthService(discord_id=555)
    _override_discord_service(fake_a)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))
    nonce_a = await state_uc.create(user_a_id)
    first = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce_a},
    )
    assert _status(first.headers['location']) == 'linked'

    # User B tries to link the same Discord id: their own grant is revoked.
    fake_b = FakeDiscordOAuthService(discord_id=555)
    _override_discord_service(fake_b)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=2))
    nonce_b = await state_uc.create(user_b_id)
    second = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'def', 'state': nonce_b},
    )

    assert _status(second.headers['location']) == 'conflict'
    assert fake_b.revoke_calls == ['fake-refresh-555']

    connection_a = await _get_connection(db_session, user_a_id)
    connection_b = await _get_connection(db_session, user_b_id)
    assert connection_a is not None
    assert connection_a.discord_id == 555
    assert connection_b is None


async def test_race_integrity_error_is_conflict(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client, monkeypatch
):
    """A second connect for the same Discord id that LOSES the pre-check
    race - ``get_by_discord_id`` returns ``None`` right before another
    request's row commits - is caught as an ``IntegrityError`` on
    ``uq_discord_connections_discord_id`` and mapped to the same conflict
    as the pre-check path above (T095's ``except IntegrityError`` branch)."""
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )
    from app.domain.repositories.discord_connection_repository import (
        DiscordConnectionRepository,
    )

    state_uc = AccountLinkStateUseCase(redis_client)
    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id
    await _seed_connection(db_session, user_a_id, discord_id=555)

    # Simulate B's transaction losing the race: its own pre-check sees no
    # owner (as if A's row had not committed yet), so it proceeds straight
    # to the INSERT, which the database's own unique constraint refuses.
    async def _no_owner_found(self, discord_id):
        return None

    monkeypatch.setattr(
        DiscordConnectionRepository, 'get_by_discord_id', _no_owner_found
    )

    fake_b = FakeDiscordOAuthService(discord_id=555)
    _override_discord_service(fake_b)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=2))
    nonce_b = await state_uc.create(user_b_id)

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'def', 'state': nonce_b},
    )

    assert _status(response.headers['location']) == 'conflict'
    assert fake_b.revoke_calls == ['fake-refresh-555']

    connection_a = await _get_connection(db_session, user_a_id)
    connection_b = await _get_connection(db_session, user_b_id)
    assert connection_a is not None
    assert connection_a.discord_id == 555
    assert connection_b is None


# --- Disconnect (T105) ---


async def test_disconnect_linked_returns_unlinked_and_revokes(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    fake = FakeDiscordOAuthService()
    _override_discord_service(fake)
    await _seed_connection(
        db_session,
        base_data()['user'].id,
        discord_id=555,
        refresh_token='the-stored-refresh-token',
    )

    response = await async_client.delete('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    assert response.json() == {'provider': 'discord', 'linked': False}
    assert fake.revoke_calls == ['the-stored-refresh-token']

    connection = await _get_connection(db_session, base_data()['user'].id)
    assert connection is None


async def test_disconnect_already_unlinked_returns_200(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    fake = FakeDiscordOAuthService()
    _override_discord_service(fake)

    response = await async_client.delete('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    assert fake.revoke_calls == []


async def test_disconnect_anonymous_is_401(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    response = await raw_client.delete('/auth/link/discord')
    assert response.status_code == 401, msg(401, response.status_code)


async def test_disconnect_works_when_unconfigured_no_revoke(
    async_client: AsyncClient, db_session: AsyncSession, redis_client
):
    fake = FakeDiscordOAuthService(configured=False)
    _override_discord_service(fake)
    await _seed_connection(db_session, base_data()['user'].id, discord_id=555)

    response = await async_client.delete('/auth/link/discord')

    assert response.status_code == 200, msg(200, response.status_code)
    assert response.json()['linked'] is False
    assert fake.revoke_calls == []

    connection = await _get_connection(db_session, base_data()['user'].id)
    assert connection is None


# --- Relink after disconnect / reconnect (T105) ---


async def test_relink_same_id_after_disconnect(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    nonce = await state_uc.create(user_id)
    await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'a', 'state': nonce}
    )

    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    await db_session.delete(connection)
    await db_session.commit()

    nonce2 = await state_uc.create(user_id)
    response = await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'b', 'state': nonce2}
    )
    assert _status(response.headers['location']) == 'linked'


async def test_relink_another_id_after_disconnect(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    state_uc = AccountLinkStateUseCase(redis_client)
    user_id = base_data()['user'].id
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    nonce = await state_uc.create(user_id)
    await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'a', 'state': nonce}
    )
    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    await db_session.delete(connection)
    await db_session.commit()

    _override_discord_service(FakeDiscordOAuthService(discord_id=888))
    nonce2 = await state_uc.create(user_id)
    response = await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'b', 'state': nonce2}
    )
    assert _status(response.headers['location']) == 'linked'

    reconnected = await _get_connection(db_session, user_id)
    assert reconnected is not None
    assert reconnected.discord_id == 888


async def test_another_user_can_link_the_freed_id(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    state_uc = AccountLinkStateUseCase(redis_client)
    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id

    _override_discord_service(FakeDiscordOAuthService(discord_id=555))
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))
    nonce_a = await state_uc.create(user_a_id)
    await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'a', 'state': nonce_a}
    )

    connection_a = await _get_connection(db_session, user_a_id)
    assert connection_a is not None
    await db_session.delete(connection_a)
    await db_session.commit()

    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=2))
    nonce_b = await state_uc.create(user_b_id)
    response = await raw_client.get(
        '/auth/link/discord/callback', params={'code': 'b', 'state': nonce_b}
    )
    assert _status(response.headers['location']) == 'linked'
    connection_b = await _get_connection(db_session, user_b_id)
    assert connection_b is not None
    assert connection_b.discord_id == 555


async def test_reconnect_needs_reconnect_row_refreshes_and_clears_mark(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    """AC16: reconnecting runs the same consent flow, refreshes the stored
    data and clears the reconnection mark."""
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    user_id = base_data()['user'].id
    seeded = await _seed_connection(
        db_session,
        user_id,
        discord_id=555,
        username='stale-name',
        status=DiscordConnectionStatus.NEEDS_RECONNECT,
    )
    original_linked_at = seeded.linked_at

    fake = FakeDiscordOAuthService(
        discord_id=555, username='fresh-name', global_name='Fresh Name'
    )
    _override_discord_service(fake)
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(user_id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'linked'
    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    assert connection.status == DiscordConnectionStatus.ACTIVE
    assert connection.username == 'fresh-name'
    assert connection.global_name == 'Fresh Name'
    # AC12/AC16: the reconnect is a real update, not a fresh insert -
    # `updated_at` fires (SQLAlchemy `onupdate`) and `linked_at` moves
    # forward rather than staying at the original connect time.
    assert connection.updated_at is not None
    assert connection.linked_at > original_linked_at
    # R-017 (K6 share): the reconnect replaced the stored refresh token -
    # the seeded ciphertext decrypted to 'seeded-refresh-token'; the row now
    # decrypts to the fresh grant's token instead.
    from app.core.crypto import decrypt_discord_token

    assert (
        decrypt_discord_token(connection.encrypted_refresh_token)
        == 'fake-refresh-555'
    )


async def test_store_grant_replaces_encrypted_token_and_expiry(
    db_session: AsyncSession,
):
    """R-017 (K6 share): each successful renewal
    (``DiscordOAuthService.refresh``, K8) persists the rotated refresh
    token through ``store_grant``, encrypted, replacing the old one."""
    from app.core.crypto import decrypt_discord_token
    from app.domain.repositories.discord_connection_repository import (
        DiscordConnectionRepository,
    )

    user_id = base_data()['user'].id
    await _seed_connection(
        db_session, user_id, discord_id=555, refresh_token='original-token'
    )

    repo = DiscordConnectionRepository(db_session)
    new_expiry = datetime.now(timezone.utc) + timedelta(seconds=3600)
    rotated_ciphertext = encrypt_discord_token('rotated-refresh-token')
    assert rotated_ciphertext is not None

    updated = await repo.store_grant(
        user_id,
        rotated_ciphertext,
        new_expiry,
        'identify guilds guilds.members.read',
    )

    assert updated is not None
    assert (
        decrypt_discord_token(updated.encrypted_refresh_token)
        == 'rotated-refresh-token'
    )
    assert updated.access_token_expires_at == new_expiry
    assert updated.scopes == 'identify guilds guilds.members.read'

    reread = await _get_connection(db_session, user_id)
    assert reread is not None
    assert (
        decrypt_discord_token(reread.encrypted_refresh_token)
        == 'rotated-refresh-token'
    )


async def test_store_grant_on_unlinked_user_returns_none(
    db_session: AsyncSession,
):
    from app.domain.repositories.discord_connection_repository import (
        DiscordConnectionRepository,
    )

    repo = DiscordConnectionRepository(db_session)

    result = await repo.store_grant(
        base_data()['user'].id,
        'whatever-ciphertext',
        None,
        'identify guilds guilds.members.read',
    )

    assert result is None


async def test_mark_needs_reconnect_sets_status(db_session: AsyncSession):
    """Sibling of ``store_grant``: K8 calls this on a 400 ``invalid_grant``
    from ``DiscordOAuthService.refresh``; unused by K6's own routes but
    owned by this repository."""
    from app.domain.repositories.discord_connection_repository import (
        DiscordConnectionRepository,
    )

    user_id = base_data()['user'].id
    await _seed_connection(db_session, user_id, discord_id=555)
    repo = DiscordConnectionRepository(db_session)

    await repo.mark_needs_reconnect(user_id)

    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    assert connection.status == DiscordConnectionStatus.NEEDS_RECONNECT


async def test_mark_needs_reconnect_on_unlinked_user_is_a_no_op(
    db_session: AsyncSession,
):
    from app.domain.repositories.discord_connection_repository import (
        DiscordConnectionRepository,
    )

    repo = DiscordConnectionRepository(db_session)

    await repo.mark_needs_reconnect(base_data()['user'].id)  # must not raise

    connection = await _get_connection(db_session, base_data()['user'].id)
    assert connection is None


async def test_reconnect_needs_reconnect_different_account_replaces_row(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    """A ``needs_reconnect`` user authorising a *different* Discord account
    gets the row replaced in place, not a second row."""
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    user_id = base_data()['user'].id
    await _seed_connection(
        db_session,
        user_id,
        discord_id=555,
        status=DiscordConnectionStatus.NEEDS_RECONNECT,
    )

    _override_discord_service(FakeDiscordOAuthService(discord_id=999))
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(user_id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'linked'
    connection = await _get_connection(db_session, user_id)
    assert connection is not None
    assert connection.discord_id == 999
    assert connection.status == DiscordConnectionStatus.ACTIVE

    all_connections = (
        (
            await db_session.execute(
                select(DiscordConnectionModel).where(
                    DiscordConnectionModel.user_id == user_id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(all_connections) == 1


async def test_reconnect_another_user_holds_that_account_is_conflict(
    raw_client: AsyncClient, db_session: AsyncSession, redis_client
):
    """``needs_reconnect`` trying to authorise an account another user
    already holds: the old row stays unchanged and the new grant is
    revoked."""
    from app.application.use_cases.account_link_state import (
        AccountLinkStateUseCase,
    )

    user_a_id = base_data()['user'].id
    user_b_id = base_data()['admin_user'].id
    await _seed_connection(
        db_session,
        user_a_id,
        discord_id=555,
        status=DiscordConnectionStatus.NEEDS_RECONNECT,
    )
    await _seed_connection(db_session, user_b_id, discord_id=999)

    fake = FakeDiscordOAuthService(discord_id=999)
    _override_discord_service(fake)
    state_uc = AccountLinkStateUseCase(redis_client)
    nonce = await state_uc.create(user_a_id)
    raw_client.cookies.set(ACCESS_COOKIE_NAME, _cookie_for(github_id=1))

    response = await raw_client.get(
        '/auth/link/discord/callback',
        params={'code': 'abc', 'state': nonce},
    )

    assert _status(response.headers['location']) == 'conflict'
    assert fake.revoke_calls == ['fake-refresh-999']

    connection_a = await _get_connection(db_session, user_a_id)
    assert connection_a is not None
    assert connection_a.discord_id == 555
    assert connection_a.status == DiscordConnectionStatus.NEEDS_RECONNECT
