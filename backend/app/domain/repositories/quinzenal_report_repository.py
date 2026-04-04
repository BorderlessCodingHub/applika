from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ResourceConflict
from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    QuinzenalReportModel,
    StepDefinitionModel,
)

INITIAL_SCREEN_STEP_NAME = 'Initial Screen'
OFFER_STEP_NAME = 'Offer'
INTERVIEW_FUNNEL_STEP_NAMES = (
    INITIAL_SCREEN_STEP_NAME,
    'Phase 2',
    'Phase 3',
    'Phase 4',
)
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
    if cycle_id is not None:
        return ApplicationModel.cycle_id == cycle_id
    return ApplicationModel.cycle_id.is_(None)


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
        self, user_id: int, report_day: int,
        cycle_id: int | None = None
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
                raise ResourceConflict('Report already submitted') from error

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

    async def calculate_fortnight_metrics(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        cycle_id: int | None = None,
    ) -> dict[str, Any]:
        applications_count = await self.session.scalar(
            select(func.count())
            .select_from(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.application_date >= start_date,
                ApplicationModel.application_date <= end_date,
                _app_cycle_filter(cycle_id),
            )
        )
        applications_count = int(applications_count or 0)

        initial_screenings_count = await self.session.scalar(
            select(func.count(func.distinct(ApplicationStepModel.application_id)))
            .select_from(ApplicationStepModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .join(
                StepDefinitionModel,
                StepDefinitionModel.id == ApplicationStepModel.step_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationStepModel.step_date >= start_date,
                ApplicationStepModel.step_date <= end_date,
                StepDefinitionModel.name == INITIAL_SCREEN_STEP_NAME,
            )
        )
        initial_screenings_count = int(initial_screenings_count or 0)

        interviews_completed_fortnight = await self.session.scalar(
            select(func.count(func.distinct(ApplicationStepModel.application_id)))
            .select_from(ApplicationStepModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .join(
                StepDefinitionModel,
                StepDefinitionModel.id == ApplicationStepModel.step_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationStepModel.step_date >= start_date,
                ApplicationStepModel.step_date <= end_date,
                StepDefinitionModel.name.in_(INTERVIEW_FUNNEL_STEP_NAMES),
            )
        )
        interviews_completed_fortnight = int(interviews_completed_fortnight or 0)

        offers_count = await self.session.scalar(
            select(func.count(func.distinct(ApplicationStepModel.application_id)))
            .select_from(ApplicationStepModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .join(
                StepDefinitionModel,
                StepDefinitionModel.id == ApplicationStepModel.step_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationStepModel.step_date >= start_date,
                ApplicationStepModel.step_date <= end_date,
                StepDefinitionModel.name == OFFER_STEP_NAME,
            )
        )
        offers_count = int(offers_count or 0)

        active_processes_count = await self.session.scalar(
            select(func.count(func.distinct(ApplicationStepModel.application_id)))
            .select_from(ApplicationStepModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .join(
                StepDefinitionModel,
                StepDefinitionModel.id == ApplicationStepModel.step_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationModel.feedback_id.is_(None),
                ApplicationModel.application_date <= end_date,
                ApplicationStepModel.step_date <= end_date,
                StepDefinitionModel.name == INITIAL_SCREEN_STEP_NAME,
            )
        )
        active_processes_count = int(active_processes_count or 0)

        return {
            'applications_count': applications_count,
            'initial_screenings_count': initial_screenings_count,
            'interviews_completed_fortnight': interviews_completed_fortnight,
            'active_processes_count': active_processes_count,
            'offers_count': offers_count,
        }

    async def calculate_accumulated_metrics(
        self,
        user_id: int,
        start_date: date,
        end_date: date,
        cycle_id: int | None = None,
    ) -> dict[str, Any]:
        total_applications_count = await self.session.scalar(
            select(func.count())
            .select_from(ApplicationModel)
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationModel.application_date >= start_date,
                ApplicationModel.application_date <= end_date,
            )
        )
        total_applications_count = int(total_applications_count or 0)

        total_initial_screenings_count = await self.session.scalar(
            select(func.count(func.distinct(ApplicationStepModel.application_id)))
            .select_from(ApplicationStepModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .join(
                StepDefinitionModel,
                StepDefinitionModel.id == ApplicationStepModel.step_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationModel.application_date >= start_date,
                ApplicationModel.application_date <= end_date,
                ApplicationStepModel.step_date <= end_date,
                StepDefinitionModel.name == INITIAL_SCREEN_STEP_NAME,
            )
        )
        total_initial_screenings_count = int(
            total_initial_screenings_count or 0
        )

        total_offers_count = await self.session.scalar(
            select(func.count(func.distinct(ApplicationStepModel.application_id)))
            .select_from(ApplicationStepModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .join(
                StepDefinitionModel,
                StepDefinitionModel.id == ApplicationStepModel.step_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
                _app_cycle_filter(cycle_id),
                ApplicationModel.application_date >= start_date,
                ApplicationModel.application_date <= end_date,
                ApplicationStepModel.step_date <= end_date,
                StepDefinitionModel.name == OFFER_STEP_NAME,
            )
        )
        total_offers_count = int(total_offers_count or 0)

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
