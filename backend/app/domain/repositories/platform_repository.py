from datetime import datetime, timezone
from typing import List

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import PlatformModel


class PlatformRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> List[PlatformModel]:
        return await self.session.scalars(
            select(PlatformModel).order_by(PlatformModel.id)
        )

    async def get_by_id(self, id: int) -> PlatformModel:
        return await self.session.scalar(
            select(PlatformModel).where(PlatformModel.id == id)
        )

    async def create(
        self, **kwargs
    ) -> PlatformModel:
        try:
            platform = PlatformModel(**kwargs)
            self.session.add(platform)
            await self.session.commit()
            await self.session.refresh(platform)
            return platform
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, platform: PlatformModel
    ) -> PlatformModel:
        try:
            platform.updated_at = datetime.now(timezone.utc)
            self.session.add(platform)
            await self.session.commit()
            await self.session.refresh(platform)
            return platform
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, id: int) -> None:
        try:
            await self.session.execute(
                delete(PlatformModel).where(
                    PlatformModel.id == id
                )
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
