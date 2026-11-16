"""applika-cli is retired (ADR-0028, release C): what is gone and what the
web keeps.

* Every route only the CLI used answers exactly like an unknown address:
  404 ``{"detail": "Not Found", "code": "GEN-1001"}``, the same headers, no
  ``Deprecation`` and no hint, for every method it had.
* The 0.1.4 finalize body is a 422 GEN-1003 and nothing closes; no body,
  ``{}``, ``null`` and the outcome body still close (200).
* A ``cli`` session fails its next renewal: 401 AUTH-1016, the row ends
  ``revoked``, its keys go.
* ``Authorization: Bearer <JWT>`` is no REST credential: 401 AUTH-1001, the
  same as no credential; the ``__access`` cookie still signs in.
* ``/supports`` holds ``platforms`` only; no application answer (REST or an
  MCP tool) carries ``feedback`` or ``salary_offer``; ``last_event``,
  ``finalized`` and ``finalized_at`` stay.

Real Postgres and Redis; ``real_client`` runs the real ``get_current_user``.
"""

from typing import Any

import pytest
from httpx import AsyncClient, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME
from app.core.tokens import decode_token
from app.domain.models import (
    ApplicationModel,
    TimelineEventModel,
    UserSessionModel,
)
from app.main import app as main_app
from app.presentation.mcp.server import registry
from app.presentation.schemas.application import Application
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts
from tests.sessions_seed import open_session

USER_ID = base_data()['user'].id
NOT_FOUND = {'detail': 'Not Found', 'code': 'GEN-1001'}
# Per request, never part of a route's answer.
VOLATILE_HEADERS = {'x-request-id', 'date'}

APP = ts.APP_ID
STEP = 900
# (method, deleted path, the unknown sibling it must answer like): the 12
# paths of the plan's Contract, every method each one had.
DELETED_ROUTES = [
    ('POST', '/auth/cli/start', '/auth/cli/no-such-route'),
    ('GET', '/auth/cli/login/some-login-id', '/auth/cli/no-such/route-id'),
    ('POST', '/auth/cli/exchange', '/auth/cli/no-such-route'),
    ('GET', '/auth/cli/authorize', '/auth/cli/no-such-route'),
    ('POST', '/auth/token', '/auth/no-such-route'),
    ('POST', '/auth/revoke', '/auth/no-such-route'),
    ('POST', '/auth/device/code', '/auth/device/no-such-route'),
    ('GET', '/auth/device/verify', '/auth/device/no-such-route'),
    ('POST', '/auth/device/approve', '/auth/device/no-such-route'),
    ('POST', '/auth/device/deny', '/auth/device/no-such-route'),
    ('GET', f'/applications/{APP}/steps', f'/applications/{APP}/no-such'),
    ('POST', f'/applications/{APP}/steps', f'/applications/{APP}/no-such'),
    (
        'PUT',
        f'/applications/{APP}/steps/{STEP}',
        f'/applications/{APP}/no-such/{STEP}',
    ),
    (
        'DELETE',
        f'/applications/{APP}/steps/{STEP}',
        f'/applications/{APP}/no-such/{STEP}',
    ),
]
DELETED_PATHS = {
    '/auth/cli/start',
    '/auth/cli/login/{login_id}',
    '/auth/cli/exchange',
    '/auth/cli/authorize',
    '/auth/token',
    '/auth/revoke',
    '/auth/device/code',
    '/auth/device/verify',
    '/auth/device/approve',
    '/auth/device/deny',
    '/applications/{application_id}/steps',
    '/applications/{application_id}/steps/{step_id}',
}
LEGACY_BODY = {
    'step_id': str(ts.STEP_OFFER),
    'feedback_id': '10',
    'finalize_date': '2025-12-15',
    'salary_offer': 95000.0,
}
CLI_ONLY_FIELDS = {'feedback', 'salary_offer', 'last_step'}
KEPT_FIELDS = {'last_event', 'finalized', 'finalized_at'}


def _headers(response: Response) -> dict[str, str]:
    return {
        name: value
        for name, value in response.headers.items()
        if name not in VOLATILE_HEADERS
    }


async def _request(client: AsyncClient, method: str, path: str) -> Response:
    """The request an installed CLI would send: a JSON body on writes,
    the user's access cookie (it changes nothing on an unknown path)."""
    body: Any = (
        {'refresh_token': 'x', 'state': 's'} if method != 'GET' else None
    )
    return await client.request(method, path, json=body)


