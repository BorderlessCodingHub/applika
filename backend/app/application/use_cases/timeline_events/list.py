"""List-timeline-events use case (R-006)."""

from app.application.dto.timeline_event import TimelineEventDTO
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)

APPLICATION_NOT_FOUND = 'Application not found or not owned by user'
EVENT_NOT_FOUND = 'Timeline event not found or not owned by user'


class ListTimelineEventsUseCase:
    """List the events of one of the acting user's own applications.

    Ownership is checked against the parent application first: one that
    does not exist or belongs to another user is a 404 (ADR 0004). Reads are
    allowed whatever the lifecycle state; only writes are guarded.
    """

    def __init__(
        self,
        application_repo: ApplicationRepository,
        timeline_event_repo: TimelineEventRepository,
    ) -> None:
        self.application_repo = application_repo
        self.timeline_event_repo = timeline_event_repo

    async def execute(
        self, application_id: int, user_id: int
    ) -> list[TimelineEventDTO]:
        application = await self.application_repo.get_by_id_and_user_id(
            application_id, user_id
        )
        if application is None:
            raise ResourceNotFound(
                APPLICATION_NOT_FOUND, ErrorCode.APP_APPLICATION_NOT_FOUND
            )

        events = await self.timeline_event_repo.list_by_application(
            application_id
        )
        return [TimelineEventDTO.model_validate(event) for event in events]
