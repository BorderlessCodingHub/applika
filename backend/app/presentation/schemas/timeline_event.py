"""Timeline-event request/response schemas (R-001..R-006).

Ported whole from mynextjob's ``schemas/timeline_event.py``. The write body
is validated in cross-field passes (``model_validator``, mode ``after``) so
every violation is a 422 before any I/O:

* **Scheduling**: ``start_time`` and ``end_time`` come together and the end
  is strictly after the start.
* **Offer salary**: on an ``offer`` the three salary fields are all
  required; on every other type they must be absent. The offer period is
  ``monthly`` or ``annually`` (``hourly`` is refused for an offer; the
  shared ``salaryperiod`` enum keeps it for the application's expected
  salary). ``annual`` from an installed CLI is accepted as ``annually``.
* **Interview type** (applika, R-002/R-003): only on an ``interview``, where
  it defaults to ``unknown``; on any other type it is refused.
* **Denied reason** (KODI-014, R-033..R-036, the same pattern): only on a
  ``denied`` event, where it defaults to ``unknown``; on any other type it
  is refused.
* **Schedule** (KODI-016, R-038/R-039, the same pattern): ``start_time``,
  ``end_time`` and ``timezone`` are only allowed on an ``interview`` event;
  a non-null value on any other type is refused (422). Explicit nulls or
  absent keys are always fine. ``TimelineEventOut`` omits the three keys
  entirely (not just nulls them) when ``event_type`` is not ``interview``.

Create and update carry the **full** event (a PUT replaces, it does not
patch) because every rule is cross-field on ``event_type``. The same rules
run again in the use case (``timeline_events/rules.py``) and in the database
CHECKs. Snowflake ids are strings on the wire (ADR 0003) and
``salary_amount`` is a fixed 2-decimal string.
"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from pydantic import Field, field_serializer, model_serializer, model_validator
from pydantic.functional_serializers import SerializerFunctionWrapHandler

from app.application.use_cases.timeline_events.rules import (
    DENIED_REASON_ONLY_ON_DENIED,
    OFFER_PERIOD_INVALID,
    OFFER_PERIODS,
    SCHEDULE_ONLY_ON_INTERVIEW,
)
from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
from app.lib.types import SnowflakeID
from app.presentation.schemas import BaseSchema

MAX_TIMEZONE = 100
MAX_OBSERVATION = 5000


class _TimelineEventWrite(BaseSchema):
    """The full write body of a timeline event (create and replace)."""

    event_type: EventType
    interview_type: InterviewType | None = None
    denied_reason: DeniedReason | None = None
    event_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = Field(default=None, max_length=MAX_TIMEZONE)
    observation: str | None = Field(default=None, max_length=MAX_OBSERVATION)
    salary_period: SalaryPeriod | None = None
    salary_amount: Decimal | None = Field(
        default=None, ge=0, max_digits=12, decimal_places=2
    )
    salary_currency: Currency | None = None

    @model_validator(mode='after')
    def _validate_schedule(self) -> '_TimelineEventWrite':
        if (self.start_time is None) != (self.end_time is None):
            raise ValueError(
                'start_time and end_time must be provided together'
            )
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.end_time <= self.start_time
        ):
            raise ValueError('end_time must be after start_time')
        return self

    @model_validator(mode='after')
    def _validate_offer_fields(self) -> '_TimelineEventWrite':
        salary_fields = (
            self.salary_period,
            self.salary_amount,
            self.salary_currency,
        )
        if self.event_type is EventType.OFFER:
            if any(field is None for field in salary_fields):
                raise ValueError(
                    'offer events require salary_period, salary_amount and '
                    'salary_currency'
                )
            if self.salary_period not in OFFER_PERIODS:
                raise ValueError(OFFER_PERIOD_INVALID)
        elif any(field is not None for field in salary_fields):
            raise ValueError(
                'salary_period, salary_amount and salary_currency are only '
                'allowed on offer events'
            )
        return self

    @model_validator(mode='after')
    def _validate_interview_type(self) -> '_TimelineEventWrite':
        if self.event_type is EventType.INTERVIEW:
            if self.interview_type is None:
                self.interview_type = InterviewType.UNKNOWN
        elif self.interview_type is not None:
            raise ValueError(
                'interview_type is only allowed on interview events'
            )
        return self

    @model_validator(mode='after')
    def _validate_denied_reason(self) -> '_TimelineEventWrite':
        if self.event_type is EventType.DENIED:
            if self.denied_reason is None:
                self.denied_reason = DeniedReason.UNKNOWN
        elif self.denied_reason is not None:
            raise ValueError(DENIED_REASON_ONLY_ON_DENIED)
        return self

    @model_validator(mode='after')
    def _validate_schedule_event_type(self) -> '_TimelineEventWrite':
        """KODI-016 (R-038/R-039): the schedule is only allowed on an
        interview event, same pattern as interview_type/denied_reason.
        Explicit nulls or absent keys are always fine."""
        if self.event_type is not EventType.INTERVIEW and (
            self.start_time is not None
            or self.end_time is not None
            or self.timezone is not None
        ):
            raise ValueError(SCHEDULE_ONLY_ON_INTERVIEW)
        return self


class TimelineEventCreate(_TimelineEventWrite):
    """Create body. ``user_id`` and ``application_id`` are server-stamped
    from the acting user and the route."""


class TimelineEventUpdate(_TimelineEventWrite):
    """Replace body: the full event."""


class TimelineEventOut(BaseSchema):
    id: SnowflakeID
    application_id: SnowflakeID
    user_id: SnowflakeID
    event_type: EventType
    interview_type: InterviewType | None = None
    denied_reason: DeniedReason | None = None
    event_date: date
    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = None
    observation: str | None = None
    salary_period: SalaryPeriod | None = None
    salary_amount: Decimal | None = None
    salary_currency: Currency | None = None
    created_at: datetime
    updated_at: datetime | None = None

    @field_serializer('salary_amount')
    def _serialize_salary(self, value: Decimal | None) -> str | None:
        # NUMERIC(12, 2) as a fixed 2-decimal string, never a float.
        if value is None:
            return None
        return f'{Decimal(value):.2f}'

    @model_serializer(mode='wrap')
    def _omit_schedule_on_non_interview(
        self, handler: SerializerFunctionWrapHandler
    ) -> dict[str, Any]:
        """KODI-016 (R-038/R-039). Owner: "the api must omit the extra
        attributed to non intervierw type". A non-interview event drops
        ``start_time``, ``end_time`` and ``timezone`` from the response
        body entirely - not just nulled, absent - everywhere this schema is
        serialized (GET list, POST, PUT). ``interview_type``, salary and
        ``denied_reason`` are unaffected (PRD 0008 non-goal): they stay
        null, as before."""
        data = handler(self)
        if self.event_type is not EventType.INTERVIEW:
            for key in ('start_time', 'end_time', 'timezone'):
                data.pop(key, None)
        return data

    @classmethod
    def __get_pydantic_json_schema__(
        cls, core_schema_: Any, handler: Any
    ) -> dict[str, Any]:
        # A ``@model_serializer`` makes Pydantic emit an opaque
        # ``{"type": "object", "additionalProperties": true}`` for the
        # *serialization*-mode schema (the one FastAPI uses for
        # ``response_model``) - losing every field's type and the
        # ``required`` list the pinned contract cares about, because it can
        # no longer statically infer the wrap serializer's output shape.
        # The inner ``model-fields`` core schema (``core_schema_['schema']``)
        # is unaffected by the serializer wrapper, so building the JSON
        # schema from *that* instead restores the normal, field-derived
        # schema in both modes. The wrap serializer only ever *removes* the
        # three optional keys at the response-body level - it never changes
        # a type or adds a field - so the static schema stays accurate; it
        # just cannot express the interview-only omission itself, which
        # OpenAPI has no way to do on a flat object schema anyway (the
        # pinned contract only requires the three not be `required`, which
        # they already are not - they carry defaults).
        return handler(core_schema_['schema'])
