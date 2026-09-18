from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl

from app.core.enums import Currency, ExperienceLevel, SalaryPeriod, WorkMode
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema

MAX_JOB_DESCRIPTION = 50_000
"""Upper bound on the pasted job posting; 50 001 characters is a 422."""


class ApplicationCompany(BaseSchema):
    name: str
    url: HttpUrl | None


class CreateApplication(BaseSchema):
    company: SnowflakeID | ApplicationCompany
    role: str
    mode: Literal['active', 'passive']
    platform_id: SnowflakeID
    application_date: date
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


class UpdateApplication(BaseModel):
    """Full-replace update body - with one deliberate exception.

    Every other optional field clears its stored value when omitted; that is
    the PUT contract published ``applika-cli`` versions depend on and it does
    not change here. ``job_description`` is sticky instead: omit the key and
    the stored text stays, send ``null`` and it is cleared. The route carries
    that distinction to the DTO by only forwarding the key when it is present
    in ``model_fields_set``.
    """

    company: SnowflakeID | ApplicationCompany
    role: str
    mode: Literal['active', 'passive']
    platform_id: SnowflakeID
    application_date: date
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


class ApplicationLastStep(BaseSchema):
    id: SnowflakeID
    name: str
    color: str
    date: date


class ApplicationFeedback(BaseSchema):
    id: SnowflakeID
    name: str
    color: str
    date: date


class Application(BaseSchema, TimeSchema):
    id: SnowflakeID
    company_id: SnowflakeID | None
    company_name: str
    role: str
    mode: Literal['active', 'passive']
    platform_id: SnowflakeID
    application_date: date
    link_to_job: HttpUrl | None = None
    observation: str | None = None
    expected_salary: float | None = None
    salary_range_min: float | None = None
    salary_range_max: float | None = None
    salary_offer: float | None = None
    currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    experience_level: ExperienceLevel | None = None
    work_mode: WorkMode | None = None
    country: str | None = None
    job_description: str | None = None

    # Closed since, or null when open (R-007, R-008).
    finalized_at: datetime | None = None
    # The fields installed applika-cli 0.1.4 reads (R-019), derived from the
    # timeline: finalized = finalized_at is set; last_step = the latest event
    # as its legacy step; feedback = always null; salary_offer = the latest
    # offer event's amount.
    finalized: bool
    last_step: ApplicationLastStep | None = None
    feedback: ApplicationFeedback | None = None


class FinalizeApplication(BaseModel):
    """The 0.1.4 finalize body. Deprecated: send no body instead."""

    step_id: SnowflakeID  # only strict steps
    feedback_id: SnowflakeID
    finalize_date: date
    salary_offer: float | None = None
    observation: str | None = None
