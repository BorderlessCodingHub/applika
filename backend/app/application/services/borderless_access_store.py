"""The Borderless access token, in Redis only (ADR-0026 §6, §8).

One key per user, ``applika:borderless:access:<user_id>``, holding the
access token Fernet-encrypted (``BORDERLESS_TOKEN_ENCRYPTION_KEY``: a dump
of Redis exposes it like a database dump would) and expiring with the
token (``EX expires_in``). Applika never decrypts it and never sends it
anywhere: its presence is the freshness marker. Present → the membership
read is current, no Borderless call; missing or expired → refresh.

Every call is bounded (0.5 s). A ``RedisError``, an ``OSError`` or a
timeout is a WARNING: ``present`` answers ``False`` (the membership is then
read from the database's refresh token, so the gate fails toward a real
Borderless answer), ``put`` and ``drop`` do nothing.
"""

import asyncio

import redis.asyncio as redis
from redis.exceptions import RedisError

from app.config.logging import logger
from app.core.crypto import encrypt_borderless_token

ACCESS_PREFIX = 'applika:borderless:access:'
TIMEOUT_SECONDS = 0.5

_REDIS_ERRORS = (RedisError, OSError, TimeoutError)


def access_key(user_id: int) -> str:
    return f'{ACCESS_PREFIX}{user_id}'


class BorderlessAccessStore:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    async def put(
        self, user_id: int, access_token: str, expires_in: int
    ) -> None:
        ciphertext = encrypt_borderless_token(access_token)
        if ciphertext is None or expires_in <= 0:
            return
        try:
            async with asyncio.timeout(TIMEOUT_SECONDS):
                await self.redis.set(
                    access_key(user_id), ciphertext, ex=int(expires_in)
                )
        except _REDIS_ERRORS as exc:
            logger.warning(
                f'Borderless access store unavailable on put '
                f'({type(exc).__name__})'
            )

    async def present(self, user_id: int) -> bool:
        try:
            async with asyncio.timeout(TIMEOUT_SECONDS):
                return bool(await self.redis.exists(access_key(user_id)))
        except _REDIS_ERRORS as exc:
            logger.warning(
                f'Borderless access store unavailable on read '
                f'({type(exc).__name__})'
            )
            return False

    async def drop(self, user_id: int) -> None:
        try:
            async with asyncio.timeout(TIMEOUT_SECONDS):
                await self.redis.delete(access_key(user_id))
        except _REDIS_ERRORS as exc:
            logger.warning(
                f'Borderless access store unavailable on drop '
                f'({type(exc).__name__})'
            )
