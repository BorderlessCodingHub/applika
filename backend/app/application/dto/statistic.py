from datetime import date
from decimal import Decimal

from pydantic import BaseModel


class GeneralStatsDTO(BaseModel):
    total_applications: int
    success_rate: float
    offers: int
    denials: int


class StepConversionDTO(BaseModel):
    id: int
    name: str
    color: str
    total_applications: int
    conversion_rate: float


class AvarageDaysDTO(BaseModel):
    id: int
    name: str
    color: str
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
