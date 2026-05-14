from __future__ import annotations

import json

from app.core.exceptions import ResourceNotFound
from app.domain.repositories.job_fit_snapshot_repository import (
    JobFitSnapshotRepository,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.user_resume_repository import (
    UserResumeRepository,
)


class GetJobFitUseCase:
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
        job_id: int,
        user_id: int,
        resume_id: int | None = None,
    ) -> dict:
        job = await self.job_repo.get_by_id(job_id)
        if job is None:
            raise ResourceNotFound('Job not found')

        if resume_id is not None:
            resume = await self.resume_repo.get_by_id_and_user(
                resume_id, user_id
            )
        else:
            resume = await self.resume_repo.get_default_by_user(user_id)

        if resume is None:
            return {
                'job_id': job_id,
                'resume_id': None,
                'fit_score': None,
                'matched_keywords': [],
                'missing_keywords': [],
            }

        snapshot = await self.fit_repo.get_for_job(
            user_id, job_id, resume.id
        )
        if snapshot is None:
            return {
                'job_id': job_id,
                'resume_id': resume.id,
                'fit_score': None,
                'matched_keywords': [],
                'missing_keywords': [],
            }

        return {
            'job_id': job_id,
            'resume_id': resume.id,
            'fit_score': snapshot.fit_score,
            'matched_keywords': json.loads(
                snapshot.matched_keywords_json
            ),
            'missing_keywords': json.loads(
                snapshot.missing_keywords_json
            ),
        }
