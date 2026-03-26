from typing import Annotated

from fastapi import Depends, Security
from fastapi.security import APIKeyCookie
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserDTO
from app.application.services.discord_service import DiscordService
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.db import get_session
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.platform_repository import PlatformRepository
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.user_feedback_repository import (
    UserFeedbackRepository,
)
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)

DbSession = Annotated[AsyncSession, Depends(get_session)]


def get_user_repository(session: DbSession):
    return UserRepository(session)


def get_feedback_definition_repository(session: DbSession):
    return FeedbackDefinitionRepository(session)


def get_step_definition_repository(session: DbSession):
    return StepDefinitionRepository(session)


def get_platform_repository(session: DbSession):
    return PlatformRepository(session)


def get_quinzenal_report_repository(session: DbSession):
    return QuinzenalReportRepository(session)


def get_application_step_repository(session: DbSession):
    return ApplicationStepRepository(session)


def get_company_repository(session: DbSession):
    return CompanyRepository(session)


def get_application_repository(session: DbSession):
    return ApplicationRepository(session)


def get_user_statistics_repository(session: DbSession):
    return UserStatsRepository(session)


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

QuinzenalReportRepositoryDp = Annotated[
    QuinzenalReportRepository, Depends(get_quinzenal_report_repository)
]

ApplicationStepRepositoryDp = Annotated[
    ApplicationStepRepository, Depends(get_application_step_repository)
]

CompanyRepositoryDp = Annotated[
    CompanyRepository, Depends(get_company_repository)
]

ApplicationRepositoryDp = Annotated[
    ApplicationRepository, Depends(get_application_repository)
]

UserStatsRepositoryDp = Annotated[
    UserStatsRepository, Depends(get_user_statistics_repository)
]


def get_discord_service():
    return DiscordService()


DiscordServiceDp = Annotated[DiscordService, Depends(get_discord_service)]


def get_user_feedback_repository(session: DbSession):
    return UserFeedbackRepository(session)


UserFeedbackRepositoryDp = Annotated[
    UserFeedbackRepository, Depends(get_user_feedback_repository)
]


def get_discord_feedback_service():
    return DiscordService(
        webhook_url=envs.DISCORD_FEEDBACK_WEBHOOK
    )


DiscordFeedbackServiceDp = Annotated[
    DiscordService, Depends(get_discord_feedback_service)
]


async def get_current_user(
    user_repo: UserRepositoryDp,
    access_token: str = Security(APIKeyCookie(name=ACCESS_COOKIE_NAME)),
) -> UserDTO:
    use_case = GetCurrentUserUseCase(user_repo)
    return await use_case.execute(access_token)


CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]
