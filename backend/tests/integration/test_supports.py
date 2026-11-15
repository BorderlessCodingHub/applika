from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import PlatformModel, StepDefinitionModel
from tests import msg
from tests.base_db_setup import base_data
from tests.integration.conftest import as_user


async def test_get_supports_serves_the_platforms_only(
    async_client: AsyncClient, db_session: AsyncSession
):
    """ADR-0028: ``steps`` and ``feedbacks`` (read only by applika-cli) are
    gone, even with step definitions in the catalog."""
    db_session.add(
        StepDefinitionModel(id=1, name='Applied', color='#007bff', strict=False)
    )
    await db_session.commit()

    response = await async_client.get('/supports')

    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert set(data) == {'platforms'}, msg({'platforms'}, set(data))
    assert isinstance(data['platforms'], list), msg(
        'list', type(data['platforms'])
    )
    assert set(data['platforms'][0]) == {'id', 'name', 'url', 'is_public'}


async def test_get_supports_returns_seeded_platform(
    async_client: AsyncClient, db_session: AsyncSession
):
    # base_data seeds PlatformModel(id=1, name='Linkedin')
    response = await async_client.get('/supports')

    assert response.status_code == 200, msg(200, response.status_code)
    platforms = response.json()['platforms']
    assert len(platforms) == 1, msg(1, len(platforms))

    plat = platforms[0]
    assert plat['id'] == str(base_data()['plat_linkedin'].id), msg(
        str(base_data()['plat_linkedin'].id), plat['id']
    )
    assert plat['name'] == 'Linkedin', msg('Linkedin', plat['name'])


async def test_get_supports_with_multiple_platforms(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: add more platforms beyond base_data
    db_session.add_all([
        PlatformModel(id=2, name='Indeed', url='https://indeed.com/'),
        PlatformModel(id=3, name='Glassdoor', url='https://glassdoor.com/'),
    ])
    await db_session.commit()

    # Act
    response = await async_client.get('/supports')

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    platforms = response.json()['platforms']
    assert len(platforms) == 3, msg(3, len(platforms))
    names = [p['name'] for p in platforms]
    assert 'Linkedin' in names, msg('Linkedin in platforms', names)
    assert 'Indeed' in names, msg('Indeed in platforms', names)
    assert 'Glassdoor' in names, msg('Glassdoor in platforms', names)


async def test_seeded_base_platform_is_public_for_every_user(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    """AC9/T036: base_data's plat_linkedin predates this feature and must
    stay public - visible to the seed user and to any other user."""
    response = await async_client.get('/supports')
    row = response.json()['platforms'][0]
    assert row['name'] == 'Linkedin'
    assert row['is_public'] is True, msg(True, row['is_public'])

    async with as_user(second_user.id, second_user.username):
        other_response = await async_client.get('/supports')
    other_names = [p['name'] for p in other_response.json()['platforms']]
    assert 'Linkedin' in other_names, msg('Linkedin visible', other_names)


async def test_supports_platforms_stay_ordered_by_id_not_name(
    async_client: AsyncClient, db_session: AsyncSession
):
    """R-036/S7 plan correction: the company picker widened ``list_visible`` with a
    name-ordered mode for the new ``GET /platforms``, but ``/supports``
    itself must keep passing neither ``name`` nor ``order_by_name`` and
    stay ``ORDER BY id`` - name order and id order deliberately disagree
    here so a regression to name order would fail this assertion."""
    # base_data seeds plat_linkedin with a low id; these two straddle it in
    # id but land on opposite ends alphabetically.
    db_session.add_all([
        PlatformModel(id=90, name='Zulu Board', url=None, is_public=True),
        PlatformModel(id=91, name='Alpha Board', url=None, is_public=True),
    ])
    await db_session.commit()

    response = await async_client.get('/supports')

    assert response.status_code == 200, msg(200, response.status_code)
    ids = [p['id'] for p in response.json()['platforms']]
    assert ids == sorted(ids, key=int), msg(sorted(ids, key=int), ids)
    names = [p['name'] for p in response.json()['platforms']]
    assert names != sorted(names), (
        'fixture must make id order and name order disagree, else this '
        'test cannot catch a regression to name order'
    )
