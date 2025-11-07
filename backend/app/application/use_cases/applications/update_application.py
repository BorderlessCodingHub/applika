from app.application.dto.application import (
    ApplicationDTO,
    ApplicationUpdateDTO,
)
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.platform_repository import PlatformRepository


class UpdateApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo

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

        application.company = data.company
        application.role = data.role
        application.mode = data.mode
        application.platform_id = data.platform_id
        application.application_date = data.application_date
        application.observation = data.observation
        application.expected_salary = data.expected_salary
        application.salary_range_min = data.salary_range_min
        application.salary_range_max = data.salary_range_max

        application = await self.application_repo.update(application)
        return ApplicationDTO.model_validate(application)
