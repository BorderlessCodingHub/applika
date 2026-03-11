from app.application.dto.application import (
    ApplicationCreateDTO,
    ApplicationDTO,
)
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository


class CreateApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo

    async def execute(self, data: ApplicationCreateDTO) -> ApplicationDTO:
        # Validate platform exists
        platform = await self.platform_repo.get_by_id(data.platform_id)
        if not platform:
            raise ResourceNotFound('Platform not found')

        # Validate company exists
        company = await self.company_repo.get_by_id(data.company_id)
        if not company:
            raise ResourceNotFound('Company not found')

        application = await self.application_repo.create(data)
        return ApplicationDTO.model_validate(application)
