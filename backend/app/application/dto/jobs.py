from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class JobSourceDTO(BaseModel):
    id: int
    code: str
    name: str
    base_url: str
    is_enabled: bool
    last_scraped_at: Optional[datetime]
    last_scrape_status: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class JobListItemDTO(BaseModel):
    id: int
    source_code: str
    title: str
    company_name: str
    location_text: str
    job_url: str
    employment_type: Optional[str]
    salary_text: Optional[str]
    posted_at: Optional[datetime]
    tags: list[str]
    fit_score: Optional[int]
    matched_keywords: list[str]
    missing_keywords: list[str]

    model_config = ConfigDict(from_attributes=True)


class JobDetailDTO(JobListItemDTO):
    description_text: str


class JobListResponseDTO(BaseModel):
    items: list[JobListItemDTO]
    total: int
    page: int
    page_size: int
