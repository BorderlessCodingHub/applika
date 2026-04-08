from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import UserFeedbackModel


class UserFeedbackRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self, feedback: UserFeedbackModel
    ) -> UserFeedbackModel:
        try:
            self.session.add(feedback)
            await self.session.commit()
            await self.session.refresh(feedback)
            return feedback
        except Exception:
            await self.session.rollback()
            raise
