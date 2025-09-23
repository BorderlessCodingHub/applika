from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.application_step import ApplicationStepCreateDTO
from app.domain.models import ApplicationStepModel


class ApplicationStepRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self, app_step: ApplicationStepCreateDTO
    ) -> ApplicationStepModel:
        try:
            db_app_step = ApplicationStepModel(**app_step.model_dump())
            self.session.add(db_app_step)
            await self.session.commit()
            await self.session.refresh(db_app_step)
            return db_app_step
        except Exception as e:
            await self.session.rollback()
            raise e
