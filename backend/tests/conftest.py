import logging
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

from app.config.db import get_session
from app.config.settings import envs
from app.domain.models import Base
from app.main import app as main_app
from app.presentation.dependencies import get_current_user, get_job_queue
from tests.base_db_setup import base_data
from tests.features_seed import enrol, seed_jobs_feature


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

        # KODI-024: discord_id is no longer a field on UserDTO/UserModel -
        # the Discord connection lives in its own table and routes read it
        # through DiscordConnectionRepositoryDp, not through the current
        # user override.
        return UserDTO(
            id=base_data()['user'].id,
            github_id=base_data()['user'].github_id,
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
            github_id=base_data()['admin_user'].github_id,
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
