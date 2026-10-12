import json

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import JobFitSnapshotModel


class JobFitSnapshotRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert(
        self,
        user_id: int,
        job_id: int,
        resume_id: int,
        fit_score: int,
        matched_keywords: list[str],
        missing_keywords: list[str],
    ) -> JobFitSnapshotModel:
        try:
            existing = await self.session.scalar(
                select(JobFitSnapshotModel).where(
                    JobFitSnapshotModel.user_id == user_id,
                    JobFitSnapshotModel.job_id == job_id,
                    JobFitSnapshotModel.resume_id == resume_id,
                )
            )
            if existing is not None:
                existing.fit_score = fit_score
                existing.matched_keywords_json = json.dumps(
                    matched_keywords
                )
                existing.missing_keywords_json = json.dumps(
                    missing_keywords
                )
                self.session.add(existing)
                await self.session.commit()
                await self.session.refresh(existing)
                return existing

            snapshot = JobFitSnapshotModel(
                user_id=user_id,
                job_id=job_id,
                resume_id=resume_id,
                fit_score=fit_score,
                matched_keywords_json=json.dumps(matched_keywords),
                missing_keywords_json=json.dumps(missing_keywords),
            )
            self.session.add(snapshot)
            await self.session.commit()
            await self.session.refresh(snapshot)
            return snapshot
        except Exception as e:
            await self.session.rollback()
            raise e

    async def get_for_job(
        self, user_id: int, job_id: int, resume_id: int
    ) -> JobFitSnapshotModel | None:
        return await self.session.scalar(
            select(JobFitSnapshotModel).where(
                JobFitSnapshotModel.user_id == user_id,
                JobFitSnapshotModel.job_id == job_id,
                JobFitSnapshotModel.resume_id == resume_id,
            )
        )
