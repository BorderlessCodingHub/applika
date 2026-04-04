from datetime import date, timedelta

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    StepDefinitionModel,
)
from tests import msg
from tests.base_db_setup import base_data


async def _seed_stats_data(db_session: AsyncSession):
    """Seed applications, steps, and step definitions for stats tests."""
    today = date.today()
    db_session.add_all([
        StepDefinitionModel(
            id=1, name='Initial Screen', color='#a892d3', strict=False
        ),
        StepDefinitionModel(
            id=2, name='Phase 2', color='#9373d3', strict=False
        ),
        StepDefinitionModel(
            id=3, name='Offer', color='#31d845', strict=True
        ),
        StepDefinitionModel(
            id=4, name='Denied', color='#a80000', strict=True
        ),
    ])
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=today - timedelta(days=5),
            feedback_id=base_data()['fb_denied'].id,
            feedback_date=today,
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=None,
            company_name='Beta Inc',
            role='Backend Engineer',
            mode='passive',
            application_date=today - timedelta(days=3),
        ),
        ApplicationModel(
            id=3,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            company_name='Acme Corp',
            role='Frontend Engineer',
            mode='active',
            application_date=today,
        ),
    ])
    db_session.add_all([
        ApplicationStepModel(
            id=1,
            application_id=1,
            step_id=1,
            step_date=today - timedelta(days=3),
            user_id=base_data()['user'].id,
        ),
        ApplicationStepModel(
            id=2,
            application_id=1,
            step_id=3,
            step_date=today,
            user_id=base_data()['user'].id,
        ),
        ApplicationStepModel(
            id=3,
            application_id=2,
            step_id=1,
            step_date=today - timedelta(days=1),
            user_id=base_data()['user'].id,
        ),
    ])
    await db_session.commit()


# ---------------------------------------------------------------------------
# General statistics
# ---------------------------------------------------------------------------

async def test_general_statistics(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['total_applications'] == 3, msg(3, data['total_applications'])
    assert data['offers'] >= 0
    assert 'success_rate' in data
    assert 'denials' in data


async def test_general_statistics_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.get('/applications/statistics')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['total_applications'] == 0, msg(
        0, data['total_applications']
    )


# ---------------------------------------------------------------------------
# Conversion rate
# ---------------------------------------------------------------------------

async def test_step_conversion_rate(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get(
        '/applications/statistics/steps/conversion_rate'
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)
    for item in data:
        assert 'name' in item
        assert 'conversion_rate' in item
        assert 'total_applications' in item


# ---------------------------------------------------------------------------
# Average days per step
# ---------------------------------------------------------------------------

async def test_step_average_days(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get(
        '/applications/statistics/steps/avarage_days'
    )

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)
    for item in data:
        assert 'name' in item
        assert 'average_days' in item


# ---------------------------------------------------------------------------
# Platform stats
# ---------------------------------------------------------------------------

async def test_platform_stats(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/platforms')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)
    assert len(data) >= 1


# ---------------------------------------------------------------------------
# Mode stats
# ---------------------------------------------------------------------------

async def test_mode_stats(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/mode')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['active'] == 2, msg(2, data['active'])
    assert data['passive'] == 1, msg(1, data['passive'])


# ---------------------------------------------------------------------------
# Trends
# ---------------------------------------------------------------------------

async def test_trends(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_stats_data(db_session)

    response = await async_client.get('/applications/statistics/trends')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list)
