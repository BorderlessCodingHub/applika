from __future__ import annotations

import json

from app.application.dto.jobs import JobDetailDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.job_fit_snapshot_repository import (
    JobFitSnapshotRepository,
)
from app.domain.repositories.job_repository import JobRepository


class GetJobUseCase:
    def __init__(
        self,
        job_repo: JobRepository,
        fit_repo: JobFitSnapshotRepository,
    ):
        self.job_repo = job_repo
        self.fit_repo = fit_repo

    async def execute(
        self,
        job_id: int,
        user_id: int,
        resume_id: int | None,
    ) -> JobDetailDTO:
        job = await self.job_repo.get_by_id(job_id)
        if job is None:
            raise ResourceNotFound('Job not found')

        fit_score: int | None = None
        matched: list[str] = []
        missing: list[str] = []

        if resume_id is not None:
            snapshot = await self.fit_repo.get_for_job(
                user_id, job_id, resume_id
            )
            if snapshot is not None:
                fit_score = snapshot.fit_score
                matched = json.loads(snapshot.matched_keywords_json)
                missing = json.loads(snapshot.missing_keywords_json)

        return JobDetailDTO(
            id=job.id,
            source_code=job.source.code,
            title=job.title,
            company_name=job.company_name,
            location_text=job.location_text,
            job_url=job.job_url,
            employment_type=job.employment_type,
            salary_text=job.salary_text,
            posted_at=job.posted_at,
            tags=[t.tag for t in job.tags],
            fit_score=fit_score,
            matched_keywords=matched,
            missing_keywords=missing,
            description_text=job.description_text,
        )
