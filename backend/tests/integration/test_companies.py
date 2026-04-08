from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import CompanyModel
from tests import msg
from tests.base_db_setup import base_data


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


async def test_list_companies_always_includes_seeded_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    # base_data seeds Acme Corp; it must always appear in the list
    response = await async_client.get('/companies')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert len(data) >= 1, msg('>= 1', len(data))
    names = [c['name'] for c in data]
    assert 'Acme Corp' in names, msg('Acme Corp in names', names)


async def test_post_companies_endpoint_no_longer_exists(
    async_client: AsyncClient, db_session: AsyncSession
):
    """POST /companies was removed; the route must return 405 or 404."""
    response = await async_client.post(
        '/companies', json={'name': 'Test', 'url': 'https://www.linkedin.com/company/test'}
    )

    assert response.status_code in (404, 405), msg(
        '404 or 405', response.status_code
    )
