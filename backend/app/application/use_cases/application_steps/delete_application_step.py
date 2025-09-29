from app.core.exceptions import ApplicationFinalized, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)


class DeleteApplicationStepUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        application_step_repo: ApplicationStepRepository,
    ):
        self.application_repo = application_repo
        self.application_step_repo = application_step_repo

    async def execute(self, id: int, app_id: int, user_id: int) -> None:
        application = await self.application_repo.get_by_id_and_user_id(
            app_id, user_id
        )
        if not application:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )
        if application.feedback_id is not None:
            raise ApplicationFinalized(
                'This application has already been finalized'
            )

        application_step = (
            await self.application_step_repo.get_by_id_and_app_id_and_user_id(
                id, app_id, user_id
            )
        )
        if not application_step:
            raise ResourceNotFound(
                'Application step not found or not owned by user'
            )

        await self.application_step_repo.delete(application_step)
