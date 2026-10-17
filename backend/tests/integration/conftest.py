from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import pytest_asyncio
import redis.asyncio as redis
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker
from testcontainers.redis import RedisContainer

from app.application.dto.user import UserDTO
from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.config.db import get_session
from app.config.redis import get_redis
from app.domain.models import UserModel
from app.main import app as main_app
from app.presentation.dependencies import (
    get_current_user,
    get_github_service,
)

SECOND_USER_ID = 3


@asynccontextmanager
async def as_user(user_id: int, username: str, is_admin: bool = False):
    """Temporarily swap ``get_current_user`` to answer as another seeded
    user - for tests that need a second user's point of view (visibility
    across users, ADR-0014) without a dedicated fixture per case."""

    async def override():
        return UserDTO(
            id=user_id,
            github_id=user_id,
            username=username,
            email=f'{username}@user.com',
            is_admin=is_admin,
            created_at=datetime.now(timezone.utc),
        )

    previous = main_app.dependency_overrides.get(get_current_user)
    main_app.dependency_overrides[get_current_user] = override
    try:
        yield
    finally:
        if previous is not None:
            main_app.dependency_overrides[get_current_user] = previous
        else:
            main_app.dependency_overrides.pop(get_current_user, None)


@pytest_asyncio.fixture
async def second_user(async_engine: AsyncEngine) -> UserModel:
    """A second seeded user, for visibility-across-users tests. Not part of
    ``base_data`` (most tests never need it), inserted only when a test asks
    for this fixture."""
    from sqlalchemy.ext.asyncio import async_sessionmaker

    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        user = UserModel(
            id=SECOND_USER_ID,
            github_id=SECOND_USER_ID,
            username='seconduser',
            email='second@user.com',
        )
        session.add(user)
        await session.commit()
    return user


@pytest_asyncio.fixture(autouse=True)
async def reset_pk_sequences(db_session: AsyncSession):
    """Reset PostgreSQL PK sequences after base_data inserts explicit IDs.

    When fixtures seed rows with explicit IDs (e.g. CompanyModel(id=1)),
    the sequence is not advanced. The next auto-generated INSERT would try
    to reuse id=1 and hit a unique constraint violation. This fixture
    resets every sequence to MAX(id) of its table so auto-increments work.
    """
    tables = [
        'users',
        'companies',
        'platforms',
        'feedbacks_definition',
        'steps_definition',
        'applications',
        'timeline_events',
        'cycles',
        'quinzenal_reports',
        'user_feedbacks',
        'base_cvs',
        'tailored_cvs',
        'discord_connections',
    ]
    for table in tables:
        await db_session.execute(
            text(
                f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
                f'GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 1), 1))'
            )
        )
    await db_session.commit()


@pytest_asyncio.fixture
async def redis_container():
    container = RedisContainer('redis:7.2-alpine')
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture
async def redis_client(redis_container):
    redis_url = (
        f'redis://{redis_container.get_container_host_ip()}:'
        f'{redis_container.get_exposed_port(6379)}/0'
    )
    client = redis.from_url(redis_url, decode_responses=True)
    await client.flushdb()

    async def override_get_redis():
        return client

    main_app.dependency_overrides[get_redis] = override_get_redis
    yield client
    await client.flushdb()
    await client.aclose()
    main_app.dependency_overrides.pop(get_redis, None)


@pytest_asyncio.fixture
async def auth_handoff_state_use_case(redis_client):
    return AuthHandoffStateUseCase(redis_client)


class FakeGitHubService:
    """The GitHub token check without GitHub (KODI-057): ``valid`` is what
    ``validate_token`` answers."""

    def __init__(self) -> None:
        self.valid = True
        self.validated: list[int] = []

    async def validate_token(self, user_id: int, github_token: str) -> bool:
        self.validated.append(user_id)
        return self.valid

    async def invalidate_cache(self, user_id: int) -> None:
        return None


@pytest_asyncio.fixture
async def github_service() -> AsyncIterator[FakeGitHubService]:
    service = FakeGitHubService()
    main_app.dependency_overrides[get_github_service] = lambda: service
    yield service
    main_app.dependency_overrides.pop(get_github_service, None)


@pytest_asyncio.fixture
async def real_client(async_engine: AsyncEngine, db_session, redis_client):
    """A client with the REAL ``get_current_user`` (KODI-057): every
    signed-in request goes through the session check on ``redis_client``.
    Sign in with ``tests/sessions_seed.py``."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with maker() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session
    main_app.dependency_overrides.pop(get_current_user, None)
    async with AsyncClient(
        transport=ASGITransport(app=main_app), base_url='http://test/api'
    ) as client:
        yield client
    main_app.dependency_overrides.pop(get_session, None)
