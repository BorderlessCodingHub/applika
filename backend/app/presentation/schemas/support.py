from pydantic import BaseModel

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class PlatformSchema(BaseSchema):
    id: SnowflakeID
    name: str
    url: str | None = None
    is_public: bool = True


class SupportSchema(BaseModel):
    platforms: list[PlatformSchema]
