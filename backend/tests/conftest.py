import logging
from datetime import UTC, datetime, timedelta, timezone

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

from app.application.services.borderless_client import (
    BorderlessAccessRefused,
    BorderlessInvalidCredentials,
    BorderlessNotConfigured,
    BorderlessSignIn,
    parse_membership,
)
from app.application.services.github_service import (
    GitHubGrant,
    GitHubIdentity,
    GitHubOAuthError,
)
from app.config.db import get_session
from app.config.settings import envs
from app.core.crypto import encrypt_borderless_token
from app.core.enums import BadgeKey
from app.domain.models import Base, BorderlessAccountModel, UserBadgeModel
from app.main import app as main_app
from app.presentation.dependencies import (
    get_borderless_client,
    get_current_user,
    get_github_oauth_service,
    get_job_queue,
)
from tests.base_db_setup import base_data
from tests.features_seed import enrol, seed_cvs_feature, seed_jobs_feature


@pytest.fixture(autouse=True, scope='session')
def _rate_limit_disabled():
    """The limiter is OFF by default in every test (KODI-039, T032): tests
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
    """A throwaway Fernet key and a fake Borderless URL for every test:
    nobody calls the real Borderless (the client is faked below)."""
    previous = (envs.BORDERLESS_API_URL, envs.BORDERLESS_TOKEN_ENCRYPTION_KEY)
    envs.BORDERLESS_API_URL = 'http://borderless.test'
    envs.BORDERLESS_TOKEN_ENCRYPTION_KEY = Fernet.generate_key().decode()
    yield
    envs.BORDERLESS_API_URL, envs.BORDERLESS_TOKEN_ENCRYPTION_KEY = previous


class FakeBorderlessClient:
    """``BorderlessClient`` without Borderless. ``add`` registers an
    account; its token answers ``read_membership`` with its membership.
    ``sign_in_error`` / ``read_error`` make the next calls raise."""

    def __init__(self) -> None:
        self.configured = True
        self.accounts: dict[str, dict] = {}
        self.sign_in_error: Exception | None = None
        self.read_error: Exception | None = None
        self.sign_in_calls: list[str] = []
        self.read_calls: list[str] = []

    def add(
        self,
        *,
        id: str,
        email: str,
        password: str = 'correct-horse',
        verified: bool = True,
        membership: str | None = 'PSP',
        name: str | None = 'Borderless User',
        username: str | None = 'borderless-user',
        token: str | None = None,
        expires_in: int = 604800,
    ) -> dict:
        account = {
            'id': id,
            'email': email,
            'password': password,
            'verified': verified,
            'membership': membership,
            'name': name,
            'username': username,
            'token': token or f'token-{id}',
            'expires_in': expires_in,
        }
        self.accounts[email.lower()] = account
        return account

    def is_configured(self) -> bool:
        return self.configured

    async def sign_in(self, email: str, password: str) -> BorderlessSignIn:
        self.sign_in_calls.append(email)
        if not self.configured:
            raise BorderlessNotConfigured('not configured')
        if self.sign_in_error is not None:
            raise self.sign_in_error
        account = self.accounts.get(email.lower())
        if account is None or account['password'] != password:
            raise BorderlessInvalidCredentials('invalid')
        return BorderlessSignIn(
            user_id=account['id'],
            email=account['email'],
            email_verified=account['verified'],
            name=account['name'],
            username=account['username'],
            access_token=account['token'],
            expires_in=account['expires_in'],
        )

    async def read_membership(
        self, access_token: str, timeout: float | None = None
    ) -> BadgeKey | None:
        self.read_calls.append(access_token)
        if self.read_error is not None:
            raise self.read_error
        for account in self.accounts.values():
            if account['token'] == access_token:
                return parse_membership({
                    'data': {'user': {'membership': account['membership']}}
                })
        raise BorderlessAccessRefused('refused')


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
def borderless() -> FakeBorderlessClient:
    return FakeBorderlessClient()


@pytest.fixture
def github_oauth() -> FakeGitHubOAuthService:
    return FakeGitHubOAuthService()


@pytest.fixture(autouse=True)
def _fake_external_services(borderless, github_oauth):
    """Every app the tests drive talks to the fakes, never to Borderless or
    GitHub."""
    main_app.dependency_overrides[get_borderless_client] = lambda: borderless
    main_app.dependency_overrides[get_github_oauth_service] = lambda: (
        github_oauth
    )
    yield
    main_app.dependency_overrides.pop(get_borderless_client, None)
    main_app.dependency_overrides.pop(get_github_oauth_service, None)


async def bind_borderless(
    session,
    user_id: int,
    *,
    badge: BadgeKey | None = BadgeKey.BORDERLESS_PSP,
    status: str = 'active',
    expires_in: timedelta = timedelta(days=7),
    borderless_id: str | None = None,
    token: str | None = None,
) -> BorderlessAccountModel:
    """A Borderless binding (and a live badge) for ``user_id``."""
    binding = BorderlessAccountModel(
        user_id=user_id,
        borderless_user_id=borderless_id or f'bl-{user_id}',
        email=f'user{user_id}@borderless.test',
        encrypted_access_token=encrypt_borderless_token(
            token or f'token-bl-{user_id}'
        ),
        access_token_expires_at=datetime.now(UTC) + expires_in,
        status=status,
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
    """The ``JobQueue`` the API sees in tests (KODI-046, ADR-0016): records
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
    """KODI-052, ADR-0018: the ``jobs`` feature row as revision
    ``641001baff09`` seeds it (``create_all`` has no seed rows), with the
    ``async_client`` user on its beta list. ``admin_client`` has ``jobs``
    as an admin once the row exists. Returns the feature id."""
    feature_id = await seed_jobs_feature(db_session)
    await enrol(db_session, base_data()['user'].id, feature_id)
    return feature_id


@pytest_asyncio.fixture
async def reports_badge(db_session) -> BorderlessAccountModel:
    """ADR-0024: reports are for BASE and PSP members. The ``async_client``
    user gets an active binding expiring in 7 days and a live
    ``borderless_psp`` badge."""
    return await bind_borderless(db_session, base_data()['user'].id)


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
