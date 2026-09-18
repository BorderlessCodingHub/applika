"""The timeline-event request/response schemas (R-002..R-005, R-031).

Ported whole from mynextjob's ``test_timeline_event_schema.py``: every
cross-field rule of ``TimelineEventCreate`` / ``TimelineEventUpdate`` is a
``ValidationError`` (a 422 at the router) without touching the database.
Applika additions: the interview-type rule (default ``unknown``, refused on
non-interviews), the ``annual`` input alias, the 20 currencies, and the
length limits of the Contract (timezone <= 100, observation <= 5000).
"""

from datetime import date, time

import pytest
from pydantic import ValidationError

from app.core.enums import Currency, EventType, InterviewType, SalaryPeriod
from app.presentation.schemas.timeline_event import (
    TimelineEventCreate,
    TimelineEventOut,
    TimelineEventUpdate,
)

WRITE_SCHEMAS = (TimelineEventCreate, TimelineEventUpdate)


def _offer_body(**overrides: object) -> dict:
    data: dict = {
        'event_type': 'offer',
        'event_date': '2026-07-01',
        'salary_period': 'monthly',
        'salary_amount': 150000,
        'salary_currency': 'USD',
    }
    data.update(overrides)
    return data


def _note_body(**overrides: object) -> dict:
    data: dict = {'event_type': 'note', 'event_date': '2026-07-01'}
    data.update(overrides)
    return data


# -- Offer requires the salary triple ---------------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_offer_with_full_salary_trio_is_valid(schema):
    model = schema(**_offer_body())
    assert model.event_type is EventType.OFFER
    assert model.salary_period is SalaryPeriod.MONTHLY
    assert model.salary_amount == 150000
    assert model.salary_currency is Currency.USD


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize(
    'missing', ['salary_period', 'salary_amount', 'salary_currency']
)
def test_offer_missing_any_salary_field_is_rejected(schema, missing):
    body = _offer_body()
    body.pop(missing)
    with pytest.raises(ValidationError):
        schema(**body)


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_offer_annually_period_is_valid(schema):
    model = schema(**_offer_body(salary_period='annually'))
    assert model.salary_period is SalaryPeriod.ANNUALLY


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_offer_accepts_legacy_annual_as_annually(schema):
    """R-031: `annual` is accepted forever and stored as annually."""
    model = schema(**_offer_body(salary_period='annual'))
    assert model.salary_period is SalaryPeriod.ANNUALLY


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('currency', [c.value for c in Currency])
def test_offer_accepts_each_of_the_20_currencies(schema, currency):
    assert len(Currency) == 20
    assert schema(**_offer_body(salary_currency=currency)).salary_currency


# -- Non-offer types forbid the salary triple --------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize(
    'event_type', ['note', 'interview', 'feedback', 'denied']
)
def test_non_offer_without_salary_is_valid(schema, event_type):
    model = schema(**_note_body(event_type=event_type))
    assert model.salary_period is None
    assert model.salary_amount is None
    assert model.salary_currency is None


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize(
    'salary_field',
    [
        {'salary_period': 'monthly'},
        {'salary_amount': 1000},
        {'salary_currency': 'USD'},
    ],
)
def test_non_offer_with_any_salary_field_is_rejected(schema, salary_field):
    with pytest.raises(ValidationError):
        schema(**_note_body(event_type='feedback', **salary_field))


# -- Offer salary period: hourly refused at the schema layer -----------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_offer_hourly_period_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_offer_body(salary_period='hourly'))


def test_hourly_is_still_a_valid_salary_period_enum_member():
    """The restriction is offer-scoped, not enum-wide."""
    assert SalaryPeriod('hourly') is SalaryPeriod.HOURLY
    assert {p.value for p in SalaryPeriod} == {'hourly', 'monthly', 'annually'}


