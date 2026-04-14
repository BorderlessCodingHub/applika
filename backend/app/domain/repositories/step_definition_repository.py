from datetime import datetime, timezone
from typing import List

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import StepDefinitionModel


class StepDefinitionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> List[StepDefinitionModel]:
        return await self.session.scalars(
            select(StepDefinitionModel).order_by(
                StepDefinitionModel.id
            )
        )

    async def get_by_id(
        self, id: int
    ) -> StepDefinitionModel | None:
        return await self.session.scalar(
            select(StepDefinitionModel).where(
                StepDefinitionModel.id == id
            )
        )

    async def get_by_id_strict_only(
        self, id: int
    ) -> StepDefinitionModel:
        return await self.session.scalar(
            select(StepDefinitionModel).where(
                StepDefinitionModel.id == id,
                StepDefinitionModel.strict.is_(True),
            )
        )

    async def get_by_id_non_strict_only(
        self, id: int
    ) -> StepDefinitionModel:
        return await self.session.scalar(
            select(StepDefinitionModel).where(
                StepDefinitionModel.id == id,
                StepDefinitionModel.strict.is_(False),
            )
        )

    async def create(
        self, **kwargs
    ) -> StepDefinitionModel:
        try:
            step = StepDefinitionModel(**kwargs)
            self.session.add(step)
            await self.session.commit()
            await self.session.refresh(step)
            return step
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, step: StepDefinitionModel
    ) -> StepDefinitionModel:
        try:
            step.updated_at = datetime.now(timezone.utc)
            self.session.add(step)
            await self.session.commit()
            await self.session.refresh(step)
            return step
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, id: int) -> None:
        try:
            await self.session.execute(
                delete(StepDefinitionModel).where(
                    StepDefinitionModel.id == id
                )
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
