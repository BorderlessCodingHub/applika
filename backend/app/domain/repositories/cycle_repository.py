from typing import List

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
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

    async def commit(self):
        await self.session.commit()
