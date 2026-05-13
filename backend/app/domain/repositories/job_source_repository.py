from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import JobSourceModel


class JobSourceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all(self) -> list[JobSourceModel]:
        result = await self.session.scalars(
            select(JobSourceModel).order_by(JobSourceModel.code)
        )
        return list(result)

    async def get_by_code(self, code: str) -> JobSourceModel | None:
        return await self.session.scalar(
            select(JobSourceModel).where(JobSourceModel.code == code)
        )

    async def get_by_id(self, id: int) -> JobSourceModel | None:
        return await self.session.scalar(
            select(JobSourceModel).where(JobSourceModel.id == id)
        )

    async def create(
        self, code: str, name: str, base_url: str
    ) -> JobSourceModel:
        try:
            source = JobSourceModel(
                code=code, name=name, base_url=base_url
            )
            self.session.add(source)
            await self.session.commit()
            await self.session.refresh(source)
            return source
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update_scrape_status(
        self,
        source_id: int,
        status: str,
        error: str | None = None,
    ) -> None:
        try:
            source = await self.get_by_id(source_id)
            if source is None:
                return
            source.last_scrape_status = status
            source.last_scrape_error = error
            source.updated_at = datetime.now(timezone.utc)
            self.session.add(source)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def mark_scraped(self, source_id: int) -> None:
        try:
            source = await self.get_by_id(source_id)
            if source is None:
                return
            source.last_scraped_at = datetime.now(timezone.utc)
            source.last_scrape_status = 'ok'
            source.last_scrape_error = None
            source.updated_at = datetime.now(timezone.utc)
            self.session.add(source)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
