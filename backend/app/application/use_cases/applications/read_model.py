"""The ``Application`` read model: the row plus its derived fields (R-019).

``finalized`` and ``last_event`` are no columns; the web reads both, so they
are derived from the timeline here:

* ``finalized`` is ``finalized_at`` set (on the model);
* ``last_event`` is the latest event (timeline order, reversed) as
  ``{id, event_type, interview_type, denied_reason, date}``, or null.

Lists are built in one query for the latest events whatever their length,
never one per application.
"""

from collections.abc import Sequence

from app.application.dto.application import (
    ApplicationDTO,
    ApplicationLastEvent,
)
from app.domain.models import ApplicationModel, TimelineEventModel
from app.domain.repositories.timeline_event_repository import (
    TimelineEventRepository,
)


class ApplicationReadModel:
    def __init__(self, timeline_event_repo: TimelineEventRepository) -> None:
        self.timeline_event_repo = timeline_event_repo

    async def one(self, application: ApplicationModel) -> ApplicationDTO:
        [dto] = await self.many([application])
        return dto

    async def many(
        self, applications: Sequence[ApplicationModel]
    ) -> list[ApplicationDTO]:
        ids = [application.id for application in applications]
        latest = await self.timeline_event_repo.latest_for_applications(ids)
        return [
            self._build(application, latest.get(application.id))
            for application in applications
        ]

    @staticmethod
    def _build(
        application: ApplicationModel, latest: TimelineEventModel | None
    ) -> ApplicationDTO:
        dto = ApplicationDTO.model_validate(application)
        last_event = None
        if latest is not None:
            last_event = ApplicationLastEvent(
                id=latest.id,
                event_type=latest.event_type,
                interview_type=latest.interview_type,
                denied_reason=latest.denied_reason,
                date=latest.event_date,
            )
        return dto.model_copy(update={'last_event': last_event})
