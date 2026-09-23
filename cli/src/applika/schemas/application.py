import datetime

from pydantic import BaseModel, Field, HttpUrl, model_validator
from typing_extensions import TypedDict

from applika.schemas.enums import (
    ApplicationMode,
    Currency,
    DeniedReason,
    ExperienceLevel,
    FinalizeOutcome,
    OfferPeriod,
    SalaryPeriod,
    WorkMode,
)

MAX_JOB_DESCRIPTION = 50_000


class ApplicationCompany(TypedDict):
    name: str
    url: HttpUrl | None


class ApplicationCreate(BaseModel):
    company: str | ApplicationCompany
    role: str
    mode: ApplicationMode
    platform_id: str
    application_date: datetime.date
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
    # KODI-018: the posting's free text. The API's ``UpdateApplication``
    # treats it as *sticky* - omit the key and the stored text stays, send
    # ``null`` and it is cleared - so ``applications edit`` pops the key
    # from the dumped payload unless the caller actually asked for it.
    job_description: str | None = Field(
        default=None, max_length=MAX_JOB_DESCRIPTION
    )

    @model_validator(mode='after')
    def validate_salary(self) -> 'ApplicationCreate':
        amounts = [
            self.expected_salary,
            self.salary_range_min,
            self.salary_range_max,
        ]
        if any(v is not None for v in amounts):
            if self.currency is None or self.salary_period is None:
                raise ValueError(
                    'currency and salary-period are required when any salary field is set'
                )
        return self


class ApplicationUpdate(ApplicationCreate): ...


class ApplicationLastStep(TypedDict):
    id: str
    name: str
    color: str
    date: str


class ApplicationFeedback(TypedDict):
    id: str
    name: str
    color: str
    date: str


class ApplicationEntry(TypedDict):
    id: str
    company_id: str | None
    company_name: str
    role: str
    mode: str
    platform_id: str
    application_date: str
    link_to_job: str | None
    observation: str | None
    expected_salary: float | None
    salary_range_min: float | None
    salary_range_max: float | None
    currency: str | None
    salary_period: str | None
    experience_level: str | None
    work_mode: str | None
    country: str | None
    job_description: str | None
    salary_offer: float | None
    finalized_at: str | None
    finalized: bool
    last_step: ApplicationLastStep | None
    feedback: ApplicationFeedback | None


OFFER_OUTCOME_NEEDS_SALARY = (
    '--salary, --currency and --period are required when --outcome offer'
)
SALARY_ONLY_ON_OFFER_OUTCOME = (
    '--salary, --currency and --period are only allowed when --outcome offer'
)
FIELDS_NEED_AN_OUTCOME = (
    '--date and --observation require --outcome (offer or denied)'
)
REASON_ONLY_ON_DENIED_OUTCOME = '--reason is only allowed when --outcome denied'


class FinalizeOutcomePayload(BaseModel):
    """The new optional finalize body (R-032, R-033..R-036). Mirrors the
    backend's ``FinalizeWithOutcome`` validation so the CLI refuses the same
    combinations before any request is made."""

    outcome: FinalizeOutcome | None = None
    event_date: datetime.date | None = None
    observation: str | None = None
    salary_amount: float | None = None
    salary_currency: Currency | None = None
    salary_period: OfferPeriod | None = None
    denied_reason: DeniedReason | None = None

    @model_validator(mode='after')
    def validate_outcome(self) -> 'FinalizeOutcomePayload':
        salary_fields = (
            self.salary_amount,
            self.salary_currency,
            self.salary_period,
        )
        if self.outcome == FinalizeOutcome.OFFER:
            if any(field is None for field in salary_fields):
                raise ValueError(OFFER_OUTCOME_NEEDS_SALARY)
        elif any(field is not None for field in salary_fields):
            raise ValueError(SALARY_ONLY_ON_OFFER_OUTCOME)

        if self.outcome == FinalizeOutcome.DENIED:
            if self.denied_reason is None:
                self.denied_reason = DeniedReason.UNKNOWN
        elif self.denied_reason is not None:
            raise ValueError(REASON_ONLY_ON_DENIED_OUTCOME)

        if self.outcome is None and (
            self.event_date is not None or self.observation is not None
        ):
            raise ValueError(FIELDS_NEED_AN_OUTCOME)
        return self
