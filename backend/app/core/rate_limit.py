"""API rate limiter core logic (KODI-039, ADR-0015): per user with an IP
fallback, fixed window in Redis.

Pure module: no ASGI here. ``app/config/rate_limit.py`` wires this into the
request pipeline.

- ``bucket_for``: an ``/auth/*`` route counts against ``RATE_LIMIT_AUTH``,
  every other route against ``RATE_LIMIT_DEFAULT`` (R-017).
- ``subject_for``: a request whose ``Authorization: Bearer`` header, else
  whose ``__access`` cookie, holds a valid, unexpired access token is
  counted against that token's subject (the user); any other request is
  counted against the client IP (R-016; Bearer first since KODI-057,
  ADR-0019).
- ``hit``: one Redis pipeline (``INCR`` + ``EXPIREAT``) decides whether the
  request is allowed, bounded by a 0.5s timeout so a hanging Redis never
  holds a request open; a failure fails open (returns ``None``) with a
  WARNING that names the bucket only, never the subject (R-021).
"""

import asyncio
import logging
import math
from collections.abc import Mapping
from dataclasses import dataclass

import jwt
import redis.asyncio as redis
from redis.exceptions import RedisError

from app.config.settings import ACCESS_COOKIE_NAME
from app.core.tokens import decode_token

logger = logging.getLogger('app')

_KEY_PREFIX = 'applika:ratelimit'
_HIT_TIMEOUT_SECONDS = 0.5
# A named tuple rather than written inline in the `except` clause below:
# ruff's formatter (preview mode, `[tool.ruff.format] preview = true`,
# targeting this project's Python 3.14) rewrites an inline multi-exception
# tuple there into PEP 758's unparenthesized form (`except A, B, C:` -
# valid new Python 3.14 syntax, not the old Python 2 comma-bind form). Kept
# as a constant purely for readability, not because the rewrite is wrong.
_TRANSIENT_REDIS_ERRORS = (RedisError, OSError, TimeoutError)


def bucket_for(route_path: str) -> str:
    """``/auth/*`` -> ``auth``, everything else -> ``default``."""
    if route_path.startswith('/auth/'):
        return 'auth'
    return 'default'


def _bearer_token(headers: Mapping[str, str]) -> str | None:
    authorization = headers.get('authorization') or ''
    scheme, _, credentials = authorization.partition(' ')
    if scheme.lower() == 'bearer' and credentials.strip():
        return credentials.strip()
    return None


def _token_subject(token: str | None) -> str | None:
    if not token:
        return None
    try:
        payload = decode_token(token)
    except jwt.PyJWTError:
        return None
    if payload.get('kind') == 'access' and payload.get('sub'):
        return payload['sub']
    return None


def subject_for(
    headers: Mapping[str, str],
    cookies: Mapping[str, str],
    client_host: str | None,
) -> str:
    """``user:<sub>`` from a valid Bearer token, else from a valid
    ``__access`` cookie, else ``ip:<host>``. Only the JWT is read: the
    session check is ``get_current_user``'s, the limiter stays a single
    Redis call and fails open."""
    subject = _token_subject(_bearer_token(headers)) or _token_subject(
        cookies.get(ACCESS_COOKIE_NAME)
    )
    if subject:
        return f'user:{subject}'
    return f'ip:{client_host or "unknown"}'


@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int
    remaining: int
    reset_after: int


async def hit(
    redis_client: redis.Redis,
    bucket: str,
    subject: str,
    limit: int,
    window: int,
    now: float,
) -> Decision | None:
    """Count one request in the fixed window, or ``None`` on failure."""
    window_index = int(now // window)
    window_end = (window_index + 1) * window
    key = f'{_KEY_PREFIX}:{bucket}:{subject}:{window_index}'
    reset_after = max(1, math.ceil(window_end - now))

    try:
        async with asyncio.timeout(_HIT_TIMEOUT_SECONDS):
            pipe = redis_client.pipeline()
            pipe.incr(key)
            pipe.expireat(key, window_end + 1)
            count, _ = await pipe.execute()
    except _TRANSIENT_REDIS_ERRORS:
        logger.warning(
            'rate_limit_unavailable',
            extra={
                'extra_data': {
                    'event': 'rate_limit_unavailable',
                    'bucket': bucket,
                }
            },
        )
        return None

    count = int(count)
    allowed = count <= limit
    remaining = max(0, limit - count)
    return Decision(
        allowed=allowed,
        limit=limit,
        remaining=remaining,
        reset_after=reset_after,
    )
