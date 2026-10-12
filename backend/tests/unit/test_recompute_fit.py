"""The fit recompute (KODI-046, T046/T047, R-016) on in-memory fakes."""

from datetime import timedelta
from typing import Any, cast

from app.application.dto.base_cv import BaseCVDTO
from app.application.services.keyword_fit import cv_text, score_fit
from app.application.use_cases.jobs.ingest_jobs import to_record
from app.application.use_cases.jobs.recompute_fit import RecomputeFitUseCase
from tests.unit.jobs_fakes import (
    NOW,
    FakeBaseCVRepo,
    FakeFitRepo,
    FakeJobRepo,
    base_cv,
    posting,
)

PYTHON_CV = base_cv(1, user_id=10, skills=['Python', 'PostgreSQL'])
REACT_CV = base_cv(2, user_id=20, skills=['React'])


def _any(fake: object) -> Any:
    """A fake where the use case types a repository."""
    return cast(Any, fake)


def _use_case(jobs: FakeJobRepo, fits: FakeFitRepo, *cvs):
    return RecomputeFitUseCase(
        _any(FakeBaseCVRepo(*cvs)), _any(jobs), _any(fits), clock=lambda: NOW
    )


def _jobs(*postings) -> tuple[FakeJobRepo, list[int]]:
    jobs = FakeJobRepo()
    ids = [jobs.add(1, to_record(p), NOW).id for p in postings]
    return jobs, ids


async def test_job_ids_score_every_master_cv_with_its_owner():
    jobs, (python_job, react_job) = _jobs(
        posting('py', description='Python\nPostgreSQL', tags=['Python']),
        posting('re', description='React', tags=['React']),
    )
    fits = FakeFitRepo()

    result = await _use_case(jobs, fits, PYTHON_CV, REACT_CV).execute(
        job_ids=[python_job, react_job]
    )

    assert result.scored == 4
    assert fits.score(1, python_job) == 100
    assert fits.score(1, react_job) == 0
    assert fits.score(2, react_job) == 100
    row, computed_at = fits.rows[2, react_job]
    assert row.user_id == 20
    assert computed_at == NOW


async def test_only_the_given_jobs_are_scored():
    jobs, (first, second) = _jobs(posting('a'), posting('b'))
    fits = FakeFitRepo()

    await _use_case(jobs, fits, PYTHON_CV).execute(job_ids=[second])

    assert set(fits.rows) == {(1, second)}
    assert first not in {job for _, job in fits.rows}


async def test_a_new_cv_scores_every_active_job():
    jobs, ids = _jobs(posting('a'), posting('b'), posting('c'))
    jobs.by_external_id('c').is_active = False
    fits = FakeFitRepo()

    result = await _use_case(jobs, fits, PYTHON_CV, REACT_CV).execute(
        base_cv_id=1
    )

    assert result.scored == 2
    assert set(fits.rows) == {(1, ids[0]), (1, ids[1])}


async def test_a_cv_edit_is_rescored():
    jobs, (job_id,) = _jobs(posting('a', description='Python\nKubernetes'))
    fits = FakeFitRepo()
    use_case = _use_case(jobs, fits, PYTHON_CV)
    await use_case.execute(base_cv_id=1)
    before = fits.score(1, job_id)

    cvs: FakeBaseCVRepo = use_case.base_cv_repo
    cvs.cvs[1] = base_cv(1, user_id=10, skills=['Python', 'Kubernetes'])
    await use_case.execute(base_cv_id=1)

    assert before == 50
    assert fits.score(1, job_id) == 100


async def test_the_score_is_score_fit_on_the_stored_keywords():
    record = to_record(
        posting('a', description='Go gRPC Postgres Python', tags=['Go'])
    )
    jobs = FakeJobRepo()
    job_id = jobs.add(1, record, NOW).id
    fits = FakeFitRepo()

    await _use_case(jobs, fits, PYTHON_CV).execute(base_cv_id=1)

    expected = score_fit(
        record.keywords, cv_text(BaseCVDTO.model_validate(PYTHON_CV))
    ).score
    assert fits.score(1, job_id) == expected


async def test_a_none_score_removes_the_row():
    jobs, (job_id,) = _jobs(posting('a', description='Python'))
    fits = FakeFitRepo()
    use_case = _use_case(jobs, fits, PYTHON_CV)
    await use_case.execute(base_cv_id=1)
    assert fits.score(1, job_id) == 100

    # The job lost every keyword (blank description, no tags).
    jobs.by_external_id('a').record = to_record(posting('a', description=''))
    result = await use_case.execute(base_cv_id=1)

    assert (1, job_id) not in fits.rows
    assert result.removed == 1
    assert result.scored == 0


async def test_an_unknown_cv_does_nothing():
    jobs, _ = _jobs(posting('a'))
    fits = FakeFitRepo()

    result = await _use_case(jobs, fits, PYTHON_CV).execute(base_cv_id=99)

    assert result.scored == result.removed == 0
    assert fits.rows == {}


async def test_no_job_ids_and_no_cv_does_nothing():
    jobs, _ = _jobs(posting('a'))
    fits = FakeFitRepo()

    result = await _use_case(jobs, fits, PYTHON_CV).execute(job_ids=[])

    assert result.scored == 0
    assert fits.rows == {}


async def test_a_cv_that_no_longer_validates_is_skipped(caplog):
    broken = base_cv(3, user_id=30)
    broken.experience = [{'id': 'x', 'role': 'no start date'}]
    jobs, (job_id,) = _jobs(posting('a', description='Python'))
    fits = FakeFitRepo()

    result = await _use_case(jobs, fits, broken, PYTHON_CV).execute(
        job_ids=[job_id]
    )

    assert set(fits.rows) == {(1, job_id)}
    assert result.scored == 1
    assert 'does not validate' in caplog.text


async def test_computed_at_is_the_clock():
    jobs, (job_id,) = _jobs(posting('a', posted_at=NOW - timedelta(days=2)))
    fits = FakeFitRepo()
    later = NOW + timedelta(hours=1)

    await RecomputeFitUseCase(
        _any(FakeBaseCVRepo(PYTHON_CV)),
        _any(jobs),
        _any(fits),
        clock=lambda: later,
    ).execute(job_ids=[job_id])

    assert fits.rows[1, job_id][1] == later
