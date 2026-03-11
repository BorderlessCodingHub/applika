from typing import List

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.company import CompanyCreateDTO
from app.domain.models import CompanyModel


class CompanyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, id: int) -> CompanyModel | None:
        return await self.session.scalar(
            select(CompanyModel).where(CompanyModel.id == id)
        )

    async def get_all(
        self, name: str | None = None
    ) -> List[CompanyModel]:
        query = (
            select(CompanyModel)
            .where(CompanyModel.is_active.is_(True))
            .order_by(CompanyModel.name)
        )
        if name:
            query = query.where(
                CompanyModel.name.ilike(f'%{name}%')
            )
        return await self.session.scalars(query)

    async def create(
        self, company: CompanyCreateDTO
    ) -> CompanyModel:
        try:
            db_company = CompanyModel(
                **company.model_dump(exclude={'url'}),
                url=str(company.url),
            )
            self.session.add(db_company)
            await self.session.commit()
            await self.session.refresh(db_company)
            return db_company
        except Exception as e:
            await self.session.rollback()
            raise e
