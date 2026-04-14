from pydantic import BaseModel

from app.application.dto import BaseSchema


class PlatformCreateDTO(BaseModel):
    name: str
    url: str | None = None


class PlatformUpdateDTO(BaseModel):
    name: str | None = None
    url: str | None = None


class PlatformDTO(BaseSchema):
    name: str
    url: str | None = None
