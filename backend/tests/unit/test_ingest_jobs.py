"""One collection run (KODI-046, T045/T047; R-004..R-008, R-016, R-034) on
in-memory fakes. The repositories' own SQL is tested against Postgres in
``tests/integration/test_job_repositories.py``."""

from datetime import timedelta
from typing import Any, cast

import pytest

from app.application.services.job_ingestion.scrapers.base import (
    SourceBlocked,
    SourceFailed,
)
from app.application.services.keyword_fit import job_keywords
from app.application.use_cases.jobs.ingest_jobs import (
    LIMITS,
    IngestJobsUseCase,
    to_record,
)
from app.application.use_cases.jobs.recompute_fit import RecomputeFitUseCase
from app.domain.repositories.job_fit_score_repository import FitRow
from tests.unit.jobs_fakes import (
    NOW,
    FakeBaseCVRepo,
    FakeFitRepo,
    FakeJobRepo,
    FakeScraper,
    FakeSource,
    FakeSourceRepo,
    base_cv,
    posting,
)

HIMALAYAS = 1
REMOTEOK = 2


class Run:
    """A use case wired to fakes, with the pieces a test inspects."""

    def __init__(
        self,
        himalayas=(),
        remoteok=(),
        *,
        cvs=(base_cv(1, user_id=10, skills=['Python']),),
        enabled=True,
        sources=None,
    ):
        self.sources = FakeSourceRepo(
            *(
                sources
                or [
                    FakeSource(HIMALAYAS, 'himalayas'),
                    FakeSource(REMOTEOK, 'remoteok'),
                ]
            )
        )
        self.jobs = FakeJobRepo()
        self.fits = FakeFitRepo()
        self.cvs = FakeBaseCVRepo(*cvs)
        self.scrapers = {
            'himalayas': FakeScraper('himalayas', himalayas),
            'remoteok': FakeScraper('remoteok', remoteok),
        }
        self.enabled = enabled
        self.now = NOW

    def use_case(self) -> IngestJobsUseCase:
        jobs, fits = cast(Any, self.jobs), cast(Any, self.fits)
        return IngestJobsUseCase(
            cast(Any, self.sources),
            jobs,
            fits,
            RecomputeFitUseCase(
                cast(Any, self.cvs), jobs, fits, clock=lambda: self.now
            ),
            self.scrapers,
            enabled=self.enabled,
            lookback_days=7,
            retention_days=15,
            clock=lambda: self.now,
        )

    async def execute(self):
        return await self.use_case().execute()

    def runs(self, source_id: int) -> list[dict]:
        return next(s for s in self.sources.sources if s.id == source_id).runs


# --- insert / update / unchanged ---------------------------------------------


async def test_new_postings_are_inserted_and_scored():
    run = Run(himalayas=[posting('h1', description='Python')])

    result = await run.execute()

    job = run.jobs.by_external_id('h1')
    assert job.first_seen_at == job.last_seen_at == NOW
    assert job.record.keywords == job_keywords('Python', ())
    assert run.fits.score(1, job.id) == 100
    assert result.ran is True
    assert [(r.code, r.status, r.found, r.saved) for r in result.sources] == [
        ('himalayas', 'ok', 1, 1),
        ('remoteok', 'ok', 0, 0),
    ]


async def test_an_unchanged_posting_only_moves_last_seen():
    run = Run(himalayas=[posting('h1')])
    await run.execute()
    job = run.jobs.by_external_id('h1')
    keywords = job.record.keywords
    run.now = NOW + timedelta(hours=1)
    run.fits.rows.clear()

    result = await run.execute()

    assert job.first_seen_at == NOW
    assert job.last_seen_at == NOW + timedelta(hours=1)
    assert job.record.keywords == keywords
    assert result.sources[0].saved == 0
    assert result.sources[0].found == 1
    # Unchanged: no recompute for this job (no stale CV either).
    assert run.fits.rows == {}


async def test_a_hash_change_refreshes_keywords_and_triggers_a_recompute():
    run = Run(himalayas=[posting('h1', description='Java')])
    await run.execute()
    job = run.jobs.by_external_id('h1')
    assert run.fits.score(1, job.id) == 0

    run.scrapers['himalayas'].result = [posting('h1', description='Python')]
    run.now = NOW + timedelta(hours=1)
    result = await run.execute()

    assert job.record.description_text == 'Python'
    assert job.record.keywords == ['python']
    assert run.fits.score(1, job.id) == 100
    assert result.sources[0].saved == 1
    assert result.fit.scored == 1


