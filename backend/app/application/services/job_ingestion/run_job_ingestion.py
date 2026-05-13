from __future__ import annotations

from app.application.use_cases.admin.jobs.run_ingestion import (
    RunIngestionUseCase,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)


async def run_ingestion(session_factory) -> dict:
    async with session_factory() as session:
        job_repo = JobRepository(session)
        source_repo = JobSourceRepository(session)
        uc = RunIngestionUseCase(job_repo, source_repo)
        return await uc.execute()
