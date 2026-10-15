"""``GET /users/me/features`` and ``/admin/features*`` against the
testcontainers Postgres (KODI-052, ADR-0018, T024; PRD 0013 R-001, R-005,
R-006..R-011, R-013..R-017, R-027).

The ``jobs`` row is inserted as revision ``641001baff09`` seeds it. One
``async_client`` switches identity with ``as_user`` (the app's overrides are
global, so ``admin_client`` and ``async_client`` cannot both be used).
"""

import asyncio
from datetime import datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.config.db import get_session
from app.domain.models import FeatureModel, UserModel
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.features_seed import (
    JOBS_DESCRIPTION,
    JOBS_NAME,
    enrol,
    opt_out,
    seed_jobs_feature,
)
from tests.integration.conftest import as_user
from tests.integration.jobs_seed import seed_sources
from tests.integration.test_jobs_api import add_job

USER_ID = base_data()['user'].id
ADMIN_ID = base_data()['admin_user'].id
OTHER_ADMIN_ID = 9100000000000000001
JOBS = [{'key': 'jobs', 'stage': 'beta'}]
FEATURE_NOT_FOUND = {'detail': 'Feature not found'}
USER_NOT_FOUND = {'detail': 'User not found'}
ROW_KEYS = {
    'key',
    'name',
    'description',
    'stage',
    'beta_user_count',
    'released_at',
    'updated_at',
    'me',
}


def as_admin(user_id: int = ADMIN_ID, name: str = 'adminuser'):
    return as_user(user_id, name, is_admin=True)


def as_plain(is_admin: bool = False):
    return as_user(USER_ID, 'testuser', is_admin=is_admin)


@pytest_asyncio.fixture
async def jobs(db_session: AsyncSession) -> int:
    return await seed_jobs_feature(db_session)


@pytest_asyncio.fixture
async def other_admin(db_session: AsyncSession) -> int:
    db_session.add(
        UserModel(
            id=OTHER_ADMIN_ID,
            github_id=OTHER_ADMIN_ID,
            username='otheradmin',
            email='other@admin.com',
            is_admin=True,
        )
    )
    await db_session.commit()
    return OTHER_ADMIN_ID


async def add_users(
    session: AsyncSession, names: list[str], first_id: int = 9200000000000000001
) -> list[int]:
    ids = []
    for offset, name in enumerate(names):
        user_id = first_id + offset
        session.add(
            UserModel(
                id=user_id,
                github_id=user_id,
                username=name,
                email=f'{name}@user.com',
            )
        )
        ids.append(user_id)
    await session.commit()
    return ids


async def my_features(client: AsyncClient) -> list[dict]:
    response = await client.get('/users/me/features')
    assert response.status_code == 200, msg(200, response.text)
    assert set(response.json()) == {'features'}
    return response.json()['features']


async def admin_row(client: AsyncClient, key: str = 'jobs') -> dict:
    response = await client.get('/admin/features')
    assert response.status_code == 200, msg(200, response.text)
    return next(row for row in response.json() if row['key'] == key)


async def list_rows(session: AsyncSession, table: str) -> int:
    return int(await session.scalar(text(f'SELECT count(*) FROM {table}')) or 0)


async def put_user(client: AsyncClient, user_id: int, key: str = 'jobs'):
    return await client.put(f'/admin/features/{key}/users/{user_id}')


async def set_stage(client: AsyncClient, stage: str, key: str = 'jobs'):
    return await client.patch(f'/admin/features/{key}', json={'stage': stage})


# ---------------------------------------------------------------------------
# GET /users/me/features (R-005, R-013, R-015, R-017)
# ---------------------------------------------------------------------------


