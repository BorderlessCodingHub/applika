from typing import Annotated

import redis.asyncio as aioredis
from fastapi import Depends, Security
from fastapi.security import APIKeyCookie
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.tailored_cv import TailoringMode
from app.application.dto.user import UserDTO
from app.application.services.clone_tailoring import CloneTailoringService
from app.application.services.cv_rendering.diff_pdf_renderer import (
    CVDiffPdfRenderer,
    get_cv_diff_pdf_renderer,
)
from app.application.services.cv_rendering.markdown_renderer import (
    CVMarkdownRenderer,
    get_cv_markdown_renderer,
)
from app.application.services.cv_rendering.renderer import (
    CVPdfRenderer,
    get_cv_pdf_renderer,
)
from app.application.services.discord_oauth_service import (
    DiscordOAuthService,
)
from app.application.services.discord_service import DiscordService
from app.application.services.github_service import GitHubService
from app.application.services.job_queue import JobQueue
from app.application.services.keyword_tailoring import (
    KeywordTailoringService,
)
from app.application.services.tailoring import (
    TailoringResolver,
    TailoringService,
)
from app.application.use_cases.account_link_state import (
    AccountLinkStateUseCase,
)
from app.application.use_cases.account_links.link_discord import (
    LinkDiscordUseCase,
)
from app.application.use_cases.account_links.unlink_discord import (
    UnlinkDiscordUseCase,
)
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.use_cases.auth_handoff_state import (
    AuthHandoffStateUseCase,
)
from app.application.use_cases.base_cvs.create import CreateBaseCVUseCase
from app.application.use_cases.base_cvs.delete import DeleteBaseCVUseCase
from app.application.use_cases.base_cvs.get import GetBaseCVUseCase
from app.application.use_cases.base_cvs.list import ListBaseCVsUseCase
from app.application.use_cases.base_cvs.render_markdown import (
    RenderBaseCVMarkdownUseCase,
)
from app.application.use_cases.base_cvs.render_pdf import (
    RenderBaseCVPdfUseCase,
)
from app.application.use_cases.base_cvs.update import UpdateBaseCVUseCase
from app.application.use_cases.get_current_user import GetCurrentUserUseCase
from app.application.use_cases.quinzenal_reports.resolve_report_webhooks import (
    ResolveReportWebhooksUseCase,
)
from app.application.use_cases.tailored_cvs.create import (
    CreateTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.delete import (
    DeleteTailoredCVUseCase,
)
from app.application.use_cases.tailored_cvs.diff import (
    ComputeTailoredCVDiffUseCase,
)
from app.application.use_cases.tailored_cvs.fit import (
    GetTailoredCVFitUseCase,
)
from app.application.use_cases.tailored_cvs.get import GetTailoredCVUseCase
from app.application.use_cases.tailored_cvs.render_diff_markdown import (
    RenderTailoredCVDiffMarkdownUseCase,
)
from app.application.use_cases.tailored_cvs.render_diff_pdf import (
    RenderTailoredCVDiffPdfUseCase,
)
from app.application.use_cases.tailored_cvs.render_markdown import (
    RenderTailoredCVMarkdownUseCase,
)
from app.application.use_cases.tailored_cvs.render_pdf import (
    RenderTailoredCVPdfUseCase,
)
from app.application.use_cases.tailored_cvs.update import (
    UpdateTailoredCVUseCase,
)
from app.config.db import get_session
from app.config.redis import get_redis
from app.config.settings import ACCESS_COOKIE_NAME, envs
from app.core.exceptions import ForbiddenAccess
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.cycle_repository import CycleRepository
from app.domain.repositories.discord_connection_repository import (
    DiscordConnectionRepository,
)
from app.domain.repositories.discord_report_webhook_repository import (
    DiscordReportWebhookRepository,
)
from app.domain.repositories.feedback_definition_repository import (
    FeedbackDefinitionRepository,
)
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)
from app.domain.repositories.platform_repository import PlatformRepository
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.tailored_cv_repository import (
    TailoredCVRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)
from app.domain.repositories.user_feedback_repository import (
    UserFeedbackRepository,
)
from app.domain.repositories.user_repository import UserRepository
from app.domain.repositories.user_statistic_repository import (
    UserStatsRepository,
)
from app.worker.queue import TaskiqJobQueue

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


def get_timeline_event_repository(session: DbSession):
    return TimelineEventRepository(session)


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


def get_discord_report_webhook_repository(session: DbSession):
    return DiscordReportWebhookRepository(session)


DiscordReportWebhookRepositoryDp = Annotated[
    DiscordReportWebhookRepository,
    Depends(get_discord_report_webhook_repository),
]

QuinzenalReportRepositoryDp = Annotated[
    QuinzenalReportRepository, Depends(get_quinzenal_report_repository)
]

