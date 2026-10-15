"""A device session from sign-in to its end (KODI-057, ADR-0019).

Real Postgres (``user_sessions``) and real Redis (``redis_client``), the
REAL ``get_current_user`` (``real_client``). Covers: the web callback opens
a row and both keys; refresh slides both keys' TTL, ``expires_at`` and the
``__refresh`` Max-Age without rotating; logout; a revoked session is refused
on its next request; a JWT without ``sid`` and a pre-KODI-057 refresh key
are refused; signing in again replaces the browser's session; a GitHub
revocation ends it; a lost key reads as expired; the live last use is copied
to the row on refresh and on end; Redis down is a 503, never a pass.
"""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
import redis.asyncio as redis
from cryptography.fernet import Fernet
from fastapi.responses import RedirectResponse
from fastapi_sso import OpenID
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker

from app.config.redis import get_redis
from app.config.settings import (
    ACCESS_COOKIE_NAME,
    REFRESH_COOKIE_NAME,
    envs,
)
from app.core.crypto import encrypt_token
from app.core.tokens import decode_token
from app.domain.models import UserModel, UserSessionModel
from app.main import app as main_app
from app.presentation.api import oauth as oauth_api
from tests.base_db_setup import base_data
from tests.sessions_seed import BROWSER_USER_AGENT, open_session

USER = base_data()['user']
ADMIN = base_data()['admin_user']
WINDOW = 7 * 86400
CHROME_WINDOWS = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
)


class FakeGithubSSO:
    """GitHub OAuth without GitHub: signs ``github_id`` in."""

    def __init__(self, github_id: int, username: str, email: str):
        self.openid = OpenID(
            id=str(github_id),
            display_name=username,
            email=email,
            provider='github',
        )
        self.oauth_client = type(
            'Client', (), {'token': {'access_token': 'gh-token'}}
        )()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc_info):
        return False

    async def get_login_redirect(self):
        return RedirectResponse('https://github.com/login/oauth/authorize')

    async def verify_and_process(self, request):
        return self.openid


@pytest.fixture
def github_sign_in(monkeypatch, github_service):
    monkeypatch.setattr(
        envs, 'GITHUB_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    monkeypatch.setattr(
        oauth_api,
        'github_sso',
        FakeGithubSSO(USER.github_id, USER.username, USER.email),
    )
    return github_service


async def _row(engine: AsyncEngine, session_id: int) -> UserSessionModel:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        row = await session.get(UserSessionModel, session_id)
        assert row is not None
        return row


async def _rows(engine: AsyncEngine, user_id: int) -> list[UserSessionModel]:
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        result = await session.scalars(
            select(UserSessionModel)
            .where(UserSessionModel.user_id == user_id)
            .order_by(UserSessionModel.created_at)
        )
        return list(result.all())


async def _set_row(engine: AsyncEngine, session_id: int, **values: Any):
    maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with maker() as session:
        await session.execute(
            update(UserSessionModel)
            .where(UserSessionModel.id == session_id)
            .values(**values)
        )
        await session.commit()


def _bearer(token: str) -> dict[str, str]:
    return {'Authorization': f'Bearer {token}'}


def _set_cookie(response, name: str) -> str | None:
    for header in response.headers.get_list('set-cookie'):
        if header.startswith(f'{name}='):
            return header
    return None


def _keys(refresh_value: str, session_id: int) -> tuple[str, str]:
    return (
        f'applika:session:{refresh_value}',
        f'applika:session:id:{session_id}',
    )


# --------------------------------------------------------------------------
# AC1 / AC2 / AC6: the web callback opens one session (row + keys)
# --------------------------------------------------------------------------


