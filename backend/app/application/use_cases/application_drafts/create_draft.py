from app.application.dto.application_draft import DraftDTO, DraftInputDTO
from app.application.use_cases.catalog.resolve import ensure_platform_visible
from app.core.exceptions import ResourceNotFound
from app.domain.models import ApplicationModel
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository


async def resolve_draft_company(
    company_repo: CompanyRepository,
    user_id: int,
    company_id: int | None,
    company_name: str,
) -> tuple[int | None, str]:
    """Turn a draft's ``company_id | company_name`` into
    ``(company_id, company_name)`` for the application row.

    Unlike the ordinary application flow (``catalog/resolve.resolve_company``)
    the draft body never carries a URL, so there is no "create a private
    company from name+url" branch here - an id must be visible to
    ``user_id`` (``ResourceNotFound('Company not found')`` otherwise,
    before anything is written, R-024/R-026), and a bare name stays free
    text with no row, same as ``{name, url: null}`` (R-024-3).
    """
    if company_id is None:
        return None, company_name
    existing = await company_repo.get_visible(company_id, user_id)
    if not existing:
        raise ResourceNotFound('Company not found')
    return existing.id, existing.name


def to_draft_dto(application: ApplicationModel, has_cv: bool) -> DraftDTO:
    """Build the ``Draft`` response DTO - ``ApplicationModel`` has no
    ``has_cv`` attribute, so this is a manual mapping rather than
    ``model_validate``."""
    return DraftDTO(
        id=application.id,
        created_at=application.created_at,
        updated_at=application.updated_at,
        company_id=application.company_id,
        company_name=application.company_name,
        role=application.role,
        mode=application.mode,
        platform_id=application.platform_id,
        link_to_job=application.link_to_job,
        observation=application.observation,
        expected_salary=application.expected_salary,
        salary_range_min=application.salary_range_min,
        salary_range_max=application.salary_range_max,
        currency=application.currency,
        salary_period=application.salary_period,
        experience_level=application.experience_level,
        work_mode=application.work_mode,
        country=application.country,
        job_description=application.job_description,
        has_cv=has_cv,
    )


class CreateDraftUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo

    async def execute(self, data: DraftInputDTO) -> DraftDTO:
        # Platform, then company, then the write - a 404 on either writes
        # nothing (ADR-0014).
        await ensure_platform_visible(
            self.platform_repo, data.platform_id, data.user_id
        )

        company_id, company_name = await resolve_draft_company(
            self.company_repo, data.user_id, data.company_id, data.company_name
        )

        application = await self.application_repo.create_draft(
            data, company_id=company_id, company_name=company_name
        )
        return to_draft_dto(application, has_cv=False)
