"""The ``applications new|edit --file`` payload (KODI-018).

Vendored from the backend's ``CreateApplication`` / ``UpdateApplication``
(``applika/backend/app/presentation/schemas/application.py``): the file speaks
the API's field names, not the CLI's option names, and unknown keys are a
local error before anything is sent.

Every field is optional so that the same model serves ``new`` (where the
required five are checked afterwards) and ``edit`` (where the file is
partial). The keys the API only ever *returns* are listed in
``APPLICATION_READ_ONLY_KEYS`` and dropped on input, so
``applications list --output-format json`` round-trips into ``--file``.
"""

from __future__ import annotations

import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl
from typing_extensions import TypedDict

from applika.schemas.application import MAX_JOB_DESCRIPTION
from applika.schemas.enums import (
    ApplicationMode,
    Currency,
    ExperienceLevel,
    SalaryPeriod,
    WorkMode,
)

APPLICATION_READ_ONLY_KEYS = frozenset({
    'id',
    'company_id',
    'company_name',
    'salary_offer',
    'finalized',
    'finalized_at',
    'last_step',
    'feedback',
    'created_at',
    'updated_at',
})

#: The payload keys ``--file`` may carry, in the API's own order.
APPLICATION_FILE_KEYS: tuple[str, ...] = (
    'company',
    'role',
    'mode',
    'platform_id',
    'application_date',
    'link_to_job',
    'observation',
    'expected_salary',
    'salary_range_min',
    'salary_range_max',
    'currency',
    'salary_period',
    'experience_level',
    'work_mode',
    'country',
    'job_description',
)

#: What ``POST /applications`` will not accept without.
APPLICATION_REQUIRED_FIELDS: tuple[str, ...] = (
    'company',
    'role',
    'mode',
    'platform_id',
    'application_date',
)


class FileCompany(TypedDict, total=False):
    name: str
    url: HttpUrl | None


class ApplicationFile(BaseModel):
    """A ``--file`` application payload: every key optional, typos refused."""

    model_config = ConfigDict(extra='forbid')

    company: str | FileCompany | None = None
    role: str | None = None
    mode: ApplicationMode | None = None
    platform_id: str | None = None
    application_date: datetime.date | None = None
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
