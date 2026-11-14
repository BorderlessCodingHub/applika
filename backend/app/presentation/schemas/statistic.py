from datetime import date

from pydantic import BaseModel

from app.core.enums import EventType, InterviewType
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema


class ApplicationsStatistics(BaseSchema):
    total_applications: int
    success_rate: float
    offers: int
    denials: int
    active: int


class StepConversionRate(BaseModel):
    """One stage (R-023): an interview type, offer or denied."""

    event_type: EventType
    interview_type: InterviewType | None = None
    total_applications: int
    conversion_rate: float


class AvarageDaysSteps(BaseModel):
    """One stage (R-023): an interview type, offer or denied."""

    event_type: EventType
    interview_type: InterviewType | None = None
    average_days: float


class PlarformApplications(BaseModel):
    id: SnowflakeID
    name: str
    total_applications: int


class ModeApplications(BaseModel):
    passive: int
    active: int


class ApplicationsTrend(BaseModel):
    application_date: date
    total_applications: int
