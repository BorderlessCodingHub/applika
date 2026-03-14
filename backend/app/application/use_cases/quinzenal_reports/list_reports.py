from datetime import date

from app.application.dto.quinzenal_report import (
    ReportListItemDTO,
    ReportsListDTO,
)
from app.application.use_cases.quinzenal_reports.common import (
    REPORT_DAYS,
    get_current_day,
    get_next_report_day,
    get_phase,
)
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)


class ListReportsUseCase:
    def __init__(self, report_repo: QuinzenalReportRepository):
        self.report_repo = report_repo

    async def execute(self, user_id: int) -> ReportsListDTO:
        reports = await self.report_repo.get_all_by_user_id(user_id)
        reports_by_day = {report.report_day: report for report in reports}
        submitted_days = set(reports_by_day)

        day_one_report = reports_by_day.get(1)
        if day_one_report:
            start_date = day_one_report.start_date
            current_day = get_current_day(start_date)
        else:
            start_date = date.today()
            current_day = 1

        next_report_day = get_next_report_day(submitted_days)

        response_reports: list[ReportListItemDTO] = []

        for report_day in REPORT_DAYS:
            submitted_report = reports_by_day.get(report_day)

            if submitted_report:
                response_reports.append(
                    ReportListItemDTO(
                        day=report_day,
                        status='submitted',
                        submitted_at=submitted_report.submitted_at,
                    )
                )
                continue

            if next_report_day != report_day:
                status = 'future'
            elif current_day == report_day:
                status = 'pending'
            elif current_day > report_day:
                status = 'overdue'
            else:
                status = 'future'

            response_reports.append(
                ReportListItemDTO(day=report_day, status=status)
            )

        return ReportsListDTO(
            reports=response_reports,
            current_day=current_day,
            current_phase=get_phase(current_day),
            start_date=start_date,
        )
