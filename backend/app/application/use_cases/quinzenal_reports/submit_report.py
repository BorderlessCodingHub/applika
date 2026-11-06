from datetime import UTC, date, datetime

from app.application.dto.quinzenal_report import (
    ReportDays,
    ReportMetricsDTO,
    SubmitReportPayloadDTO,
    SubmitReportResultDTO,
)
from app.application.services.discord_service import DiscordService
from app.application.use_cases.quinzenal_reports.common import (
    get_current_day,
    get_next_report_day,
    get_phase,
    get_report_period,
)
from app.application.use_cases.quinzenal_reports.resolve_report_webhooks import (
    ResolveReportWebhooksUseCase,
)
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import (
    ForbiddenAccess,
    InvalidRequest,
    ResourceConflict,
)
from app.domain.models import QuinzenalReportModel
from app.domain.repositories.quinzenal_report_repository import (
    QuinzenalReportRepository,
)

_MAX_DISCORD_ERROR_LENGTH = 500


class SubmitReportUseCase:
    _DISCORD_SPECIAL_CHARS = ('\\', '*', '_', '`', '~', '|', '>')

    def __init__(
        self,
        report_repo: QuinzenalReportRepository,
        discord_service: DiscordService,
        resolve_webhooks: ResolveReportWebhooksUseCase,
    ):
        self.report_repo = report_repo
        self.discord_service = discord_service
        self.resolve_webhooks = resolve_webhooks

    @classmethod
    def _sanitize_discord_text(cls, text: str, *, max_length: int) -> str:
        sanitized = ' '.join(text.strip().split())
        for char in cls._DISCORD_SPECIAL_CHARS:
            sanitized = sanitized.replace(char, f'\\{char}')
        return sanitized[:max_length]

    async def _calculate_metrics(
        self,
        user_id: int,
        report_start_date: date,
        period_start: date,
        period_end: date,
    ) -> ReportMetricsDTO:
        fortnight_metrics = await self.report_repo.calculate_fortnight_metrics(
            user_id=user_id,
            start_date=period_start,
            end_date=period_end,
        )
        accumulated_metrics = (
            await self.report_repo.calculate_accumulated_metrics(
                user_id=user_id,
                start_date=report_start_date,
                end_date=period_end,
            )
        )

        return ReportMetricsDTO(**fortnight_metrics, **accumulated_metrics)

    @classmethod
    def _build_discord_message(
        cls,
        report_day: ReportDays,
        username: str,
        phase: int,
        metrics: ReportMetricsDTO,
        payload: SubmitReportPayloadDTO,
    ) -> str:
        safe_username = cls._sanitize_discord_text(username, max_length=100)
        safe_biggest_win = cls._sanitize_discord_text(
            payload.biggest_win,
            max_length=280,
        )
        safe_biggest_challenge = cls._sanitize_discord_text(
            payload.biggest_challenge,
            max_length=280,
        )
        safe_next_fortnight_goal = cls._sanitize_discord_text(
            payload.next_fortnight_goal,
            max_length=500,
        )

        return (
            f'🏁 **REPORT - DAY {report_day} OF 120** - @{safe_username}\n'
            f'📅 Phase: {phase}\n\n'
            '📊 **FORTNIGHT METRICS:**\n'
            f'• Applications sent: {metrics.applications_count}\n'
            f'• Initial screenings: {metrics.initial_screenings_count}\n'
            '• Interviews completed: '
            f'{metrics.interviews_completed_fortnight}\n'
            f'• Offers: {metrics.offers_count}\n'
            f'• Active processes: {metrics.active_processes_count}\n\n'
            '📊 **COMPLEMENTARY METRICS:**\n'
            f'• Mock interviews: {payload.mock_interviews_count}\n'
            f'• LinkedIn posts: {payload.linkedin_posts_count}\n'
            f'• LinkedIn connections: {payload.strategic_connections_count}\n\n'
            f'🔥 **BIGGEST WIN:** {safe_biggest_win}\n'
            f'🧱 **BIGGEST CHALLENGE:** {safe_biggest_challenge}\n\n'
            '📈 **ACCUMULATED:**\n'
            f'• Total applications: {metrics.total_applications_count}\n'
            '• Total initial screenings: '
            f'{metrics.total_initial_screenings_count}\n'
            f'• Callback rate: {metrics.callback_rate}%\n'
            f'• Offer rate: {metrics.offer_rate}%\n\n'
            f'🎯 **NEXT FORTNIGHT GOAL:** {safe_next_fortnight_goal}'
        )

    async def execute(
        self,
        user_id: int,
        username: str,
        report_day: ReportDays,
        payload: SubmitReportPayloadDTO,
    ) -> SubmitReportResultDTO:
        # Start date is only used in the first day of the report
        if report_day > 1:
            payload.start_date = None

        reports = await self.report_repo.get_all_by_user_id(user_id)
        reports_by_day = {report.report_day: report for report in reports}
        submitted_days = set(reports_by_day)

        submitted_report = reports_by_day.get(report_day)
        if submitted_report:
            logger.warning(
                f'Report day {report_day} already submitted',
                extra={
                    'extra_data': {
                        'event': 'report_submit_failed',
                        'reason': 'already_submitted',
                        'user_id': user_id,
                        'report_day': report_day,
                    }
                },
            )
            raise ResourceConflict(
                'Report already submitted', ErrorCode.RPT_ALREADY_SUBMITTED
            )

        next_report_day = get_next_report_day(submitted_days)
        if next_report_day != report_day:
            raise ForbiddenAccess(
                'Must submit current report before proceeding',
                ErrorCode.RPT_CURRENT_REPORT_FIRST,
            )

        if report_day == 1:
            if payload.start_date is None:
                raise InvalidRequest(
                    'start_date is required for day 1 report',
                    ErrorCode.RPT_START_DATE_REQUIRED,
                )
            if payload.start_date > date.today():
                raise InvalidRequest(
                    'start_date cannot be in the future',
                    ErrorCode.RPT_START_DATE_IN_FUTURE,
                )
            start_date = payload.start_date
        else:
            day_one_report = reports_by_day.get(1)
            if day_one_report is None:
                raise ForbiddenAccess(
                    'Must submit day 1 report first',
                    ErrorCode.RPT_DAY_ONE_FIRST,
                )
            start_date = day_one_report.start_date

        current_day = get_current_day(start_date)
        if current_day < report_day:
            raise ForbiddenAccess(
                'Cannot submit report for a future day',
                ErrorCode.RPT_FUTURE_DAY,
            )

        period_start, period_end = get_report_period(report_day, start_date)
        metrics = await self._calculate_metrics(
            user_id=user_id,
            report_start_date=start_date,
            period_start=period_start,
            period_end=period_end,
        )

        report = QuinzenalReportModel(
            user_id=user_id,
            report_day=report_day,
            start_date=start_date,
            phase=get_phase(report_day),
            applications_count=metrics.applications_count,
            callback_rate=metrics.callback_rate,
            initial_screenings_count=metrics.initial_screenings_count,
            interviews_completed_fortnight=(
                metrics.interviews_completed_fortnight
            ),
            active_processes_count=metrics.active_processes_count,
            offers_count=metrics.offers_count,
            offer_rate=metrics.offer_rate,
            total_applications_count=metrics.total_applications_count,
            overall_conversion_rate=metrics.overall_conversion_rate,
            total_initial_screenings_count=(
                metrics.total_initial_screenings_count
            ),
            mock_interviews_count=payload.mock_interviews_count,
            linkedin_posts_count=payload.linkedin_posts_count,
            strategic_connections_count=payload.strategic_connections_count,
            biggest_win=payload.biggest_win,
            biggest_challenge=payload.biggest_challenge,
            next_fortnight_goal=payload.next_fortnight_goal,
            submitted_at=datetime.now(UTC),
            discord_posted=False,
        )

        saved_report = await self.report_repo.create(report)
        # Captured now as plain values: a later rollback on the shared
        # session would expire ``saved_report``.
        report_id = saved_report.id
        report_discord_posted = saved_report.discord_posted

        # The report is saved before Discord is ever contacted (R-028): a
        # Discord failure never blocks or unwinds the submission - each
        # Discord-facing call below is its own try/except on top of the
        # services' own error handling, so a defect in a service (or an
        # answer neither service anticipated) still can't turn into an
        # unhandled 500 on an already-saved report (T126, backend-qa B1).
        discord_posted = False
        discord_errors: list[str] = []

        try:
            webhook_urls = await self.resolve_webhooks.execute(user_id)
        except Exception as exc:
            logger.error(
                f'Resolving report webhooks failed unexpectedly: '
                f'{type(exc).__name__}',
                extra={
                    'extra_data': {
                        'event': 'report_route_resolution_failed',
                        'user_id': user_id,
                        'exception_type': type(exc).__name__,
                    }
                },
            )
            webhook_urls = []

        if webhook_urls:
            discord_message = self._build_discord_message(
                report_day=report_day,
                username=username,
                phase=report.phase,
                metrics=metrics,
                payload=payload,
            )
            for webhook_url in webhook_urls:
                try:
                    (
                        posted,
                        error,
                    ) = await self.discord_service.post_report_message(
                        discord_message,
                        webhook_url=webhook_url,
                    )
                except Exception as exc:
                    logger.error(
                        f'Posting the report to Discord failed '
                        f'unexpectedly: {type(exc).__name__}',
                        extra={
                            'extra_data': {
                                'event': 'report_post_failed_unexpectedly',
                                'user_id': user_id,
                                'exception_type': type(exc).__name__,
                            }
                        },
                    )
                    posted, error = False, 'Discord post failed unexpectedly'
                if posted:
                    discord_posted = True
                elif error:
                    discord_errors.append(error)

            if discord_posted and not report_discord_posted:
                saved_report.discord_posted = True
                saved_report = await self.report_repo.update(saved_report)
                report_discord_posted = saved_report.discord_posted

        discord_error = (
            '; '.join(discord_errors)[:_MAX_DISCORD_ERROR_LENGTH]
            if discord_errors
            else None
        )

        logger.info(
            f'Report day {report_day} submitted successfully',
            extra={
                'extra_data': {
                    'event': 'report_submitted',
                    'user_id': user_id,
                    'report_day': report_day,
                    'report_id': report_id,
                    'discord_posted': report_discord_posted,
                }
            },
        )

        return SubmitReportResultDTO(
            success=True,
            report_id=report_id,
            discord_posted=report_discord_posted,
            discord_error=discord_error,
        )
