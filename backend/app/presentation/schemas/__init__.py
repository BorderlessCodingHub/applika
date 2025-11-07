from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
        from_attributes=True,
        validate_assignment=True,
        coerce_numbers_to_str=True,
    )


class DetailSchema(BaseModel):
    detail: str


class TimeSchema(BaseModel):
    created_at: datetime
    updated_at: datetime | None = None
