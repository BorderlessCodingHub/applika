from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import UserModel
from app.presentation.schemas.user import UserCreate


class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_email(self, email: str) -> UserModel | None:
        return await self.session.scalar(
            select(UserModel).where(UserModel.email == email)
        )

    async def create(self, user: UserCreate):
        try:
            db_user = UserModel(**user.model_dump())
            self.session.add(db_user)
            await self.session.commit()
            await self.session.refresh(db_user)
            return db_user
        except Exception as e:
            await self.session.rollback()
            raise e
