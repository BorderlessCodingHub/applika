"""Numbered error codes on the wire (ADR-0025, PRD 0019 R-011..R-016,
R-019, R-020, R-022), against the real app and the testcontainers Postgres.

Every error answer is ``{"detail": <unchanged>, "code": ...}`` (+ ``params``
only on a code whose message names a value), with the status and headers it
had before. Each body is checked against its ``docs/error-codes.md`` row.
"""

from datetime import date, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient, Response

from app.config.settings import envs
from app.main import app as main_app
from app.presentation.dependencies import get_current_user
from tests.base_db_setup import base_data
from tests.error_catalog import catalog
from tests.integration.test_admin_report_webhooks import VALID_URL
from tests.integration.test_tailored_cv_api import (
    application_payload,
    base_cv_payload,
)
from tests.sessions_seed import live_access_token


def assert_coded(response: Response, code: str, **params: object) -> dict:
    """The body is ``detail``, ``code`` and - only when given - ``params``,
    in that order; status, ``detail`` and params match the catalog row."""
    row = catalog()[code]
    body = response.json()
    assert body['code'] == code, body
    if row.status != 'other':
        assert response.status_code == int(row.status), body
    expected_keys = ['detail', 'code'] + (['params'] if row.params else [])
    assert [k for k in body if k != 'error'] == expected_keys, body
    if row.params:
        assert set(body['params']) == set(row.params), body
        for name, value in params.items():
            assert body['params'][name] == value, body
    if isinstance(body['detail'], str) and not row.detail.startswith('('):
        assert row.detail_pattern().match(body['detail']), body
    return body


# --------------------------------------------------------------------------
# GEN: the framework's own errors
# --------------------------------------------------------------------------


async def test_unknown_route_is_gen_1001(async_client: AsyncClient):
    response = await async_client.get('/no-such-route')
    assert response.status_code == 404
    assert response.json() == {'detail': 'Not Found', 'code': 'GEN-1001'}


async def test_wrong_method_is_gen_1002_and_keeps_allow(
    async_client: AsyncClient,
):
    response = await async_client.delete('/supports')
    assert response.status_code == 405
    assert response.json() == {
        'detail': 'Method Not Allowed',
        'code': 'GEN-1002',
    }
    assert 'GET' in response.headers['allow']


async def test_validation_422_is_gen_1003_with_the_field_list_unchanged(
    async_client: AsyncClient,
):
    response = await async_client.post('/applications', json={'role': 1})
    body = assert_coded(response, 'GEN-1003')
    assert isinstance(body['detail'], list)
    assert body['detail']
    first = body['detail'][0]
    assert {'type', 'loc', 'msg'} <= set(first)
    # The global handler keeps FastAPI's ``input`` echo (installed CLIs).
    assert all('input' in error for error in body['detail'])


async def test_unparsable_json_is_gen_1003(async_client: AsyncClient):
    response = await async_client.post(
        '/applications',
        content=b'{not json',
        headers={'Content-Type': 'application/json'},
    )
    body = assert_coded(response, 'GEN-1003')
    assert body['detail'][0]['type'] == 'json_invalid'


async def test_no_input_echo_422_is_gen_1003_without_input(
    async_client: AsyncClient,
):
    response = await async_client.post(
        '/auth/borderless/signin',
        json={'email': 'a@b.co', 'password': 'p' * 500},
    )
    body = assert_coded(response, 'GEN-1003')
    assert body['detail']
    assert all('input' not in error for error in body['detail'])
    assert 'p' * 500 not in response.text


async def test_rate_limit_429_is_gen_1004_with_seconds(
    async_client: AsyncClient, redis_client, monkeypatch
):
    monkeypatch.setattr(envs, 'RATE_LIMIT_ENABLED', True)
    monkeypatch.setattr(envs, 'RATE_LIMIT_DEFAULT', 1)
    assert (await async_client.get('/supports')).status_code == 200

    refused = await async_client.get('/supports')

    retry_after = int(refused.headers['Retry-After'])
    body = assert_coded(refused, 'GEN-1004', seconds=retry_after)
    assert body['detail'] == (
        f'Too many requests. Try again in {retry_after} seconds.'
    )
    assert refused.headers['X-RateLimit-Remaining'] == '0'


