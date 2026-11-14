"""Reopen-application use case (R-008, R-009).

The inverse of finalize. It clears
``applications.finalized_at``, and the closed lock ``ensure_mutable``
enforces on event writes lifts at once.
"""

from app.application.dto.application import ApplicationDTO
from app.application.use_cases.applications.finalize_application import (
    APPLICATION_NOT_FOUND,
)
from app.application.use_cases.applications.guards import ensure_not_archived
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class ReopenApplicationUseCase:
    """Reopen one of the acting user's own applications.

    A missing or foreign application is a 404 (ADR 0004). An archived one
    is refused (422): a closed application swept into a cycle stays closed
    for good. Reopening an open application is an idempotent no-op
    (R-009). A real reopen is logged as ``application.reopened``.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        read_model: ApplicationReadModel,
    ) -> None:
        self.application_repo = application_repo
        self.read_model = read_model

    async def execute(
        self, application_id: int, user_id: int
    ) -> ApplicationDTO:
        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(
                APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
            )

        ensure_not_archived(application)

        if application.finalized_at is None:
            # Already open: idempotent no-op, current state returned.
            return await self.read_model.one(application)

        application.finalized_at = None
        application = await self.application_repo.update(application)

        logger.info(
            'application.reopened',
            extra={
                'extra_data': {
                    'event': 'application.reopened',
                    'application_id': application.id,
                    'user_id': user_id,
                }
            },
        )
        return await self.read_model.one(application)
