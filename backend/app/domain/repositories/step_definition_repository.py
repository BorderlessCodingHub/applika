from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import StepDefinitionModel


class StepDefinitionRepository:
    """Read-only access to the frozen ``steps_definition`` catalog.

    The catalog is retired (R-021): nobody creates, edits or deletes a step
    definition any more. It stays readable only for the compat layer serving
    installed ``applika-cli`` 0.1.4 (``/supports``, ``/steps``, body
    ``/finalize``) and for the step <-> event translator.
    """

    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> list[StepDefinitionModel]:
        result = await self.session.scalars(
            select(StepDefinitionModel).order_by(StepDefinitionModel.id)
        )
        return list(result.all())

    async def get_by_id(self, id: int) -> StepDefinitionModel | None:
        return await self.session.scalar(
            select(StepDefinitionModel).where(StepDefinitionModel.id == id)
        )

    async def get_by_id_strict_only(
        self, id: int
    ) -> StepDefinitionModel | None:
        return await self.session.scalar(
            select(StepDefinitionModel).where(
                StepDefinitionModel.id == id,
                StepDefinitionModel.strict.is_(True),
            )
        )

    async def get_by_id_non_strict_only(
        self, id: int
    ) -> StepDefinitionModel | None:
        return await self.session.scalar(
            select(StepDefinitionModel).where(
                StepDefinitionModel.id == id,
                StepDefinitionModel.strict.is_(False),
            )
        )
