from datetime import UTC, datetime

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.domain.models import PlatformModel
from app.domain.repositories.catalog_visibility import visible_to


class PlatformRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, id: int) -> PlatformModel | None:
        return await self.session.scalar(
            select(PlatformModel)
            .where(PlatformModel.id == id)
            .options(selectinload(PlatformModel.created_by_user))
        )

    async def get_visible(self, id: int, user_id: int) -> PlatformModel | None:
        """The platform, only when ``user_id`` may see it (ADR-0014):
        public, or private and created by that user."""
        return await self.session.scalar(
            select(PlatformModel).where(
                PlatformModel.id == id, visible_to(PlatformModel, user_id)
            )
        )

    async def list_visible(
        self,
        user_id: int,
        name: str | None = None,
        *,
        order_by_name: bool = False,
    ) -> list[PlatformModel]:
        """``/supports`` and every other user-facing platform list: public
        rows plus the caller's own private ones (R-018). ``GET /platforms``
        (S7) passes ``name`` for a case-insensitive substring match and
        ``order_by_name=True``; ``/supports`` passes neither and keeps
        ``ORDER BY id`` (R-036 - its content, shape and order are
        unchanged)."""
        query = select(PlatformModel).where(visible_to(PlatformModel, user_id))
        if name:
            query = query.where(PlatformModel.name.ilike(f'%{name}%'))
        query = query.order_by(
            PlatformModel.name if order_by_name else PlatformModel.id
        )
        result = await self.session.scalars(query)
        return list(result.all())

    async def find_visible_by_name(
        self, name: str, user_id: int
    ) -> PlatformModel | None:
        """A visible platform matching ``name`` case-insensitively, trimmed
        (R-020: refuse a new platform whose name, ignoring case, matches one
        the user already sees)."""
        trimmed = name.strip()
        return await self.session.scalar(
            select(PlatformModel)
            .where(
                visible_to(PlatformModel, user_id),
                func.lower(PlatformModel.name) == trimmed.lower(),
            )
            .order_by(PlatformModel.is_public.desc())
        )

    async def find_public_by_name(
        self, name: str, exclude_id: int | None = None
    ) -> PlatformModel | None:
        """A public platform matching ``name`` case-insensitively - used by
        the admin publish flow to name the row a publish would collide
        with (R-026)."""
        query = select(PlatformModel).where(
            PlatformModel.is_public.is_(True),
            func.lower(PlatformModel.name) == name.strip().lower(),
        )
        if exclude_id is not None:
            query = query.where(PlatformModel.id != exclude_id)
        return await self.session.scalar(query)

    async def create(
        self,
        *,
        name: str,
        url: str | None,
        is_public: bool,
        created_by: int | None = None,
    ) -> PlatformModel:
        try:
            platform = PlatformModel(
                name=name, url=url, is_public=is_public, created_by=created_by
            )
            self.session.add(platform)
            await self.session.commit()
            await self.session.refresh(platform)
            return platform
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(self, platform: PlatformModel) -> PlatformModel:
        try:
            platform.updated_at = datetime.now(UTC)
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
                delete(PlatformModel).where(PlatformModel.id == id)
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
