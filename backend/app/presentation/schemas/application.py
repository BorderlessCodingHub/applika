from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator

from app.core.enums import Currency, ExperienceLevel, SalaryPeriod, WorkMode
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema, TimeSchema
from app.presentation.schemas.timeline_event import MAX_OBSERVATION

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


OFFER_OUTCOME_NEEDS_SALARY = (
    'outcome offer requires salary_amount, salary_currency and salary_period'
)
SALARY_ONLY_ON_OFFER_OUTCOME = (
    'salary_amount, salary_currency and salary_period are only allowed '
    'when outcome is offer'
)
FIELDS_NEED_AN_OUTCOME = (
    'event_date, observation and the salary fields require an outcome '
    '(offer or denied); send no body, {} or null to close with no outcome'
)


class FinalizeWithOutcome(BaseSchema):
    """The new optional finalize body (R-032, backend part of R-032; the UI
    is KODI-012).

    ``outcome`` is ``offer``, ``denied`` or absent. A body that reaches this
    schema always has at least one key and neither ``step_id`` nor
    ``feedback_id`` (the router routes those bodies elsewhere first); every
    field here is otherwise optional, and a body whose fields are all
    absent or null is handled the same as no body at all - the existing
    idempotent close, no outcome recorded (the router checks
    ``outcome is None`` after this validates).

    Every rule below is enforced before any I/O, same as the timeline
    write schema (``presentation/schemas/timeline_event.py``):

    * an invalid ``outcome`` value (anything but ``offer``/``denied``) is a
      422 from the ``Literal`` type itself;
    * ``outcome=offer`` requires ``salary_amount``, ``salary_currency`` and
      ``salary_period``;
    * ``salary_amount``/``salary_currency``/``salary_period`` are refused
      when ``outcome`` is ``denied`` or absent;
    * ``event_date`` or ``observation`` without an outcome is refused too
      (the orchestrator's pin: those fields never get silently dropped).

    There is deliberately **no** restriction to ``monthly``/``annually`` on
    the offer's ``salary_period`` here (unlike the timeline write schema):
    ``use_cases/timeline_events/rules.normalize_event`` - the same rule set
    the legacy finalize body already goes through - is the single source of
    truth for the offer-salary invariant, and it does not restrict the
    period either.
    """

    outcome: Literal['offer', 'denied'] | None = None
    event_date: date | None = None
    observation: str | None = Field(default=None, max_length=MAX_OBSERVATION)
    salary_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    salary_currency: Currency | None = None
    salary_period: SalaryPeriod | None = None

    @model_validator(mode='after')
    def _validate_outcome(self) -> 'FinalizeWithOutcome':
        salary = (
            self.salary_amount,
            self.salary_currency,
            self.salary_period,
        )
        if self.outcome == 'offer':
            if any(field is None for field in salary):
                raise ValueError(OFFER_OUTCOME_NEEDS_SALARY)
        elif any(field is not None for field in salary):
            raise ValueError(SALARY_ONLY_ON_OFFER_OUTCOME)

        if self.outcome is None and (
            self.event_date is not None or self.observation is not None
        ):
            raise ValueError(FIELDS_NEED_AN_OUTCOME)
        return self
