from typing import List

from app.application.dto.application import ApplicationDTO
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class ListApplicationsUseCase:
    def __init__(self, app_repo: ApplicationRepository):
        self.app_repo = app_repo

    async def execute(self, user_id: int) -> List[ApplicationDTO]:
        db_applications = await self.app_repo.get_all_by_user_id(user_id)

        applications = []
        for app in db_applications:
            application = ApplicationDTO.model_validate(app)

            if app.old_company:
                application.company.name = f"Deprecated: {app.old_company}"

            applications.append(application)
        return applications
