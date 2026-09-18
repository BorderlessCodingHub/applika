"""The event rules every timeline write goes through (R-002..R-005, R-030).

The web routes validate the same rules in their request schema (so a bad
body is a 422 before any I/O); the rules live here as well so the ``/steps``
compat routes and the legacy finalize, which build events themselves, cannot
write an event the web could not. The database CHECKs
``ck_timeline_events_interview_type`` and ``ck_timeline_events_offer_salary``
are the last line.
"""

from app.application.dto.timeline_event import TimelineEventWriteDTO
from app.core.enums import EventType, InterviewType, SalaryPeriod
from app.core.exceptions import BusinessRuleViolation, ResourceConflict
from app.domain.repositories.timeline_event_repository import (
    ONE_INITIAL_SCREENING_MESSAGE,
    TimelineEventRepository,
)

INTERVIEW_TYPE_ONLY_ON_INTERVIEW = (
    'interview_type is only allowed on interview events'
)
OFFER_NEEDS_SALARY = (
    'offer events require salary_amount, salary_currency and salary_period'
)
SALARY_ONLY_ON_OFFER = (
    'salary_amount, salary_currency and salary_period are only allowed on '
    'offer events'
)
TIMES_TOGETHER = 'start_time and end_time must be provided together'
END_AFTER_START = 'end_time must be after start_time'

# The offer salary_period invariant (R-005/R-031): an offer accepts only
# monthly or annually (``annual`` from an installed CLI maps to annually
# before this runs). This is the single source both the timeline write
# schema (``presentation/schemas/timeline_event.py``) and the new R-032
# outcome-finalize body (``presentation/schemas/application.py:
# FinalizeWithOutcome``, ``FinalizeApplicationWithOutcomeUseCase``) read,
# so the same offer is never valid through one route and refused through
# the other. It is deliberately **not** folded into ``normalize_event``:
# the legacy 0.1.4 finalize body (``compat/legacy_finalize.py``) fills an
# offer's period from ``application.salary_period``, and that application
# can itself be hourly - a pinned compat behaviour this fix must not touch.
OFFER_PERIODS = frozenset({SalaryPeriod.MONTHLY, SalaryPeriod.ANNUALLY})
OFFER_PERIOD_INVALID = 'offer salary_period must be monthly or annually'


def normalize_event[T: TimelineEventWriteDTO](data: T) -> T:
    """Check an event's cross-field rules and fill the interview default.

    * An interview without a type is ``unknown`` (R-002).
    * An interview type on any other event is refused (R-003).
    * An offer needs amount, currency and period; every other type refuses
      all three (R-005). Changing an offer to another type therefore has to
      drop the salary in the same request.
    * ``start_time`` and ``end_time`` come together, the end after the start
      (R-004). There is no rule on the date against the application date or
      the previous event (PRD 0008 "Assumptions").

    Raises ``BusinessRuleViolation`` (422). Returns a normalized copy.
    """
    interview_type = data.interview_type
    if data.event_type is EventType.INTERVIEW:
        interview_type = interview_type or InterviewType.UNKNOWN
    elif interview_type is not None:
        raise BusinessRuleViolation(INTERVIEW_TYPE_ONLY_ON_INTERVIEW)

    salary = (data.salary_amount, data.salary_currency, data.salary_period)
    if data.event_type is EventType.OFFER:
        if any(field is None for field in salary):
            raise BusinessRuleViolation(OFFER_NEEDS_SALARY)
    elif any(field is not None for field in salary):
        raise BusinessRuleViolation(SALARY_ONLY_ON_OFFER)

    if (data.start_time is None) != (data.end_time is None):
        raise BusinessRuleViolation(TIMES_TOGETHER)
    if (
        data.start_time is not None
        and data.end_time is not None
        and data.end_time <= data.start_time
    ):
        raise BusinessRuleViolation(END_AFTER_START)

    return data.model_copy(update={'interview_type': interview_type})


def ensure_offer_period_allowed[T: TimelineEventWriteDTO](data: T) -> None:
    """Refuse ``hourly`` on an offer event (R-005/R-031).

    Call explicitly, on top of :func:`normalize_event`, from any path that
    must match the timeline write schema's offer-period restriction. The
    legacy 0.1.4 finalize body does not call this (see the module-level
    note on ``OFFER_PERIODS``).
    """
    if (
        data.event_type is EventType.OFFER
        and data.salary_period not in OFFER_PERIODS
    ):
        raise BusinessRuleViolation(OFFER_PERIOD_INVALID)


async def ensure_one_initial_screening(
    timeline_repo: TimelineEventRepository,
    application_id: int,
    data: TimelineEventWriteDTO,
    replacing_id: int | None = None,
) -> None:
    """Refuse a second ``initial_screening`` interview (R-030, 409).

    The owner, decision (a): "one application can only have one interview of
    type innitial screening". Replacing the existing one is not a second one
    (``replacing_id``). The partial unique index behind it turns a
    concurrent race into the same 409 in the repository.
    """
    if data.interview_type is not InterviewType.INITIAL_SCREENING:
        return
    if await timeline_repo.has_initial_screening(
        application_id, exclude_id=replacing_id
    ):
        raise ResourceConflict(ONE_INITIAL_SCREENING_MESSAGE)
