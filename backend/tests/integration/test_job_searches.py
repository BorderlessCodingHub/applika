"""Saved job searches (KODI-047, T072; PRD 0012 R-030, R-032) against the
testcontainers Postgres: at most ten per user, names unique per user
ignoring case, per user only (admins included), and nothing that notifies.
"""

import asyncio
import re
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
)

from app.config.db import get_session
from app.domain.models import UserModel
from app.main import app as main_app
from tests import msg
from tests.base_db_setup import base_data
from tests.features_seed import enrol
from tests.integration.conftest import SECOND_USER_ID, as_user

# KODI-052 (ADR-0018): every route here sits behind the "jobs" beta
# feature; ``jobs_beta`` seeds it and puts the ``async_client`` user on its
# list.
pytestmark = pytest.mark.usefixtures('jobs_beta')


@pytest_asyncio.fixture
async def second_user(
    second_user: UserModel, db_session: AsyncSession, jobs_beta: int
) -> UserModel:
    """The conftest second user, on the "jobs" beta list too (KODI-052)."""
    await enrol(db_session, second_user.id, jobs_beta)
    return second_user


LIMIT = 'Saved search limit reached (max 10)'
TAKEN = 'A saved search with this name already exists'
ADMIN_ID = base_data()['admin_user'].id

FULL_FILTERS = {
    'search': 'python',
    'source': 'remoteok',
    'tags': ['django', 'aws'],
    'min_fit': 60,
    'posted_within_days': 7,
    'sort': 'fit',
    'include_dismissed': True,
}
DEFAULT_FILTERS = {
    'search': None,
    'source': None,
    'tags': [],
    'min_fit': None,
    'posted_within_days': None,
    'sort': 'newest',
    'include_dismissed': False,
}


async def create(client: AsyncClient, name: str, filters: dict | None = None):
    return await client.post(
        '/job-searches', json={'name': name, 'filters': filters or {}}
    )


async def created(client: AsyncClient, name: str, **filters: Any) -> dict:
    response = await create(client, name, filters)
    assert response.status_code == 201, msg(201, response.text)
    return response.json()


async def names(client: AsyncClient) -> list[str]:
    response = await client.get('/job-searches')
    assert response.status_code == 200, msg(200, response.text)
    return [row['name'] for row in response.json()]


@pytest_asyncio.fixture
async def raw_client(async_engine: AsyncEngine):
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async def override_get_session():
        async with maker() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session
    async with AsyncClient(
        transport=ASGITransport(app=main_app), base_url='http://test/api'
    ) as client:
        yield client
    main_app.dependency_overrides.pop(get_session, None)


async def test_create_returns_the_search_and_filters_round_trip(
    async_client: AsyncClient,
):
    response = await create(async_client, '  Remote Python  ', FULL_FILTERS)

    assert response.status_code == 201, msg(201, response.text)
    body = response.json()
    assert set(body) == {'id', 'name', 'filters', 'created_at', 'updated_at'}
    assert body['name'] == 'Remote Python'
    assert body['filters'] == FULL_FILTERS
    listed = (await async_client.get('/job-searches')).json()
    assert listed == [body]


async def test_unset_filters_read_back_as_the_defaults(
    async_client: AsyncClient,
):
    body = await created(async_client, 'Everything')

    assert body['filters'] == DEFAULT_FILTERS


async def test_listed_by_name_ignoring_case(async_client: AsyncClient):
    for name in ('beta', 'Alpha', 'gamma', 'Delta'):
        await created(async_client, name)

    assert await names(async_client) == ['Alpha', 'beta', 'Delta', 'gamma']


async def test_eleventh_is_409_and_ten_stay(async_client: AsyncClient):
    for i in range(10):
        await created(async_client, f'Search {i}')

    response = await create(async_client, 'Search 10')

    assert response.status_code == 409, msg(409, response.text)
    assert response.json() == {'detail': LIMIT}
    assert len(await names(async_client)) == 10


