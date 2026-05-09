import pytest_asyncio
import redis.asyncio as redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from testcontainers.redis import RedisContainer

from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.config.redis import get_redis
from app.main import app as main_app


@pytest_asyncio.fixture(autouse=True)
async def reset_pk_sequences(db_session: AsyncSession):
    """Reset PostgreSQL PK sequences after base_data inserts explicit IDs.

    When fixtures seed rows with explicit IDs (e.g. CompanyModel(id=1)),
    the sequence is not advanced. The next auto-generated INSERT would try
    to reuse id=1 and hit a unique constraint violation. This fixture
    resets every sequence to MAX(id) of its table so auto-increments work.
    """
    tables = ['users', 'companies', 'platforms', 'feedbacks_definition',
              'steps_definition', 'applications', 'application_steps',
              'cycles', 'quinzenal_reports', 'user_feedbacks']
    for table in tables:
        await db_session.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 1), 1))"
        ))
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
