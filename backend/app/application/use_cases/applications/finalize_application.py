"""Finalize-application use case: close, reversibly (R-007, R-009).

Ported from mynextjob's ``finalize.py``. Closing stamps
``applications.finalized_at`` with the server's current UTC time. It asks
for no step, no feedback and no salary: the outcome and any offered salary
live on the timeline (an offer or denied event), and there is no
Offer <-> Accepted rule any more (R-012). Reopen undoes it.

The 0.1.4 body (step, feedback, date, salary, observation) is the compat
layer's ``LegacyFinalizeApplicationUseCase``.
"""

from datetime import UTC, datetime

from app.application.dto.application import ApplicationDTO
from app.application.use_cases.applications.guards import ensure_not_archived
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)

APPLICATION_NOT_FOUND = 'Application not found or not owned by user'


class FinalizeApplicationUseCase:
    """Close one of the acting user's own applications.

    A missing or foreign application is a 404 (ADR 0004). An archived one
    is refused (422, applika's code). A closed one is *not* refused:
    finalizing it again is an idempotent no-op that keeps the original
    ``finalized_at`` and returns the current state (R-009). A real close is
    logged as ``application.finalized``.
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
            raise ResourceNotFound(APPLICATION_NOT_FOUND)

        ensure_not_archived(application)

        if application.finalized_at is not None:
            # Already closed: idempotent no-op, current state returned.
            return await self.read_model.one(application)

        finalized_at = datetime.now(UTC)
        application.finalized_at = finalized_at
        application = await self.application_repo.update(application)

        logger.info(
            'application.finalized',
            extra={
                'extra_data': {
                    'event': 'application.finalized',
                    'application_id': application.id,
                    'user_id': user_id,
                    'finalized_at': finalized_at.isoformat(),
                }
            },
        )
        return await self.read_model.one(application)
