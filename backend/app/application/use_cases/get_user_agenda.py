from datetime import date

from app.application.dto.agenda import AgendaStepDTO
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class GetUserAgendaUseCase:
    """The user's agenda: timeline events dated in the window (R-026).

    Same window and order the steps agenda had (PRD 0008 non-goal: the
    agenda rules do not change); every item now also says which event type
    and interview type it is.
    """

    def __init__(self, timeline_event_repo: TimelineEventRepository):
        self.timeline_event_repo = timeline_event_repo

    async def execute(
        self,
        user_id: int,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> list[AgendaStepDTO]:
        events = await self.timeline_event_repo.list_agenda(
            user_id=user_id,
            from_date=from_date,
            to_date=to_date,
        )
        return [
            AgendaStepDTO(
                id=event.id,
                step_date=event.event_date,
                event_type=event.event_type,
                interview_type=event.interview_type,
                start_time=event.start_time,
                end_time=event.end_time,
                timezone=event.timezone,
                observation=event.observation,
                application_id=event.application_id,
                company_name=event.application.company_name,
                role=event.application.role,
            )
            for event in events
        ]
