from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import PlatformModel
from app.main import app as main_app
from app.presentation.dependencies import get_current_user
from tests import msg
from tests.base_db_setup import base_data
from tests.integration.conftest import as_user

BASE = '/platforms'


async def test_create_platform_returns_201_private(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(
        BASE, json={'name': 'Founder Board', 'url': None}
    )

    assert resp.status_code == 201, msg(201, resp.status_code)
    data = resp.json()
    assert data['name'] == 'Founder Board', msg('Founder Board', data['name'])
    assert data['url'] is None, msg(None, data['url'])
    assert data['is_public'] is False, msg(False, data['is_public'])


async def test_create_platform_url_null_is_ok(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(BASE, json={'name': 'No Url Board'})

    assert resp.status_code == 201, msg(201, resp.status_code)
    assert resp.json()['url'] is None


async def test_create_platform_url_over_200_chars_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    long_url = 'https://example.com/' + 'a' * 200
    resp = await async_client.post(
        BASE, json={'name': 'Too Long Url', 'url': long_url}
    )

    assert resp.status_code == 422, msg(422, resp.status_code)


async def test_create_platform_blank_name_is_422(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(BASE, json={'name': '   ', 'url': None})

    assert resp.status_code == 422, msg(422, resp.status_code)


async def test_create_platform_case_insensitive_duplicate_is_409(
    async_client: AsyncClient, db_session: AsyncSession
):
    # base_data seeds public PlatformModel(name='Linkedin')
    resp = await async_client.post(BASE, json={'name': 'linkedin'})

    assert resp.status_code == 409, msg(409, resp.status_code)
    assert 'Linkedin' in resp.json()['detail']


async def test_create_platform_requires_authentication(
    async_client: AsyncClient, db_session: AsyncSession
):
    override = main_app.dependency_overrides.pop(get_current_user)
    try:
        resp = await async_client.post(BASE, json={'name': 'Anon Board'})
    finally:
        main_app.dependency_overrides[get_current_user] = override

    assert resp.status_code in (401, 403), msg('401 or 403', resp.status_code)


async def test_creator_sees_own_private_platform_in_supports(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(BASE, json={'name': 'Creator Only'})
    assert resp.status_code == 201

    supports = (await async_client.get('/supports')).json()
    names = [p['name'] for p in supports['platforms']]
    assert 'Creator Only' in names, msg('Creator Only in list', names)
    row = next(p for p in supports['platforms'] if p['name'] == 'Creator Only')
    assert row['is_public'] is False


async def test_other_user_does_not_see_a_private_platform(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    resp = await async_client.post(BASE, json={'name': 'Only Mine'})
    assert resp.status_code == 201

    async with as_user(second_user.id, second_user.username):
        supports = (await async_client.get('/supports')).json()

    names = [p['name'] for p in supports['platforms']]
    assert 'Only Mine' not in names, msg('Only Mine absent', names)


async def test_url_null_public_platform_is_listed_without_error(
    async_client: AsyncClient, db_session: AsyncSession
):
    """AC1: a platform may have no url, whoever adds it, and every list
    shows it without error - fixes the pre-KODI-031 500 on a null url."""
    db_session.add(
        PlatformModel(id=50, name='No Url Public', url=None, is_public=True)
    )
    await db_session.commit()

    resp = await async_client.get('/supports')

    assert resp.status_code == 200, msg(200, resp.status_code)
    row = next(
        p for p in resp.json()['platforms'] if p['name'] == 'No Url Public'
    )
    assert row['url'] is None


async def test_create_application_with_foreign_private_platform_is_404(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    async with as_user(second_user.id, second_user.username):
        create_resp = await async_client.post(
            '/platforms', json={'name': 'Second User Board'}
        )
    private_platform_id = create_resp.json()['id']

    resp = await async_client.post(
        '/applications',
        json={
            'company': base_data()['company_acme'].id,
            'role': 'Engineer',
            'mode': 'active',
            'platform_id': private_platform_id,
            'application_date': '2025-12-01',
        },
    )

    assert resp.status_code == 404, msg(404, resp.status_code)
    assert resp.json()['detail'] == 'Platform not found'

    list_resp = await async_client.get('/applications')
    assert list_resp.json() == [], 'No application row should have been written'


# ── GET /platforms (S7, web picker, R-036) ──────────────────────────


async def test_list_platforms_includes_own_private_rows(
    async_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await async_client.post(BASE, json={'name': 'Own Board'})
    assert create_resp.status_code == 201

    resp = await async_client.get(BASE)

    assert resp.status_code == 200, msg(200, resp.status_code)
    names = [p['name'] for p in resp.json()]
    assert 'Own Board' in names, msg('Own Board in list', names)


async def test_list_platforms_excludes_another_users_private_rows(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    create_resp = await async_client.post(
        BASE, json={'name': 'Not Yours Board'}
    )
    assert create_resp.status_code == 201

    async with as_user(second_user.id, second_user.username):
        resp = await async_client.get(BASE)

    names = [p['name'] for p in resp.json()]
    assert 'Not Yours Board' not in names, msg(
        'Not Yours Board absent', names
    )


async def test_list_platforms_name_filter_is_case_insensitive_substring(
    async_client: AsyncClient, db_session: AsyncSession
):
    # base_data seeds public PlatformModel(name='Linkedin')
    resp = await async_client.get(BASE, params={'name': 'link'})

    assert resp.status_code == 200, msg(200, resp.status_code)
    names = [p['name'] for p in resp.json()]
    assert 'Linkedin' in names, msg('Linkedin in list', names)


async def test_list_platforms_is_ordered_by_name(
    async_client: AsyncClient, db_session: AsyncSession
):
    await async_client.post(BASE, json={'name': 'Zeta Board'})
    await async_client.post(BASE, json={'name': 'Alpha Board'})

    resp = await async_client.get(BASE)

    names = [p['name'] for p in resp.json()]
    assert names == sorted(names), msg(sorted(names), names)


async def test_list_platforms_shows_url_null_row(
    async_client: AsyncClient, db_session: AsyncSession
):
    db_session.add(
        PlatformModel(id=51, name='No Url Listed', url=None, is_public=True)
    )
    await db_session.commit()

    resp = await async_client.get(BASE)

    assert resp.status_code == 200, msg(200, resp.status_code)
    row = next(p for p in resp.json() if p['name'] == 'No Url Listed')
    assert row['url'] is None


async def test_list_platforms_requires_authentication(
    async_client: AsyncClient, db_session: AsyncSession
):
    override = main_app.dependency_overrides.pop(get_current_user)
    try:
        resp = await async_client.get(BASE)
    finally:
        main_app.dependency_overrides[get_current_user] = override

    assert resp.status_code in (401, 403), msg('401 or 403', resp.status_code)
