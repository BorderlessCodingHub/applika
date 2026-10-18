"""The Application read model and the agenda (R-019, R-026), unit level.

Pinned: installed CLIs keep ``finalized``, ``last_step``, ``feedback`` and
``salary_offer``; they are derived from the timeline in a fixed number of
queries for any list length (no N+1); the agenda items carry the event type
and interview type plus their reverse-mapped legacy step.
"""

from datetime import UTC, date, datetime, time
from decimal import Decimal
from unittest.mock import AsyncMock

from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.application.use_cases.get_user_agenda import GetUserAgendaUseCase
from app.core.enums import Currency, EventType, InterviewType, SalaryPeriod
from tests.unit.conftest import (
    make_application,
    make_event,
    make_read_model,
    make_step_definition,
)

CATALOG = [
    make_step_definition(
        id=1,
        name='Initial Screen',
        color='#111111',
        event_type=EventType.INTERVIEW,
        interview_type=InterviewType.INITIAL_SCREENING,
    ),
    make_step_definition(id=2, name='Phase 2', color='#222222'),
    make_step_definition(
        id=5, name='Offer', color='#555555', strict=True,
        event_type=EventType.OFFER,
    ),
]


async def test_many_builds_every_legacy_field_in_three_queries():
    apps = [
        make_application(id=1, finalized_at=datetime(2026, 1, 3, tzinfo=UTC)),
        make_application(id=2),
        make_application(id=3),
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
    timeline_repo = AsyncMock()
    timeline_repo.latest_for_applications.return_value = {
        1: offer,
        2: screening,
    }
    timeline_repo.latest_offer_for_applications.return_value = {1: offer}
    step_repo = AsyncMock()
    step_repo.get_all.return_value = CATALOG
    read_model = ApplicationReadModel(timeline_repo, step_repo)

    result = await read_model.many(apps)

    timeline_repo.latest_for_applications.assert_awaited_once_with([1, 2, 3])
    timeline_repo.latest_offer_for_applications.assert_awaited_once_with(
        [1, 2, 3]
    )
    step_repo.get_all.assert_awaited_once()

    closed, screened, empty = result
    assert closed.finalized is True
    assert closed.finalized_at == datetime(2026, 1, 3, tzinfo=UTC)
    assert closed.last_step is not None
    assert closed.last_step.model_dump() == {
        'id': 5, 'name': 'Offer', 'color': '#555555', 'date': date(2026, 1, 2)
    }
    assert closed.salary_offer == 4200.5
    assert closed.feedback is None

    assert screened.finalized is False
    assert screened.last_step is not None
    assert screened.last_step.name == 'Initial Screen'
    assert screened.salary_offer is None

    assert empty.last_step is None
    assert empty.salary_offer is None
    assert empty.feedback is None


async def test_many_without_events_skips_the_catalog():
    timeline_repo = AsyncMock()
    timeline_repo.latest_for_applications.return_value = {}
    timeline_repo.latest_offer_for_applications.return_value = {}
    step_repo = AsyncMock()
    read_model = ApplicationReadModel(timeline_repo, step_repo)

    [dto] = await read_model.many([make_application(id=9)])

    assert dto.last_step is None
    step_repo.get_all.assert_not_called()


async def test_one_is_many_of_one():
    read_model = make_read_model()
    dto = await read_model.one(make_application(id=4, role='SRE'))
    assert (dto.id, dto.role) == (4, 'SRE')


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
    step_repo = AsyncMock()
    step_repo.get_all.return_value = CATALOG

    items = await GetUserAgendaUseCase(timeline_repo, step_repo).execute(
        user_id=1, from_date=date(2026, 1, 1), to_date=date(2026, 3, 1)
    )

    timeline_repo.list_agenda.assert_awaited_once_with(
        user_id=1, from_date=date(2026, 1, 1), to_date=date(2026, 3, 1)
    )
    first, second = items
    assert first.event_type is EventType.INTERVIEW
    assert first.interview_type is InterviewType.TECHNICAL
    assert (first.step_id, first.step_name, first.step_color) == (
        2,
        'Phase 2',
        '#222222',
    )
    assert first.step_date == date(2026, 2, 1)
    assert (first.start_time, first.end_time) == (time(9), time(10))
    assert (first.company_name, first.role) == ('Acme', 'Dev')
    # A former note: an interview of type unknown, shown as "Phase 2".
    assert second.event_type is EventType.INTERVIEW
    assert second.interview_type is InterviewType.UNKNOWN
    assert (second.step_id, second.step_name) == (2, 'Phase 2')


async def test_agenda_empty_reads_no_catalog():
    timeline_repo = AsyncMock()
    timeline_repo.list_agenda.return_value = []
    step_repo = AsyncMock()
    assert await GetUserAgendaUseCase(timeline_repo, step_repo).execute(1) == []
    step_repo.get_all.assert_not_called()
