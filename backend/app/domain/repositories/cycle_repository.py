from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    CycleModel,
    QuinzenalReportModel,
    TimelineEventModel,
)
from app.domain.repositories.application_filters import NOT_DRAFT


class CycleRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_by_user_id(self, user_id: int) -> list[CycleModel]:
        return list(
            await self.session.scalars(
                select(CycleModel)
                .where(CycleModel.user_id == user_id)
                .order_by(CycleModel.created_at.desc())
            )
        )

    async def get_by_id_and_user_id(
        self, id: int, user_id: int
    ) -> CycleModel | None:
        return await self.session.scalar(
            select(CycleModel).where(
                CycleModel.id == id,
                CycleModel.user_id == user_id,
            )
        )

    async def count_current_applications(self, user_id: int) -> int:
        """Excludes drafts (KODI-032): a draft never counts toward the
        current board, and starting a new cycle never archives one
        (``archive_current_applications``, below)."""
        result = await self.session.scalar(
            select(func.count(ApplicationModel.id)).where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.cycle_id.is_(None),
                NOT_DRAFT,
            )
        )
        return int(result or 0)

    async def create(self, user_id: int, name: str) -> CycleModel:
        try:
            cycle = CycleModel(user_id=user_id, name=name)
            self.session.add(cycle)
            await self.session.flush()
            await self.session.refresh(cycle)
            return cycle
        except Exception as e:
            await self.session.rollback()
            raise e

    async def archive_current_applications(
        self, user_id: int, cycle_id: int
    ) -> int:
        """A draft is never archived (KODI-032): it stays open and out of
        every cycle until it is finished or deleted."""
        result = await self.session.execute(
            update(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.cycle_id.is_(None),
                NOT_DRAFT,
            )
            .values(cycle_id=cycle_id)
        )
        return int(getattr(result, 'rowcount', 0) or 0)

    async def archive_current_reports(self, user_id: int, cycle_id: int) -> int:
        result = await self.session.execute(
            update(QuinzenalReportModel)
            .where(
                QuinzenalReportModel.user_id == user_id,
                QuinzenalReportModel.cycle_id.is_(None),
            )
            .values(cycle_id=cycle_id)
        )
        return int(getattr(result, 'rowcount', 0) or 0)

    async def delete_cycle_cascade(self, cycle_id: int, user_id: int) -> None:
        """Delete a cycle and all its associated data atomically.

        Archiving (``archive_current_applications``) only stamps
        ``cycle_id``: a closed application swept into a cycle keeps its
        ``finalized_at`` and becomes read-only for good, because every write
        guard refuses an archived application first (422).
        """
        # 1. Delete the timeline events of the apps in this cycle
        app_ids_subq = (
            select(ApplicationModel.id)
            .where(
                ApplicationModel.cycle_id == cycle_id,
                ApplicationModel.user_id == user_id,
            )
            .scalar_subquery()
        )
        await self.session.execute(
            delete(TimelineEventModel).where(
                TimelineEventModel.user_id == user_id,
                TimelineEventModel.application_id.in_(app_ids_subq),
            )
        )
        # 2. Delete applications in this cycle
        await self.session.execute(
            delete(ApplicationModel).where(
                ApplicationModel.cycle_id == cycle_id,
                ApplicationModel.user_id == user_id,
            )
        )
        # 3. Delete reports in this cycle
        await self.session.execute(
            delete(QuinzenalReportModel).where(
                QuinzenalReportModel.cycle_id == cycle_id,
                QuinzenalReportModel.user_id == user_id,
            )
        )
        # 4. Delete the cycle itself
        await self.session.execute(
            delete(CycleModel).where(
                CycleModel.id == cycle_id,
                CycleModel.user_id == user_id,
            )
        )
        await self.session.commit()

    async def commit(self):
        await self.session.commit()
