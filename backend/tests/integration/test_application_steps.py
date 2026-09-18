"""The deprecated /steps routes on the timeline, driven with 0.1.4 payloads
(R-013, R-015, R-016, R-019, R-020, R-027, R-030).

``applika-cli`` 0.1.4 keeps listing, adding, editing and deleting *steps*;
the data behind them is now the timeline. Every response, errors included,
carries ``Deprecation: @1789430400``. The step catalog is seeded with R1's
decision (a) mapping and the "migrated" steps are timeline events that kept
their step id, as revision afd4074c70c2 leaves production.
"""

from datetime import date, datetime, time

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import (
    Currency,
    DeniedReason,
    EventType,
    InterviewType,
    SalaryPeriod,
)
from app.domain.models import CycleModel, TimelineEventModel
from app.main import app as main_app
from app.presentation.deprecation import DEPRECATION_VALUE
from tests import msg
from tests.integration import timeline_seed as ts

STEP_KEYS = {
    'id',
    'step_id',
    'step_name',
    'step_date',
    'start_time',
    'end_time',
    'timezone',
    'observation',
    'created_at',
    'updated_at',
}
MIGRATED_STEP_ID = 1_234_567_890_123


def _deprecated(response) -> None:
    assert response.headers.get('Deprecation') == DEPRECATION_VALUE, (
        response.headers
    )
    assert 'Sunset' not in response.headers


async def _seed_app_and_steps(db_session: AsyncSession, **app_fields):
    await ts.seed_open_application(db_session, **app_fields)


async def _event(db_session: AsyncSession, event_id: int) -> TimelineEventModel:
    db_session.expire_all()
    row = await db_session.scalar(
        select(TimelineEventModel).where(TimelineEventModel.id == event_id)
    )
    assert row is not None
    return row


# ---------------------------------------------------------------------------
# OpenAPI
# ---------------------------------------------------------------------------


def test_steps_routes_are_marked_deprecated_in_openapi():
    paths = main_app.openapi()['paths']
    for path in (
        '/applications/{application_id}/steps',
        '/applications/{application_id}/steps/{step_id}',
    ):
        for operation in paths[path].values():
            assert operation.get('deprecated') is True, (path, operation)


# ---------------------------------------------------------------------------
# LIST steps
# ---------------------------------------------------------------------------


async def test_list_steps_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    response = await async_client.get('/applications/1/steps')

    assert response.status_code == 200, msg(200, response.status_code)
    assert response.json() == [], msg([], response.json())
    _deprecated(response)


async def test_list_steps_shows_a_migrated_step_with_its_id(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-013 read through the compat route: id, date, times, timezone and
    observation of a step R1 copied, and the same step it was."""
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(
            MIGRATED_STEP_ID,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            event_date=date(2025, 12, 5),
            start_time=time(9, 30),
            end_time=time(10, 0),
            timezone='America/Sao_Paulo',
            observation='Recruiter call',
        ),
    )

    response = await async_client.get('/applications/1/steps')

    assert response.status_code == 200, msg(200, response.status_code)
    [step] = response.json()
    assert set(step) == STEP_KEYS
    assert step['id'] == str(MIGRATED_STEP_ID)
    assert step['step_id'] == str(ts.STEP_SCREEN)
    assert step['step_name'] == 'Initial Screen'
    assert step['step_date'] == '2025-12-05'
    assert step['start_time'] == '09:30:00'
    assert step['end_time'] == '10:00:00'
    assert step['timezone'] == 'America/Sao_Paulo'
    assert step['observation'] == 'Recruiter call'
    _deprecated(response)


async def test_list_steps_names_every_web_created_event(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Edge case: events created in the web app list with a step name and
    id each, whatever their type."""
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(11, event_type=EventType.NOTE, event_date=date(2025, 12, 2)),
        ts.event(
            12,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.TECHNICAL,
            event_date=date(2025, 12, 3),
        ),
        ts.event(
            13, event_type=EventType.FEEDBACK, event_date=date(2025, 12, 4)
        ),
        ts.event(
            14,
            event_type=EventType.OFFER,
            event_date=date(2025, 12, 6),
            **ts.offer_salary('5000'),
        ),
        ts.event(15, event_type=EventType.DENIED, event_date=date(2025, 12, 7)),
    )

    response = await async_client.get('/applications/1/steps')

    assert response.status_code == 200
    assert [
        (s['id'], s['step_id'], s['step_name']) for s in response.json()
    ] == [
        ('11', str(ts.STEP_PHASE_2), 'Phase 2'),
        ('12', str(ts.STEP_PHASE_2), 'Phase 2'),
        ('13', str(ts.STEP_PHASE_2), 'Phase 2'),
        ('14', str(ts.STEP_OFFER), 'Offer'),
        ('15', str(ts.STEP_DENIED), 'Denied'),
    ]


