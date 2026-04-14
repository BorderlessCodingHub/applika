from datetime import date, time

from pydantic import BaseModel

from app.application.dto import BaseSchema


class ApplicationStepCreateDTO(BaseModel):
    user_id: int
    application_id: int
    step_id: int
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None


class ApplicationStepUpdateDTO(BaseModel):
    application_id: int
    step_id: int
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None


class ApplicationStepDTO(BaseSchema):
    application_id: int
    step_id: int
    step_name: str | None
    step_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
