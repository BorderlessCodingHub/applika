from typing import Annotated

from fastapi import Depends, Security
from fastapi.security import APIKeyCookie
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserDTO
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.db import get_session
from app.config.settings import ACCESS_COOKIE_NAME
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.platform_repository import PlatformRepository
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.user_repository import UserRepository

DbSession = Annotated[AsyncSession, Depends(get_session)]


def get_user_repository(session: DbSession):
    return UserRepository(session)


def get_feedback_definition_repository(session: DbSession):
    return FeedbackDefinitionRepository(session)


def get_step_definition_repository(session: DbSession):
    return StepDefinitionRepository(session)


def get_platform_repository(session: DbSession):
    return PlatformRepository(session)


def get_application_step_repository(session: DbSession):
    return ApplicationStepRepository(session)


def get_application_repository(session: DbSession):
    return ApplicationRepository(session)


UserRepositoryDp = Annotated[UserRepository, Depends(get_user_repository)]

FeedbackDefinitionRepositoryDp = Annotated[
    FeedbackDefinitionRepository, Depends(get_feedback_definition_repository)
]

StepDefinitionRepositoryDp = Annotated[
    StepDefinitionRepository, Depends(get_step_definition_repository)
]

PlatformRepositoryDp = Annotated[
    PlatformRepository, Depends(get_platform_repository)
]

ApplicationStepRepositoryDp = Annotated[
    ApplicationStepRepository, Depends(get_application_step_repository)
]

ApplicationRepositoryDp = Annotated[
    ApplicationRepository, Depends(get_application_repository)
]


async def get_current_user(
    user_repo: UserRepositoryDp,
    access_token: str = Security(APIKeyCookie(name=ACCESS_COOKIE_NAME)),
) -> UserDTO:
    use_case = GetCurrentUserUseCase(user_repo)
    return await use_case.execute(access_token)


CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]
