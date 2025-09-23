from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)


class DeleteApplicationStepUseCase:
    def __init__(
        self,
        application_step_repo: ApplicationStepRepository,
    ):
        self.application_step_repo = application_step_repo

    async def execute(self, id: int, app_id: int, user_id: int) -> None:
        count = await self.application_step_repo.delete_by_id_and_app_id_and_user_id(
            id, app_id, user_id
        )
        if count == 0:
            raise ResourceNotFound(
                'Application step not found or not owned by user'
            )
