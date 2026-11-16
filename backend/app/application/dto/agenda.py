from datetime import date, time

from pydantic import BaseModel, ConfigDict

from app.core.enums import EventType, InterviewType


class AgendaStepDTO(BaseModel):
    """One agenda item: a timeline event in the agenda window (R-026).

    ``id`` is the event id and ``step_date`` its ``event_date``;
    ``event_type`` and ``interview_type`` say which event it is.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    step_date: date
    event_type: EventType
    interview_type: InterviewType | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    application_id: int
    company_name: str
    role: str
