"""One collection run (KODI-046, T045; R-004..R-009, R-016, R-034).

For every enabled source that has a scraper: fetch the postings published in
the lookback window (or undated), store them on ``(source_id,
external_id)`` - new ones inserted, changed ones updated with fresh
``keywords``, unchanged ones only seen again - and record how the source's
part of the run ended. One source failing or being blocked never stops the
other (R-008). Then every listed posting past ``JOBS_RETENTION_DAYS`` leaves
the list and loses its fit rows, the row itself kept (R-007), and the fit is
recomputed for the new and changed postings and for every stale master CV
(R-016).

Rebuilt from Ían Muliterno's ``RunIngestionUseCase`` (``job_scrapping``,
commit ``e670914``): his per-source loop, content hash, upsert on the
source's external id and per-source status survive; the run now reads the
sources from the database instead of creating them, keeps going past a
failing source with its status recorded, and expires instead of deleting.

The lock that keeps two runs apart (R-009) is the task's job
(``app/worker/tasks.py``), not this use case's.
"""

import hashlib
import json
from collections.abc import Callable, Mapping
from datetime import UTC, datetime, timedelta

from app.application.dto.job import (
    FitRecomputeDTO,
    IngestRunDTO,
    JobRecordDTO,
    RunStatus,
    SourceRunDTO,
)
from app.application.services.job_ingestion.scrapers.base import (
    BaseScraper,
    ScrapedPosting,
    SourceBlocked,
    SourceFailed,
    is_recent,
)
from app.application.services.keyword_fit import job_keywords
from app.application.use_cases.jobs.recompute_fit import RecomputeFitUseCase
from app.config.logging import logger
from app.domain.repositories.job_fit_score_repository import (
    JobFitScoreRepository,
)
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)

# Column lengths of ``jobs`` (revision b28d5134631f): a longer value is cut.
LIMITS = {
    'external_id': 500,
    'title': 500,
    'company_name': 300,
    'company_url': 2083,
    'location_text': 300,
    'job_url': 2083,
    'employment_type': 100,
    'salary_text': 200,
}


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _cut(value: str, field: str) -> str:
    return value[: LIMITS[field]]


def _cut_optional(value: str | None, field: str) -> str | None:
    return value[: LIMITS[field]] if value else None


def to_record(posting: ScrapedPosting) -> JobRecordDTO:
    """A scraped posting as stored: every field cut to its column, the
    ``keywords`` it is scored on (ADR-0017) and a hash of what is stored.

    ``keywords`` is part of the hash: a change to the matcher's rules
    (``keyword_fit.py``) makes every posting "changed" on its next run, so
    stored keywords never lag behind the rules."""
    record = JobRecordDTO(
        external_id=_cut(posting.external_id, 'external_id'),
        title=_cut(posting.title, 'title'),
        company_name=_cut(posting.company_name, 'company_name'),
        company_url=_cut_optional(posting.company_url, 'company_url'),
        location_text=_cut(posting.location_text or 'Remote', 'location_text'),
        job_url=_cut(posting.job_url, 'job_url'),
        description_text=posting.description_text,
        employment_type=_cut_optional(
            posting.employment_type, 'employment_type'
        ),
        salary_text=_cut_optional(posting.salary_text, 'salary_text'),
        tags=list(posting.tags),
        keywords=job_keywords(posting.description_text, posting.tags),
        content_hash='',
        posted_at=posting.posted_at,
    )
    stored = record.model_dump(mode='json', exclude={'content_hash'})
    digest = hashlib.sha256(
        json.dumps(stored, sort_keys=True).encode()
    ).hexdigest()
    return record.model_copy(update={'content_hash': digest})


def _error_text(exc: Exception) -> str:
    """What a run stores as a source's error: the scraper's own message
    for a known failure, only the type for anything else (no stack, no
    message that could quote a URL, a header or a secret)."""
    if isinstance(exc, (SourceBlocked, SourceFailed)):
        return str(exc) or type(exc).__name__
    return f'Unexpected error: {type(exc).__name__}'


