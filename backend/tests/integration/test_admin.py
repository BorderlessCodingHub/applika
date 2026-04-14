from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from tests import msg
from tests.base_db_setup import base_data


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
    '/admin/step-definitions',
    '/admin/feedback-definitions',
]


async def test_non_admin_gets_403_on_all_get_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    """Regular (non-admin) user must get 403 on every admin GET."""
    for route in ADMIN_GET_ROUTES:
        resp = await async_client.get(route)
        assert resp.status_code == 403, (
            f'{route}: {msg(403, resp.status_code)}'
        )


async def test_non_admin_gets_403_on_post_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    post_routes = [
        ('/admin/companies', {'name': 'X', 'url': 'https://x.com'}),
        ('/admin/platforms', {'name': 'X', 'url': 'https://x.com'}),
        (
            '/admin/step-definitions',
            {'name': 'X', 'color': '#000000', 'strict': False},
        ),
        (
            '/admin/feedback-definitions',
            {'name': 'X', 'color': '#000000'},
        ),
    ]
    for route, payload in post_routes:
        resp = await async_client.post(route, json=payload)
        assert resp.status_code == 403, (
            f'{route}: {msg(403, resp.status_code)}'
        )


async def test_non_admin_gets_403_on_patch_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    patch_routes = [
        ('/admin/users/1', {'is_admin': True}),
        ('/admin/companies/1', {'name': 'Y'}),
        ('/admin/platforms/1', {'name': 'Y'}),
        ('/admin/step-definitions/1', {'name': 'Y'}),
        ('/admin/feedback-definitions/1', {'name': 'Y'}),
    ]
    for route, payload in patch_routes:
        resp = await async_client.patch(route, json=payload)
        assert resp.status_code == 403, (
            f'{route}: {msg(403, resp.status_code)}'
        )


async def test_non_admin_gets_403_on_delete_routes(
    async_client: AsyncClient, db_session: AsyncSession
):
    delete_routes = [
        '/admin/companies/9999',
        '/admin/platforms/9999',
        '/admin/step-definitions/9999',
        '/admin/feedback-definitions/9999',
    ]
    for route in delete_routes:
        resp = await async_client.delete(route)
        assert resp.status_code == 403, (
            f'{route}: {msg(403, resp.status_code)}'
        )


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
    assert any(
        u['username'] == 'adminuser' for u in data['items']
    )


async def test_admin_get_user_detail(
    admin_client: AsyncClient, db_session: AsyncSession
):
    user_id = base_data()['user'].id
    resp = await admin_client.get(f'/admin/users/{user_id}')
    assert resp.status_code == 200, msg(200, resp.status_code)
    data = resp.json()
    assert data['username'] == 'testuser'


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


# ── Admin Step Definitions CRUD ───────────────────────────────────


async def test_admin_create_step_definition(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/step-definitions',
        json={'name': 'Phone Screen', 'color': '#ff5500', 'strict': False},
    )
    assert resp.status_code == 201, msg(201, resp.status_code)
    assert resp.json()['name'] == 'Phone Screen'


async def test_admin_list_step_definitions(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/step-definitions')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


async def test_admin_update_step_definition(
    admin_client: AsyncClient, db_session: AsyncSession
):
    step_id = base_data()['step_applied'].id
    resp = await admin_client.patch(
        f'/admin/step-definitions/{step_id}',
        json={'name': 'Applied (Updated)'},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['name'] == 'Applied (Updated)'


async def test_admin_delete_step_definition_no_refs(
    admin_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await admin_client.post(
        '/admin/step-definitions',
        json={'name': 'TempStep', 'color': '#aabbcc', 'strict': False},
    )
    step_id = create_resp.json()['id']

    resp = await admin_client.delete(
        f'/admin/step-definitions/{step_id}'
    )
    assert resp.status_code == 204, msg(204, resp.status_code)


# ── Admin Feedback Definitions CRUD ───────────────────────────────


async def test_admin_create_feedback_definition(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.post(
        '/admin/feedback-definitions',
        json={'name': 'Ghosted', 'color': '#888888'},
    )
    assert resp.status_code == 201, msg(201, resp.status_code)
    assert resp.json()['name'] == 'Ghosted'


async def test_admin_list_feedback_definitions(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.get('/admin/feedback-definitions')
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert isinstance(resp.json(), list)
    assert len(resp.json()) >= 1


async def test_admin_update_feedback_definition(
    admin_client: AsyncClient, db_session: AsyncSession
):
    fb_id = base_data()['fb_denied'].id
    resp = await admin_client.patch(
        f'/admin/feedback-definitions/{fb_id}',
        json={'name': 'Rejected'},
    )
    assert resp.status_code == 200, msg(200, resp.status_code)
    assert resp.json()['name'] == 'Rejected'


async def test_admin_update_feedback_definition_not_found(
    admin_client: AsyncClient, db_session: AsyncSession
):
    resp = await admin_client.patch(
        '/admin/feedback-definitions/999999',
        json={'name': 'Ghost'},
    )
    assert resp.status_code == 404, msg(404, resp.status_code)


async def test_admin_delete_feedback_definition_no_refs(
    admin_client: AsyncClient, db_session: AsyncSession
):
    create_resp = await admin_client.post(
        '/admin/feedback-definitions',
        json={'name': 'TempFB', 'color': '#cccccc'},
    )
    fb_id = create_resp.json()['id']

    resp = await admin_client.delete(
        f'/admin/feedback-definitions/{fb_id}'
    )
    assert resp.status_code == 204, msg(204, resp.status_code)
