from datetime import date, time

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


class CreateApplicationStep(BaseSchema):
    step_id: SnowflakeID
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None


class UpdateApplicationStep(BaseSchema):
    step_id: SnowflakeID
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
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
