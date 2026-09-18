from app.config.logging import logger
from app.core.exceptions import BusinessRuleViolation, ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class DeleteApplicationUseCase:
    """Delete one of the acting user's own applications.

    Its timeline events go with it through the FK ON DELETE CASCADE of
    ``timeline_events.application_id`` (so do the legacy
    ``application_steps`` rows still in production).
    """

    def __init__(self, application_repo: ApplicationRepository):
        self.application_repo = application_repo

    async def execute(self, id: int, user_id: int) -> None:
        application = await self.application_repo.get_by_id_and_user_id(
            id, user_id
        )
        if not application:
            logger.warning(
                f'Delete failed: application {id} not found',
                extra={
                    'extra_data': {
                        'event': 'delete_application_failed',
                        'application_id': id,
                        'user_id': user_id,
                    }
                },
            )
            raise ResourceNotFound('Application not found or not owned by user')
        if application.cycle_id is not None:
            raise BusinessRuleViolation(
                'Cannot modify an application from an archived cycle'
            )

        await self.application_repo.delete_by_id(id)
        logger.info(
            f'Application deleted: {id}',
            extra={
                'extra_data': {
                    'event': 'application_deleted',
                    'application_id': id,
                    'user_id': user_id,
                }
            },
        )