async def test_callback_opens_a_web_session_with_row_and_keys(
    real_client: AsyncClient, async_engine, redis_client, github_sign_in
):
    response = await real_client.get(
        '/auth/github/callback',
        headers={'User-Agent': BROWSER_USER_AGENT},
        follow_redirects=False,
    )
    assert response.status_code == 307

    access = response.cookies.get(ACCESS_COOKIE_NAME)
    refresh_value = response.cookies.get(REFRESH_COOKIE_NAME)
    assert access
    assert refresh_value
    assert uuid.UUID(refresh_value).version == 7
    refresh_cookie = _set_cookie(response, REFRESH_COOKIE_NAME)
    assert refresh_cookie is not None
    assert f'Max-Age={WINDOW}' in refresh_cookie
    assert 'HttpOnly' in refresh_cookie

    payload = decode_token(access)
    assert payload['sub'] == str(USER.github_id)
    session_id = int(payload.get('sid', '0'))

    [row] = await _rows(async_engine, USER.id)
    assert row.id == session_id
    assert (row.client_type, row.sign_in_method) == ('web', 'github_web')
    assert row.device_name == 'Chrome on macOS'
    assert row.user_agent == BROWSER_USER_AGENT
    assert row.created_ip == row.last_ip == '127.0.0.1'
    assert row.ended_at is None
    assert row.end_reason is None
    assert row.last_used_at is None
    now = datetime.now(UTC)
    assert (
        abs((row.expires_at - (now + timedelta(days=7))).total_seconds()) < 60
    )

    refresh_key, id_key = _keys(refresh_value, session_id)
    assert await redis_client.get(refresh_key) == str(session_id)
    session_hash = await redis_client.hgetall(id_key)
    assert session_hash['rk'] == refresh_value
    assert session_hash['user_id'] == str(USER.id)
    assert session_hash['github_id'] == str(USER.github_id)
    # Both keys end at the same instant, a full window ahead.
    ttl_refresh = await redis_client.ttl(refresh_key)
    ttl_id = await redis_client.ttl(id_key)
    assert WINDOW - 60 < ttl_refresh <= WINDOW
    assert abs(ttl_refresh - ttl_id) <= 1
    # AC3: the access token stays a short-lived JWT.
    assert payload['kind'] == 'access'
    assert (
        int(jwt.decode(access, options={'verify_signature': False})['exp'])
        - now.timestamp()
        <= envs.ACCESS_TOKEN_EXPIRE_MINUTES * 60 + 5
    )

    # The cookie session is accepted.
    me = await real_client.get(
        '/users/me', cookies={ACCESS_COOKIE_NAME: access}
    )
    assert me.status_code == 200
    assert me.json()['username'] == USER.username


async def test_no_refresh_value_or_hash_reaches_postgres(
    real_client: AsyncClient, async_engine, redis_client, github_sign_in
):
    response = await real_client.get(
        '/auth/github/callback', follow_redirects=False
    )
    refresh_value = response.cookies.get(REFRESH_COOKIE_NAME)
    [row] = await _rows(async_engine, USER.id)
    stored = ' '.join(
        str(getattr(row, column.key))
        for column in UserSessionModel.__table__.columns
    )
    assert refresh_value
    assert refresh_value not in stored
    assert refresh_value.replace('-', '') not in stored


# --------------------------------------------------------------------------
# AC1 edge case: signing in again in the same browser replaces its session
# --------------------------------------------------------------------------


async def test_signing_in_again_replaces_the_browsers_session(
    real_client: AsyncClient, async_engine, redis_client, github_sign_in
):
    first = await real_client.get(
        '/auth/github/callback', follow_redirects=False
    )
    first_refresh = first.cookies.get(REFRESH_COOKIE_NAME)
    first_access = first.cookies.get(ACCESS_COOKIE_NAME)
    assert first_refresh
    assert first_access
    first_id = int(decode_token(first_access).get('sid', '0'))

    second = await real_client.get(
        '/auth/github/callback',
        cookies={REFRESH_COOKIE_NAME: first_refresh},
        follow_redirects=False,
    )
    assert second.status_code == 307

    old = await _row(async_engine, first_id)
    assert old.end_reason == 'replaced'
    assert old.ended_at is not None
    assert await redis_client.exists(*_keys(first_refresh, first_id)) == 0
    rows = await _rows(async_engine, USER.id)
    assert len(rows) == 2
    assert rows[1].ended_at is None

    stale = await real_client.get(
        '/users/me', cookies={ACCESS_COOKIE_NAME: first_access}
    )
    assert stale.status_code == 401
    assert stale.json()['detail'] == 'Session expired'


async def test_another_users_refresh_cookie_is_not_replaced(
    real_client: AsyncClient, async_engine, redis_client, github_sign_in
):
    admin_session = await open_session(
        async_engine, redis_client, ADMIN.id, ADMIN.github_id
    )

    response = await real_client.get(
        '/auth/github/callback',
        cookies={REFRESH_COOKIE_NAME: admin_session.refresh_token},
        follow_redirects=False,
    )
    assert response.status_code == 307

    admin_row = await _row(async_engine, admin_session.session_id)
    assert admin_row.ended_at is None
    assert (
        await redis_client.exists(
            *_keys(admin_session.refresh_token, admin_session.session_id)
        )
        == 2
    )


