"""The agenda item of ``GET /users/me/agenda``."""

from datetime import date, time

from app.core.enums import EventType, InterviewType
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class AgendaStepSchema(BaseSchema):
    """An agenda item (R-026): a timeline event in the agenda window.

    ``id`` is the event id and ``step_date`` its date; ``event_type`` and
    ``interview_type`` say which event it is.
    """

    id: SnowflakeID
    step_date: date
    event_type: EventType
    interview_type: InterviewType | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    application_id: SnowflakeID
    company_name: str
    role: str
