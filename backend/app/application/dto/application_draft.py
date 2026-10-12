"""DTOs for the "new application with CV" draft flow (KODI-032, ADR-0014,
KODI-036). A draft carries every field the ordinary application
create/update flow does. ``application_date`` (KODI-036, R-003) is optional
on ``DraftInputDTO``: ``None`` means "create with the server's own day" on
``ApplicationRepository.create_draft`` and "keep the stored value" on
``UpdateDraftUseCase`` - it never clears a stored date. ``DraftFinishDTO
.application_date`` is optional too: given, it wins (validated by
``ensure_not_in_future``); absent, the draft's own stored date is used.
``DraftDTO``, the response shape, always carries the field. The company is
carried as ``company_id | company_name`` (no URL, unlike the ordinary
application's ``{name, url}`` input): an id wins and its row's name is
stored; a bare name stays free text, exactly like the ordinary flow's
``{name, url: null}`` (R-024-3).
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
    job_description: str | None = None


class DraftFinishDTO(BaseModel):
    user_id: int
    application_date: date | None = None


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
    application_date: date
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
    # KODI-047: the job the draft was started from, ``None`` for a draft
    # made by hand. Kept by update and finish (never part of
    # ``DraftInputDTO``, so a full-replace PUT cannot clear it).
    job_id: int | None = None


class DraftSummaryDTO(BaseSchema):
    company_name: str
    role: str
    platform_id: int
    has_cv: bool
