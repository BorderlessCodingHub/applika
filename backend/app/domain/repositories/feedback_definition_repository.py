from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import FeedbackDefinitionModel


class FeedbackDefinitionRepository:
    """Read-only access to the frozen ``feedbacks_definition`` catalog.

    Retired with the step catalog (R-021); read only by ``/supports`` and the
    legacy body ``/finalize`` of installed ``applika-cli`` 0.1.4.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> list[FeedbackDefinitionModel]:
        result = await self.session.scalars(
            select(FeedbackDefinitionModel).order_by(FeedbackDefinitionModel.id)
        )
        return list(result.all())

    async def get_by_id(self, id: int) -> FeedbackDefinitionModel | None:
        return await self.session.scalar(
            select(FeedbackDefinitionModel).where(
                FeedbackDefinitionModel.id == id
            )
        )
