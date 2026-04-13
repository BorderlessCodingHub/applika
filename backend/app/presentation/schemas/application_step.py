from datetime import date, time

from pydantic import model_validator

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema


class AgendaStepSchema(BaseSchema):
    id: SnowflakeID
    step_id: SnowflakeID
    step_date: date
    step_name: str | None
    step_color: str | None = None
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
            raise ValueError(
                'end_time must be after start_time'
            )
        return self


class CreateApplicationStep(_TimeRangeValidator):
    step_id: SnowflakeID
    step_date: date
    timezone: str | None = None
    observation: str | None = None


class UpdateApplicationStep(_TimeRangeValidator):
    step_id: SnowflakeID
    step_date: date
    timezone: str | None = None
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