# --------------------------------------------------------------------------
# AC4: refresh slides the session, never rotates it
# --------------------------------------------------------------------------


async def test_refresh_slides_both_keys_the_row_and_the_cookie(
    real_client: AsyncClient, async_engine, redis_client, github_service
):
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    refresh_key, id_key = _keys(tokens.refresh_token, tokens.session_id)
    soon = datetime.now(UTC) + timedelta(hours=1)
    await redis_client.expireat(refresh_key, int(soon.timestamp()))
    await redis_client.expireat(id_key, int(soon.timestamp()))
    await _set_row(async_engine, tokens.session_id, expires_at=soon)

    response = await real_client.get(
        '/auth/refresh',
        cookies={REFRESH_COOKIE_NAME: tokens.refresh_token},
    )

    assert response.status_code == 200
    assert response.json() == {'detail': 'Token refreshed'}
    # Same value, full Max-Age: the refresh value is never rotated.
    refresh_cookie = _set_cookie(response, REFRESH_COOKIE_NAME)
    assert refresh_cookie is not None
    assert refresh_cookie.startswith(
        f'{REFRESH_COOKIE_NAME}={tokens.refresh_token};'
    )
    assert f'Max-Age={WINDOW}' in refresh_cookie
    access = response.cookies.get(ACCESS_COOKIE_NAME)
    assert access is not None
    assert decode_token(access).get('sid') == str(tokens.session_id)

    for key in (refresh_key, id_key):
        assert WINDOW - 60 < await redis_client.ttl(key) <= WINDOW
    row = await _row(async_engine, tokens.session_id)
    expected = datetime.now(UTC) + timedelta(days=7)
    assert abs((row.expires_at - expected).total_seconds()) < 60


async def test_refresh_copies_the_live_last_use_onto_the_row(
    real_client: AsyncClient, async_engine, redis_client, github_service
):
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    used = await real_client.get(
        '/users/me', headers=_bearer(tokens.access_token)
    )
    assert used.status_code == 200
    live = await redis_client.hgetall(f'applika:session:id:{tokens.session_id}')
    assert live['last_used_at']
    assert live['last_ip'] == '127.0.0.1'

    before = await _row(async_engine, tokens.session_id)
    assert before.last_used_at is None

    await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )

    row = await _row(async_engine, tokens.session_id)
    assert row.last_used_at == datetime.fromisoformat(live['last_used_at'])
    assert row.last_ip == '127.0.0.1'


async def test_refresh_without_a_cookie_is_401(real_client: AsyncClient):
    response = await real_client.get('/auth/refresh')
    assert response.status_code == 401
    assert response.json() == {'detail': 'Not authenticated'}


# --------------------------------------------------------------------------
# AC22 / R-023: a pre-KODI-057 refresh key or JWT is refused
# --------------------------------------------------------------------------


async def test_a_legacy_uuid4_refresh_key_is_refused(
    real_client: AsyncClient, redis_client
):
    legacy = str(uuid.uuid4())
    await redis_client.set(
        f'applika:refresh_token:{legacy}', str(USER.id), ex=3600
    )

    response = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: legacy}
    )

    assert response.status_code == 401
    assert response.json() == {'detail': 'Invalid or expired refresh token'}
    # A refused refresh clears both cookies.
    assert _set_cookie(response, ACCESS_COOKIE_NAME) is not None
    assert _set_cookie(response, REFRESH_COOKIE_NAME) is not None
    # Nothing reads, and nothing deletes, the old key: it dies on its TTL.
    assert await redis_client.get(f'applika:refresh_token:{legacy}') == str(
        USER.id
    )


async def test_a_jwt_without_sid_is_session_expired(
    real_client: AsyncClient,
):
    token = jwt.encode(
        {
            'sub': str(USER.github_id),
            'kind': 'access',
            'exp': datetime.now(UTC) + timedelta(minutes=10),
        },
        envs.JWT_SECRET,
        algorithm=envs.JWT_ALGORITHM,
    )
    for response in (
        await real_client.get('/users/me', cookies={ACCESS_COOKIE_NAME: token}),
        await real_client.get('/users/me', headers=_bearer(token)),
    ):
        assert response.status_code == 401
        assert response.json() == {'detail': 'Session expired'}


