"""Admin job sources (KODI-046, T053; R-033..R-035): the three routes K7's
screen consumes, against the testcontainers Postgres, with the ``JobQueue``
faked (``tests/conftest.py``) except where a run really ingests."""

from pathlib import Path

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker

from app.application.services.job_ingestion.scrapers.registry import (
    build_registry,
)
from app.application.services.job_queue import INGEST_LOCK_KEY
from app.config.db import get_session
from app.domain.repositories.job_source_repository import JobSourceRepository
from app.main import app as main_app
from app.presentation.dependencies import get_job_queue
from app.worker import tasks
from app.worker.queue import TaskiqJobQueue
from tests import msg
from tests.integration.conftest import as_user
from tests.integration.jobs_seed import (
    HIMALAYAS_ID,
    HIMALAYAS_PLATFORM_ID,
    REMOTEOK_ID,
    REMOTEOK_PLATFORM_ID,
    days_ago,
    seed_job,
    seed_sources,
)

POSTINGS = (
    Path(__file__).resolve().parents[1] / 'fixtures' / 'jobs' / 'postings.json'
)
ROW_KEYS = {
    'id',
    'code',
    'name',
    'base_url',
    'platform_id',
    'is_enabled',
    'last_run_at',
    'last_run_status',
    'last_run_error',
    'last_run_found',
    'last_run_saved',
    'active_jobs',
}
ROUTES = [
    ('get', '/admin/jobs/sources', None),
    ('patch', f'/admin/jobs/sources/{HIMALAYAS_ID}', {'is_enabled': False}),
    ('post', '/admin/jobs/runs', None),
]


@pytest_asyncio.fixture
async def sources(db_session):
    return await seed_sources(db_session)


@pytest_asyncio.fixture
async def raw_client(async_engine):
    """No auth override at all - the real 401 path."""
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


async def _call(client: AsyncClient, method: str, url: str, body):
    if body is None:
        return await getattr(client, method)(url)
    return await getattr(client, method)(url, json=body)


@pytest.mark.parametrize(('method', 'url', 'body'), ROUTES)
async def test_anonymous_is_401(raw_client, sources, method, url, body):
    response = await _call(raw_client, method, url, body)

    assert response.status_code == 401, msg(401, response.text)


@pytest.mark.parametrize(('method', 'url', 'body'), ROUTES)
async def test_non_admin_is_403(
    async_client, sources, job_queue, method, url, body
):
    response = await _call(async_client, method, url, body)

    assert response.status_code == 403, msg(403, response.text)
    assert response.json() == {
        'detail': 'Admin access required',
        'code': 'ADM-1001',
    }
    assert job_queue.ingests == 0


async def test_non_admin_cannot_switch_a_source_off(admin_client, sources):
    async with as_user(1, 'testuser'):
        refused = await admin_client.patch(
            f'/admin/jobs/sources/{HIMALAYAS_ID}', json={'is_enabled': False}
        )

    rows = (await admin_client.get('/admin/jobs/sources')).json()

    assert refused.status_code == 403
    assert all(row['is_enabled'] for row in rows)


# --- GET /admin/jobs/sources (R-033) -----------------------------------------


async def test_list_shape_before_any_run(admin_client, sources):
    response = await admin_client.get('/admin/jobs/sources')

    assert response.status_code == 200, msg(200, response.text)
    rows = response.json()
    assert [row['code'] for row in rows] == ['himalayas', 'remoteok']
    for row in rows:
        assert set(row) == ROW_KEYS
    himalayas = rows[0]
    assert himalayas == {
        'id': str(HIMALAYAS_ID),
        'code': 'himalayas',
        'name': 'Himalayas',
        'base_url': 'https://himalayas.app',
        'platform_id': str(HIMALAYAS_PLATFORM_ID),
        'is_enabled': True,
        'last_run_at': None,
        'last_run_status': None,
        'last_run_error': None,
        'last_run_found': None,
        'last_run_saved': None,
        'active_jobs': 0,
    }
    assert rows[1]['platform_id'] == str(REMOTEOK_PLATFORM_ID)


async def test_active_jobs_counts_listed_jobs_only(
    admin_client, db_session, sources
):
    await seed_job(db_session, HIMALAYAS_ID, 'a')
    await seed_job(db_session, HIMALAYAS_ID, 'b')
    await seed_job(db_session, HIMALAYAS_ID, 'gone', is_active=False)

    rows = (await admin_client.get('/admin/jobs/sources')).json()

    assert [row['active_jobs'] for row in rows] == [2, 0]


@pytest.fixture
def fixture_worker(async_engine, redis_client, monkeypatch):
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    monkeypatch.setattr(tasks, 'session_factory', maker)
    monkeypatch.setattr(tasks, 'lock_client', lambda: redis_client)
    monkeypatch.setattr(
        tasks,
        'scrapers',
        lambda: build_registry(['fixture'], 30, str(POSTINGS)),
    )


async def test_the_list_after_a_fixture_ingest(
    admin_client, sources, fixture_worker
):
    await tasks.ingest_jobs.kiq()

    rows = {
        row['code']: row
        for row in (await admin_client.get('/admin/jobs/sources')).json()
    }

    for code in ('himalayas', 'remoteok'):
        row = rows[code]
        assert row['last_run_status'] == 'ok'
        assert row['last_run_found'] == 2
        assert row['last_run_saved'] == 2
        assert row['last_run_error'] is None
        assert row['last_run_at'] is not None
        assert row['active_jobs'] == 2


