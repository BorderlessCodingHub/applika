"""The collected postings (KODI-046): one row per ``(source_id,
external_id)``, never deleted (R-007)."""

from collections.abc import Sequence
from datetime import datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.job import JobRecordDTO
from app.domain.models import JobModel

# Rows per IN list / bulk statement, far under asyncpg's 32767 parameters.
CHUNK = 1000


def _chunks[T](items: Sequence[T]) -> list[Sequence[T]]:
    return [items[i : i + CHUNK] for i in range(0, len(items), CHUNK)]


def _content(record: JobRecordDTO) -> dict[str, object]:
    return record.model_dump(exclude={'external_id'})


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
