from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel
from app.tests import msg
from app.tests.base_db_setup import base_data


async def test_create_application(
        async_client: AsyncClient, db_session: AsyncSession):
    # Arrange: prepare test data
    payload = {
        "company": "Applika Inc",
        "role": "Software Engineer",
        "mode": "active",
        "platform_id": base_data()["plat_linkedin"].id,
        "application_date": "2025-12-01",
        "link_to_job": "https://example.com/job/1",
        "observation": "Applied via referral",
        "expected_salary": 85000.0,
        "salary_range_min": 80000.0,
        "salary_range_max": 90000.0
    }

    # Act: call the endpoint
    response = await async_client.post("/applications", json=payload)

    # Assert: verify the response
    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data["company"] == payload["company"], \
        msg(payload["company"], data["company"])
    assert data["role"] == payload["role"], \
        msg(payload["role"], data["role"])
    assert data["link_to_job"] == payload["link_to_job"], \
        msg(payload["link_to_job"], data["link_to_job"])


async def test_list_applications(
        async_client: AsyncClient, db_session: AsyncSession):
    # Arrange: create test data
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()["user"].id,
            platform_id=base_data()["fb_denied"].id,
            company="Applika Inc",
            role="Software Engineer",
            mode="active",
            application_date=date(2025, 12, 1),
            feedback_id=1,
            feedback_date=date(2025, 12, 2)
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()["user"].id,
            platform_id=base_data()["fb_denied"].id,
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
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list), msg("list", type(data))
    assert len(data) == 2, msg(2, len(data))
    # Active application first
    assert data[0]["id"] == 2, msg(2, data[0]["id"])
    # Finalized application second
    assert data[1]["id"] == 1, msg(1, data[1]["id"])


async def test_delete_application(
        async_client: AsyncClient, db_session: AsyncSession):
    # Arrange: create test data
    application = ApplicationModel(
        id=1,
        user_id=base_data()["user"].id,
        platform_id=base_data()["fb_denied"].id,
        company="Applika Inc",
        role="Software Engineer",
        mode="active",
        application_date=date(2025, 12, 1)
    )
    db_session.add(application)
    await db_session.commit()

    # Act: call the endpoint
    response = await async_client.delete("/applications/1")

    # Assert: verify the response
    assert response.status_code == 204, msg(204, response.status_code)

    # Ensure the session expires cached state so we read fresh data from the DB
    await db_session.run_sync(lambda s: s.expire_all())

    # Verify the application is deleted
    deleted_application = await db_session.get(ApplicationModel, 1)
    assert deleted_application is None, msg("None", deleted_application)
