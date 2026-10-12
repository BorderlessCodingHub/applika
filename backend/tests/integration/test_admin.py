import asyncio
from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType
from app.domain.models import CompanyModel, JobSourceModel, PlatformModel
from app.domain.repositories.admin_repository import AdminRepository
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts
from tests.integration.conftest import as_user
from tests.integration.jobs_seed import (
    HIMALAYAS_ID,
    HIMALAYAS_PLATFORM_ID,
    seed_sources,
)

# ── Access Control: non-admin user gets 403 on every admin route ────


ADMIN_GET_ROUTES = [
    '/admin/stats',
    '/admin/users',
    '/admin/users/growth',
    '/admin/users/seniority',
    '/admin/stats/top-platforms',
    '/admin/stats/top-companies',
    '/admin/stats/activity-heatmap',
    f'/admin/users/{base_data()["admin_user"].id}',
    '/admin/companies',
    '/admin/platforms',
]


async def test_non_admin_gets_403_on_all_get_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Regular (non-admin) user must get 403 on every admin GET."""
    for route in ADMIN_GET_ROUTES:
        resp = await async_client.get(route)
        assert resp.status_code == 403, f'{route}: {msg(403, resp.status_code)}'


async def test_non_admin_gets_403_on_post_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    post_routes = [
        ('/admin/companies', {'name': 'X', 'url': 'https://x.com'}),
        ('/admin/platforms', {'name': 'X', 'url': 'https://x.com'}),
    ]
    for route, payload in post_routes:
        resp = await async_client.post(route, json=payload)
        assert resp.status_code == 403, f'{route}: {msg(403, resp.status_code)}'


async def test_non_admin_gets_403_on_patch_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    patch_routes = [
        ('/admin/users/1', {'is_admin': True}),
        ('/admin/companies/1', {'name': 'Y'}),
        ('/admin/platforms/1', {'name': 'Y'}),
    ]
    for route, payload in patch_routes:
        resp = await async_client.patch(route, json=payload)
        assert resp.status_code == 403, f'{route}: {msg(403, resp.status_code)}'


async def test_non_admin_gets_403_on_delete_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    delete_routes = [
        '/admin/companies/9999',
        '/admin/platforms/9999',
    ]
    for route in delete_routes:
        resp = await async_client.delete(route)
        assert resp.status_code == 403, f'{route}: {msg(403, resp.status_code)}'


# ── Admin Stats ────────────────────────────────────────────────────


async def test_admin_stats_returns_200(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/stats')
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert 'total_users' in data
    assert 'total_applications' in data
    assert 'total_denials' in data
    assert 'total_offers' in data
    assert 'finalization_rate' in data
    assert 'applications_last_30d' in data


async def test_admin_user_growth_returns_200(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/users/growth')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)


async def test_admin_seniority_breakdown_returns_200(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/users/seniority')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)


async def test_admin_top_platforms_returns_200(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/stats/top-platforms')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)


async def test_admin_top_companies_returns_200(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/stats/top-companies')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)


async def test_admin_activity_heatmap_returns_200(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/stats/activity-heatmap')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)


# ── Admin Users ────────────────────────────────────────────────────


async def test_admin_list_users_returns_paginated(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/users')
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert 'items' in data
    assert 'total' in data
    assert 'page' in data
    assert data['total'] >= 2  # user + admin_user


async def test_admin_list_users_search_filter(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get(
        '/admin/users', params={'search': 'adminuser'}
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data['total'] >= 1
    assert any(u['username'] == 'adminuser' for u in data['items'])


async def test_admin_get_user_detail(
    admin_client: AsyncClient, db_session: AsyncSession
):
    user_id = base_data()['user'].id
    resp = await admin_client.get(f'/admin/users/{user_id}')
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert data['username'] == 'testuser'
    assert 'is_org_member' not in data, msg('no is_org_member key', data.keys())


async def test_admin_get_user_detail_not_found(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/users/999999')
    assert resp.status_code == 404, msg(404, resp.status_code)


async def test_admin_update_user(
    admin_client: AsyncClient, db_session: AsyncSession
):
    user_id = base_data()['user'].id
    resp = await admin_client.patch(
        f'/admin/users/{user_id}',
        json={'is_admin': True},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)


# ── Admin Companies CRUD ──────────────────────────────────────────


async def test_admin_create_company(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/companies',
        json={'name': 'NewCo', 'url': 'https://newco.com'},
    )
    assert resp.status_code == 201, msg(201, resp.status_code)
    data = resp.json()
    assert data['name'] == 'NewCo'


async def test_admin_list_companies(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/companies')
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert 'items' in data
    assert data['total'] >= 1


async def test_admin_update_company(
    admin_client: AsyncClient, db_session: AsyncSession
):
    company_id = base_data()['company_acme'].id
    resp = await admin_client.patch(
        f'/admin/companies/{company_id}',
        json={'name': 'Acme Updated'},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['name'] == 'Acme Updated'


async def test_admin_update_company_not_found(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.patch(
        '/admin/companies/999999',
        json={'name': 'Ghost'},
    )
    assert resp.status_code == 404, msg(404, resp.status_code)


async def test_admin_delete_company_no_refs(
    admin_client: AsyncClient, db_session: AsyncSession
):
    # Create an unreferenced company first
    create_resp = await admin_client.post(
        '/admin/companies',
        json={'name': 'Deletable', 'url': 'https://deletable.com'},
    )
    company_id = create_resp.json()['id']

    resp = await admin_client.delete(f'/admin/companies/{company_id}')
    assert resp.status_code == 204, msg(204, resp.status_code)


# ── Admin Platforms CRUD ──────────────────────────────────────────


async def test_admin_create_platform(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/platforms',
        json={'name': 'Indeed', 'url': 'https://indeed.com'},
    )
    assert resp.status_code == 201, msg(201, resp.status_code)
    assert resp.json()['name'] == 'Indeed'


async def test_admin_list_platforms(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/platforms')
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert isinstance(data['items'], list)
    assert len(data['items']) >= 1
    assert data['total'] >= 1
    assert data['page'] == 1
    assert data['per_page'] == 25


async def test_admin_update_platform(
    admin_client: AsyncClient, db_session: AsyncSession
):
    plat_id = base_data()['plat_linkedin'].id
    resp = await admin_client.patch(
        f'/admin/platforms/{plat_id}',
        json={'name': 'LinkedIn Updated'},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['name'] == 'LinkedIn Updated'


async def test_admin_update_platform_not_found(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.patch(
        '/admin/platforms/999999',
        json={'name': 'Ghost'},
    )
    assert resp.status_code == 404, msg(404, resp.status_code)


async def test_admin_delete_platform_no_refs(
    admin_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await admin_client.post(
        '/admin/platforms',
        json={'name': 'TempPlat', 'url': 'https://temp.com'},
    )
    plat_id = create_resp.json()['id']

    resp = await admin_client.delete(f'/admin/platforms/{plat_id}')
    assert resp.status_code == 204, msg(204, resp.status_code)


# ── Private catalog rows and admin Approve (ADR-0014, KODI-031) ────
#
# admin_client and async_client both mutate the SAME global
# ``get_current_user`` override (they are not per-client identities), so a
# test that needs both a regular user's and the admin's point of view uses
# ``async_client`` throughout and switches identity with ``as_user`` -
# mixing the two client fixtures in one test silently makes every call
# answer as whichever fixture was instantiated last.


def _admin_context():
    admin = base_data()['admin_user']
    return as_user(admin.id, admin.username, is_admin=True)


async def test_admin_create_company_is_public_at_once(
    async_client: AsyncClient, db_session: AsyncSession
):
    async with _admin_context():
        resp = await async_client.post(
            '/admin/companies',
            json={
                'name': 'Admin Screen Co',
                'url': 'https://adminscreenco.com',
            },
        )
    assert resp.status_code == 201
    assert resp.json()['is_public'] is True


async def test_admin_create_platform_is_public_at_once(
    async_client: AsyncClient, db_session: AsyncSession
):
    async with _admin_context():
        resp = await async_client.post(
            '/admin/platforms', json={'name': 'Admin Screen Board'}
        )
    assert resp.status_code == 201
    assert resp.json()['is_public'] is True


async def test_admin_own_applications_flow_creates_private_rows(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Owner decision, 2026-09-25: an admin using the ordinary user flows
    (their own applications) gets a private row, exactly like any user."""
    async with _admin_context():
        company_resp = await async_client.post(
            '/companies',
            json={'name': 'Admin Own Co', 'url': 'https://adminownco.com'},
        )
        assert company_resp.status_code == 201
        assert company_resp.json()['is_public'] is False

        platform_resp = await async_client.post(
            '/platforms', json={'name': 'Admin Own Board'}
        )
        assert platform_resp.status_code == 201
        assert platform_resp.json()['is_public'] is False

        app_resp = await async_client.post(
            '/applications',
            json={
                'company': {
                    'name': 'Admin Inline Co',
                    'url': 'https://admininlineco.com',
                },
                'role': 'Engineer',
                'mode': 'active',
                'platform_id': platform_resp.json()['id'],
                'application_date': '2025-12-01',
            },
        )
        assert app_resp.status_code == 201
        companies = (await async_client.get('/companies')).json()

    inline = next(c for c in companies if c['name'] == 'Admin Inline Co')
    assert inline['is_public'] is False


