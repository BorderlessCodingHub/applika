"""Integration tests for DELETE /cycles/{cycle_id} endpoint."""

from datetime import date, datetime, timezone
from decimal import Decimal

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import (
    ApplicationModel,
    ApplicationStepModel,
    CycleModel,
    QuinzenalReportModel,
    StepDefinitionModel,
)
from tests import msg
from tests.base_db_setup import base_data


def _make_report(**kwargs):
    defaults = dict(
        start_date=date(2025, 12, 1),
        phase=1,
        applications_count=0,
        callback_rate=Decimal('0.00'),
        initial_screenings_count=0,
        interviews_completed_fortnight=0,
        active_processes_count=0,
        offers_count=0,
        offer_rate=Decimal('0.00'),
        total_applications_count=0,
        overall_conversion_rate=Decimal('0.00'),
        total_initial_screenings_count=0,
        mock_interviews_count=0,
        linkedin_posts_count=0,
        strategic_connections_count=0,
        biggest_win='Win',
        biggest_challenge='Challenge',
        next_fortnight_goal='Goal',
        submitted_at=datetime.now(timezone.utc),
        discord_posted=False,
    )
    defaults.update(kwargs)
    return QuinzenalReportModel(**defaults)


async def _seed_cycle_with_data(db_session: AsyncSession) -> int:
    """Create a cycle with applications (including steps) and reports.
    Returns the cycle_id."""
    bd = base_data()
    cycle = CycleModel(id=100, user_id=bd['user'].id, name='Old Cycle')
    db_session.add(cycle)

    # Step definition
    db_session.add(
        StepDefinitionModel(
            id=1, name='Applied', color='#aaa', strict=False
        )
    )

    # 3 applications in this cycle
    apps = [
        ApplicationModel(
            id=200 + i,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=None,
            company_name=f'Company {i}',
            role='Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
            cycle_id=100,
        )
        for i in range(3)
    ]
    db_session.add_all(apps)

    # Application steps for first app
    db_session.add(
        ApplicationStepModel(
            id=300,
            application_id=200,
            step_id=1,
            step_date=date(2025, 12, 2),
            user_id=bd['user'].id,
        )
    )

    # 1 report in this cycle
    db_session.add(
        _make_report(
            id=400,
            user_id=bd['user'].id,
            report_day=14,
            cycle_id=100,
        )
    )

    await db_session.commit()
    return 100


async def test_delete_cycle_removes_all_data(
    async_client: AsyncClient, db_session: AsyncSession
):
    cycle_id = await _seed_cycle_with_data(db_session)

    response = await async_client.delete(f'/cycles/{cycle_id}')
    assert response.status_code == 204, msg(204, response.status_code)

    # Verify cycle is gone
    cycle = await db_session.scalar(
        select(CycleModel).where(CycleModel.id == cycle_id)
    )
    assert cycle is None, 'Cycle should be deleted'

    # Verify applications are gone
    app_count = await db_session.scalar(
        select(func.count(ApplicationModel.id)).where(
            ApplicationModel.cycle_id == cycle_id
        )
    )
    assert app_count == 0, msg(0, app_count)

    # Verify application steps are gone
    step_count = await db_session.scalar(
        select(func.count(ApplicationStepModel.id)).where(
            ApplicationStepModel.application_id.in_(
                select(ApplicationModel.id).where(
                    ApplicationModel.cycle_id == cycle_id
                )
            )
        )
    )
    assert step_count == 0, msg(0, step_count)

    # Verify reports are gone
    report_count = await db_session.scalar(
        select(func.count(QuinzenalReportModel.id)).where(
            QuinzenalReportModel.cycle_id == cycle_id
        )
    )
    assert report_count == 0, msg(0, report_count)


async def test_delete_cycle_does_not_affect_current_data(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Deleting a past cycle should not touch current-cycle data."""
    bd = base_data()
    cycle_id = await _seed_cycle_with_data(db_session)

    # Add a current-cycle application (cycle_id = NULL)
    db_session.add(
        ApplicationModel(
            id=500,
            user_id=bd['user'].id,
            platform_id=bd['plat_linkedin'].id,
            company_id=None,
            company_name='Current Co',
            role='Dev',
            mode='active',
            application_date=date(2026, 1, 1),
            cycle_id=None,
        )
    )
    await db_session.commit()

    response = await async_client.delete(f'/cycles/{cycle_id}')
    assert response.status_code == 204

    # Current app should still exist
    current_apps = await async_client.get('/applications')
    assert current_apps.status_code == 200
    assert len(current_apps.json()) == 1, msg(1, len(current_apps.json()))
    assert current_apps.json()[0]['company_name'] == 'Current Co'


async def test_delete_cycle_not_found(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.delete('/cycles/999999')
    assert response.status_code == 404, msg(404, response.status_code)


async def test_delete_cycle_not_visible_in_list(
    async_client: AsyncClient, db_session: AsyncSession
):
    """After deletion, the cycle should not appear in GET /cycles."""
    cycle_id = await _seed_cycle_with_data(db_session)

    # Verify it exists first
    list_before = await async_client.get('/cycles')
    assert len(list_before.json()) == 1

    await async_client.delete(f'/cycles/{cycle_id}')

    list_after = await async_client.get('/cycles')
    assert list_after.json() == [], msg('empty list', list_after.json())
