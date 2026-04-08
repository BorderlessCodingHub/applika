from datetime import date

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema


class CreateApplicationStep(BaseSchema):
    step_id: SnowflakeID
    step_date: date
    observation: str | None = None


class UpdateApplicationStep(BaseSchema):
    step_id: SnowflakeID
    step_date: date
    observation: str | None = None


class ApplicationStep(BaseSchema, TimeSchema):
    id: SnowflakeID
    step_id: SnowflakeID
    step_date: date
    step_name: str | None
    observation: str | None = None
