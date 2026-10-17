"""Timeline-event repository (R-001..R-006).

The constructor takes an ``AsyncSession`` and the repository owns its
commit/rollback. Methods return ORM models, never DTOs. Every single-event read is scoped to the owning user
and the parent application (ADR 0004): an event of another user, or of
another application, is invisible here and surfaces as a 404 in the use case.

Two additions:

* the partial unique index ``uq_timeline_events_one_initial_screening``
  (R-030) turns a race past the use case's pre-check into a
  ``ResourceConflict`` (409) instead of a 500;
* the batched ``latest_*_for_applications`` reads feed the legacy
  ``Application`` fields installed CLIs read (R-019) without an N+1.
"""

from collections.abc import Sequence
from datetime import date, timedelta
from typing import Any

from sqlalchemy import ColumnElement, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.enums import EventType, InterviewType
from app.core.exceptions import ResourceConflict
from app.domain.models import ApplicationModel, TimelineEventModel
from app.domain.repositories.application_filters import NOT_DRAFT

ONE_INITIAL_SCREENING_INDEX = 'uq_timeline_events_one_initial_screening'
ONE_INITIAL_SCREENING_MESSAGE = (
    'This application already has an initial screening interview; '
    'an application can have only one'
)


def timeline_order() -> tuple[ColumnElement[Any], ...]:
    """Chronological order: ``event_date, start_time NULLS FIRST,
    created_at`` (plan 0008 Contract), ``id`` as the last tie-break."""
    return (
        TimelineEventModel.event_date.asc(),
        TimelineEventModel.start_time.asc().nullsfirst(),
        TimelineEventModel.created_at.asc(),
        TimelineEventModel.id.asc(),
    )


def latest_first_order() -> tuple[ColumnElement[Any], ...]:
    """The exact reverse of :func:`timeline_order`: the latest event first."""
    return (
        TimelineEventModel.event_date.desc(),
        TimelineEventModel.start_time.desc().nullslast(),
        TimelineEventModel.created_at.desc(),
        TimelineEventModel.id.desc(),
    )


def _as_conflict(error: IntegrityError) -> ResourceConflict | None:
    if ONE_INITIAL_SCREENING_INDEX in str(error):
        return ResourceConflict(ONE_INITIAL_SCREENING_MESSAGE)
    return None


