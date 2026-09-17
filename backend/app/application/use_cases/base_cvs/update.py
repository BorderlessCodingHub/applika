"""Update-master-CV use case."""

from app.application.dto.base_cv import BaseCVDTO, BaseCVUpdateDTO
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.base_cv_repository import BaseCVRepository


class UpdateBaseCVUseCase:
    """Apply a partial update to one of the acting user's own master CVs.

    Only the fields explicitly provided are persisted
    (``model_dump(exclude_unset=True)``); an unset field is never touched and a
    section explicitly provided replaces that section whole, preserving the
    client-generated sub-item ids. A master CV that does not exist or belongs
    to another user surfaces as a 404 ``ResourceNotFound`` (ADR-0004).
    """

    def __init__(self, base_cv_repo: BaseCVRepository):
        self.base_cv_repo = base_cv_repo

    async def execute(
        self, base_cv_id: int, user_id: int, data: BaseCVUpdateDTO
    ) -> BaseCVDTO:
        base_cv = await self.base_cv_repo.get_by_id_and_user_id(
            base_cv_id, user_id
        )
        if not base_cv:
            raise ResourceNotFound('Base CV not found')

        changes = data.model_dump(exclude_unset=True)
        base_cv = await self.base_cv_repo.update(base_cv, changes)
        logger.info(
            f'Base CV updated: {base_cv_id}',
            extra={
                'extra_data': {
                    'event': 'base_cv_updated',
                    'base_cv_id': base_cv_id,
                    'user_id': user_id,
                    'changed_fields': sorted(changes),
                }
            },
        )
        return BaseCVDTO.model_validate(base_cv)
