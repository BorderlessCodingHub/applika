from app.application.dto.application import (
    ApplicationDTO,
    ApplicationUpdateDTO,
)
from app.core.exceptions import ResourceNotFound
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
        application = await self.application_repo.get_by_id_and_user_id(
            id, data.user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )

        # Validate platform exists
        platform = await self.platform_repo.get_by_id(data.platform_id)
        if not platform:
            raise ResourceNotFound('Platform not found')

        # Validate company exists
        company = await self.company_repo.get_by_id(data.company_id)
        if not company:
            raise ResourceNotFound('Company not found')

        application.company_id = data.company_id
        application.old_company = data.old_company
        application.role = data.role
        application.mode = data.mode
        application.platform_id = data.platform_id
        application.application_date = data.application_date
        application.link_to_job = (str(data.link_to_job)
                                   if data.link_to_job else None)
        application.observation = data.observation
        application.expected_salary = data.expected_salary
        application.salary_range_min = data.salary_range_min
        application.salary_range_max = data.salary_range_max

        application = await self.application_repo.update(application)
        return ApplicationDTO.model_validate(application)
