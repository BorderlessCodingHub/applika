"""DTOs of the deprecated ``/applications/{id}/steps`` routes (R-016).

The 0.1.4 step shape, kept field for field. The data behind it is a
timeline event: ``id`` is the event id (a step migrated by revision
``afd4074c70c2`` kept its id), ``step_date`` is ``event_date`` and
``step_id``/``step_name`` come from the step translator.
"""

from datetime import date, time

from pydantic import BaseModel

from app.application.dto import BaseSchema


class LegacyStepWriteDTO(BaseModel):
    step_id: int
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None


class LegacyStepDTO(BaseSchema):
    application_id: int
    step_id: int
    step_name: str
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
