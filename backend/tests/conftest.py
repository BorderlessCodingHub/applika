import logging
from datetime import datetime, timezone

import httpx
import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from pydantic import SecretStr
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.application.services.borderless_oidc import BorderlessOidcClient
from app.application.services.github_service import (
    GitHubGrant,
    GitHubIdentity,
    GitHubOAuthError,
)
from app.config.db import get_session
from app.config.settings import envs
from app.core.crypto import clear_decrypt_cache, encrypt_borderless_token
from app.core.enums import BadgeKey
from app.domain.models import Base, BorderlessAccountModel, UserBadgeModel
from app.main import app as main_app
from app.presentation.dependencies import (
    get_borderless_access_store,
    get_borderless_oidc_client,
    get_current_user,
    get_github_oauth_service,
    get_job_queue,
)
from tests.base_db_setup import base_data
from tests.features_seed import enrol, seed_cvs_feature, seed_jobs_feature
from tests.fixtures.borderless.fake_oidc import FakeBorderless, load_config

# The fake Borderless every test drives (ADR-0026 §12): synthetic client
# credentials from ``tests/fixtures/borderless/accounts.json``.
BORDERLESS_ISSUER = 'http://borderless.test/api/auth'
BORDERLESS_CONFIG = load_config()


@pytest.fixture(autouse=True, scope='session')
def _rate_limit_disabled():
    """The limiter is OFF by default in every test (T032): tests
    that exercise it turn it back on with ``monkeypatch`` on ``envs``."""
    previous = envs.RATE_LIMIT_ENABLED
    envs.RATE_LIMIT_ENABLED = False
    yield
    envs.RATE_LIMIT_ENABLED = previous


@pytest.fixture(autouse=True)
def _app_logger_enabled():
    """Keep the ``app`` logger alive for the audit-log assertions.

    The migration tests run the real Alembic chain, and ``migrations/env.py``
    calls ``logging.config.fileConfig``, which disables every logger that
    already exists, ``app`` included, for the rest of the session.
    """
    logging.getLogger('app').disabled = False


@pytest.fixture(autouse=True, scope='session')
def _borderless_settings():
    """The fake Borderless's issuer and synthetic client, and a throwaway
    Fernet key, for every test: nobody calls the real Borderless."""
    names = (
        'BORDERLESS_ISSUER',
        'BORDERLESS_CLIENT_ID',
        'BORDERLESS_CLIENT_SECRET',
        'BORDERLESS_REDIRECT_URI',
        'BORDERLESS_TOKEN_ENCRYPTION_KEY',
    )
    previous = {name: getattr(envs, name) for name in names}
    client = BORDERLESS_CONFIG['client']
    envs.BORDERLESS_ISSUER = BORDERLESS_ISSUER
    envs.BORDERLESS_CLIENT_ID = client['client_id']
    envs.BORDERLESS_CLIENT_SECRET = SecretStr(client['client_secret'])
    envs.BORDERLESS_REDIRECT_URI = client['redirect_uris'][0]
    envs.BORDERLESS_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    yield
    for name, value in previous.items():
        setattr(envs, name, value)


@pytest.fixture(autouse=True)
def _fresh_decrypt_cache():
    """The refresh-token decrypt cache starts empty in every test."""
    clear_decrypt_cache()
    yield
    clear_decrypt_cache()


class MemoryAccessStore(BorderlessAccessStore):
    """The Redis access-token store, in memory, for tests that run without
    Redis (``async_client``, ``admin_client``). ``tokens``: user id →
    ``(access_token, expires_in)``."""

    def __init__(self) -> None:
        self.tokens: dict[int, tuple[str, int]] = {}

    async def put(
        self, user_id: int, access_token: str, expires_in: int
    ) -> None:
        if expires_in > 0:
            self.tokens[user_id] = (access_token, expires_in)

    async def present(self, user_id: int) -> bool:
        return user_id in self.tokens

    async def drop(self, user_id: int) -> None:
        self.tokens.pop(user_id, None)


