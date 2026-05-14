from __future__ import annotations

from app.application.services.keywords_service import score_fit
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.job_fit_snapshot_repository import (
    JobFitSnapshotRepository,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)

_CHUNK_SIZE = 50


class RefreshFitUseCase:
    def __init__(
        self,
        job_repo: JobRepository,
        resume_repo: UserResumeRepository,
        fit_repo: JobFitSnapshotRepository,
    ):
        self.job_repo = job_repo
        self.resume_repo = resume_repo
        self.fit_repo = fit_repo

    async def execute(
        self,
        user_id: int,
        resume_id: int | None = None,
    ) -> dict:
        if resume_id is not None:
            resume = await self.resume_repo.get_by_id_and_user(
                resume_id, user_id
            )
        else:
            resume = await self.resume_repo.get_default_by_user(user_id)

        if resume is None:
            raise ResourceNotFound('No resume found for fit scoring')

        all_ids = await self.job_repo.get_all_active_ids()
        refreshed = 0

        for i in range(0, len(all_ids), _CHUNK_SIZE):
            chunk_ids = all_ids[i: i + _CHUNK_SIZE]
            for job_id in chunk_ids:
                job = await self.job_repo.get_by_id(job_id)
                if job is None:
                    continue
                fit = score_fit(resume.parsed_text, job.description_text)
                await self.fit_repo.upsert(
                    user_id=user_id,
                    job_id=job_id,
                    resume_id=resume.id,
                    fit_score=fit.score,
                    matched_keywords=list(fit.matched_keywords),
                    missing_keywords=list(fit.missing_keywords),
                )
                refreshed += 1

        return {'refreshed': refreshed, 'resume_id': resume.id}
