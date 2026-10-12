"""The fit of each master CV for each listed job (KODI-046, ADR-0017)."""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import BaseCVModel, JobFitScoreModel
from app.lib.types import generate_snowflake_id

CHUNK = 1000


@dataclass(frozen=True)
class FitRow:
    user_id: int
    job_id: int
    base_cv_id: int
    score: int


class JobFitScoreRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def upsert_many(
        self, rows: Sequence[FitRow], computed_at: datetime
    ) -> None:
        """Insert or replace each row on ``(base_cv_id, job_id)``; one
        commit."""
        if not rows:
            return
        try:
            for start in range(0, len(rows), CHUNK):
                chunk = rows[start : start + CHUNK]
                stmt = insert(JobFitScoreModel).values([
                    {
                        'id': generate_snowflake_id(),
                        'created_at': computed_at,
                        'user_id': row.user_id,
                        'job_id': row.job_id,
                        'base_cv_id': row.base_cv_id,
                        'score': row.score,
                        'computed_at': computed_at,
                    }
                    for row in chunk
                ])
                await self.session.execute(
                    stmt.on_conflict_do_update(
                        constraint='uq_job_fit_scores_cv_job',
                        set_={
                            'user_id': stmt.excluded.user_id,
                            'score': stmt.excluded.score,
                            'computed_at': stmt.excluded.computed_at,
                            'updated_at': func.now(),
                        },
                    )
                )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def upsert(
        self,
        user_id: int,
        job_id: int,
        base_cv_id: int,
        score: int,
        computed_at: datetime,
    ) -> None:
        await self.upsert_many(
            [FitRow(user_id, job_id, base_cv_id, score)], computed_at
        )

    async def _delete(self, *conditions) -> int:
        try:
            result = await self.session.execute(
                delete(JobFitScoreModel)
                .where(*conditions)
                .returning(JobFitScoreModel.id)
            )
            removed = len(result.scalars().all())
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return removed

    async def delete_for_jobs(self, job_ids: Sequence[int]) -> int:
        """Remove every fit row of these jobs (expired, R-007)."""
        removed = 0
        for start in range(0, len(job_ids), CHUNK):
            removed += await self._delete(
                JobFitScoreModel.job_id.in_(job_ids[start : start + CHUNK])
            )
        return removed

    async def delete_many(self, base_cv_id: int, job_ids: Sequence[int]) -> int:
        """Remove this CV's rows for these jobs (a fit that became
        ``None``)."""
        removed = 0
        for start in range(0, len(job_ids), CHUNK):
            removed += await self._delete(
                JobFitScoreModel.base_cv_id == base_cv_id,
                JobFitScoreModel.job_id.in_(job_ids[start : start + CHUNK]),
            )
        return removed

    async def delete(self, base_cv_id: int, job_id: int) -> int:
        return await self.delete_many(base_cv_id, [job_id])

    async def stale_base_cv_ids(self) -> list[int]:
        """Master CVs whose fit is out of date: changed after their newest
        ``computed_at``, or with no fit row at all."""
        newest = (
            select(
                JobFitScoreModel.base_cv_id,
                func.max(JobFitScoreModel.computed_at).label('newest'),
            )
            .group_by(JobFitScoreModel.base_cv_id)
            .subquery()
        )
        result = await self.session.scalars(
            select(BaseCVModel.id)
            .outerjoin(newest, newest.c.base_cv_id == BaseCVModel.id)
            .where(
                or_(
                    newest.c.newest.is_(None),
                    func.coalesce(
                        BaseCVModel.updated_at, BaseCVModel.created_at
                    )
                    > newest.c.newest,
                )
            )
            .order_by(BaseCVModel.id)
        )
        return list(result.all())
