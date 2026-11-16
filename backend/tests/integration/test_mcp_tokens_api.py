"""``POST /users/me/mcp-tokens`` (ADR-0028): a signed-in web user creates
a scoped MCP token for their own account and sees it once; it is listed and
revoked with the other devices.

Real Postgres and Redis, the REAL ``get_current_user`` (``real_client``),
web sessions opened through ``OpenSessionUseCase``. No feature row exists:
the route is ungated (ADR-0028). Tokens are minted at run time and never
written to a file.
"""

import re
from datetime import UTC, datetime, timedelta

import pytest
import redis.asyncio as redis
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from testcontainers.redis import RedisContainer

from app.application.services.session_store import (
    SessionStore,
    id_key,
    mcp_key,
    mcp_token_hash,
)
from app.application.use_cases.mcp_tokens.create_token import (
    CreateMcpTokenUseCase,
)
from app.config.settings import ACCESS_COOKIE_NAME
from app.domain.models import FeatureModel, UserSessionModel
from app.domain.repositories.user_session_repository import (
    UserSessionRepository,
)
from app.main import app as main_app
from app.presentation.dependencies import get_create_mcp_token_use_case
from tests.base_db_setup import base_data
from tests.integration.conftest import SECOND_USER_ID
from tests.sessions_seed import open_mcp_token, open_session

USER = base_data()['user']
ADMIN = base_data()['admin_user']
TOKEN_SHAPE = re.compile(r'applika_mcp_[A-Za-z0-9_-]{43}')
ROUTE = '/users/me/mcp-tokens'


@pytest.fixture(scope='module')
def redis_container():
    """One Redis for the module: ``redis_client`` flushes it per test."""
    container = RedisContainer('redis:7.2-alpine')
    container.start()
    yield container
    container.stop()


def _cookie(token: str) -> dict[str, str]:
    """The ``__access`` cookie, the only REST credential (ADR-0028)."""
    return {ACCESS_COOKIE_NAME: token}


async def _web(async_engine, redis_client, user_id: int = USER.id) -> str:
    tokens = await open_session(async_engine, redis_client, user_id)
    return tokens.access_token


async def _rows(async_engine: AsyncEngine) -> list[UserSessionModel]:
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        result = await session.scalars(
            select(UserSessionModel).where(
                UserSessionModel.client_type == 'mcp'
            )
        )
        return list(result.all())


async def test_create_answers_the_token_once_with_no_store(
    real_client: AsyncClient, async_engine, redis_client
):
    access = await _web(async_engine, redis_client)
    response = await real_client.post(
        ROUTE,
        json={'name': 'Claude Code', 'scope': ['read', 'write']},
        cookies=_cookie(access),
    )

    assert response.status_code == 201
    assert response.headers['cache-control'] == 'no-store'
    body = response.json()
    assert set(body) == {
        'id',
        'name',
        'scope',
        'token',
        'created_at',
        'expires_at',
    }
    assert isinstance(body['id'], str)
    assert body['name'] == 'Claude Code'
    assert body['scope'] == ['read', 'write']
    token = body['token']
    assert TOKEN_SHAPE.fullmatch(token)
    expires_at = datetime.fromisoformat(body['expires_at'])
    expected = datetime.now(UTC) + timedelta(days=90)
    assert abs((expires_at - expected).total_seconds()) < 60

    [row] = await _rows(async_engine)
    assert str(row.id) == body['id']
    assert (row.client_type, row.sign_in_method) == ('mcp', 'mcp_token')
    assert row.device_name == 'Claude Code'
    assert row.scope == 'read write'
    assert row.user_agent is None
    assert row.ended_at is None
    # Only the sha256 is in Redis; neither the token nor its hash in
    # Postgres.
    digest = mcp_token_hash(token)
    assert await redis_client.get(mcp_key(digest)) == body['id']
    live = await redis_client.hgetall(id_key(row.id))
    assert live['rk'] == ''
    assert live['mk'] == digest
    assert live['scope'] == 'read write'
    assert live['user_id'] == str(USER.id)
    assert token not in repr(vars(row))
    assert digest not in repr(vars(row))
    assert not await redis_client.keys(f'*{token}*')


