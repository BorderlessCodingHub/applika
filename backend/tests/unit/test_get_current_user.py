"""The session check on every signed-in request (KODI-057, ADR-0019).

JWT first, as before; then ``sid`` must name a live session (else 401
``Session expired``); a session store failure is a 503 and never lets the
request through. ``get_current_user`` reads the Bearer header before the
cookie.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, cast
from unittest.mock import AsyncMock

import jwt
import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from redis.exceptions import ConnectionError as RedisConnectionError
from starlette.requests import Request

from app.application.services import session_store as store_module
from app.application.services.session_store import SessionStore
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.settings import envs
from app.core.exceptions import SessionServiceUnavailable
from app.core.tokens import create_access_token
from app.presentation.dependencies import get_current_user
from tests.unit.conftest import make_user

SID = 7700000000000000001


def _make_token(
    sub: str, expired: bool = False, sid: str | None = str(SID)
) -> str:
    exp = datetime.now(timezone.utc) + (
        timedelta(minutes=-5) if expired else timedelta(minutes=15)
    )
    payload: dict[str, Any] = {'sub': sub, 'kind': 'access', 'exp': exp}
    if sid is not None:
        payload['sid'] = sid
    return jwt.encode(payload, envs.JWT_SECRET, algorithm=envs.JWT_ALGORITHM)


class FakeStore:
    """``touch`` answers the session's github_id, None when it is gone, or
    raises ``fail``."""

    def __init__(
        self, github_id: int | None = 12345, fail: Exception | None = None
    ):
        self.github_id = github_id
        self.fail = fail
        self.touched: list[tuple[int, str | None]] = []

    async def touch(self, session_id, ip, now=None):
        self.touched.append((session_id, ip))
        if self.fail is not None:
            raise self.fail
        return self.github_id


def _use_case(repo=None, store=None) -> GetCurrentUserUseCase:
    return GetCurrentUserUseCase(
        repo or AsyncMock(), cast(SessionStore, store or FakeStore())
    )


def _user_repo():
    repo = AsyncMock()
    repo.get_by_github_id.return_value = make_user(github_id=12345)
    return repo


# --- JWT, as before ---


async def test_no_token_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        await _use_case().execute(None)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Not authenticated'


async def test_empty_token_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        await _use_case().execute('')
    assert exc_info.value.status_code == 401


async def test_invalid_token_raises_401():
    with pytest.raises(HTTPException) as exc_info:
        await _use_case().execute('invalid.jwt.token')
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Invalid token'


async def test_expired_token_raises_401_before_the_store():
    store = FakeStore()
    with pytest.raises(HTTPException) as exc_info:
        await _use_case(store=store).execute(_make_token('12345', True))
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Token expired'
    assert store.touched == []


async def test_token_without_sub_raises_401():
    token = jwt.encode(
        {
            'kind': 'access',
            'sid': str(SID),
            'exp': datetime.now(timezone.utc) + timedelta(minutes=15),
        },
        envs.JWT_SECRET,
        algorithm=envs.JWT_ALGORITHM,
    )
    with pytest.raises(HTTPException) as exc_info:
        await _use_case().execute(token)
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Invalid token payload'


# --- the session check ---


async def test_token_without_sid_is_session_expired():
    """A token minted before KODI-057 carries no ``sid``: everyone signs in
    again at the release (AC22)."""
    store = FakeStore()
    with pytest.raises(HTTPException) as exc_info:
        await _use_case(_user_repo(), store).execute(
            _make_token('12345', sid=None)
        )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Session expired'
    assert store.touched == []


async def test_non_numeric_sid_is_session_expired():
    with pytest.raises(HTTPException) as exc_info:
        await _use_case(_user_repo()).execute(
            _make_token('12345', sid='0190a1b2-uuid')
        )
    assert exc_info.value.detail == 'Session expired'


async def test_touch_miss_is_session_expired():
    """The session's key is gone (revoked, signed out, expired)."""
    repo = _user_repo()
    with pytest.raises(HTTPException) as exc_info:
        await _use_case(repo, FakeStore(github_id=None)).execute(
            _make_token('12345')
        )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Session expired'
    repo.get_by_github_id.assert_not_called()


async def test_session_of_another_github_id_is_session_expired():
    with pytest.raises(HTTPException) as exc_info:
        await _use_case(_user_repo(), FakeStore(github_id=999)).execute(
            _make_token('12345')
        )
    assert exc_info.value.detail == 'Session expired'


