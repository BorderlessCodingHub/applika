from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserCreateDTO
from app.domain.models import UserModel


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_github_id(self, id: int) -> UserModel | None:
        return await self.session.scalar(
            select(UserModel).where(UserModel.github_id == id)
        )

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
