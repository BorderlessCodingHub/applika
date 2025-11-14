from datetime import date, timedelta
from decimal import Decimal
from typing import List, Literal, TypedDict

import sqlalchemy as sa
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    PlatformModel,
    StepDefinitionModel,
)


class ApplicationStepCount(TypedDict):
    step_id: int
    step_name: str
    step_color: str
    step_strict: bool
    count: int


class ApplicationsPerPlatform(TypedDict):
    platform_id: int
    platform_name: str
    count: int


class ApplicationsPerMode(TypedDict):
    mode: Literal['active', 'passive']
    count: int


class DailyApplicationsLastMonth(TypedDict):
    application_date: date
    count: int


class AverageDaysPerStep(TypedDict):
    step_id: int
    step_name: str
    step_color: str
    step_strict: bool
    avg_days: Decimal


class UserStatsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_applications_count(self, user_id: int) -> int | None:
        return await self.session.scalar(
            select(func.count(ApplicationModel.id).label('total'))
            .where(ApplicationModel.user_id == user_id)
        )

    async def count_applications_per_strict_step(
        self, user_id: int
    ) -> List[ApplicationStepCount]:
        stmt = (
            select(
                StepDefinitionModel.id.label('step_id'),
                StepDefinitionModel.name.label('step_name'),
                StepDefinitionModel.strict.label('step_strict'),
                StepDefinitionModel.color.label('step_color'),
                func.coalesce(
                    func.count(ApplicationStepModel.application_id), 0
                ).label("count"),
            )
            .outerjoin(
                ApplicationStepModel,
                (StepDefinitionModel.id == ApplicationStepModel.step_id) &
                (ApplicationStepModel.user_id == user_id),
            )
            .where(
                StepDefinitionModel.strict.is_(True)
            )
            .group_by(
                StepDefinitionModel.id,
                StepDefinitionModel.name,
                StepDefinitionModel.color,
                StepDefinitionModel.strict,
            )
            .order_by(StepDefinitionModel.id)
        )

        result = await self.session.execute(stmt)
        return result.mappings().all()

    async def count_applications_per_step(
        self, user_id: int
    ) -> List[ApplicationStepCount]:
        stmt = (
            select(
                StepDefinitionModel.id.label('step_id'),
                StepDefinitionModel.name.label('step_name'),
                StepDefinitionModel.strict.label('step_strict'),
                StepDefinitionModel.color.label('step_color'),
                func.coalesce(
                    func.count(ApplicationStepModel.application_id), 0
                ).label("count"),
            )
            .outerjoin(
                ApplicationStepModel,
                (StepDefinitionModel.id == ApplicationStepModel.step_id) &
                (ApplicationStepModel.user_id == user_id),
            )
            .group_by(
                StepDefinitionModel.id,
                StepDefinitionModel.name,
                StepDefinitionModel.color,
                StepDefinitionModel.strict,
            )
            .order_by(StepDefinitionModel.id)
        )

        result = await self.session.execute(stmt)
        return result.mappings().all()

    async def count_applications_grouped_by_platform(
        self, user_id: int
    ) -> List[ApplicationsPerPlatform]:
        stmt = (
            select(
                PlatformModel.id.label('platform_id'),
                PlatformModel.name.label('platform_name'),
                func.count(ApplicationModel.id).label('count'),
            )
            .select_from(PlatformModel)
            .outerjoin(
                ApplicationModel,
                sa.and_(
                    ApplicationModel.platform_id == PlatformModel.id,
                    ApplicationModel.user_id == user_id,
                ),
            )
            .group_by(PlatformModel.name, PlatformModel.id)
            .having(func.count(ApplicationModel.id) > 0)
            .order_by(sa.desc('count'))
        )

        result = await self.session.execute(stmt)
        return result.mappings().all()

    async def count_applications_grouped_by_mode(
        self, user_id: int
    ) -> List[ApplicationsPerMode]:
        stmt = (
            select(
                ApplicationModel.mode,
                func.count().label('count'),
            )
            .where(ApplicationModel.user_id == user_id)
            .group_by(ApplicationModel.mode)
        )

        result = await self.session.execute(stmt)
        return result.mappings().all()

    async def count_applications_per_day_last_month(
        self, user_id: int
    ) -> List[DailyApplicationsLastMonth]:
        one_month_ago = date.today() - timedelta(days=30)
        stmt = (
            select(
                ApplicationModel.application_date,
                func.count().label('count'),
            )
            .where(
                ApplicationModel.application_date >= one_month_ago,
                ApplicationModel.user_id == user_id,
            )
            .group_by(ApplicationModel.application_date)
            .order_by(ApplicationModel.application_date)
        )

        result = await self.session.execute(stmt)
        return result.mappings().all()

    async def average_days_per_step(
        self, user_id: int
    ) -> List[AverageDaysPerStep]:
        subq = (
            select(
                ApplicationStepModel.step_id.label('step_id'),
                func.avg(
                    ApplicationStepModel.step_date -
                    ApplicationModel.application_date
                ).label('avg_days'),
            )
            .outerjoin(
                ApplicationModel,
                ApplicationModel.id == ApplicationStepModel.application_id,
            )
            .where(
                ApplicationModel.user_id == user_id,
            )
            .group_by(ApplicationStepModel.step_id)
            .subquery('savg')
        )

        stmt = (
            select(
                StepDefinitionModel.id.label('step_id'),
                StepDefinitionModel.name.label('step_name'),
                StepDefinitionModel.strict.label('step_strict'),
                StepDefinitionModel.color.label('step_color'),
                func.coalesce(subq.c.avg_days, 0).label('avg_days'),
            )
            .outerjoin(subq, StepDefinitionModel.id == subq.c.step_id)
            .order_by(StepDefinitionModel.id)
        )

        result = await self.session.execute(stmt)
        return result.mappings().all()
