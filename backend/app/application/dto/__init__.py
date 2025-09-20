from datetime import datetime

from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    # Common fields for all schemas
    id: int
    created_at: datetime
    updated_at: datetime | None = None

    model_config = ConfigDict(
        extra='forbid',
        from_attributes=True,
        validate_assignment=True,
    )
