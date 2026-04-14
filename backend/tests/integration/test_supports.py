from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import PlatformModel, StepDefinitionModel
from tests import msg
from tests.base_db_setup import base_data


async def test_get_supports_returns_expected_structure(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Act
    response = await async_client.get('/supports')

    # Assert: response has the three required keys
    assert response.status_code == 200, msg(200, response.status_code)
    data = response.json()
    assert 'feedbacks' in data, msg('feedbacks key', data.keys())
    assert 'steps' in data, msg('steps key', data.keys())
    assert 'platforms' in data, msg('platforms key', data.keys())
    assert isinstance(data['feedbacks'], list), msg('list', type(data['feedbacks']))
    assert isinstance(data['steps'], list), msg('list', type(data['steps']))
    assert isinstance(data['platforms'], list), msg('list', type(data['platforms']))


async def test_get_supports_returns_seeded_feedback(
    async_client: AsyncClient, db_session: AsyncSession
):
    # base_data seeds FeedbackDefinitionModel(id=1, name='Denied')
    response = await async_client.get('/supports')

    assert response.status_code == 200, msg(200, response.status_code)
    feedbacks = response.json()['feedbacks']
    assert len(feedbacks) >= 1, msg('>=1', len(feedbacks))

    fb = next(f for f in feedbacks if f['name'] == 'Denied')
    assert fb['id'] == str(base_data()['fb_denied'].id), msg(
        str(base_data()['fb_denied'].id), fb['id']
    )
    assert fb['color'] == '#a80000', msg('#a80000', fb['color'])


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


async def test_get_supports_returns_seeded_steps(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: seed a couple of step definitions
    db_session.add_all([
        StepDefinitionModel(id=1, name='Applied', color='#007bff', strict=False),
        StepDefinitionModel(id=2, name='Interview', color='#17a2b8', strict=False),
        StepDefinitionModel(id=3, name='Offer', color='#28a745', strict=True),
    ])
    await db_session.commit()

    # Act
    response = await async_client.get('/supports')

    # Assert
    assert response.status_code == 200, msg(200, response.status_code)
    steps = response.json()['steps']
    assert len(steps) >= 3, msg('>=3', len(steps))

    names = [s['name'] for s in steps]
    assert 'Applied' in names, msg('Applied in steps', names)
    assert 'Interview' in names, msg('Interview in steps', names)
    assert 'Offer' in names, msg('Offer in steps', names)


async def test_get_supports_steps_include_strict_flag(
    async_client: AsyncClient, db_session: AsyncSession
):
    # Arrange: one strict step, one non-strict
    db_session.add_all([
        StepDefinitionModel(id=1, name='Applied', color='#007bff', strict=False),
        StepDefinitionModel(id=2, name='Denied', color='#a80000', strict=True),
    ])
    await db_session.commit()

    # Act
    response = await async_client.get('/supports')

    # Assert: strict flag is correctly reflected
    assert response.status_code == 200, msg(200, response.status_code)
    steps = {s['name']: s for s in response.json()['steps']}
    assert steps['Applied']['strict'] is False, msg(
        False, steps['Applied']['strict']
    )
    assert steps['Denied']['strict'] is True, msg(
        True, steps['Denied']['strict']
    )


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
