"""The background tasks (ADR-0016): thin wrappers around the use cases.

- ``ingest_jobs`` runs on the ``JOBS_INGEST_CRON`` schedule and on demand
  (``POST /admin/jobs/runs``). It takes the Redis lock
  ``applika:jobs:ingest:lock`` with ``SET NX EX JOBS_INGEST_LOCK_SECONDS``;
  when another run holds it, it logs and returns (R-009). The lock is
  released in ``finally``, only by the run that holds it.
- ``recompute_fit(base_cv_id)`` rescores one master CV after a save.

Each task opens its own session from ``AsyncLocalSession`` and never shares
a request's. Neither imports an application, CV copy or saved search
repository: the worker writes jobs, sources and fit scores only (PRD 0012).
"""

import uuid
from collections.abc import Callable, Mapping
from contextlib import AbstractAsyncContextManager

import redis.asyncio as redis
from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.job import FitRecomputeDTO, IngestRunDTO
from app.application.services.job_ingestion.scrapers.base import BaseScraper
from app.application.services.job_ingestion.scrapers.registry import (
    build_registry,
)
from app.application.services.job_queue import INGEST_LOCK_KEY
from app.application.use_cases.jobs.ingest_jobs import IngestJobsUseCase
from app.application.use_cases.jobs.recompute_fit import RecomputeFitUseCase
from app.config.db import AsyncLocalSession
from app.config.logging import logger
from app.config.redis import redis_client
from app.config.settings import envs
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.job_fit_score_repository import (
    JobFitScoreRepository,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)
from app.worker.broker import broker

SessionFactory = Callable[[], AbstractAsyncContextManager[AsyncSession]]

# Delete the lock only if this run still owns it: a run that outlived
# JOBS_INGEST_LOCK_SECONDS must not free the lock of the run after it.
_RELEASE_LOCK = (
    "if redis.call('get', KEYS[1]) == ARGV[1] then "
    "return redis.call('del', KEYS[1]) end return 0"
)


def session_factory() -> AbstractAsyncContextManager[AsyncSession]:
    """A new session for one task (tests swap this function)."""
    return AsyncLocalSession()


def lock_client() -> redis.Redis:
    """The Redis the lock lives on - the API's own ``REDIS_URL``, so
    ``JobQueue.ingest_running`` reads the same key (tests swap this)."""
    return redis_client


def scrapers() -> Mapping[str, BaseScraper]:
    return build_registry(
        envs.jobs_scrapers,
        envs.JOBS_SCRAPER_TIMEOUT_SECONDS,
        envs.JOBS_FIXTURE_PATH,
    )


def _fit_use_case(session: AsyncSession) -> RecomputeFitUseCase:
    return RecomputeFitUseCase(
        BaseCVRepository(session),
        JobRepository(session),
        JobFitScoreRepository(session),
    )


async def run_ingest(
    lock: redis.Redis,
    open_session: SessionFactory,
    registry: Mapping[str, BaseScraper],
) -> IngestRunDTO:
    token = uuid.uuid4().hex
    try:
        acquired = await lock.set(
            INGEST_LOCK_KEY, token, nx=True, ex=envs.JOBS_INGEST_LOCK_SECONDS
        )
    except RedisError, OSError:
        logger.warning(
            'Job collection skipped: the run lock cannot be taken',
            extra={'extra_data': {'event': 'jobs_ingest_lock_unavailable'}},
        )
        return IngestRunDTO(ran=False)
    if not acquired:
        logger.info(
            'Job collection skipped: a run is already in progress',
            extra={'extra_data': {'event': 'jobs_ingest_already_running'}},
        )
        return IngestRunDTO(ran=False)

    try:
        async with open_session() as session:
            use_case = IngestJobsUseCase(
                JobSourceRepository(session),
                JobRepository(session),
                JobFitScoreRepository(session),
                _fit_use_case(session),
                registry,
                enabled=envs.JOBS_INGEST_ENABLED,
                lookback_days=envs.JOBS_LOOKBACK_DAYS,
                retention_days=envs.JOBS_RETENTION_DAYS,
            )
            return await use_case.execute()
    finally:
        try:
            await lock.eval(_RELEASE_LOCK, 1, INGEST_LOCK_KEY, token)
        except RedisError, OSError:
            logger.warning(
                'Job collection lock not released; it expires on its own',
                extra={'extra_data': {'event': 'jobs_ingest_lock_release'}},
            )


async def run_recompute(
    open_session: SessionFactory, base_cv_id: int
) -> FitRecomputeDTO:
    async with open_session() as session:
        return await _fit_use_case(session).execute(base_cv_id=base_cv_id)


@broker.task(
    task_name='ingest_jobs', schedule=[{'cron': envs.JOBS_INGEST_CRON}]
)
async def ingest_jobs() -> None:
    await run_ingest(lock_client(), session_factory, scrapers())


@broker.task(task_name='recompute_fit')
async def recompute_fit(base_cv_id: int) -> None:
    await run_recompute(session_factory, base_cv_id)