def _keys(node: Any) -> set[str]:
    """Every key anywhere in a JSON schema."""
    found: set[str] = set()
    if isinstance(node, dict):
        found.update(node)
        for value in node.values():
            found |= _keys(value)
    elif isinstance(node, list):
        for item in node:
            found |= _keys(item)
    return found


async def _cookie(async_engine, redis_client) -> dict[str, str]:
    web = await open_session(async_engine, redis_client, USER_ID)
    return {ACCESS_COOKIE_NAME: web.access_token}


# --------------------------------------------------------------------------
# AC1, AC3, AC7, AC9: every deleted route answers like an unknown address
# --------------------------------------------------------------------------


@pytest.mark.parametrize(('method', 'path', 'unknown'), DELETED_ROUTES)
async def test_a_deleted_route_answers_like_an_unknown_address(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    db_session: AsyncSession,
    method: str,
    path: str,
    unknown: str,
):
    await ts.seed_open_application(db_session)
    real_client.cookies.update(await _cookie(async_engine, redis_client))

    deleted = await _request(real_client, method, path)
    missing = await _request(real_client, method, unknown)

    assert deleted.status_code == 404, (method, path, deleted.text)
    assert deleted.json() == NOT_FOUND
    assert (deleted.status_code, deleted.json(), _headers(deleted)) == (
        missing.status_code,
        missing.json(),
        _headers(missing),
    )
    # No tombstone: no Deprecation, no Sunset, no Location, no hint.
    for header in ('deprecation', 'sunset', 'location', 'link'):
        assert header not in deleted.headers, (method, path, header)


def test_no_deleted_route_is_mounted_or_documented():
    mounted = {getattr(route, 'path', '') for route in main_app.routes}
    assert not DELETED_PATHS & mounted
    schema = main_app.openapi()
    assert not DELETED_PATHS & set(schema['paths'])
    # No operation is a deprecated compatibility route any more, and the
    # Bearer scheme left with the CLI.
    for item in schema['paths'].values():
        for operation in item.values():
            assert not operation.get('deprecated'), operation.get('summary')
    assert 'HTTPBearer' not in schema['components'].get('securitySchemes', {})


# --------------------------------------------------------------------------
# AC2, AC8: the 0.1.4 finalize body is refused, nothing closes
# --------------------------------------------------------------------------


async def test_the_legacy_finalize_body_is_422_and_nothing_closes(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    for body in (
        LEGACY_BODY,
        {'step_id': str(ts.STEP_OFFER)},
        {'feedback_id': '10'},
    ):
        response = await async_client.post(
            f'/applications/{APP}/finalize', json=body
        )
        assert response.status_code == 422, (body, response.text)
        payload = response.json()
        assert payload['code'] == 'GEN-1003'
        assert {error['type'] for error in payload['detail']} == {
            'extra_forbidden'
        }
        assert 'deprecation' not in response.headers

    db_session.expire_all()
    application = await db_session.get(ApplicationModel, APP)
    assert application is not None
    assert application.finalized_at is None
    events = await db_session.scalars(
        select(TimelineEventModel).where(
            TimelineEventModel.application_id == APP
        )
    )
    assert list(events) == []


@pytest.mark.parametrize(
    'kwargs',
    [{}, {'content': b''}, {'json': {}}, {'content': b'null'}],
    ids=['no-body', 'empty', 'empty-object', 'null'],
)
async def test_finalize_without_an_outcome_still_closes(
    async_client: AsyncClient, db_session: AsyncSession, kwargs
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        f'/applications/{APP}/finalize',
        headers={'content-type': 'application/json'},
        **kwargs,
    )

    assert response.status_code == 200, response.text
    assert response.json()['finalized'] is True
    assert 'deprecation' not in response.headers


async def test_finalize_with_an_outcome_still_closes(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed_open_application(db_session)

    response = await async_client.post(
        f'/applications/{APP}/finalize',
        json={'outcome': 'denied', 'event_date': '2025-12-20'},
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body['finalized'] is True
    assert body['last_event']['event_type'] == 'denied'


# --------------------------------------------------------------------------
# AC3, AC7: a cli session fails its next renewal and its row ends
# --------------------------------------------------------------------------


async def test_a_cli_session_refresh_is_401_auth_1016_and_ends_the_row(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    db_session: AsyncSession,
    bound_user,
):
    cli = await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_device',
        user_agent='applika-cli/1.1.0 (Linux)',
    )

    refused = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: cli.refresh_token}
    )

    assert refused.status_code == 401
    assert refused.json() == {
        'detail': 'Sign in again with Borderless',
        'code': 'AUTH-1016',
    }
    db_session.expire_all()
    row = await db_session.get(UserSessionModel, cli.session_id)
    assert row is not None
    assert row.ended_at is not None
    assert row.end_reason == 'revoked'
    assert not await redis_client.exists(
        f'applika:session:{cli.refresh_token}',
        f'applika:session:id:{cli.session_id}',
    )
    # Its access token is dead too, and a retry stays refused.
    me = await real_client.get(
        '/users/me', cookies={ACCESS_COOKIE_NAME: cli.access_token}
    )
    assert me.status_code == 401
    again = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: cli.refresh_token}
    )
    assert again.status_code == 401


