from typing import List

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    CycleModel,
    QuinzenalReportModel,
)


class CycleRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_by_user_id(
        self, user_id: int
    ) -> List[CycleModel]:
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

    async def count_current_applications(
        self, user_id: int
    ) -> int:
        result = await self.session.scalar(
            select(func.count(ApplicationModel.id)).where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.cycle_id.is_(None),
            )
        )
        return int(result or 0)

    async def create(
        self, user_id: int, name: str
    ) -> CycleModel:
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
        result = await self.session.execute(
            update(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.cycle_id.is_(None),
            )
            .values(cycle_id=cycle_id)
        )
        return result.rowcount

    async def archive_current_reports(
        self, user_id: int, cycle_id: int
    ) -> int:
        result = await self.session.execute(
            update(QuinzenalReportModel)
            .where(
                QuinzenalReportModel.user_id == user_id,
                QuinzenalReportModel.cycle_id.is_(None),
            )
            .values(cycle_id=cycle_id)
        )
        return result.rowcount

    async def delete_cycle_cascade(
        self, cycle_id: int, user_id: int
    ) -> None:
        """Delete a cycle and all its associated data atomically."""
        # 1. Delete application steps for apps in this cycle
        app_ids_subq = (
            select(ApplicationModel.id)
            .where(
                ApplicationModel.cycle_id == cycle_id,
                ApplicationModel.user_id == user_id,
            )
            .scalar_subquery()
        )
        await self.session.execute(
            delete(ApplicationStepModel).where(
                ApplicationStepModel.application_id.in_(app_ids_subq)
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
