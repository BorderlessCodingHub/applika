"""``POST /auth/borderless/confirm`` (ADR-0024): 204, the Borderless access
renewed and the membership read; the session rows, the Redis session keys
and the cookies untouched."""

from datetime import UTC, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select

from app.application.services.borderless_client import BorderlessUnavailable
from app.domain.models import BorderlessAccountModel, UserSessionModel
from tests.conftest import FakeBorderlessClient, bind_borderless
from tests.integration.conftest import CREDENTIALS
from tests.sessions_seed import open_session


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


async def test_confirm_keeps_the_session_and_renews_the_access(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    borderless: FakeBorderlessClient,
):
    await bind_borderless(
        db_session,
        1,
        borderless_id='bl-user',
        status='needs_reconnect',
        expires_in=timedelta(seconds=-1),
    )
    borderless.add(
        id='bl-user', email=CREDENTIALS['email'], token='fresh', membership='BASE'
    )
    tokens = await open_session(async_engine, redis_client, 1)
    keys_before = sorted(await redis_client.keys('applika:session:*'))
    rows_before = [
        (r.id, r.ended_at)
        for r in await db_session.scalars(select(UserSessionModel))
    ]
    me = await real_client.get('/users/me', headers=_bearer(tokens.access_token))
    assert me.json()['borderless']['status'] == 'needs_reconnect'

    response = await real_client.post(
        '/auth/borderless/confirm',
        json=CREDENTIALS,
        headers=_bearer(tokens.access_token),
    )

    assert response.status_code == 204
    assert 'set-cookie' not in response.headers
    assert sorted(await redis_client.keys('applika:session:*')) == keys_before
    db_session.expire_all()
    rows_after = [
        (r.id, r.ended_at)
        for r in await db_session.scalars(select(UserSessionModel))
    ]
    assert rows_after == rows_before
    binding = await db_session.scalar(select(BorderlessAccountModel))
    assert binding.status == 'active'
    assert binding.access_token_expires_at > datetime.now(UTC) + timedelta(
        days=6
    )
    me = await real_client.get('/users/me', headers=_bearer(tokens.access_token))
    assert me.json()['borderless']['status'] == 'active'
    assert [b['badge'] for b in me.json()['badges']] == [
        'borderless_base'
    ]


async def test_confirm_with_another_borderless_account_is_409(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    borderless: FakeBorderlessClient,
):
    borderless.add(id='bl-other', email='other@x.io')
    tokens = await open_session(async_engine, redis_client, 1)
    response = await real_client.post(
        '/auth/borderless/confirm',
        json={'email': 'other@x.io', 'password': 'correct-horse'},
        headers=_bearer(tokens.access_token),
    )
    assert response.status_code == 409
    assert response.json() == {
        'detail': (
            'This is not the Borderless account linked to your applika '
            'account'
        ),
        'code': 'binding_conflict',
    }


async def test_confirm_refusals(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    borderless: FakeBorderlessClient,
):
    unauthenticated = await real_client.post(
        '/auth/borderless/confirm', json=CREDENTIALS
    )
    assert unauthenticated.status_code == 401
    tokens = await open_session(async_engine, redis_client, 1)
    headers = _bearer(tokens.access_token)
    wrong = await real_client.post(
        '/auth/borderless/confirm',
        json={**CREDENTIALS, 'password': 'nope'},
        headers=headers,
    )
    assert wrong.status_code == 401
    assert wrong.json() == {'detail': 'Invalid email or password'}
    borderless.sign_in_error = BorderlessUnavailable('down')
    down = await real_client.post(
        '/auth/borderless/confirm', json=CREDENTIALS, headers=headers
    )
    assert down.status_code == 503
    invalid = await real_client.post(
        '/auth/borderless/confirm', json={'email': 'a'}, headers=headers
    )
    assert invalid.status_code == 422
