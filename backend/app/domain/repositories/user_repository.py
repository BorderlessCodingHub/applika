from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserCreateDTO
from app.core.exceptions import ResourceConflict
from app.domain.models import UserModel

DISCORD_ALREADY_LINKED = (
    'This Discord account is linked to another Applika account'
)


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_github_id(self, id: int) -> UserModel | None:
        return await self.session.scalar(
            select(UserModel).where(UserModel.github_id == id)
        )

    async def get_by_id(self, id: int) -> UserModel | None:
        return await self.session.scalar(
            select(UserModel).where(UserModel.id == id)
        )

    async def get_by_discord_id(self, discord_id: int) -> UserModel | None:
        return await self.session.scalar(
            select(UserModel).where(UserModel.discord_id == discord_id)
        )

    async def link_discord(self, user_id: int, discord_id: int) -> UserModel:
        """Link ``discord_id`` to ``user_id`` (T012, T026).

        A Discord account is linked to at most one Applika user (R-005). The
        same user relinking the same id is a no-op. Another owner - found by
        a pre-check or lost a race and caught as an ``IntegrityError`` on the
        unique index ``ix_users_discord_id`` - is a ``ResourceConflict`` and
        neither user's row changes.
        """
        owner = await self.get_by_discord_id(discord_id)
        if owner is not None and owner.id != user_id:
            raise ResourceConflict(DISCORD_ALREADY_LINKED)

        user = await self.get_by_id(user_id)
        if user is None:
            raise ResourceConflict(DISCORD_ALREADY_LINKED)
        if user.discord_id == discord_id:
            return user

        try:
            user.discord_id = discord_id
            self.session.add(user)
            await self.session.commit()
            await self.session.refresh(user)
            return user
        except IntegrityError as err:
            await self.session.rollback()
            raise ResourceConflict(DISCORD_ALREADY_LINKED) from err
        except Exception as e:
            await self.session.rollback()
            raise e

    async def unlink_discord(self, user_id: int) -> UserModel | None:
        """Clear ``discord_id`` (T031). Idempotent: already unlinked is a
        no-op, and calls nothing at Discord."""
        user = await self.get_by_id(user_id)
        if user is None:
            return None
        if user.discord_id is None:
            return user

        try:
            user.discord_id = None
            self.session.add(user)
            await self.session.commit()
            await self.session.refresh(user)
            return user
        except Exception as e:
            await self.session.rollback()
            raise e

    async def create(self, user: UserCreateDTO) -> UserModel:
        try:
            db_user = UserModel(**user.model_dump())
            self.session.add(db_user)
            await self.session.commit()
            await self.session.refresh(db_user)
            return db_user
        except Exception as e:
            await self.session.rollback()
            raise e

    async def update(self, user: UserModel) -> UserModel:
        try:
            self.session.add(user)
            await self.session.commit()
            await self.session.refresh(user)
            return user
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, user: UserModel) -> None:
        try:
            await self.session.execute(
                delete(UserModel).where(UserModel.id == user.id)
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