@pytest_asyncio.fixture
async def crashing_client(async_engine):
    """A route whose dependency blows up: Starlette's last-resort 500."""

    async def boom():
        raise RuntimeError('a secret the client must never see')

    main_app.dependency_overrides[get_current_user] = boom
    transport = ASGITransport(app=main_app, raise_app_exceptions=False)
    async with AsyncClient(
        transport=transport, base_url='http://test/api'
    ) as client:
        yield client
    main_app.dependency_overrides.clear()


async def test_unhandled_error_is_json_gen_1005(crashing_client: AsyncClient):
    response = await crashing_client.get('/users/me')
    assert response.status_code == 500
    assert response.headers['content-type'] == 'application/json'
    assert response.json() == {
        'detail': 'Internal Server Error',
        'code': 'GEN-1005',
    }
    assert 'secret' not in response.text


# --------------------------------------------------------------------------
# AUTH: the signed-in check, the session store, OAuth
# --------------------------------------------------------------------------


async def test_no_token_is_auth_1001(real_client: AsyncClient):
    response = await real_client.get('/users/me')
    assert response.status_code == 401
    assert response.json() == {
        'detail': 'Not authenticated',
        'code': 'AUTH-1001',
    }
    assert 'www-authenticate' not in response.headers


async def test_dead_session_is_auth_1002(
    real_client: AsyncClient, redis_client
):
    token = await live_access_token(redis_client, base_data()['user'].id)
    await redis_client.flushdb()

    response = await real_client.get(
        '/users/me', headers={'Authorization': f'Bearer {token}'}
    )
    assert response.status_code == 401
    assert response.json() == {'detail': 'Session expired', 'code': 'AUTH-1002'}


async def test_garbage_token_is_auth_1012(real_client: AsyncClient):
    response = await real_client.get(
        '/users/me', headers={'Authorization': 'Bearer not-a-jwt'}
    )
    assert_coded(response, 'AUTH-1012')


async def test_unsupported_grant_keeps_error_and_names_the_grant(
    async_client: AsyncClient,
):
    response = await async_client.post(
        '/auth/token', json={'grant_type': 'password'}
    )
    assert response.status_code == 400
    body = assert_coded(response, 'AUTH-1035', grant_type='password')
    assert list(body) == ['error', 'detail', 'code', 'params']
    assert body['error'] == 'unsupported_grant_type'
    assert body['detail'] == 'Unsupported grant_type: password'


async def test_refused_refresh_grant_has_its_own_code(
    async_client: AsyncClient, redis_client
):
    response = await async_client.post(
        '/auth/token',
        json={'grant_type': 'refresh_token', 'refresh_token': 'nope'},
    )
    body = assert_coded(response, 'AUTH-1032')
    assert body['error'] == 'invalid_grant'


async def test_refused_refresh_route_clears_cookies_and_codes_it(
    real_client: AsyncClient, redis_client
):
    real_client.cookies.set('__refresh', 'nope')
    response = await real_client.get('/auth/refresh')
    assert response.json() == {
        'detail': 'Invalid or expired refresh token',
        'code': 'AUTH-1015',
    }
    assert response.status_code == 401
    assert '__refresh=' in response.headers.get('set-cookie', '')


async def test_bad_cli_callback_is_auth_1023(async_client: AsyncClient):
    response = await async_client.post(
        '/auth/cli/start',
        json={'callback_url': 'http://example.com:8000/cb', 'state': 's'},
    )
    assert response.json() == {
        'detail': 'CLI callback URL must target loopback',
        'code': 'AUTH-1023',
    }
    assert response.status_code == 400


# --------------------------------------------------------------------------
# One sample per area, and every params code that a route can reach
# --------------------------------------------------------------------------


async def test_app_not_found(async_client: AsyncClient):
    response = await async_client.delete('/applications/1')
    assert_coded(response, 'APP-1001')


