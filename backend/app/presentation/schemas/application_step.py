from datetime import date

from pydantic import field_validator

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema
from app.presentation.schemas._date_validators import ensure_not_in_future


class CreateApplicationStep(BaseSchema):
    step_id: SnowflakeID
    step_date: date
    observation: str | None = None

    @field_validator('step_date')
    @classmethod
    def _step_date_not_future(cls, value: date) -> date:
        return ensure_not_in_future(value, 'step_date')


class UpdateApplicationStep(BaseSchema):
    step_id: SnowflakeID
    step_date: date
    observation: str | None = None

    @field_validator('step_date')
    @classmethod
    def _step_date_not_future(cls, value: date) -> date:
        return ensure_not_in_future(value, 'step_date')


class ApplicationStep(BaseSchema, TimeSchema):
    id: SnowflakeID
    step_id: SnowflakeID
    step_date: date
    step_name: str | None
    observation: str | None = None
