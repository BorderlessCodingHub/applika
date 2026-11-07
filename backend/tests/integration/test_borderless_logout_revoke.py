"""Logout ends one session; the last one gives the Borderless grant back
(ADR-0026 §10), on the real stack against the fake Borderless.

While another applika session of the user is open, Borderless is not told.
When a logout (``GET /auth/logout``, ``POST /auth/revoke``), a device
revocation or an account deletion leaves no open session, the refresh
token is forgotten, the Redis access token goes, and Borderless is asked
once to revoke the refresh token, after the answer. The Borderless browser
session is never touched.
"""

import logging

from httpx import AsyncClient
from sqlalchemy import select

from app.config.settings import REFRESH_COOKIE_NAME
from app.domain.models import BorderlessAccountModel
from tests import borderless_flow as flow
from tests.base_db_setup import base_data
from tests.conftest import BORDERLESS_CONFIG
from tests.integration.conftest import BOUND_SUB
from tests.sessions_seed import open_session

USER_ID = base_data()['user'].id
ACCESS_KEY = f'applika:borderless:access:{USER_ID}'


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


def _revokes(fake) -> list[dict]:
    return fake.log['revokes']


async def _token(db_session) -> str | None:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == USER_ID
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    return binding.encrypted_refresh_token


async def test_logout_with_another_session_open_tells_borderless_nothing(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_browser',
    )
    await redis_client.set(ACCESS_KEY, 'encrypted', ex=3600)

    response = await real_client.get(
        '/auth/logout', cookies={REFRESH_COOKIE_NAME: web.refresh_token}
    )

    assert response.status_code == 200
    assert _revokes(fake_borderless) == []
    assert await _token(db_session) is not None
    assert await redis_client.exists(ACCESS_KEY) == 1


async def test_logout_of_the_last_session_revokes_the_grant_once(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    await redis_client.set(ACCESS_KEY, 'encrypted', ex=3600)

    response = await real_client.get(
        '/auth/logout', cookies={REFRESH_COOKIE_NAME: web.refresh_token}
    )

    assert response.status_code == 200
    assert _revokes(fake_borderless) == [
        {'sub': BOUND_SUB, 'token_type_hint': 'refresh_token', 'known': True}
    ]
    assert await _token(db_session) is None
    assert await redis_client.exists(ACCESS_KEY) == 0


async def test_logout_keeps_the_borderless_browser_session(
    real_client: AsyncClient, redis_client, bound_user, fake_borderless
):
    async with flow.fake_browser(fake_borderless) as browser:
        signed_in = await flow.borderless_sign_in(
            real_client, browser, BOUND_SUB
        )
        assert signed_in.status_code == 307
        await real_client.get('/auth/logout')
        assert len(_revokes(fake_borderless)) == 1

        # Signing in again is one click: Borderless's session is intact.
        begin = await real_client.get('/auth/borderless/login')
        back = await browser.get(begin.headers['location'])
    assert back.status_code == 303
    assert 'code=' in back.headers['location']


async def test_the_cli_revoking_its_last_session_revokes_the_grant(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    cli = await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_browser',
    )

    response = await real_client.post(
        '/auth/revoke', json={'refresh_token': cli.refresh_token}
    )

    assert response.status_code == 204
    assert len(_revokes(fake_borderless)) == 1
    assert await _token(db_session) is None


async def test_revoking_an_unknown_value_tells_borderless_nothing(
    real_client: AsyncClient, redis_client, bound_user, fake_borderless
):
    response = await real_client.post(
        '/auth/revoke', json={'refresh_token': 'not-a-session'}
    )
    assert response.status_code == 204
    assert _revokes(fake_borderless) == []


async def test_revoking_the_last_device_revokes_the_grant(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    current = await open_session(async_engine, redis_client, USER_ID)
    other = await open_session(async_engine, redis_client, USER_ID)

    # Another device: the current one is still open, nothing told.
    first = await real_client.delete(
        f'/users/me/sessions/{other.session_id}',
        headers=_bearer(current.access_token),
    )
    assert first.status_code == 204
    assert _revokes(fake_borderless) == []

    # This device, the last one.
    last = await real_client.delete(
        f'/users/me/sessions/{current.session_id}',
        headers=_bearer(current.access_token),
    )
    assert last.status_code == 204
    assert len(_revokes(fake_borderless)) == 1
    assert await _token(db_session) is None


async def test_deleting_the_account_revokes_the_grant(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    current = await open_session(async_engine, redis_client, USER_ID)
    await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_browser',
    )
    await redis_client.set(ACCESS_KEY, 'encrypted', ex=3600)

    response = await real_client.delete(
        '/users/me', headers=_bearer(current.access_token)
    )

    assert response.status_code == 204
    assert _revokes(fake_borderless) == [
        {'sub': BOUND_SUB, 'token_type_hint': 'refresh_token', 'known': True}
    ]
    assert await redis_client.exists(ACCESS_KEY) == 0
    remaining = await db_session.scalars(select(BorderlessAccountModel))
    assert list(remaining) == []


async def test_a_failing_revoke_never_fails_the_logout(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    oidc_client,
    monkeypatch,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    calls: list[str] = []

    async def failing_post(*args, **kwargs):
        calls.append('revoke')
        raise OSError('borderless down')

    monkeypatch.setattr(oidc_client.http, 'post', failing_post)

    response = await real_client.get(
        '/auth/logout', cookies={REFRESH_COOKIE_NAME: web.refresh_token}
    )

    assert response.status_code == 200
    assert calls == ['revoke']
    assert await _token(db_session) is None


async def test_refresh_refusal_and_revoke_log_no_token_or_secret(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    fake_borderless,
    caplog,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    other = await open_session(async_engine, redis_client, USER_ID)
    with caplog.at_level(logging.DEBUG):
        # A refresh (rotates), a refusal (grant ended), a logout (revoke).
        await real_client.get(
            '/auth/refresh', cookies={REFRESH_COOKIE_NAME: web.refresh_token}
        )
        await redis_client.delete(ACCESS_KEY)
        fake_borderless.revoke_grants(BOUND_SUB)
        await real_client.get(
            '/auth/refresh', cookies={REFRESH_COOKIE_NAME: web.refresh_token}
        )
        await real_client.get(
            '/auth/logout', cookies={REFRESH_COOKIE_NAME: other.refresh_token}
        )

    text = '\n'.join(
        f'{r.getMessage()} {getattr(r, "extra_data", "")}'
        for r in caplog.records
        if r.name == 'app' or r.name.startswith('app.')
    )
    assert 'invalid_grant' in text  # the OAuth error is logged ...
    for secret in (
        *fake_borderless.refresh_tokens,
        BORDERLESS_CONFIG['client']['client_secret'],
        web.refresh_token,
        other.refresh_token,
    ):
        assert secret not in text  # ... never a token or the secret
    assert 'eyJ' not in text
