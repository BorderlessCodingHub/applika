from typing import List

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.company import CompanyCreateDTO
from app.core.exceptions import ResourceConflict
from app.domain.models import CompanyModel


class CompanyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, id: int) -> CompanyModel | None:
        return await self.session.scalar(
            select(CompanyModel).where(
                CompanyModel.id == id,
                CompanyModel.is_active.is_(True)
            )
        )

    async def get_all(self, name: str | None = None) -> List[CompanyModel]:
        query = (
            select(CompanyModel)
            .where(CompanyModel.is_active.is_(True))
            .order_by(CompanyModel.name)
        )
        if name:
            query = query.where(CompanyModel.name.ilike(f'%{name}%'))
        return await self.session.scalars(query)

    async def get_by_id_unfiltered(
        self, id: int
    ) -> CompanyModel | None:
        return await self.session.scalar(
            select(CompanyModel).where(CompanyModel.id == id)
        )

    async def update(self, company: CompanyModel) -> CompanyModel:
        try:
            self.session.add(company)
            await self.session.commit()
            await self.session.refresh(company)
            return company
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, id: int) -> None:
        try:
            await self.session.execute(
                delete(CompanyModel).where(
                    CompanyModel.id == id
                )
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def create(self, company: CompanyCreateDTO) -> CompanyModel:
        try:
            db_company = CompanyModel(
                **company.model_dump(exclude={'url'}),
                url=str(company.url),
            )
            self.session.add(db_company)
            await self.session.commit()
            await self.session.refresh(db_company)
            return db_company
        except IntegrityError:
            await self.session.rollback()
            raise ResourceConflict(
                'A company with this name and URL already exists.'
            )
        except Exception as e:
            await self.session.rollback()
            raise e