async def test_admin_companies_list_shows_private_rows_with_created_by(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(
        '/companies',
        json={'name': 'Visible To Admin Co', 'url': 'https://vtaco.com'},
    )
    company_id = resp.json()['id']

    async with _admin_context():
        listing = await async_client.get('/admin/companies?visibility=private')
        assert listing.status_code == 200
        row = next(r for r in listing.json()['items'] if r['id'] == company_id)
        assert row['is_public'] is False
        assert row['created_by']['id'] == str(base_data()['user'].id)
        assert row['created_by']['username'] == base_data()['user'].username
        # Kept alongside the nested created_by: the shipped frontend admin
        # companies screen still reads this flat field (B2, backend-qa).
        assert row['created_by_username'] == base_data()['user'].username

        public_only = await async_client.get(
            '/admin/companies?visibility=public'
        )
    ids = [r['id'] for r in public_only.json()['items']]
    assert company_id not in ids


async def test_admin_platforms_list_shows_private_rows_with_created_by(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp = await async_client.post(
        '/platforms', json={'name': 'Visible To Admin Board'}
    )
    platform_id = resp.json()['id']

    async with _admin_context():
        listing = await async_client.get('/admin/platforms?visibility=private')
        assert listing.status_code == 200
        row = next(r for r in listing.json()['items'] if r['id'] == platform_id)
        assert row['is_public'] is False
        assert row['created_by']['id'] == str(base_data()['user'].id)

        public_only = await async_client.get(
            '/admin/platforms?visibility=public'
        )
    ids = [r['id'] for r in public_only.json()['items']]
    assert platform_id not in ids


async def test_admin_publish_company_makes_it_visible_to_everyone(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    create_resp = await async_client.post(
        '/companies',
        json={'name': 'Publish Me Co', 'url': 'https://publishmeco.com'},
    )
    company_id = create_resp.json()['id']

    async with _admin_context():
        publish_resp = await async_client.post(
            f'/admin/companies/{company_id}/publish'
        )
    assert publish_resp.status_code == 200, msg(200, publish_resp.status_code)
    published = publish_resp.json()
    assert published['is_public'] is True
    assert published['created_by']['id'] == str(base_data()['user'].id)

    async with as_user(second_user.id, second_user.username):
        other_list = await async_client.get('/companies')
    names = [c['name'] for c in other_list.json()]
    assert 'Publish Me Co' in names, msg('Publish Me Co visible', names)


async def test_admin_publish_company_is_idempotent(
    async_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await async_client.post(
        '/companies',
        json={'name': 'Idempotent Co', 'url': 'https://idempotentco.com'},
    )
    company_id = create_resp.json()['id']

    async with _admin_context():
        first = await async_client.post(
            f'/admin/companies/{company_id}/publish'
        )
        second = await async_client.post(
            f'/admin/companies/{company_id}/publish'
        )

    assert first.status_code == 200
    assert second.status_code == 200


async def test_admin_publish_company_not_found(
    async_client: AsyncClient, db_session: AsyncSession
):
    async with _admin_context():
        resp = await async_client.post('/admin/companies/999999/publish')
    assert resp.status_code == 404, msg(404, resp.status_code)


async def test_admin_publish_company_collision_names_the_public_row(
    async_client: AsyncClient, db_session: AsyncSession
):
    """A private company that would duplicate a public one on
    (lower(name), url) refuses to publish, naming that public row. Neither
    create flow can produce this pair on its own (both dedupe against
    visible rows) - seeded directly, the way a stray legacy duplicate
    would exist."""
    private_resp = await async_client.post(
        '/companies',
        json={'name': 'Collision Co', 'url': 'https://collisionco.com'},
    )
    company_id = private_resp.json()['id']
    # Read the raw stored url back, not the API's HttpUrl-serialised
    # response (which may add a trailing slash the stored value lacks).
    private_row = await db_session.get(CompanyModel, int(company_id))
    assert private_row is not None
    stored_url = private_row.url

    public = CompanyModel(
        id=9001,
        name='Collision Co',
        url=stored_url,
        is_public=True,
        created_by=base_data()['admin_user'].id,
    )
    db_session.add(public)
    await db_session.commit()

    async with _admin_context():
        resp = await async_client.post(f'/admin/companies/{company_id}/publish')

    assert resp.status_code == 409, msg(409, resp.status_code)
    assert str(public.id) in resp.json()['detail']
    assert 'Collision Co' in resp.json()['detail']


async def test_admin_publish_company_race_hits_the_index_not_a_500(
    async_client: AsyncClient, db_session: AsyncSession, monkeypatch
):
    """A same-instant race that slips past the pre-check (another publish or
    create landed between the check and the update) hits the database's own
    partial unique index as an IntegrityError - this must still answer 409
    naming the row, never a 500 (the shared session's rollback on that
    IntegrityError expires the in-flight ORM object, which is the trap the
    ``except`` branch's own name/url capture guards against)."""
    from app.domain.repositories.company_repository import CompanyRepository

    private_resp = await async_client.post(
        '/companies',
        json={'name': 'Race Co', 'url': 'https://raceco.example.com'},
    )
    company_id = private_resp.json()['id']
    private_row = await db_session.get(CompanyModel, int(company_id))
    assert private_row is not None
    stored_url = private_row.url

    public = CompanyModel(
        id=9010,
        name='Race Co',
        url=stored_url,
        is_public=True,
        created_by=base_data()['admin_user'].id,
    )
    db_session.add(public)
    await db_session.commit()

    # Make the pre-check miss the collision it would otherwise catch, so the
    # flow falls through to the database's own unique-index refusal.
    real_find_public_collision = CompanyRepository.find_public_collision
    calls = {'n': 0}

    async def _miss_once(self, name, url, exclude_id=None):
        calls['n'] += 1
        if calls['n'] == 1:
            return None
        return await real_find_public_collision(
            self, name, url, exclude_id=exclude_id
        )

    monkeypatch.setattr(CompanyRepository, 'find_public_collision', _miss_once)

    async with _admin_context():
        resp = await async_client.post(f'/admin/companies/{company_id}/publish')

    assert resp.status_code == 409, msg(409, resp.status_code)
    assert str(public.id) in resp.json()['detail']
    assert 'Race Co' in resp.json()['detail']


async def test_admin_publish_platform_makes_it_visible_to_everyone(
    async_client: AsyncClient, db_session: AsyncSession, second_user
):
    create_resp = await async_client.post(
        '/platforms', json={'name': 'Publish Me Board'}
    )
    platform_id = create_resp.json()['id']

    async with _admin_context():
        publish_resp = await async_client.post(
            f'/admin/platforms/{platform_id}/publish'
        )
    assert publish_resp.status_code == 200, msg(200, publish_resp.status_code)
    assert publish_resp.json()['is_public'] is True
    assert publish_resp.json()['created_by']['id'] == str(
        base_data()['user'].id
    )

    async with as_user(second_user.id, second_user.username):
        other_supports = await async_client.get('/supports')
    names = [p['name'] for p in other_supports.json()['platforms']]
    assert 'Publish Me Board' in names, msg('Publish Me Board visible', names)


async def test_admin_publish_platform_not_found(
    async_client: AsyncClient, db_session: AsyncSession
):
    async with _admin_context():
        resp = await async_client.post('/admin/platforms/999999/publish')
    assert resp.status_code == 404, msg(404, resp.status_code)


async def test_admin_publish_platform_collision_names_the_public_row(
    async_client: AsyncClient, db_session: AsyncSession
):
    private_resp = await async_client.post(
        '/platforms', json={'name': 'Collision Board'}
    )
    platform_id = private_resp.json()['id']

    public = PlatformModel(
        id=9002,
        name='Collision Board',
        url=None,
        is_public=True,
        created_by=base_data()['admin_user'].id,
    )
    db_session.add(public)
    await db_session.commit()

    async with _admin_context():
        resp = await async_client.post(
            f'/admin/platforms/{platform_id}/publish'
        )

    assert resp.status_code == 409, msg(409, resp.status_code)
    assert str(public.id) in resp.json()['detail']


async def test_publish_routes_refuse_non_admin(
    async_client: AsyncClient, db_session: AsyncSession
):
    resp1 = await async_client.post('/admin/companies/1/publish')
    resp2 = await async_client.post('/admin/platforms/1/publish')
    assert resp1.status_code == 403, msg(403, resp1.status_code)
    assert resp2.status_code == 403, msg(403, resp2.status_code)


async def test_admin_delete_platform_in_use_is_still_refused(
    async_client: AsyncClient, db_session: AsyncSession
):
    """count_entity_references is unchanged by ADR-0014: a private platform
    referenced by an application still blocks the admin delete."""
    create_resp = await async_client.post(
        '/platforms', json={'name': 'In Use Board'}
    )
    platform_id = create_resp.json()['id']

    app_resp = await async_client.post(
        '/applications',
        json={
            'company': base_data()['company_acme'].id,
            'role': 'Engineer',
            'mode': 'active',
            'platform_id': platform_id,
            'application_date': '2025-12-01',
        },
    )
    assert app_resp.status_code == 201

    async with _admin_context():
        resp = await async_client.delete(f'/admin/platforms/{platform_id}')
    assert resp.status_code == 409, msg(409, resp.status_code)


# ── Paginated GET /admin/platforms (S7, KODI-035) ───────────────────


async def test_admin_platforms_paging_reports_total_and_total_pages(
    admin_client: AsyncClient, db_session: AsyncSession
):
    for i in range(5):
        create_resp = await admin_client.post(
            '/admin/platforms', json={'name': f'Paging Board {i}'}
        )
        assert create_resp.status_code == 201

    resp = await admin_client.get(
        '/admin/platforms',
        params={'per_page': 2, 'page': 1, 'search': 'Paging Board'},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert len(data['items']) == 2
    assert data['total'] == 5, msg(5, data['total'])
    assert data['page'] == 1
    assert data['per_page'] == 2
    assert data['total_pages'] == 3, msg(3, data['total_pages'])

    page2 = await admin_client.get(
        '/admin/platforms',
        params={
            'per_page': 2,
            'page': 2,
            'search': 'Paging Board',
            'sort_by': 'name',
            'sort_order': 'asc',
        },
    )
    assert page2.status_code == 200, msg(200, page2.status_code)
    page1_ids = {item['id'] for item in data['items']}
    page2_ids = {item['id'] for item in page2.json()['items']}
    assert page1_ids.isdisjoint(page2_ids), msg(
        'disjoint pages', (page1_ids, page2_ids)
    )

    page3 = await admin_client.get(
        '/admin/platforms',
        params={'per_page': 2, 'page': 3, 'search': 'Paging Board'},
    )
    assert len(page3.json()['items']) == 1, msg(1, len(page3.json()['items']))


async def test_admin_platforms_search_filters_by_name(
    admin_client: AsyncClient, db_session: AsyncSession
):
    await admin_client.post(
        '/admin/platforms', json={'name': 'Searchable Board'}
    )

    resp = await admin_client.get(
        '/admin/platforms', params={'search': 'Searchable'}
    )
    names = [p['name'] for p in resp.json()['items']]
    assert names == ['Searchable Board'], msg(['Searchable Board'], names)


async def test_admin_platforms_visibility_filter(
    async_client: AsyncClient, db_session: AsyncSession
):
    private_resp = await async_client.post(
        '/platforms', json={'name': 'Private Filter Board'}
    )
    assert private_resp.json()['is_public'] is False

    async with _admin_context():
        public_resp = await async_client.post(
            '/admin/platforms', json={'name': 'Public Filter Board'}
        )
        assert public_resp.json()['is_public'] is True

        public_only = await async_client.get(
            '/admin/platforms', params={'visibility': 'public'}
        )
        private_only = await async_client.get(
            '/admin/platforms', params={'visibility': 'private'}
        )

    public_names = [p['name'] for p in public_only.json()['items']]
    private_names = [p['name'] for p in private_only.json()['items']]
    assert 'Public Filter Board' in public_names
    assert 'Public Filter Board' not in private_names
    assert 'Private Filter Board' in private_names
    assert 'Private Filter Board' not in public_names


async def test_admin_platforms_sort_by_name(
    admin_client: AsyncClient, db_session: AsyncSession
):
    await admin_client.post('/admin/platforms', json={'name': 'Zeta Sort'})
    await admin_client.post('/admin/platforms', json={'name': 'Alpha Sort'})

    asc = await admin_client.get(
        '/admin/platforms', params={'sort_by': 'name', 'sort_order': 'asc'}
    )
    names = [p['name'] for p in asc.json()['items']]
    assert names == sorted(names), msg(sorted(names), names)

    desc = await admin_client.get(
        '/admin/platforms', params={'sort_by': 'name', 'sort_order': 'desc'}
    )
    names_desc = [p['name'] for p in desc.json()['items']]
    assert names_desc == sorted(names_desc, reverse=True), msg(
        sorted(names_desc, reverse=True), names_desc
    )


async def test_admin_platforms_sort_by_created_at(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """Names are assigned in the opposite order of creation, so a
    regression that maps ``sort_by=created_at`` onto the name column would
    return these three in the wrong order."""
    ids_in_creation_order = []
    for name in [
        'Zeta Created First',
        'Middle Created Second',
        'Alpha Created Third',
    ]:
        resp = await admin_client.post('/admin/platforms', json={'name': name})
        assert resp.status_code == 201
        ids_in_creation_order.append(resp.json()['id'])
        await asyncio.sleep(0.01)

    desc = await admin_client.get(
        '/admin/platforms',
        params={
            'sort_by': 'created_at',
            'sort_order': 'desc',
            'search': 'Created',
        },
    )
    assert desc.status_code == 200, msg(200, desc.status_code)
    desc_ids = [p['id'] for p in desc.json()['items']]
    assert desc_ids == list(reversed(ids_in_creation_order)), msg(
        list(reversed(ids_in_creation_order)), desc_ids
    )

    asc = await admin_client.get(
        '/admin/platforms',
        params={
            'sort_by': 'created_at',
            'sort_order': 'asc',
            'search': 'Created',
        },
    )
    asc_ids = [p['id'] for p in asc.json()['items']]
    assert asc_ids == ids_in_creation_order, msg(ids_in_creation_order, asc_ids)


async def test_admin_platforms_sort_by_applications_count(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """The zero-application row's name sorts last alphabetically ascending
    and first descending - the opposite of its applications_count rank - so
    a regression that maps ``sort_by=applications_count`` onto the name
    column instead would put it first, not the popular one."""
    zero_apps_resp = await admin_client.post(
        '/admin/platforms', json={'name': 'Zeta Count Zero Board'}
    )
    assert zero_apps_resp.status_code == 201
    zero_apps_id = zero_apps_resp.json()['id']

    create_resp = await admin_client.post(
        '/admin/platforms', json={'name': 'Alpha Count Popular Board'}
    )
    platform_id = create_resp.json()['id']

    for _ in range(2):
        app_resp = await admin_client.post(
            '/applications',
            json={
                'company': base_data()['company_acme'].id,
                'role': 'Engineer',
                'mode': 'active',
                'platform_id': platform_id,
                'application_date': '2025-12-01',
            },
        )
        assert app_resp.status_code == 201

    resp = await admin_client.get(
        '/admin/platforms',
        params={
            'sort_by': 'applications_count',
            'sort_order': 'desc',
            'search': 'Count',
        },
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    items = resp.json()['items']
    assert items[0]['id'] == platform_id, msg(platform_id, items[0]['id'])
    assert items[0]['applications_count'] == 2, msg(
        2, items[0]['applications_count']
    )
    assert items[-1]['id'] == zero_apps_id, msg(zero_apps_id, items[-1]['id'])
    assert items[-1]['applications_count'] == 0, msg(
        0, items[-1]['applications_count']
    )

    asc = await admin_client.get(
        '/admin/platforms',
        params={
            'sort_by': 'applications_count',
            'sort_order': 'asc',
            'search': 'Count',
        },
    )
    asc_items = asc.json()['items']
    assert asc_items[-1]['id'] == platform_id, msg(
        platform_id, asc_items[-1]['id']
    )


async def test_admin_platforms_applications_count_excludes_drafts(
    async_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await async_client.post(
        '/platforms', json={'name': 'Draft Count Board'}
    )
    platform_id = create_resp.json()['id']

    draft_resp = await async_client.post(
        '/applications/drafts',
        json={
            'company_id': base_data()['company_acme'].id,
            'company_name': 'Acme Corp',
            'role': 'Draft Role',
            'platform_id': platform_id,
        },
    )
    assert draft_resp.status_code == 201, msg(201, draft_resp.text)

    async with _admin_context():
        listing = await async_client.get(
            '/admin/platforms', params={'search': 'Draft Count Board'}
        )
        row = next(p for p in listing.json()['items'] if p['id'] == platform_id)
        assert row['applications_count'] == 0, msg(0, row['applications_count'])

        delete_resp = await async_client.delete(
            f'/admin/platforms/{platform_id}'
        )
    assert delete_resp.status_code == 409, msg(409, delete_resp.status_code)
    assert delete_resp.json()['detail']


async def test_admin_platforms_created_by_seeded_public_row_is_null(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get(
        '/admin/platforms', params={'search': 'Linkedin'}
    )
    row = next(
        p
        for p in resp.json()['items']
        if p['id'] == str(base_data()['plat_linkedin'].id)
    )
    assert row['created_by'] is None, msg(None, row['created_by'])


async def test_admin_platforms_created_by_own_private_row(
    async_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await async_client.post(
        '/platforms', json={'name': 'Created By Board'}
    )
    platform_id = create_resp.json()['id']

    async with _admin_context():
        listing = await async_client.get(
            '/admin/platforms', params={'search': 'Created By Board'}
        )
    row = next(p for p in listing.json()['items'] if p['id'] == platform_id)
    assert row['created_by']['id'] == str(base_data()['user'].id)
    assert row['created_by']['username'] == base_data()['user'].username


# ── Step and feedback catalogs: retired (R-021) ────────────────────

CATALOG_ROUTES = [
    ('GET', '/admin/step-definitions', None),
    ('POST', '/admin/step-definitions', {'name': 'X', 'color': '#000000'}),
    ('PATCH', '/admin/step-definitions/100', {'name': 'Y'}),
    ('DELETE', '/admin/step-definitions/100', None),
    ('GET', '/admin/feedback-definitions', None),
    ('POST', '/admin/feedback-definitions', {'name': 'X', 'color': '#000'}),
    ('PATCH', '/admin/feedback-definitions/1', {'name': 'Y'}),
    ('DELETE', '/admin/feedback-definitions/1', None),
]


async def test_catalog_routes_are_gone_for_admins(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """Nobody may create, edit or delete a step or feedback definition."""
    for method, route, payload in CATALOG_ROUTES:
        resp = await admin_client.request(method, route, json=payload)
        assert resp.status_code == 404, f'{method} {route}: {resp.status_code}'

    supports = (await admin_client.get('/supports')).json()
    assert [(s['id'], s['name']) for s in supports['steps']] == [
        (str(base_data()['step_applied'].id), 'Applied')
    ]
    assert {f['name'] for f in supports['feedbacks']} == {'Denied', 'Accepted'}


async def test_catalog_routes_are_gone_for_users(
    async_client: AsyncClient, db_session: AsyncSession
):
    for method, route, payload in CATALOG_ROUTES:
        resp = await async_client.request(method, route, json=payload)
        assert resp.status_code == 404, f'{method} {route}: {resp.status_code}'


def test_catalog_routes_are_not_in_openapi():
    paths = main_app.openapi()['paths']
    assert not [p for p in paths if 'step-definitions' in p]
    assert not [p for p in paths if 'feedback-definitions' in p]


# ── Admin stats on the timeline (T030) ────────────────────────────


async def _seed_outcomes(db_session: AsyncSession) -> None:
    """Base user: 4 applications.

    1 offer event, closed; 2 denied event, closed; 3 offer AND denied,
    open; 4 nothing, open.
    """
    await ts.seed(
        db_session,
        *ts.catalog(),
        ts.application(1, finalized_at=ts.closed_at(date(2025, 12, 9))),
        ts.application(2, finalized_at=ts.closed_at(date(2025, 12, 9))),
        ts.application(3),
        ts.application(4),
        ts.event(11, 1, event_type=EventType.OFFER, **ts.offer_salary('1')),
        ts.event(12, 2, event_type=EventType.DENIED),
        ts.event(13, 3, event_type=EventType.OFFER, **ts.offer_salary('1')),
        ts.event(14, 3, event_type=EventType.DENIED),
    )


async def test_admin_stats_read_the_timeline(
    admin_client: AsyncClient, db_session: AsyncSession
):
    await _seed_outcomes(db_session)

    data = (await admin_client.get('/admin/stats')).json()

    assert data['total_applications'] == 4
    assert data['total_offers'] == 2  # accepted = has an offer event
    assert data['total_denials'] == 2  # rejected = has a denied event
    assert data['total_finalized'] == 2  # closed = finalized_at set
    assert data['finalization_rate'] == 50.0
    assert data['global_success_rate'] == 50.0
    # Activity from applications and timeline_events created lately.
    assert data['active_users_30d'] == 1


async def test_admin_user_counts_read_the_timeline(
    admin_client: AsyncClient, db_session: AsyncSession
):
    await _seed_outcomes(db_session)
    user_id = base_data()['user'].id

    detail = (await admin_client.get(f'/admin/users/{user_id}')).json()
    rows = (await admin_client.get('/admin/users')).json()
    [row] = [r for r in rows['items'] if r['id'] == str(user_id)]

    for counts in (detail, row):
        assert counts['total_applications'] == 4
        assert counts['offers'] == 2
        assert counts['denials'] == 2
        assert counts['active_applications'] == 2  # finalized_at IS NULL


async def test_admin_activity_heatmap_counts_timeline_events(
    admin_client: AsyncClient, db_session: AsyncSession
):
    await _seed_outcomes(db_session)

    cells = (await admin_client.get('/admin/stats/activity-heatmap')).json()

    assert sum(cell['count'] for cell in cells) == 4


# ---------------------------------------------------------------------------
# Drafts are excluded from admin statistics and user counts (KODI-032)
# ---------------------------------------------------------------------------


async def test_admin_stats_and_user_counts_exclude_draft(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """A draft that looks as "active" as possible - a company, an offer
    event AND a denied event, closed (``finalized_at`` set), created just
    now - must not move a single number anywhere admin reads applications.
    Only ``count_entity_references`` still sees it (a platform/company it
    uses cannot be deleted, checked separately below)."""
    await _seed_outcomes(db_session)
    user_id = base_data()['user'].id
    company_id = base_data()['company_acme'].id

    before_stats = (await admin_client.get('/admin/stats')).json()
    before_platforms = (
        await admin_client.get('/admin/stats/top-platforms')
    ).json()
    before_companies = (
        await admin_client.get('/admin/stats/top-companies')
    ).json()
    before_detail = (await admin_client.get(f'/admin/users/{user_id}')).json()
    before_users = (await admin_client.get('/admin/users')).json()
    before_admin_companies = (await admin_client.get('/admin/companies')).json()

    await ts.seed(
        db_session,
        ts.application(
            999,
            is_draft=True,
            company_id=company_id,
            finalized_at=ts.closed_at(date.today()),
        ),
        ts.event(199, 999, event_type=EventType.OFFER, **ts.offer_salary('1')),
        ts.event(200, 999, event_type=EventType.DENIED),
    )

    after_stats = (await admin_client.get('/admin/stats')).json()
    after_platforms = (
        await admin_client.get('/admin/stats/top-platforms')
    ).json()
    after_companies = (
        await admin_client.get('/admin/stats/top-companies')
    ).json()
    after_detail = (await admin_client.get(f'/admin/users/{user_id}')).json()
    after_users = (await admin_client.get('/admin/users')).json()
    after_admin_companies = (await admin_client.get('/admin/companies')).json()

    assert after_stats == before_stats, msg(before_stats, after_stats)
    assert after_platforms == before_platforms
    assert after_companies == before_companies
    assert after_detail == before_detail, msg(before_detail, after_detail)
    assert after_users == before_users, msg(before_users, after_users)
    assert after_admin_companies == before_admin_companies, msg(
        before_admin_companies, after_admin_companies
    )


async def test_admin_delete_platform_in_use_by_a_draft_is_still_refused(
    async_client: AsyncClient, db_session: AsyncSession
):
    """``count_entity_references`` keeps counting drafts on purpose - a
    platform a draft uses cannot be deleted from under it."""
    create_resp = await async_client.post(
        '/platforms', json={'name': 'Draft-only Board'}
    )
    platform_id = create_resp.json()['id']

    draft_resp = await async_client.post(
        '/applications/drafts',
        json={
            'company_id': base_data()['company_acme'].id,
            'company_name': 'Acme Corp',
            'role': 'Draft Role',
            'platform_id': platform_id,
        },
    )
    assert draft_resp.status_code == 201, msg(201, draft_resp.text)

    async with as_user(
        base_data()['admin_user'].id, 'adminuser', is_admin=True
    ):
        resp = await async_client.delete(f'/admin/platforms/{platform_id}')
    assert resp.status_code == 409, msg(409, resp.status_code)


# ── R-019 guard (KODI-046, plan corrections 13) ─────────────────────


async def test_admin_delete_of_a_job_sources_platform_is_refused(
    admin_client: AsyncClient, db_session: AsyncSession
):
    """A platform a job source points at is "in use", exactly like one an
    application uses: deleting it would null ``job_sources.platform_id``
    and break job -> draft (R-019)."""
    await seed_sources(db_session)

    resp = await admin_client.delete(
        f'/admin/platforms/{HIMALAYAS_PLATFORM_ID}'
    )

    assert resp.status_code == 409, msg(409, resp.status_code)
    assert resp.json() == {
        'detail': 'Cannot delete: 1 application(s) or job source(s) '
        'reference this platform'
    }
    db_session.expire_all()
    assert await db_session.get(PlatformModel, HIMALAYAS_PLATFORM_ID)
    source = await db_session.get(JobSourceModel, HIMALAYAS_ID)
    assert source is not None
    assert source.platform_id == HIMALAYAS_PLATFORM_ID


async def test_platform_references_add_applications_and_job_sources(
    async_client: AsyncClient, db_session: AsyncSession
):
    await seed_sources(db_session)
    app_resp = await async_client.post(
        '/applications',
        json={
            'company': base_data()['company_acme'].id,
            'role': 'Engineer',
            'mode': 'active',
            'platform_id': str(HIMALAYAS_PLATFORM_ID),
            'application_date': '2025-12-01',
        },
    )
    assert app_resp.status_code == 201, msg(201, app_resp.text)
    repo = AdminRepository(db_session)

    assert (
        await repo.count_entity_references('platform', HIMALAYAS_PLATFORM_ID)
        == 2
    )
    assert (
        await repo.count_entity_references(
            'platform', base_data()['plat_linkedin'].id
        )
        == 0
    )
