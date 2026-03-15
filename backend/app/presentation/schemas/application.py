from datetime import date

from pydantic import BaseModel, HttpUrl
from typing_extensions import Literal

from app.core.enums import Currency, ExperienceLevel, SalaryPeriod, WorkMode
from app.presentation.schemas import BaseSchema, TimeSchema


class CreateApplication(BaseSchema):
    company_id: int
    old_company: str
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


class UpdateApplication(BaseModel):
    company_id: int
    old_company: str
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


class ApplicationCompany(BaseSchema):
    id: int
    name: str
    url: str


class ApplicationLastStep(BaseSchema):
    id: int
    name: str
    color: str
    date: date


class ApplicationFeedback(BaseSchema):
    id: int
    name: str
    color: str
    date: date


class Application(BaseSchema, TimeSchema):
    id: int
    company: ApplicationCompany | None = None
    old_company: str
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
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

    finalized: bool
    last_step: ApplicationLastStep | None = None
    feedback: ApplicationFeedback | None = None


class FinalizeApplication(BaseModel):
    step_id: int  # only strict steps
    feedback_id: int
    finalize_date: date
    salary_offer: float | None = None
    observation: str | None = None
