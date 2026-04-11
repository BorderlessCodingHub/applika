"""Redis client configuration.

Provides an async Redis client for caching GitHub token validation
and organization membership checks.
"""

import redis.asyncio as redis

from app.config.settings import envs

redis_client = redis.from_url(
    envs.REDIS_URL,
    decode_responses=True,
)


async def get_redis() -> redis.Redis:
    return redis_client
