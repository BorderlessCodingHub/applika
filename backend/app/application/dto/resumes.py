from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserResumeDTO(BaseModel):
    id: int
    filename: str
    content_type: str
    is_default: bool
    byte_size: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
