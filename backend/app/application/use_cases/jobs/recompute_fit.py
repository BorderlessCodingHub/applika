"""Recompute the fit of master CVs for listed jobs (KODI-046, T046, R-016).

Given job ids, every master CV is scored against those jobs (new or changed
postings). Given a master CV id, that CV is scored against every listed job
(a created or edited CV, or one the hourly run found stale). The score is
:func:`score_fit` on the job's stored ``keywords`` and :func:`cv_text` of the
CV (ADR-0017); a ``None`` fit (a job without keywords) has no row, so any old
row is removed. A deleted CV needs nothing here: its rows go by FK cascade.

Reads master CVs, writes ``job_fit_scores`` only - never an application, a
CV copy or a saved search (PRD 0012, Permissions).
"""

from collections.abc import Callable, Sequence
from datetime import UTC, datetime

from pydantic import ValidationError

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.job import FitRecomputeDTO
from app.application.services.keyword_fit import cv_text, score_fit
from app.config.logging import logger
from app.domain.models import BaseCVModel
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.job_fit_score_repository import (
    FitRow,
    JobFitScoreRepository,
)
from app.domain.repositories.job_repository import JobRepository


def _utcnow() -> datetime:
    return datetime.now(UTC)


class RecomputeFitUseCase:
    def __init__(
        self,
        base_cv_repo: BaseCVRepository,
        job_repo: JobRepository,
        fit_repo: JobFitScoreRepository,
        clock: Callable[[], datetime] = _utcnow,
    ):
        self.base_cv_repo = base_cv_repo
        self.job_repo = job_repo
        self.fit_repo = fit_repo
        self.clock = clock

    async def execute(
        self,
        *,
        job_ids: Sequence[int] | None = None,
        base_cv_id: int | None = None,
    ) -> FitRecomputeDTO:
        if base_cv_id is not None:
            cv = await self.base_cv_repo.get_by_id(base_cv_id)
            cvs = [cv] if cv is not None else []
            jobs = await self.job_repo.list_active_keywords()
        elif job_ids:
            cvs = await self.base_cv_repo.list_all()
            jobs = await self.job_repo.list_active_keywords(job_ids)
        else:
            return FitRecomputeDTO()

        # Plain values first: a repository commit or rollback below must
        # never make these ORM objects reload (ADR-0016, a session per task).
        documents = [_document(cv) for cv in cvs]
        computed_at = self.clock()
        result = FitRecomputeDTO()
        for document in documents:
            if document is None:
                continue
            cv_id, user_id, text = document
            rows: list[FitRow] = []
            no_fit: list[int] = []
            for job_id, keywords in jobs:
                fit = score_fit(keywords, text)
                if fit.score is None:
                    no_fit.append(job_id)
                else:
                    rows.append(FitRow(user_id, job_id, cv_id, fit.score))
            await self.fit_repo.upsert_many(rows, computed_at)
            removed = await self.fit_repo.delete_many(cv_id, no_fit)
            result.scored += len(rows)
            result.removed += removed
        return result


def _document(cv: BaseCVModel) -> tuple[int, int, str] | None:
    """``(id, owner, text)`` of a master CV, or ``None`` when the stored
    document no longer validates (it is skipped, never fails the run)."""
    try:
        dto = BaseCVDTO.model_validate(cv)
    except ValidationError:
        logger.warning(
            'Fit recompute skipped a master CV that does not validate',
            extra={
                'extra_data': {
                    'event': 'fit_recompute_invalid_cv',
                    'base_cv_id': cv.id,
                }
            },
        )
        return None
    return dto.id, dto.user_id, cv_text(dto)
