from typing import List

from app.application.dto.application import ApplicationDTO
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class ListApplicationsUseCase:
    def __init__(self, app_repo: ApplicationRepository):
        self.app_repo = app_repo

    async def execute(self, user_id: int) -> List[ApplicationDTO]:
        applications = await self.app_repo.get_all_by_user_id(user_id)
        active, finalized = [], []
        for application in applications:
            application = ApplicationDTO.model_validate(application)
            if application.feedback is None:
                active.append(application)
            else:
                finalized.append(application)
        return active + finalized
