"""Delete-master-CV use case."""

from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.base_cv_repository import BaseCVRepository


class DeleteBaseCVUseCase:
    """Delete one of the acting user's own master CVs.

    Deleting is never blocked: the only outcomes are 204 and a 404
    ``ResourceNotFound`` when the master CV does not exist or belongs to
    another user (ADR-0004). The 3-per-user cap guards creation only, so a
    delete never conflicts.
    """

    def __init__(self, base_cv_repo: BaseCVRepository):
        self.base_cv_repo = base_cv_repo

    async def execute(self, base_cv_id: int, user_id: int) -> None:
        base_cv = await self.base_cv_repo.get_by_id_and_user_id(
            base_cv_id, user_id
        )
        if not base_cv:
            raise ResourceNotFound('Base CV not found')

        await self.base_cv_repo.delete(base_cv)
        logger.info(
            f'Base CV deleted: {base_cv_id}',
            extra={
                'extra_data': {
                    'event': 'base_cv_deleted',
                    'base_cv_id': base_cv_id,
                    'user_id': user_id,
                }
            },
        )