async def test_concurrent_creates_never_pass_ten(async_client: AsyncClient):
    for i in range(9):
        await created(async_client, f'Search {i}')

    responses = await asyncio.gather(
        create(async_client, 'Racer A'), create(async_client, 'Racer B')
    )

    assert sorted(r.status_code for r in responses) == [201, 409]
    loser = next(r for r in responses if r.status_code == 409)
    assert loser.json() == {'detail': LIMIT}
    assert len(await names(async_client)) == 10


async def test_the_user_lock_serialises_the_count(
    async_client: AsyncClient, async_engine: AsyncEngine
):
    """Deterministic interleaving: A holds the user lock while B starts; B
    must wait for A's commit, then count ten and refuse. Without the lock B
    would count nine and insert an eleventh."""
    from app.application.dto.job_search import JobSearchInputDTO
    from app.application.use_cases.job_searches.create_search import (
        CreateJobSearchUseCase,
    )
    from app.core.exceptions import ResourceConflict
    from app.domain.repositories.saved_job_search_repository import (
        SavedJobSearchRepository,
    )

    user_id = base_data()['user'].id
    for i in range(9):
        await created(async_client, f'Search {i}')
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)

    async with maker() as session_a, maker() as session_b:
        repo_a = SavedJobSearchRepository(session_a)
        await repo_a.lock_user(user_id)
        assert await repo_a.count_by_user_id(user_id) == 9

        b = asyncio.create_task(
            CreateJobSearchUseCase(SavedJobSearchRepository(session_b)).execute(
                JobSearchInputDTO(user_id=user_id, name='B', filters={})
            )
        )
        await asyncio.sleep(0.3)
        assert not b.done()
        await repo_a.create(user_id, 'A', {})

        with pytest.raises(ResourceConflict, match=re.escape(LIMIT)):
            await b

    assert len(await names(async_client)) == 10


async def test_duplicate_name_in_any_case_is_409(async_client: AsyncClient):
    await created(async_client, 'Remote Python')

    for name in ('Remote Python', 'remote python', '  REMOTE PYTHON '):
        response = await create(async_client, name)
        assert response.status_code == 409, msg(409, (name, response.text))
        assert response.json() == {'detail': TAKEN}
    assert await names(async_client) == ['Remote Python']


async def test_rename_and_change_filters(async_client: AsyncClient):
    search = await created(async_client, 'Old name')

    renamed = await async_client.put(
        f'/job-searches/{search["id"]}', json={'name': 'New name'}
    )
    assert renamed.status_code == 200, msg(200, renamed.text)
    assert renamed.json()['name'] == 'New name'
    assert renamed.json()['filters'] == DEFAULT_FILTERS

    refiltered = await async_client.put(
        f'/job-searches/{search["id"]}', json={'filters': FULL_FILTERS}
    )
    assert refiltered.status_code == 200, msg(200, refiltered.text)
    assert refiltered.json()['name'] == 'New name'
    assert refiltered.json()['filters'] == FULL_FILTERS
    assert refiltered.json()['updated_at'] is not None

    both = await async_client.put(
        f'/job-searches/{search["id"]}',
        json={'name': 'Both', 'filters': {'sort': 'fit'}},
    )
    assert both.json()['name'] == 'Both'
    assert both.json()['filters'] == {**DEFAULT_FILTERS, 'sort': 'fit'}


async def test_rename_to_a_taken_name_is_409_but_own_case_change_is_fine(
    async_client: AsyncClient,
):
    await created(async_client, 'Taken')
    search = await created(async_client, 'Mine')

    clash = await async_client.put(
        f'/job-searches/{search["id"]}', json={'name': 'TAKEN'}
    )
    assert clash.status_code == 409, msg(409, clash.text)
    assert clash.json() == {'detail': TAKEN}

    recase = await async_client.put(
        f'/job-searches/{search["id"]}', json={'name': 'MINE'}
    )
    assert recase.status_code == 200, msg(200, recase.text)
    assert await names(async_client) == ['MINE', 'Taken']