class TimelineEventRepository:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_by_application(
        self, application_id: int
    ) -> list[TimelineEventModel]:
        """An application's events in timeline order.

        Ownership is verified against the parent application by the use case
        before this runs.
        """
        result = await self.session.scalars(
            select(TimelineEventModel)
            .where(TimelineEventModel.application_id == application_id)
            .order_by(*timeline_order())
        )
        return list(result.all())

    async def get_by_id_and_user_id(
        self, id: int, application_id: int, user_id: int
    ) -> TimelineEventModel | None:
        """One event, scoped to its application and its owner.

        ``None`` when the id does not exist, belongs to another application
        or to another user: the caller maps all three to the same 404.
        """
        return await self.session.scalar(
            select(TimelineEventModel).where(
                TimelineEventModel.id == id,
                TimelineEventModel.application_id == application_id,
                TimelineEventModel.user_id == user_id,
            )
        )

    async def has_initial_screening(
        self, application_id: int, exclude_id: int | None = None
    ) -> bool:
        """Whether the application already has its one initial screening
        (R-030), ignoring ``exclude_id`` (the event being replaced)."""
        stmt = select(TimelineEventModel.id).where(
            TimelineEventModel.application_id == application_id,
            TimelineEventModel.interview_type
            == InterviewType.INITIAL_SCREENING,
        )
        if exclude_id is not None:
            stmt = stmt.where(TimelineEventModel.id != exclude_id)
        return await self.session.scalar(stmt.limit(1)) is not None

    async def create(self, values: dict[str, Any]) -> TimelineEventModel:
        """Persist a new event. Owns the transaction."""
        event = TimelineEventModel(**values)
        self.session.add(event)
        try:
            await self.session.commit()
            await self.session.refresh(event)
        except IntegrityError as error:
            await self.session.rollback()
            conflict = _as_conflict(error)
            if conflict is not None:
                raise conflict from error
            raise
        except Exception:
            await self.session.rollback()
            raise
        return event

    async def update(
        self, event: TimelineEventModel, changes: dict[str, Any]
    ) -> TimelineEventModel:
        """Full replacement: every key of ``changes`` is assigned."""
        try:
            for key, value in changes.items():
                setattr(event, key, value)
            await self.session.commit()
            await self.session.refresh(event)
        except IntegrityError as error:
            await self.session.rollback()
            conflict = _as_conflict(error)
            if conflict is not None:
                raise conflict from error
            raise
        except Exception:
            await self.session.rollback()
            raise
        return event

    async def delete(self, event: TimelineEventModel) -> None:
        """Delete an owned event. Owns the transaction."""
        try:
            await self.session.delete(event)
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise

    async def latest_for_application(
        self, application_id: int
    ) -> TimelineEventModel | None:
        """The last event of the timeline, or ``None``."""
        latest = await self.latest_for_applications([application_id])
        return latest.get(application_id)

    async def latest_offer_for_application(
        self, application_id: int
    ) -> TimelineEventModel | None:
        """The last offer event of the timeline, or ``None``."""
        latest = await self.latest_offer_for_applications([application_id])
        return latest.get(application_id)

    async def latest_for_applications(
        self, application_ids: Sequence[int]
    ) -> dict[int, TimelineEventModel]:
        """``application_id -> latest event`` in one query (DISTINCT ON)."""
        return await self._latest(application_ids, event_type=None)

    async def latest_offer_for_applications(
        self, application_ids: Sequence[int]
    ) -> dict[int, TimelineEventModel]:
        """``application_id -> latest offer event`` in one query."""
        return await self._latest(application_ids, event_type=EventType.OFFER)

    async def _latest(
        self, application_ids: Sequence[int], event_type: EventType | None
    ) -> dict[int, TimelineEventModel]:
        if not application_ids:
            return {}
        stmt = (
            select(TimelineEventModel)
            .where(TimelineEventModel.application_id.in_(application_ids))
            .distinct(TimelineEventModel.application_id)
            .order_by(TimelineEventModel.application_id, *latest_first_order())
        )
        if event_type is not None:
            stmt = stmt.where(TimelineEventModel.event_type == event_type)
        result = await self.session.scalars(stmt)
        return {event.application_id: event for event in result.all()}

    async def list_agenda(
        self,
        user_id: int,
        from_date: date | None = None,
        to_date: date | None = None,
    ) -> list[TimelineEventModel]:
        """The user's **interview** events dated inside the agenda window,
        application loaded. The window and the order are the ones the steps
        agenda used: 30 days either side of today by default, ``event_date``
        then ``start_time`` (unscheduled last on a day). KODI-016
        (R-038/R-039): only ``interview`` events carry a schedule any more,
        so an agenda of anything else would be a list of unscheduled
        entries - narrowed to interview events only. A draft has no
        timeline (KODI-032) and its application is excluded here too, so a
        pre-existing event could never surface for one anyway - this join
        is belt and suspenders should that ever change."""
        today = date.today()
        start = from_date or (today - timedelta(days=30))
        end = to_date or (today + timedelta(days=30))
        result = await self.session.scalars(
            select(TimelineEventModel)
            .join(
                ApplicationModel,
                ApplicationModel.id == TimelineEventModel.application_id,
            )
            .where(
                TimelineEventModel.user_id == user_id,
                TimelineEventModel.event_type == EventType.INTERVIEW,
                TimelineEventModel.event_date >= start,
                TimelineEventModel.event_date <= end,
                NOT_DRAFT,
            )
            .order_by(
                TimelineEventModel.event_date.asc(),
                TimelineEventModel.start_time.asc().nullslast(),
                TimelineEventModel.created_at.asc(),
            )
            .options(joinedload(TimelineEventModel.application))
        )
        return list(result.unique().all())
