"""``JobQueue`` bound to taskiq and to the run lock (ADR-0016).

Every call is bounded by a short timeout so an unreachable Redis never
holds an API request; a failure raises, and the caller decides (a WARNING
after a master CV save, a 503 on "run now").
"""

import asyncio

import redis.asyncio as redis

from app.application.services.job_queue import INGEST_LOCK_KEY
from app.worker.tasks import ingest_jobs, recompute_fit

QUEUE_TIMEOUT_SECONDS = 2.0


class TaskiqJobQueue:
    def __init__(self, lock: redis.Redis):
        self.lock = lock

    async def enqueue_ingest(self) -> None:
        async with asyncio.timeout(QUEUE_TIMEOUT_SECONDS):
            await ingest_jobs.kiq()

    async def enqueue_recompute_fit(self, base_cv_id: int) -> None:
        async with asyncio.timeout(QUEUE_TIMEOUT_SECONDS):
            await recompute_fit.kiq(base_cv_id)

    async def ingest_running(self) -> bool:
        async with asyncio.timeout(QUEUE_TIMEOUT_SECONDS):
            return bool(await self.lock.exists(INGEST_LOCK_KEY))
