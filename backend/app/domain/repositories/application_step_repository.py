from datetime import datetime, timezone
from typing import List

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.application.dto.application_step import ApplicationStepCreateDTO
from app.domain.models import ApplicationModel, ApplicationStepModel


class ApplicationStepRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id_and_app_id_and_user_id(
        self, id: int, app_id: int, user_id: int
    ) -> ApplicationStepModel:
        return await self.session.scalar(
            select(ApplicationStepModel)
            .outerjoin(
                ApplicationModel,
                ApplicationStepModel.application_id == ApplicationModel.id,
            )
            .where(
                ApplicationStepModel.id == id,
                ApplicationStepModel.application_id == app_id,
                ApplicationModel.user_id == user_id,
            )
        )

    async def get_all_by_app_id_and_user_id(
        self, application_id: int
    ) -> List[ApplicationStepModel]:
        return await self.session.scalars(
            select(ApplicationStepModel)
            .where(
                ApplicationStepModel.application_id == application_id,
            )
            .order_by(ApplicationStepModel.created_at.asc())
            .options(joinedload(ApplicationStepModel.step_def))
        )

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

    async def update(
        self, application: ApplicationStepModel
    ) -> ApplicationStepModel:
        try:
            application.updated_at = datetime.now(timezone.utc)
            self.session.add(application)
            await self.session.commit()
            return application
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, application: ApplicationStepModel):
        try:
            await self.session.delete(application)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete_all_by_application_id(self, application_id) -> int:
        result = await self.session.execute(
            delete(ApplicationStepModel).where(
                ApplicationStepModel.application_id == application_id
            )
        )
        await self.session.commit()
        return result.rowcount
