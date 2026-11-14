"""Create-timeline-event use case (R-006)."""

from app.application.dto.timeline_event import (
    CreateTimelineEventDTO,
    TimelineEventDTO,
)
from app.application.use_cases.applications.guards import ensure_mutable
from app.application.use_cases.timeline_events.list import (
    APPLICATION_NOT_FOUND,
)
from app.application.use_cases.timeline_events.rules import (
    ensure_one_initial_screening,
    normalize_event,
)
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class CreateTimelineEventUseCase:
    """Add an event to one of the acting user's own applications.

    ``user_id`` and ``application_id`` are stamped by the caller. Order:
    ownership (404), the write guards (archived 422, closed 409), the event
    rules (422), one initial screening per application (409), then the
    write. The write is logged as ``timeline_event.created``.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        timeline_event_repo: TimelineEventRepository,
    ) -> None:
        self.application_repo = application_repo
        self.timeline_event_repo = timeline_event_repo

    async def execute(self, data: CreateTimelineEventDTO) -> TimelineEventDTO:
        application = await self.application_repo.get_by_id_and_user_id(
            data.application_id, data.user_id
        )
        if application is None:
            raise ResourceNotFound(
                APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
            )

        ensure_mutable(application)
        data = normalize_event(data)
        await ensure_one_initial_screening(
            self.timeline_event_repo, data.application_id, data
        )

        event = await self.timeline_event_repo.create(data.model_dump())

        logger.info(
            'timeline_event.created',
            extra={
                'extra_data': {
                    'event': 'timeline_event.created',
                    'timeline_event_id': event.id,
                    'application_id': event.application_id,
                    'user_id': event.user_id,
                    'event_type': event.event_type.value,
                }
            },
        )
        return TimelineEventDTO.model_validate(event)
