"""The job sources (KODI-046): the admin-managed catalog of boards the worker
collects from. No ``user_id`` - a shared catalog (ADR-0004)."""

from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import JobModel, JobSourceModel

# ``job_sources.last_run_error`` is TEXT; a run never stores more than this.
RUN_ERROR_MAX = 1000


class JobSourceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def list_all(self) -> list[JobSourceModel]:
        result = await self.session.scalars(
            select(JobSourceModel).order_by(JobSourceModel.code)
        )
        return list(result.all())

    async def list_enabled(self) -> list[JobSourceModel]:
        result = await self.session.scalars(
            select(JobSourceModel)
            .where(JobSourceModel.is_enabled.is_(True))
            .order_by(JobSourceModel.code)
        )
        return list(result.all())

    async def get(self, source_id: int) -> JobSourceModel | None:
        return await self.session.get(JobSourceModel, source_id)

    async def set_enabled(
        self, source_id: int, is_enabled: bool
    ) -> JobSourceModel | None:
        source = await self.get(source_id)
        if source is None:
            return None
        try:
            source.is_enabled = is_enabled
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        await self.session.refresh(source)
        return source

    async def record_run(
        self,
        source_id: int,
        status: str,
        found: int,
        saved: int,
        error: str | None,
        ran_at: datetime,
    ) -> None:
        """Store how this source's part of a run ended (R-008)."""
        try:
            await self.session.execute(
                update(JobSourceModel)
                .where(JobSourceModel.id == source_id)
                .values(
                    last_run_at=ran_at,
                    last_run_status=status,
                    last_run_found=found,
                    last_run_saved=saved,
                    last_run_error=error[:RUN_ERROR_MAX] if error else None,
                    updated_at=func.now(),
                )
            )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def active_job_counts(self) -> dict[int, int]:
        """Listed (active) jobs per source id; a source with none is
        absent."""
        result = await self.session.execute(
            select(JobModel.source_id, func.count(JobModel.id))
            .where(JobModel.is_active.is_(True))
            .group_by(JobModel.source_id)
        )
        return {source_id: count for source_id, count in result.all()}