async def test_delete_then_404(async_client: AsyncClient):
    search = await created(async_client, 'Gone soon')

    deleted = await async_client.delete(f'/job-searches/{search["id"]}')
    assert deleted.status_code == 204, msg(204, deleted.text)
    assert await names(async_client) == []

    again = await async_client.delete(f'/job-searches/{search["id"]}')
    assert again.status_code == 404, msg(404, again.text)
    put = await async_client.put(
        f'/job-searches/{search["id"]}', json={'name': 'x'}
    )
    assert put.status_code == 404, msg(404, put.text)


async def test_another_users_search_is_invisible_admin_included(
    async_client: AsyncClient, second_user
):
    search = await created(async_client, 'Private')

    for user in (
        as_user(SECOND_USER_ID, 'seconduser'),
        as_user(ADMIN_ID, 'adminuser', is_admin=True),
    ):
        async with user:
            assert await names(async_client) == []
            put = await async_client.put(
                f'/job-searches/{search["id"]}', json={'name': 'Hijack'}
            )
            delete = await async_client.delete(f'/job-searches/{search["id"]}')
            # Same name is free for another user.
            mine = await create(async_client, 'Private')
        assert put.status_code == 404, msg(404, put.text)
        assert delete.status_code == 404, msg(404, delete.text)
        assert mine.status_code == 201, msg(201, mine.text)

    assert await names(async_client) == ['Private']


async def test_the_cap_is_per_user(async_client: AsyncClient, second_user):
    for i in range(10):
        await created(async_client, f'Search {i}')

    async with as_user(SECOND_USER_ID, 'seconduser'):
        response = await create(async_client, 'Search 0')

    assert response.status_code == 201, msg(201, response.text)


async def test_invalid_bodies_are_422(async_client: AsyncClient):
    bad: list[dict[str, Any]] = [
        {'name': '', 'filters': {}},
        {'name': '   ', 'filters': {}},
        {'name': 'x' * 101, 'filters': {}},
        {'name': 'ok'},
        {'name': 'ok', 'filters': {'unknown': 1}},
        {'name': 'ok', 'filters': {'min_fit': 101}},
        {'name': 'ok', 'filters': {'posted_within_days': 16}},
        {'name': 'ok', 'filters': {'tags': [str(i) for i in range(11)]}},
        {'name': 'ok', 'filters': {'sort': 'oldest'}},
        {'name': 'ok', 'filters': {}, 'notify': True},
    ]
    for body in bad:
        response = await async_client.post('/job-searches', json=body)
        assert response.status_code == 422, msg(422, (body, response.text))
    assert await names(async_client) == []

    search = await created(async_client, 'ok')
    for body in ({}, {'name': ''}, {'filters': {'unknown': 1}}):
        response = await async_client.put(
            f'/job-searches/{search["id"]}', json=body
        )
        assert response.status_code == 422, msg(422, (body, response.text))


async def test_hundred_character_name_is_accepted(async_client: AsyncClient):
    body = await created(async_client, 'x' * 100)

    assert body['name'] == 'x' * 100


async def test_anonymous_is_401(raw_client: AsyncClient):
    assert (await raw_client.get('/job-searches')).status_code == 401
    assert (
        await raw_client.post(
            '/job-searches', json={'name': 'a', 'filters': {}}
        )
    ).status_code == 401
    assert (
        await raw_client.put('/job-searches/1', json={'name': 'a'})
    ).status_code == 401
    assert (await raw_client.delete('/job-searches/1')).status_code == 401


async def test_no_notification_route_or_field(async_client: AsyncClient):
    """R-032: a saved search sends nothing - the API has no route or field
    that could ask it to."""
    schema = (await async_client.get('/openapi.json')).json()
    search_paths = {
        path: sorted(methods)
        for path, methods in schema['paths'].items()
        if 'job-search' in path
    }
    assert search_paths == {
        '/job-searches': ['get', 'post'],
        '/job-searches/{search_id}': ['delete', 'put'],
    }
    for name in ('JobSearch', 'JobSearchCreate', 'JobSearchUpdate'):
        properties = set(schema['components']['schemas'][name]['properties'])
        assert not {p for p in properties if 'notif' in p or 'alert' in p}
