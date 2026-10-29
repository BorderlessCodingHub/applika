"""The Borderless binding of an applika user (ADR-0024).

Methods commit unless ``commit=False`` is passed, so a use case that needs
one transaction (the GitHub restore) shares the session and commits once.
"""

from datetime import UTC, datetime

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import BorderlessAccountStatus
from app.domain.models import BorderlessAccountModel


class BorderlessAccountRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_borderless_id(
        self, borderless_user_id: str
    ) -> BorderlessAccountModel | None:
        return await self.session.scalar(
            select(BorderlessAccountModel).where(
                BorderlessAccountModel.borderless_user_id == borderless_user_id
            )
        )

    async def get_by_user_id(
        self, user_id: int
    ) -> BorderlessAccountModel | None:
        return await self.session.scalar(
            select(BorderlessAccountModel).where(
                BorderlessAccountModel.user_id == user_id
            )
        )

    async def get_by_user_id_for_update(
        self, user_id: int
    ) -> BorderlessAccountModel | None:
        return await self.session.scalar(
            select(BorderlessAccountModel)
            .where(BorderlessAccountModel.user_id == user_id)
            .with_for_update()
        )

    async def _commit(self, commit: bool) -> None:
        try:
            if commit:
                await self.session.commit()
            else:
                await self.session.flush()
        except Exception:
            await self.session.rollback()
            raise

    async def bind(
        self,
        *,
        user_id: int,
        borderless_user_id: str,
        email: str,
        encrypted_access_token: str,
        access_token_expires_at: datetime,
        commit: bool = True,
    ) -> BorderlessAccountModel:
        binding = BorderlessAccountModel(
            user_id=user_id,
            borderless_user_id=borderless_user_id,
            email=email,
            encrypted_access_token=encrypted_access_token,
            access_token_expires_at=access_token_expires_at,
            status=BorderlessAccountStatus.ACTIVE.value,
            linked_at=datetime.now(UTC),
        )
        self.session.add(binding)
        await self._commit(commit)
        return binding

    async def store_tokens(
        self,
        binding: BorderlessAccountModel,
        *,
        email: str,
        encrypted_access_token: str,
        access_token_expires_at: datetime,
        commit: bool = True,
    ) -> BorderlessAccountModel:
        binding.email = email
        binding.encrypted_access_token = encrypted_access_token
        binding.access_token_expires_at = access_token_expires_at
        binding.status = BorderlessAccountStatus.ACTIVE.value
        binding.updated_at = datetime.now(UTC)
        self.session.add(binding)
        await self._commit(commit)
        return binding

    async def mark_read_ok(
        self, binding: BorderlessAccountModel, commit: bool = True
    ) -> None:
        binding.profile_read_at = datetime.now(UTC)
        binding.updated_at = datetime.now(UTC)
        await self._commit(commit)

    async def mark_read_failed(
        self, binding: BorderlessAccountModel, commit: bool = True
    ) -> None:
        binding.profile_read_failed_at = datetime.now(UTC)
        binding.updated_at = datetime.now(UTC)
        await self._commit(commit)

    async def mark_needs_reconnect(
        self, binding: BorderlessAccountModel, commit: bool = True
    ) -> None:
        binding.status = BorderlessAccountStatus.NEEDS_RECONNECT.value
        binding.updated_at = datetime.now(UTC)
        await self._commit(commit)

    async def move_to_user(
        self, from_user_id: int, to_user_id: int, commit: bool = True
    ) -> None:
        await self.session.execute(
            update(BorderlessAccountModel)
            .where(BorderlessAccountModel.user_id == from_user_id)
            .values(user_id=to_user_id, updated_at=datetime.now(UTC))
        )
        await self._commit(commit)
