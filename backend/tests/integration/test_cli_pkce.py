"""``applika login``: browser sign-in with PKCE S256 (KODI-057, ADR-0019,
R-015, R-018, R-019, R-020, R-021).

``GET /auth/cli/authorize`` -> applika's Borderless sign-in page -> the
sign-in (fake Borderless) answers ``redirect_to``, the loopback
``redirect_uri`` (or, with ``oob``, ``CLI_MANUAL_REDIRECT_URI``) with a
one-use code -> ``POST /auth/token`` redeems it with the verifier.
Also the ``refresh_token`` grant and ``POST /auth/revoke``.
"""

import secrets
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.config.settings import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    envs,
)
from app.core.pkce import s256_challenge
from app.core.tokens import decode_token
from app.domain.models import UserSessionModel
from app.presentation.api.auth_handoff import CLI_LOGIN_COOKIE_NAME
from tests.base_db_setup import base_data
from tests.integration.conftest import CREDENTIALS
from tests.sessions_seed import open_session

USER = base_data()['user']
LOOPBACK = 'http://127.0.0.1:43129/callback'
CLI_UA = 'applika-cli/1.1.0 (Linux; Python 3.12)'
DEVICE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code'


@pytest.fixture
def borderless_sign_in(bound_user):
    return bound_user


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    return verifier, s256_challenge(verifier)


async def _rows(engine: AsyncEngine) -> list[UserSessionModel]:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        result = await session.scalars(
            select(UserSessionModel)
            .where(UserSessionModel.user_id == USER.id)
            .order_by(UserSessionModel.created_at)
        )
        return list(result.all())


async def _authorize(
    client: AsyncClient,
    challenge: str,
    redirect_uri: str = LOOPBACK,
    state: str = 'st-1',
):
    return await client.get(
        '/auth/cli/authorize',
        params={
            'redirect_uri': redirect_uri,
            'code_challenge': challenge,
            'code_challenge_method': 'S256',
            'state': state,
        },
        follow_redirects=False,
    )


async def _login_code(
    client: AsyncClient,
    challenge: str,
    redirect_uri: str = LOOPBACK,
    extra_cookies: dict[str, str] | None = None,
) -> tuple[str, str]:
    """authorize -> Borderless sign-in; answers (code, the redirect)."""
    started = await _authorize(client, challenge, redirect_uri)
    assert started.status_code == 307, started.text
    login_id = started.cookies.get(CLI_LOGIN_COOKIE_NAME)
    assert login_id
    callback = await client.post(
        '/auth/borderless/signin',
        json=CREDENTIALS,
        cookies={CLI_LOGIN_COOKIE_NAME: login_id, **(extra_cookies or {})},
    )
    assert callback.status_code == 200, callback.text
    assert ACCESS_COOKIE_NAME not in callback.cookies
    location = callback.json()['redirect_to']
    return parse_qs(urlparse(location).query)['code'][0], location


async def _token(client: AsyncClient, **body):
    return await client.post(
        '/auth/token', json=body, headers={'User-Agent': CLI_UA}
    )


# --------------------------------------------------------------------------
# authorize: S256 only, a 43..128 base64url challenge, loopback or oob
# --------------------------------------------------------------------------


async def test_authorize_redirects_to_the_signin_page_with_the_cli_marker(
    real_client: AsyncClient, auth_handoff_state_use_case
):
    _, challenge = _pkce()

    response = await _authorize(real_client, challenge)

    assert response.status_code == 307
    assert response.headers['location'] == f'{envs.WEB_SIGNIN_URI}?cli=1'
    login_id = response.cookies.get(CLI_LOGIN_COOKIE_NAME)
    assert login_id
    stored = await auth_handoff_state_use_case.get_login(login_id)
    assert stored == {
        'login_id': login_id,
        'callback_url': LOOPBACK,
        'state': 'st-1',
        'flow': 'pkce',
        'code_challenge': challenge,
    }