async def test_the_three_scope_sets(
    real_client: AsyncClient, async_engine, redis_client
):
    access = await _web(async_engine, redis_client)
    for scope, expected in (
        (['read'], ['read']),
        (['read', 'write'], ['read', 'write']),
        (['delete', 'write', 'read'], ['read', 'write', 'delete']),
    ):
        response = await real_client.post(
            ROUTE, json={'name': 'x', 'scope': scope}, cookies=_cookie(access)
        )
        assert response.status_code == 201, response.text
        assert response.json()['scope'] == expected


@pytest.mark.parametrize(
    ('name', 'stored'),
    [
        ('  Cursor at work  ', 'Cursor at work'),
        ('   ', 'MCP connection'),
        (None, 'MCP connection'),
        ('x' * 100, 'x' * 100),
    ],
)
async def test_the_name_is_trimmed_and_defaulted(
    real_client: AsyncClient, async_engine, redis_client, name, stored
):
    access = await _web(async_engine, redis_client)
    body: dict = {'scope': ['read']}
    if name is not None:
        body['name'] = name
    response = await real_client.post(ROUTE, json=body, cookies=_cookie(access))
    assert response.status_code == 201, response.text
    assert response.json()['name'] == stored


@pytest.mark.parametrize(
    'body',
    [
        {'name': 'x' * 101, 'scope': ['read']},
        {'name': 'x', 'scope': []},
        {'name': 'x', 'scope': ['read', 'admin']},
        {'name': 'x', 'scope': ['write']},
        {'name': 'x', 'scope': ['write', 'delete']},
        {'name': 'x'},
        {'name': 'x', 'scope': ['read'], 'token': 'mine'},
    ],
)
async def test_a_bad_body_is_422_gen_1003_and_writes_nothing(
    real_client: AsyncClient, async_engine, redis_client, body
):
    access = await _web(async_engine, redis_client)
    response = await real_client.post(ROUTE, json=body, cookies=_cookie(access))
    assert response.status_code == 422
    assert response.json()['code'] == 'GEN-1003'
    assert await _rows(async_engine) == []


async def test_the_device_list_shows_the_scope_never_the_token(
    real_client: AsyncClient, async_engine, redis_client
):
    access = await _web(async_engine, redis_client)
    created = await real_client.post(
        ROUTE,
        json={'name': 'Claude Desktop', 'scope': ['read']},
        cookies=_cookie(access),
    )
    token = created.json()['token']
    listed = await real_client.get(
        '/users/me/sessions', cookies=_cookie(access)
    )
    assert listed.status_code == 200
    assert token not in listed.text
    assert mcp_token_hash(token) not in listed.text
    by_type = {item['client_type']: item for item in listed.json()}
    item = by_type['mcp']
    assert item['id'] == created.json()['id']
    assert item['scope'] == ['read']
    assert item['sign_in_method'] == 'mcp_token'
    assert item['device_name'] == 'Claude Desktop'
    assert item['status'] == 'active'
    assert item['created_ip'] is not None
    assert by_type['web']['scope'] is None


async def test_an_mcp_token_is_refused_on_every_rest_route(
    real_client: AsyncClient, async_engine, redis_client
):
    _, token = await open_mcp_token(async_engine, redis_client, USER.id)
    for method, path in (
        ('GET', '/users/me'),
        ('GET', '/applications'),
        ('GET', '/supports'),
        ('POST', ROUTE),
        ('GET', '/users/me/sessions'),
        ('DELETE', '/users/me/sessions/1'),
        ('POST', '/users/me/sessions/revoke-others'),
    ):
        body = {'name': 'x', 'scope': ['read']} if method == 'POST' else None
        # As a Bearer it is no REST credential at all (ADR-0028) ...
        response = await real_client.request(
            method,
            path,
            headers={'Authorization': f'Bearer {token}'},
            json=body,
        )
        assert response.status_code == 401, (method, path)
        assert response.json() == {
            'detail': 'Not authenticated',
            'code': 'AUTH-1001',
        }, (method, path)
        # ... and in the cookie it is no JWT.
        response = await real_client.request(
            method, path, cookies=_cookie(token), json=body
        )
        assert response.status_code == 401, (method, path)
        assert response.json() == {
            'detail': 'Invalid token',
            'code': 'AUTH-1012',
        }, (method, path)
    # It created nothing and revoked nothing.
    assert len(await _rows(async_engine)) == 1


