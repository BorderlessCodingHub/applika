from datetime import date, time

from pydantic import BaseModel, ConfigDict

from app.core.enums import EventType, InterviewType


class AgendaStepDTO(BaseModel):
    """One agenda item: a timeline event in the agenda window (R-026).

    The step-era fields stay so the item keeps its shape: ``id`` is the
    event id, ``step_date`` its ``event_date`` and ``step_id``/``step_name``/
    ``step_color`` its reverse-mapped legacy step. ``event_type`` and
    ``interview_type`` are what the timeline knows.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    step_id: int | None = None
    step_date: date
    step_name: str | None = None
    step_color: str | None = None
    event_type: EventType
    interview_type: InterviewType | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    application_id: int
    company_name: str
    role: str
