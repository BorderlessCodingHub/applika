"""The background tasks end to end (KODI-046, T049; R-004, R-008, R-009,
R-016): taskiq's ``InMemoryBroker`` (``ENVIRONMENT=TEST``), the testcontainers
Postgres and Redis, and the fixture scraper - never a live job board."""

import time
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from redis.exceptions import ConnectionError as RedisConnectionError
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from taskiq import InMemoryBroker
from taskiq.exceptions import SendTaskError

from app.application.services.job_ingestion.scrapers.registry import (
    build_registry,
)
from app.application.services.job_queue import INGEST_LOCK_KEY
from app.config.settings import envs
from app.domain.models import (
    BaseCVModel,
    JobFitScoreModel,
    JobModel,
    JobSourceModel,
)
from app.main import app as main_app
from app.worker import broker as broker_module
from app.worker import tasks
from app.worker.broker import QUEUE_NAME, build_broker
from app.worker.queue import TaskiqJobQueue
from tests.base_db_setup import base_data
from tests.integration.jobs_seed import (
    HIMALAYAS_ID,
    REMOTEOK_ID,
    seed_base_cv,
    seed_job,
    seed_sources,
)

POSTINGS = (
    Path(__file__).resolve().parents[1] / 'fixtures' / 'jobs' / 'postings.json'
)
USER_ID = base_data()['user'].id
WORKER_DIR = Path(__file__).resolve().parents[2] / 'app' / 'worker'
JOB_USE_CASES = (
    Path(__file__).resolve().parents[2] / 'app' / 'application' / 'use_cases'
) / 'jobs'
# A port nothing listens on.
CLOSED_REDIS = 'redis://127.0.0.1:1/0'


@pytest.fixture
async def worker(async_engine, db_session, redis_client, monkeypatch):
    """The tasks wired to the test database, the test Redis and the fixture
    scraper, with the two seeded sources."""
    maker = async_sessionmaker(bind=async_engine, expire_on_commit=False)
    monkeypatch.setattr(tasks, 'session_factory', maker)
    monkeypatch.setattr(tasks, 'lock_client', lambda: redis_client)
    monkeypatch.setattr(
        tasks,
        'scrapers',
        lambda: build_registry(['fixture'], 30, str(POSTINGS)),
    )
    monkeypatch.setattr(envs, 'JOBS_INGEST_ENABLED', True)
    await seed_sources(db_session)
    return maker


async def _count(session: AsyncSession, model) -> int:
    return await session.scalar(select(func.count(model.id))) or 0


async def _sources(session: AsyncSession) -> dict[str, JobSourceModel]:
    rows = await session.scalars(
        select(JobSourceModel).execution_options(populate_existing=True)
    )
    return {row.code: row for row in rows}


async def _run_directly(maker, redis_client):
    """``run_ingest`` without the broker, so an exception reaches the
    test (the in-memory broker stores it as the task's result)."""
    return await tasks.run_ingest(
        redis_client, maker, build_registry(['fixture'], 30, str(POSTINGS))
    )


def test_the_broker_is_in_memory_under_test():
    assert isinstance(broker_module.broker, InMemoryBroker)
    assert QUEUE_NAME == 'applika:tasks'
    assert set(broker_module.broker.get_all_tasks()) >= {
        'ingest_jobs',
        'recompute_fit',
    }


def test_ingest_jobs_is_scheduled_on_the_cron_setting():
    labels = tasks.ingest_jobs.labels
    assert labels['schedule'] == [{'cron': envs.JOBS_INGEST_CRON}]
    assert envs.JOBS_INGEST_CRON == '0 * * * *'


async def test_ingest_jobs_saves_jobs_records_sources_and_scores(
    worker, db_session, redis_client
):
    cv_id = await seed_base_cv(db_session, USER_ID, ['Python', 'FastAPI'])

    await tasks.ingest_jobs.kiq()

    assert await _count(db_session, JobModel) == 4
    sources = await _sources(db_session)
    for code in ('himalayas', 'remoteok'):
        source = sources[code]
        assert source.last_run_status == 'ok'
        assert source.last_run_found == 2
        assert source.last_run_saved == 2
        assert source.last_run_error is None
        assert source.last_run_at is not None
    backend = await db_session.scalar(
        select(JobModel).where(
            JobModel.external_id == 'fixture-himalayas-backend-1'
        )
    )
    assert backend is not None
    assert backend.source_id == HIMALAYAS_ID
    assert 'python' in backend.keywords
    fits = (
        await db_session.scalars(
            select(JobFitScoreModel).where(JobFitScoreModel.base_cv_id == cv_id)
        )
    ).all()
    assert len(fits) == 4
    assert {fit.user_id for fit in fits} == {USER_ID}
    assert max(fit.score for fit in fits) > 0
    # The run released its lock.
    assert await redis_client.exists(INGEST_LOCK_KEY) == 0