TimelineEventRepositoryDp = Annotated[
    TimelineEventRepository, Depends(get_timeline_event_repository)
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


def get_application_read_model(
    timeline_event_repo: TimelineEventRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
):
    return ApplicationReadModel(timeline_event_repo, step_repo)


ApplicationReadModelDp = Annotated[
    ApplicationReadModel, Depends(get_application_read_model)
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


def get_discord_oauth_service() -> DiscordOAuthService:
    return DiscordOAuthService()


DiscordOAuthServiceDp = Annotated[
    DiscordOAuthService, Depends(get_discord_oauth_service)
]


async def get_account_link_state_use_case(
    redis_client: RedisDp,
) -> AccountLinkStateUseCase:
    return AccountLinkStateUseCase(redis_client)


AccountLinkStateUseCaseDp = Annotated[
    AccountLinkStateUseCase, Depends(get_account_link_state_use_case)
]


async def get_job_queue(redis_client: RedisDp) -> JobQueue:
    """The background worker's queue (ADR-0016), bound to taskiq; the lock
    it reads lives on the API's own Redis."""
    return TaskiqJobQueue(redis_client)


JobQueueDp = Annotated[JobQueue, Depends(get_job_queue)]


def get_job_source_repository(session: DbSession) -> JobSourceRepository:
    return JobSourceRepository(session)


JobSourceRepositoryDp = Annotated[
    JobSourceRepository, Depends(get_job_source_repository)
]


def get_discord_connection_repository(session: DbSession):
    return DiscordConnectionRepository(session)


DiscordConnectionRepositoryDp = Annotated[
    DiscordConnectionRepository, Depends(get_discord_connection_repository)
]


def get_link_discord_use_case(
    conn_repo: DiscordConnectionRepositoryDp,
):
    return LinkDiscordUseCase(conn_repo)


LinkDiscordUseCaseDp = Annotated[
    LinkDiscordUseCase, Depends(get_link_discord_use_case)
]


def get_resolve_report_webhooks_use_case(
    conn_repo: DiscordConnectionRepositoryDp,
    webhook_repo: DiscordReportWebhookRepositoryDp,
    discord_oauth: DiscordOAuthServiceDp,
):
    return ResolveReportWebhooksUseCase(conn_repo, webhook_repo, discord_oauth)


ResolveReportWebhooksUseCaseDp = Annotated[
    ResolveReportWebhooksUseCase,
    Depends(get_resolve_report_webhooks_use_case),
]


def get_unlink_discord_use_case(
    conn_repo: DiscordConnectionRepositoryDp,
    discord_oauth: DiscordOAuthServiceDp,
):
    return UnlinkDiscordUseCase(conn_repo, discord_oauth)


UnlinkDiscordUseCaseDp = Annotated[
    UnlinkDiscordUseCase, Depends(get_unlink_discord_use_case)
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


def get_cv_pdf_renderer_service() -> CVPdfRenderer:
    """Bind the PDF renderer. One implementation, one fixed theme.

    Stateless and session-free: a render reads nothing but the CV document
    it is handed, so there is nothing to scope per request beyond the
    instance itself.
    """
    return get_cv_pdf_renderer()


CVPdfRendererDp = Annotated[CVPdfRenderer, Depends(get_cv_pdf_renderer_service)]


def get_render_base_cv_pdf_use_case(
    base_cv_repo: BaseCVRepositoryDp,
    renderer: CVPdfRendererDp,
):
    return RenderBaseCVPdfUseCase(base_cv_repo, renderer)


RenderBaseCVPdfUseCaseDp = Annotated[
    RenderBaseCVPdfUseCase, Depends(get_render_base_cv_pdf_use_case)
]


def get_cv_markdown_renderer_service() -> CVMarkdownRenderer:
    """Bind the Markdown renderer. Stateless, same as the PDF renderer."""
    return get_cv_markdown_renderer()


CVMarkdownRendererDp = Annotated[
    CVMarkdownRenderer, Depends(get_cv_markdown_renderer_service)
]


def get_cv_diff_pdf_renderer_service() -> CVDiffPdfRenderer:
    """Bind the diff PDF renderer. Stateless, same as the CV PDF renderer."""
    return get_cv_diff_pdf_renderer()


CVDiffPdfRendererDp = Annotated[
    CVDiffPdfRenderer, Depends(get_cv_diff_pdf_renderer_service)
]


def get_render_base_cv_markdown_use_case(
    base_cv_repo: BaseCVRepositoryDp,
    renderer: CVMarkdownRendererDp,
):
    return RenderBaseCVMarkdownUseCase(base_cv_repo, renderer)


RenderBaseCVMarkdownUseCaseDp = Annotated[
    RenderBaseCVMarkdownUseCase,
    Depends(get_render_base_cv_markdown_use_case),
]


def get_tailored_cv_repository(session: DbSession):
    return TailoredCVRepository(session)


TailoredCVRepositoryDp = Annotated[
    TailoredCVRepository, Depends(get_tailored_cv_repository)
]


def resolve_tailoring(tailoring: TailoringMode) -> TailoringService:
    """Pick the tailoring binding for one request (ADR-0017).

    ``'copy'`` is the verbatim clone - the default everywhere, and what every
    installed ``applika-cli`` gets because it never sends the field.
    ``'keywords'`` is the keyword binding. Neither uses a model.
    """
    if tailoring == 'keywords':
        return KeywordTailoringService()
    return CloneTailoringService()


def get_tailoring_resolver() -> TailoringResolver:
    """The per-request binding resolver; a test overrides this to fake one."""
    return resolve_tailoring


TailoringResolverDp = Annotated[
    TailoringResolver, Depends(get_tailoring_resolver)
]


def get_create_tailored_cv_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    base_cv_repo: BaseCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
    tailoring_resolver: TailoringResolverDp,
):
    return CreateTailoredCVUseCase(
        tailored_cv_repo, base_cv_repo, application_repo, tailoring_resolver
    )


CreateTailoredCVUseCaseDp = Annotated[
    CreateTailoredCVUseCase, Depends(get_create_tailored_cv_use_case)
]


def get_get_tailored_cv_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
):
    return GetTailoredCVUseCase(tailored_cv_repo, application_repo)


GetTailoredCVUseCaseDp = Annotated[
    GetTailoredCVUseCase, Depends(get_get_tailored_cv_use_case)
]


def get_get_tailored_cv_fit_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
):
    return GetTailoredCVFitUseCase(tailored_cv_repo, application_repo)


