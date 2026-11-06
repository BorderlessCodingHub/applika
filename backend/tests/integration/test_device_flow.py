"""``applika login --device``: the RFC 8628 device code (KODI-057,
ADR-0019, R-016, R-017).

The CLI asks for a code (``POST /auth/device/code``), a signed-in web user
looks it up (``GET /auth/device/verify``) and approves or denies it, and the
CLI polls ``POST /auth/token`` with the device grant until it gets a session
of its own, signed in as the approver.
"""

import re
from datetime import datetime

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.config.settings import envs
from app.core.tokens import decode_token
from app.domain.models import UserSessionModel
from tests.base_db_setup import base_data
from tests.sessions_seed import open_session

USER = base_data()['user']
ADMIN = base_data()['admin_user']
DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'
CLI_UA = 'applika-cli/1.1.0 (Linux; Python 3.12)'


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


async def _start(client: AsyncClient, **body) -> dict:
    response = await client.post(
        '/auth/device/code',
        json=body or None,
        headers={'User-Agent': CLI_UA},
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _poll(client: AsyncClient, device_code: str):
    return await client.post(
        '/auth/token',
        json={'grant_type': DEVICE_GRANT, 'device_code': device_code},
    )


async def _forget_last_poll(redis_client, device_code: str) -> None:
    """Let the next poll through the interval check (never re-creating a
    consumed code's hash)."""
    key = f'applika:device:code:{device_code}'
    if await redis_client.exists(key):
        await redis_client.hset(key, 'last_poll_at', '')


async def _signed_in(async_engine, redis_client, user=USER):
    return await open_session(async_engine, redis_client, user.id)


async def _cli_rows(engine: AsyncEngine) -> list[UserSessionModel]:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        result = await session.scalars(
            select(UserSessionModel).where(
                UserSessionModel.sign_in_method == 'cli_device'
            )
        )
        return list(result.all())


# --------------------------------------------------------------------------
# POST /auth/device/code
# --------------------------------------------------------------------------


async def test_device_code_shape(
    real_client: AsyncClient, redis_client, monkeypatch
):
    monkeypatch.setattr(
        envs, 'DEVICE_VERIFICATION_URI', 'http://127.0.0.1:8180/device'
    )

    body = await _start(real_client, device_name='build-box')

    assert set(body) == {
        'device_code',
        'user_code',
        'verification_uri',
        'verification_uri_complete',
        'expires_in',
        'interval',
    }
    assert re.fullmatch(
        r'[BCDFGHJKLMNPQRSTVWXZ]{4}-[BCDFGHJKLMNPQRSTVWXZ]{4}',
        body['user_code'],
    )
    assert body['verification_uri'] == 'http://127.0.0.1:8180/device'
    assert body['verification_uri_complete'] == (
        f'http://127.0.0.1:8180/device?code={body["user_code"]}'
    )
    assert body['expires_in'] == 600
    assert body['interval'] == 10
    stored = await redis_client.hgetall(
        f'applika:device:code:{body["device_code"]}'
    )
    assert stored['status'] == 'pending'
    assert stored['device_name'] == 'build-box'
    for key in (
        f'applika:device:code:{body["device_code"]}',
        f'applika:device:user_code:{body["user_code"].replace("-", "")}',
    ):
        assert 590 <= await redis_client.ttl(key) <= 600


async def test_device_code_without_a_body_names_the_device_from_its_agent(
    real_client: AsyncClient, redis_client
):
    body = await _start(real_client)
    stored = await redis_client.hgetall(
        f'applika:device:code:{body["device_code"]}'
    )
    assert stored['device_name'] == 'applika-cli 1.1.0'


# --------------------------------------------------------------------------
# AC17: the approval page's details; 404 and 401
# --------------------------------------------------------------------------


async def test_verify_shows_device_ip_and_request_time(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await _signed_in(async_engine, redis_client)
    body = await _start(real_client, device_name='build-box')

    for typed in (
        body['user_code'],
        body['user_code'].lower(),
        body['user_code'].replace('-', ''),
    ):
        response = await real_client.get(
            '/auth/device/verify',
            params={'user_code': typed},
            headers=_bearer(web.access_token),
        )
        assert response.status_code == 200, response.text
        shown = response.json()
        assert set(shown) == {
            'device_name',
            'client_label',
            'ip',
            'requested_at',
            'expires_at',
        }
        assert shown['device_name'] == 'build-box'
        assert shown['client_label'] == 'applika-cli 1.1.0'
        assert shown['ip'] == '127.0.0.1'
        requested = datetime.fromisoformat(shown['requested_at'])
        expires = datetime.fromisoformat(shown['expires_at'])
        assert (expires - requested).total_seconds() == 600


@pytest.mark.parametrize('typed', ['BCDF-GHJK', 'nonsense', ''])
async def test_verify_an_unknown_code_is_404(
    real_client: AsyncClient, async_engine, redis_client, typed
):
    web = await _signed_in(async_engine, redis_client)
    response = await real_client.get(
        '/auth/device/verify',
        params={'user_code': typed},
        headers=_bearer(web.access_token),
    )
    assert response.status_code == 404
    assert response.json() == {
        'detail': 'Code not found or expired',
        'code': 'AUTH-1040',
    }


async def test_verify_approve_and_deny_need_a_signed_in_user(
    real_client: AsyncClient, redis_client
):
    body = await _start(real_client)
    code = body['user_code']

    assert (
        await real_client.get('/auth/device/verify', params={'user_code': code})
    ).status_code == 401
    for route in ('/auth/device/approve', '/auth/device/deny'):
        response = await real_client.post(route, json={'user_code': code})
        assert response.status_code == 401
    stored = await redis_client.hgetall(
        f'applika:device:code:{body["device_code"]}'
    )
    assert stored['status'] == 'pending'


# --------------------------------------------------------------------------
# AC16: pending -> approved -> a session of its own, as the approver
# --------------------------------------------------------------------------


async def test_poll_before_approval_is_authorization_pending(
    real_client: AsyncClient, redis_client
):
    body = await _start(real_client)

    response = await _poll(real_client, body['device_code'])

    assert response.status_code == 400
    assert response.json()['error'] == 'authorization_pending'


async def test_polling_faster_than_the_interval_is_slow_down(
    real_client: AsyncClient, redis_client
):
    body = await _start(real_client)

    first = await _poll(real_client, body['device_code'])
    second = await _poll(real_client, body['device_code'])

    assert first.json()['error'] == 'authorization_pending'
    assert second.status_code == 400
    assert second.json()['error'] == 'slow_down'


async def test_polling_after_the_interval_is_not_slowed_down(
    real_client: AsyncClient, redis_client
):
    body = await _start(real_client)
    await _poll(real_client, body['device_code'])
    last = float(
        await redis_client.hget(
            f'applika:device:code:{body["device_code"]}', 'last_poll_at'
        )
    )
    await redis_client.hset(
        f'applika:device:code:{body["device_code"]}',
        'last_poll_at',
        repr(last - 10.5),
    )

    response = await _poll(real_client, body['device_code'])

    assert response.json()['error'] == 'authorization_pending'


async def test_an_approved_code_signs_the_cli_in_as_the_approver(
    real_client: AsyncClient, async_engine, redis_client
):
    admin_web = await _signed_in(async_engine, redis_client, ADMIN)
    body = await _start(real_client, device_name='build-box')

    approved = await real_client.post(
        '/auth/device/approve',
        json={'user_code': body['user_code'].lower()},
        headers=_bearer(admin_web.access_token),
    )
    assert approved.status_code == 204

    response = await _poll(real_client, body['device_code'])

    assert response.status_code == 200, response.text
    tokens = response.json()
    assert tokens['token_type'] == 'Bearer'
    assert decode_token(tokens['access_token'])['sub'] == str(ADMIN.id)
    [row] = await _cli_rows(async_engine)
    assert row.user_id == ADMIN.id
    assert (row.client_type, row.device_name) == ('cli', 'build-box')
    assert row.user_agent == CLI_UA
    assert row.created_ip == '127.0.0.1'
    assert decode_token(tokens['access_token']).get('sid') == str(row.id)
    me = await real_client.get(
        '/users/me', headers=_bearer(tokens['access_token'])
    )
    assert me.status_code == 200
    assert me.json()['username'] == ADMIN.username
    # The web session that approved it is a different session.
    assert row.id != admin_web.session_id


async def test_an_approved_code_is_one_use(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await _signed_in(async_engine, redis_client)
    body = await _start(real_client)
    await real_client.post(
        '/auth/device/approve',
        json={'user_code': body['user_code']},
        headers=_bearer(web.access_token),
    )

    assert (await _poll(real_client, body['device_code'])).status_code == 200
    await _forget_last_poll(redis_client, body['device_code'])
    again = await _poll(real_client, body['device_code'])

    assert again.status_code == 400
    assert again.json()['error'] == 'expired_token'
    assert len(await _cli_rows(async_engine)) == 1
    # Both keys are gone with it.
    assert (
        await redis_client.exists(
            f'applika:device:code:{body["device_code"]}',
            f'applika:device:user_code:{body["user_code"].replace("-", "")}',
        )
        == 0
    )


async def test_approving_twice_is_409(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await _signed_in(async_engine, redis_client)
    body = await _start(real_client)
    payload = {'user_code': body['user_code']}

    first = await real_client.post(
        '/auth/device/approve', json=payload, headers=_bearer(web.access_token)
    )
    second = await real_client.post(
        '/auth/device/approve', json=payload, headers=_bearer(web.access_token)
    )
    deny = await real_client.post(
        '/auth/device/deny', json=payload, headers=_bearer(web.access_token)
    )

    assert first.status_code == 204
    assert second.status_code == 409
    assert second.json() == {'detail': 'Code already used', 'code': 'AUTH-1041'}
    assert deny.status_code == 409
    # A decided code is no longer shown for approval.
    verify = await real_client.get(
        '/auth/device/verify',
        params={'user_code': body['user_code']},
        headers=_bearer(web.access_token),
    )
    assert verify.status_code == 404


# --------------------------------------------------------------------------
# Denied and expired
# --------------------------------------------------------------------------


async def test_a_denied_code_is_access_denied_then_gone(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await _signed_in(async_engine, redis_client)
    body = await _start(real_client)

    denied = await real_client.post(
        '/auth/device/deny',
        json={'user_code': body['user_code']},
        headers=_bearer(web.access_token),
    )
    assert denied.status_code == 204

    response = await _poll(real_client, body['device_code'])
    assert response.status_code == 400
    assert response.json()['error'] == 'access_denied'
    await _forget_last_poll(redis_client, body['device_code'])
    assert (await _poll(real_client, body['device_code'])).json()[
        'error'
    ] == 'expired_token'
    assert await _cli_rows(async_engine) == []


async def test_an_expired_code_is_expired_token_and_404(
    real_client: AsyncClient, async_engine, redis_client
):
    web = await _signed_in(async_engine, redis_client)
    body = await _start(real_client)
    # Both keys expire together (EX DEVICE_CODE_TTL_SECONDS).
    await redis_client.delete(
        f'applika:device:code:{body["device_code"]}',
        f'applika:device:user_code:{body["user_code"].replace("-", "")}',
    )

    response = await _poll(real_client, body['device_code'])
    assert response.status_code == 400
    assert response.json()['error'] == 'expired_token'
    for route in ('/auth/device/approve', '/auth/device/deny'):
        refused = await real_client.post(
            route,
            json={'user_code': body['user_code']},
            headers=_bearer(web.access_token),
        )
        assert refused.status_code == 404
        assert refused.json() == {
            'detail': 'Code not found or expired',
            'code': 'AUTH-1040',
        }


async def test_an_unknown_device_code_is_expired_token(
    real_client: AsyncClient, redis_client
):
    response = await _poll(real_client, 'never-issued')
    assert response.status_code == 400
    assert response.json()['error'] == 'expired_token'
