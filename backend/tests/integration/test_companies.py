from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import CompanyModel
from tests import msg
from tests.base_db_setup import base_data


async def test_create_company_with_linkedin_url(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange
    payload = {
        'name': 'Google',
        'url': 'https://www.linkedin.com/company/google',
    }

    # Act
    response = await async_client.post('/companies', json=payload)

    # Assert
    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['name'] == 'Google', msg('Google', data['name'])
    assert 'linkedin.com' in data['url'], msg('linkedin.com in url', data['url'])
    assert 'id' in data


async def test_create_company_with_linkedin_shorthand_url(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: linkedin.com without www
    payload = {
        'name': 'Meta',
        'url': 'https://linkedin.com/company/meta',
    }

    # Act
    response = await async_client.post('/companies', json=payload)

    # Assert
    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['name'] == 'Meta', msg('Meta', data['name'])


async def test_create_company_with_non_linkedin_url_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: YouTube URL should be rejected
    payload = {
        'name': 'YouTube Channel',
        'url': 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    }

    # Act
    response = await async_client.post('/companies', json=payload)

    # Assert
    assert response.status_code == 422, msg(422, response.status_code)
    data = response.json()
    assert 'LinkedIn' in str(data), msg('LinkedIn in error detail', data)


async def test_create_company_with_http_url_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: http (not https) LinkedIn URL
    payload = {
        'name': 'Some Company',
        'url': 'http://www.linkedin.com/company/some-company',
    }

    # Act
    response = await async_client.post('/companies', json=payload)

    # Assert
    assert response.status_code == 422, msg(422, response.status_code)


async def test_create_company_with_invalid_url_returns_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: not even a URL
    payload = {
        'name': 'Bad Company',
        'url': 'not-a-url',
    }

    # Act
    response = await async_client.post('/companies', json=payload)

    # Assert
    assert response.status_code == 422, msg(422, response.status_code)


async def test_list_companies_returns_all(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: base_data already seeds company_acme; add one more
    db_session.add(
        CompanyModel(
            id=2,
            name='TechCorp',
            url='https://www.linkedin.com/company/techcorp',
            created_by=base_data()['user'].id,
        )
    )
    await db_session.commit()

    # Act
    response = await async_client.get('/companies')

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert isinstance(data, list), msg('list', type(data))
    assert len(data) == 2, msg(2, len(data))


async def test_list_companies_filter_by_name(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: add a second company
    db_session.add(
        CompanyModel(
            id=2,
            name='TechCorp',
            url='https://www.linkedin.com/company/techcorp',
            created_by=base_data()['user'].id,
        )
    )
    await db_session.commit()

    # Act: filter by partial name
    response = await async_client.get('/companies?name=Tech')

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) == 1, msg(1, len(data))
    assert data[0]['name'] == 'TechCorp', msg('TechCorp', data[0]['name'])


async def test_list_companies_filter_by_name_no_match(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Act: filter by name that matches nothing
    response = await async_client.get('/companies?name=DoesNotExist')

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert data == [], msg([], data)


async def test_list_companies_empty(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Note: base_data seeds 1 company (Acme Corp). If we need empty list,
    # we test with a name filter that matches nothing — covered above.
    # This test verifies base_data company is always present.
    response = await async_client.get('/companies')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) >= 1, msg('>= 1', len(data))
    names = [c['name'] for c in data]
    assert 'Acme Corp' in names, msg('Acme Corp in names', names)
