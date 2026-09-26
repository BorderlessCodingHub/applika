from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.company import CompanyCreateDTO
from app.core.exceptions import ResourceConflict
from app.domain.models import CompanyModel
from app.domain.repositories.catalog_visibility import visible_to


class CompanyRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, id: int) -> CompanyModel | None:
        return await self.session.scalar(
            select(CompanyModel).where(
                CompanyModel.id == id, CompanyModel.is_active.is_(True)
            )
        )

    async def get_visible(self, id: int, user_id: int) -> CompanyModel | None:
        """The company, only when ``user_id`` may see it (ADR-0014):
        public, or private and created by that user."""
        return await self.session.scalar(
            select(CompanyModel).where(
                CompanyModel.id == id,
                CompanyModel.is_active.is_(True),
                visible_to(CompanyModel, user_id),
            )
        )

    async def get_all(self, name: str | None = None) -> list[CompanyModel]:
        query = (
            select(CompanyModel)
            .where(CompanyModel.is_active.is_(True))
            .order_by(CompanyModel.name)
        )
        if name:
            query = query.where(CompanyModel.name.ilike(f'%{name}%'))
        result = await self.session.scalars(query)
        return list(result.all())

    async def list_visible(
        self, user_id: int, name: str | None = None
    ) -> list[CompanyModel]:
        """``GET /companies``: public rows plus the caller's own private
        ones (R-018/R-024)."""
        query = (
            select(CompanyModel)
            .where(
                CompanyModel.is_active.is_(True),
                visible_to(CompanyModel, user_id),
            )
            .order_by(CompanyModel.name)
        )
        if name:
            query = query.where(CompanyModel.name.ilike(f'%{name}%'))
        result = await self.session.scalars(query)
        return list(result.all())

    async def find_visible_match(
        self, name: str, url: str, user_id: int
    ) -> CompanyModel | None:
        """A visible company matching ``lower(name)`` and the normalised
        ``url`` exactly - a public row is preferred over a private one when
        both exist (R-024: reuse instead of creating another)."""
        return await self.session.scalar(
            select(CompanyModel)
            .where(
                CompanyModel.is_active.is_(True),
                visible_to(CompanyModel, user_id),
                func.lower(CompanyModel.name) == name.strip().lower(),
                CompanyModel.url == url,
            )
            .order_by(CompanyModel.is_public.desc())
        )

    async def find_public_collision(
        self, name: str, url: str, exclude_id: int | None = None
    ) -> CompanyModel | None:
        """A public company matching ``lower(name)`` and ``url`` exactly -
        used by the admin publish flow to name the row a publish would
        collide with (R-026)."""
        query = select(CompanyModel).where(
            CompanyModel.is_public.is_(True),
            func.lower(CompanyModel.name) == name.strip().lower(),
            CompanyModel.url == url,
        )
        if exclude_id is not None:
            query = query.where(CompanyModel.id != exclude_id)
        return await self.session.scalar(query)

    async def get_by_id_unfiltered(self, id: int) -> CompanyModel | None:
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
                delete(CompanyModel).where(CompanyModel.id == id)
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def create(
        self, company: CompanyCreateDTO, *, is_public: bool
    ) -> CompanyModel:
        try:
            db_company = CompanyModel(
                **company.model_dump(exclude={'url'}),
                url=str(company.url),
                is_public=is_public,
            )
            self.session.add(db_company)
            await self.session.commit()
            await self.session.refresh(db_company)
            return db_company
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(
                'A company with this name and URL already exists.'
            ) from err
        except Exception as e:
            await self.session.rollback()
            raise e
