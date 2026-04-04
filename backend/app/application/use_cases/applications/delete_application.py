from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.application_step_repository import (
    ApplicationStepRepository,
)


class DeleteApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        application_step_repo: ApplicationStepRepository,
    ):
        self.application_repo = application_repo
        self.application_step_repo = application_step_repo

    async def execute(self, id: int, user_id: int) -> None:
        application = await self.application_repo.get_by_id_and_user_id(
            id, user_id
        )
        if not application:
            logger.warning(
                f'Delete failed: application {id} not found',
                extra={'extra_data': {
                    'event': 'delete_application_failed',
                    'application_id': id,
                    'user_id': user_id,
                }},
            )
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )

        await self.application_step_repo.delete_all_by_application_id(id)
        await self.application_repo.delete_by_id(id)
        logger.info(
            f'Application deleted: {id}',
            extra={'extra_data': {
                'event': 'application_deleted',
                'application_id': id,
                'user_id': user_id,
            }},
        )
