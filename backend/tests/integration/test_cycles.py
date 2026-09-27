from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel, CycleModel
from tests import msg
from tests.base_db_setup import base_data


def _make_apps(count: int) -> list[ApplicationModel]:
    """Create N current-cycle ApplicationModel instances."""
    bd = base_data()
    return [
        ApplicationModel(
            id=i + 1,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=None,
            company_name=f'Company {i}',
            role='Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
        )
        for i in range(count)
    ]


# ---------------------------------------------------------------------------
# CREATE cycle (reset)
# ---------------------------------------------------------------------------


async def test_create_cycle(
    async_client: AsyncClient, db_session: AsyncSession
):
    db_session.add_all(_make_apps(10))
    await db_session.commit()

    response = await async_client.post(
        '/cycles', json={'name': 'Cycle Q1 2026'}
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['name'] == 'Cycle Q1 2026', msg('Cycle Q1 2026', data['name'])
    assert 'id' in data

    # After reset, current applications should be empty
    apps_response = await async_client.get('/applications')
    assert apps_response.status_code == 200
    assert apps_response.json() == [], msg(
        'empty list after reset', apps_response.json()
    )

    # Old apps should be visible with cycle_id filter
    cycle_id = data['id']
    old_apps = await async_client.get(f'/applications?cycle_id={cycle_id}')
    assert old_apps.status_code == 200
    assert len(old_apps.json()) == 10, msg(10, len(old_apps.json()))


async def test_create_cycle_rejected_below_minimum(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Creating a cycle with fewer than 10 apps should return 422."""
    db_session.add_all(_make_apps(5))
    await db_session.commit()

    response = await async_client.post('/cycles', json={'name': 'Too Early'})

    assert response.status_code == 422, msg(422, response.status_code)
    assert 'At least 10' in response.json()['detail']


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
        CycleModel(id=1, user_id=base_data()['user'].id, name='First Cycle'),
        CycleModel(id=2, user_id=base_data()['user'].id, name='Second Cycle'),
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


# ---------------------------------------------------------------------------
# Drafts are never archived (KODI-032, ADR-0014)
# ---------------------------------------------------------------------------


async def test_create_cycle_never_archives_a_draft(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A draft does not count toward the 10-application minimum and is
    never swept into the new cycle - it stays open on the current board."""
    bd = base_data()
    apps = _make_apps(10)
    draft = ApplicationModel(
        id=9999,
        user_id=bd['user'].id,
        platform_id=bd['plat_linkedin'].id,
        company_id=None,
        company_name='Draft Co',
        role='Draft Role',
        mode='active',
        application_date=date(2025, 12, 1),
        is_draft=True,
    )
    db_session.add_all([*apps, draft])
    await db_session.commit()

    response = await async_client.post(
        '/cycles', json={'name': 'Cycle Q1 2026'}
    )
    assert response.status_code == 201, msg(201, response.text)
    cycle_id = response.json()['id']

    await db_session.refresh(draft)
    assert draft.cycle_id is None, msg(None, draft.cycle_id)
    assert draft.is_draft is True

    archived = await async_client.get(f'/applications?cycle_id={cycle_id}')
    assert len(archived.json()) == 10, msg(10, len(archived.json()))

    current = await async_client.get('/applications')
    assert current.json() == [], msg([], current.json())

    drafts = await async_client.get('/applications/drafts')
    assert len(drafts.json()) == 1, msg(1, len(drafts.json()))


async def test_create_cycle_with_nine_apps_and_a_draft_is_still_rejected(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A draft never counts toward the 10-application minimum: 9 real
    applications plus 1 draft must still be refused, exactly like 9 real
    applications alone."""
    bd = base_data()
    apps = _make_apps(9)
    draft = ApplicationModel(
        id=8888,
        user_id=bd['user'].id,
        platform_id=bd['plat_linkedin'].id,
        company_id=None,
        company_name='Draft Co',
        role='Draft Role',
        mode='active',
        application_date=date(2025, 12, 1),
        is_draft=True,
    )
    db_session.add_all([*apps, draft])
    await db_session.commit()

    response = await async_client.post('/cycles', json={'name': 'Too Early'})

    assert response.status_code == 422, msg(422, response.status_code)
    assert 'At least 10' in response.json()['detail']
