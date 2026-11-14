"""Release B reads what revision afd4074c70c2 (R1) left in production
(R-013, R-014, R-019, R-031; criteria 13, 14, 30 read side).

No migration runs here: the rows are seeded **in the shape R1 writes** and
then read through the real API.

* Migrated steps are timeline events that **kept the step's id**, with
  their date, times, timezone and observation (R-013).
* An application finalized before the switch has ``finalized_at`` =
  ``feedback_date`` at 00:00 UTC, and its outcome is the terminal offer or
  denied event, whose observation ends with ``Feedback: <name>``; an offer
  carries the salary (R-014). One finalized application whose last step
  had no step row got R1's synthetic terminal event, whose id is the
  application's own id, with decision (b)'s 0 / USD / monthly.
* A row still holding the legacy ``ANNUAL`` salary period label (users,
  applications and timeline_events) reads as ``annually`` everywhere
  (R-031): R1 does not remap it, R2 will.
"""

from datetime import date, time
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Currency, EventType, InterviewType, SalaryPeriod
from tests.integration import timeline_seed as ts

APP_OPEN = 101
APP_OFFER = 102
APP_DENIED = 103
APP_SYNTHETIC = 104
APP_ANNUAL = 105

S_SCREEN = 7_100_000_000_001
S_PHASE_2 = 7_100_000_000_002
S_OFFER_SCREEN = 7_100_000_000_003
S_OFFER = 7_100_000_000_004
S_DENIED = 7_100_000_000_005
S_ANNUAL_OFFER = 7_100_000_000_006


async def _seed_r1_shape(db_session: AsyncSession) -> None:
    offer_day = date(2025, 8, 31)
    denied_day = date(2025, 8, 20)
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(APP_OPEN, application_date=date(2025, 8, 1)),
        ts.application(
            APP_OFFER,
            application_date=date(2025, 8, 2),
            currency=Currency.EUR,
            salary_period=SalaryPeriod.MONTHLY,
            finalized_at=ts.closed_at(offer_day),
        ),
        ts.application(
            APP_DENIED,
            application_date=date(2025, 8, 3),
            finalized_at=ts.closed_at(denied_day),
        ),
        ts.application(
            APP_SYNTHETIC,
            application_date=date(2025, 8, 4),
            finalized_at=ts.closed_at(date(2025, 8, 25)),
        ),
        ts.application(APP_ANNUAL, application_date=date(2025, 8, 5)),
        # APP_OPEN: two migrated steps, ids kept.
        ts.event(
            S_SCREEN,
            APP_OPEN,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            event_date=date(2025, 8, 8),
            start_time=time(14, 0),
            end_time=time(14, 45),
            timezone='America/Sao_Paulo',
            observation='Recruiter call',
        ),
        ts.event(
            S_PHASE_2,
            APP_OPEN,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.UNKNOWN,
            event_date=date(2025, 8, 12),
        ),
        # APP_OFFER: finalized with Offer + Accepted + 5000.
        ts.event(
            S_OFFER_SCREEN,
            APP_OFFER,
            event_type=EventType.INTERVIEW,
            interview_type=InterviewType.INITIAL_SCREENING,
            event_date=date(2025, 8, 10),
        ),
        ts.event(
            S_OFFER,
            APP_OFFER,
            event_type=EventType.OFFER,
            event_date=offer_day,
            observation='Great team\n\nFeedback: Accepted',
            **ts.offer_salary('5000.00', Currency.EUR, SalaryPeriod.MONTHLY),
        ),
        # APP_DENIED: finalized with Denied + Ghost.
        ts.event(
            S_DENIED,
            APP_DENIED,
            event_type=EventType.DENIED,
            event_date=denied_day,
            observation='Feedback: Ghost',
        ),
        # APP_SYNTHETIC: R1's synthetic terminal event, id = application id.
        ts.event(
            APP_SYNTHETIC,
            APP_SYNTHETIC,
            event_type=EventType.OFFER,
            event_date=date(2025, 8, 25),
            observation='Feedback: Accepted',
            **ts.offer_salary('0'),
        ),
    )
    # The legacy ANNUAL label, written the way pre-B code left it; the ORM
    # can no longer write it.
    await db_session.execute(
        text(
            "UPDATE applications SET salary_period = 'ANNUAL', "
            "currency = 'USD' WHERE id = :id"
        ),
        {'id': APP_ANNUAL},
    )
    await db_session.execute(
        text(
            'INSERT INTO timeline_events (id, application_id, user_id, '
            'event_type, event_date, salary_amount, salary_currency, '
            'salary_period, created_at) VALUES (:id, :app, :user, '
            "'offer', :day, 90000, 'USD', 'ANNUAL', now())"
        ),
        {
            'id': S_ANNUAL_OFFER,
            'app': APP_ANNUAL,
            'user': ts.USER_ID,
            'day': date(2025, 8, 30),
        },
    )
    await db_session.execute(
        text("UPDATE users SET salary_period = 'ANNUAL' WHERE id = :id"),
        {'id': ts.USER_ID},
    )
    await db_session.commit()


