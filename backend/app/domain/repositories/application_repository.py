from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.application.dto.application import ApplicationCreateDTO
from app.domain.models import ApplicationModel


class ApplicationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_by_user_id(self, user_id: int) -> List[ApplicationModel]:
        return await self.session.scalars(
            select(ApplicationModel)
            .where(ApplicationModel.user_id == user_id)
            .order_by(ApplicationModel.application_date.desc())
            .options(
                selectinload(ApplicationModel.last_step_def),
                selectinload(ApplicationModel.feedback_def),
            )
        )

    async def create(
        self, application: ApplicationCreateDTO
    ) -> ApplicationModel:
        try:
            db_application = ApplicationModel(**application.model_dump())
            self.session.add(db_application)
            await self.session.commit()
            await self.session.refresh(db_application)
            return db_application
        except Exception as e:
            await self.session.rollback()
            raise e
