"""Seed helpers for the timeline integration tests.

Rows are shaped the way revision ``afd4074c70c2`` (R1) leaves production:
the catalogs carry their decision (a) mapping, migrated steps are timeline
events that kept the step's id, a finalized application has
``finalized_at`` set and its outcome (and any salary) on an offer or denied
event whose observation ends with ``Feedback: <name>``.
"""

from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
from app.domain.models import (
    ApplicationModel,
    FeedbackDefinitionModel,
    StepDefinitionModel,
    TimelineEventModel,
)
from tests.base_db_setup import base_data

# The seeded production catalog, mapped as R1 maps it.
STEP_SCREEN = 1
STEP_PHASE_2 = 2
STEP_PHASE_3 = 3
STEP_OFFER = 4
STEP_DENIED = 5
FB_ACCEPTED = 10
FB_GHOST = 11

USER_ID = 1
OTHER_USER_ID = 2
APP_ID = 1


def catalog() -> list[Any]:
    iv = EventType.INTERVIEW
    return [
        StepDefinitionModel(
            id=STEP_SCREEN,
            name='Initial Screen',
            color='#111111',
            strict=False,
            event_type=iv,
            interview_type=InterviewType.INITIAL_SCREENING,
        ),
        StepDefinitionModel(
            id=STEP_PHASE_2,
            name='Phase 2',
            color='#222222',
            strict=False,
            event_type=iv,
            interview_type=InterviewType.UNKNOWN,
        ),
        StepDefinitionModel(
            id=STEP_PHASE_3,
            name='Phase 3',
            color='#333333',
            strict=False,
            event_type=iv,
            interview_type=InterviewType.UNKNOWN,
        ),
        StepDefinitionModel(
            id=STEP_OFFER,
            name='Offer',
            color='#28a745',
            strict=True,
            event_type=EventType.OFFER,
        ),
        StepDefinitionModel(
            id=STEP_DENIED,
            name='Denied',
            color='#a80000',
            strict=True,
            event_type=EventType.DENIED,
        ),
        FeedbackDefinitionModel(id=FB_ACCEPTED, name='Accepted', color='#0f0'),
        FeedbackDefinitionModel(id=FB_GHOST, name='Ghost', color='#999'),
    ]


def application(id: int = APP_ID, **fields: Any) -> ApplicationModel:
    values: dict[str, Any] = {
        'user_id': USER_ID,
        'platform_id': base_data()['plat_linkedin'].id,
        'company_id': base_data()['company_acme'].id,
        'company_name': 'Acme Corp',
        'role': 'Software Engineer',
        'mode': 'active',
        'application_date': date(2025, 12, 1),
    }
    values.update(fields)
    return ApplicationModel(id=id, **values)


def event(
    id: int, application_id: int = APP_ID, **fields: Any
) -> TimelineEventModel:
    values: dict[str, Any] = {
        'user_id': USER_ID,
        'event_type': EventType.NOTE,
        'event_date': date(2025, 12, 5),
    }
    values.update(fields)
    # KODI-014: a denied event defaults to unknown unless the caller picks a
    # reason, same as a real write (``rules.normalize_event``).
    if values['event_type'] is EventType.DENIED:
        values.setdefault('denied_reason', DeniedReason.UNKNOWN)
    return TimelineEventModel(id=id, application_id=application_id, **values)


def offer_salary(
    amount: str = '0',
    currency: Currency = Currency.USD,
    period: SalaryPeriod = SalaryPeriod.MONTHLY,
) -> dict[str, Any]:
    return {
        'salary_amount': Decimal(amount),
        'salary_currency': currency,
        'salary_period': period,
    }


def closed_at(day: date) -> datetime:
    """R1's backfill: ``feedback_date`` at 00:00 UTC."""
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


async def seed(session: AsyncSession, *rows: Any) -> None:
    """Add rows in order, flushing between them (FKs), then commit."""
    for row in rows:
        session.add(row)
        await session.flush()
    await session.commit()


async def seed_open_application(session: AsyncSession, **fields: Any) -> None:
    await seed(session, *catalog(), application(**fields))