async def test_a_second_run_changes_nothing_new(worker, db_session):
    await tasks.ingest_jobs.kiq()
    await tasks.ingest_jobs.kiq()

    assert await _count(db_session, JobModel) == 4
    sources = await _sources(db_session)
    assert sources['himalayas'].last_run_found == 2
    assert sources['himalayas'].last_run_saved == 0


async def test_a_held_lock_means_nothing_is_written(
    worker, db_session, redis_client
):
    await redis_client.set(INGEST_LOCK_KEY, 'another-run', ex=60)

    await tasks.ingest_jobs.kiq()

    assert await _count(db_session, JobModel) == 0
    sources = await _sources(db_session)
    assert sources['himalayas'].last_run_at is None
    assert sources['remoteok'].last_run_at is None
    # The other run's lock is left alone.
    assert await redis_client.get(INGEST_LOCK_KEY) == 'another-run'


async def test_the_lock_is_taken_with_nx_and_the_ttl(
    worker, redis_client, monkeypatch
):
    seen: dict = {}

    async def spy_execute(self):
        seen['ttl'] = await redis_client.ttl(INGEST_LOCK_KEY)
        seen['value'] = await redis_client.get(INGEST_LOCK_KEY)
        raise RuntimeError('boom')

    monkeypatch.setattr(
        tasks.IngestJobsUseCase, 'execute', spy_execute, raising=True
    )

    with pytest.raises(RuntimeError):
        await _run_directly(worker, redis_client)

    assert 0 < seen['ttl'] <= envs.JOBS_INGEST_LOCK_SECONDS
    assert seen['value']
    # Released in ``finally`` even when the run raised.
    assert await redis_client.exists(INGEST_LOCK_KEY) == 0


async def test_a_lock_that_changed_hands_is_not_released(
    worker, redis_client, monkeypatch
):
    async def steal_lock(self):
        await redis_client.set(INGEST_LOCK_KEY, 'next-run')
        raise RuntimeError('outlived the lock')

    monkeypatch.setattr(tasks.IngestJobsUseCase, 'execute', steal_lock)

    with pytest.raises(RuntimeError):
        await _run_directly(worker, redis_client)

    assert await redis_client.get(INGEST_LOCK_KEY) == 'next-run'


async def test_no_redis_for_the_lock_means_no_run(
    worker, db_session, monkeypatch
):
    import redis.asyncio as aioredis

    dead = aioredis.from_url(CLOSED_REDIS, socket_connect_timeout=1)
    monkeypatch.setattr(tasks, 'lock_client', lambda: dead)

    await tasks.ingest_jobs.kiq()

    assert await _count(db_session, JobModel) == 0
    await dead.aclose()


async def test_a_disabled_source_is_skipped_by_the_task(worker, db_session):
    source = await db_session.get(JobSourceModel, REMOTEOK_ID)
    assert source is not None
    source.is_enabled = False
    await db_session.commit()

    await tasks.ingest_jobs.kiq()

    sources = await _sources(db_session)
    assert sources['remoteok'].last_run_at is None
    assert sources['himalayas'].last_run_status == 'ok'
    assert await _count(db_session, JobModel) == 2


async def test_recompute_fit_upserts_a_row(worker, db_session):
    cv_id = await seed_base_cv(db_session, USER_ID, ['Python'])
    job_id = await seed_job(db_session, HIMALAYAS_ID, 'p', keywords=['python'])

    await tasks.recompute_fit.kiq(cv_id)

    row = await db_session.scalar(
        select(JobFitScoreModel).where(JobFitScoreModel.base_cv_id == cv_id)
    )
    assert row is not None
    assert (row.job_id, row.user_id, row.score) == (job_id, USER_ID, 100)


async def test_the_queue_binding_enqueues_and_reads_the_lock(
    worker, db_session, redis_client
):
    queue = TaskiqJobQueue(redis_client)
    cv_id = await seed_base_cv(db_session, USER_ID, ['Python'])
    await seed_job(db_session, HIMALAYAS_ID, 'p', keywords=['python'])

    assert await queue.ingest_running() is False
    await queue.enqueue_recompute_fit(cv_id)
    assert await _count(db_session, JobFitScoreModel) == 1

    await queue.enqueue_ingest()
    assert await _count(db_session, JobModel) == 5

    await redis_client.set(INGEST_LOCK_KEY, 'x', ex=60)
    assert await queue.ingest_running() is True


