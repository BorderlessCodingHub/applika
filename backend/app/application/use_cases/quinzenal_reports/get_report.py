from datetime import date

from app.application.dto.quinzenal_report import (
    ManualMetricsDTO,
    ReportDays,
    ReportDetailDTO,
    ReportMetricsDTO,
    ReportPeriodDTO,
    ReportSummaryDTO,
)
from app.application.use_cases.quinzenal_reports.common import (
    get_current_day,
    get_next_report_day,
    get_phase,
    get_report_period,
)
from app.domain.models import QuinzenalReportModel
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)


class GetReportUseCase:
    def __init__(self, report_repo: QuinzenalReportRepository):
        self.report_repo = report_repo

    async def _calculate_metrics(
        self,
        user_id: int,
        report_start_date: date,
        period_start: date,
        period_end: date,
        cycle_id: int | None = None,
    ) -> ReportMetricsDTO:
        fortnight_metrics = await self.report_repo.calculate_fortnight_metrics(
            user_id=user_id,
            start_date=period_start,
            end_date=period_end,
            cycle_id=cycle_id,
        )
        accumulated_metrics = (
            await self.report_repo.calculate_accumulated_metrics(
                user_id=user_id,
                start_date=report_start_date,
                end_date=period_end,
                cycle_id=cycle_id,
            )
        )

        return ReportMetricsDTO(**fortnight_metrics, **accumulated_metrics)

    @staticmethod
    def _build_metrics_from_report(
        report: QuinzenalReportModel,
    ) -> ReportMetricsDTO:
        return ReportMetricsDTO(
            applications_count=report.applications_count,
            callback_rate=float(report.callback_rate),
            initial_screenings_count=report.initial_screenings_count,
            interviews_completed_fortnight=(
                report.interviews_completed_fortnight
            ),
            active_processes_count=report.active_processes_count,
            offers_count=report.offers_count,
            offer_rate=float(report.offer_rate),
            total_applications_count=report.total_applications_count,
            overall_conversion_rate=float(report.overall_conversion_rate),
            total_initial_screenings_count=(
                report.total_initial_screenings_count
            ),
        )

    async def execute(
        self, user_id: int, report_day: ReportDays,
        start_date: date | None,
        cycle_id: int | None = None,
    ) -> ReportDetailDTO:
        # Start date is only used in the first day of the report
        if report_day > 1:
            start_date = None

        reports = await self.report_repo.get_all_by_user_id(
            user_id, cycle_id
        )
        reports_by_day = {report.report_day: report for report in reports}
        submitted_days = set(reports_by_day)

        day_one_report = reports_by_day.get(1)
        if start_date == None:
            start_date = (day_one_report.start_date
                          if day_one_report else date.today())
        current_day = get_current_day(start_date)
        next_report_day = get_next_report_day(submitted_days)

        period_start, period_end = get_report_period(report_day, start_date)

        submitted_report = reports_by_day.get(report_day)

        report_summary = ReportSummaryDTO(
            day=report_day,
            phase=get_phase(report_day),
            submitted=submitted_report is not None,
            submitted_at=(
                submitted_report.submitted_at if submitted_report else None
            ),
        )

        if submitted_report:
            metrics = self._build_metrics_from_report(submitted_report)
            manual_metrics = ManualMetricsDTO(
                mock_interviews_count=submitted_report.mock_interviews_count,
                linkedin_posts_count=submitted_report.linkedin_posts_count,
                strategic_connections_count=(
                    submitted_report.strategic_connections_count
                ),
                biggest_win=submitted_report.biggest_win,
                biggest_challenge=submitted_report.biggest_challenge,
                next_fortnight_goal=submitted_report.next_fortnight_goal,
            )
            can_submit = False
        else:
            metrics = await self._calculate_metrics(
                user_id=user_id,
                report_start_date=start_date,
                period_start=period_start,
                period_end=period_end,
                cycle_id=cycle_id,
            )
            manual_metrics = None
            can_submit = (
                next_report_day == report_day
                and current_day >= report_day
                and (report_day == 1 or day_one_report is not None)
            )

        return ReportDetailDTO(
            report=report_summary,
            metrics=metrics,
            can_submit=can_submit,
            manual_metrics=manual_metrics,
            period=ReportPeriodDTO(
                start_date=period_start, end_date=period_end),
        )
