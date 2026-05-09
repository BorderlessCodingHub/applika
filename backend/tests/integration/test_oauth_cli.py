import pytest
import pytest_asyncio
import redis.asyncio as redis
from httpx import ASGITransport, AsyncClient
from testcontainers.redis import RedisContainer

from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.config.redis import get_redis
from app.main import app as main_app


@pytest.fixture
def redis_container():
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


@pytest_asyncio.fixture
async def local_async_client():
    transport = ASGITransport(app=main_app)
    async with AsyncClient(
        transport=transport,
        base_url='http://test/api',
    ) as client:
        yield client
    main_app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cli_start_rejects_non_loopback(
    local_async_client,
    redis_client,
):
    response = await local_async_client.post(
        '/auth/cli/start',
        json={
            'callback_url': 'https://example.com/callback',
            'state': 'abc',
        },
    )

    assert response.status_code == 400
    assert response.json()['detail'] == 'CLI callback URL must use http'


@pytest.mark.asyncio
async def test_cli_start_stores_pending_login(
    local_async_client,
    auth_handoff_state_use_case,
):
    response = await local_async_client.post(
        '/auth/cli/start',
        json={
            'callback_url': 'http://127.0.0.1:43129/callback',
            'state': 'abc',
        },
    )

    assert response.status_code == 201
    data = response.json()
    assert data['login_url'].endswith(f"/auth/cli/login/{data['login_id']}")

    stored = await auth_handoff_state_use_case.get_login(data['login_id'])
    assert stored == {
        'login_id': data['login_id'],
        'callback_url': 'http://127.0.0.1:43129/callback',
        'state': 'abc',
    }


@pytest.mark.asyncio
async def test_cli_exchange_redeems_code_once(
    local_async_client,
    auth_handoff_state_use_case,
):
    login_id = await auth_handoff_state_use_case.create_login(
        callback_url='http://127.0.0.1:43129/callback',
        state='xyz',
    )
    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=login_id,
        user_id=1,
        github_id=123,
    )

    exchange_response = await local_async_client.post(
        '/auth/cli/exchange',
        json={'code': code},
    )

    assert exchange_response.status_code == 200
    exchange_data = exchange_response.json()
    assert exchange_data['access_token']
    assert exchange_data['refresh_token']
    assert exchange_data['access_expires_in'] > 0
    assert exchange_data['refresh_expires_in'] > 0
    assert await auth_handoff_state_use_case.get_login(login_id) is None

    reuse_response = await local_async_client.post(
        '/auth/cli/exchange',
        json={'code': code},
    )
    assert reuse_response.status_code == 401
