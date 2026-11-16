"""The Application read model and the agenda (R-019, R-026), unit level.

Pinned: ``finalized`` and ``last_event`` are derived from the timeline in
one query for any list length (no N+1); ``feedback`` and ``salary_offer``
are gone since ADR-0028; the agenda items carry the event type and
interview type, and no legacy step.
"""

from datetime import UTC, date, datetime, time
from decimal import Decimal
from unittest.mock import AsyncMock

from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.use_cases.get_user_agenda import GetUserAgendaUseCase
from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
from tests.unit.conftest import make_application, make_event, make_read_model


async def test_many_builds_the_derived_fields_in_one_query():
    apps = [
        make_application(id=1, finalized_at=datetime(2026, 1, 3, tzinfo=UTC)),
        make_application(id=2),
        make_application(id=3),
        make_application(id=4),
    ]
    offer = make_event(
        id=11,
        application_id=1,
        event_type=EventType.OFFER,
        event_date=date(2026, 1, 2),
        salary_amount=Decimal('4200.50'),
        salary_currency=Currency.USD,
        salary_period=SalaryPeriod.MONTHLY,
    )
    screening = make_event(
        id=21,
        application_id=2,
        event_type=EventType.INTERVIEW,
        interview_type=InterviewType.INITIAL_SCREENING,
        event_date=date(2026, 1, 5),
    )
    denied = make_event(
        id=41,
        application_id=4,
        event_type=EventType.DENIED,
        denied_reason=DeniedReason.GHOSTED,
        event_date=date(2026, 1, 6),
    )
    timeline_repo = AsyncMock()
    timeline_repo.latest_for_applications.return_value = {
        1: offer,
        2: screening,
        4: denied,
    }
    read_model = ApplicationReadModel(timeline_repo)

    result = await read_model.many(apps)

    timeline_repo.latest_for_applications.assert_awaited_once_with([
        1,
        2,
        3,
        4,
    ])

    closed, screened, empty, refused = result
    assert closed.finalized is True
    assert closed.finalized_at == datetime(2026, 1, 3, tzinfo=UTC)
    assert closed.last_event is not None
    assert closed.last_event.model_dump() == {
        'id': 11,
        'event_type': EventType.OFFER,
        'interview_type': None,
        'denied_reason': None,
        'date': date(2026, 1, 2),
    }
    # The fields only applika-cli read are gone (ADR-0028).
    assert 'salary_offer' not in closed.model_dump()
    assert 'feedback' not in closed.model_dump()
    assert 'last_step' not in closed.model_dump()

    assert screened.finalized is False
    assert screened.last_event is not None
    assert screened.last_event.event_type is EventType.INTERVIEW
    assert screened.last_event.interview_type is (
        InterviewType.INITIAL_SCREENING
    )

    assert empty.last_event is None

    assert refused.last_event is not None
    assert refused.last_event.denied_reason is DeniedReason.GHOSTED


async def test_one_is_many_of_one():
    read_model = make_read_model()
    dto = await read_model.one(make_application(id=4, role='SRE'))
    assert (dto.id, dto.role) == (4, 'SRE')
    assert dto.last_event is None


async def test_agenda_items_carry_event_and_interview_type():
    application = make_application(id=1, company_name='Acme', role='Dev')
    events = [
        make_event(
            id=31,
            application_id=1,
            application=application,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.TECHNICAL,
            event_date=date(2026, 2, 1),
            start_time=time(9),
            end_time=time(10),
            timezone='Europe/Lisbon',
            observation='Live coding',
        ),
        make_event(
            id=32,
            application_id=1,
            application=application,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
            event_date=date(2026, 2, 2),
        ),
    ]
    timeline_repo = AsyncMock()
    timeline_repo.list_agenda.return_value = events

    items = await GetUserAgendaUseCase(timeline_repo).execute(
        user_id=1, from_date=date(2026, 1, 1), to_date=date(2026, 3, 1)
    )

    timeline_repo.list_agenda.assert_awaited_once_with(
        user_id=1, from_date=date(2026, 1, 1), to_date=date(2026, 3, 1)
    )
    first, second = items
    assert first.event_type is EventType.INTERVIEW
    assert first.interview_type is InterviewType.TECHNICAL
    assert first.step_date == date(2026, 2, 1)
    assert (first.start_time, first.end_time) == (time(9), time(10))
    assert (first.company_name, first.role) == ('Acme', 'Dev')
    assert 'step_name' not in first.model_dump()
    assert second.interview_type is InterviewType.UNKNOWN


async def test_agenda_empty():
    timeline_repo = AsyncMock()
    timeline_repo.list_agenda.return_value = []
    assert await GetUserAgendaUseCase(timeline_repo).execute(1) == []
