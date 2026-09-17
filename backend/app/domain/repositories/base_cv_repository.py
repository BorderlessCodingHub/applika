"""Master CV repository.

The constructor takes an ``AsyncSession`` and the repository owns its own
commit/rollback. Methods return ORM models (``BaseCVModel``), never DTOs.

Every read and every write is scoped to the owning user
(docs/applika/adr/0004-row-ownership-and-is-admin.md): another user's master CV
is invisible here, so cross-user access surfaces as a not-found at the use-case
layer - for admins too.

``lock_user`` is what makes the 3-per-user cap safe under concurrency: it takes
a row-level ``FOR UPDATE`` lock on the owning user row, which is held until the
session commits or rolls back. Count, check and insert therefore run inside one
transaction that no concurrent create can interleave with.
"""

from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.base_cv import BaseCVCreateDTO
from app.domain.models import BaseCVModel


class BaseCVRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def lock_user(self, user_id: int) -> None:
        """Take a row-level lock on the owning user row.

        The lock is held for the rest of the current transaction, i.e. until
        ``create`` commits or ``rollback`` runs. Concurrent creates for the
        same user queue here, one at a time.
        """
        await self.session.execute(
            text('SELECT id FROM users WHERE id = :id FOR UPDATE'),
            {'id': user_id},
        )

    async def count_by_user_id(self, user_id: int) -> int:
        result = await self.session.scalar(
            select(func.count())
            .select_from(BaseCVModel)
            .where(BaseCVModel.user_id == user_id)
        )
        return result or 0

    async def list_by_user_id(self, user_id: int) -> list[BaseCVModel]:
        """List the user's master CVs, newest first."""
        result = await self.session.scalars(
            select(BaseCVModel)
            .where(BaseCVModel.user_id == user_id)
            .order_by(
                BaseCVModel.created_at.desc(),
                BaseCVModel.id.desc(),
            )
        )
        return list(result.all())

    async def get_by_id_and_user_id(
        self, id: int, user_id: int
    ) -> BaseCVModel | None:
        """Fetch one master CV owned by ``user_id``.

        Returns ``None`` when the id does not exist *or* belongs to another
        user; the caller maps both to ``ResourceNotFound``.
        """
        return await self.session.scalar(
            select(BaseCVModel).where(
                BaseCVModel.id == id,
                BaseCVModel.user_id == user_id,
            )
        )

    async def create(self, data: BaseCVCreateDTO) -> BaseCVModel:
        """Insert a master CV and commit, releasing the user-row lock.

        The caller enforces the per-user cap first, inside the same
        transaction as ``lock_user``. Section items are stored as plain JSON,
        preserving the client-generated sub-item ids.
        """
        try:
            base_cv = BaseCVModel(
                user_id=data.user_id,
                name=data.name,
                full_name=data.full_name,
                headline=data.headline,
                location=data.location,
                email=data.email,
                phone=data.phone,
                summary=data.summary,
                links=[item.model_dump() for item in data.links],
                skills=[item.model_dump() for item in data.skills],
                experience=[item.model_dump() for item in data.experience],
                projects=[item.model_dump() for item in data.projects],
                education=[item.model_dump() for item in data.education],
                certifications=[
                    item.model_dump() for item in data.certifications
                ],
                languages=[item.model_dump() for item in data.languages],
            )
            self.session.add(base_cv)
            await self.session.commit()
            await self.session.refresh(base_cv)
            return base_cv
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(
        self, base_cv: BaseCVModel, changes: dict[str, Any]
    ) -> BaseCVModel:
        """Apply a partial update to an owned master CV.

        Only the keys present in ``changes`` are assigned; a section provided
        as a list of dicts replaces that section whole. An absent key is never
        written.
        """
        try:
            for key, value in changes.items():
                setattr(base_cv, key, value)
            self.session.add(base_cv)
            await self.session.commit()
            await self.session.refresh(base_cv)
            return base_cv
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, base_cv: BaseCVModel) -> None:
        """Delete an owned master CV. Never blocked by the per-user cap."""
        try:
            await self.session.delete(base_cv)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def rollback(self) -> None:
        """End the current transaction, releasing any user-row lock."""
        await self.session.rollback()
