from datetime import date
from typing import Annotated

from fastapi import APIRouter
from fastapi.params import Query
from pydantic import BeforeValidator

from app.lib.types import SnowflakeID

from app.application.dto.quinzenal_report import (
    ReportDays,
    SubmitReportPayloadDTO,
)
from app.application.use_cases.quinzenal_reports.get_report import (
    GetReportUseCase,
)
from app.application.use_cases.quinzenal_reports.list_reports import (
    ListReportsUseCase,
)
from app.application.use_cases.quinzenal_reports.submit_report import (
    SubmitReportUseCase,
)
from app.presentation.dependencies import (
    CurrentUserDp,
    DiscordServiceDp,
    QuinzenalReportRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.quinzenal_report import (
    ReportDetailResponse,
    ReportListResponse,
    SubmitReportRequest,
    SubmitReportResponse,
)

router = APIRouter(tags=['Reports'], responses={
                   '403': {'model': DetailSchema}})


@router.get('/reports', response_model=ReportListResponse)
async def list_reports(
    c_user: CurrentUserDp,
    report_repo: QuinzenalReportRepositoryDp,
    cycle_id: SnowflakeID | None = None,
):
    use_case = ListReportsUseCase(report_repo)
    report_list = await use_case.execute(
        c_user.id,
        cycle_id=int(cycle_id) if cycle_id else None,
    )
    return ReportListResponse.model_validate(report_list.model_dump())


ReportDaysPath = Annotated[ReportDays, BeforeValidator(lambda v: int(v))]
ReportStartDate = Annotated[date | None, Query(
    description="This param is 'required' for the first day"
)]


@router.get(
    '/reports/{day}',
    response_model=ReportDetailResponse,
    response_model_exclude_none=True,
    responses={'404': {'model': DetailSchema}},
)
async def get_report(
    day: ReportDaysPath,
    c_user: CurrentUserDp,
    report_repo: QuinzenalReportRepositoryDp,
    start_date: ReportStartDate = None,
    cycle_id: SnowflakeID | None = None,
):
    use_case = GetReportUseCase(report_repo)
    report = await use_case.execute(
        c_user.id, day, start_date,
        cycle_id=int(cycle_id) if cycle_id else None,
    )
    return ReportDetailResponse.model_validate(report.model_dump())


@router.post(
    '/reports/{day}/submit',
    response_model=SubmitReportResponse,
    responses={
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
    },
)
async def submit_report(
    day: ReportDaysPath,
    payload: SubmitReportRequest,
    c_user: CurrentUserDp,
    report_repo: QuinzenalReportRepositoryDp,
    discord_service: DiscordServiceDp,
):
    use_case = SubmitReportUseCase(report_repo, discord_service)
    data = SubmitReportPayloadDTO(**payload.model_dump())
    report = await use_case.execute(c_user.id, c_user.username, day, data)
    return SubmitReportResponse.model_validate(report.model_dump())
