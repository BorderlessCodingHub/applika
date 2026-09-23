"""Timeline-event DTOs (application layer, R-001..R-006).

Ported from mynextjob. ``CreateTimelineEventDTO`` carries ``user_id`` and
``application_id`` stamped from the acting user and the route, never from the
body. ``UpdateTimelineEventDTO`` is a **full** representation (a PUT, not a
patch): the offer-salary and interview-type invariants are cross-field on
``event_type``, so every write carries the whole event. ``TimelineEventDTO``
is the read model the use cases return.

Applika adds ``interview_type`` (R-002) and ``denied_reason`` (KODI-014,
R-033..R-036, same pattern). The DTOs do not validate the cross-field rules
themselves: ``normalize_event`` in ``use_cases/timeline_events/rules.py``
does, so the web routes, the ``/steps`` compat routes and the legacy
finalize all go through one rule set.
"""

from datetime import date, time
from decimal import Decimal

from pydantic import BaseModel

from app.application.dto import BaseSchema
from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)


class TimelineEventWriteDTO(BaseModel):
    """The mutable fields of an event, shared by create and update."""

    event_type: EventType
    interview_type: InterviewType | None = None
    denied_reason: DeniedReason | None = None
    event_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    salary_amount: Decimal | None = None
    salary_currency: Currency | None = None
    salary_period: SalaryPeriod | None = None


class CreateTimelineEventDTO(TimelineEventWriteDTO):
    """Create input; ``user_id``/``application_id`` are server-stamped."""

    user_id: int
    application_id: int


class UpdateTimelineEventDTO(TimelineEventWriteDTO):
    """Full-replacement update. ``user_id`` and ``application_id`` are
    scoping keys and cannot be edited."""


class TimelineEventDTO(BaseSchema):
    """Read model for a timeline event."""

    application_id: int
    user_id: int
    event_type: EventType
    interview_type: InterviewType | None = None
    denied_reason: DeniedReason | None = None
    event_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    salary_amount: Decimal | None = None
    salary_currency: Currency | None = None
    salary_period: SalaryPeriod | None = None
