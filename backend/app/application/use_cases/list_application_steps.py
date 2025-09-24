from typing import List

from app.application.dto.application_step import ApplicationStepDTO
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)


class ListApplicationStepsUseCase:
    def __init__(
        self,
        app_repo: ApplicationRepository,
        app_step_repo: ApplicationStepRepository,
    ):
        self.app_repo = app_repo
        self.app_step_repo = app_step_repo

    async def execute(
        self, application_id: int, user_id: int
    ) -> List[ApplicationStepDTO]:
        application = await self.app_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )

        steps = await self.app_step_repo.get_all_by_app_id_and_user_id(
            application_id
        )
        return [ApplicationStepDTO.model_validate(step) for step in steps]
