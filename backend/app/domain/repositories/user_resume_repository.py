from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import UserResumeModel


class UserResumeRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_all_by_user(self, user_id: int) -> list[UserResumeModel]:
        result = await self.session.scalars(
            select(UserResumeModel)
            .where(UserResumeModel.user_id == user_id)
            .order_by(UserResumeModel.created_at.desc())
        )
        return list(result)

    async def get_by_id_and_user(
        self, id: int, user_id: int
    ) -> UserResumeModel | None:
        return await self.session.scalar(
            select(UserResumeModel).where(
                UserResumeModel.id == id,
                UserResumeModel.user_id == user_id,
            )
        )

    async def get_default_by_user(
        self, user_id: int
    ) -> UserResumeModel | None:
        return await self.session.scalar(
            select(UserResumeModel).where(
                UserResumeModel.user_id == user_id,
                UserResumeModel.is_default == True,  # noqa: E712
            )
        )

    async def create(
        self,
        user_id: int,
        filename: str,
        content_type: str,
        storage_path: str,
        parsed_text: str,
        byte_size: int,
        is_default: bool,
    ) -> UserResumeModel:
        try:
            resume = UserResumeModel(
                user_id=user_id,
                filename=filename,
                content_type=content_type,
                storage_path=storage_path,
                parsed_text=parsed_text,
                byte_size=byte_size,
                is_default=is_default,
            )
            self.session.add(resume)
            await self.session.commit()
            await self.session.refresh(resume)
            return resume
        except Exception as e:
            await self.session.rollback()
            raise e

    async def set_default(self, resume_id: int, user_id: int) -> None:
        try:
            await self.session.execute(
                update(UserResumeModel)
                .where(UserResumeModel.user_id == user_id)
                .values(is_default=False)
            )
            await self.session.execute(
                update(UserResumeModel)
                .where(
                    UserResumeModel.id == resume_id,
                    UserResumeModel.user_id == user_id,
                )
                .values(is_default=True)
            )
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e

    async def delete(self, resume: UserResumeModel) -> None:
        try:
            await self.session.delete(resume)
            await self.session.commit()
        except Exception as e:
            await self.session.rollback()
            raise e
