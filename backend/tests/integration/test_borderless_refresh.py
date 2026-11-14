"""Keeping the membership current and a refused grant (ADR-0026 §8, §9), on
the real stack (Postgres, Redis, the real ``get_current_user``) against the
fake Borderless.

The Redis access token is the freshness marker: present, a session refresh
or a gated request calls nobody; gone, one refresh grant rotates the stored
refresh token and applies the claim. When Borderless refuses the grant,
every web session ends ``borderless_revoked`` (shown revoked in Devices) and
the web refresh is AUTH-1049; CLI sessions keep refreshing and their
member-gated requests answer AUTH-1050 until the next sign-in. A slow or
failing Borderless never ends anything.
"""

import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select

from app.application.services.borderless_access_store import (
    BorderlessAccessStore,
)
from app.application.services.borderless_oidc import BorderlessUnavailable
from app.config.settings import ACCESS_COOKIE_NAME, REFRESH_COOKIE_NAME, envs
from app.core.crypto import decrypt_borderless_token
from app.domain.models import (
    BorderlessAccountModel,
    UserBadgeModel,
    UserSessionModel,
)
from app.main import app as main_app
from app.presentation.dependencies import get_borderless_access_store
from tests import borderless_flow as flow
from tests.base_db_setup import base_data
from tests.conftest import bind_borderless
from tests.integration.conftest import BOUND_SUB
from tests.sessions_seed import open_session

USER_ID = base_data()['user'].id
ACCESS_KEY = f'applika:borderless:access:{USER_ID}'
GRANT_ENDED = {
    'detail': (
        'Your Borderless sign-in has ended. Sign in again with Borderless'
    ),
    'code': 'AUTH-1049',
}
LOCKED = {
    'detail': (
        'Your Borderless sign-in has ended. Sign in again on the applika '
        'website to use member features'
    ),
    'code': 'AUTH-1050',
}


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


def _grants(fake) -> list[str]:
    return [g['grant_type'] for g in fake.log['grants'].get(BOUND_SUB, [])]


async def _refresh(client: AsyncClient, refresh_value: str):
    return await client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: refresh_value}
    )


async def _cli_refresh(client: AsyncClient, refresh_value: str):
    return await client.post(
        '/auth/token',
        json={'grant_type': 'refresh_token', 'refresh_token': refresh_value},
    )


async def _binding(db_session) -> BorderlessAccountModel:
    binding = await db_session.scalar(
        select(BorderlessAccountModel).where(
            BorderlessAccountModel.user_id == USER_ID
        )
    )
    assert binding is not None
    await db_session.refresh(binding)
    return binding


async def _row(db_session, session_id: int) -> UserSessionModel:
    row = await db_session.get(UserSessionModel, session_id)
    assert row is not None
    await db_session.refresh(row)
    return row


async def _live_badges(db_session) -> list[str]:
    return list(
        await db_session.scalars(
            select(UserBadgeModel.badge).where(
                UserBadgeModel.user_id == USER_ID,
                UserBadgeModel.revoked_at.is_(None),
            )
        )
    )


# --------------------------------------------------------------------------
# Freshness: about one Borderless call per access-token lifetime
# --------------------------------------------------------------------------


async def test_a_live_access_token_means_no_borderless_call(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    fake_borderless,
):
    tokens = await open_session(async_engine, redis_client, USER_ID)
    await redis_client.set(ACCESS_KEY, 'encrypted', ex=3600)

    assert (await _refresh(real_client, tokens.refresh_token)).status_code == 200
    gated = await real_client.get(
        '/reports', headers=_bearer(tokens.access_token)
    )

    assert gated.status_code == 200
    assert _grants(fake_borderless) == []