@pytest.mark.parametrize('method', ['plain', 's256', ''])
async def test_authorize_accepts_s256_only(
    real_client: AsyncClient, redis_client, method
):
    _, challenge = _pkce()
    response = await real_client.get(
        '/auth/cli/authorize',
        params={
            'redirect_uri': LOOPBACK,
            'code_challenge': challenge,
            'code_challenge_method': method,
            'state': 's',
        },
        follow_redirects=False,
    )
    assert response.status_code == 400
    assert response.json() == {'detail': 'code_challenge_method must be S256'}


@pytest.mark.parametrize('challenge', ['short', 'A' * 129, 'A' * 42 + '='])
async def test_authorize_refuses_a_bad_challenge(
    real_client: AsyncClient, redis_client, challenge
):
    response = await _authorize(real_client, challenge)
    assert response.status_code == 400
    assert response.json() == {'detail': 'Invalid code_challenge'}


@pytest.mark.parametrize(
    ('redirect_uri', 'detail'),
    [
        ('https://127.0.0.1:4000/cb', 'CLI callback URL must use http'),
        (
            'http://evil.example:4000/cb',
            'CLI callback URL must target loopback',
        ),
        ('http://127.0.0.1/cb', 'CLI callback URL must include a port'),
        ('OOB', 'CLI callback URL must use http'),
    ],
)
async def test_authorize_keeps_the_loopback_rules(
    real_client: AsyncClient, redis_client, redirect_uri, detail
):
    _, challenge = _pkce()
    response = await _authorize(real_client, challenge, redirect_uri)
    assert response.status_code == 400
    assert response.json() == {'detail': detail}


async def test_authorize_needs_every_parameter(
    real_client: AsyncClient, redis_client
):
    response = await real_client.get(
        '/auth/cli/authorize', params={'redirect_uri': LOOPBACK}
    )
    assert response.status_code == 422


# --------------------------------------------------------------------------
# AC15 / AC20: the full loopback sign-in gives the CLI its own session
# --------------------------------------------------------------------------


async def test_loopback_sign_in_gives_the_cli_a_session_of_its_own(
    real_client: AsyncClient, async_engine, redis_client, borderless_sign_in
):
    verifier, challenge = _pkce()
    code, location = await _login_code(real_client, challenge)
    parsed = urlparse(location)
    assert f'{parsed.scheme}://{parsed.netloc}{parsed.path}' == LOOPBACK
    assert parse_qs(parsed.query)['state'] == ['st-1']

    response = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri=LOOPBACK,
        device_name='luis-laptop',
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert set(body) == {
        'access_token',
        'token_type',
        'expires_in',
        'refresh_token',
        'refresh_expires_in',
    }
    assert body['token_type'] == 'Bearer'
    assert body['expires_in'] == envs.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    assert body['refresh_expires_in'] == 7 * 86400
    assert uuid.UUID(body['refresh_token']).version == 7

    [row] = await _rows(async_engine)
    assert (row.client_type, row.sign_in_method) == ('cli', 'cli_browser')
    assert row.device_name == 'luis-laptop'
    assert row.user_agent == CLI_UA
    assert decode_token(body['access_token']).get('sid') == str(row.id)

    # AC19: the access token works as a Bearer header.
    me = await real_client.get(
        '/users/me', headers={'Authorization': f'Bearer {body["access_token"]}'}
    )
    assert me.status_code == 200
    assert me.json()['username'] == USER.username


async def test_without_a_name_the_device_is_named_from_its_agent(
    real_client: AsyncClient, async_engine, redis_client, borderless_sign_in
):
    verifier, challenge = _pkce()
    code, _ = await _login_code(real_client, challenge)

    response = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri=LOOPBACK,
    )

    assert response.status_code == 200
    [row] = await _rows(async_engine)
    assert row.device_name == 'applika-cli 1.1.0'


