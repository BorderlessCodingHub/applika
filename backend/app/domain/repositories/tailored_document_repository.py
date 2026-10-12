from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.models import TailoredDocumentModel


class TailoredDocumentRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(
        self,
        user_id: int,
        job_id: int,
        resume_id: int | None,
        content_json: str,
        plain_text: str,
        provider: str = 'heuristic',
    ) -> TailoredDocumentModel:
        try:
            doc = TailoredDocumentModel(
                user_id=user_id,
                job_id=job_id,
                resume_id=resume_id,
                content_json=content_json,
                plain_text=plain_text,
                provider=provider,
            )
            self.session.add(doc)
            await self.session.commit()
            await self.session.refresh(doc)
            return doc
        except Exception as e:
            await self.session.rollback()
            raise e

    async def get_by_id_and_user(
        self, id: int, user_id: int
    ) -> TailoredDocumentModel | None:
        return await self.session.scalar(
            select(TailoredDocumentModel)
            .where(
                TailoredDocumentModel.id == id,
                TailoredDocumentModel.user_id == user_id,
            )
            .options(selectinload(TailoredDocumentModel.ats_report))
        )