async def test_store_error_is_503_and_never_the_user():
    repo = _user_repo()
    store = FakeStore(fail=SessionServiceUnavailable())
    with pytest.raises(SessionServiceUnavailable):
        await _use_case(repo, store).execute(_make_token('12345'))
    repo.get_by_github_id.assert_not_called()


async def test_valid_session_returns_the_user_and_its_session():
    repo = _user_repo()
    store = FakeStore()
    result = await _use_case(repo, store).execute(
        _make_token('12345'), '198.51.100.4'
    )
    assert result.user.id == 1
    assert result.user.username == 'testuser'
    assert result.session_id == SID
    assert store.touched == [(SID, '198.51.100.4')]
    repo.get_by_github_id.assert_called_once_with(12345)


async def test_valid_session_user_not_found():
    repo = AsyncMock()
    repo.get_by_github_id.return_value = None
    with pytest.raises(HTTPException) as exc_info:
        await _use_case(repo).execute(_make_token('12345'))
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'User not found'


# --- the real SessionStore fails closed ---


class _ScriptRedis:
    """A Redis stand-in whose scripts raise or hang."""

    def __init__(self, behaviour):
        self.behaviour = behaviour

    def register_script(self, _source):
        async def run(keys, args):
            return await self.behaviour()

        return run


async def test_redis_error_on_touch_is_session_service_unavailable():
    async def boom():
        raise RedisConnectionError('down')

    store = SessionStore(cast(Any, _ScriptRedis(boom)))
    repo = _user_repo()
    with pytest.raises(SessionServiceUnavailable) as exc_info:
        await _use_case(repo, store).execute(_make_token('12345'))
    assert exc_info.value.message == 'Session service unavailable'
    repo.get_by_github_id.assert_not_called()


async def test_oserror_on_touch_is_session_service_unavailable():
    async def boom():
        raise OSError('connection reset')

    store = SessionStore(cast(Any, _ScriptRedis(boom)))
    with pytest.raises(SessionServiceUnavailable):
        await _use_case(_user_repo(), store).execute(_make_token('12345'))


async def test_hanging_redis_times_out_into_503(monkeypatch):
    monkeypatch.setattr(store_module, 'TOUCH_TIMEOUT_SECONDS', 0.05)

    async def hang():
        await asyncio.sleep(5)

    store = SessionStore(cast(Any, _ScriptRedis(hang)))
    repo = _user_repo()
    with pytest.raises(SessionServiceUnavailable):
        await _use_case(repo, store).execute(_make_token('12345'))
    repo.get_by_github_id.assert_not_called()


# --- get_current_user: Bearer before the cookie ---


def _request() -> Request:
    return Request({
        'type': 'http',
        'method': 'GET',
        'path': '/users/me',
        'headers': [],
        'client': ('192.0.2.10', 4000),
    })


class _RecordingStore(FakeStore):
    def __init__(self, sessions: dict[int, int]):
        super().__init__()
        self.sessions = sessions

    async def touch(self, session_id, ip, now=None):
        self.touched.append((session_id, ip))
        return self.sessions.get(session_id)


async def test_bearer_is_read_before_the_cookie():
    bearer, _, _ = create_access_token('12345', '11')
    cookie, _, _ = create_access_token('12345', '22')
    store = _RecordingStore({11: 12345, 22: 12345})
    request = _request()

    user = await get_current_user(
        request,
        _user_repo(),
        cast(SessionStore, store),
        HTTPAuthorizationCredentials(scheme='Bearer', credentials=bearer),
        cookie,
    )

    assert user.github_id == 12345
    assert store.touched == [(11, '192.0.2.10')]
    assert request.state.session_id == 11


async def test_cookie_is_used_without_bearer():
    cookie, _, _ = create_access_token('12345', '22')
    store = _RecordingStore({22: 12345})
    request = _request()

    await get_current_user(
        request, _user_repo(), cast(SessionStore, store), None, cookie
    )

    assert store.touched == [(22, '192.0.2.10')]
    assert request.state.session_id == 22


async def test_neither_bearer_nor_cookie_is_not_authenticated():
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user(
            _request(),
            _user_repo(),
            cast(SessionStore, FakeStore()),
            None,
            None,
        )
    assert exc_info.value.status_code == 401
    assert exc_info.value.detail == 'Not authenticated'


def test_the_session_check_is_bounded_by_half_a_second():
    """ADR-0019: the per-request touch runs under ``asyncio.timeout(0.5)``,
    the rate limiter's bound."""
    assert store_module.TOUCH_TIMEOUT_SECONDS == 0.5
