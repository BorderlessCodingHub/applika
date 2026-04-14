from datetime import datetime, timezone
from typing import List

from sqlalchemy import delete, select
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

    async def get_by_id(
        self, id: int
    ) -> FeedbackDefinitionModel | None:
        return await self.session.scalar(
            select(FeedbackDefinitionModel).where(
                FeedbackDefinitionModel.id == id
            )
        )

    async def create(
        self, **kwargs
    ) -> FeedbackDefinitionModel:
        try:
            feedback = FeedbackDefinitionModel(**kwargs)
            self.session.add(feedback)
            await self.session.commit()
            await self.session.refresh(feedback)
            return feedback
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, feedback: FeedbackDefinitionModel
    ) -> FeedbackDefinitionModel:
        try:
            feedback.updated_at = datetime.now(timezone.utc)
            self.session.add(feedback)
            await self.session.commit()
            await self.session.refresh(feedback)
            return feedback
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, id: int) -> None:
        try:
            await self.session.execute(
                delete(FeedbackDefinitionModel).where(
                    FeedbackDefinitionModel.id == id
                )
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
