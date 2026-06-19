from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.application.use_cases.admin.jobs.run_ingestion import RunIngestionUseCase
from app.config.db import AsyncLocalSession
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import JobSourceRepository

logger = logging.getLogger(__name__)


async def _run_ingestion_job() -> None:
    logger.info('Scheduled ingestion started')
    try:
        async with AsyncLocalSession() as session:
            use_case = RunIngestionUseCase(
                JobRepository(session),
                JobSourceRepository(session),
            )
            summary = await use_case.execute()
            logger.info('Scheduled ingestion finished: %s', summary)
    except Exception:
        logger.exception('Scheduled ingestion failed')


def _seconds_until_next_3am_utc() -> float:
    now = datetime.now(timezone.utc)
    next_run = now.replace(hour=3, minute=0, second=0, microsecond=0)
    if next_run <= now:
        next_run += timedelta(days=1)
    return (next_run - now).total_seconds()


async def run_scheduler() -> None:
    await _run_ingestion_job()
    while True:
        await asyncio.sleep(_seconds_until_next_3am_utc())
        await _run_ingestion_job()
