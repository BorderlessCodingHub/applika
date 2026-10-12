"""In-memory fakes for the job collection use cases (KODI-046, T047).

Each fake keeps the contract of its repository - what it returns and what a
call changes - so the use cases are tested without a database. The real
repositories are tested against Postgres in
``tests/integration/test_job_repositories.py``.
"""

from collections.abc import Sequence
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from itertools import count
from types import SimpleNamespace
from typing import Any

from app.application.dto.job import JobRecordDTO
from app.application.services.job_ingestion.scrapers.base import (
    ScrapedPosting,
)
from app.domain.repositories.job_fit_score_repository import FitRow

NOW = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)

_ids = count(1000)


def base_cv(
    cv_id: int,
    user_id: int,
    headline: str = 'Backend Engineer',
    summary: str = '',
    skills: Sequence[str] = (),
    updated_at: datetime | None = None,
) -> SimpleNamespace:
    """A master CV row as the ORM would return it."""
    return SimpleNamespace(
        id=cv_id,
        created_at=NOW - timedelta(days=30),
        updated_at=updated_at,
        user_id=user_id,
        name='Main',
        full_name='Ada Example',
        headline=headline,
        location='Remote',
        email='ada@example.com',
        phone=None,
        summary=summary,
        links=[],
        skills=(
            [{'id': 's1', 'category': 'Tech', 'keywords': list(skills)}]
            if skills
            else []
        ),
        experience=[],
        projects=[],
        education=[],
        certifications=[],
        languages=[],
    )


def posting(
    external_id: str,
    title: str = 'Python Engineer',
    description: str = 'Python and PostgreSQL services.',
    tags: Sequence[str] = (),
    posted_at: datetime | None = NOW - timedelta(days=1),
    **extra: Any,
) -> ScrapedPosting:
    return ScrapedPosting(
        external_id=external_id,
        title=title,
        company_name=extra.pop('company_name', 'Acme'),
        job_url=extra.pop('job_url', f'https://jobs.example/{external_id}'),
        description_text=description,
        tags=tuple(tags),
        posted_at=posted_at,
        **extra,
    )


class FakeScraper:
    def __init__(self, code: str, result: Any):
        self.code = code
        self.result = result
        self.since: list[datetime] = []

    async def fetch(self, since: datetime) -> list[ScrapedPosting]:
        self.since.append(since)
        if isinstance(self.result, Exception):
            raise self.result
        return list(self.result)


@dataclass
class FakeSource:
    id: int
    code: str
    is_enabled: bool = True
    runs: list[dict[str, Any]] = field(default_factory=list)


class FakeSourceRepo:
    def __init__(self, *sources: FakeSource):
        self.sources = list(sources)

    async def list_enabled(self) -> list[FakeSource]:
        return [s for s in self.sources if s.is_enabled]

    async def record_run(self, source_id, status, found, saved, error, ran_at):
        source = next(s for s in self.sources if s.id == source_id)
        source.runs.append({
            'status': status,
            'found': found,
            'saved': saved,
            'error': error,
            'ran_at': ran_at,
        })


@dataclass
class FakeJob:
    id: int
    source_id: int
    record: JobRecordDTO
    first_seen_at: datetime
    last_seen_at: datetime
    is_active: bool = True


class FakeJobRepo:
    """Same rules as ``JobRepository``: insert, refresh on a hash change,
    touch ``last_seen_at`` otherwise; expiry on ``coalesce(posted_at,
    first_seen_at)``; rows never deleted."""

    def __init__(self) -> None:
        self.jobs: dict[tuple[int, str], FakeJob] = {}
        self.fail_for: set[int] = set()

    def add(
        self,
        source_id: int,
        record: JobRecordDTO,
        first_seen_at: datetime,
        is_active: bool = True,
    ) -> FakeJob:
        job = FakeJob(
            next(_ids),
            source_id,
            record,
            first_seen_at,
            first_seen_at,
            is_active,
        )
        self.jobs[source_id, record.external_id] = job
        return job

    async def upsert_many(self, source_id, postings, now):
        if source_id in self.fail_for:
            raise RuntimeError('database said no: password=hunter2')
        new_ids: list[int] = []
        changed_ids: list[int] = []
        seen: set[str] = set()
        for record in postings:
            if record.external_id in seen:
                continue
            seen.add(record.external_id)
            job = self.jobs.get((source_id, record.external_id))
            if job is None:
                new_ids.append(self.add(source_id, record, now).id)
            elif job.record.content_hash != record.content_hash:
                job.record = record
                job.last_seen_at = now
                job.is_active = True
                changed_ids.append(job.id)
            else:
                job.last_seen_at = now
        return new_ids, changed_ids, len(new_ids) + len(changed_ids)

    async def deactivate_expired(self, now, retention_days):
        cutoff = now - timedelta(days=retention_days)
        expired = []
        for job in self.jobs.values():
            published = job.record.posted_at or job.first_seen_at
            if job.is_active and published < cutoff:
                job.is_active = False
                expired.append(job.id)
        return expired

    async def list_active_keywords(self, job_ids=None):
        return [
            (job.id, list(job.record.keywords))
            for job in sorted(self.jobs.values(), key=lambda j: j.id)
            if job.is_active and (job_ids is None or job.id in job_ids)
        ]

    def by_external_id(self, external_id: str) -> FakeJob:
        return next(
            j for j in self.jobs.values() if j.record.external_id == external_id
        )


class FakeFitRepo:
    def __init__(self) -> None:
        self.rows: dict[tuple[int, int], tuple[FitRow, datetime]] = {}
        self.stale: list[int] = []

    async def upsert_many(self, rows: Sequence[FitRow], computed_at):
        for row in rows:
            self.rows[row.base_cv_id, row.job_id] = (row, computed_at)

    async def delete_many(self, base_cv_id, job_ids):
        removed = 0
        for job_id in job_ids:
            if self.rows.pop((base_cv_id, job_id), None) is not None:
                removed += 1
        return removed

    async def delete_for_jobs(self, job_ids):
        doomed = [key for key in self.rows if key[1] in set(job_ids)]
        for key in doomed:
            del self.rows[key]
        return len(doomed)

    async def stale_base_cv_ids(self):
        return list(self.stale)

    def score(self, base_cv_id: int, job_id: int) -> int | None:
        entry = self.rows.get((base_cv_id, job_id))
        return entry[0].score if entry else None


class FakeBaseCVRepo:
    def __init__(self, *cvs: SimpleNamespace):
        self.cvs = {cv.id: cv for cv in cvs}

    async def list_all(self):
        return [self.cvs[k] for k in sorted(self.cvs)]

    async def get_by_id(self, id):
        return self.cvs.get(id)
