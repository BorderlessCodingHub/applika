from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    FeedbackDefinitionModel,
    StepDefinitionModel,
)
from tests import msg
from tests.base_db_setup import base_data


async def _seed_finalize_data(db_session: AsyncSession):
    """Seed application, strict step, and feedback for finalize tests."""
    db_session.add_all([
        StepDefinitionModel(
            id=1, name='Applied', color='#007bff', strict=False
        ),
        StepDefinitionModel(
            id=2, name='Offer', color='#28a745', strict=True
        ),
        StepDefinitionModel(
            id=3, name='Denied', color='#a80000', strict=True
        ),
        FeedbackDefinitionModel(id=2, name='Accepted', color='#28a745'),
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
# Finalize application
# ---------------------------------------------------------------------------

async def test_finalize_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_finalize_data(db_session)

    payload = {
        'step_id': 2,
        'feedback_id': 2,
        'finalize_date': '2025-12-15',
        'salary_offer': 95000.0,
        'observation': 'Great offer!',
    }
    response = await async_client.post(
        '/applications/1/finalize', json=payload
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['finalized'] is True, msg(True, data['finalized'])
    assert data['salary_offer'] == 95000.0


async def test_finalize_already_finalized_returns_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_finalize_data(db_session)
    # Finalize once
    app_model = await db_session.get(ApplicationModel, 1)
    app_model.feedback_id = base_data()['fb_denied'].id
    app_model.feedback_date = date(2025, 12, 10)
    await db_session.commit()

    payload = {
        'step_id': 2,
        'feedback_id': 2,
        'finalize_date': '2025-12-15',
    }
    response = await async_client.post(
        '/applications/1/finalize', json=payload
    )

    assert response.status_code == 409, msg(409, response.status_code)


async def test_finalize_nonexistent_app_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_finalize_data(db_session)

    payload = {
        'step_id': 2,
        'feedback_id': 2,
        'finalize_date': '2025-12-15',
    }
    response = await async_client.post(
        '/applications/999/finalize', json=payload
    )

    assert response.status_code == 404, msg(404, response.status_code)


async def test_finalize_with_non_strict_step_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Finalize requires a strict step (e.g., Offer/Denied)."""
    await _seed_finalize_data(db_session)

    payload = {
        'step_id': 1,  # non-strict step
        'feedback_id': 2,
        'finalize_date': '2025-12-15',
    }
    response = await async_client.post(
        '/applications/1/finalize', json=payload
    )

    assert response.status_code == 404, msg(404, response.status_code)


async def test_finalize_with_invalid_feedback_returns_404(
    async_client: AsyncClient, db_session: AsyncSession
):
    await _seed_finalize_data(db_session)

    payload = {
        'step_id': 2,
        'feedback_id': 999,
        'finalize_date': '2025-12-15',
    }
    response = await async_client.post(
        '/applications/1/finalize', json=payload
    )

    assert response.status_code == 404, msg(404, response.status_code)
