from typing import List
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import PlatformModel


class PlatformRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> List[PlatformModel]:
        return await self.session.scalars(
            select(PlatformModel).order_by(PlatformModel.id))