async def test_my_features_none_then_listed_then_general(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    assert await my_features(async_client) == []

    await enrol(db_session, USER_ID)
    assert await my_features(async_client) == JOBS

    await db_session.execute(text('DELETE FROM feature_beta_users'))
    await db_session.execute(text("UPDATE features SET stage = 'general'"))
    await db_session.commit()
    assert await my_features(async_client) == [
        {'key': 'jobs', 'stage': 'general'}
    ]


async def test_my_features_for_an_admin_by_default_opted_out_and_listed(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        assert await my_features(async_client) == JOBS
        await opt_out(db_session, ADMIN_ID)
        assert await my_features(async_client) == []
        await enrol(db_session, ADMIN_ID)
        assert await my_features(async_client) == JOBS


async def test_my_features_are_the_callers_own_and_ordered_by_key(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    db_session.add_all([
        FeatureModel(id=8300000000000000001, key='zeta', name='Z'),
        FeatureModel(
            id=8300000000000000002, key='alpha', name='A', stage='general'
        ),
    ])
    await db_session.commit()
    await enrol(db_session, ADMIN_ID, 8300000000000000001)
    await enrol(db_session, USER_ID)

    assert await my_features(async_client) == [
        {'key': 'alpha', 'stage': 'general'},
        {'key': 'jobs', 'stage': 'beta'},
    ]
    async with as_admin():
        await opt_out(db_session, ADMIN_ID)
        assert await my_features(async_client) == [
            {'key': 'alpha', 'stage': 'general'},
            {'key': 'zeta', 'stage': 'beta'},
        ]


async def test_users_me_is_unchanged_by_the_new_route(
    async_client: AsyncClient, jobs
):
    """CLI route: ``/users/me`` carries no feature field."""
    response = await async_client.get('/users/me')
    assert response.status_code == 200
    assert 'features' not in response.json()


# ---------------------------------------------------------------------------
# Access to /admin/features* (ADR-0004: AdminUserDp)
# ---------------------------------------------------------------------------

ADMIN_CALLS = [
    ('GET', '/admin/features', None),
    ('PATCH', '/admin/features/jobs', {'stage': 'general'}),
    ('GET', '/admin/features/jobs/users', None),
    ('PUT', f'/admin/features/jobs/users/{USER_ID}', None),
    ('DELETE', f'/admin/features/jobs/users/{USER_ID}', None),
    ('PUT', '/admin/features/jobs/opt-out', None),
    ('DELETE', '/admin/features/jobs/opt-out', None),
]


async def test_every_admin_route_is_403_for_a_listed_non_admin(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    await enrol(db_session, USER_ID)
    for method, path, body in ADMIN_CALLS:
        response = await async_client.request(method, path, json=body)
        assert response.status_code == 403, msg(403, (method, path))
    assert await list_rows(db_session, 'feature_admin_opt_outs') == 0
    stage = await db_session.scalar(text('SELECT stage FROM features'))
    assert stage == 'beta'


@pytest_asyncio.fixture
async def anonymous_client(async_engine: AsyncEngine):
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with maker() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(
        transport=ASGITransport(app=main_app), base_url='http://test/api'
    ) as client:
        yield client
    main_app.dependency_overrides.clear()


async def test_every_admin_route_and_my_features_are_401_anonymous(
    anonymous_client: AsyncClient, db_session: AsyncSession, jobs
):
    for method, path, body in [
        *ADMIN_CALLS,
        ('GET', '/users/me/features', None),
    ]:
        response = await anonymous_client.request(method, path, json=body)
        assert response.status_code == 401, msg(401, (method, path))


# ---------------------------------------------------------------------------
# GET /admin/features (R-001, R-006)
# ---------------------------------------------------------------------------


async def test_list_carries_every_contract_field(
    async_client: AsyncClient, jobs
):
    async with as_admin():
        response = await async_client.get('/admin/features')
    assert response.status_code == 200
    rows = response.json()
    assert len(rows) == 1
    row = rows[0]
    assert set(row) == ROW_KEYS
    assert row['key'] == 'jobs'
    assert row['name'] == JOBS_NAME
    assert row['description'] == JOBS_DESCRIPTION
    assert row['stage'] == 'beta'
    assert row['beta_user_count'] == 0
    assert row['released_at'] is None
    datetime.fromisoformat(row['updated_at'])
    assert row['me'] == {'has': True, 'via': 'admin', 'opted_out': False}


async def test_list_is_ordered_by_key_and_shows_a_null_description(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    db_session.add(FeatureModel(id=8300000000000000003, key='agenda', name='A'))
    await db_session.commit()
    async with as_admin():
        rows = (await async_client.get('/admin/features')).json()
    assert [r['key'] for r in rows] == ['agenda', 'jobs']
    assert rows[0]['description'] is None


async def test_count_is_list_rows_only_never_admins_by_role(
    async_client: AsyncClient, db_session: AsyncSession, jobs, other_admin
):
    """Two admins have it as admins, one user is listed: the count is 1."""
    await enrol(db_session, USER_ID)
    async with as_admin():
        row = await admin_row(async_client)
    assert row['beta_user_count'] == 1
    assert row['me']['via'] == 'admin'


# ---------------------------------------------------------------------------
# GET /admin/features/{key}/users (R-007)
# ---------------------------------------------------------------------------


async def test_beta_list_is_newest_first_with_who_added_them(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    ids = await add_users(db_session, ['ann', 'bob', 'cid'])
    async with as_admin():
        for user_id in ids:
            assert (await put_user(async_client, user_id)).status_code == 204
        response = await async_client.get('/admin/features/jobs/users')

    assert response.status_code == 200
    page = response.json()
    assert set(page) == {'items', 'total', 'page', 'per_page', 'total_pages'}
    assert (page['total'], page['page'], page['per_page']) == (3, 1, 25)
    assert page['total_pages'] == 1
    assert [i['username'] for i in page['items']] == ['cid', 'bob', 'ann']
    first = page['items'][0]
    assert set(first) == {
        'user_id',
        'username',
        'email',
        'added_at',
        'added_by',
    }
    assert first['user_id'] == str(ids[2])
    assert first['email'] == 'cid@user.com'
    assert first['added_by'] == {'id': str(ADMIN_ID), 'username': 'adminuser'}
    datetime.fromisoformat(first['added_at'])


async def test_beta_list_search_and_paging(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    ids = await add_users(
        db_session, ['dev_one', 'devXone', 'dev_two', 'ops_one']
    )
    for user_id in ids:
        await enrol(db_session, user_id, added_by=ADMIN_ID)

    async with as_admin():
        found = (
            await async_client.get(
                '/admin/features/jobs/users', params={'search': 'DEV_'}
            )
        ).json()
        paged = (
            await async_client.get(
                '/admin/features/jobs/users',
                params={'per_page': 3, 'page': 2},
            )
        ).json()

    # ``_`` matches only itself: ``devXone`` is out.
    assert [i['username'] for i in found['items']] == ['dev_two', 'dev_one']
    assert found['total'] == 2
    assert paged['total'] == 4
    assert paged['total_pages'] == 2
    assert [i['username'] for i in paged['items']] == ['dev_one']


@pytest.mark.parametrize(
    'params',
    [{'search': 'x' * 101}, {'page': 0}, {'per_page': 0}, {'per_page': 101}],
)
async def test_beta_list_refuses_out_of_range_query(
    async_client: AsyncClient, jobs, params
):
    async with as_admin():
        response = await async_client.get(
            '/admin/features/jobs/users', params=params
        )
    assert response.status_code == 422, msg(422, (params, response.text))


async def test_added_by_is_null_once_the_adding_admin_is_gone(
    async_client: AsyncClient, db_session: AsyncSession, jobs, other_admin
):
    async with as_admin(OTHER_ADMIN_ID, 'otheradmin'):
        assert (await put_user(async_client, USER_ID)).status_code == 204
    await db_session.execute(
        text('DELETE FROM users WHERE id = :id'), {'id': OTHER_ADMIN_ID}
    )
    await db_session.commit()

    async with as_admin():
        page = (await async_client.get('/admin/features/jobs/users')).json()
    assert page['items'][0]['username'] == 'testuser'
    assert page['items'][0]['added_by'] is None


# ---------------------------------------------------------------------------
# PUT / DELETE /admin/features/{key}/users/{user_id} (R-008, R-009)
# ---------------------------------------------------------------------------


async def test_add_twice_is_one_row_and_remove_twice_is_204_both(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        assert (await put_user(async_client, USER_ID)).status_code == 204
        assert (await put_user(async_client, USER_ID)).status_code == 204
        assert await list_rows(db_session, 'feature_beta_users') == 1
        assert (await admin_row(async_client))['beta_user_count'] == 1

        for _ in range(2):
            response = await async_client.delete(
                f'/admin/features/jobs/users/{USER_ID}'
            )
            assert response.status_code == 204
    assert await list_rows(db_session, 'feature_beta_users') == 0


async def test_two_adds_at_once_leave_one_row(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        responses = await asyncio.gather(
            put_user(async_client, USER_ID), put_user(async_client, USER_ID)
        )
    assert [r.status_code for r in responses] == [204, 204]
    assert await list_rows(db_session, 'feature_beta_users') == 1


async def test_add_an_unknown_user_is_404_user_not_found(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        response = await put_user(async_client, 9999999999999999)
    assert response.status_code == 404
    assert response.json() == USER_NOT_FOUND
    assert await list_rows(db_session, 'feature_beta_users') == 0


async def test_remove_an_unknown_user_is_a_no_op(
    async_client: AsyncClient, jobs
):
    async with as_admin():
        response = await async_client.delete(
            '/admin/features/jobs/users/9999999999999999'
        )
    assert response.status_code == 204


async def test_an_unknown_key_is_404_feature_not_found_on_every_route(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        for method, path, body in [
            ('PATCH', '/admin/features/nope', {'stage': 'general'}),
            ('GET', '/admin/features/nope/users', None),
            ('PUT', f'/admin/features/nope/users/{USER_ID}', None),
            ('DELETE', f'/admin/features/nope/users/{USER_ID}', None),
            ('PUT', '/admin/features/nope/opt-out', None),
            ('DELETE', '/admin/features/nope/opt-out', None),
        ]:
            response = await async_client.request(method, path, json=body)
            assert response.status_code == 404, msg(404, (method, path))
            assert response.json() == FEATURE_NOT_FOUND
    assert await list_rows(db_session, 'feature_beta_users') == 0
    assert await list_rows(db_session, 'feature_admin_opt_outs') == 0


async def test_unknown_key_is_checked_before_the_user(
    async_client: AsyncClient, jobs
):
    async with as_admin():
        response = await put_user(async_client, 9999999999999999, key='nope')
    assert response.json() == FEATURE_NOT_FOUND


# ---------------------------------------------------------------------------
# PATCH /admin/features/{key} (R-010, R-011, R-016)
# ---------------------------------------------------------------------------


async def test_release_sets_released_at_and_keeps_the_list(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    await enrol(db_session, USER_ID)
    async with as_admin():
        response = await set_stage(async_client, 'general')

    assert response.status_code == 200, msg(200, response.text)
    row = response.json()
    assert set(row) == ROW_KEYS
    assert row['stage'] == 'general'
    assert row['released_at'] is not None
    assert row['beta_user_count'] == 1
    assert row['me'] == {'has': True, 'via': 'general', 'opted_out': False}
    assert await list_rows(db_session, 'feature_beta_users') == 1


async def test_move_back_clears_released_at_keeps_the_list_and_hides_again(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    await seed_sources(db_session)
    await add_job(db_session)
    other = (await add_users(db_session, ['listed']))[0]
    await enrol(db_session, other)
    async with as_admin():
        await set_stage(async_client, 'general')
    assert (await async_client.get('/jobs')).status_code == 200

    async with as_admin():
        response = await set_stage(async_client, 'beta')

    row = response.json()
    assert response.status_code == 200
    assert row['stage'] == 'beta'
    assert row['released_at'] is None
    assert row['beta_user_count'] == 1
    unlisted = await async_client.get('/jobs')
    assert unlisted.status_code == 404
    assert unlisted.json() == {'detail': 'Not Found'}
    async with as_user(other, 'listed'):
        assert (await async_client.get('/jobs')).status_code == 200


async def test_same_stage_is_a_no_op_200_with_the_row(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        await set_stage(async_client, 'general')
        released = await db_session.scalar(
            text('SELECT released_at FROM features')
        )
        response = await set_stage(async_client, 'general')
        again = await set_stage(async_client, 'general')

    assert response.status_code == 200
    assert again.json()['released_at'] == response.json()['released_at']
    assert (
        await db_session.scalar(text('SELECT released_at FROM features'))
        == released
    )
    async with as_admin():
        beta = await set_stage(async_client, 'beta')
        beta_again = await set_stage(async_client, 'beta')
    assert beta.json()['released_at'] is None
    assert beta_again.status_code == 200
    assert beta_again.json()['stage'] == 'beta'


async def test_the_list_can_be_edited_while_general(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        await set_stage(async_client, 'general')
        assert (await put_user(async_client, USER_ID)).status_code == 204
        assert (await admin_row(async_client))['beta_user_count'] == 1
        response = await async_client.delete(
            f'/admin/features/jobs/users/{USER_ID}'
        )
        assert response.status_code == 204
        assert (await admin_row(async_client))['beta_user_count'] == 0


@pytest.mark.parametrize(
    'body',
    [
        {'stage': 'alpha'},
        {'stage': 'general', 'name': 'Renamed'},
        {},
        {'stage': None},
    ],
)
async def test_stage_body_is_strict(
    async_client: AsyncClient, db_session: AsyncSession, jobs, body
):
    async with as_admin():
        response = await async_client.patch('/admin/features/jobs', json=body)
    assert response.status_code == 422, msg(422, (body, response.text))
    feature = await db_session.scalar(text('SELECT stage FROM features'))
    assert feature == 'beta'


# ---------------------------------------------------------------------------
# PUT / DELETE /admin/features/{key}/opt-out (R-013..R-017)
# ---------------------------------------------------------------------------


async def test_opt_out_and_in_are_idempotent_and_me_follows(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        for _ in range(2):
            response = await async_client.put('/admin/features/jobs/opt-out')
            assert response.status_code == 204
        assert await list_rows(db_session, 'feature_admin_opt_outs') == 1
        assert (await admin_row(async_client))['me'] == {
            'has': False,
            'via': None,
            'opted_out': True,
        }
        assert await my_features(async_client) == []

        for _ in range(2):
            response = await async_client.delete('/admin/features/jobs/opt-out')
            assert response.status_code == 204
        assert (await admin_row(async_client))['me'] == {
            'has': True,
            'via': 'admin',
            'opted_out': False,
        }
        assert await my_features(async_client) == JOBS
    assert await list_rows(db_session, 'feature_admin_opt_outs') == 0


async def test_opt_out_touches_only_the_calling_admin(
    async_client: AsyncClient, db_session: AsyncSession, jobs, other_admin
):
    async with as_admin():
        await async_client.put('/admin/features/jobs/opt-out')
    rows = (
        await db_session.execute(
            text('SELECT user_id FROM feature_admin_opt_outs')
        )
    ).all()
    assert [r.user_id for r in rows] == [ADMIN_ID]

    async with as_admin(OTHER_ADMIN_ID, 'otheradmin'):
        assert await my_features(async_client) == JOBS
        assert (await admin_row(async_client))['me']['opted_out'] is False
        # The other admin's DELETE removes only their own (absent) row.
        await async_client.delete('/admin/features/jobs/opt-out')
    assert await list_rows(db_session, 'feature_admin_opt_outs') == 1
    assert await my_features(async_client) == []  # the plain user


async def test_opt_out_is_stored_in_general_and_counts_again_in_beta(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        await set_stage(async_client, 'general')
        assert (
            await async_client.put('/admin/features/jobs/opt-out')
        ).status_code == 204
        assert (await admin_row(async_client))['me'] == {
            'has': True,
            'via': 'general',
            'opted_out': True,
        }
        assert await my_features(async_client) == [
            {'key': 'jobs', 'stage': 'general'}
        ]

        await set_stage(async_client, 'beta')
        assert (await admin_row(async_client))['me'] == {
            'has': False,
            'via': None,
            'opted_out': True,
        }
        assert await my_features(async_client) == []

        await set_stage(async_client, 'general')
        await set_stage(async_client, 'beta')
        assert (await admin_row(async_client))['me']['opted_out'] is True
    assert await list_rows(db_session, 'feature_admin_opt_outs') == 1


async def test_listed_admin_keeps_it_after_opting_out(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    """R-017 and plan correction 9: listed + opted out still has it, via
    the list; the opt-out is stored and shown."""
    await enrol(db_session, ADMIN_ID)
    async with as_admin():
        await async_client.put('/admin/features/jobs/opt-out')
        row = await admin_row(async_client)
        assert row['me'] == {'has': True, 'via': 'list', 'opted_out': True}
        assert row['beta_user_count'] == 1
        assert await my_features(async_client) == JOBS


# ---------------------------------------------------------------------------
# Account deletion and R-027
# ---------------------------------------------------------------------------


async def test_deleting_an_account_removes_its_list_and_opt_out_rows(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    await enrol(db_session, USER_ID)
    await opt_out(db_session, USER_ID)

    assert (await async_client.delete('/users/me')).status_code == 204

    for table in ('feature_beta_users', 'feature_admin_opt_outs'):
        count = await db_session.scalar(
            text(f'SELECT count(*) FROM {table} WHERE user_id = :id'),
            {'id': USER_ID},
        )
        assert count == 0, msg(f'0 rows in {table}', count)
    assert await list_rows(db_session, 'features') == 1


async def _make_job_work(client: AsyncClient, session: AsyncSession) -> int:
    await seed_sources(session)
    job_id = await add_job(session)
    assert (await client.put(f'/jobs/{job_id}/dismissal')).status_code == 204
    created = await client.post(
        '/job-searches', json={'name': 'Remote', 'filters': {'search': 'go'}}
    )
    assert created.status_code == 201, msg(201, created.text)
    return job_id


async def _job_state(client: AsyncClient) -> tuple[list, list]:
    searches = (await client.get('/job-searches')).json()
    marks = [
        (item['id'], item['dismissed'])
        for item in (
            await client.get('/jobs', params={'include_dismissed': True})
        ).json()['items']
    ]
    return searches, marks


async def test_remove_and_add_back_keeps_searches_and_dismissals(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    await enrol(db_session, USER_ID)
    job_id = await _make_job_work(async_client, db_session)
    before = await _job_state(async_client)
    assert before[1] == [(str(job_id), True)]

    async with as_admin():
        await async_client.delete(f'/admin/features/jobs/users/{USER_ID}')
    assert (await async_client.get('/job-searches')).status_code == 404
    for table in ('saved_job_searches', 'job_dismissals'):
        assert await list_rows(db_session, table) == 1

    async with as_admin():
        assert (await put_user(async_client, USER_ID)).status_code == 204
    assert await _job_state(async_client) == before


async def test_admin_opt_out_and_in_keeps_their_searches_and_dismissals(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        await _make_job_work(async_client, db_session)
        before = await _job_state(async_client)

        await async_client.put('/admin/features/jobs/opt-out')
        assert (await async_client.get('/job-searches')).status_code == 404
        for table in ('saved_job_searches', 'job_dismissals'):
            assert await list_rows(db_session, table) == 1

        await async_client.delete('/admin/features/jobs/opt-out')
        assert await _job_state(async_client) == before


# ---------------------------------------------------------------------------
# The E2E seed resets the beta features (plan corrections 2 and 8)
# ---------------------------------------------------------------------------


async def test_e2e_seed_reset_against_postgres(
    async_engine: AsyncEngine,
    db_session: AsyncSession,
    jobs,
    other_admin,
    monkeypatch,
):
    """Whatever a crashed spec left - released, the Discord user listed,
    the admin opted out - one reset gives the same state."""
    from app.scripts import seed_e2e

    discord_id = (await add_users(db_session, ['e2e-discord']))[0]
    await enrol(db_session, discord_id)
    await opt_out(db_session, ADMIN_ID)
    await db_session.execute(
        text("UPDATE features SET stage = 'general', released_at = now()")
    )
    await db_session.commit()
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    monkeypatch.setattr(seed_e2e, 'AsyncLocalSession', maker)
    identities = (
        seed_e2e.Identity(github_id=USER_ID, user_id=USER_ID),
        seed_e2e.Identity(github_id=ADMIN_ID, user_id=ADMIN_ID),
        seed_e2e.Identity(github_id=discord_id, user_id=discord_id),
    )

    for _ in range(2):  # idempotent
        await seed_e2e.reset_beta_features(*identities)

    feature = (
        await db_session.execute(
            text('SELECT stage, released_at FROM features')
        )
    ).one()
    assert (feature.stage, feature.released_at) == ('beta', None)
    listed = (
        await db_session.execute(
            text('SELECT user_id, added_by FROM feature_beta_users')
        )
    ).all()
    assert [(r.user_id, r.added_by) for r in listed] == [(USER_ID, ADMIN_ID)]
    assert await list_rows(db_session, 'feature_admin_opt_outs') == 0


async def test_beta_list_search_escapes_percent(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    ids = await add_users(db_session, ['a%b', 'axxb'])
    for user_id in ids:
        await enrol(db_session, user_id)
    async with as_admin():
        page = (
            await async_client.get(
                '/admin/features/jobs/users', params={'search': 'a%b'}
            )
        ).json()
    assert [i['username'] for i in page['items']] == ['a%b']


async def test_stage_change_bumps_updated_at(
    async_client: AsyncClient, db_session: AsyncSession, jobs
):
    async with as_admin():
        before = (await admin_row(async_client))['updated_at']
        after = (await set_stage(async_client, 'general')).json()['updated_at']
    assert datetime.fromisoformat(after) > datetime.fromisoformat(before)
    stored = await db_session.scalar(text('SELECT updated_at FROM features'))
    assert stored is not None


async def test_a_user_deleted_between_the_check_and_the_insert_is_404(
    async_client: AsyncClient, db_session: AsyncSession, jobs, monkeypatch
):
    """The race branch of ``add_user``: the FK refuses the row, the answer
    is the same 404 and the session is usable again."""
    from app.domain.repositories.feature_repository import FeatureRepository

    async def _exists(self, user_id: int) -> bool:
        return True

    monkeypatch.setattr(FeatureRepository, 'user_exists', _exists)
    async with as_admin():
        response = await put_user(async_client, 9999999999999999)
        assert response.status_code == 404
        assert response.json() == USER_NOT_FOUND
        assert (await put_user(async_client, USER_ID)).status_code == 204
    assert await list_rows(db_session, 'feature_beta_users') == 1