async def test_a_missing_access_token_refreshes_once_and_rotates(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    tokens = await open_session(async_engine, redis_client, USER_ID)
    before = (await _binding(db_session)).encrypted_refresh_token
    fake_borderless.set_account(BOUND_SUB, membership='BASE')

    first = await _refresh(real_client, tokens.refresh_token)
    second = await _refresh(real_client, tokens.refresh_token)
    gated = await real_client.get(
        '/reports', headers=_bearer(tokens.access_token)
    )

    assert (first.status_code, second.status_code) == (200, 200)
    assert gated.status_code == 200
    assert _grants(fake_borderless) == ['refresh_token']  # once
    binding = await _binding(db_session)
    assert binding.encrypted_refresh_token != before
    rotated = decrypt_borderless_token(binding.encrypted_refresh_token or '')
    assert rotated in fake_borderless.refresh_tokens
    assert rotated not in str(binding.encrypted_refresh_token)
    # The access token: in Redis, encrypted, for its lifetime.
    stored = await redis_client.get(ACCESS_KEY)
    assert stored is not None
    assert 3500 < await redis_client.ttl(ACCESS_KEY) <= 3600
    # The badge followed the membership (PSP -> BASE).
    assert await _live_badges(db_session) == ['borderless_base']


async def test_a_gated_request_with_no_access_token_refreshes(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    fake_borderless,
):
    tokens = await open_session(async_engine, redis_client, USER_ID)

    gated = await real_client.get(
        '/reports', headers=_bearer(tokens.access_token)
    )

    assert gated.status_code == 200
    assert _grants(fake_borderless) == ['refresh_token']
    assert await redis_client.exists(ACCESS_KEY) == 1


async def test_borderless_failing_never_fails_a_refresh_or_a_request(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    oidc_client,
    monkeypatch,
):
    web = await open_session(async_engine, redis_client, USER_ID)

    async def down(token, timeout=None):
        raise BorderlessUnavailable('5xx')

    monkeypatch.setattr(oidc_client, 'refresh', down)

    assert (await _refresh(real_client, web.refresh_token)).status_code == 200
    gated = await real_client.get('/reports', headers=_bearer(web.access_token))
    assert gated.status_code == 200
    assert await _live_badges(db_session) == ['borderless_psp']
    binding = await _binding(db_session)
    assert binding.status == 'active'
    assert binding.profile_read_failed_at is not None
    # No access token stored: the next check tries again.
    assert await redis_client.exists(ACCESS_KEY) == 0


# --------------------------------------------------------------------------
# A refused grant: web sessions end, CLI sessions are locked out of members
# --------------------------------------------------------------------------


async def test_a_refused_grant_ends_web_sessions_and_locks_the_cli(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    other_web = await open_session(async_engine, redis_client, USER_ID)
    cli = await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_browser',
    )
    legacy_cli = await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_legacy',
    )
    fake_borderless.revoke_grants(BOUND_SUB)

    refused = await _refresh(real_client, web.refresh_token)

    # The web: 401 AUTH-1049, both cookies cleared, every web row ended.
    assert refused.status_code == 401
    assert refused.json() == GRANT_ENDED
    cleared = refused.headers.get_list('set-cookie')
    assert any(c.startswith(f'{ACCESS_COOKIE_NAME}=') for c in cleared)
    assert any(c.startswith(f'{REFRESH_COOKIE_NAME}=') for c in cleared)
    for session in (web, other_web):
        row = await _row(db_session, session.session_id)
        assert row.end_reason == 'borderless_revoked'
    # The user's other web session: dead (its key went).
    other = await real_client.get(
        '/users/me', headers=_bearer(other_web.access_token)
    )
    assert other.status_code == 401
    assert other.json()['code'] == 'AUTH-1002'
    other_refresh = await _refresh(real_client, other_web.refresh_token)
    assert other_refresh.json()['code'] == 'AUTH-1015'
    # Devices lists them as revoked.
    devices = await real_client.get(
        '/users/me/sessions', headers=_bearer(cli.access_token)
    )
    statuses = {item['id']: item['status'] for item in devices.json()}
    assert statuses[str(web.session_id)] == 'revoked'
    assert statuses[str(other_web.session_id)] == 'revoked'
    # The binding: no grant, needs_reconnect, no access token.
    binding = await _binding(db_session)
    assert binding.encrypted_refresh_token is None
    assert binding.status == 'needs_reconnect'
    assert await redis_client.exists(ACCESS_KEY) == 0

    # The CLI sessions stay open and keep refreshing ...
    for session in (cli, legacy_cli):
        assert (await _row(db_session, session.session_id)).ended_at is None
    granted = await _cli_refresh(real_client, cli.refresh_token)
    assert granted.status_code == 200
    legacy = await _refresh(real_client, legacy_cli.refresh_token)
    assert legacy.status_code == 200
    whoami = await real_client.get(
        '/users/me', headers=_bearer(cli.access_token)
    )
    assert whoami.status_code == 200
    assert whoami.json()['borderless']['status'] == 'needs_reconnect'
    # ... but a member route tells them to sign in on the website.
    locked = await real_client.get('/reports', headers=_bearer(cli.access_token))
    assert locked.status_code == 403
    assert locked.json() == LOCKED
    # The badge row stays.
    assert await _live_badges(db_session) == ['borderless_psp']


