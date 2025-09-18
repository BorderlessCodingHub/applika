from typing import Annotated

from fastapi import Depends, Security
from fastapi.security import APIKeyCookie, OAuth2
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserDTO
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.db import get_session
from app.config.settings import ACCESS_COOKIE_NAME
from app.domain.repositories.user_repository import UserRepository

DbSession = Annotated[AsyncSession, Depends(get_session)]


def get_user_repository(session: DbSession):
    return UserRepository(session)


UserRepositoryDp = Annotated[UserRepository, Depends(get_user_repository)]


async def get_current_user(
        user_repo: UserRepositoryDp, access_token: str = Security(
            APIKeyCookie(name=ACCESS_COOKIE_NAME))) -> UserDTO:
    use_case = GetCurrentUserUseCase(user_repo)
    return await use_case.execute(access_token)


CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]
