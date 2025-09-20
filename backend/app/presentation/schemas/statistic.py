from datetime import date
from pydantic import BaseModel

from app.presentation.schemas import BaseSchema


class ApplicationsStatistics(BaseSchema):
    total_applications: int
    success_rate: float
    offers: int
    denials: int


class StepConversionRate(BaseModel):
    id: int
    name: str
    color: str
    total_applications: int
    conversion_rate: float


class AvarageDaysSteps(BaseModel):
    id: int
    name: str
    color: str
    average_days: int


class PlarformApplications(BaseModel):
    id: int
    name: str
    total_applications: int


class ModeApplications(BaseModel):
    passive: int
    active: int


class ApplicationsTrend(BaseModel):
    application_date: date
    total_applications: int