class FakeGitHubOAuthService:
    """``GitHubOAuthService`` without GitHub: ``identity`` is who signs in
    at GitHub; ``revoked`` records every revoke."""

    def __init__(self) -> None:
        self.configured = True
        self.identity: GitHubIdentity | None = GitHubIdentity(
            id=4242, login='octocat'
        )
        self.exchange_error = False
        self.codes: list[str] = []
        self.revoked: list[str] = []

    def is_configured(self) -> bool:
        return self.configured

    def authorize_url(self, state: str) -> str:
        return (
            'https://github.com/login/oauth/authorize?client_id=test'
            f'&scope=read%3Auser&state={state}'
        )

    async def exchange_code(self, code: str) -> GitHubGrant:
        self.codes.append(code)
        if self.exchange_error:
            raise GitHubOAuthError('exchange failed')
        return GitHubGrant(access_token=f'gho_{code}')

    async def fetch_identity(self, access_token: str) -> GitHubIdentity:
        if self.identity is None:
            raise GitHubOAuthError('identity failed')
        return self.identity

    async def revoke(self, access_token: str) -> None:
        self.revoked.append(access_token)


@pytest.fixture
def fake_borderless() -> FakeBorderless:
    """The fake Borderless (``tests/fixtures/borderless/fake_oidc.py``),
    one per test, served in-process through its httpx transport."""
    return FakeBorderless(BORDERLESS_CONFIG, BORDERLESS_ISSUER)


@pytest.fixture
def oidc_client(fake_borderless: FakeBorderless) -> BorderlessOidcClient:
    return BorderlessOidcClient(
        httpx.AsyncClient(transport=fake_borderless.transport())
    )


@pytest.fixture
def access_store() -> MemoryAccessStore:
    return MemoryAccessStore()


@pytest.fixture
def github_oauth() -> FakeGitHubOAuthService:
    return FakeGitHubOAuthService()


@pytest.fixture(autouse=True)
def _fake_external_services(oidc_client, access_store, github_oauth):
    """Every app the tests drive talks to the fakes, never to Borderless or
    GitHub. The access-token store is in memory until a test brings a real
    Redis (``redis_client`` removes this override)."""
    main_app.dependency_overrides[get_borderless_oidc_client] = lambda: (
        oidc_client
    )
    main_app.dependency_overrides[get_borderless_access_store] = lambda: (
        access_store
    )
    main_app.dependency_overrides[get_github_oauth_service] = lambda: (
        github_oauth
    )
    yield
    main_app.dependency_overrides.pop(get_borderless_oidc_client, None)
    main_app.dependency_overrides.pop(get_borderless_access_store, None)
    main_app.dependency_overrides.pop(get_github_oauth_service, None)


_MEMBERSHIPS = {
    BadgeKey.BORDERLESS_BASE: 'BASE',
    BadgeKey.BORDERLESS_PSP: 'PSP',
}


async def bind_borderless(
    session,
    user_id: int,
    *,
    badge: BadgeKey | None = BadgeKey.BORDERLESS_PSP,
    status: str = 'active',
    borderless_id: str | None = None,
    token: str | None = None,
    fake: FakeBorderless | None = None,
    email: str | None = None,
) -> BorderlessAccountModel:
    """A Borderless binding (and a live badge) for ``user_id``, holding an
    encrypted refresh token. With ``fake``, the account and that token
    exist on the fake Borderless too (its membership = ``badge``), so a
    membership refresh works; ``token=''`` stores no refresh token."""
    sub = borderless_id or f'bl-{user_id}'
    email = email or f'user{user_id}@borderless.test'
    if fake is not None:
        if sub not in fake.accounts:
            fake.add_account(
                sub,
                email,
                membership=_MEMBERSHIPS.get(badge) if badge else None,
                name=f'Borderless {user_id}',
            )
        if token != '':
            token = fake.issue_refresh_token(sub, token)
    refresh = token if token is not None else f'refresh-{sub}'
    binding = BorderlessAccountModel(
        user_id=user_id,
        borderless_user_id=sub,
        email=email,
        encrypted_refresh_token=(
            encrypt_borderless_token(refresh) if refresh else None
        ),
        status=status,
        profile_read_at=datetime.now(timezone.utc),
    )
    session.add(binding)
    if badge is not None:
        session.add(
            UserBadgeModel(
                user_id=user_id, badge=badge.value, source='borderless'
            )
        )
    await session.commit()
    return binding


