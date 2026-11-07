"""One Borderless sign-in attempt, in Redis (ADR-0026 §3).

``create`` draws a fresh ``state``, a browser binding, a PKCE verifier and
a ``nonce`` (``secrets.token_urlsafe(32)`` each) and stores, at
``applika:borderless:login:<state>`` for ``BORDERLESS_LOGIN_TTL_SECONDS``,
the binding's SHA-256, the verifier, the nonce, the flow (``web`` or
``cli``) and the CLI login id. The binding goes to the browser in an
HttpOnly cookie; the verifier and the nonce never leave Redis.

``consume`` is single use (``GETDEL``): the record is spent whatever the
outcome, and it answers only when the cookie's hash matches. A replay, a
second browser, an expired attempt or an older attempt overwritten in the
browser by a newer one all answer ``None``.
"""

import asyncio
import hashlib
import hmac
import json
import secrets
from dataclasses import dataclass, field
from typing import Literal

import redis.asyncio as redis
from redis.exceptions import RedisError

from app.config.settings import envs
from app.core.exceptions import SessionServiceUnavailable

LOGIN_PREFIX = 'applika:borderless:login:'
REDIS_TIMEOUT_SECONDS = 2.0
# Redis down fails closed, like the session store: 503 AUTH-1003.
_REDIS_ERRORS = (RedisError, OSError, TimeoutError)

Flow = Literal['web', 'cli']


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@dataclass(frozen=True)
class LoginAttempt:
    """What ``create`` hands back: the state and the challenge go to
    Borderless, the binding to the browser's cookie."""

    state: str = field(repr=False)
    binding: str = field(repr=False)
    verifier: str = field(repr=False)
    nonce: str = field(repr=False)


@dataclass(frozen=True)
class LoginRecord:
    """What the callback gets back for a matching state and cookie."""

    flow: Flow
    cli_login_id: str | None
    verifier: str = field(repr=False)
    nonce: str = field(repr=False)


class BorderlessLoginStateUseCase:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def create(
        self, flow: Flow, cli_login_id: str | None = None
    ) -> LoginAttempt:
        attempt = LoginAttempt(
            state=secrets.token_urlsafe(32),
            binding=secrets.token_urlsafe(32),
            verifier=secrets.token_urlsafe(32),
            nonce=secrets.token_urlsafe(32),
        )
        record = {
            'binding_sha256': _sha256(attempt.binding),
            'verifier': attempt.verifier,
            'nonce': attempt.nonce,
            'flow': flow,
            'cli_login_id': cli_login_id,
        }
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                await self.redis.set(
                    f'{LOGIN_PREFIX}{attempt.state}',
                    json.dumps(record),
                    ex=envs.BORDERLESS_LOGIN_TTL_SECONDS,
                )
        except _REDIS_ERRORS as exc:
            raise SessionServiceUnavailable() from exc
        return attempt

    async def consume(
        self, state: str | None, binding: str | None
    ) -> LoginRecord | None:
        if not state or not binding:
            return None
        try:
            async with asyncio.timeout(REDIS_TIMEOUT_SECONDS):
                raw = await self.redis.getdel(f'{LOGIN_PREFIX}{state}')
        except _REDIS_ERRORS as exc:
            raise SessionServiceUnavailable() from exc
        if raw is None:
            return None
        try:
            record = json.loads(raw)
            expected = str(record['binding_sha256'])
            flow = record['flow']
            verifier = str(record['verifier'])
            nonce = str(record['nonce'])
        except ValueError, KeyError, TypeError:
            return None
        if not hmac.compare_digest(expected, _sha256(binding)):
            return None
        if flow not in ('web', 'cli'):
            return None
        cli_login_id = record.get('cli_login_id')
        return LoginRecord(
            flow=flow,
            cli_login_id=cli_login_id
            if isinstance(cli_login_id, str)
            else None,
            verifier=verifier,
            nonce=nonce,
        )
