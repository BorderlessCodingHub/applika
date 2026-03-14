from fastapi import APIRouter

from app.application.dto.quinzenal_report import SubmitReportPayloadDTO
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

router = APIRouter(tags=['Reports'], responses={'403': {'model': DetailSchema}})


@router.get('/reports', response_model=ReportListResponse)
async def list_reports(
    c_user: CurrentUserDp,
    report_repo: QuinzenalReportRepositoryDp,
):
    use_case = ListReportsUseCase(report_repo)
    report_list = await use_case.execute(c_user.id)
    return ReportListResponse.model_validate(report_list.model_dump())


@router.get(
    '/reports/{day}',
    response_model=ReportDetailResponse,
    response_model_exclude_none=True,
    responses={'404': {'model': DetailSchema}},
)
async def get_report(
    day: int,
    c_user: CurrentUserDp,
    report_repo: QuinzenalReportRepositoryDp,
):
    use_case = GetReportUseCase(report_repo)
    report = await use_case.execute(c_user.id, day)
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
    day: int,
    payload: SubmitReportRequest,
    c_user: CurrentUserDp,
    report_repo: QuinzenalReportRepositoryDp,
    discord_service: DiscordServiceDp,
):
    use_case = SubmitReportUseCase(report_repo, discord_service)
    data = SubmitReportPayloadDTO(**payload.model_dump())
    report = await use_case.execute(c_user.id, c_user.username, day, data)
    return SubmitReportResponse.model_validate(report.model_dump())
