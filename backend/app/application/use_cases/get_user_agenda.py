from datetime import date

from app.application.dto.agenda import AgendaStepDTO
from app.application.use_cases.compat.step_translation import StepTranslator
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class GetUserAgendaUseCase:
    """The user's agenda: timeline events dated in the window (R-026).

    Same window and order the steps agenda had (PRD 0008 non-goal: the
    agenda rules do not change); every item now also says which event type
    and interview type it is.
    """

    def __init__(
        self,
        timeline_event_repo: TimelineEventRepository,
        step_repo: StepDefinitionRepository,
    ):
        self.timeline_event_repo = timeline_event_repo
        self.step_repo = step_repo

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
        if not events:
            return []
        translator = StepTranslator(await self.step_repo.get_all())
        items = []
        for event in events:
            step = translator.reverse(event.event_type, event.interview_type)
            items.append(
                AgendaStepDTO(
                    id=event.id,
                    step_id=step.id if step else None,
                    step_date=event.event_date,
                    step_name=step.name if step else None,
                    step_color=step.color if step else None,
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
            )
        return items
