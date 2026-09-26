"""DTOs for the "new application with CV" draft flow (KODI-032, ADR-0014).

A draft carries every field the ordinary application create/update flow does
except ``application_date`` - the draft is never asked for one; it is dated
with the server's own day as a placeholder on create
(``ApplicationRepository.create_draft``) and with the caller's own calendar
day, validated by ``ensure_not_in_future``, only when it is finished
(``DraftFinishDTO``). The company is carried as ``company_id | company_name``
(no URL, unlike the ordinary application's ``{name, url}`` input): an id
wins and its row's name is stored; a bare name stays free text, exactly like
the ordinary flow's ``{name, url: null}`` (R-024-3).
"""

from datetime import date
from typing import Literal

from pydantic import BaseModel, HttpUrl

from app.application.dto import BaseSchema
from app.core.enums import (
    Currency,
    ExperienceLevel,
    SalaryPeriod,
    WorkMode,
)


class DraftInputDTO(BaseModel):
    user_id: int
    company_id: int | None
    company_name: str
    role: str
    mode: Literal['active', 'passive'] = 'active'
    platform_id: int
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
    job_description: str | None = None


class DraftFinishDTO(BaseModel):
    user_id: int
    application_date: date


class DraftDTO(BaseSchema):
    """The response DTO. ``link_to_job`` is ``str | None`` here, not
    ``HttpUrl`` - it is built straight from ``ApplicationModel.link_to_job``
    (a plain stored string, already validated on the way in), and
    ``presentation/schemas/application_draft.Draft`` re-validates it as an
    ``HttpUrl`` on the way out to the client."""

    company_id: int | None
    company_name: str
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
    link_to_job: str | None = None
    observation: str | None = None
    expected_salary: float | None = None
    salary_range_min: float | None = None
    salary_range_max: float | None = None
    currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    experience_level: ExperienceLevel | None = None
    work_mode: WorkMode | None = None
    country: str | None = None
    job_description: str | None = None
    has_cv: bool


class DraftSummaryDTO(BaseSchema):
    company_name: str
    role: str
    platform_id: int
    has_cv: bool
