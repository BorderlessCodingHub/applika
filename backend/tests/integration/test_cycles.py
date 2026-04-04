from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel, CycleModel
from tests import msg
from tests.base_db_setup import base_data


# ---------------------------------------------------------------------------
# CREATE cycle (reset)
# ---------------------------------------------------------------------------

async def test_create_cycle(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Seed some current-cycle applications
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=None,
            company_name='Beta Inc',
            role='Backend',
            mode='passive',
            application_date=date(2025, 12, 5),
        ),
    ])
    await db_session.commit()

    response = await async_client.post(
        '/cycles', json={'name': 'Cycle Q1 2026'}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['name'] == 'Cycle Q1 2026', msg(
        'Cycle Q1 2026', data['name']
    )
    assert 'id' in data

    # After reset, current applications should be empty
    apps_response = await async_client.get('/applications')
    assert apps_response.status_code == 200
    assert apps_response.json() == [], msg(
        'empty list after reset', apps_response.json()
    )

    # Old apps should be visible with cycle_id filter
    cycle_id = data['id']
    old_apps = await async_client.get(
        f'/applications?cycle_id={cycle_id}'
    )
    assert old_apps.status_code == 200
    assert len(old_apps.json()) == 2, msg(2, len(old_apps.json()))


async def test_create_cycle_empty_state(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Creating a cycle with no current apps should still work."""
    response = await async_client.post(
        '/cycles', json={'name': 'Empty Cycle'}
    )

    assert response.status_code == 201, msg(201, response.status_code)


# ---------------------------------------------------------------------------
# LIST cycles
# ---------------------------------------------------------------------------

async def test_list_cycles_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/cycles')

    assert response.status_code == 200, msg(200, response.status_code)
    assert response.json() == [], msg([], response.json())


async def test_list_cycles_returns_existing(
    async_client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all([
        CycleModel(
            id=1, user_id=base_data()['user'].id, name='First Cycle'
        ),
        CycleModel(
            id=2, user_id=base_data()['user'].id, name='Second Cycle'
        ),
    ])
    await db_session.commit()

    response = await async_client.get('/cycles')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 2, msg(2, len(data))
    # Ordered by created_at DESC — newest first
    names = [c['name'] for c in data]
    assert 'First Cycle' in names
    assert 'Second Cycle' in names
