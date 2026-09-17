from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Security
from fastapi.security import APIKeyCookie
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserDTO
from app.application.services.discord_service import DiscordService
from app.application.services.github_service import GitHubService
from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.application.use_cases.base_cvs.create import CreateBaseCVUseCase
from app.application.use_cases.base_cvs.delete import DeleteBaseCVUseCase
from app.application.use_cases.base_cvs.get import GetBaseCVUseCase
from app.application.use_cases.base_cvs.list import ListBaseCVsUseCase
from app.application.use_cases.base_cvs.update import UpdateBaseCVUseCase
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.config.db import get_session
from app.config.redis import get_redis
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.exceptions import ForbiddenAccess
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.cycle_repository import CycleRepository
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


def get_admin_repository(session: DbSession):
    return AdminRepository(session)


AdminRepositoryDp = Annotated[AdminRepository, Depends(get_admin_repository)]


def get_cycle_repository(session: DbSession):
    return CycleRepository(session)


CycleRepositoryDp = Annotated[CycleRepository, Depends(get_cycle_repository)]


def get_discord_service():
    return DiscordService()


DiscordServiceDp = Annotated[DiscordService, Depends(get_discord_service)]


def get_user_feedback_repository(session: DbSession):
    return UserFeedbackRepository(session)


UserFeedbackRepositoryDp = Annotated[
    UserFeedbackRepository, Depends(get_user_feedback_repository)
]


def get_discord_feedback_service():
    return DiscordService(webhook_url=envs.DISCORD_FEEDBACK_WEBHOOK)


DiscordFeedbackServiceDp = Annotated[
    DiscordService, Depends(get_discord_feedback_service)
]


RedisDp = Annotated[aioredis.Redis, Depends(get_redis)]


async def get_github_service(
    redis_client: RedisDp,
) -> GitHubService:
    return GitHubService(redis_client)


GitHubServiceDp = Annotated[GitHubService, Depends(get_github_service)]


async def get_auth_handoff_state_use_case(
    redis_client: RedisDp,
) -> AuthHandoffStateUseCase:
    return AuthHandoffStateUseCase(redis_client)


AuthHandoffStateUseCaseDp = Annotated[
    AuthHandoffStateUseCase, Depends(get_auth_handoff_state_use_case)
]


async def get_current_user(
    user_repo: UserRepositoryDp,
    access_token: str = Security(APIKeyCookie(name=ACCESS_COOKIE_NAME)),
) -> UserDTO:
    use_case = GetCurrentUserUseCase(user_repo)
    return await use_case.execute(access_token)


CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]


async def get_admin_user(
    user: CurrentUserDp,
) -> UserDTO:
    if not user.is_admin:
        raise ForbiddenAccess('Admin access required')
    return user


AdminUserDp = Annotated[UserDTO, Depends(get_admin_user)]


def get_base_cv_repository(session: DbSession):
    return BaseCVRepository(session)


BaseCVRepositoryDp = Annotated[
    BaseCVRepository, Depends(get_base_cv_repository)
]


def get_create_base_cv_use_case(base_cv_repo: BaseCVRepositoryDp):
    return CreateBaseCVUseCase(base_cv_repo)


CreateBaseCVUseCaseDp = Annotated[
    CreateBaseCVUseCase, Depends(get_create_base_cv_use_case)
]


def get_list_base_cvs_use_case(base_cv_repo: BaseCVRepositoryDp):
    return ListBaseCVsUseCase(base_cv_repo)


ListBaseCVsUseCaseDp = Annotated[
    ListBaseCVsUseCase, Depends(get_list_base_cvs_use_case)
]


def get_get_base_cv_use_case(base_cv_repo: BaseCVRepositoryDp):
    return GetBaseCVUseCase(base_cv_repo)


GetBaseCVUseCaseDp = Annotated[
    GetBaseCVUseCase, Depends(get_get_base_cv_use_case)
]


def get_update_base_cv_use_case(base_cv_repo: BaseCVRepositoryDp):
    return UpdateBaseCVUseCase(base_cv_repo)


UpdateBaseCVUseCaseDp = Annotated[
    UpdateBaseCVUseCase, Depends(get_update_base_cv_use_case)
]


def get_delete_base_cv_use_case(base_cv_repo: BaseCVRepositoryDp):
    return DeleteBaseCVUseCase(base_cv_repo)


DeleteBaseCVUseCaseDp = Annotated[
    DeleteBaseCVUseCase, Depends(get_delete_base_cv_use_case)
]
