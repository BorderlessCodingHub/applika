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
    is_public: bool = True
    created_by: int | None = None
    created_by_username: str | None = None
