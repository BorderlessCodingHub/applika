from datetime import date

from pydantic import BaseModel

from app.application.dto import BaseSchema


class ApplicationStepCreateDTO(BaseModel):
    user_id: int
    application_id: int
    step_id: int
    step_date: date
    observation: str | None


class ApplicationStepUpdateDTO(BaseModel):
    application_id: int
    step_id: int
    step_date: date
    observation: str | None


class ApplicationStepDTO(BaseSchema):
    application_id: int
    step_id: int
    step_name: str | None
    step_date: date
    observation: str | None
