from pydantic import BaseModel

from app.application.dto import BaseSchema


class PlatformDTO(BaseSchema):
    name: str
    url: str | None = None
    is_public: bool = True


class SupportDTO(BaseModel):
    platforms: list[PlatformDTO]
