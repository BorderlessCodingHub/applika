"""The ``Application`` read model: the row plus its derived fields (R-019).

``finalized`` and ``last_step`` are no columns; the web reads both, so they
are derived from the timeline here:

* ``finalized`` is ``finalized_at`` set (on the model);
* ``last_step`` is the latest event (timeline order, reversed), shown as its
  reverse-mapped step ``{id, name, color, date}``, or null.

Lists are built in two queries whatever their length (latest events, the
frozen step catalog), never one per application.
"""

from collections.abc import Sequence

from app.application.dto.application import ApplicationDTO, ApplicationLastStep
from app.application.use_cases.compat.step_translation import StepTranslator
from app.domain.models import ApplicationModel, TimelineEventModel
from app.domain.repositories.step_definition_repository import (
    StepDefinitionRepository,
)
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class ApplicationReadModel:
    def __init__(
        self,
        timeline_event_repo: TimelineEventRepository,
        step_repo: StepDefinitionRepository,
    ) -> None:
        self.timeline_event_repo = timeline_event_repo
        self.step_repo = step_repo

    async def one(self, application: ApplicationModel) -> ApplicationDTO:
        [dto] = await self.many([application])
        return dto

    async def many(
        self, applications: Sequence[ApplicationModel]
    ) -> list[ApplicationDTO]:
        ids = [application.id for application in applications]
        latest = await self.timeline_event_repo.latest_for_applications(ids)
        translator = (
            StepTranslator(await self.step_repo.get_all()) if latest else None
        )
        return [
            self._build(application, latest.get(application.id), translator)
            for application in applications
        ]

    @staticmethod
    def _build(
        application: ApplicationModel,
        latest: TimelineEventModel | None,
        translator: StepTranslator | None,
    ) -> ApplicationDTO:
        dto = ApplicationDTO.model_validate(application)
        last_step = None
        if latest is not None and translator is not None:
            step = translator.reverse(latest.event_type, latest.interview_type)
            if step is not None:
                last_step = ApplicationLastStep(
                    id=step.id,
                    name=step.name,
                    color=step.color,
                    date=latest.event_date,
                )
        return dto.model_copy(update={'last_step': last_step})