async def test_list_steps_for_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/applications/999/steps')

    assert response.status_code == 404, msg(404, response.status_code)
    _deprecated(response)


async def test_list_steps_of_another_users_application_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(id=77, user_id=ts.OTHER_USER_ID),
        ts.event(78, application_id=77, user_id=ts.OTHER_USER_ID),
    )

    response = await async_client.get('/applications/77/steps')

    assert response.status_code == 404
    _deprecated(response)


# ---------------------------------------------------------------------------
# CREATE step
# ---------------------------------------------------------------------------


async def test_create_step(async_client: AsyncClient, db_session: AsyncSession):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': str(ts.STEP_PHASE_3),
        'step_date': '2025-12-05',
        'observation': 'Phone screen done',
    }
    response = await async_client.post('/applications/1/steps', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert set(data) == STEP_KEYS
    assert data['step_id'] == str(ts.STEP_PHASE_3), msg('3', data['step_id'])
    assert data['step_name'] == 'Phase 3'
    assert data['observation'] == 'Phone screen done'
    _deprecated(response)

    stored = await _event(db_session, int(data['id']))
    assert stored.event_type is EventType.INTERVIEW
    assert stored.interview_type is InterviewType.UNKNOWN
    assert stored.event_date == date(2025, 12, 5)


async def test_create_step_is_a_timeline_event(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    created = await async_client.post(
        '/applications/1/steps',
        json={'step_id': str(ts.STEP_SCREEN), 'step_date': '2025-12-05'},
    )

    timeline = await async_client.get('/applications/1/timeline')

    assert timeline.status_code == 200
    [event] = timeline.json()
    assert event['id'] == created.json()['id']
    assert event['event_type'] == 'interview'
    assert event['interview_type'] == 'initial_screening'
    assert 'Deprecation' not in timeline.headers


async def test_create_step_strict_step_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Strict steps are only for finalize, as today."""
    await _seed_app_and_steps(db_session)

    payload = {'step_id': str(ts.STEP_OFFER), 'step_date': '2025-12-05'}
    response = await async_client.post('/applications/1/steps', json=payload)

    assert response.status_code == 404, msg(404, response.status_code)
    _deprecated(response)


async def test_create_step_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-12-05'}
    response = await async_client.post('/applications/999/steps', json=payload)

    assert response.status_code == 404, msg(404, response.status_code)


async def test_create_step_on_closed_app_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(
        db_session, finalized_at=ts.closed_at(date(2025, 12, 10))
    )

    payload = {'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-12-05'}
    response = await async_client.post('/applications/1/steps', json=payload)

    assert response.status_code == 409, msg(409, response.status_code)
    assert 'Reopen the application to edit it' in response.json()['detail']
    _deprecated(response)


async def test_create_step_on_archived_app_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await ts.seed(
        db_session,
        *ts.catalog(),
        CycleModel(id=500, user_id=ts.USER_ID, name='Old'),
        ts.application(cycle_id=500),
    )

    response = await async_client.post(
        '/applications/1/steps',
        json={'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-12-05'},
    )

    assert response.status_code == 422
    assert 'archived' in response.json()['detail']
    _deprecated(response)


async def test_create_second_initial_screen_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-030 on the compat route: Initial Screen maps to initial_screening."""
    await _seed_app_and_steps(db_session)
    payload = {'step_id': str(ts.STEP_SCREEN), 'step_date': '2025-12-05'}

    first = await async_client.post('/applications/1/steps', json=payload)
    second = await async_client.post('/applications/1/steps', json=payload)

    assert first.status_code == 201
    assert second.status_code == 409
    assert 'initial screening' in second.json()['detail']
    _deprecated(second)


async def test_create_step_before_application_date_is_allowed(
    async_client: AsyncClient, db_session: AsyncSession
):
    """PRD 0008 "Assumptions": the step-date order rules are gone."""
    await _seed_app_and_steps(db_session)

    response = await async_client.post(
        '/applications/1/steps',
        json={'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-01-01'},
    )

    assert response.status_code == 201


async def test_create_step_validation_error_still_carries_deprecation(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    response = await async_client.post(
        '/applications/1/steps', json={'step_date': 'not-a-date'}
    )

    assert response.status_code == 422
    _deprecated(response)


# ---------------------------------------------------------------------------
# UPDATE step
# ---------------------------------------------------------------------------


async def test_update_step(async_client: AsyncClient, db_session: AsyncSession):
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(
            MIGRATED_STEP_ID,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
    )

    payload = {
        'step_id': str(ts.STEP_SCREEN),
        'step_date': '2025-12-08',
        'observation': 'Updated to screening',
    }
    response = await async_client.put(
        f'/applications/1/steps/{MIGRATED_STEP_ID}', json=payload
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert set(data) == STEP_KEYS
    assert data['id'] == str(MIGRATED_STEP_ID)
    assert data['step_id'] == str(ts.STEP_SCREEN)
    assert data['step_name'] == 'Initial Screen'
    assert data['observation'] == 'Updated to screening'
    _deprecated(response)
    stored = await _event(db_session, MIGRATED_STEP_ID)
    assert stored.interview_type is InterviewType.INITIAL_SCREENING
    assert stored.event_date == date(2025, 12, 8)


async def test_edit_without_step_keeps_a_note_a_note(
    async_client: AsyncClient, db_session: AsyncSession
):
    """0.1.4 `steps edit` without --step resends the listed step_id: the
    event keeps its type instead of turning into interview/unknown."""
    await _seed_app_and_steps(db_session)
    await ts.seed(db_session, ts.event(21, event_type=EventType.NOTE))
    listed = (await async_client.get('/applications/1/steps')).json()[0]

    response = await async_client.put(
        '/applications/1/steps/21',
        json={
            'step_id': listed['step_id'],
            'step_date': listed['step_date'],
            'observation': 'edited from the CLI',
        },
    )

    assert response.status_code == 200
    stored = await _event(db_session, 21)
    assert stored.event_type is EventType.NOTE
    assert stored.interview_type is None
    assert stored.observation == 'edited from the CLI'


async def test_edit_without_step_keeps_an_offer_and_its_salary(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(
            22,
            event_type=EventType.OFFER,
            **ts.offer_salary('7000', Currency.EUR, SalaryPeriod.ANNUALLY),
        ),
    )
    listed = (await async_client.get('/applications/1/steps')).json()[0]
    assert listed['step_id'] == str(ts.STEP_OFFER)  # strict, but its own

    response = await async_client.put(
        '/applications/1/steps/22',
        json={'step_id': listed['step_id'], 'step_date': '2025-12-09'},
    )

    assert response.status_code == 200, response.text
    stored = await _event(db_session, 22)
    assert stored.event_type is EventType.OFFER
    assert (stored.salary_amount, stored.salary_currency) == (
        7000,
        Currency.EUR,
    )
    assert stored.salary_period is SalaryPeriod.ANNUALLY


async def test_edit_without_step_keeps_a_denied_events_reason(
    async_client: AsyncClient, db_session: AsyncSession
):
    """KODI-014: symmetric to the offer/salary case above - a 0.1.4 `steps
    edit` without `--step` resending the event's own (strict) reverse step
    keeps its denied_reason too, instead of resetting it to unknown."""
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(
            23,
            event_type=EventType.DENIED,
            denied_reason=DeniedReason.SKILLS_MISMATCH,
        ),
    )
    listed = (await async_client.get('/applications/1/steps')).json()[0]
    assert listed['step_id'] == str(ts.STEP_DENIED)  # strict, but its own

    response = await async_client.put(
        '/applications/1/steps/23',
        json={
            'step_id': listed['step_id'],
            'step_date': '2025-12-09',
            'observation': 'still denied',
        },
    )

    assert response.status_code == 200, response.text
    stored = await _event(db_session, 23)
    assert stored.event_type is EventType.DENIED
    assert stored.denied_reason is DeniedReason.SKILLS_MISMATCH


async def test_edit_switching_a_new_step_to_denied_is_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Denied is strict, same as Offer: a 0.1.4 edit can only ever resend an
    event's own reverse step into it (the "keeps its reason" case above),
    never pick it as a *new* step - ``_non_strict_step`` refuses it exactly
    as ``test_create_step_strict_step_returns_404`` does for create."""
    await _seed_app_and_steps(db_session)
    await ts.seed(db_session, ts.event(24, event_type=EventType.NOTE))

    response = await async_client.put(
        '/applications/1/steps/24',
        json={'step_id': str(ts.STEP_DENIED), 'step_date': '2025-12-09'},
    )

    assert response.status_code == 404, response.text
    stored = await _event(db_session, 24)
    assert stored.event_type is EventType.NOTE
    assert stored.denied_reason is None


async def test_update_to_a_second_initial_screen_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(
            31,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
        ),
        ts.event(
            32,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
        ),
    )

    response = await async_client.put(
        '/applications/1/steps/32',
        json={'step_id': str(ts.STEP_SCREEN), 'step_date': '2025-12-05'},
    )

    assert response.status_code == 409
    _deprecated(response)


async def test_update_step_nonexistent_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-12-05'}
    response = await async_client.put('/applications/1/steps/999', json=payload)

    assert response.status_code == 404, msg(404, response.status_code)
    _deprecated(response)


async def test_update_step_on_closed_app_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(
        db_session, finalized_at=ts.closed_at(date(2025, 12, 10))
    )
    await ts.seed(db_session, ts.event(41))

    response = await async_client.put(
        '/applications/1/steps/41',
        json={'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-12-05'},
    )

    assert response.status_code == 409


# ---------------------------------------------------------------------------
# DELETE step
# ---------------------------------------------------------------------------


async def test_delete_step(async_client: AsyncClient, db_session: AsyncSession):
    await _seed_app_and_steps(db_session)
    await ts.seed(db_session, ts.event(MIGRATED_STEP_ID))

    response = await async_client.delete(
        f'/applications/1/steps/{MIGRATED_STEP_ID}'
    )

    assert response.status_code == 204, msg(204, response.status_code)
    _deprecated(response)
    listing = await async_client.get('/applications/1/timeline')
    assert listing.json() == []


async def test_delete_step_nonexistent_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    response = await async_client.delete('/applications/1/steps/999')

    assert response.status_code == 404, msg(404, response.status_code)
    _deprecated(response)


async def test_delete_step_on_closed_app_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session, finalized_at=datetime(2025, 12, 10))
    await ts.seed(db_session, ts.event(51))

    response = await async_client.delete('/applications/1/steps/51')

    assert response.status_code == 409, msg(409, response.status_code)
    _deprecated(response)


# ---------------------------------------------------------------------------
# Time range validation (CREATE)
# ---------------------------------------------------------------------------


async def test_create_step_with_both_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': str(ts.STEP_PHASE_2),
        'step_date': '2025-12-05',
        'start_time': '09:00',
        'end_time': '10:00',
        'timezone': 'Europe/Lisbon',
    }
    response = await async_client.post('/applications/1/steps', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['start_time'] == '09:00:00', msg('09:00:00', data['start_time'])
    assert data['end_time'] == '10:00:00', msg('10:00:00', data['end_time'])
    assert data['timezone'] == 'Europe/Lisbon'


async def test_create_step_with_no_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {'step_id': str(ts.STEP_PHASE_2), 'step_date': '2025-12-05'}
    response = await async_client.post('/applications/1/steps', json=payload)

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['start_time'] is None
    assert data['end_time'] is None


async def test_create_step_invalid_time_ranges_return_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    for times in (
        {'start_time': '09:00'},
        {'end_time': '10:00'},
        {'start_time': '14:00', 'end_time': '10:00'},
        {'start_time': '10:00', 'end_time': '10:00'},
    ):
        response = await async_client.post(
            '/applications/1/steps',
            json={
                'step_id': str(ts.STEP_PHASE_2),
                'step_date': '2025-12-05',
                **times,
            },
        )
        assert response.status_code == 422, (times, response.status_code)


# ---------------------------------------------------------------------------
# Time range validation (UPDATE)
# ---------------------------------------------------------------------------


async def test_update_step_with_both_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    await ts.seed(db_session, ts.event(61))

    payload = {
        'step_id': str(ts.STEP_PHASE_2),
        'step_date': '2025-12-05',
        'start_time': '09:00',
        'end_time': '10:00',
    }
    response = await async_client.put('/applications/1/steps/61', json=payload)

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['start_time'] == '09:00:00', msg('09:00:00', data['start_time'])
    assert data['end_time'] == '10:00:00', msg('10:00:00', data['end_time'])


async def test_update_step_invalid_time_ranges_return_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    await ts.seed(db_session, ts.event(62))
    for times in (
        {'start_time': '09:00'},
        {'end_time': '10:00'},
        {'start_time': '14:00', 'end_time': '10:00'},
    ):
        response = await async_client.put(
            '/applications/1/steps/62',
            json={
                'step_id': str(ts.STEP_PHASE_2),
                'step_date': '2025-12-05',
                **times,
            },
        )
        assert response.status_code == 422, (times, response.status_code)
        _deprecated(response)


async def test_update_step_clear_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    await ts.seed(
        db_session,
        ts.event(63, start_time=time(9, 0), end_time=time(10, 0)),
    )

    payload = {
        'step_id': str(ts.STEP_PHASE_2),
        'step_date': '2025-12-05',
        'start_time': None,
        'end_time': None,
    }
    response = await async_client.put('/applications/1/steps/63', json=payload)

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['start_time'] is None
    assert data['end_time'] is None
