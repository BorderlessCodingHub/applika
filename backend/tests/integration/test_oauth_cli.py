from datetime import datetime, timezone
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
import pytest_asyncio
import redis.asyncio as redis
from cryptography.fernet import Fernet
from fastapi.responses import RedirectResponse
from httpx import ASGITransport, AsyncClient
from testcontainers.redis import RedisContainer

from app.application.dto.user import UserCreateDTO
from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.config.redis import get_redis
from app.config.settings import envs
from app.main import app as main_app
from app.presentation.api import oauth as oauth_api
from app.presentation.api.auth_handoff import CLI_LOGIN_COOKIE_NAME
from app.presentation.dependencies import (
    get_github_service,
    get_user_repository,
)


class FakeUserModel:
    def __init__(
        self,
        *,
        id: int,
        github_id: int,
        username: str,
        email: str,
        created_at: datetime,
    ):
        self.id = id
        self.github_id = github_id
        self.username = username
        self.email = email
        self.created_at = created_at
        self.updated_at = created_at
        self.first_name = None
        self.last_name = None
        self.current_company = None
        self.current_salary = None
        self.tech_stack = None
        self.experience_years = 0
        self.current_role = None
        self.salary_currency = None
        self.salary_period = None
        self.seniority_level = None
        self.location = None
        self.availability = None
        self.bio = None
        self.linkedin_url = None
        self.is_org_member = False
        self.is_admin = False
        self.encrypted_github_token = None


class FakeUserRepository:
    def __init__(self):
        self.users: dict[int, FakeUserModel] = {}
        self.next_id = 1

    async def get_by_github_id(self, github_id: int):
        return self.users.get(github_id)

    async def create(self, user: UserCreateDTO):
        now = datetime.now(timezone.utc)
        created = FakeUserModel(
            id=self.next_id,
            github_id=user.github_id,
            username=user.username,
            email=str(user.email),
            created_at=now,
        )
        self.next_id += 1
        self.users[user.github_id] = created
        return created

    async def update(self, user: FakeUserModel):
        user.updated_at = datetime.now(timezone.utc)
        self.users[user.github_id] = user
        return user


class FakeGithubService:
    def __init__(self):
        self.invalidated_user_ids: list[int] = []

    async def check_org_membership(self, github_token: str) -> bool:
        return True

    async def invalidate_cache(self, user_id: int) -> None:
        self.invalidated_user_ids.append(user_id)


class FakeGithubSSO:
    def __init__(self):
        self.oauth_client = SimpleNamespace(
            token={'access_token': 'github-token'}
        )

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def get_login_redirect(self):
        return RedirectResponse('https://github.example/login')

    async def verify_and_process(self, request):
        return SimpleNamespace(
            id='123',
            display_name='cli-user',
            email='cli@example.com',
        )


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
    client = redis.from_url(
        redis_url,
        decode_responses=True,
    )
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


@pytest.fixture
def fake_user_repo():
    instance = FakeUserRepository()

    def override_get_user_repository():
        return instance

    main_app.dependency_overrides[get_user_repository] = (
        override_get_user_repository
    )
    yield instance
    main_app.dependency_overrides.pop(get_user_repository, None)


@pytest.fixture
def fake_github_service():
    instance = FakeGithubService()

    async def override_get_github_service():
        return instance

    main_app.dependency_overrides[get_github_service] = (
        override_get_github_service
    )
    yield instance
    main_app.dependency_overrides.pop(get_github_service, None)


@pytest.fixture
def fake_github_sso(monkeypatch):
    fake = FakeGithubSSO()
    monkeypatch.setattr(oauth_api, 'github_sso', fake)
    return fake


@pytest.fixture(autouse=True)
def valid_fernet_key(monkeypatch):
    monkeypatch.setattr(
        envs,
        'GITHUB_TOKEN_ENCRYPTION_KEY',
        Fernet.generate_key().decode(),
    )


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

    stored = await auth_handoff_state_use_case.get_login(
        data['login_id']
    )
    assert stored == {
        'login_id': data['login_id'],
        'callback_url': 'http://127.0.0.1:43129/callback',
        'state': 'abc',
    }


@pytest.mark.asyncio
async def test_cli_login_sets_marker_cookie(
    local_async_client,
    redis_client,
    fake_github_sso,
):
    start = await local_async_client.post(
        '/auth/cli/start',
        json={
            'callback_url': 'http://127.0.0.1:43129/callback',
            'state': 'abc',
        },
    )
    login_id = start.json()['login_id']

    response = await local_async_client.get(f'/auth/cli/login/{login_id}')

    assert response.status_code in {302, 307}
    assert response.headers['location'] == 'https://github.example/login'
    assert CLI_LOGIN_COOKIE_NAME in response.headers.get('set-cookie', '')


@pytest.mark.asyncio
async def test_github_callback_keeps_web_behavior(
    local_async_client,
    redis_client,
    fake_user_repo,
    fake_github_service,
    fake_github_sso,
):
    response = await local_async_client.get('/auth/github/callback')

    assert response.status_code in {302, 307}
    assert response.headers['location'] == envs.LOGIN_REDIRECT_URI
    cookies = response.headers.get_list('set-cookie')
    assert any('__access=' in cookie for cookie in cookies)
    assert any('__refresh=' in cookie for cookie in cookies)
    assert fake_github_service.invalidated_user_ids == [1]


@pytest.mark.asyncio
async def test_github_callback_redirects_to_cli_and_exchange_works(
    local_async_client,
    redis_client,
    fake_user_repo,
    fake_github_service,
    fake_github_sso,
):
    start = await local_async_client.post(
        '/auth/cli/start',
        json={
            'callback_url': 'http://127.0.0.1:43129/callback',
            'state': 'xyz',
        },
    )
    login_id = start.json()['login_id']
    local_async_client.cookies.set(CLI_LOGIN_COOKIE_NAME, login_id)

    callback_response = await local_async_client.get('/auth/github/callback')
    assert callback_response.status_code in {302, 307}

    location = callback_response.headers['location']
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert parsed.scheme == 'http'
    assert parsed.netloc == '127.0.0.1:43129'
    assert params['state'] == ['xyz']
    assert 'code' in params
    assert fake_github_service.invalidated_user_ids == [1]

    exchange_response = await local_async_client.post(
        '/auth/cli/exchange',
        json={'code': params['code'][0]},
    )
    assert exchange_response.status_code == 200
    exchange_data = exchange_response.json()
    assert exchange_data['access_token']
    assert exchange_data['refresh_token']
    assert exchange_data['access_expires_in'] > 0
    assert exchange_data['refresh_expires_in'] > 0

    reuse_response = await local_async_client.post(
        '/auth/cli/exchange',
        json={'code': params['code'][0]},
    )
    assert reuse_response.status_code == 401
