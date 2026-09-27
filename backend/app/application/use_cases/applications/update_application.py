from app.application.dto.application import (
    ApplicationDTO,
    ApplicationUpdateDTO,
)
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.use_cases.catalog.resolve import (
    ensure_platform_visible,
    resolve_company,
)
from app.application.validators.application_date import ensure_not_in_future
from app.core.exceptions import BusinessRuleViolation, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository


class UpdateApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
        read_model: ApplicationReadModel,
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo
        self.read_model = read_model

    async def execute(
        self, id: int, data: ApplicationUpdateDTO
    ) -> ApplicationDTO:
        ensure_not_in_future(data.application_date, 'application_date')

        application = await self.application_repo.get_by_id_and_user_id(
            id, data.user_id
        )
        if not application:
            raise ResourceNotFound('Application not found or not owned by user')
        if application.cycle_id is not None:
            raise BusinessRuleViolation(
                'Cannot modify an application from an archived cycle'
            )

        # Platform, then company, then the write - a 404 on either writes
        # nothing (ADR-0014).
        await ensure_platform_visible(
            self.platform_repo, data.platform_id, data.user_id
        )

        company_id, company_name = await resolve_company(
            self.company_repo, data.company, data.user_id
        )

        application.company_id = company_id
        application.company_name = company_name
        application.role = data.role
        application.mode = data.mode
        application.platform_id = data.platform_id
        application.application_date = data.application_date
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
        # Every field above is a full replace: an omitted optional field
        # clears the stored value, which is the PUT contract published
        # applika-cli versions rely on. job_description is the one exception
        # and it keys off set-ness, not value: the route forwards the key only
        # when the client actually sent it, so a client that knows nothing
        # about the field leaves the stored text alone, while an explicit
        # null still clears it.
        if 'job_description' in data.model_fields_set:
            application.job_description = data.job_description

        application = await self.application_repo.update(application)
        return await self.read_model.one(application)
