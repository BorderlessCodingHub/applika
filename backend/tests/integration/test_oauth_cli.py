from urllib.parse import parse_qs, urlparse

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app as main_app


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


# --- Organisation membership retired (K8, T135) ---


@pytest.mark.asyncio
async def test_cli_login_redirect_asks_user_email_scope_only(
    local_async_client,
    auth_handoff_state_use_case,
):
    """The CLI login redirect (`GET /auth/cli/login/{id}`, which reuses the
    same ``github_sso`` instance as `/auth/github/login`) still reaches
    GitHub, now asking for `user:email` only - no `read:org` (R-042/R-043).
    That there is no `/user/orgs` call anywhere in the codebase is a
    separate, static check: `.claude/rules` T135's
    `grep -rn check_org_membership applika/backend/app`."""
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

    assert login_response.status_code in {302, 303, 307}
    location = login_response.headers['location']
    parsed = urlparse(location)
    assert parsed.hostname == 'github.com'
    params = parse_qs(parsed.query)
    assert params['scope'] == ['user:email']