async def test_a_cli_sign_in_never_ends_the_browsers_session(
    real_client: AsyncClient, async_engine, redis_client, borderless_sign_in
):
    """Plan correction 13: only the web branch replaces a session."""
    browser = await open_session(async_engine, redis_client, USER.id)
    verifier, challenge = _pkce()

    code, _ = await _login_code(
        real_client,
        challenge,
        extra_cookies={REFRESH_COOKIE_NAME: browser.refresh_token},
    )
    await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri=LOOPBACK,
    )

    rows = {row.id: row for row in await _rows(async_engine)}
    assert rows[browser.session_id].ended_at is None
    me = await real_client.get(
        '/users/me', cookies={ACCESS_COOKIE_NAME: browser.access_token}
    )
    assert me.status_code == 200


# --------------------------------------------------------------------------
# AC18: oob - the code is shown on the web to paste
# --------------------------------------------------------------------------


async def test_oob_redirects_to_the_manual_code_page(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    borderless_sign_in,
    monkeypatch,
):
    monkeypatch.setattr(
        envs, 'CLI_MANUAL_REDIRECT_URI', 'http://127.0.0.1:8180/cli/code'
    )
    verifier, challenge = _pkce()

    code, location = await _login_code(real_client, challenge, 'oob')

    parsed = urlparse(location)
    assert f'{parsed.scheme}://{parsed.netloc}{parsed.path}' == (
        'http://127.0.0.1:8180/cli/code'
    )
    assert parse_qs(parsed.query) == {'code': [code], 'state': ['st-1']}

    response = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri='oob',
    )
    assert response.status_code == 200


# --------------------------------------------------------------------------
# The code: one use, bound to the verifier and the redirect_uri
# --------------------------------------------------------------------------


async def test_the_code_is_one_use(
    real_client: AsyncClient, redis_client, borderless_sign_in
):
    verifier, challenge = _pkce()
    code, _ = await _login_code(real_client, challenge)
    body = {
        'grant_type': 'authorization_code',
        'code': code,
        'code_verifier': verifier,
        'redirect_uri': LOOPBACK,
    }

    assert (await _token(real_client, **body)).status_code == 200
    again = await _token(real_client, **body)

    assert again.status_code == 400
    assert again.json() == {
        'error': 'invalid_grant',
        'detail': 'Invalid or expired code',
    }


async def test_the_code_lives_sixty_seconds(
    real_client: AsyncClient, redis_client, borderless_sign_in
):
    _, challenge = _pkce()
    code, _ = await _login_code(real_client, challenge)
    ttl = await redis_client.ttl(f'applika:auth_handoff:code:{code}')
    assert 55 <= ttl <= 60


async def test_a_wrong_verifier_is_invalid_grant_and_spends_the_code(
    real_client: AsyncClient, async_engine, redis_client, borderless_sign_in
):
    verifier, challenge = _pkce()
    code, _ = await _login_code(real_client, challenge)

    wrong = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=_pkce()[0],
        redirect_uri=LOOPBACK,
    )
    assert wrong.status_code == 400
    assert wrong.json() == {
        'error': 'invalid_grant',
        'detail': 'Invalid code_verifier',
    }

    right = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri=LOOPBACK,
    )
    assert right.status_code == 400
    assert right.json()['error'] == 'invalid_grant'
    assert await _rows(async_engine) == []


async def test_a_different_redirect_uri_is_invalid_grant(
    real_client: AsyncClient, redis_client, borderless_sign_in
):
    verifier, challenge = _pkce()
    code, _ = await _login_code(real_client, challenge)

    response = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri='http://127.0.0.1:9999/callback',
    )

    assert response.status_code == 400
    assert response.json() == {
        'error': 'invalid_grant',
        'detail': 'redirect_uri does not match',
    }


async def test_a_pkce_code_is_refused_by_the_legacy_exchange(
    real_client: AsyncClient, redis_client, borderless_sign_in
):
    """Without this, the legacy route would skip the verifier."""
    _, challenge = _pkce()
    code, _ = await _login_code(real_client, challenge)

    response = await real_client.post('/auth/cli/exchange', json={'code': code})

    assert response.status_code == 401
    assert response.json() == {'detail': 'Invalid or expired CLI exchange code'}