def _by_id(rows: list[dict]) -> dict[str, dict]:
    return {row['id']: row for row in rows}


async def test_migrated_steps_are_events_that_kept_their_ids(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Criterion 13."""
    await _seed_r1_shape(db_session)

    response = await async_client.get(f'/applications/{APP_OPEN}/timeline')

    assert response.status_code == 200
    screen, phase_2 = response.json()
    assert screen['id'] == str(S_SCREEN)
    assert screen['event_type'] == 'interview'
    assert screen['interview_type'] == 'initial_screening'
    assert screen['event_date'] == '2025-08-08'
    assert (screen['start_time'], screen['end_time']) == ('14:00:00', '14:45:00')
    assert screen['timezone'] == 'America/Sao_Paulo'
    assert screen['observation'] == 'Recruiter call'
    assert phase_2['id'] == str(S_PHASE_2)
    assert phase_2['interview_type'] == 'unknown'


async def test_migrated_steps_keep_their_ids_on_the_compat_route(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Criterion 13 for 0.1.4: the same ids, the same steps."""
    await _seed_r1_shape(db_session)

    steps = (await async_client.get(f'/applications/{APP_OPEN}/steps')).json()

    assert [(s['id'], s['step_name']) for s in steps] == [
        (str(S_SCREEN), 'Initial Screen'),
        (str(S_PHASE_2), 'Phase 2'),
    ]
    assert steps[0]['start_time'] == '14:00:00'

    edited = await async_client.put(
        f'/applications/{APP_OPEN}/steps/{S_PHASE_2}',
        json={
            'step_id': steps[1]['step_id'],
            'step_date': '2025-08-13',
            'observation': 'edited by 0.1.4',
        },
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()['id'] == str(S_PHASE_2)


async def test_applications_finalized_before_the_switch_read_closed_with_outcome(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Criteria 14 and 18: closed, outcome and salary on the timeline, and
    the 0.1.4 fields derived from it."""
    await _seed_r1_shape(db_session)

    apps = _by_id((await async_client.get('/applications')).json())

    offer = apps[str(APP_OFFER)]
    assert offer['finalized'] is True
    assert offer['finalized_at'].startswith('2025-08-31T00:00:00')
    assert offer['last_step']['id'] == str(ts.STEP_OFFER)
    assert offer['last_step']['name'] == 'Offer'
    assert offer['last_step']['date'] == '2025-08-31'
    assert offer['salary_offer'] == 5000.0
    assert offer['feedback'] is None

    denied = apps[str(APP_DENIED)]
    assert denied['finalized'] is True
    assert denied['last_step']['name'] == 'Denied'
    assert denied['salary_offer'] is None

    synthetic = apps[str(APP_SYNTHETIC)]
    assert synthetic['finalized'] is True
    assert synthetic['last_step']['name'] == 'Offer'
    assert synthetic['salary_offer'] == 0.0

    still_open = apps[str(APP_OPEN)]
    assert still_open['finalized'] is False
    assert still_open['finalized_at'] is None
    assert still_open['last_step']['name'] == 'Phase 2'
    assert still_open['last_step']['date'] == '2025-08-12'

    events = (
        await async_client.get(f'/applications/{APP_OFFER}/timeline')
    ).json()
    outcome = events[-1]
    assert outcome['id'] == str(S_OFFER)
    assert outcome['event_type'] == 'offer'
    assert outcome['observation'].endswith('Feedback: Accepted')
    assert (
        outcome['salary_amount'],
        outcome['salary_currency'],
        outcome['salary_period'],
    ) == ('5000.00', 'EUR', 'monthly')


async def test_a_closed_migrated_application_is_read_only_until_reopened(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_r1_shape(db_session)
    url = f'/applications/{APP_DENIED}/timeline'
    note = {'event_type': 'interview', 'event_date': '2025-08-21'}

    refused = await async_client.post(url, json=note)
    await async_client.post(f'/applications/{APP_DENIED}/reopen')
    accepted = await async_client.post(url, json=note)

    assert (refused.status_code, accepted.status_code) == (409, 201)


async def test_legacy_annual_label_reads_as_annually_everywhere(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Criterion 30, read side: the API never returns `annual`."""
    await _seed_r1_shape(db_session)

    apps = _by_id((await async_client.get('/applications')).json())
    events = (
        await async_client.get(f'/applications/{APP_ANNUAL}/timeline')
    ).json()
    profile = await async_client.patch('/users/me', json={})

    assert apps[str(APP_ANNUAL)]['salary_period'] == 'annually'
    assert apps[str(APP_ANNUAL)]['salary_offer'] == 90000.0
    assert events[0]['salary_period'] == 'annually'
    assert profile.status_code == 200
    assert profile.json()['salary_period'] == 'annually'


async def test_annual_input_is_stored_as_annually(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Criterion 30, write side: `annual` in, ANNUALLY stored, annually out,
    and a new currency is accepted. A legacy ANNUAL row the update does not
    change keeps its label (it already reads as annually); remapping the
    rows is R2's job."""
    await _seed_r1_shape(db_session)
    url = f'/applications/{APP_ANNUAL}'
    body = {
        'company': str(1),
        'role': 'Software Engineer',
        'mode': 'active',
        'platform_id': '1',
        'application_date': '2025-08-05',
        'currency': 'NZD',
    }

    async def label() -> str | None:
        return await db_session.scalar(
            text('SELECT salary_period::text FROM applications WHERE id = :id'),
            {'id': APP_ANNUAL},
        )

    unchanged = await async_client.put(
        url, json={**body, 'salary_period': 'annual'}
    )
    assert unchanged.status_code == 200, unchanged.text
    assert unchanged.json()['salary_period'] == 'annually'
    assert unchanged.json()['currency'] == 'NZD'
    assert await label() == 'ANNUAL'

    await async_client.put(url, json={**body, 'salary_period': 'monthly'})
    rewritten = await async_client.put(
        url, json={**body, 'salary_period': 'annual'}
    )

    assert rewritten.json()['salary_period'] == 'annually'
    assert await label() == 'ANNUALLY'
    # The derived legacy field still comes from the (untouched) offer event.
    assert rewritten.json()['salary_offer'] == 90000.0


async def test_statistics_on_migrated_data(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-022 on R1-shaped rows: offers = applications with an offer event."""
    await _seed_r1_shape(db_session)

    stats = (await async_client.get('/applications/statistics')).json()

    assert stats['total_applications'] == 5
    assert stats['offers'] == 3  # APP_OFFER, APP_SYNTHETIC, APP_ANNUAL
    assert stats['denials'] == 1
    assert stats['success_rate'] == 60.0


def test_seed_amounts_are_decimal_safe():
    assert ts.offer_salary('5000.00')['salary_amount'] == Decimal('5000.00')
