from app.application.dto.application import (
    ApplicationCompanyInputDTO,
    ApplicationDTO,
    ApplicationUpdateDTO,
)
from app.application.dto.company import CompanyCreateDTO
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
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo

    async def execute(
        self, id: int, data: ApplicationUpdateDTO
    ) -> ApplicationDTO:
        ensure_not_in_future(data.application_date, 'application_date')

        application = await self.application_repo.get_by_id_and_user_id(
            id, data.user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )
        if application.cycle_id is not None:
            raise BusinessRuleViolation(
                'Cannot modify an application from an archived cycle'
            )

        platform = await self.platform_repo.get_by_id(data.platform_id)
        if not platform:
            raise ResourceNotFound('Platform not found')

        company_id, company_name = await self._resolve_company(
            data.company, data.user_id
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

        application = await self.application_repo.update(application)
        return ApplicationDTO.model_validate(application)

    async def _resolve_company(
        self,
        company: int | ApplicationCompanyInputDTO,
        user_id: int,
    ) -> tuple[int | None, str]:
        if isinstance(company, int):
            existing = await self.company_repo.get_by_id(company)
            if not existing:
                raise ResourceNotFound('Company not found')
            return existing.id, existing.name

        if company.url is not None:
            new_company = await self.company_repo.create(
                CompanyCreateDTO(
                    name=company.name,
                    url=company.url,
                    created_by=user_id,
                )
            )
            return new_company.id, new_company.name

        return None, company.name