GetTailoredCVFitUseCaseDp = Annotated[
    GetTailoredCVFitUseCase, Depends(get_get_tailored_cv_fit_use_case)
]


def get_update_tailored_cv_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
):
    return UpdateTailoredCVUseCase(tailored_cv_repo, application_repo)


UpdateTailoredCVUseCaseDp = Annotated[
    UpdateTailoredCVUseCase, Depends(get_update_tailored_cv_use_case)
]


def get_delete_tailored_cv_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
):
    return DeleteTailoredCVUseCase(tailored_cv_repo, application_repo)


DeleteTailoredCVUseCaseDp = Annotated[
    DeleteTailoredCVUseCase, Depends(get_delete_tailored_cv_use_case)
]


def get_render_tailored_cv_pdf_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
    renderer: CVPdfRendererDp,
):
    return RenderTailoredCVPdfUseCase(
        tailored_cv_repo, application_repo, renderer
    )


RenderTailoredCVPdfUseCaseDp = Annotated[
    RenderTailoredCVPdfUseCase, Depends(get_render_tailored_cv_pdf_use_case)
]


def get_render_tailored_cv_markdown_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
    renderer: CVMarkdownRendererDp,
):
    return RenderTailoredCVMarkdownUseCase(
        tailored_cv_repo, application_repo, renderer
    )


RenderTailoredCVMarkdownUseCaseDp = Annotated[
    RenderTailoredCVMarkdownUseCase,
    Depends(get_render_tailored_cv_markdown_use_case),
]


def get_compute_tailored_cv_diff_use_case(
    tailored_cv_repo: TailoredCVRepositoryDp,
    application_repo: ApplicationRepositoryDp,
    base_cv_repo: BaseCVRepositoryDp,
):
    return ComputeTailoredCVDiffUseCase(
        tailored_cv_repo, application_repo, base_cv_repo
    )


ComputeTailoredCVDiffUseCaseDp = Annotated[
    ComputeTailoredCVDiffUseCase,
    Depends(get_compute_tailored_cv_diff_use_case),
]


def get_render_tailored_cv_diff_markdown_use_case(
    compute_diff: ComputeTailoredCVDiffUseCaseDp,
):
    return RenderTailoredCVDiffMarkdownUseCase(compute_diff)


RenderTailoredCVDiffMarkdownUseCaseDp = Annotated[
    RenderTailoredCVDiffMarkdownUseCase,
    Depends(get_render_tailored_cv_diff_markdown_use_case),
]


def get_render_tailored_cv_diff_pdf_use_case(
    compute_diff: ComputeTailoredCVDiffUseCaseDp,
    renderer: CVDiffPdfRendererDp,
):
    return RenderTailoredCVDiffPdfUseCase(compute_diff, renderer)


RenderTailoredCVDiffPdfUseCaseDp = Annotated[
    RenderTailoredCVDiffPdfUseCase,
    Depends(get_render_tailored_cv_diff_pdf_use_case),
]
