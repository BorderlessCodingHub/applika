from datetime import date

from pydantic import BaseModel

from app.application.dto import BaseSchema


class ApplicationStepCreateDTO(BaseModel):
    application_id: int
    step_id: str
    step_date: date
    observation: str | None


class ApplicationStepDTO(BaseSchema):
    application_id: int
    step_id: str
    step_date: date
    observation: str | None
