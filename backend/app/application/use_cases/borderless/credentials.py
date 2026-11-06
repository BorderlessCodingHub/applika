"""The credential check shared by sign-in and confirmation (ADR-0024 §4).

A per-email failure counter in Redis is checked before Borderless is
called; a wrong password adds one, a success clears it. Redis failing
fails open. The email is hashed in the key; neither it nor the password is
logged.
"""

import asyncio
import hashlib

import redis.asyncio as redis
from redis.exceptions import RedisError

from app.application.services.borderless_client import (
    BorderlessClient,
    BorderlessInvalidCredentials,
    BorderlessNotConfigured,
    BorderlessRateLimited,
    BorderlessSignIn,
    BorderlessUnavailable,
)
from app.config.logging import logger
from app.config.settings import envs
from app.core.exceptions import (
    BORDERLESS_NOT_CONFIGURED,
    BORDERLESS_UNAVAILABLE,
    EmailUnverified,
    InvalidCredentials,
    ServiceUnavailable,
    SignInRateLimited,
)

_REDIS_TIMEOUT_SECONDS = 0.5
_REDIS_ERRORS = (RedisError, OSError, TimeoutError)


def email_counter_key(email: str) -> str:
    digest = hashlib.sha256(email.strip().lower().encode()).hexdigest()
    return f'applika:borderless:signin:{digest}'


class SignInLimiter:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client
        self.limit = envs.BORDERLESS_SIGNIN_EMAIL_LIMIT
        self.window = envs.BORDERLESS_SIGNIN_EMAIL_WINDOW_SECONDS

    async def check(self, email: str) -> None:
        key = email_counter_key(email)
        try:
            async with asyncio.timeout(_REDIS_TIMEOUT_SECONDS):
                raw = await self.redis.get(key)
                if raw is None or int(raw) < self.limit:
                    return
                ttl = await self.redis.ttl(key)
        except _REDIS_ERRORS:
            logger.warning('Sign-in limiter unavailable')
            return
        raise SignInRateLimited(ttl if ttl and ttl > 0 else self.window)

    async def fail(self, email: str) -> None:
        key = email_counter_key(email)
        try:
            async with asyncio.timeout(_REDIS_TIMEOUT_SECONDS):
                pipe = self.redis.pipeline()
                pipe.incr(key)
                pipe.expire(key, self.window, nx=True)
                await pipe.execute()
        except _REDIS_ERRORS:
            logger.warning('Sign-in limiter unavailable')

    async def clear(self, email: str) -> None:
        try:
            async with asyncio.timeout(_REDIS_TIMEOUT_SECONDS):
                await self.redis.delete(email_counter_key(email))
        except _REDIS_ERRORS:
            logger.warning('Sign-in limiter unavailable')


async def check_credentials(
    limiter: SignInLimiter,
    client: BorderlessClient,
    email: str,
    password: str,
) -> BorderlessSignIn:
    """Borderless's answer for verified credentials, or a refusal."""
    if not client.is_configured():
        raise ServiceUnavailable(BORDERLESS_NOT_CONFIGURED)
    await limiter.check(email)
    try:
        result = await client.sign_in(email, password)
    except BorderlessInvalidCredentials as exc:
        await limiter.fail(email)
        raise InvalidCredentials() from exc
    except BorderlessRateLimited as exc:
        raise SignInRateLimited(exc.retry_after) from exc
    except BorderlessNotConfigured as exc:
        raise ServiceUnavailable(BORDERLESS_NOT_CONFIGURED) from exc
    except BorderlessUnavailable as exc:
        raise ServiceUnavailable(BORDERLESS_UNAVAILABLE) from exc
    await limiter.clear(email)
    if not result.email_verified:
        raise EmailUnverified()
    return result
