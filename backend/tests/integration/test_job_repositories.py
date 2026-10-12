"""The job collection repositories against Postgres (KODI-046, T042): the
SQL behind insert/update/unchanged, expiry, fit upserts and stale CVs."""

from datetime import timedelta

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.use_cases.jobs.ingest_jobs import to_record
from app.domain.models import BaseCVModel, JobFitScoreModel, JobModel
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.job_fit_score_repository import (
    FitRow,
    JobFitScoreRepository,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import (
    RUN_ERROR_MAX,
    JobSourceRepository,
)
from tests.base_db_setup import base_data
from tests.integration.jobs_seed import (
    HIMALAYAS_ID,
    REMOTEOK_ID,
    days_ago,
    seed_base_cv,
    seed_job,
    seed_sources,
)
from tests.unit.jobs_fakes import posting

USER_ID = base_data()['user'].id
ADMIN_ID = base_data()['admin_user'].id


@pytest.fixture
async def sources(db_session: AsyncSession) -> dict[str, int]:
    return await seed_sources(db_session)


async def _job(session: AsyncSession, external_id: str) -> JobModel:
    job = await session.scalar(
        select(JobModel)
        .where(JobModel.external_id == external_id)
        .execution_options(populate_existing=True)
    )
    assert job is not None
    return job


# --- JobRepository.upsert_many -----------------------------------------------


async def test_upsert_inserts_updates_and_touches(db_session, sources):
    repo = JobRepository(db_session)
    t0, t1 = days_ago(1), days_ago(0)
    a = to_record(posting('a', description='Python', tags=['Python']))
    b = to_record(posting('b'))

    new, changed, saved = await repo.upsert_many(HIMALAYAS_ID, [a, b], t0)
    assert (len(new), changed, saved) == (2, [], 2)
    job_a = await _job(db_session, 'a')
    assert job_a.first_seen_at == job_a.last_seen_at == t0
    assert job_a.keywords == a.keywords
    assert job_a.tags == ['Python']
    assert job_a.content_hash == a.content_hash

    a2 = to_record(posting('a', description='Go', tags=['Go']))
    new, changed, saved = await repo.upsert_many(HIMALAYAS_ID, [a2, b], t1)

    assert (new, changed, saved) == ([], [job_a.id], 1)
    job_a = await _job(db_session, 'a')
    job_b = await _job(db_session, 'b')
    assert job_a.description_text == 'Go'
    assert job_a.keywords == a2.keywords
    assert job_a.first_seen_at == t0
    assert job_a.last_seen_at == t1
    assert job_a.updated_at is not None
    # Unchanged: only last_seen_at moved.
    assert job_b.last_seen_at == t1
    assert job_b.first_seen_at == t0
    assert job_b.updated_at is None


async def test_upsert_stores_a_posting_once_per_source(db_session, sources):
    repo = JobRepository(db_session)
    first = to_record(posting('dup', title='First'))
    second = to_record(posting('dup', title='Second'))

    new, _, saved = await repo.upsert_many(
        HIMALAYAS_ID, [first, second], days_ago(0)
    )
    await repo.upsert_many(REMOTEOK_ID, [second], days_ago(0))

    assert len(new) == 1
    assert saved == 1
    rows = (
        await db_session.execute(
            select(JobModel.source_id, JobModel.title).where(
                JobModel.external_id == 'dup'
            )
        )
    ).all()
    assert sorted(rows) == sorted([
        (HIMALAYAS_ID, 'First'),
        (REMOTEOK_ID, 'Second'),
    ])


async def test_a_changed_expired_posting_is_listed_again(db_session, sources):
    repo = JobRepository(db_session)
    await repo.upsert_many(HIMALAYAS_ID, [to_record(posting('x'))], days_ago(1))
    await db_session.execute(
        update(JobModel)
        .where(JobModel.external_id == 'x')
        .values(is_active=False)
    )
    await db_session.commit()

    _, changed, _ = await repo.upsert_many(
        HIMALAYAS_ID, [to_record(posting('x', title='Reposted'))], days_ago(0)
    )

    assert len(changed) == 1
    assert (await _job(db_session, 'x')).is_active is True


async def test_a_failed_upsert_rolls_back(db_session, sources):
    repo = JobRepository(db_session)

    with pytest.raises(IntegrityError):
        await repo.upsert_many(999, [to_record(posting('orphan'))], days_ago(0))

    assert await db_session.scalar(select(func.count(JobModel.id))) == 0


# --- JobRepository.deactivate_expired ----------------------------------------


async def test_expiry_on_posted_at_else_first_seen_at(db_session, sources):
    repo = JobRepository(db_session)
    by_posted = await seed_job(
        db_session,
        HIMALAYAS_ID,
        'p-old',
        posted_at=days_ago(16),
        first_seen_at=days_ago(1),
    )
    posted_recent = await seed_job(
        db_session,
        HIMALAYAS_ID,
        'p-new',
        posted_at=days_ago(14),
        first_seen_at=days_ago(30),
    )
    by_first_seen = await seed_job(
        db_session, HIMALAYAS_ID, 'u-old', first_seen_at=days_ago(16)
    )
    first_seen_recent = await seed_job(
        db_session, HIMALAYAS_ID, 'u-new', first_seen_at=days_ago(14)
    )

    expired = await repo.deactivate_expired(days_ago(0), 15)

    assert sorted(expired) == sorted([by_posted, by_first_seen])
    active = dict(
        (await db_session.execute(select(JobModel.id, JobModel.is_active)))
        .tuples()
        .all()
    )
    assert active == {
        by_posted: False,
        posted_recent: True,
        by_first_seen: False,
        first_seen_recent: True,
    }
    # Rows are never deleted (R-007), and a second pass finds nothing new.
    assert await repo.deactivate_expired(days_ago(0), 15) == []


async def test_list_active_keywords(db_session, sources):
    repo = JobRepository(db_session)
    a = await seed_job(db_session, HIMALAYAS_ID, 'a', keywords=['go'])
    b = await seed_job(db_session, HIMALAYAS_ID, 'b')
    await seed_job(db_session, HIMALAYAS_ID, 'c', is_active=False)

    assert sorted(await repo.list_active_keywords()) == sorted([
        (a, ['go']),
        (b, ['python']),
    ])
    assert await repo.list_active_keywords([b]) == [(b, ['python'])]


# --- JobSourceRepository -------------------------------------------------------


async def test_sources_list_toggle_and_record(db_session, sources):
    repo = JobSourceRepository(db_session)

    assert [s.code for s in await repo.list_all()] == ['himalayas', 'remoteok']
    off = await repo.set_enabled(HIMALAYAS_ID, False)
    assert off is not None
    assert off.is_enabled is False
    assert [s.code for s in await repo.list_enabled()] == ['remoteok']
    assert await repo.set_enabled(1, True) is None

    ran_at = days_ago(0)
    await repo.record_run(REMOTEOK_ID, 'failed', 3, 0, 'x' * 5000, ran_at)
    source = await repo.get(REMOTEOK_ID)
    assert source is not None
    await db_session.refresh(source)
    assert source.last_run_at == ran_at
    assert source.last_run_status == 'failed'
    assert (source.last_run_found, source.last_run_saved) == (3, 0)
    assert source.last_run_error == 'x' * RUN_ERROR_MAX

    await repo.record_run(REMOTEOK_ID, 'ok', 5, 2, None, ran_at)
    await db_session.refresh(source)
    assert source.last_run_error is None


async def test_active_job_counts(db_session, sources):
    await seed_job(db_session, HIMALAYAS_ID, 'a')
    await seed_job(db_session, HIMALAYAS_ID, 'b')
    await seed_job(db_session, HIMALAYAS_ID, 'c', is_active=False)

    counts = await JobSourceRepository(db_session).active_job_counts()

    assert counts == {HIMALAYAS_ID: 2}


# --- JobFitScoreRepository --------------------------------------------------


async def _scores(session: AsyncSession) -> dict[tuple[int, int], int]:
    rows = await session.execute(
        select(
            JobFitScoreModel.base_cv_id,
            JobFitScoreModel.job_id,
            JobFitScoreModel.score,
        )
    )
    return {(cv, job): score for cv, job, score in rows.tuples().all()}


async def test_fit_upsert_replaces_on_cv_and_job(db_session, sources):
    repo = JobFitScoreRepository(db_session)
    cv = await seed_base_cv(db_session, USER_ID, ['Python'])
    job = await seed_job(db_session, HIMALAYAS_ID, 'a')

    await repo.upsert(USER_ID, job, cv, 40, days_ago(1))
    await repo.upsert_many([FitRow(USER_ID, job, cv, 90)], days_ago(0))
    await repo.upsert_many([], days_ago(0))

    assert await _scores(db_session) == {(cv, job): 90}
    row = await db_session.scalar(
        select(JobFitScoreModel).execution_options(populate_existing=True)
    )
    assert row is not None
    assert row.user_id == USER_ID
    assert row.updated_at is not None


async def test_fit_deletes(db_session, sources):
    repo = JobFitScoreRepository(db_session)
    cv1 = await seed_base_cv(db_session, USER_ID, ['Python'])
    cv2 = await seed_base_cv(db_session, ADMIN_ID, ['Go'])
    j1 = await seed_job(db_session, HIMALAYAS_ID, 'a')
    j2 = await seed_job(db_session, HIMALAYAS_ID, 'b')
    await repo.upsert_many(
        [
            FitRow(USER_ID, j1, cv1, 1),
            FitRow(USER_ID, j2, cv1, 2),
            FitRow(ADMIN_ID, j1, cv2, 3),
            FitRow(ADMIN_ID, j2, cv2, 4),
        ],
        days_ago(0),
    )

    assert await repo.delete(cv1, j1) == 1
    assert await repo.delete_many(cv1, []) == 0
    assert await repo.delete_for_jobs([j2]) == 2

    assert await _scores(db_session) == {(cv2, j1): 3}


async def test_deleting_a_master_cv_removes_its_fit(db_session, sources):
    cv = await seed_base_cv(db_session, USER_ID, ['Python'])
    job = await seed_job(db_session, HIMALAYAS_ID, 'a')
    await JobFitScoreRepository(db_session).upsert(
        USER_ID, job, cv, 50, days_ago(0)
    )
    base_cv = await BaseCVRepository(db_session).get_by_id(cv)
    assert base_cv is not None

    await BaseCVRepository(db_session).delete(base_cv)

    assert await _scores(db_session) == {}


async def test_stale_base_cv_ids(db_session, sources):
    repo = JobFitScoreRepository(db_session)
    fresh = await seed_base_cv(db_session, USER_ID, ['Python'], name='fresh')
    never = await seed_base_cv(db_session, USER_ID, ['Go'], name='never')
    edited = await seed_base_cv(db_session, ADMIN_ID, ['Go'], name='edited')
    job = await seed_job(db_session, HIMALAYAS_ID, 'a')
    await repo.upsert_many(
        [FitRow(USER_ID, job, fresh, 1), FitRow(ADMIN_ID, job, edited, 1)],
        days_ago(0) + timedelta(minutes=1),
    )
    # An edit after the newest computed_at makes it stale again.
    await db_session.execute(
        update(BaseCVModel)
        .where(BaseCVModel.id == edited)
        .values(updated_at=days_ago(0) + timedelta(minutes=2))
    )
    await db_session.commit()

    assert await repo.stale_base_cv_ids() == sorted([never, edited])


async def test_base_cv_reads_for_the_recompute(db_session, sources):
    a = await seed_base_cv(db_session, USER_ID, ['Python'], name='a')
    b = await seed_base_cv(db_session, ADMIN_ID, ['Go'], name='b')
    repo = BaseCVRepository(db_session)

    assert [cv.id for cv in await repo.list_all()] == sorted([a, b])
    found = await repo.get_by_id(b)
    assert found is not None
    assert found.user_id == ADMIN_ID
    assert await repo.get_by_id(1) is None