async def test_the_same_posting_twice_in_one_fetch_is_one_row():
    run = Run(
        himalayas=[
            posting('dup', title='First'),
            posting('dup', title='Second'),
        ]
    )

    result = await run.execute()

    assert len(run.jobs.jobs) == 1
    assert run.jobs.by_external_id('dup').record.title == 'First'
    assert result.sources[0].found == 1
    assert result.sources[0].saved == 1


async def test_the_same_external_id_in_two_sources_is_two_rows():
    run = Run(himalayas=[posting('same')], remoteok=[posting('same')])

    await run.execute()

    assert set(run.jobs.jobs) == {(HIMALAYAS, 'same'), (REMOTEOK, 'same')}


async def test_scrapers_get_the_lookback_cutoff_and_old_postings_are_dropped():
    run = Run(
        himalayas=[
            posting('fresh', posted_at=NOW - timedelta(days=6)),
            posting('old', posted_at=NOW - timedelta(days=8)),
            posting('undated', posted_at=None),
        ]
    )

    await run.execute()

    assert run.scrapers['himalayas'].since == [NOW - timedelta(days=7)]
    assert {job.record.external_id for job in run.jobs.jobs.values()} == {
        'fresh',
        'undated',
    }


# --- to_record ---------------------------------------------------------------


def test_every_field_is_cut_to_its_column():
    long = 'x' * 3000
    record = to_record(
        posting(
            long,
            title=long,
            company_name=long,
            job_url=long,
            company_url=long,
            location_text=long,
            employment_type=long,
            salary_text=long,
            description=long,
        )
    )

    for name, limit in LIMITS.items():
        assert len(getattr(record, name)) == limit, name
    assert record.description_text == long


def test_blank_optionals_are_none_and_location_defaults_to_remote():
    record = to_record(
        posting('a', company_url='', salary_text='', location_text='')
    )

    assert record.company_url is None
    assert record.salary_text is None
    assert record.location_text == 'Remote'


def test_keywords_come_from_description_and_tags():
    record = to_record(
        posting('a', description='Kubernetes on AWS', tags=['Terraform'])
    )

    assert record.keywords == job_keywords('Kubernetes on AWS', ['Terraform'])
    assert 'terraform' in record.keywords


def test_the_hash_follows_every_stored_field():
    base = to_record(posting('a'))

    assert to_record(posting('a')).content_hash == base.content_hash
    assert len(base.content_hash) == 64
    changes: list[dict[str, Any]] = [
        {'title': 'Other'},
        {'description': 'Other text'},
        {'tags': ['New']},
        {'posted_at': NOW},
        {'salary_text': 'USD 1'},
        {'company_url': 'https://acme.example'},
    ]
    for change in changes:
        assert to_record(posting('a', **change)).content_hash != (
            base.content_hash
        ), change


# --- expiry ------------------------------------------------------------------


async def test_expiry_by_posted_at_keeps_the_job_and_drops_its_fit():
    run = Run()
    old = run.jobs.add(
        HIMALAYAS,
        to_record(posting('old', posted_at=NOW - timedelta(days=16))),
        NOW - timedelta(days=1),
    )
    edge = run.jobs.add(
        HIMALAYAS,
        to_record(posting('edge', posted_at=NOW - timedelta(days=14))),
        NOW - timedelta(days=30),
    )
    run.fits.rows[1, old.id] = (FitRow(10, old.id, 1, 50), NOW)

    result = await run.execute()

    assert old.is_active is False
    assert (HIMALAYAS, 'old') in run.jobs.jobs
    assert (1, old.id) not in run.fits.rows
    # Published 14 days ago, first seen 30 days ago: posted_at wins.
    assert edge.is_active is True
    assert result.expired == 1


async def test_expiry_by_first_seen_at_when_posted_at_is_null():
    run = Run()
    old = run.jobs.add(
        HIMALAYAS,
        to_record(posting('undated-old', posted_at=None)),
        NOW - timedelta(days=16),
    )
    recent = run.jobs.add(
        HIMALAYAS,
        to_record(posting('undated-new', posted_at=None)),
        NOW - timedelta(days=14),
    )

    await run.execute()

    assert old.is_active is False
    assert recent.is_active is True


