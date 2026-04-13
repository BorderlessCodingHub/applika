from datetime import date, time

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    StepDefinitionModel,
)
from tests import msg
from tests.base_db_setup import base_data


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _seed_app_and_steps(db_session: AsyncSession):
    """Seed an application with step definitions."""
    db_session.add_all([
        StepDefinitionModel(
            id=1, name='Applied', color='#007bff', strict=False
        ),
        StepDefinitionModel(
            id=2, name='Interview', color='#17a2b8', strict=False
        ),
        StepDefinitionModel(
            id=3, name='Offer', color='#28a745', strict=True
        ),
    ])
    db_session.add(ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        company_name='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    ))
    await db_session.commit()


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


async def test_list_steps_returns_existing(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    response = await async_client.get('/applications/1/steps')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 1, msg(1, len(data))
    assert data[0]['step_id'] == '1', msg('1', data[0]['step_id'])


async def test_list_steps_for_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/applications/999/steps')

    assert response.status_code == 404, msg(404, response.status_code)


# ---------------------------------------------------------------------------
# CREATE step
# ---------------------------------------------------------------------------

async def test_create_step(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'observation': 'Phone screen done',
    }
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['step_id'] == '1', msg('1', data['step_id'])
    assert data['step_name'] == 'Applied', msg('Applied', data['step_name'])
    assert data['observation'] == 'Phone screen done'


async def test_create_step_strict_step_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Non-strict-only steps should not be created via this endpoint."""
    await _seed_app_and_steps(db_session)

    payload = {'step_id': 3, 'step_date': '2025-12-05'}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 404, msg(404, response.status_code)


async def test_create_step_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {'step_id': 1, 'step_date': '2025-12-05'}
    response = await async_client.post(
        '/applications/999/steps', json=payload
    )

    assert response.status_code == 404, msg(404, response.status_code)


async def test_create_step_on_finalized_app_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    # Finalize the application
    app_model = await db_session.get(ApplicationModel, 1)
    app_model.feedback_id = base_data()['fb_denied'].id
    app_model.feedback_date = date(2025, 12, 10)
    await db_session.commit()

    payload = {'step_id': 1, 'step_date': '2025-12-05'}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 409, msg(409, response.status_code)


# ---------------------------------------------------------------------------
# UPDATE step
# ---------------------------------------------------------------------------

async def test_update_step(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    payload = {
        'step_id': 2,
        'step_date': '2025-12-08',
        'observation': 'Updated to interview',
    }
    response = await async_client.put(
        '/applications/1/steps/1', json=payload
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['step_id'] == '2', msg('2', data['step_id'])
    assert data['step_name'] == 'Interview'
    assert data['observation'] == 'Updated to interview'


async def test_update_step_nonexistent_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {'step_id': 1, 'step_date': '2025-12-05'}
    response = await async_client.put(
        '/applications/1/steps/999', json=payload
    )

    assert response.status_code == 404, msg(404, response.status_code)


# ---------------------------------------------------------------------------
# DELETE step
# ---------------------------------------------------------------------------

async def test_delete_step(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    response = await async_client.delete('/applications/1/steps/1')

    assert response.status_code == 204, msg(204, response.status_code)


async def test_delete_step_nonexistent_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    response = await async_client.delete('/applications/1/steps/999')

    assert response.status_code == 404, msg(404, response.status_code)


async def test_delete_step_on_finalized_app_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    app_model = await db_session.get(ApplicationModel, 1)
    app_model.feedback_id = base_data()['fb_denied'].id
    app_model.feedback_date = date(2025, 12, 10)
    await db_session.commit()

    response = await async_client.delete('/applications/1/steps/1')

    assert response.status_code == 409, msg(409, response.status_code)


# ---------------------------------------------------------------------------
# Time range validation (CREATE)
# ---------------------------------------------------------------------------

async def test_create_step_with_both_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '09:00',
        'end_time': '10:00',
    }
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['start_time'] == '09:00:00', msg('09:00:00', data['start_time'])
    assert data['end_time'] == '10:00:00', msg('10:00:00', data['end_time'])


async def test_create_step_with_no_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {'step_id': 1, 'step_date': '2025-12-05'}
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['start_time'] is None
    assert data['end_time'] is None


async def test_create_step_only_start_time_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '09:00',
    }
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_create_step_only_end_time_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'end_time': '10:00',
    }
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_create_step_end_time_before_start_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '14:00',
        'end_time': '10:00',
    }
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_create_step_equal_times_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '10:00',
        'end_time': '10:00',
    }
    response = await async_client.post(
        '/applications/1/steps', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


# ---------------------------------------------------------------------------
# Time range validation (UPDATE)
# ---------------------------------------------------------------------------

async def test_update_step_with_both_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '09:00',
        'end_time': '10:00',
    }
    response = await async_client.put(
        '/applications/1/steps/1', json=payload
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['start_time'] == '09:00:00', msg('09:00:00', data['start_time'])
    assert data['end_time'] == '10:00:00', msg('10:00:00', data['end_time'])


async def test_update_step_only_start_time_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '09:00',
    }
    response = await async_client.put(
        '/applications/1/steps/1', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_step_only_end_time_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'end_time': '10:00',
    }
    response = await async_client.put(
        '/applications/1/steps/1', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_step_end_before_start_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': '14:00',
        'end_time': '10:00',
    }
    response = await async_client.put(
        '/applications/1/steps/1', json=payload
    )

    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_step_clear_times_succeeds(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_app_and_steps(db_session)
    db_session.add(ApplicationStepModel(
        id=1,
        application_id=1,
        step_id=1,
        step_date=date(2025, 12, 5),
        start_time=time(9, 0),
        end_time=time(10, 0),
        user_id=base_data()['user'].id,
    ))
    await db_session.commit()

    payload = {
        'step_id': 1,
        'step_date': '2025-12-05',
        'start_time': None,
        'end_time': None,
    }
    response = await async_client.put(
        '/applications/1/steps/1', json=payload
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['start_time'] is None
    assert data['end_time'] is None
