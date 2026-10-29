"""The live half of a device session, in Redis (KODI-057, ADR-0019).

Redis on ``REDIS_URL`` - the rate limiter's instance - holds two keys per
session, both expiring at the same instant (``EXAT``/``EXPIREAT``):

- ``applika:session:<uuid7>`` -> the session id. The uuid7 is the refresh
  value; a missing key means the session has ended.
- ``applika:session:id:<sid>`` -> hash ``{rk, user_id, last_used_at,
  last_ip}``. ``sid`` is ``user_sessions.id``, the JWT's
  ``sid`` claim; ``rk`` is the refresh value.

Every call is bounded by a timeout. A ``RedisError``, an ``OSError`` or a
timeout raises :class:`SessionServiceUnavailable` - the caller fails closed
(503), never open. The refresh value is never logged.
"""

import asyncio
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime

import redis.asyncio as redis
from redis.exceptions import RedisError

from app.config.logging import logger
from app.core.exceptions import SessionServiceUnavailable

REFRESH_PREFIX = 'applika:session:'
ID_PREFIX = 'applika:session:id:'

# The per-request check (``touch``) runs on every authenticated request, so
# it gets the rate limiter's 0.5 s bound; the rarer calls (sign-in, refresh,
# sign-out, the device list) get a little more room.
TOUCH_TIMEOUT_SECONDS = 0.5
OP_TIMEOUT_SECONDS = 2.0

# A named tuple, not inline in ``except``: see ``app/core/rate_limit.py``.
_TRANSIENT_REDIS_ERRORS = (RedisError, OSError, TimeoutError)

# EXISTS -> HSET in one round trip: a missing key is never re-created by
# the stamp. Answers the session's ``user_id``, or nil when it has ended.
_TOUCH_LUA = """
if redis.call('EXISTS', KEYS[1]) == 0 then
  return false
end
redis.call('HSET', KEYS[1], 'last_used_at', ARGV[1], 'last_ip', ARGV[2])
return redis.call('HGET', KEYS[1], 'user_id')
"""

# Deletes the refresh key the hash points at, then the hash.
_END_LUA = """
local rk = redis.call('HGET', KEYS[1], 'rk')
if rk then
  redis.call('DEL', ARGV[1] .. rk)
end
return redis.call('DEL', KEYS[1])
"""


def refresh_key(refresh_value: str) -> str:
    return f'{REFRESH_PREFIX}{refresh_value}'


def id_key(session_id: int) -> str:
    return f'{ID_PREFIX}{session_id}'


@asynccontextmanager
async def redis_guard(
    operation: str, timeout: float = OP_TIMEOUT_SECONDS
) -> AsyncIterator[None]:
    """Bound a Redis call and turn its failure into
    :class:`SessionServiceUnavailable` (fail closed). Logs the operation and
    the error type only - never a key or a value."""
    try:
        async with asyncio.timeout(timeout):
            yield
    except _TRANSIENT_REDIS_ERRORS as err:
        logger.warning(
            'Session store unavailable',
            extra={
                'extra_data': {
                    'event': 'session_store_unavailable',
                    'operation': operation,
                    'error': type(err).__name__,
                }
            },
        )
        raise SessionServiceUnavailable() from err


@dataclass(frozen=True)
class LiveSession:
    """What Redis knows about one session right now. ``alive`` is False when
    the key has expired or been deleted."""

    alive: bool
    last_used_at: datetime | None = None
    last_ip: str | None = None


def _parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


class SessionStore:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self._touch_script = redis_client.register_script(_TOUCH_LUA)
        self._end_script = redis_client.register_script(_END_LUA)

    async def open(
        self,
        session_id: int,
        user_id: int,
        expires_at: datetime,
        last_ip: str | None,
    ) -> str:
        """Create both keys in one MULTI and answer the new refresh value."""
        refresh_value = str(uuid.uuid7())
        exat = int(expires_at.timestamp())
        async with redis_guard('open'):
            pipe = self.redis.pipeline(transaction=True)
            pipe.set(refresh_key(refresh_value), str(session_id), exat=exat)
            pipe.hset(
                id_key(session_id),
                mapping={
                    'rk': refresh_value,
                    'user_id': str(user_id),
                    'last_used_at': '',
                    'last_ip': last_ip or '',
                },
            )
            pipe.expireat(id_key(session_id), exat)
            await pipe.execute()
        return refresh_value

    async def resolve_refresh(self, refresh_value: str) -> int | None:
        """The session id a refresh value points at, or None."""
        async with redis_guard('resolve_refresh'):
            value = await self.redis.get(refresh_key(refresh_value))
        if value is None:
            return None
        try:
            return int(value)
        except ValueError:
            return None

    async def slide(
        self, session_id: int, refresh_value: str, expires_at: datetime
    ) -> bool:
        """Move both keys' end to ``expires_at``. False when either key was
        already gone."""
        exat = int(expires_at.timestamp())
        async with redis_guard('slide'):
            pipe = self.redis.pipeline(transaction=True)
            pipe.expireat(refresh_key(refresh_value), exat)
            pipe.expireat(id_key(session_id), exat)
            results = await pipe.execute()
        return all(bool(result) for result in results)

    async def touch(
        self, session_id: int, ip: str | None, now: datetime | None = None
    ) -> int | None:
        """Stamp the last use and IP on a live session. Answers the
        session's ``user_id``, or None when the session has ended."""
        stamp = (now or datetime.now(UTC)).isoformat()
        async with redis_guard('touch', TOUCH_TIMEOUT_SECONDS):
            user_id = await self._touch_script(
                keys=[id_key(session_id)], args=[stamp, ip or '']
            )
        if user_id is None:
            return None
        try:
            return int(user_id)
        except ValueError:
            return None

    async def is_legacy(self, session_id: int) -> bool:
        """True for a session opened before ADR-0024: only that release's
        ``open`` wrote ``github_id`` into the hash."""
        async with redis_guard('is_legacy'):
            return bool(
                await self.redis.hexists(id_key(session_id), 'github_id')
            )

    async def end(self, session_id: int) -> None:
        """Delete both keys. A session already gone is a no-op."""
        async with redis_guard('end'):
            await self._end_script(
                keys=[id_key(session_id)], args=[REFRESH_PREFIX]
            )

    async def live_fields(
        self, session_ids: list[int]
    ) -> dict[int, LiveSession]:
        """One pipeline for any number of sessions."""
        if not session_ids:
            return {}
        async with redis_guard('live_fields'):
            pipe = self.redis.pipeline(transaction=False)
            for session_id in session_ids:
                pipe.hmget(
                    id_key(session_id), ['rk', 'last_used_at', 'last_ip']
                )
            rows = await pipe.execute()

        live: dict[int, LiveSession] = {}
        for session_id, (rk, last_used_at, last_ip) in zip(
            session_ids, rows, strict=True
        ):
            if rk is None:
                live[session_id] = LiveSession(alive=False)
                continue
            live[session_id] = LiveSession(
                alive=True,
                last_used_at=_parse_time(last_used_at),
                last_ip=last_ip or None,
            )
        return live

    async def live(self, session_id: int) -> LiveSession:
        return (await self.live_fields([session_id]))[session_id]
