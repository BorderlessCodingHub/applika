from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class JobFiltersSchema(BaseModel):
    model_config = ConfigDict(extra='ignore', from_attributes=True)

    source: Optional[str] = None
    search: Optional[str] = None
    min_fit: Optional[int] = None
    posted_after: Optional[datetime] = None
    sort: Literal['newest', 'oldest', 'best_fit'] = 'newest'
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class JobListItemSchema(BaseSchema):
    id: SnowflakeID
    source_code: str
    title: str
    company_name: str
    location_text: str
    job_url: str
    employment_type: Optional[str] = None
    salary_text: Optional[str] = None
    posted_at: Optional[datetime] = None
    tags: list[str]
    fit_score: Optional[int] = None
    matched_keywords: list[str]
    missing_keywords: list[str]


class JobDetailSchema(JobListItemSchema):
    description_text: str


class JobListResponseSchema(BaseModel):
    items: list[JobListItemSchema]
    total: int
    page: int
    page_size: int