class IngestJobsUseCase:
    def __init__(
        self,
        source_repo: JobSourceRepository,
        job_repo: JobRepository,
        fit_repo: JobFitScoreRepository,
        recompute_fit: RecomputeFitUseCase,
        scrapers: Mapping[str, BaseScraper],
        *,
        enabled: bool,
        lookback_days: int,
        retention_days: int,
        clock: Callable[[], datetime] = _utcnow,
    ):
        self.source_repo = source_repo
        self.job_repo = job_repo
        self.fit_repo = fit_repo
        self.recompute_fit = recompute_fit
        self.scrapers = scrapers
        self.enabled = enabled
        self.lookback_days = lookback_days
        self.retention_days = retention_days
        self.clock = clock

    async def execute(self) -> IngestRunDTO:
        if not self.enabled:
            logger.info(
                'Job collection is off (JOBS_INGEST_ENABLED=false)',
                extra={'extra_data': {'event': 'jobs_ingest_disabled'}},
            )
            return IngestRunDTO(ran=False)

        now = self.clock()
        since = now - timedelta(days=self.lookback_days)
        # Plain values: a failed source's rollback must not expire them.
        sources = [
            (source.id, source.code)
            for source in await self.source_repo.list_enabled()
        ]

        runs: list[SourceRunDTO] = []
        touched: list[int] = []
        for source_id, code in sources:
            scraper = self.scrapers.get(code)
            if scraper is None:
                logger.warning(
                    f'No scraper for job source {code}',
                    extra={
                        'extra_data': {
                            'event': 'jobs_ingest_no_scraper',
                            'source': code,
                        }
                    },
                )
                continue
            run, job_ids = await self._run_source(
                source_id, code, scraper, since, now
            )
            runs.append(run)
            touched.extend(job_ids)

        expired = await self.job_repo.deactivate_expired(
            now, self.retention_days
        )
        removed = await self.fit_repo.delete_for_jobs(expired)

        fit = FitRecomputeDTO(removed=removed)
        gone = set(expired)
        fresh = [job_id for job_id in touched if job_id not in gone]
        for part in [
            await self.recompute_fit.execute(job_ids=fresh),
            *[
                await self.recompute_fit.execute(base_cv_id=cv_id)
                for cv_id in await self.fit_repo.stale_base_cv_ids()
            ],
        ]:
            fit.scored += part.scored
            fit.removed += part.removed

        logger.info(
            'Job collection run finished',
            extra={
                'extra_data': {
                    'event': 'jobs_ingest_run',
                    'sources': [run.model_dump() for run in runs],
                    'expired': len(expired),
                    'fit_scored': fit.scored,
                    'fit_removed': fit.removed,
                }
            },
        )
        return IngestRunDTO(
            ran=True, sources=runs, expired=len(expired), fit=fit
        )

    async def _run_source(
        self,
        source_id: int,
        code: str,
        scraper: BaseScraper,
        since: datetime,
        now: datetime,
    ) -> tuple[SourceRunDTO, list[int]]:
        status: RunStatus = 'ok'
        error: str | None = None
        found = saved = 0
        job_ids: list[int] = []
        try:
            postings = [
                p for p in await scraper.fetch(since) if is_recent(p, since)
            ]
            # One record per external id; the first one wins (R-005).
            records: dict[str, JobRecordDTO] = {}
            for record in map(to_record, postings):
                records.setdefault(record.external_id, record)
            found = len(records)
            new_ids, changed_ids, saved = await self.job_repo.upsert_many(
                source_id, list(records.values()), now
            )
            job_ids = [*new_ids, *changed_ids]
        except SourceBlocked as exc:
            status, error = 'blocked', _error_text(exc)
        except Exception as exc:
            status, error = 'failed', _error_text(exc)

        if error is not None:
            logger.warning(
                f'Job source {code} {status}',
                extra={
                    'extra_data': {
                        'event': 'jobs_ingest_source_error',
                        'source': code,
                        'status': status,
                        'error': error,
                    }
                },
            )
        await self.source_repo.record_run(
            source_id, status, found, saved, error, now
        )
        return (
            SourceRunDTO(
                code=code, status=status, found=found, saved=saved, error=error
            ),
            job_ids,
        )
