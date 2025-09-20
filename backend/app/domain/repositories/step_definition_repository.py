from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import StepDefinitionModel


class StepDefinitionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> List[StepDefinitionModel]:
        return await self.session.scalars(
            select(StepDefinitionModel).order_by(StepDefinitionModel.id)
        )
