from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.enums import EventType
from app.domain.models import CompanyModel, PlatformModel
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.integration import timeline_seed as ts
from tests.integration.conftest import as_user

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
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


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
        row = next(r for r in listing.json() if r['id'] == platform_id)
        assert row['is_public'] is False
        assert row['created_by']['id'] == str(base_data()['user'].id)

        public_only = await async_client.get(
            '/admin/platforms?visibility=public'
        )
    ids = [r['id'] for r in public_only.json()]
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