async def test_no_credentials_is_not_authenticated(real_client: AsyncClient):
    response = await real_client.get('/users/me')
    assert response.status_code == 401
    assert response.json() == {'detail': 'Not authenticated'}


# --------------------------------------------------------------------------
# AC5 / AC11 / AC21: an ended session is refused on its next request
# --------------------------------------------------------------------------


async def test_logout_ends_the_session(
    real_client: AsyncClient, async_engine, redis_client
):
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )

    response = await real_client.get(
        '/auth/logout', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )

    assert response.status_code == 200
    assert response.json() == {'detail': 'Logged out'}
    assert _set_cookie(response, ACCESS_COOKIE_NAME) is not None
    assert _set_cookie(response, REFRESH_COOKIE_NAME) is not None
    row = await _row(async_engine, tokens.session_id)
    assert row.end_reason == 'logout'
    assert row.ended_at is not None
    assert (
        await redis_client.exists(
            *_keys(tokens.refresh_token, tokens.session_id)
        )
        == 0
    )

    after = await real_client.get(
        '/users/me', headers=_bearer(tokens.access_token)
    )
    assert after.status_code == 401
    assert after.json() == {'detail': 'Session expired'}
    refresh = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )
    assert refresh.status_code == 401


async def test_logout_without_a_session_still_clears_cookies(
    real_client: AsyncClient,
):
    response = await real_client.get('/auth/logout')
    assert response.status_code == 200
    assert _set_cookie(response, ACCESS_COOKIE_NAME) is not None


async def test_a_revoked_device_is_refused_on_its_next_request(
    real_client: AsyncClient, async_engine, redis_client
):
    laptop = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    phone = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    assert (
        await real_client.get('/users/me', headers=_bearer(phone.access_token))
    ).status_code == 200

    revoked = await real_client.delete(
        f'/users/me/sessions/{phone.session_id}',
        headers=_bearer(laptop.access_token),
    )
    assert revoked.status_code == 204

    refused = await real_client.get(
        '/users/me', headers=_bearer(phone.access_token)
    )
    assert refused.status_code == 401
    assert refused.json() == {'detail': 'Session expired'}
    # Refreshing the revoked device fails too; the laptop is untouched.
    assert (
        await real_client.get(
            '/auth/refresh',
            cookies={REFRESH_COOKIE_NAME: phone.refresh_token},
        )
    ).status_code == 401
    assert (
        await real_client.get('/users/me', headers=_bearer(laptop.access_token))
    ).status_code == 200


async def test_ending_a_session_copies_its_last_use(
    real_client: AsyncClient, async_engine, redis_client
):
    laptop = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    phone = await open_session(
        async_engine, redis_client, USER.id, USER.github_id, ip=None
    )
    await real_client.get('/users/me', headers=_bearer(phone.access_token))
    live = await redis_client.hgetall(f'applika:session:id:{phone.session_id}')

    await real_client.delete(
        f'/users/me/sessions/{phone.session_id}',
        headers=_bearer(laptop.access_token),
    )

    row = await _row(async_engine, phone.session_id)
    assert row.end_reason == 'revoked'
    assert row.last_used_at == datetime.fromisoformat(live['last_used_at'])
    assert row.last_ip == '127.0.0.1'


# --------------------------------------------------------------------------
# AC7: GitHub revoked the token -> the session ends
# --------------------------------------------------------------------------


async def test_github_revocation_ends_the_session_on_refresh(
    real_client: AsyncClient,
    async_engine,
    redis_client,
    github_service,
    monkeypatch,
):
    monkeypatch.setattr(
        envs, 'GITHUB_TOKEN_ENCRYPTION_KEY', Fernet.generate_key().decode()
    )
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    async with maker() as session:
        await session.execute(
            update(UserModel)
            .where(UserModel.id == USER.id)
            .values(encrypted_github_token=encrypt_token('gh-token'))
        )
        await session.commit()
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )

    ok = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )
    assert ok.status_code == 200
    assert github_service.validated == [USER.id]

    github_service.valid = False
    refused = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )

    assert refused.status_code == 401
    assert refused.json() == {'detail': 'GitHub token revoked'}
    row = await _row(async_engine, tokens.session_id)
    assert row.end_reason == 'github_revoked'
    assert (
        await redis_client.exists(
            *_keys(tokens.refresh_token, tokens.session_id)
        )
        == 0
    )
    after = await real_client.get(
        '/users/me', headers=_bearer(tokens.access_token)
    )
    assert after.status_code == 401


