from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import StepDefinitionModel


class StepDefinitionRepository:
    """Read-only access to the frozen ``steps_definition`` catalog.

    The catalog is retired (R-021): nobody creates, edits or deletes a step
    definition any more. It stays readable only for the event -> step
    translator (``compat/step_translation.py``: ``last_step`` and the
    agenda).
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> list[StepDefinitionModel]:
        result = await self.session.scalars(
            select(StepDefinitionModel).order_by(StepDefinitionModel.id)
        )
        return list(result.all())
