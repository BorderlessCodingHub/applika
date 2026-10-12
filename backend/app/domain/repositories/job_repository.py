"""The collected postings (KODI-046): one row per ``(source_id,
external_id)``, never deleted (R-007).

KODI-047 adds the per-user read (``list_for_user``, ``get_for_user``): a
posting joined to *the caller's* best fit, dismissal and application only.
Every per-user join is keyed on the caller's ``user_id`` - there is no admin
branch (ADR-0004): an admin sees their own fits, dismissals and
applications like anyone else.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import (
    ColumnElement,
    Row,
    Select,
    and_,
    func,
    or_,
    select,
    update,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.job import JobFiltersDTO, JobRecordDTO
from app.domain.models import (
    ApplicationModel,
    JobDismissalModel,
    JobFitScoreModel,
    JobModel,
    JobSourceModel,
)

# Rows per IN list / bulk statement, far under asyncpg's 32767 parameters.
CHUNK = 1000


def _chunks[T](items: Sequence[T]) -> list[Sequence[T]]:
    return [items[i : i + CHUNK] for i in range(0, len(items), CHUNK)]


def _content(record: JobRecordDTO) -> dict[str, object]:
    return record.model_dump(exclude={'external_id'})


@dataclass(frozen=True)
class JobUserRow:
    """One posting as one user sees it."""

    job: JobModel
    source_code: str
    source_name: str
    best_fit_score: int | None
    best_fit_base_cv_id: int | None
    dismissed: bool
    application_id: int | None
    application_is_draft: bool | None


def _escape_like(value: str) -> str:
    """``value`` as a literal ``ILIKE`` pattern part: ``%``, ``_`` and the
    escape character itself match only themselves."""
    return value.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')


def published_at() -> ColumnElement[datetime]:
    """When a posting counts as published: ``posted_at``, else the first
    time the worker saw it - the same date the expiry pass uses."""
    return func.coalesce(JobModel.posted_at, JobModel.first_seen_at)


class JobRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def _existing(
        self, source_id: int, external_ids: Sequence[str]
    ) -> dict[str, tuple[int, str]]:
        found: dict[str, tuple[int, str]] = {}
        for chunk in _chunks(external_ids):
            result = await self.session.execute(
                select(
                    JobModel.external_id, JobModel.id, JobModel.content_hash
                ).where(
                    JobModel.source_id == source_id,
                    JobModel.external_id.in_(chunk),
                )
            )
            for external_id, job_id, content_hash in result.all():
                found[external_id] = (job_id, content_hash)
        return found

    async def upsert_many(
        self,
        source_id: int,
        postings: Sequence[JobRecordDTO],
        now: datetime,
    ) -> tuple[list[int], list[int], int]:
        """Store one source's postings on ``(source_id, external_id)``.

        A new posting is inserted (``first_seen_at = last_seen_at = now``);
        one whose ``content_hash`` is unchanged only gets ``last_seen_at``;
        a changed one gets every field, its new ``keywords`` and
        ``is_active = true`` (a repost of an expired posting comes back; the
        expiry pass that follows deactivates it again if it is still old).
        The same ``external_id`` twice in ``postings`` is stored once, the
        first one wins. One commit for the whole source.

        Returns ``(new_ids, changed_ids, saved)``; ``saved`` counts the rows
        inserted or changed.
        """
        unique: dict[str, JobRecordDTO] = {}
        for posting in postings:
            unique.setdefault(posting.external_id, posting)
        try:
            existing = await self._existing(source_id, list(unique))
            new_ids: list[int] = []
            changed_ids: list[int] = []
            unchanged_ids: list[int] = []
            for external_id, record in unique.items():
                current = existing.get(external_id)
                if current is None:
                    job = JobModel(
                        source_id=source_id,
                        external_id=external_id,
                        first_seen_at=now,
                        last_seen_at=now,
                        is_active=True,
                        **_content(record),
                    )
                    self.session.add(job)
                    await self.session.flush([job])
                    new_ids.append(job.id)
                elif current[1] == record.content_hash:
                    unchanged_ids.append(current[0])
                else:
                    await self.session.execute(
                        update(JobModel)
                        .where(JobModel.id == current[0])
                        .values(
                            **_content(record),
                            last_seen_at=now,
                            is_active=True,
                            updated_at=func.now(),
                        )
                    )
                    changed_ids.append(current[0])
            for chunk in _chunks(unchanged_ids):
                await self.session.execute(
                    update(JobModel)
                    .where(JobModel.id.in_(chunk))
                    # Only last_seen_at: naming updated_at keeps the
                    # column's ``onupdate`` from stamping it.
                    .values(last_seen_at=now, updated_at=JobModel.updated_at)
                )
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return new_ids, changed_ids, len(new_ids) + len(changed_ids)

    async def deactivate_expired(
        self, now: datetime, retention_days: int
    ) -> list[int]:
        """Take off the list every active posting published (else first
        seen) more than ``retention_days`` ago. The rows stay (R-007)."""
        cutoff = now - timedelta(days=retention_days)
        try:
            result = await self.session.execute(
                update(JobModel)
                .where(
                    JobModel.is_active.is_(True),
                    func.coalesce(JobModel.posted_at, JobModel.first_seen_at)
                    < cutoff,
                )
                .values(is_active=False, updated_at=func.now())
                .returning(JobModel.id)
            )
            ids = list(result.scalars().all())
            await self.session.commit()
        except Exception:
            await self.session.rollback()
            raise
        return ids

    async def list_active_keywords(
        self, job_ids: Sequence[int] | None = None
    ) -> list[tuple[int, list[str]]]:
        """``(id, keywords)`` of the listed jobs, all of them or only
        ``job_ids``."""
        stmt = select(JobModel.id, JobModel.keywords).where(
            JobModel.is_active.is_(True)
        )
        if job_ids is None:
            result = await self.session.execute(stmt.order_by(JobModel.id))
            return [(job_id, list(kw)) for job_id, kw in result.all()]
        rows: list[tuple[int, list[str]]] = []
        for chunk in _chunks(job_ids):
            result = await self.session.execute(
                stmt.where(JobModel.id.in_(chunk)).order_by(JobModel.id)
            )
            rows.extend((job_id, list(kw)) for job_id, kw in result.all())
        return rows

    async def exists(self, job_id: int) -> bool:
        """Whether a posting with this id exists, listed or not."""
        found = await self.session.scalar(
            select(JobModel.id).where(JobModel.id == job_id)
        )
        return found is not None

    async def get_by_id(self, job_id: int) -> JobModel | None:
        return await self.session.scalar(
            select(JobModel).where(JobModel.id == job_id)
        )

    def _user_select(self, user_id: int) -> tuple[Select, Any]:
        """Postings joined to their source and to the caller's own best fit,
        dismissal and application - nobody else's.

        ``best_fit`` is the caller's highest fit row per job (ties: the
        lowest ``base_cv_id``). The application join takes any state - draft,
        open, closed or archived - and needs no ``DISTINCT``:
        ``uq_applications_user_job`` allows one per user per job.
        """
        best = (
            select(
                JobFitScoreModel.job_id,
                JobFitScoreModel.base_cv_id,
                JobFitScoreModel.score,
            )
            .where(JobFitScoreModel.user_id == user_id)
            .distinct(JobFitScoreModel.job_id)
            .order_by(
                JobFitScoreModel.job_id,
                JobFitScoreModel.score.desc(),
                JobFitScoreModel.base_cv_id,
            )
            .subquery('best_fit')
        )
        stmt = (
            select(
                JobModel,
                JobSourceModel.code,
                JobSourceModel.name,
                best.c.score,
                best.c.base_cv_id,
                JobDismissalModel.id.is_not(None).label('dismissed'),
                ApplicationModel.id.label('application_id'),
                ApplicationModel.is_draft,
            )
            .join(JobSourceModel, JobSourceModel.id == JobModel.source_id)
            .outerjoin(best, best.c.job_id == JobModel.id)
            .outerjoin(
                JobDismissalModel,
                and_(
                    JobDismissalModel.job_id == JobModel.id,
                    JobDismissalModel.user_id == user_id,
                ),
            )
            .outerjoin(
                ApplicationModel,
                and_(
                    ApplicationModel.job_id == JobModel.id,
                    ApplicationModel.user_id == user_id,
                ),
            )
        )
        return stmt, best.c.score

    @staticmethod
    def _row(row: Row[Any]) -> JobUserRow:
        return JobUserRow(
            job=row[0],
            source_code=row[1],
            source_name=row[2],
            best_fit_score=row[3],
            best_fit_base_cv_id=row[4],
            dismissed=bool(row[5]),
            application_id=row[6],
            application_is_draft=row[7],
        )

    async def list_for_user(
        self,
        user_id: int,
        filters: JobFiltersDTO,
        page: int,
        per_page: int,
    ) -> tuple[list[JobUserRow], int]:
        """One page of the listed postings as ``user_id`` sees them, and the
        number of postings matching the filters (R-010, R-011).

        Only active postings. A posting the caller dismissed is left out
        unless ``include_dismissed``. ``search`` matches title, company or
        description (``ILIKE``, its wildcards escaped); ``tags`` needs every
        chosen tag (``tags @> :tags``); ``min_fit`` needs a best fit of at
        least that much - a posting with no fit is out;
        ``posted_within_days`` counts from ``coalesce(posted_at,
        first_seen_at)``. ``newest`` sorts by that date, then id, both
        descending; ``fit`` by the best fit, no fit last, then newest.
        """
        stmt, best_score = self._user_select(user_id)
        stmt = stmt.where(JobModel.is_active.is_(True))
        if not filters.include_dismissed:
            stmt = stmt.where(JobDismissalModel.id.is_(None))
        if filters.search:
            pattern = f'%{_escape_like(filters.search)}%'
            stmt = stmt.where(
                or_(
                    JobModel.title.ilike(pattern, escape='\\'),
                    JobModel.company_name.ilike(pattern, escape='\\'),
                    JobModel.description_text.ilike(pattern, escape='\\'),
                )
            )
        if filters.source:
            stmt = stmt.where(JobSourceModel.code == filters.source)
        if filters.tags:
            stmt = stmt.where(JobModel.tags.contains(filters.tags))
        if filters.min_fit is not None:
            stmt = stmt.where(best_score >= filters.min_fit)
        if filters.posted_within_days is not None:
            cutoff = datetime.now(UTC) - timedelta(
                days=filters.posted_within_days
            )
            stmt = stmt.where(published_at() >= cutoff)

        total = await self.session.scalar(
            select(func.count()).select_from(stmt.order_by(None).subquery())
        )

        newest = (published_at().desc(), JobModel.id.desc())
        if filters.sort == 'fit':
            stmt = stmt.order_by(best_score.desc().nulls_last(), *newest)
        else:
            stmt = stmt.order_by(*newest)
        result = await self.session.execute(
            stmt.limit(per_page).offset((page - 1) * per_page)
        )
        return [self._row(row) for row in result.all()], int(total or 0)

    async def get_for_user(
        self, job_id: int, user_id: int
    ) -> JobUserRow | None:
        """One posting as ``user_id`` sees it, listed or not - the use case
        decides whether an inactive one may be shown."""
        stmt, _ = self._user_select(user_id)
        result = await self.session.execute(stmt.where(JobModel.id == job_id))
        row = result.first()
        return self._row(row) if row is not None else None
