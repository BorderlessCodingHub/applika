from datetime import date
from decimal import Decimal

from pydantic import BaseModel

from app.core.enums import EventType, InterviewType


class GeneralStatsDTO(BaseModel):
    total_applications: int
    success_rate: float
    offers: int
    denials: int


class StageConversionDTO(BaseModel):
    """Applications that reached a stage, and their share of all (R-023)."""

    event_type: EventType
    interview_type: InterviewType | None = None
    total_applications: int
    conversion_rate: float


class StageAverageDaysDTO(BaseModel):
    """Average days from application to a stage's events (R-023)."""

    event_type: EventType
    interview_type: InterviewType | None = None
    average_days: Decimal


class PlarformAppDTO(BaseModel):
    id: int
    name: str
    total_applications: int


class ModeAppDTO(BaseModel):
    passive: int
    active: int


class ApplicationsTrendDTO(BaseModel):
    application_date: date
    total_applications: int
