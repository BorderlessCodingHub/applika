"""Wire schemas of the job board (KODI-047, plan 0012 ``## Contract``).

``JobFilters`` is the one shape of "what the list shows": the query of
``GET /jobs`` and the ``filters`` body of a saved search
(``schemas/job_searches.py``) - an unknown key in a saved search body is a
422. ``JobListQuery`` adds the page; as query parameters, unknown keys are
ignored (a browser may append its own).
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema

MAX_SEARCH = 200
MAX_TAGS = 10
MAX_TAG_LENGTH = 100
MAX_POSTED_WITHIN_DAYS = 15
DEFAULT_PER_PAGE = 25
MAX_PER_PAGE = 100


class JobFilters(BaseSchema):
    search: str | None = Field(default=None, max_length=MAX_SEARCH)
    source: str | None = Field(default=None, max_length=50)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)
    min_fit: int | None = Field(default=None, ge=0, le=100)
    posted_within_days: int | None = Field(
        default=None, ge=1, le=MAX_POSTED_WITHIN_DAYS
    )
    sort: Literal['newest', 'fit'] = 'newest'
    include_dismissed: bool = False

    @field_validator('search', 'source')
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return value.strip() or None

    @field_validator('tags')
    @classmethod
    def _clean_tags(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for tag in value:
            tag = tag.strip()
            if len(tag) > MAX_TAG_LENGTH:
                raise ValueError(
                    f'a tag has at most {MAX_TAG_LENGTH} characters'
                )
            if tag and tag not in cleaned:
                cleaned.append(tag)
        return cleaned


class JobListQuery(JobFilters):
    model_config = ConfigDict(extra='ignore')

    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=DEFAULT_PER_PAGE, ge=1, le=MAX_PER_PAGE)


class JobSource(BaseModel):
    code: str
    name: str


class JobBestFit(BaseModel):
    base_cv_id: SnowflakeID
    score: int


class JobApplicationRef(BaseModel):
    id: SnowflakeID
    is_draft: bool


class JobSummary(BaseModel):
    id: SnowflakeID
    source: JobSource
    title: str
    company_name: str
    location_text: str
    employment_type: str | None
    salary_text: str | None
    tags: list[str]
    posted_at: datetime | None
    job_url: str
    is_active: bool
    best_fit: JobBestFit | None
    dismissed: bool
    application: JobApplicationRef | None


class JobFitOut(BaseModel):
    base_cv_id: SnowflakeID
    base_cv_name: str
    score: int
    matched_keywords: list[str]
    missing_keywords: list[str]


class JobDetail(JobSummary):
    description_text: str
    company_url: str | None
    fits: list[JobFitOut]


class JobPage(BaseModel):
    items: list[JobSummary]
    total: int
    page: int
    per_page: int
    total_pages: int
