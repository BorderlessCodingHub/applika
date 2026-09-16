import datetime

from pydantic import BaseModel, HttpUrl, model_validator
from typing_extensions import TypedDict

from applika.schemas.enums import (
    ApplicationMode,
    Currency,
    ExperienceLevel,
    SalaryPeriod,
    WorkMode,
)


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
    salary_offer: float | None
    finalized: bool
    last_step: ApplicationLastStep | None
    feedback: ApplicationFeedback | None