class FakeJobQueue:
    """The ``JobQueue`` the API sees in tests (ADR-0016): records
    every call instead of reaching taskiq. ``fail`` makes every call raise,
    ``running`` is what ``ingest_running`` answers."""

    def __init__(self) -> None:
        self.ingests = 0
        self.recomputes: list[int] = []
        self.running = False
        self.fail: Exception | None = None

    def _maybe_fail(self) -> None:
        if self.fail is not None:
            raise self.fail

    async def enqueue_ingest(self) -> None:
        self._maybe_fail()
        self.ingests += 1

    async def enqueue_recompute_fit(self, base_cv_id: int) -> None:
        self._maybe_fail()
        self.recomputes.append(base_cv_id)

    async def ingest_running(self) -> bool:
        self._maybe_fail()
        return self.running


@pytest.fixture
def job_queue() -> FakeJobQueue:
    return FakeJobQueue()


@pytest_asyncio.fixture(scope='session')
async def db_container():
    container = PostgresContainer('postgres:14', driver='asyncpg')
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture
async def async_engine(db_container: PostgresContainer):
    db_url = db_container.get_connection_url().replace(
        'postgresql://', 'postgresql+asyncpg://'
    )
    async_engine = create_async_engine(db_url, echo=False)

    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield async_engine
    await async_engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine: AsyncEngine):
    SessionLocal = async_sessionmaker(
        bind=async_engine,
        expire_on_commit=False,
    )

    async with SessionLocal() as session:
        session.add_all(base_data().values())
        await session.commit()
        yield session


@pytest_asyncio.fixture
async def jobs_beta(db_session) -> int:
    """ADR-0018: the ``jobs`` feature row as revision
    ``641001baff09`` seeds it (``create_all`` has no seed rows), with the
    ``async_client`` user on its beta list. ``admin_client`` has ``jobs``
    as an admin once the row exists. Returns the feature id."""
    feature_id = await seed_jobs_feature(db_session)
    await enrol(db_session, base_data()['user'].id, feature_id)
    return feature_id


@pytest_asyncio.fixture
async def reports_badge(
    db_session, fake_borderless, access_store
) -> BorderlessAccountModel:
    """ADR-0026: reports are for BASE and PSP members. The ``async_client``
    user gets an active binding whose refresh token the fake Borderless
    knows (PSP), a live ``borderless_psp`` badge and a live access token in
    the store, so the gate calls nobody."""
    user_id = base_data()['user'].id
    binding = await bind_borderless(db_session, user_id, fake=fake_borderless)
    await access_store.put(user_id, 'access-token', 3600)
    return binding


@pytest_asyncio.fixture
async def cvs_beta(db_session) -> int:
    """ADR-0021: the ``cvs`` feature row as revision ``f28e3d9705dd`` seeds
    it (``create_all`` has no seed rows), with the ``async_client`` user on
    its beta list. ``admin_client`` has ``cvs`` as an admin once the row
    exists. Returns the feature id."""
    feature_id = await seed_cvs_feature(db_session)
    await enrol(db_session, base_data()['user'].id, feature_id)
    return feature_id


@pytest_asyncio.fixture
async def async_client(async_engine: AsyncEngine, job_queue: FakeJobQueue):
    SessionLocal = async_sessionmaker(
        bind=async_engine,
        expire_on_commit=False,
    )

    async def override_get_session():
        async with SessionLocal() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session
    main_app.dependency_overrides[get_job_queue] = lambda: job_queue

    async def override_get_current_user():
        from app.application.dto.user import UserDTO

        return UserDTO(
            id=base_data()['user'].id,
            username=base_data()['user'].username,
            email=base_data()['user'].email,
            created_at=datetime.now(timezone.utc),
        )

    main_app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=main_app)
    async with AsyncClient(
        transport=transport, base_url='http://test/api'
    ) as client:
        yield client

    main_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def admin_client(async_engine: AsyncEngine, job_queue: FakeJobQueue):
    SessionLocal = async_sessionmaker(
        bind=async_engine,
        expire_on_commit=False,
    )

    async def override_get_session():
        async with SessionLocal() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session
    main_app.dependency_overrides[get_job_queue] = lambda: job_queue

    async def override_get_current_user():
        from app.application.dto.user import UserDTO

        return UserDTO(
            id=base_data()['admin_user'].id,
            username=base_data()['admin_user'].username,
            email=base_data()['admin_user'].email,
            is_admin=True,
            created_at=datetime.now(timezone.utc),
        )

    main_app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=main_app)
    async with AsyncClient(
        transport=transport, base_url='http://test/api'
    ) as client:
        yield client

    main_app.dependency_overrides.clear()
