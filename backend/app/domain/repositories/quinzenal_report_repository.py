from datetime import date
from typing import Any

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType, InterviewType
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict
from app.domain.models import (
    ApplicationModel,
    QuinzenalReportModel,
    TimelineEventModel,
)
from app.domain.repositories.application_filters import NOT_DRAFT

UNIQUE_REPORT_DAY_CONSTRAINT = 'uq_quinzenal_reports_user_day'
UNIQUE_REPORT_DAY_CYCLE_CONSTRAINT = 'uq_quinzenal_reports_user_day_cycle'
UNIQUE_REPORT_DAY_NULL_CYCLE_CONSTRAINT = (
    'uq_quinzenal_reports_user_day_null_cycle'
)


def _report_cycle_filter(cycle_id: int | None):
    if cycle_id is not None:
        return QuinzenalReportModel.cycle_id == cycle_id
    return QuinzenalReportModel.cycle_id.is_(None)


def _app_cycle_filter(cycle_id: int | None):
    """Scope + draft exclusion (KODI-032): a draft never counts toward a
    report, whatever the cycle scope."""
    if cycle_id is not None:
        return sa.and_(ApplicationModel.cycle_id == cycle_id, NOT_DRAFT)
    return sa.and_(ApplicationModel.cycle_id.is_(None), NOT_DRAFT)


class QuinzenalReportRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_user_start_date(
        self, user_id: int, cycle_id: int | None = None
    ) -> date:
        start_date = await self.session.scalar(
            select(func.min(QuinzenalReportModel.start_date)).where(
                QuinzenalReportModel.user_id == user_id,
                _report_cycle_filter(cycle_id),
            )
        )
        return start_date or date.today()

    async def get_all_by_user_id(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[QuinzenalReportModel]:
        reports = await self.session.scalars(
            select(QuinzenalReportModel)
            .where(
                QuinzenalReportModel.user_id == user_id,
                _report_cycle_filter(cycle_id),
            )
            .order_by(QuinzenalReportModel.report_day.asc())
        )
        return list(reports)

    async def get_by_user_id_and_report_day(
        self, user_id: int, report_day: int, cycle_id: int | None = None
    ) -> QuinzenalReportModel | None:
        return await self.session.scalar(
            select(QuinzenalReportModel).where(
                QuinzenalReportModel.user_id == user_id,
                QuinzenalReportModel.report_day == report_day,
                _report_cycle_filter(cycle_id),
            )
        )

    async def create(
        self, report: QuinzenalReportModel
    ) -> QuinzenalReportModel:
        try:
            self.session.add(report)
            await self.session.commit()
            await self.session.refresh(report)
            return report
        except IntegrityError as error:
            await self.session.rollback()

            error_str = str(error)
            if (
                UNIQUE_REPORT_DAY_CONSTRAINT in error_str
                or UNIQUE_REPORT_DAY_CYCLE_CONSTRAINT in error_str
                or UNIQUE_REPORT_DAY_NULL_CYCLE_CONSTRAINT in error_str
            ):
                raise ResourceConflict(
                    'Report already submitted', ErrorCode.RPT_ALREADY_SUBMITTED
                ) from error

            raise
        except Exception:
            await self.session.rollback()
            raise

    async def update(
        self, report: QuinzenalReportModel
    ) -> QuinzenalReportModel:
        try:
            self.session.add(report)
            await self.session.commit()
            await self.session.refresh(report)
            return report
        except Exception:
            await self.session.rollback()
            raise

    # --- Computed metrics, from the timeline (R-024) --------------------
    #
    # Only NEW reports are computed here. A submitted report is a stored
    # row and is never recomputed (R-025).

    def _events_in_scope(self, user_id: int, cycle_id: int | None):
        return (
            select(TimelineEventModel.application_id)
            .select_from(TimelineEventModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == TimelineEventModel.application_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                TimelineEventModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
            )
        )

    async def _count_applications(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        cycle_id: int | None,
    ) -> int:
        total = await self.session.scalar(
            select(func.count())
            .select_from(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationModel.application_date >= start_date,
                ApplicationModel.application_date <= end_date,
            )
        )
        return int(total or 0)

    async def _count_distinct_apps(self, stmt: Any) -> int:
        subquery = stmt.distinct().subquery()
        total = await self.session.scalar(
            select(func.count()).select_from(subquery)
        )
        return int(total or 0)

    async def _count_initial_screenings(
        self,
        user_id: int,
        cycle_id: int | None,
        events_from: date | None,
        events_to: date,
        applied_from: date | None = None,
        applied_to: date | None = None,
    ) -> int:
        """Distinct applications with an ``initial_screening`` interview.

        The owner, 2026-09-15: "No, explicit only". An interview of type
        ``unknown``, or of any other type, is not an initial screening, so a
        user who never picks a type reports 0 here and a 0% callback rate.
        """
        stmt = self._events_in_scope(user_id, cycle_id).where(
            TimelineEventModel.event_type == EventType.INTERVIEW,
            TimelineEventModel.interview_type
            == InterviewType.INITIAL_SCREENING,
            TimelineEventModel.event_date <= events_to,
        )
        if events_from is not None:
            stmt = stmt.where(TimelineEventModel.event_date >= events_from)
        if applied_from is not None:
            stmt = stmt.where(ApplicationModel.application_date >= applied_from)
        if applied_to is not None:
            stmt = stmt.where(ApplicationModel.application_date <= applied_to)
        return await self._count_distinct_apps(stmt)

    async def _count_offers(
        self,
        user_id: int,
        cycle_id: int | None,
        events_from: date | None,
        events_to: date,
        applied_from: date | None = None,
        applied_to: date | None = None,
    ) -> int:
        """Distinct applications with at least one ``offer`` event."""
        stmt = self._events_in_scope(user_id, cycle_id).where(
            TimelineEventModel.event_type == EventType.OFFER,
            TimelineEventModel.event_date <= events_to,
        )
        if events_from is not None:
            stmt = stmt.where(TimelineEventModel.event_date >= events_from)
        if applied_from is not None:
            stmt = stmt.where(ApplicationModel.application_date >= applied_from)
        if applied_to is not None:
            stmt = stmt.where(ApplicationModel.application_date <= applied_to)
        return await self._count_distinct_apps(stmt)

    async def _count_interview_events(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        cycle_id: int | None,
    ) -> int:
        """``interview`` events dated in the window, every type: one per
        interview held, not distinct applications."""
        total = await self.session.scalar(
            select(func.count()).select_from(
                self
                ._events_in_scope(user_id, cycle_id)
                .where(
                    TimelineEventModel.event_type == EventType.INTERVIEW,
                    TimelineEventModel.event_date >= start_date,
                    TimelineEventModel.event_date <= end_date,
                )
                .subquery()
            )
        )
        return int(total or 0)

    async def _count_active_processes(
        self, user_id: int, end_date: date, cycle_id: int | None
    ) -> int:
        """Open applications (``finalized_at`` NULL) that had their initial
        screening by ``end_date``: the rule the steps version applied
        (Initial Screen step, no feedback), on the timeline."""
        stmt = self._events_in_scope(user_id, cycle_id).where(
            ApplicationModel.finalized_at.is_(None),
            ApplicationModel.application_date <= end_date,
            TimelineEventModel.event_type == EventType.INTERVIEW,
            TimelineEventModel.interview_type
            == InterviewType.INITIAL_SCREENING,
            TimelineEventModel.event_date <= end_date,
        )
        return await self._count_distinct_apps(stmt)

    async def calculate_fortnight_metrics(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        cycle_id: int | None = None,
    ) -> dict[str, Any]:
        return {
            'applications_count': await self._count_applications(
                user_id, start_date, end_date, cycle_id
            ),
            'initial_screenings_count': await self._count_initial_screenings(
                user_id, cycle_id, start_date, end_date
            ),
            'interviews_completed_fortnight': (
                await self._count_interview_events(
                    user_id, start_date, end_date, cycle_id
                )
            ),
            'active_processes_count': await self._count_active_processes(
                user_id, end_date, cycle_id
            ),
            'offers_count': await self._count_offers(
                user_id, cycle_id, start_date, end_date
            ),
        }

    async def calculate_accumulated_metrics(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        cycle_id: int | None = None,
    ) -> dict[str, Any]:
        total_applications_count = await self._count_applications(
            user_id, start_date, end_date, cycle_id
        )
        total_initial_screenings_count = await self._count_initial_screenings(
            user_id,
            cycle_id,
            None,
            end_date,
            applied_from=start_date,
            applied_to=end_date,
        )
        total_offers_count = await self._count_offers(
            user_id,
            cycle_id,
            None,
            end_date,
            applied_from=start_date,
            applied_to=end_date,
        )

        callback_rate = (
            total_initial_screenings_count / total_applications_count * 100
            if total_applications_count > 0
            else 0.00
        )

        offer_rate = (
            total_offers_count / total_initial_screenings_count * 100
            if total_initial_screenings_count > 0
            else 0.00
        )

        return {
            'total_applications_count': total_applications_count,
            'callback_rate': round(callback_rate, 2),
            'offer_rate': round(offer_rate, 2),
            'overall_conversion_rate': round(callback_rate, 2),
            'total_initial_screenings_count': total_initial_screenings_count,
        }
