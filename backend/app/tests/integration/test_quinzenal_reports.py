from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    FeedbackDefinitionModel,
    StepDefinitionModel,
)
from app.tests import msg
from app.tests.base_db_setup import base_data


def _payload(start_date: str | None = None) -> dict:
    payload = {
        'mock_interviews_count': 2,
        'linkedin_posts_count': 4,
        'strategic_connections_count': 15,
        'biggest_win': 'First technical interview passed!',
        'biggest_challenge': 'System Design difficulty',
        'next_fortnight_goal': 'Do 3 System Design focused mocks',
    }
    if start_date is not None:
        payload['start_date'] = start_date
    return payload


async def test_list_reports(async_client: AsyncClient):
    response = await async_client.get('/reports')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data['reports']) == 10, msg(10, len(data['reports']))
    assert data['reports'][0]['day'] == 1, msg(1, data['reports'][0]['day'])
    assert data['reports'][0]['status'] == 'pending', msg(
        'pending', data['reports'][0]['status']
    )


async def test_submit_day_one_report(async_client: AsyncClient, db_session: AsyncSession):
    today = date.today()
    db_session.add(FeedbackDefinitionModel(id=2, name='On going', color='#47bfd7'))
    db_session.add(
        StepDefinitionModel(
            id=1,
            name='Initial Screen',
            color='#a892d3',
            strict=False,
        )
    )
    db_session.add(
        StepDefinitionModel(id=2, name='Phase 2', color='#9373d3', strict=False)
    )
    db_session.add(
        StepDefinitionModel(id=3, name='Phase 3', color='#7b52cb', strict=False)
    )
    db_session.add(
        StepDefinitionModel(id=5, name='Offer', color='#31d845', strict=True)
    )
    db_session.add(
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            application_date=today,
            company='Acme',
            role='Software Engineer',
            mode='active',
            feedback_id=base_data()['fb_denied'].id,
            feedback_date=today,
        )
    )
    db_session.add(
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            application_date=today,
            company='Beta',
            role='Software Engineer',
            mode='active',
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=1,
            application_id=1,
            step_id=1,
            step_date=today,
            user_id=base_data()['user'].id,
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=2,
            application_id=1,
            step_id=2,
            step_date=today,
            user_id=base_data()['user'].id,
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=3,
            application_id=1,
            step_id=5,
            step_date=today,
            user_id=base_data()['user'].id,
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=4,
            application_id=2,
            step_id=1,
            step_date=today,
            user_id=base_data()['user'].id,
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=5,
            application_id=2,
            step_id=3,
            step_date=today,
            user_id=base_data()['user'].id,
        )
    )
    await db_session.commit()

    response = await async_client.post(
        '/reports/1/submit',
        json=_payload(today.isoformat()),
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['success'] is True, msg(True, data['success'])
    assert isinstance(data['discord_posted'], bool)

    report_response = await async_client.get('/reports/1')
    assert report_response.status_code == 200, msg(200, report_response.status_code)
    report_data = report_response.json()
    assert report_data['report']['submitted'] is True
    assert report_data['metrics']['applications_count'] == 2
    assert report_data['metrics']['initial_screenings_count'] == 2
    assert report_data['metrics']['callback_rate'] == 100
    assert report_data['metrics']['interviews_completed_fortnight'] == 2
    assert report_data['metrics']['active_processes_count'] == 1
    assert report_data['metrics']['offers_count'] == 1
    assert report_data['metrics']['offer_rate'] == 50
    assert report_data['metrics']['total_applications_count'] == 2
    assert report_data['metrics']['total_initial_screenings_count'] == 2
    assert report_data['metrics']['overall_conversion_rate'] == 100


async def test_submit_future_report_is_forbidden(async_client: AsyncClient):
    response = await async_client.post('/reports/14/submit', json=_payload())
    assert response.status_code == 403, msg(403, response.status_code)


async def test_submit_day_one_requires_start_date(async_client: AsyncClient):
    response = await async_client.post('/reports/1/submit', json=_payload())
    assert response.status_code == 400, msg(400, response.status_code)


async def test_submit_same_report_twice_returns_conflict(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    first = await async_client.post(
        '/reports/1/submit',
        json=_payload(date.today().isoformat()),
    )
    assert first.status_code == 200, msg(200, first.status_code)

    second = await async_client.post(
        '/reports/1/submit',
        json=_payload(date.today().isoformat()),
    )
    assert second.status_code == 409, msg(409, second.status_code)


async def test_submit_day_fourteen_when_released(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    start_date = (date.today() - timedelta(days=13)).isoformat()

    first = await async_client.post('/reports/1/submit', json=_payload(start_date))
    assert first.status_code == 200, msg(200, first.status_code)

    second = await async_client.post('/reports/14/submit', json=_payload())
    assert second.status_code == 200, msg(200, second.status_code)


async def test_day_twenty_eight_uses_accumulated_rates(
    async_client: AsyncClient,
    db_session: AsyncSession,
):
    start_date = date.today() - timedelta(days=27)
    fortnight_start = date.today() - timedelta(days=13)

    db_session.add(
        StepDefinitionModel(
            id=1,
            name='Initial Screen',
            color='#a892d3',
            strict=False,
        )
    )
    db_session.add(
        StepDefinitionModel(id=5, name='Offer', color='#31d845', strict=True)
    )
    db_session.add(
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            application_date=start_date + timedelta(days=4),
            company='LegacyCo',
            role='Software Engineer',
            mode='active',
        )
    )
    db_session.add(
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            application_date=fortnight_start + timedelta(days=2),
            company='NewCo',
            role='Software Engineer',
            mode='active',
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=1,
            application_id=1,
            step_id=1,
            step_date=start_date + timedelta(days=6),
            user_id=base_data()['user'].id,
        )
    )
    db_session.add(
        ApplicationStepModel(
            id=2,
            application_id=1,
            step_id=5,
            step_date=fortnight_start + timedelta(days=3),
            user_id=base_data()['user'].id,
        )
    )
    await db_session.commit()

    day_one = await async_client.post(
        '/reports/1/submit',
        json=_payload(start_date.isoformat()),
    )
    assert day_one.status_code == 200, msg(200, day_one.status_code)

    day_fourteen = await async_client.post('/reports/14/submit', json=_payload())
    assert day_fourteen.status_code == 200, msg(200, day_fourteen.status_code)

    day_twenty_eight = await async_client.post('/reports/28/submit', json=_payload())
    assert day_twenty_eight.status_code == 200, msg(
        200, day_twenty_eight.status_code
    )

    report_response = await async_client.get('/reports/28')
    assert report_response.status_code == 200, msg(
        200, report_response.status_code
    )
    report_data = report_response.json()

    assert report_data['metrics']['applications_count'] == 1
    assert report_data['metrics']['initial_screenings_count'] == 0
    assert report_data['metrics']['offers_count'] == 1

    assert report_data['metrics']['total_applications_count'] == 2
    assert report_data['metrics']['total_initial_screenings_count'] == 1
    assert report_data['metrics']['callback_rate'] == 50
    assert report_data['metrics']['offer_rate'] == 100
    assert report_data['metrics']['overall_conversion_rate'] == 50
