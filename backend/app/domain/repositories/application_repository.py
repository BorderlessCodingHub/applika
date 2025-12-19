from datetime import datetime, timezone
from typing import List

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.application.dto.application import ApplicationCreateDTO
from app.domain.models import ApplicationModel


class ApplicationRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id_and_user_id(
        self, id: int, user_id: int
    ) -> ApplicationModel | None:
        return await self.session.scalar(
            select(ApplicationModel)
            .where(
                ApplicationModel.id == id, ApplicationModel.user_id == user_id
            )
            .options(
                selectinload(ApplicationModel.last_step_def),
                selectinload(ApplicationModel.feedback_def),
            )
        )

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
            db_application = ApplicationModel(
                **application.model_dump(exclude={'link_to_job'}),
                link_to_job=(str(application.link_to_job)
                             if application.link_to_job else None),
            )
            self.session.add(db_application)
            await self.session.commit()
            await self.session.refresh(db_application)
            return db_application
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(self, application: ApplicationModel) -> ApplicationModel:
        try:
            application.updated_at = datetime.now(timezone.utc)
            self.session.add(application)
            await self.session.commit()
            return application
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete_by_id(self, id: int) -> int:
        result = await self.session.execute(
            delete(ApplicationModel).where(ApplicationModel.id == id)
        )
        await self.session.commit()
        return result.rowcount