# -- Interview type (applika) -------------------------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_interview_without_type_defaults_to_unknown(schema):
    model = schema(**_note_body(event_type='interview'))
    assert model.interview_type is InterviewType.UNKNOWN


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('kind', [k.value for k in InterviewType])
def test_interview_accepts_each_of_the_seven_types(schema, kind):
    model = schema(**_note_body(event_type='interview', interview_type=kind))
    assert model.interview_type == kind


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('event_type', ['note', 'feedback', 'denied'])
def test_interview_type_on_non_interview_is_rejected(schema, event_type):
    with pytest.raises(ValidationError, match='only allowed on interview'):
        schema(**_note_body(event_type=event_type, interview_type='unknown'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_interview_type_on_offer_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_offer_body(interview_type='final'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_unknown_interview_type_value_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_note_body(event_type='interview', interview_type='phone'))


# -- Scheduling -----------------------------------------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_scheduled_event_with_valid_range_is_valid(schema):
    model = schema(
        **_note_body(
            start_time='09:00', end_time='10:00', timezone='Europe/London'
        )
    )
    assert model.start_time == time(9, 0)
    assert model.end_time == time(10, 0)
    assert model.timezone == 'Europe/London'


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize(
    'partial', [{'start_time': '09:00'}, {'end_time': '10:00'}]
)
def test_scheduling_requires_both_times(schema, partial):
    with pytest.raises(ValidationError):
        schema(**_note_body(**partial))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize(
    ('start', 'end'), [('10:00', '10:00'), ('11:00', '10:00')]
)
def test_end_time_must_be_after_start_time(schema, start, end):
    with pytest.raises(ValidationError):
        schema(**_note_body(start_time=start, end_time=end))


# -- Field hygiene ----------------------------------------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_unknown_field_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_note_body(user_id=123))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_negative_salary_amount_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_offer_body(salary_amount=-1))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_salary_amount_beyond_numeric_12_2_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_offer_body(salary_amount='10000000000.00'))
    with pytest.raises(ValidationError):
        schema(**_offer_body(salary_amount='1.001'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_timezone_is_at_most_100_characters(schema):
    assert schema(**_note_body(timezone='x' * 100)).timezone
    with pytest.raises(ValidationError):
        schema(**_note_body(timezone='x' * 101))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_observation_is_at_most_5000_characters(schema):
    assert schema(**_note_body(observation='x' * 5000)).observation
    with pytest.raises(ValidationError):
        schema(**_note_body(observation='x' * 5001))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_event_type_outside_the_five_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_note_body(event_type='applied'))


# -- Out schema ----------------------------------------------------------------------


def test_out_serializes_ids_and_salary_as_strings():
    out = TimelineEventOut.model_validate({
        'id': 700000000000000001,
        'application_id': 800000000000000002,
        'user_id': 900000000000000003,
        'event_type': EventType.OFFER,
        'event_date': date(2026, 7, 1),
        'salary_period': SalaryPeriod.ANNUALLY,
        'salary_amount': 150000,
        'salary_currency': Currency.USD,
        'created_at': '2026-07-01T12:00:00Z',
    })
    dumped = out.model_dump(mode='json')
    assert dumped['id'] == '700000000000000001'
    assert dumped['application_id'] == '800000000000000002'
    assert dumped['user_id'] == '900000000000000003'
    assert dumped['salary_amount'] == '150000.00'
    assert dumped['salary_period'] == 'annually'
    assert dumped['interview_type'] is None


def test_out_serializes_null_salary_for_non_offer():
    out = TimelineEventOut.model_validate({
        'id': 1,
        'application_id': 2,
        'user_id': 3,
        'event_type': EventType.INTERVIEW,
        'interview_type': InterviewType.TAKE_HOME,
        'event_date': date(2026, 7, 1),
        'created_at': '2026-07-01T12:00:00Z',
    })
    dumped = out.model_dump(mode='json')
    assert dumped['salary_amount'] is None
    assert dumped['salary_period'] is None
    assert dumped['salary_currency'] is None
    assert dumped['interview_type'] == 'take_home'