async def test_the_next_sign_in_unlocks_every_session(
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
    web = await open_session(async_engine, redis_client, USER_ID)
    fake_borderless.revoke_grants(BOUND_SUB)
    assert (await _refresh(real_client, web.refresh_token)).status_code == 401
    locked = await real_client.get('/reports', headers=_bearer(cli.access_token))
    assert locked.json() == LOCKED

    async with flow.fake_browser(fake_borderless) as browser:
        signed_in = await flow.borderless_sign_in(
            real_client, browser, BOUND_SUB
        )
    assert signed_in.headers['location'] == envs.WEB_SIGNIN_URI

    unlocked = await real_client.get(
        '/reports', headers=_bearer(cli.access_token)
    )
    assert unlocked.status_code == 200
    assert (await _binding(db_session)).status == 'active'


async def test_thirty_days_after_the_sign_in_the_web_signs_in_again(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    fake_borderless,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    fake_borderless.advance(30 * 24 * 3600 + 1)

    refused = await _refresh(real_client, web.refresh_token)
    assert refused.json() == GRANT_ENDED


async def test_a_binding_from_the_password_era_ends_its_web_sessions(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
):
    """Plan corrections 4: an ``active`` binding with no refresh token
    (bound by the password sign-in, development only) is handled like a
    refused grant at its first membership check."""
    await bind_borderless(db_session, USER_ID, token='')
    web = await open_session(async_engine, redis_client, USER_ID)
    cli = await open_session(
        async_engine,
        redis_client,
        USER_ID,
        client_type='cli',
        sign_in_method='cli_browser',
    )

    refused = await _refresh(real_client, web.refresh_token)
    assert refused.json() == GRANT_ENDED
    locked = await real_client.get('/reports', headers=_bearer(cli.access_token))
    assert locked.json() == LOCKED


async def test_a_lost_encryption_key_ends_the_grant(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
    monkeypatch,
):
    web = await open_session(async_engine, redis_client, USER_ID)
    monkeypatch.setattr(
        envs, 'BORDERLESS_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )

    refused = await _refresh(real_client, web.refresh_token)

    assert refused.json() == GRANT_ENDED
    assert _grants(fake_borderless) == []  # nothing to send
    assert (await _binding(db_session)).status == 'needs_reconnect'


async def test_redis_unreachable_for_the_access_token_refreshes_from_postgres(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    bound_user,
    fake_borderless,
):
    """The short-term store failing counts as "missing": the gate asks
    Borderless with the database's refresh token instead of trusting an
    unchecked membership."""
    class DownRedis:
        async def exists(self, *args):
            raise OSError('down')

        async def set(self, *args, **kwargs):
            raise OSError('down')

        async def delete(self, *args):
            raise OSError('down')

    tokens = await open_session(async_engine, redis_client, USER_ID)
    main_app.dependency_overrides[get_borderless_access_store] = lambda: (
        BorderlessAccessStore(DownRedis())  # ty: ignore[invalid-argument-type]
    )
    try:
        first = await real_client.get(
            '/reports', headers=_bearer(tokens.access_token)
        )
        second = await real_client.get(
            '/reports', headers=_bearer(tokens.access_token)
        )
    finally:
        main_app.dependency_overrides.pop(get_borderless_access_store, None)

    assert (first.status_code, second.status_code) == (200, 200)
    assert _grants(fake_borderless) == ['refresh_token', 'refresh_token']


@pytest.mark.parametrize('membership', ['FREE', 'STARTER', None])
async def test_a_membership_lost_on_borderless_revokes_the_badge(
    real_client: AsyncClient,
    async_engine,
    db_session,
    redis_client,
    bound_user,
    fake_borderless,
    membership,
):
    tokens = await open_session(async_engine, redis_client, USER_ID)
    fake_borderless.set_account(BOUND_SUB, membership=membership)

    gated = await real_client.get(
        '/reports', headers=_bearer(tokens.access_token)
    )

    assert gated.status_code == 403
    assert gated.json()['code'] == 'RPT-1001'
    assert await _live_badges(db_session) == []
