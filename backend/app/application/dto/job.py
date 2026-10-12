"""DTOs of the job collection (KODI-046, ADR-0016): what the ingest and fit
use cases hand to the repositories and return to their callers."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

RunStatus = Literal['ok', 'failed', 'blocked']


class JobRecordDTO(BaseModel):
    """One posting ready to store: every field already cut to its column,
    ``keywords`` computed, ``content_hash`` over the stored fields."""

    model_config = ConfigDict(frozen=True)

    external_id: str
    title: str
    company_name: str
    company_url: str | None
    location_text: str
    job_url: str
    description_text: str
    employment_type: str | None
    salary_text: str | None
    tags: list[str]
    keywords: list[str]
    content_hash: str
    posted_at: datetime | None


class JobSourceDTO(BaseModel):
    """A source as the admin sees it (R-033)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    base_url: str
    platform_id: int | None
    is_enabled: bool
    last_run_at: datetime | None
    last_run_status: RunStatus | None
    last_run_error: str | None
    last_run_found: int | None
    last_run_saved: int | None
    active_jobs: int = 0


class SourceRunDTO(BaseModel):
    """How one source's part of a run ended (R-008)."""

    code: str
    status: RunStatus
    found: int
    saved: int
    error: str | None = None


class FitRecomputeDTO(BaseModel):
    """Fit rows written (``scored``) and removed by one recompute."""

    scored: int = 0
    removed: int = 0


class IngestRunDTO(BaseModel):
    """The outcome of one ``ingest_jobs`` run. ``ran`` is false when the
    run did nothing (``JOBS_INGEST_ENABLED`` off, or another run holds the
    lock)."""

    ran: bool
    sources: list[SourceRunDTO] = []
    expired: int = 0
    fit: FitRecomputeDTO = FitRecomputeDTO()