async def test_a_web_session_still_renews(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    db_session: AsyncSession,
    bound_user,
):
    web = await open_session(async_engine, redis_client, USER_ID)

    renewed = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: web.refresh_token}
    )

    assert renewed.status_code == 200, renewed.text
    access = renewed.cookies[ACCESS_COOKIE_NAME]
    assert decode_token(access)['sid'] == str(web.session_id)
    db_session.expire_all()
    row = await db_session.get(UserSessionModel, web.session_id)
    assert row is not None
    assert row.ended_at is None


# --------------------------------------------------------------------------
# AC3: a Bearer JWT is no REST credential
# --------------------------------------------------------------------------


async def test_a_rest_bearer_jwt_is_401_like_no_credential(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await open_session(async_engine, redis_client, USER_ID)

    bearer = await real_client.get(
        '/users/me', headers={'Authorization': f'Bearer {web.access_token}'}
    )
    anonymous = await real_client.get('/users/me')
    cookie = await real_client.get(
        '/users/me', cookies={ACCESS_COOKIE_NAME: web.access_token}
    )

    assert bearer.status_code == 401
    assert bearer.json() == {
        'detail': 'Not authenticated',
        'code': 'AUTH-1001',
    }
    assert (bearer.status_code, bearer.json()) == (
        anonymous.status_code,
        anonymous.json(),
    )
    assert cookie.status_code == 200


# --------------------------------------------------------------------------
# AC2: /supports and every application answer drop the CLI-only fields
# --------------------------------------------------------------------------


async def test_supports_holds_the_platforms_only(async_client: AsyncClient):
    response = await async_client.get('/supports')

    assert response.status_code == 200
    assert set(response.json()) == {'platforms'}


def test_the_application_schema_drops_the_cli_only_fields():
    fields = set(Application.model_fields)
    assert not CLI_ONLY_FIELDS & fields
    assert fields >= KEPT_FIELDS
    documented = main_app.openapi()['components']['schemas']
    assert not CLI_ONLY_FIELDS & set(documented['Application']['properties'])
    assert 'ApplicationFeedback' not in documented
    assert 'FinalizeApplication' not in documented


def test_no_mcp_tool_output_carries_a_cli_only_field():
    for tool in registry.tools:
        if tool.output_schema is None:
            continue
        properties = _keys(tool.output_schema)
        assert not CLI_ONLY_FIELDS & properties, tool.name


async def test_every_application_answer_drops_the_cli_only_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(db_session, *ts.catalog())
    payload = {
        'company': {'name': 'Answer Co', 'url': None},
        'role': 'Backend Engineer',
        'mode': 'active',
        'platform_id': str(base_data()['plat_linkedin'].id),
        'application_date': '2025-12-01',
    }
    created = await async_client.post('/applications', json=payload)
    assert created.status_code == 201, created.text
    app_id = created.json()['id']
    await async_client.post(
        f'/applications/{app_id}/timeline',
        json={'event_type': 'interview', 'event_date': '2025-12-02'},
    )

    answers = [
        created.json(),
        (await async_client.get('/applications')).json()[0],
        (
            await async_client.put(f'/applications/{app_id}', json=payload)
        ).json(),
        (
            await async_client.post(
                f'/applications/{app_id}/finalize',
                json={
                    'outcome': 'offer',
                    'salary_amount': '9000.00',
                    'salary_currency': 'USD',
                    'salary_period': 'monthly',
                },
            )
        ).json(),
        (await async_client.post(f'/applications/{app_id}/reopen')).json(),
    ]

    for answer in answers:
        assert not CLI_ONLY_FIELDS & set(answer), answer
        assert set(answer) >= KEPT_FIELDS, answer
    assert answers[3]['finalized'] is True
    assert answers[3]['finalized_at'] is not None
    assert answers[3]['last_event']['event_type'] == 'offer'
    assert answers[4]['finalized'] is False