# --------------------------------------------------------------------------
# AC4: a lost key is an ended session
# --------------------------------------------------------------------------


async def test_a_lost_key_reads_as_expired_and_cannot_refresh(
    real_client: AsyncClient, async_engine, redis_client, github_service
):
    current = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    lost = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    await redis_client.delete(*_keys(lost.refresh_token, lost.session_id))

    listed = await real_client.get(
        '/users/me/sessions', headers=_bearer(current.access_token)
    )
    by_id = {item['id']: item for item in listed.json()}
    assert by_id[str(lost.session_id)]['status'] == 'expired'
    assert by_id[str(current.session_id)]['status'] == 'active'

    assert (
        await real_client.get('/users/me', headers=_bearer(lost.access_token))
    ).status_code == 401
    assert (
        await real_client.get(
            '/auth/refresh', cookies={REFRESH_COOKIE_NAME: lost.refresh_token}
        )
    ).status_code == 401
    # Reading never writes: the row is still open, shown as expired.
    assert (await _row(async_engine, lost.session_id)).ended_at is None


async def test_a_session_past_its_end_cannot_be_used_once_redis_drops_it(
    real_client: AsyncClient, async_engine, redis_client
):
    """Redis expires both keys at ``expires_at`` (EXAT): simulate the
    moment by expiring them now."""
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    for key in _keys(tokens.refresh_token, tokens.session_id):
        await redis_client.expireat(key, int(datetime.now(UTC).timestamp()) - 1)

    response = await real_client.get(
        '/users/me', headers=_bearer(tokens.access_token)
    )
    assert response.status_code == 401
    assert response.json() == {'detail': 'Session expired'}


# --------------------------------------------------------------------------
# AC5: Redis down -> 503 + Retry-After, nobody signed out, nothing passes
# --------------------------------------------------------------------------


@pytest.fixture
async def redis_down(redis_client):
    """``get_redis`` answers a client to a port nothing listens on."""
    dead = redis.from_url(
        'redis://127.0.0.1:1/0',
        decode_responses=True,
        socket_connect_timeout=0.2,
    )

    async def override():
        return dead

    main_app.dependency_overrides[get_redis] = override
    yield
    await dead.aclose()


async def test_redis_down_is_503_on_an_authenticated_route(
    real_client: AsyncClient, async_engine, redis_client, redis_down
):
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )

    for response in (
        await real_client.get(
            '/users/me', headers=_bearer(tokens.access_token)
        ),
        await real_client.get(
            '/users/me', cookies={ACCESS_COOKIE_NAME: tokens.access_token}
        ),
    ):
        assert response.status_code == 503
        assert response.json() == {'detail': 'Session service unavailable'}
        assert response.headers['Retry-After'] == '5'
        # Nobody is signed out: no cookie is cleared.
        assert _set_cookie(response, ACCESS_COOKIE_NAME) is None

    # The session itself survived the outage.
    assert (
        await redis_client.exists(
            *_keys(tokens.refresh_token, tokens.session_id)
        )
        == 2
    )


async def test_redis_down_is_503_on_refresh_and_keeps_the_cookies(
    real_client: AsyncClient, async_engine, redis_client, redis_down
):
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )

    response = await real_client.get(
        '/auth/refresh', cookies={REFRESH_COOKIE_NAME: tokens.refresh_token}
    )

    assert response.status_code == 503
    assert response.json() == {'detail': 'Session service unavailable'}
    assert response.headers['Retry-After'] == '5'
    assert _set_cookie(response, REFRESH_COOKIE_NAME) is None
    assert _set_cookie(response, ACCESS_COOKIE_NAME) is None


async def test_a_revoked_session_stays_refused_during_an_outage(
    real_client: AsyncClient, async_engine, redis_client, redis_down
):
    """Fail closed: during the outage the revoked device gets a 503, not a
    200 - the check never lets a request through unchecked."""
    tokens = await open_session(
        async_engine, redis_client, USER.id, USER.github_id
    )
    await redis_client.delete(*_keys(tokens.refresh_token, tokens.session_id))

    response = await real_client.get(
        '/users/me', headers=_bearer(tokens.access_token)
    )
    assert response.status_code == 503
