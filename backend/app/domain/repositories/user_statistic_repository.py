"""User statistics, read-only aggregates (R-021, R-022).

Every statement filters on ``user_id`` (ADR 0004). ``cycle_id`` selects the
scope the applications board uses: ``None`` is the current board
(``cycle_id IS NULL``), an id is that archived cycle.

The pipeline aggregates were keyed on the step catalog; since the timeline
they are keyed on a *stage*, the pair ``(event_type, interview_type)``:
per-``event_type`` aggregates plus an
``interview_type`` split (owner: "with this type we can migrate current steps
definitions and still have the statistics per steps").
"""

from datetime import date, timedelta
from decimal import Decimal
from typing import Literal, TypedDict

import sqlalchemy as sa
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType, InterviewType
from app.domain.models import (
    ApplicationModel,
    PlatformModel,
    TimelineEventModel,
)
from app.domain.repositories.application_filters import NOT_DRAFT

Stage = tuple[EventType, InterviewType | None]
"""A statistics stage: an event type, and the interview type on interviews."""


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


def _cycle_filter(cycle_id: int | None) -> ColumnElement[bool]:
    """Scope + draft exclusion (KODI-032, R-012 in this ticket): a draft
    never counts toward statistics, whatever the cycle scope."""
    if cycle_id is not None:
        return sa.and_(ApplicationModel.cycle_id == cycle_id, NOT_DRAFT)
    return sa.and_(ApplicationModel.cycle_id.is_(None), NOT_DRAFT)


class UserStatsRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_applications_count(
        self, user_id: int, cycle_id: int | None = None
    ) -> int:
        total = await self.session.scalar(
            select(func.count(ApplicationModel.id).label('total')).where(
                ApplicationModel.user_id == user_id,
                _cycle_filter(cycle_id),
            )
        )
        return int(total or 0)

    async def get_active_applications_count(
        self, user_id: int, cycle_id: int | None = None
    ) -> int:
        """Applications in scope whose ``finalized_at`` is NULL (AC23,
        KODI-013): the same scope/cycle filter as :meth:`get_applications_count`,
        plus the open-application condition."""
        total = await self.session.scalar(
            select(func.count(ApplicationModel.id).label('total')).where(
                ApplicationModel.user_id == user_id,
                ApplicationModel.finalized_at.is_(None),
                _cycle_filter(cycle_id),
            )
        )
        return int(total or 0)

    async def count_applications_per_stage(
        self, user_id: int, cycle_id: int | None = None
    ) -> dict[Stage, int]:
        """``stage -> number of DISTINCT in-scope applications`` carrying at
        least one event of that stage (an application counts once per stage
        however many such events it has)."""
        stmt = (
            select(
                TimelineEventModel.event_type,
                TimelineEventModel.interview_type,
                func.count(func.distinct(TimelineEventModel.application_id)),
            )
            .join(
                ApplicationModel,
                ApplicationModel.id == TimelineEventModel.application_id,
            )
            .where(
                TimelineEventModel.user_id == user_id,
                ApplicationModel.user_id == user_id,
                _cycle_filter(cycle_id),
            )
            .group_by(
                TimelineEventModel.event_type,
                TimelineEventModel.interview_type,
            )
        )
        result = await self.session.execute(stmt)
        return {
            (event_type, interview_type): int(count)
            for event_type, interview_type, count in result.tuples().all()
        }

    async def average_days_per_stage(
        self, user_id: int, cycle_id: int | None = None
    ) -> dict[Stage, Decimal]:
        """``stage -> average days`` between an application's
        ``application_date`` and its events of that stage, over every
        in-scope event (Postgres ``date - date`` is whole days)."""
        stmt = (
            select(
                TimelineEventModel.event_type,
                TimelineEventModel.interview_type,
                func.avg(
                    TimelineEventModel.event_date
                    - ApplicationModel.application_date
                ),
            )
            .join(
                ApplicationModel,
                ApplicationModel.id == TimelineEventModel.application_id,
            )
            .where(
                TimelineEventModel.user_id == user_id,
                ApplicationModel.user_id == user_id,
                _cycle_filter(cycle_id),
            )
            .group_by(
                TimelineEventModel.event_type,
                TimelineEventModel.interview_type,
            )
        )
        result = await self.session.execute(stmt)
        return {
            (event_type, interview_type): Decimal(avg or 0)
            for event_type, interview_type, avg in result.tuples().all()
        }

    async def count_applications_grouped_by_platform(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[ApplicationsPerPlatform]:
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
                    _cycle_filter(cycle_id),
                ),
            )
            .group_by(PlatformModel.name, PlatformModel.id)
            .having(func.count(ApplicationModel.id) > 0)
            .order_by(sa.desc('count'))
        )

        result = await self.session.execute(stmt)
        return [
            ApplicationsPerPlatform(
                platform_id=platform_id, platform_name=name, count=count
            )
            for platform_id, name, count in result.tuples().all()
        ]

    async def count_applications_grouped_by_mode(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[ApplicationsPerMode]:
        stmt = (
            select(
                ApplicationModel.mode,
                func.count().label('count'),
            )
            .where(
                ApplicationModel.user_id == user_id,
                _cycle_filter(cycle_id),
            )
            .group_by(ApplicationModel.mode)
        )

        result = await self.session.execute(stmt)
        return [
            ApplicationsPerMode(mode=mode, count=count)
            for mode, count in result.tuples().all()
        ]

    async def count_applications_per_day_last_month(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[DailyApplicationsLastMonth]:
        one_month_ago = date.today() - timedelta(days=30)
        stmt = (
            select(
                ApplicationModel.application_date,
                func.count().label('count'),
            )
            .where(
                ApplicationModel.application_date >= one_month_ago,
                ApplicationModel.user_id == user_id,
                _cycle_filter(cycle_id),
            )
            .group_by(ApplicationModel.application_date)
            .order_by(ApplicationModel.application_date)
        )

        result = await self.session.execute(stmt)
        return [
            DailyApplicationsLastMonth(application_date=day, count=count)
            for day, count in result.tuples().all()
        ]
