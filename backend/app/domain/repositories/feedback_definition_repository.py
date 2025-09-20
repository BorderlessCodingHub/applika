from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import FeedbackDefinitionModel


class FeedbackDefinitionRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> List[FeedbackDefinitionModel]:
        return await self.session.scalars(
            select(FeedbackDefinitionModel).order_by(
                FeedbackDefinitionModel.id
            )
        )