async def test_creating_needs_a_session(real_client: AsyncClient):
    response = await real_client.post(
        ROUTE, json={'name': 'x', 'scope': ['read']}
    )
    assert response.status_code == 401
    assert response.json()['code'] == 'AUTH-1001'


async def test_revoking_another_users_connection_is_404_admins_too(
    real_client: AsyncClient, async_engine, redis_client, second_user
):
    theirs, _ = await open_mcp_token(async_engine, redis_client, SECOND_USER_ID)
    for user_id in (USER.id, ADMIN.id):
        access = await _web(async_engine, redis_client, user_id)
        response = await real_client.delete(
            f'/users/me/sessions/{theirs.id}', cookies=_cookie(access)
        )
        assert response.status_code == 404
        assert response.json() == {
            'detail': 'Session not found',
            'code': 'AUTH-1043',
        }
        listed = await real_client.get(
            '/users/me/sessions', cookies=_cookie(access)
        )
        assert str(theirs.id) not in listed.text
    [row] = await _rows(async_engine)
    assert row.ended_at is None


async def test_revoking_ends_the_connection_at_once(
    real_client: AsyncClient, async_engine, redis_client
):
    access = await _web(async_engine, redis_client)
    row, token = await open_mcp_token(async_engine, redis_client, USER.id)
    response = await real_client.delete(
        f'/users/me/sessions/{row.id}', cookies=_cookie(access)
    )
    assert response.status_code == 204
    assert not await redis_client.exists(mcp_key(mcp_token_hash(token)))
    assert not await redis_client.exists(id_key(row.id))
    # Nothing else in Redis went: the web session is still live.
    listed = await real_client.get(
        '/users/me/sessions', cookies=_cookie(access)
    )
    statuses = {item['client_type']: item['status'] for item in listed.json()}
    assert statuses == {'web': 'active', 'mcp': 'revoked'}


async def test_redis_down_is_503_and_leaves_no_row(
    real_client: AsyncClient, async_engine, redis_client
):
    """The session check passes on the real Redis; the token's keys cannot
    be written: 503 fail closed, and no connection is left listed."""
    access = await _web(async_engine, redis_client)
    down = redis.from_url(
        'redis://127.0.0.1:1/0',
        decode_responses=True,
        socket_connect_timeout=0.2,
    )
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def use_case_on_a_dead_redis():
        async with maker() as session:
            yield CreateMcpTokenUseCase(
                UserSessionRepository(session), SessionStore(down)
            )

    main_app.dependency_overrides[get_create_mcp_token_use_case] = (
        use_case_on_a_dead_redis
    )
    try:
        response = await real_client.post(
            ROUTE,
            json={'name': 'x', 'scope': ['read']},
            cookies=_cookie(access),
        )
    finally:
        main_app.dependency_overrides.pop(get_create_mcp_token_use_case, None)
        await down.aclose()
    assert response.status_code == 503
    assert response.json() == {
        'detail': 'Session service unavailable',
        'code': 'AUTH-1003',
    }
    assert response.headers['retry-after'] == '5'
    assert await _rows(async_engine) == []


async def test_no_feature_row_is_needed(
    real_client: AsyncClient, async_engine, redis_client
):
    """ADR-0028: the MCP is released to everyone, no beta gate."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        assert await session.scalar(select(func.count(FeatureModel.id))) == 0
    access = await _web(async_engine, redis_client)
    response = await real_client.post(
        ROUTE, json={'name': 'x', 'scope': ['read']}, cookies=_cookie(access)
    )
    assert response.status_code == 201
