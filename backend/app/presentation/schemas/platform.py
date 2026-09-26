from pydantic import HttpUrl, field_validator

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class PlatformCreate(BaseSchema):
    """``POST /platforms`` (ADR-0014): any user may add a platform that is
    not listed, with an optional url - a platform may have no url, whoever
    adds it (R-018)."""

    name: str
    url: HttpUrl | None = None

    @field_validator('name')
    @classmethod
    def _name_not_blank(cls, value: str) -> str:
        trimmed = value.strip()
        if not (1 <= len(trimmed) <= 100):
            raise ValueError('name must be 1-100 characters')
        return trimmed

    @field_validator('url')
    @classmethod
    def _url_max_length(cls, value: HttpUrl | None) -> HttpUrl | None:
        if value is not None and len(str(value)) > 200:
            raise ValueError('url must be at most 200 characters')
        return value


class PlatformOut(BaseSchema):
    id: SnowflakeID
    name: str
    url: str | None = None
    is_public: bool = True
