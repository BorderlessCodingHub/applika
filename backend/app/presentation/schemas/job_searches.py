"""Wire schemas of the saved job searches (KODI-047, PRD 0012 R-030).

``filters`` is a ``JobFilters`` body (``schemas/jobs.py``): an unknown key,
or a value out of its range, is a 422. ``name`` is stripped, 1..100
characters. There is no notification field (R-032).
"""

from pydantic import Field, field_validator, model_validator

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema
from app.presentation.schemas.jobs import JobFilters

MAX_NAME = 100


def _name(value: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError('name must not be blank')
    if len(stripped) > MAX_NAME:
        raise ValueError(f'name has at most {MAX_NAME} characters')
    return stripped


class JobSearchCreate(BaseSchema):
    name: str = Field(min_length=1)
    filters: JobFilters

    @field_validator('name')
    @classmethod
    def _strip_name(cls, value: str) -> str:
        return _name(value)


class JobSearchUpdate(BaseSchema):
    name: str | None = Field(default=None, min_length=1)
    filters: JobFilters | None = None

    @field_validator('name')
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return _name(value) if value is not None else None

    @model_validator(mode='after')
    def _something_to_change(self) -> 'JobSearchUpdate':
        if self.name is None and self.filters is None:
            raise ValueError('give a name, filters or both')
        return self


class JobSearch(BaseSchema, TimeSchema):
    id: SnowflakeID
    name: str
    filters: JobFilters
