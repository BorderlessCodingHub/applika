from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel
from app.tests.base_db_setup import base_data


async def test_list_applications(
        async_client: AsyncClient, db_session: AsyncSession):
    # Arrange: create test data
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data.user.id,
            platform_id=base_data.fb_denied.id,
            company="Applika Inc",
            role="Software Engineer",
            mode="active",
            application_date=date(2025, 12, 1),
            feedback_id=1,
            feedback_date=date(2025, 12, 2)
        ),
        ApplicationModel(
            id=2,
            user_id=base_data.user.id,
            platform_id=base_data.fb_denied.id,
            company="Applika Inc",
            role="Fullstack Engineer",
            mode="active",
            application_date=date(2025, 12, 12)
        ),
    ])
    await db_session.commit()

    # Act: call the endpoint
    response = await async_client.get("/applications")

    # Assert: verify the response
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert data[0]["id"] == 2  # Active application first
    assert data[1]["id"] == 1  # Finalized application second
