from typing import List

from app.application.dto.application import ApplicationDTO
from app.application.dto.application_step import ApplicationStepDTO
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)


class ListApplicationStepsUseCase:
    def __init__(self, app_step_repo: ApplicationStepRepository):
        self.app_step_repo = app_step_repo

    async def execute(
        self, app_id: int, user_id: int
    ) -> List[ApplicationStepDTO]:
        steps = await self.app_step_repo.get_all_by_app_id_and_user_id(
            app_id, user_id
        )
        return [ApplicationDTO.model_validate(step) for step in steps]