def test_the_real_broker_blocks_on_brpop_without_a_read_timeout():
    """redis-py 8 defaults ``socket_timeout`` to 5 seconds; the worker's
    BRPOP would die every 5 seconds with it (found in the KODI-046 compose
    check). Connecting stays bounded."""
    broker = build_broker('redis://redis:6379/0')

    kwargs = broker.connection_pool.connection_kwargs
    assert kwargs['socket_timeout'] is None
    assert kwargs['socket_connect_timeout'] == 2
    assert broker.queue_name == QUEUE_NAME


async def test_a_real_broker_on_a_closed_port_fails_fast():
    """What ``POST /admin/jobs/runs`` turns into a 503: a kick on a Redis
    that is not there raises at once, it never hangs."""
    broker = build_broker(CLOSED_REDIS)

    async def noop() -> None:
        return None

    task = broker.register_task(noop, task_name='noop')
    started = time.monotonic()
    with pytest.raises(SendTaskError) as caught:
        await task.kiq()
    assert time.monotonic() - started < 5
    assert isinstance(caught.value.__cause__, RedisConnectionError)
    await broker.shutdown()


async def test_the_app_boots_with_the_broker_on_a_closed_port(monkeypatch):
    monkeypatch.setattr(broker_module, 'broker', build_broker(CLOSED_REDIS))

    async with main_app.router.lifespan_context(main_app):
        transport = ASGITransport(app=main_app)
        async with AsyncClient(
            transport=transport, base_url='http://test'
        ) as client:
            response = await client.get('/api/openapi.json')

    assert response.status_code == 200
    assert '/base-cvs' in response.json()['paths']


async def test_a_broker_that_cannot_start_never_fails_the_boot(
    monkeypatch, caplog
):
    class Broken:
        async def startup(self) -> None:
            raise RuntimeError('no redis')

        async def shutdown(self) -> None:
            raise RuntimeError('no redis')

    monkeypatch.setattr(broker_module, 'broker', Broken())

    async with main_app.router.lifespan_context(main_app):
        pass

    assert 'Task broker unavailable at startup' in caplog.text
    assert 'did not shut down cleanly' in caplog.text


@pytest.mark.parametrize(
    'path',
    [*sorted(WORKER_DIR.glob('*.py')), *sorted(JOB_USE_CASES.glob('*.py'))],
)
def test_the_worker_never_imports_user_owned_repositories(path):
    """PRD 0012 Permissions: the background service writes jobs, sources
    and fit scores only."""
    source = path.read_text(encoding='utf-8')
    for forbidden in (
        'application_repository',
        'tailored_cv_repository',
        'saved_job_search',
    ):
        assert forbidden not in source, (path.name, forbidden)


async def test_a_cv_edit_whose_enqueue_was_lost_is_rescored_by_a_run_with_new_postings(
    worker, db_session
):
    """QA finding B1 (R-016): scoring the run's new postings stamps every
    CV's ``computed_at``; the stale CVs must be read before that, or an
    edit made after the last recompute (enqueue lost) stays hidden."""
    cv_id = await seed_base_cv(db_session, USER_ID, ['Java'])
    old_job = await seed_job(
        db_session, HIMALAYAS_ID, 'old-python', keywords=['python']
    )
    await tasks.recompute_fit.kiq(cv_id)
    assert await _score(db_session, cv_id, old_job) == 0

    # The edit lands, its recompute is never queued.
    await db_session.execute(
        update(BaseCVModel)
        .where(BaseCVModel.id == cv_id)
        .values(
            skills=[{'id': 's1', 'category': 'Tech', 'keywords': ['Python']}]
        )
    )
    await db_session.commit()

    # The hourly run brings new postings (the fixture file).
    await tasks.ingest_jobs.kiq()

    assert await _score(db_session, cv_id, old_job) == 100


async def _score(session: AsyncSession, cv_id: int, job_id: int) -> int | None:
    return await session.scalar(
        select(JobFitScoreModel.score)
        .where(
            JobFitScoreModel.base_cv_id == cv_id,
            JobFitScoreModel.job_id == job_id,
        )
        .execution_options(populate_existing=True)
    )


async def test_the_queue_never_waits_on_a_silent_redis(monkeypatch):
    """A Redis that accepts the connection and never answers must not hold
    a CV save or a "run now": every queue call is bounded."""
    import asyncio

    from app.worker import queue as queue_module

    class Silent:
        async def exists(self, key):
            await asyncio.sleep(30)

    monkeypatch.setattr(queue_module, 'QUEUE_TIMEOUT_SECONDS', 0.05)
    started = time.monotonic()

    with pytest.raises(TimeoutError):
        await TaskiqJobQueue(Silent()).ingest_running()  # ty: ignore[invalid-argument-type]

    assert time.monotonic() - started < 5
