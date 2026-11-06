import uuid

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs
from app.core.tokens import decode_token
from app.domain.models import UserSessionModel
from app.main import app as main_app
from tests.base_db_setup import base_data

USER = base_data()['user']
# What httpx sends: the agent of installed CLIs 0.1.4 to 1.0.1.
HTTPX_UA = 'python-httpx/0.28.1'


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
    assert data['login_url'].endswith(f'/auth/cli/login/{data["login_id"]}')

    stored = await auth_handoff_state_use_case.get_login(data['login_id'])
    assert stored == {
        'login_id': data['login_id'],
        'callback_url': 'http://127.0.0.1:43129/callback',
        'state': 'abc',
    }


@pytest.mark.asyncio
async def test_cli_exchange_redeems_code_once(
    real_client,
    async_engine,
    auth_handoff_state_use_case,
):
    """Same JSON shape as before KODI-057 (cli-compatibility.md 1); the
    values are now a JWT with ``sid`` and a uuid7, and the code is one
    use."""
    login_id = await auth_handoff_state_use_case.create_login(
        callback_url='http://127.0.0.1:43129/callback',
        state='xyz',
    )
    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=login_id,
        user_id=USER.id,
    )

    exchange_response = await real_client.post(
        '/auth/cli/exchange',
        json={'code': code},
        headers={'User-Agent': HTTPX_UA},
    )

    assert exchange_response.status_code == 200
    exchange_data = exchange_response.json()
    assert set(exchange_data) == {
        'access_token',
        'refresh_token',
        'access_expires_in',
        'refresh_expires_in',
    }
    assert exchange_data['access_token']
    assert exchange_data['refresh_token']
    assert exchange_data['access_expires_in'] > 0
    assert exchange_data['refresh_expires_in'] == 7 * 86400
    assert uuid.UUID(exchange_data['refresh_token']).version == 7
    assert await auth_handoff_state_use_case.get_login(login_id) is None

    reuse_response = await real_client.post(
        '/auth/cli/exchange',
        json={'code': code},
    )
    assert reuse_response.status_code == 401


@pytest.mark.asyncio
async def test_cli_exchange_opens_a_cli_legacy_session(
    real_client,
    async_engine,
    auth_handoff_state_use_case,
):
    """AC23: an installed CLI (0.1.4 to 1.0.1) appears in the device list as
    a session of its own, named from httpx's agent."""
    login_id = await auth_handoff_state_use_case.create_login(
        callback_url='http://127.0.0.1:43129/callback', state='xyz'
    )
    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=login_id, user_id=USER.id
    )

    data = (
        await real_client.post(
            '/auth/cli/exchange',
            json={'code': code},
            headers={'User-Agent': HTTPX_UA},
        )
    ).json()

    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        [row] = (
            await session.scalars(
                select(UserSessionModel).where(
                    UserSessionModel.user_id == USER.id
                )
            )
        ).all()
    assert (row.client_type, row.sign_in_method) == ('cli', 'cli_legacy')
    assert row.device_name == 'applika-cli (older version)'
    assert decode_token(data['access_token']).get('sid') == str(row.id)

    listed = await real_client.get(
        '/users/me/sessions',
        cookies={ACCESS_COOKIE_NAME: data['access_token']},
    )
    [item] = listed.json()
    assert item['sign_in_method'] == 'cli_legacy'
    assert item['current'] is True


@pytest.mark.asyncio
async def test_installed_cli_refreshes_and_logs_out_through_cookies(
    real_client,
    async_engine,
    auth_handoff_state_use_case,
    bound_user,
):
    """CLIs 0.1.4 to 1.0.1 replay the exchanged values as cookies:
    ``GET /users/me`` with ``__access``, ``GET /auth/refresh`` with
    ``__refresh`` (200 ``{"detail": "Token refreshed"}`` + both cookies
    re-set), ``GET /auth/logout``."""
    login_id = await auth_handoff_state_use_case.create_login(
        callback_url='http://127.0.0.1:43129/callback', state='xyz'
    )
    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=login_id, user_id=USER.id
    )
    data = (
        await real_client.post('/auth/cli/exchange', json={'code': code})
    ).json()
    cookies = {
        ACCESS_COOKIE_NAME: data['access_token'],
        REFRESH_COOKIE_NAME: data['refresh_token'],
    }

    me = await real_client.get('/users/me', cookies=cookies)
    assert me.status_code == 200

    refreshed = await real_client.get('/auth/refresh', cookies=cookies)
    assert refreshed.status_code == 200
    assert refreshed.json() == {'detail': 'Token refreshed'}
    assert refreshed.cookies.get(ACCESS_COOKIE_NAME)
    assert refreshed.cookies.get(REFRESH_COOKIE_NAME) == data['refresh_token']

    logged_out = await real_client.get('/auth/logout', cookies=cookies)
    assert logged_out.status_code == 200
    assert logged_out.json() == {'detail': 'Logged out'}
    after = await real_client.get('/users/me', cookies=cookies)
    assert after.status_code == 401
    assert after.json() == {'detail': 'Session expired', 'code': 'AUTH-1002'}


@pytest.mark.asyncio
async def test_legacy_cli_routes_are_deprecated_in_openapi(
    local_async_client,
):
    """cli-compatibility.md 2 / ADR-0009: kept, marked deprecated."""
    spec = (await local_async_client.get('/openapi.json')).json()
    paths = spec['paths']
    assert paths['/auth/cli/start']['post']['deprecated'] is True
    assert paths['/auth/cli/login/{login_id}']['get']['deprecated'] is True
    assert paths['/auth/cli/exchange']['post']['deprecated'] is True
    # The cookie routes every client uses are not deprecated.
    assert 'deprecated' not in paths['/auth/refresh']['get']
    assert 'deprecated' not in paths['/auth/logout']['get']
    # The new routes are documented and not deprecated.
    for path, method in (
        ('/auth/cli/authorize', 'get'),
        ('/auth/token', 'post'),
        ('/auth/revoke', 'post'),
        ('/auth/device/code', 'post'),
        ('/auth/device/verify', 'get'),
        ('/auth/device/approve', 'post'),
        ('/auth/device/deny', 'post'),
        ('/users/me/sessions', 'get'),
        ('/users/me/sessions/{session_id}', 'delete'),
        ('/users/me/sessions/revoke-others', 'post'),
    ):
        assert 'deprecated' not in paths[path][method], path


# --- Organisation membership retired (K8, T135) ---


@pytest.mark.asyncio
async def test_cli_login_redirect_lands_on_the_borderless_signin_page(
    local_async_client,
    auth_handoff_state_use_case,
):
    """``GET /auth/cli/login/{id}`` (CLIs 0.1.4 to 1.0.1) now 307s to
    applika's Borderless sign-in page with the CLI marker (ADR-0024)."""
    start_response = await local_async_client.post(
        '/auth/cli/start',
        json={
            'callback_url': 'http://127.0.0.1:43129/callback',
            'state': 'abc',
        },
    )
    assert start_response.status_code == 201
    login_id = start_response.json()['login_id']

    login_response = await local_async_client.get(
        f'/auth/cli/login/{login_id}',
        follow_redirects=False,
    )

    assert login_response.status_code == 307
    assert login_response.headers['location'] == f'{envs.WEB_SIGNIN_URI}?cli=1'
    assert login_response.cookies.get('__cli_login') == login_id
