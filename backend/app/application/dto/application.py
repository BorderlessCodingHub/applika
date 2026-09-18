from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, HttpUrl

from app.application.dto import BaseSchema
from app.core.enums import Currency, ExperienceLevel, SalaryPeriod, WorkMode


class ApplicationCompanyInputDTO(BaseModel):
    name: str
    url: HttpUrl | None


class ApplicationCreateDTO(BaseModel):
    """Normalized input for creating an application.

    ``job_description`` is the optional free text of the posting the user is
    applying to; it is shown next to the application's CV copy and is the only
    application field the tailoring port reads.
    """

    user_id: int
    company: int | ApplicationCompanyInputDTO
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
    application_date: date
    link_to_job: HttpUrl | None
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


class ApplicationUpdateDTO(BaseModel):
    """Full-replace input for updating an application, with one exception.

    Every optional field here means *clear it*: an omitted ``observation``
    blanks the stored observation, which is the PUT semantics ``applika-cli``
    0.1.4 has always relied on. ``job_description`` is the single field that
    breaks that rule, and it does so by set-ness rather than by value: the
    route only passes the key when the client actually sent it, so
    ``'job_description' in model_fields_set`` distinguishes "clear it"
    (explicit ``null``) from "leave it alone" (key absent). A published CLI
    that knows nothing about the field therefore never wipes it.
    """

    user_id: int
    company: int | ApplicationCompanyInputDTO
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
    application_date: date
    link_to_job: HttpUrl | None
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


class LegacyFinalizeApplicationDTO(BaseModel):
    """The 0.1.4 finalize body (R-017), handled by the compat layer."""

    step_id: int  # only strict steps
    feedback_id: int
    finalize_date: date
    salary_offer: float | None = None
    observation: str | None = None


class FinalizeOutcomeDTO(BaseModel):
    """The new optional finalize body, once an outcome is chosen (R-032).

    The router sends a bodyless, ``{}`` or all-null-fields outcome to
    :class:`FinalizeApplicationUseCase` instead (the existing no-outcome
    close): ``outcome`` here is never ``None``.
    """

    outcome: Literal['offer', 'denied']
    event_date: date | None = None
    observation: str | None = None
    salary_amount: Decimal | None = None
    salary_currency: Currency | None = None
    salary_period: SalaryPeriod | None = None


class ApplicationLastStep(BaseModel):
    id: int
    name: str
    color: str
    date: date


class ApplicationFeedback(BaseModel):
    id: int
    name: str
    color: str
    date: date


class ApplicationDTO(BaseSchema):
    company_id: int | None
    company_name: str
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
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
    job_description: str | None = None

    finalized_at: datetime | None = None
    finalized: bool

    # The legacy fields installed CLIs read (R-019). They are no longer
    # columns: ApplicationReadModel derives them from the timeline, so a
    # plain ``model_validate(model)`` leaves them at their defaults.
    # ``feedback`` stays null: feedbacks are not data any more.
    salary_offer: float | None = None
    last_step: ApplicationLastStep | None = None
    feedback: ApplicationFeedback | None = None
