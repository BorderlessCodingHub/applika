from datetime import datetime

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class UserResumeSchema(BaseSchema):
    id: SnowflakeID
    filename: str
    content_type: str
    is_default: bool
    byte_size: int
    created_at: datetime


class SetDefaultResumeSchema(BaseSchema):
    is_default: bool = True
