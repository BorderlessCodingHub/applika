"""Schemas of the deprecated ``/applications/{id}/steps`` routes and the
agenda item.

The step shapes are the ones ``applika-cli`` 0.1.4 sends and reads
(``applika/cli/src/applika/schemas/application_step.py``), unchanged
(R-016, .claude/rules/cli-compatibility.md).
"""

from datetime import date, time

from pydantic import Field, model_validator

from app.core.enums import EventType, InterviewType
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema

MAX_TIMEZONE = 100


class AgendaStepSchema(BaseSchema):
    """An agenda item (R-026): a timeline event in the agenda window.

    ``id`` is the event id and ``step_date`` its date; ``step_id``,
    ``step_name`` and ``step_color`` are its reverse-mapped legacy step;
    ``event_type`` and ``interview_type`` are new.
    """

    id: SnowflakeID
    step_id: SnowflakeID | None = None
    step_date: date
    step_name: str | None
    step_color: str | None = None
    event_type: EventType
    interview_type: InterviewType | None = None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    application_id: SnowflakeID
    company_name: str
    role: str


class _TimeRangeValidator(BaseSchema):
    start_time: time | None = None
    end_time: time | None = None

    @model_validator(mode='after')
    def validate_time_range(self):
        if bool(self.start_time) != bool(self.end_time):
            raise ValueError(
                'Both start_time and end_time must be provided together'
            )
        if (
            self.start_time
            and self.end_time
            and self.end_time <= self.start_time
        ):
            raise ValueError('end_time must be after start_time')
        return self


class CreateApplicationStep(_TimeRangeValidator):
    step_id: SnowflakeID
    step_date: date
    timezone: str | None = Field(default=None, max_length=MAX_TIMEZONE)
    observation: str | None = None


class UpdateApplicationStep(_TimeRangeValidator):
    step_id: SnowflakeID
    step_date: date
    timezone: str | None = Field(default=None, max_length=MAX_TIMEZONE)
    observation: str | None = None


class ApplicationStep(BaseSchema, TimeSchema):
    id: SnowflakeID
    step_id: SnowflakeID
    step_date: date
    step_name: str | None
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
