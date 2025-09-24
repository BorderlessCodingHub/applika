from datetime import date

from app.presentation.schemas import BaseSchema, TimeSchema


class CreateApplicationStep(BaseSchema):
    step_id: int
    step_date: date
    observation: str | None = None


class UpdateApplicationStep(BaseSchema):
    step_id: int
    step_date: date
    observation: str | None = None


class ApplicationStep(BaseSchema, TimeSchema):
    id: int
    step_id: int
    step_date: date
    step_name: str | None
    observation: str | None = None