async def test_a_failed_run_shows_its_error(admin_client, db_session, sources):
    await JobSourceRepository(db_session).record_run(
        REMOTEOK_ID, 'blocked', 0, 0, 'RemoteOK refused (HTTP 403)', days_ago(0)
    )

    rows = (await admin_client.get('/admin/jobs/sources')).json()

    assert rows[1]['last_run_status'] == 'blocked'
    assert rows[1]['last_run_error'] == 'RemoteOK refused (HTTP 403)'


# --- PATCH /admin/jobs/sources/{id} (R-034) ----------------------------------


async def test_switching_a_source_off_and_on(admin_client, sources):
    off = await admin_client.patch(
        f'/admin/jobs/sources/{REMOTEOK_ID}', json={'is_enabled': False}
    )

    assert off.status_code == 200, msg(200, off.text)
    assert set(off.json()) == ROW_KEYS
    assert off.json()['id'] == str(REMOTEOK_ID)
    assert off.json()['is_enabled'] is False

    on = await admin_client.patch(
        f'/admin/jobs/sources/{REMOTEOK_ID}', json={'is_enabled': True}
    )
    assert on.json()['is_enabled'] is True


async def test_a_source_off_is_skipped_by_the_next_run(
    admin_client, sources, fixture_worker
):
    await admin_client.patch(
        f'/admin/jobs/sources/{REMOTEOK_ID}', json={'is_enabled': False}
    )

    await tasks.ingest_jobs.kiq()

    rows = {
        row['code']: row
        for row in (await admin_client.get('/admin/jobs/sources')).json()
    }
    assert rows['remoteok']['last_run_at'] is None
    assert rows['remoteok']['active_jobs'] == 0
    assert rows['himalayas']['last_run_status'] == 'ok'


async def test_unknown_source_is_404(admin_client, sources):
    response = await admin_client.patch(
        '/admin/jobs/sources/123456789', json={'is_enabled': False}
    )

    assert response.status_code == 404, msg(404, response.text)
    assert response.json() == {
        'detail': 'Job source not found',
        'code': 'ADM-1011',
    }


@pytest.mark.parametrize(
    'body',
    [
        {},
        {'is_enabled': 'maybe'},
        {'is_enabled': 1},
        {'is_enabled': None},
        {'is_enabled': False, 'name': 'Renamed'},
        {'name': 'Renamed'},
    ],
)
async def test_a_bad_body_is_422(admin_client, sources, body):
    response = await admin_client.patch(
        f'/admin/jobs/sources/{HIMALAYAS_ID}', json=body
    )

    assert response.status_code == 422, msg(422, response.text)
    rows = (await admin_client.get('/admin/jobs/sources')).json()
    assert rows[0]['is_enabled'] is True
    assert rows[0]['name'] == 'Himalayas'


# --- POST /admin/jobs/runs (R-035) -------------------------------------------


async def test_run_now_is_202_and_queued(admin_client, job_queue):
    response = await admin_client.post('/admin/jobs/runs')

    assert response.status_code == 202, msg(202, response.text)
    assert response.json() == {'queued': True}
    assert job_queue.ingests == 1


async def test_run_now_while_one_is_in_progress_is_409(admin_client, job_queue):
    job_queue.running = True

    response = await admin_client.post('/admin/jobs/runs')

    assert response.status_code == 409, msg(409, response.text)
    assert response.json() == {
        'detail': 'A run is already in progress',
        'code': 'ADM-1009',
    }
    assert job_queue.ingests == 0


async def test_run_now_with_the_queue_down_is_503(admin_client, job_queue):
    job_queue.fail = ConnectionError('redis is down')

    response = await admin_client.post('/admin/jobs/runs')

    assert response.status_code == 503, msg(503, response.text)
    assert response.json() == {
        'detail': 'Background service unavailable',
        'code': 'ADM-1010',
    }
    assert 'redis' not in response.text


async def test_run_now_when_only_the_enqueue_fails_is_503(
    admin_client, job_queue
):
    class EnqueueFails(type(job_queue)):
        async def enqueue_ingest(self) -> None:
            raise TimeoutError

    main_app.dependency_overrides[get_job_queue] = EnqueueFails

    response = await admin_client.post('/admin/jobs/runs')

    assert response.status_code == 503, msg(503, response.text)
    assert response.json() == {
        'detail': 'Background service unavailable',
        'code': 'ADM-1010',
    }


async def test_run_now_with_the_real_lock(
    admin_client, redis_client, job_queue
):
    """The real binding reads the same key the task takes."""
    queue = TaskiqJobQueue(redis_client)
    main_app.dependency_overrides[get_job_queue] = lambda: queue
    await redis_client.set(INGEST_LOCK_KEY, 'running', ex=60)

    response = await admin_client.post('/admin/jobs/runs')

    assert response.status_code == 409, msg(409, response.text)


def test_the_routes_are_in_openapi():
    paths = main_app.openapi()['paths']

    assert set(paths['/admin/jobs/sources']) == {'get'}
    assert set(paths['/admin/jobs/sources/{source_id}']) == {'patch'}
    run = paths['/admin/jobs/runs']['post']
    assert set(run['responses']) >= {'202', '403', '409', '503'}
