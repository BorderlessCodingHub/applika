"""What the MCP adapter takes from the outside: the database session, the
Redis client and the worker queue. ``/mcp`` has no FastAPI dependency
injection, so tests swap these attributes instead of overriding
dependencies."""

from collections.abc import Callable
from dataclasses import dataclass

import redis.asyncio as redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.services.job_queue import JobQueue
from app.config.db import AsyncLocalSession
from app.config.redis import redis_client
from app.worker.queue import TaskiqJobQueue


def _redis() -> redis.Redis:
    return redis_client


@dataclass
class McpDeps:
    session_factory: Callable[[], AsyncSession]
    redis_factory: Callable[[], redis.Redis]
    job_queue_factory: Callable[[redis.Redis], JobQueue]


deps = McpDeps(
    session_factory=AsyncLocalSession,
    redis_factory=_redis,
    job_queue_factory=TaskiqJobQueue,
)
