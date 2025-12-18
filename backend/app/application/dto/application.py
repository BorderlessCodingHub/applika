from datetime import date

from pydantic import BaseModel, HttpUrl, Field
from typing_extensions import Literal

from app.application.dto import BaseSchema


class ApplicationCreateDTO(BaseModel):
    user_id: int
    company: str
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
    application_date: date
    link_to_job: HttpUrl | None
    observation: str | None = None
    expected_salary: float | None = None
    salary_range_min: float | None = None
    salary_range_max: float | None = None


class ApplicationUpdateDTO(BaseModel):
    user_id: int
    company: str
    role: str
    mode: Literal['active', 'passive']
    platform_id: int
    application_date: date
    link_to_job: HttpUrl | None
    observation: str | None = None
    expected_salary: float | None = None
    salary_range_min: float | None = None
    salary_range_max: float | None = None


class FinalizeApplicationDTO(BaseModel):
    step_id: int  # only strict steps
    feedback_id: int
    finalize_date: date
    salary_offer: float | None = None
    observation: str | None = None


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
    company: str
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

    last_step: ApplicationLastStep | None = None
    feedback: ApplicationFeedback | None = None
