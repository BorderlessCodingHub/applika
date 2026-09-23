"""Delete-timeline-event use case (R-006)."""

from app.application.use_cases.applications.guards import ensure_mutable
from app.application.use_cases.timeline_events.list import (
    APPLICATION_NOT_FOUND,
    EVENT_NOT_FOUND,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class DeleteTimelineEventUseCase:
    """Delete an event of one of the acting user's own applications.

    Order: application ownership (404), the write guards (archived 422,
    closed 409), event ownership (404). Logged as ``timeline_event.deleted``.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        timeline_event_repo: TimelineEventRepository,
    ) -> None:
        self.application_repo = application_repo
        self.timeline_event_repo = timeline_event_repo

    async def execute(
        self, event_id: int, application_id: int, user_id: int
    ) -> None:
        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(APPLICATION_NOT_FOUND)

        ensure_mutable(application)

        event = await self.timeline_event_repo.get_by_id_and_user_id(
            event_id, application_id, user_id
        )
        if event is None:
            raise ResourceNotFound(EVENT_NOT_FOUND)

        await self.timeline_event_repo.delete(event)

        logger.info(
            'timeline_event.deleted',
            extra={
                'extra_data': {
                    'event': 'timeline_event.deleted',
                    'timeline_event_id': event_id,
                    'application_id': application_id,
                    'user_id': user_id,
                }
            },
        )
