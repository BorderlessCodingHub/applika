from app.application.dto.application_draft import DraftDTO, DraftInputDTO
from app.application.use_cases.application_drafts.create_draft import (
    resolve_draft_company,
    to_draft_dto,
)
from app.application.use_cases.catalog.resolve import ensure_platform_visible
from app.application.validators.application_date import ensure_not_in_future
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository


class UpdateDraftUseCase:
    """Full-replace update of a draft's application data.

    The CV copy is untouched: this use case never reads or writes
    ``tailored_cv`` (KODI-032 acceptance #4 - going back to step 1, changing
    the data and returning to step 2 must not lose the copy). ``job_id``
    (KODI-047) is untouched too: it is not part of ``DraftInputDTO``, so a
    draft started from a job stays tied to it (plan 0012 corrections 19).
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo

    async def execute(self, id: int, data: DraftInputDTO) -> DraftDTO:
        # KODI-036: validated up front, before the draft is even fetched,
        # so a future date writes nothing.
        if data.application_date is not None:
            ensure_not_in_future(data.application_date, 'application_date')

        application = await self.application_repo.get_draft(id, data.user_id)
        if not application:
            raise ResourceNotFound('Draft not found')

        await ensure_platform_visible(
            self.platform_repo, data.platform_id, data.user_id
        )

        company_id, company_name = await resolve_draft_company(
            self.company_repo, data.user_id, data.company_id, data.company_name
        )

        application.company_id = company_id
        application.company_name = company_name
        application.role = data.role
        application.mode = data.mode
        application.platform_id = data.platform_id
        application.link_to_job = (
            str(data.link_to_job) if data.link_to_job else None
        )
        application.observation = data.observation
        application.expected_salary = data.expected_salary
        application.salary_range_min = data.salary_range_min
        application.salary_range_max = data.salary_range_max
        application.currency = data.currency
        application.salary_period = data.salary_period
        application.experience_level = data.experience_level
        application.work_mode = data.work_mode
        application.country = data.country
        application.job_description = data.job_description
        # KODI-036, R-003: application_date is sticky, unlike every other
        # field above - an omitted key or an explicit null both mean "keep
        # the stored value" (never clears), so only a given value is applied.
        if data.application_date is not None:
            application.application_date = data.application_date

        application = await self.application_repo.update(application)
        return to_draft_dto(
            application, has_cv=application.tailored_cv is not None
        )
