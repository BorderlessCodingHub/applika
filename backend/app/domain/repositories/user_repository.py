from datetime import UTC, datetime

from sqlalchemy import delete, exists, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserCreateDTO
from app.domain.models import (
    ApplicationModel,
    BaseCVModel,
    CycleModel,
    QuinzenalReportModel,
    TailoredCVModel,
    TimelineEventModel,
    UserModel,
)

# Every table whose rows make an account "hold data" (ADR-0024): a restore
# never merges two accounts that both hold data. Applications include
# drafts (``is_draft``).
DATA_TABLES = (
    ApplicationModel,
    CycleModel,
    QuinzenalReportModel,
    BaseCVModel,
    TailoredCVModel,
    TimelineEventModel,
)


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, id: int) -> UserModel | None:
        return await self.session.scalar(
            select(UserModel).where(UserModel.id == id)
        )

    async def find_by_email_ci(self, email: str) -> list[UserModel]:
        """Accounts whose email equals ``email`` ignoring case, the exact
        spelling first."""
        result = await self.session.scalars(
            select(UserModel)
            .where(func.lower(UserModel.email) == email.lower())
            .order_by((UserModel.email != email), UserModel.id)
        )
        return list(result)

    async def holds_data(self, user_id: int) -> bool:
        clauses = [
            exists().where(model.user_id == user_id) for model in DATA_TABLES
        ]
        return bool(await self.session.scalar(select(or_(*clauses))))

    async def mark_restore_prompt_seen(self, user_id: int) -> None:
        try:
            await self.session.execute(
                update(UserModel)
                .where(
                    UserModel.id == user_id,
                    UserModel.github_restore_prompt_seen_at.is_(None),
                )
                .values(github_restore_prompt_seen_at=datetime.now(UTC))
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def create(
        self, user: UserCreateDTO, commit: bool = True
    ) -> UserModel:
        try:
            db_user = UserModel(**user.model_dump())
            self.session.add(db_user)
            if commit:
                await self.session.commit()
                await self.session.refresh(db_user)
            else:
                await self.session.flush()
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

    async def delete(self, user: UserModel, commit: bool = True) -> None:
        try:
            await self.session.execute(
                delete(UserModel).where(UserModel.id == user.id)
            )
            if commit:
                await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
