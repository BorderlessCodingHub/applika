"""Wire schemas for the "new application with CV" draft flow (KODI-032,
KODI-036). ``DraftInput`` mirrors ``CreateApplication``/``UpdateApplication``
(``presentation/schemas/application.py``) field for field, with the company
carried as ``company_id | company_name`` instead of ``{name, url}`` - the
draft body has no company URL (the owner's decision). ``company_name`` and
``role`` are stripped and refused blank.

``application_date`` (KODI-036, R-003) is optional on input: a POST that
omits it is dated with the server's own day, a PUT that omits it (or sends
it explicit ``null``) keeps the stored value - never clears, unlike
``job_description`` on ``UpdateApplication``. ``Draft``, the response shape,
always carries it. ``DraftFinish`` accepts it too, also optional: the body
date wins when given, else the draft's own stored date is used.
"""

from datetime import date
from typing import Literal

from pydantic import Field, HttpUrl, field_validator

from app.core.enums import (
    Currency,
    ExperienceLevel,
    SalaryPeriod,
    WorkMode,
)
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema
from app.presentation.schemas.application import MAX_JOB_DESCRIPTION


def _stripped_non_empty(value: str, field_name: str) -> str:
    stripped = value.strip()
    if not stripped:
        raise ValueError(f'{field_name} must not be blank')
    return stripped


class DraftInput(BaseSchema):
    company_id: SnowflakeID | None = None
    company_name: str = Field(min_length=1, max_length=200)
    role: str = Field(min_length=1, max_length=200)
    platform_id: SnowflakeID
    mode: Literal['active', 'passive'] = 'active'
    application_date: date | None = None
    link_to_job: HttpUrl | None = None
    observation: str | None = None
    expected_salary: float | None = None
    salary_range_min: float | None = None
    salary_range_max: float | None = None
    currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    experience_level: ExperienceLevel | None = None
    work_mode: WorkMode | None = None
    country: str | None = None
    job_description: str | None = Field(
        default=None, max_length=MAX_JOB_DESCRIPTION
    )

    @field_validator('company_name')
    @classmethod
    def _company_name_not_blank(cls, value: str) -> str:
        return _stripped_non_empty(value, 'company_name')

    @field_validator('role')
    @classmethod
    def _role_not_blank(cls, value: str) -> str:
        return _stripped_non_empty(value, 'role')


class Draft(DraftInput, TimeSchema):
    id: SnowflakeID
    has_cv: bool
    application_date: date
    # KODI-047: the job the draft was started from (``POST
    # /applications/drafts/from-job``), ``null`` otherwise. Response only:
    # ``DraftInput`` forbids it, so a PUT never sets or clears it.
    job_id: SnowflakeID | None = None


class DraftFromJob(BaseSchema):
    """``POST /applications/drafts/from-job`` (KODI-047, R-017, R-020,
    R-026): the job, and optionally a master CV to copy into the draft -
    verbatim by default, ``keywords`` only on request (ADR-0017).
    ``application_date`` (KODI-050) is the caller's local calendar day;
    absent, the draft is dated with the server's UTC day."""

    job_id: SnowflakeID
    base_cv_id: SnowflakeID | None = None
    tailoring: Literal['copy', 'keywords'] = 'copy'
    application_date: date | None = None


class DraftSummary(BaseSchema, TimeSchema):
    id: SnowflakeID
    company_name: str
    role: str
    platform_id: SnowflakeID
    has_cv: bool


class DraftFinish(BaseSchema):
    application_date: date | None = None
