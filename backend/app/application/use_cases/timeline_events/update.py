"""Update-timeline-event use case (R-006)."""

from app.application.dto.timeline_event import (
    TimelineEventDTO,
    UpdateTimelineEventDTO,
)
from app.application.use_cases.applications.guards import ensure_mutable
from app.application.use_cases.timeline_events.list import (
    APPLICATION_NOT_FOUND,
    EVENT_NOT_FOUND,
)
from app.application.use_cases.timeline_events.rules import (
    ensure_one_initial_screening,
    normalize_event,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class UpdateTimelineEventUseCase:
    """Replace an event of one of the acting user's own applications.

    A PUT full replacement, not a patch: the rules are cross-field on
    ``event_type``, so the whole event is written every time. Order:
    application ownership (404), the write guards (archived 422, closed
    409), event ownership (404), the event rules (422), one initial
    screening per application (409, the event itself excluded). Logged as
    ``timeline_event.updated``.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        timeline_event_repo: TimelineEventRepository,
    ) -> None:
        self.application_repo = application_repo
        self.timeline_event_repo = timeline_event_repo

    async def execute(
        self,
        event_id: int,
        application_id: int,
        user_id: int,
        dto: UpdateTimelineEventDTO,
    ) -> TimelineEventDTO:
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

        dto = normalize_event(dto)
        await ensure_one_initial_screening(
            self.timeline_event_repo, application_id, dto, replacing_id=event_id
        )

        event = await self.timeline_event_repo.update(event, dto.model_dump())

        logger.info(
            'timeline_event.updated',
            extra={
                'extra_data': {
                    'event': 'timeline_event.updated',
                    'timeline_event_id': event.id,
                    'application_id': application_id,
                    'user_id': user_id,
                    'event_type': event.event_type.value,
                }
            },
        )
        return TimelineEventDTO.model_validate(event)
