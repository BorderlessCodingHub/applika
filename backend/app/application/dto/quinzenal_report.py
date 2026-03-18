from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

ReportStatus = Literal['submitted', 'pending', 'overdue', 'future']


class ReportListItemDTO(BaseModel):
    day: int
    status: ReportStatus
    submitted_at: datetime | None = None


class ReportsListDTO(BaseModel):
    reports: list[ReportListItemDTO]
    current_day: int
    current_phase: int
    start_date: date


class ReportSummaryDTO(BaseModel):
    day: int
    phase: int
    submitted: bool
    submitted_at: datetime | None = None


class ReportMetricsDTO(BaseModel):
    applications_count: int
    callback_rate: float
    initial_screenings_count: int
    interviews_completed_fortnight: int
    active_processes_count: int
    offers_count: int
    offer_rate: float
    total_applications_count: int
    overall_conversion_rate: float
    total_initial_screenings_count: int


class ManualMetricsDTO(BaseModel):
    mock_interviews_count: int = Field(ge=0)
    linkedin_posts_count: int = Field(ge=0)
    strategic_connections_count: int = Field(ge=0)
    biggest_win: str = Field(min_length=1, max_length=280)
    biggest_challenge: str = Field(min_length=1, max_length=280)
    next_fortnight_goal: str = Field(min_length=1, max_length=500)


class ReportPeriodDTO(BaseModel):
    start_date: date
    end_date: date


class ReportDetailDTO(BaseModel):
    report: ReportSummaryDTO
    metrics: ReportMetricsDTO
    can_submit: bool
    period: ReportPeriodDTO
    manual_metrics: ManualMetricsDTO | None = None


class SubmitReportPayloadDTO(ManualMetricsDTO):
    start_date: date | None = None


class SubmitReportResultDTO(BaseModel):
    success: bool
    report_id: int
    discord_posted: bool
    discord_error: str | None = None
