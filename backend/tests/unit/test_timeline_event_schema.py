"""The timeline-event request/response schemas (R-002..R-005, R-031).

Every cross-field rule of ``TimelineEventCreate`` / ``TimelineEventUpdate`` is a
``ValidationError`` (a 422 at the router) without touching the database.
Also: the interview-type rule (default ``unknown``, refused on
non-interviews), the ``annual`` input alias, the 20 currencies, and the
length limits of the Contract (timezone <= 100, observation <= 5000).
"""

from datetime import date, time

import pytest
from pydantic import ValidationError

from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
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


def _plain_body(**overrides: object) -> dict:
    """A denied event with nothing but a date: no salary, no schedule, no
    interview type (its reason defaults to unknown)."""
    data: dict = {'event_type': 'denied', 'event_date': '2026-07-01'}
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
@pytest.mark.parametrize('event_type', ['interview', 'denied'])
def test_non_offer_without_salary_is_valid(schema, event_type):
    model = schema(**_plain_body(event_type=event_type))
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
        schema(**_plain_body(event_type='interview', **salary_field))


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
    model = schema(**_plain_body(event_type='interview'))
    assert model.interview_type is InterviewType.UNKNOWN


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('kind', [k.value for k in InterviewType])
def test_interview_accepts_each_of_the_seven_types(schema, kind):
    model = schema(**_plain_body(event_type='interview', interview_type=kind))
    assert model.interview_type == kind


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('event_type', ['denied'])
def test_interview_type_on_non_interview_is_rejected(schema, event_type):
    with pytest.raises(ValidationError, match='only allowed on interview'):
        schema(**_plain_body(event_type=event_type, interview_type='unknown'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_interview_type_on_offer_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_offer_body(interview_type='final'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_unknown_interview_type_value_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_plain_body(event_type='interview', interview_type='phone'))


# -- Denied reason (KODI-014, R-033..R-036, the same pattern) ---------------


def _denied_body(**overrides: object) -> dict:
    data: dict = {'event_type': 'denied', 'event_date': '2026-07-01'}
    data.update(overrides)
    return data


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_denied_without_reason_defaults_to_unknown(schema):
    model = schema(**_denied_body())
    assert model.denied_reason is DeniedReason.UNKNOWN


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('reason', [r.value for r in DeniedReason])
def test_denied_accepts_each_of_the_ten_reasons(schema, reason):
    model = schema(**_denied_body(denied_reason=reason))
    assert model.denied_reason == reason


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('event_type', ['interview'])
def test_denied_reason_on_non_denied_is_rejected(schema, event_type):
    with pytest.raises(ValidationError, match='only allowed on denied'):
        schema(**_plain_body(event_type=event_type, denied_reason='ghosted'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_denied_reason_on_offer_is_rejected(schema):
    with pytest.raises(ValidationError, match='only allowed on denied'):
        schema(**_offer_body(denied_reason='ghosted'))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_unknown_denied_reason_value_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_denied_body(denied_reason='not_a_real_reason'))


# -- Scheduling -----------------------------------------------------------------


def _interview_body(**overrides: object) -> dict:
    data: dict = {'event_type': 'interview', 'event_date': '2026-07-01'}
    data.update(overrides)
    return data


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_scheduled_event_with_valid_range_is_valid(schema):
    model = schema(
        **_interview_body(
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
        schema(**_interview_body(**partial))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize(
    ('start', 'end'), [('10:00', '10:00'), ('11:00', '10:00')]
)
def test_end_time_must_be_after_start_time(schema, start, end):
    with pytest.raises(ValidationError):
        schema(**_interview_body(start_time=start, end_time=end))


# -- Schedule only on interview (KODI-016, R-038/R-039, the same pattern) ---


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('event_type', ['offer', 'denied'])
@pytest.mark.parametrize(
    'field',
    [
        {'start_time': '09:00', 'end_time': '10:00'},
        {'timezone': 'Europe/London'},
    ],
)
def test_schedule_on_non_interview_is_rejected(schema, event_type, field):
    body = (
        _offer_body(**field)
        if event_type == 'offer'
        else _plain_body(event_type=event_type, **field)
    )
    with pytest.raises(ValidationError, match='only allowed on interview'):
        schema(**body)


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('event_type', ['denied'])
def test_explicit_null_schedule_on_non_interview_is_valid(schema, event_type):
    model = schema(
        **_plain_body(
            event_type=event_type,
            start_time=None,
            end_time=None,
            timezone=None,
        )
    )
    assert model.start_time is None
    assert model.end_time is None
    assert model.timezone is None


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_absent_schedule_keys_on_non_interview_is_valid(schema):
    model = schema(**_plain_body())
    assert model.start_time is None
    assert model.end_time is None
    assert model.timezone is None


# -- Field hygiene ----------------------------------------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_unknown_field_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_plain_body(user_id=123))


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
    assert schema(**_interview_body(timezone='x' * 100)).timezone
    with pytest.raises(ValidationError):
        schema(**_interview_body(timezone='x' * 101))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_observation_is_at_most_5000_characters(schema):
    assert schema(**_plain_body(observation='x' * 5000)).observation
    with pytest.raises(ValidationError):
        schema(**_plain_body(observation='x' * 5001))


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_event_type_outside_the_three_is_rejected(schema):
    with pytest.raises(ValidationError):
        schema(**_plain_body(event_type='applied'))


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
    assert dumped['denied_reason'] is None


def test_out_serializes_the_denied_reason():
    out = TimelineEventOut.model_validate({
        'id': 1,
        'application_id': 2,
        'user_id': 3,
        'event_type': EventType.DENIED,
        'denied_reason': DeniedReason.SALARY_MISMATCH,
        'event_date': date(2026, 7, 1),
        'created_at': '2026-07-01T12:00:00Z',
    })
    dumped = out.model_dump(mode='json')
    assert dumped['denied_reason'] == 'salary_mismatch'


# -- Schedule omitted on non-interview (KODI-016, R-038/R-039) --------------


@pytest.mark.parametrize('event_type', ['offer', 'denied'])
def test_out_omits_schedule_keys_for_non_interview(event_type):
    payload = {
        'id': 1,
        'application_id': 2,
        'user_id': 3,
        'event_type': event_type,
        'event_date': date(2026, 7, 1),
        'created_at': '2026-07-01T12:00:00Z',
    }
    if event_type == 'offer':
        payload.update(
            salary_period=SalaryPeriod.MONTHLY,
            salary_amount=1000,
            salary_currency=Currency.USD,
        )
    if event_type == 'denied':
        payload['denied_reason'] = DeniedReason.UNKNOWN
    out = TimelineEventOut.model_validate(payload)
    dumped = out.model_dump(mode='json')
    assert 'start_time' not in dumped
    assert 'end_time' not in dumped
    assert 'timezone' not in dumped


def test_out_keeps_schedule_keys_for_interview():
    out = TimelineEventOut.model_validate({
        'id': 1,
        'application_id': 2,
        'user_id': 3,
        'event_type': EventType.INTERVIEW,
        'interview_type': InterviewType.TECHNICAL,
        'event_date': date(2026, 7, 1),
        'start_time': '09:00',
        'end_time': '10:00',
        'timezone': 'Europe/London',
        'created_at': '2026-07-01T12:00:00Z',
    })
    dumped = out.model_dump(mode='json')
    assert dumped['start_time'] == '09:00:00'
    assert dumped['end_time'] == '10:00:00'
    assert dumped['timezone'] == 'Europe/London'


def test_out_serialization_schema_still_lists_every_field():
    """A ``@model_serializer`` makes Pydantic unable to statically infer the
    output shape, which by default degrades the *serialization*-mode JSON
    schema (the one FastAPI builds for ``response_model``) to an opaque
    ``{"type": "object", "additionalProperties": true}`` - losing every
    field's type and the ``required`` list the pinned contract cares about.
    ``TimelineEventOut.__get_pydantic_json_schema__`` works around it,
    stripping only the ``serialization``/``metadata`` keys the wrap
    serializer adds before delegating - so the schema comes back
    byte-for-byte what this class would produce without the serializer:
    same title, same ``additionalProperties: false``, same properties and
    ``required``. This pins that the OpenAPI schema stays fully typed."""
    schema = TimelineEventOut.model_json_schema(mode='serialization')
    assert schema['title'] == 'TimelineEventOut'
    assert schema['additionalProperties'] is False
    assert set(schema['properties']) == {
        'id',
        'application_id',
        'user_id',
        'event_type',
        'interview_type',
        'denied_reason',
        'event_date',
        'start_time',
        'end_time',
        'timezone',
        'observation',
        'salary_period',
        'salary_amount',
        'salary_currency',
        'created_at',
        'updated_at',
    }
    assert set(schema['required']) == {
        'id',
        'application_id',
        'user_id',
        'event_type',
        'event_date',
        'created_at',
    }
    for field in ('start_time', 'end_time', 'timezone'):
        assert field not in schema['required']


def test_out_keeps_null_schedule_keys_for_unscheduled_interview():
    out = TimelineEventOut.model_validate({
        'id': 1,
        'application_id': 2,
        'user_id': 3,
        'event_type': EventType.INTERVIEW,
        'interview_type': InterviewType.TECHNICAL,
        'event_date': date(2026, 7, 1),
        'created_at': '2026-07-01T12:00:00Z',
    })
    dumped = out.model_dump(mode='json')
    assert dumped['start_time'] is None
    assert dumped['end_time'] is None
    assert dumped['timezone'] is None


# -- Three event types (ADR-0020) -----------------------------------------------


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
@pytest.mark.parametrize('event_type', ['note', 'feedback'])
def test_note_and_feedback_are_refused_as_an_invalid_value(schema, event_type):
    """Retired: refused like any unknown value, never translated."""
    with pytest.raises(ValidationError) as caught:
        schema(**_plain_body(event_type=event_type))
    errors = caught.value.errors()
    assert [(e['type'], e['loc']) for e in errors] == [
        ('enum', ('event_type',))
    ]
    assert errors[0]['ctx']['expected'] == "'interview', 'offer' or 'denied'"


@pytest.mark.parametrize('schema', WRITE_SCHEMAS)
def test_write_schema_advertises_exactly_three_event_types(schema):
    json_schema = schema.model_json_schema()
    ref = json_schema['properties']['event_type']['$ref'].rsplit('/', 1)[-1]
    assert json_schema['$defs'][ref]['enum'] == ['interview', 'offer', 'denied']