async def test_an_expired_posting_is_not_rescored():
    """A posting stored in this run but already past retention (a board
    dating it 16 days back, read with a 30-day lookback) is deactivated in
    the same run and never scored."""
    run = Run(himalayas=[posting('old', posted_at=NOW - timedelta(days=16))])
    use_case = run.use_case()
    use_case.lookback_days = 30

    result = await use_case.execute()

    assert run.jobs.by_external_id('old').is_active is False
    assert run.fits.rows == {}
    assert result.fit.scored == 0


# --- one source failing never stops the other (R-008) ------------------------


@pytest.mark.parametrize(
    ('error', 'status', 'message'),
    [
        (SourceFailed('RemoteOK timed out'), 'failed', 'RemoteOK timed out'),
        (
            SourceBlocked('Himalayas refused the request (HTTP 403)'),
            'blocked',
            'Himalayas refused the request (HTTP 403)',
        ),
        (
            ValueError('secret token=abc in a message'),
            'failed',
            'Unexpected error: ValueError',
        ),
    ],
)
async def test_one_source_raising_never_stops_the_other(error, status, message):
    run = Run(himalayas=error, remoteok=[posting('r1')])

    result = await run.execute()

    assert run.runs(HIMALAYAS) == [
        {
            'status': status,
            'found': 0,
            'saved': 0,
            'error': message,
            'ran_at': NOW,
        }
    ]
    assert run.runs(REMOTEOK)[0]['status'] == 'ok'
    assert run.runs(REMOTEOK)[0]['saved'] == 1
    assert (REMOTEOK, 'r1') in run.jobs.jobs
    assert [r.status for r in result.sources] == [status, 'ok']


async def test_a_save_failure_is_failed_with_the_type_only():
    run = Run(himalayas=[posting('h1'), posting('h2')], remoteok=[posting('r')])
    run.jobs.fail_for = {HIMALAYAS}

    await run.execute()

    (record,) = run.runs(HIMALAYAS)
    assert record['status'] == 'failed'
    assert record['found'] == 2
    assert record['saved'] == 0
    assert record['error'] == 'Unexpected error: RuntimeError'
    assert 'hunter2' not in record['error']
    assert run.runs(REMOTEOK)[0]['status'] == 'ok'


async def test_a_successful_run_records_no_error():
    run = Run(himalayas=[posting('h1')])

    await run.execute()

    assert run.runs(HIMALAYAS)[0]['error'] is None
    assert run.runs(HIMALAYAS)[0]['ran_at'] == NOW


# --- switches (R-034) --------------------------------------------------------


async def test_a_disabled_source_is_skipped():
    run = Run(
        himalayas=[posting('h1')],
        remoteok=[posting('r1')],
        sources=[
            FakeSource(HIMALAYAS, 'himalayas', is_enabled=False),
            FakeSource(REMOTEOK, 'remoteok'),
        ],
    )

    result = await run.execute()

    assert run.scrapers['himalayas'].since == []
    assert run.runs(HIMALAYAS) == []
    assert [r.code for r in result.sources] == ['remoteok']
    assert set(run.jobs.jobs) == {(REMOTEOK, 'r1')}


async def test_a_source_without_a_scraper_is_skipped():
    run = Run(
        remoteok=[posting('r1')],
        sources=[FakeSource(9, 'other'), FakeSource(REMOTEOK, 'remoteok')],
    )

    result = await run.execute()

    assert run.runs(9) == []
    assert [r.code for r in result.sources] == ['remoteok']


async def test_ingest_disabled_is_a_no_op():
    run = Run(himalayas=[posting('h1')], enabled=False)
    run.fits.stale = [1]
    old = run.jobs.add(
        HIMALAYAS,
        to_record(posting('old', posted_at=NOW - timedelta(days=20))),
        NOW,
    )

    result = await run.execute()

    assert result.ran is False
    assert run.scrapers['himalayas'].since == []
    assert run.runs(HIMALAYAS) == []
    assert old.is_active is True
    assert run.fits.rows == {}


# --- stale master CVs (R-016) ------------------------------------------------


async def test_stale_cvs_are_scored_against_every_listed_job():
    run = Run(cvs=[base_cv(1, 10, skills=['Python']), base_cv(2, 20)])
    existing = run.jobs.add(
        HIMALAYAS, to_record(posting('kept', description='Python')), NOW
    )
    run.fits.stale = [1]

    result = await run.execute()

    assert run.fits.score(1, existing.id) == 100
    assert (2, existing.id) not in run.fits.rows
    assert result.fit.scored == 1