async def test_a_legacy_code_is_refused_by_the_token_endpoint(
    real_client: AsyncClient, auth_handoff_state_use_case
):
    login_id = await auth_handoff_state_use_case.create_login(
        callback_url=LOOPBACK, state='x'
    )
    code = await auth_handoff_state_use_case.create_exchange_code(
        login_id=login_id, user_id=USER.id
    )
    verifier, _ = _pkce()

    response = await _token(
        real_client,
        grant_type='authorization_code',
        code=code,
        code_verifier=verifier,
        redirect_uri=LOOPBACK,
    )

    assert response.status_code == 400
    assert response.json()['error'] == 'invalid_grant'


# --------------------------------------------------------------------------
# The token endpoint's shape
# --------------------------------------------------------------------------


async def test_an_unknown_grant_is_unsupported_grant_type(
    real_client: AsyncClient, redis_client
):
    response = await _token(real_client, grant_type='password')
    assert response.status_code == 400
    assert response.json()['error'] == 'unsupported_grant_type'


@pytest.mark.parametrize(
    'body',
    [
        {'grant_type': 'authorization_code', 'code': 'c'},
        {'grant_type': 'refresh_token'},
        {'grant_type': DEVICE_GRANT},
        {'code': 'c'},
    ],
)
async def test_a_known_grant_missing_a_field_is_422(
    real_client: AsyncClient, redis_client, body
):
    response = await _token(real_client, **body)
    assert response.status_code == 422


# --------------------------------------------------------------------------
# The refresh_token grant: same value, expiry slid a full window
# --------------------------------------------------------------------------


async def test_refresh_grant_returns_the_same_value_and_slides(
    real_client: AsyncClient, async_engine, redis_client, bound_user
):
    tokens = await open_session(
        async_engine,
        redis_client,
        USER.id,
        client_type='cli',
        sign_in_method='cli_browser',
    )
    soon = int((datetime.now(UTC) + timedelta(hours=1)).timestamp())
    for key in (
        f'applika:session:{tokens.refresh_token}',
        f'applika:session:id:{tokens.session_id}',
    ):
        await redis_client.expireat(key, soon)

    response = await _token(
        real_client,
        grant_type='refresh_token',
        refresh_token=tokens.refresh_token,
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body['refresh_token'] == tokens.refresh_token
    assert body['refresh_expires_in'] == 7 * 86400
    assert decode_token(body['access_token']).get('sid') == str(
        tokens.session_id
    )
    assert (
        await redis_client.ttl(f'applika:session:{tokens.refresh_token}')
        > 6 * 86400
    )


async def test_refresh_grant_with_an_ended_session_is_invalid_grant(
    real_client: AsyncClient, redis_client
):
    response = await _token(
        real_client, grant_type='refresh_token', refresh_token=str(uuid.uuid7())
    )
    assert response.status_code == 400
    assert response.json() == {
        'error': 'invalid_grant',
        'detail': 'Invalid or expired refresh token',
    }


# --------------------------------------------------------------------------
# AC21: applika logout -> POST /auth/revoke
# --------------------------------------------------------------------------


async def test_revoke_ends_the_cli_session_and_is_204_for_any_value_while_redis_is_up(
    real_client: AsyncClient, async_engine, redis_client
):
    tokens = await open_session(
        async_engine,
        redis_client,
        USER.id,
        client_type='cli',
        sign_in_method='cli_browser',
    )

    response = await real_client.post(
        '/auth/revoke', json={'refresh_token': tokens.refresh_token}
    )

    assert response.status_code == 204
    [row] = await _rows(async_engine)
    assert row.end_reason == 'logout'
    after = await real_client.get(
        '/users/me',
        headers={'Authorization': f'Bearer {tokens.access_token}'},
    )
    assert after.status_code == 401
    for value in (tokens.refresh_token, 'not-a-session', str(uuid.uuid7())):
        again = await real_client.post(
            '/auth/revoke', json={'refresh_token': value}
        )
        assert again.status_code == 204
