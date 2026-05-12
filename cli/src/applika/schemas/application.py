import datetime

from pydantic import BaseModel, HttpUrl, model_validator

from applika.schemas.enums import (
    ApplicationMode,
    Currency,
    ExperienceLevel,
    SalaryPeriod,
    WorkMode,
)


class ApplicationCompanyInput(BaseModel):
    name: str
    url: HttpUrl | None = None


class ApplicationCreate(BaseModel):
    company: str
    role: str
    platform: str
    mode: ApplicationMode
    application_date: datetime.date
    company_url: str | None = None
    job_url: str | None = None
    observation: str | None = None
    expected_salary: float | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    experience_level: ExperienceLevel | None = None
    work_mode: WorkMode | None = None
    country: str | None = None

    @model_validator(mode='after')
    def validate_salary(self) -> 'ApplicationCreate':
        amounts = [self.expected_salary, self.salary_min, self.salary_max]
        if any(v is not None for v in amounts):
            if self.currency is None or self.salary_period is None:
                raise ValueError(
                    '--currency and --salary-period are required when any salary field is set'
                )
        return self


class ApplicationUpdate(BaseModel):
    company: str | None = None
    role: str | None = None
    platform: str | None = None
    mode: ApplicationMode | None = None
    application_date: datetime.date | None = None
    company_url: str | None = None
    job_url: str | None = None
    observation: str | None = None
    expected_salary: float | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
    experience_level: ExperienceLevel | None = None
    work_mode: WorkMode | None = None
    country: str | None = None

    @model_validator(mode='after')
    def validate_salary(self) -> 'ApplicationUpdate':
        amounts = [self.expected_salary, self.salary_min, self.salary_max]
        if any(v is not None for v in amounts):
            if self.currency is None or self.salary_period is None:
                raise ValueError(
                    '--currency and --salary-period are required when any salary field is set'
                )
        return self
