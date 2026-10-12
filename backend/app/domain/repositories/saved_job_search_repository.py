"""Saved job searches (KODI-047, PRD 0012 R-030).

Every read and write is scoped to the owning user (ADR-0004): another
user's search is invisible here, for admins too. ``lock_user`` makes the
10-per-user cap safe under concurrency the way ``BaseCVRepository`` does
for master CVs: a ``SELECT ... FOR UPDATE`` on the user row, held until the
create commits or ``rollback`` runs. ``uq_saved_job_searches_user_name``
(``user_id, lower(name)``) is the last line behind the name check; its
violation surfaces as ``ResourceConflict``.
"""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflict
from app.domain.models import SavedJobSearchModel

NAME_TAKEN = 'A saved search with this name already exists'


class SavedJobSearchRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def lock_user(self, user_id: int) -> None:
        """Lock the owning user row until the transaction ends."""
        await self.session.execute(
            text('SELECT id FROM users WHERE id = :id FOR UPDATE'),
            {'id': user_id},
        )

    async def rollback(self) -> None:
        """End the current transaction, releasing any user-row lock."""
        await self.session.rollback()

    async def count_by_user_id(self, user_id: int) -> int:
        result = await self.session.scalar(
            select(func.count())
            .select_from(SavedJobSearchModel)
            .where(SavedJobSearchModel.user_id == user_id)
        )
        return result or 0

    async def list_by_user_id(self, user_id: int) -> list[SavedJobSearchModel]:
        """The user's searches by name, ignoring case."""
        result = await self.session.scalars(
            select(SavedJobSearchModel)
            .where(SavedJobSearchModel.user_id == user_id)
            .order_by(
                func.lower(SavedJobSearchModel.name), SavedJobSearchModel.id
            )
        )
        return list(result.all())

    async def get_by_id_and_user_id(
        self, id: int, user_id: int
    ) -> SavedJobSearchModel | None:
        return await self.session.scalar(
            select(SavedJobSearchModel).where(
                SavedJobSearchModel.id == id,
                SavedJobSearchModel.user_id == user_id,
            )
        )

    async def name_taken(
        self, user_id: int, name: str, exclude_id: int | None = None
    ) -> bool:
        """Whether another of the user's searches has this name, ignoring
        case."""
        stmt = select(SavedJobSearchModel.id).where(
            SavedJobSearchModel.user_id == user_id,
            func.lower(SavedJobSearchModel.name) == name.lower(),
        )
        if exclude_id is not None:
            stmt = stmt.where(SavedJobSearchModel.id != exclude_id)
        return await self.session.scalar(stmt.limit(1)) is not None

    async def _commit(self, search: SavedJobSearchModel) -> SavedJobSearchModel:
        try:
            self.session.add(search)
            await self.session.commit()
            await self.session.refresh(search)
            return search
        except IntegrityError as e:
            await self.session.rollback()
            if 'uq_saved_job_searches_user_name' in str(e.orig):
                raise ResourceConflict(NAME_TAKEN) from e
            raise
        except Exception:
            await self.session.rollback()
            raise

    async def create(
        self, user_id: int, name: str, filters: dict[str, Any]
    ) -> SavedJobSearchModel:
        return await self._commit(
            SavedJobSearchModel(user_id=user_id, name=name, filters=filters)
        )

    async def update(
        self,
        search: SavedJobSearchModel,
        name: str | None,
        filters: dict[str, Any] | None,
    ) -> SavedJobSearchModel:
        if name is not None:
            search.name = name
        if filters is not None:
            search.filters = filters
        return await self._commit(search)

    async def delete(self, search: SavedJobSearchModel) -> None:
        try:
            await self.session.delete(search)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
