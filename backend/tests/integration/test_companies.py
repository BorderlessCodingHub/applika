from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import CompanyModel
from tests import msg
from tests.base_db_setup import base_data
from tests.integration.conftest import as_user


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


async def test_seeded_base_company_is_public_for_every_user(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    """AC9/T036: base_data's company_acme predates this feature and must
    stay public - visible to the seed user and to any other user."""
    response = await async_client.get('/companies')
    row = next(c for c in response.json() if c['name'] == 'Acme Corp')
    assert row['is_public'] is True, msg(True, row['is_public'])

    async with as_user(second_user.id, second_user.username):
        other = await async_client.get('/companies')
    other_names = [c['name'] for c in other.json()]
    assert 'Acme Corp' in other_names, msg('Acme Corp visible', other_names)


async def test_post_companies_creates_a_new_private_company(
    async_client: AsyncClient, db_session: AsyncSession
):
    response = await async_client.post(
        '/companies',
        json={'name': 'Stealth Co', 'url': 'https://stealth.example.com'},
    )

    assert response.status_code == 201, msg(201, response.status_code)
    data = response.json()
    assert data['name'] == 'Stealth Co'
    assert data['is_public'] is False, msg(False, data['is_public'])


async def test_post_companies_twice_returns_the_same_id(
    async_client: AsyncClient, db_session: AsyncSession
):
    first = await async_client.post(
        '/companies',
        json={'name': 'Repeat Co', 'url': 'https://repeat.example.com'},
    )
    assert first.status_code == 201

    second = await async_client.post(
        '/companies',
        json={'name': 'Repeat Co', 'url': 'https://repeat.example.com'},
    )

    assert second.status_code == 200, msg(200, second.status_code)
    assert second.json()['id'] == first.json()['id']


async def test_two_users_private_company_with_same_name_are_two_rows(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    first = await async_client.post(
        '/companies',
        json={'name': 'Same Name Co', 'url': 'https://samename.example.com'},
    )
    assert first.status_code == 201

    async with as_user(second_user.id, second_user.username):
        second = await async_client.post(
            '/companies',
            json={
                'name': 'Same Name Co',
                'url': 'https://samename.example.com',
            },
        )
    assert second.status_code == 201, msg(201, second.status_code)
    assert second.json()['id'] != first.json()['id']


async def test_a_users_private_company_is_not_in_the_other_users_list(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    resp = await async_client.post(
        '/companies',
        json={'name': 'Only Mine Co', 'url': 'https://onlymine.example.com'},
    )
    assert resp.status_code == 201

    async with as_user(second_user.id, second_user.username):
        other_list = await async_client.get('/companies')
    names = [c['name'] for c in other_list.json()]
    assert 'Only Mine Co' not in names, msg('Only Mine Co absent', names)

    # ?name= keeps the visibility rule too.
    async with as_user(second_user.id, second_user.username):
        filtered = await async_client.get('/companies?name=Only Mine')
    assert filtered.json() == [], msg([], filtered.json())
