from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import Currency, ExperienceLevel, SalaryPeriod, WorkMode
from app.domain.models import ApplicationModel
from tests import msg
from tests.base_db_setup import base_data


async def test_create_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: prepare test data
    payload = {
        'company_id': base_data()['company_acme'].id,
        'old_company': 'Acme Corp',
        'role': 'Software Engineer',
        'mode': 'active',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': '2025-12-01',
        'link_to_job': 'https://example.com/job/1',
        'observation': 'Applied via referral',
        'expected_salary': 85000.0,
        'salary_range_min': 80000.0,
        'salary_range_max': 90000.0,
        'currency': 'USD',
        'salary_period': 'annual',
        'experience_level': 'senior',
        'work_mode': 'remote',
        'country': 'United States',
    }

    # Act: call the endpoint
    response = await async_client.post('/applications', json=payload)

    # Assert: verify the response
    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['company']['id'] == payload['company_id'], msg(
        payload['company_id'], data['company']['id']
    )
    assert data['company']['name'] == 'Acme Corp', msg(
        'Acme Corp', data['company']['name']
    )
    assert data['old_company'] == payload['old_company'], msg(
        payload['old_company'], data['old_company']
    )
    assert data['role'] == payload['role'], msg(payload['role'], data['role'])
    assert data['link_to_job'] == payload['link_to_job'], msg(
        payload['link_to_job'], data['link_to_job']
    )
    assert data['currency'] == 'USD', msg('USD', data['currency'])
    assert data['salary_period'] == 'annual', msg(
        'annual', data['salary_period']
    )
    assert data['experience_level'] == 'senior', msg(
        'senior', data['experience_level']
    )
    assert data['work_mode'] == 'remote', msg('remote', data['work_mode'])
    assert data['country'] == 'United States', msg(
        'United States', data['country']
    )


async def test_create_application_without_optional_enums(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: minimal payload without new enum fields
    payload = {
        'company_id': base_data()['company_acme'].id,
        'old_company': 'Acme Corp',
        'role': 'Backend Developer',
        'mode': 'passive',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': '2025-12-05',
    }

    # Act
    response = await async_client.post('/applications', json=payload)

    # Assert: new fields should be None
    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['currency'] is None, msg(None, data['currency'])
    assert data['salary_period'] is None, msg(None, data['salary_period'])
    assert data['experience_level'] is None, msg(
        None, data['experience_level']
    )
    assert data['work_mode'] is None, msg(None, data['work_mode'])
    assert data['country'] is None, msg(None, data['country'])


async def test_create_application_invalid_enum_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: payload with invalid enum value
    payload = {
        'company_id': base_data()['company_acme'].id,
        'old_company': 'Acme Corp',
        'role': 'Software Engineer',
        'mode': 'active',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': '2025-12-01',
        'currency': 'INVALID',
    }

    # Act
    response = await async_client.post('/applications', json=payload)

    # Assert
    assert response.status_code == 422, msg(422, response.status_code)


async def test_update_application_with_new_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: create an application first
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['plat_linkedin'].id,
        company_id=base_data()['company_acme'].id,
        old_company='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    update_payload = {
        'company_id': base_data()['company_acme'].id,
        'old_company': 'Acme Corp',
        'role': 'Senior Software Engineer',
        'mode': 'active',
        'platform_id': base_data()['plat_linkedin'].id,
        'application_date': '2025-12-01',
        'currency': 'EUR',
        'salary_period': 'monthly',
        'experience_level': 'staff',
        'work_mode': 'hybrid',
        'country': 'Germany',
    }

    # Act
    response = await async_client.put('/applications/1', json=update_payload)

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data['role'] == 'Senior Software Engineer', msg(
        'Senior Software Engineer', data['role']
    )
    assert data['currency'] == 'EUR', msg('EUR', data['currency'])
    assert data['salary_period'] == 'monthly', msg(
        'monthly', data['salary_period']
    )
    assert data['experience_level'] == 'staff', msg(
        'staff', data['experience_level']
    )
    assert data['work_mode'] == 'hybrid', msg('hybrid', data['work_mode'])
    assert data['country'] == 'Germany', msg('Germany', data['country'])


async def test_list_applications_includes_new_fields(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: create applications with enum fields
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            old_company='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
            currency=Currency.BRL,
            salary_period=SalaryPeriod.MONTHLY,
            experience_level=ExperienceLevel.SENIOR,
            work_mode=WorkMode.REMOTE,
            country='Brazil',
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['plat_linkedin'].id,
            company_id=base_data()['company_acme'].id,
            old_company='Acme Corp',
            role='Fullstack Engineer',
            mode='active',
            application_date=date(2025, 12, 12),
        ),
    ])
    await db_session.commit()

    # Act
    response = await async_client.get('/applications')

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 2, msg(2, len(data))

    # Application with enum fields (id=2 first because newer date)
    app_without = data[0]
    assert app_without['currency'] is None, msg(None, app_without['currency'])

    # Application with enum fields (id=1)
    app_with = data[1]
    assert app_with['currency'] == 'BRL', msg('BRL', app_with['currency'])
    assert app_with['salary_period'] == 'monthly', msg(
        'monthly', app_with['salary_period']
    )
    assert app_with['experience_level'] == 'senior', msg(
        'senior', app_with['experience_level']
    )
    assert app_with['work_mode'] == 'remote', msg(
        'remote', app_with['work_mode']
    )
    assert app_with['country'] == 'Brazil', msg(
        'Brazil', app_with['country']
    )


async def test_list_applications(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: create test data
    db_session.add_all([
        ApplicationModel(
            id=1,
            user_id=base_data()['user'].id,
            platform_id=base_data()['fb_denied'].id,
            company_id=base_data()['company_acme'].id,
            old_company='Acme Corp',
            role='Software Engineer',
            mode='active',
            application_date=date(2025, 12, 1),
            feedback_id=1,
            feedback_date=date(2025, 12, 2),
        ),
        ApplicationModel(
            id=2,
            user_id=base_data()['user'].id,
            platform_id=base_data()['fb_denied'].id,
            company_id=base_data()['company_acme'].id,
            old_company='Acme Corp',
            role='Fullstack Engineer',
            mode='active',
            application_date=date(2025, 12, 12),
        ),
    ])
    await db_session.commit()

    # Act: call the endpoint
    response = await async_client.get('/applications')

    # Assert: verify the response
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list), msg('list', type(data))
    assert len(data) == 2, msg(2, len(data))
    # Active application first
    assert data[0]['id'] == 2, msg(2, data[0]['id'])
    # Finalized application second
    assert data[1]['id'] == 1, msg(1, data[1]['id'])


async def test_delete_application(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: create test data
    application = ApplicationModel(
        id=1,
        user_id=base_data()['user'].id,
        platform_id=base_data()['fb_denied'].id,
        company_id=base_data()['company_acme'].id,
        old_company='Acme Corp',
        role='Software Engineer',
        mode='active',
        application_date=date(2025, 12, 1),
    )
    db_session.add(application)
    await db_session.commit()

    # Act: call the endpoint
    response = await async_client.delete('/applications/1')

    # Assert: verify the response
    assert response.status_code == 204, msg(204, response.status_code)

    # Ensure the session expires cached state so we read fresh data from the DB
    await db_session.run_sync(lambda s: s.expire_all())

    # Verify the application is deleted
    deleted_application = await db_session.get(ApplicationModel, 1)
    assert deleted_application is None, msg('None', deleted_application)