async def test_app_date_in_future_names_field_and_date(
    async_client: AsyncClient,
):
    future = (date.today() + timedelta(days=5)).isoformat()
    response = await async_client.post(
        '/applications', json=application_payload(application_date=future)
    )
    body = assert_coded(response, 'APP-1013', field='application_date')
    assert body['params']['date'] in body['detail']


async def test_evt_event_not_found(async_client: AsyncClient):
    created = await async_client.post(
        '/applications', json=application_payload()
    )
    app_id = created.json()['id']
    response = await async_client.delete(f'/applications/{app_id}/timeline/1')
    assert_coded(response, 'EVT-1001')


async def test_cat_platform_name_taken_names_it(async_client: AsyncClient):
    first = await async_client.post('/platforms', json={'name': 'Wellfound'})
    assert first.status_code == 201
    response = await async_client.post('/platforms', json={'name': 'wellFOUND'})
    body = assert_coded(response, 'CAT-1003', name='Wellfound')
    assert body['detail'] == (
        'A platform with this name already exists: Wellfound'
    )


@pytest.mark.usefixtures('cvs_beta')
async def test_cv_limit_names_the_max(async_client: AsyncClient):
    for n in range(3):
        created = await async_client.post(
            '/base-cvs', json=base_cv_payload(name=f'CV {n}')
        )
        assert created.status_code == 201
    response = await async_client.post('/base-cvs', json=base_cv_payload())
    assert response.json() == {
        'detail': 'Base CV limit reached (max 3 per user)',
        'code': 'CV-1002',
        'params': {'max': 3},
    }


@pytest.mark.usefixtures('jobs_beta')
async def test_job_search_limit_names_the_max(async_client: AsyncClient):
    for n in range(10):
        created = await async_client.post(
            '/job-searches', json={'name': f'S{n}', 'filters': {}}
        )
        assert created.status_code == 201
    response = await async_client.post(
        '/job-searches', json={'name': 'S10', 'filters': {}}
    )
    assert response.json() == {
        'detail': 'Saved search limit reached (max 10)',
        'code': 'JOB-1003',
        'params': {'max': 10},
    }


async def test_cyc_not_enough_applications_names_min_and_current(
    async_client: AsyncClient,
):
    response = await async_client.post('/cycles', json={'name': 'Next'})
    body = assert_coded(response, 'CYC-1001', min=10)
    current = body['params']['current']
    assert isinstance(current, int)
    assert current < 10
    assert body['detail'] == (
        'At least 10 applications are required to start a new cycle '
        f'(currently {current})'
    )


async def test_rpt_badge_required(async_client: AsyncClient):
    response = await async_client.get('/reports')
    assert response.json() == {
        'detail': 'Reports are for Borderless BASE and PSP members',
        'code': 'RPT-1001',
    }


async def test_usr_and_adm_samples(admin_client: AsyncClient):
    missing = await admin_client.get('/admin/users/987654321987')
    assert_coded(missing, 'USR-1001')

    too_long = await admin_client.post(
        '/admin/report-webhooks',
        json={'webhook_url': VALID_URL, 'badges': ['BASE'], 'label': 'x' * 101},
    )
    assert too_long.json() == {
        'detail': 'Label must be at most 100 characters',
        'code': 'ADM-1017',
        'params': {'max': 100},
    }
    assert too_long.status_code == 422


async def test_adm_admin_required(async_client: AsyncClient):
    response = await async_client.get('/admin/users')
    assert response.json() == {
        'detail': 'Admin access required',
        'code': 'ADM-1001',
    }


async def test_adm_company_in_use_names_the_count(
    async_client: AsyncClient, admin_client: AsyncClient
):
    created = await async_client.post(
        '/applications', json=application_payload()
    )
    assert created.status_code == 201
    company_id = base_data()['company_acme'].id
    response = await admin_client.delete(f'/admin/companies/{company_id}')
    body = assert_coded(response, 'ADM-1002')
    assert body['params']['count'] >= 1
    assert f'{body["params"]["count"]} application(s)' in body['detail']
