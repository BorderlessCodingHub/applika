from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.db import get_session
from app.domain.repositories.user_repository import UserRepository

DbSession = Annotated[AsyncSession, Depends(get_session)]


def get_user_repository(session: DbSession):
    return UserRepository(db_session=session)


UserRepository = Annotated[UserRepository, Depends(get_user_repository)]
