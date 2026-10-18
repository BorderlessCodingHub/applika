"""Open one job for the acting user (KODI-047, PRD 0012 R-007, R-012,
R-015).

Ported from Ían Muliterno's ``get_job.py`` (``job_scrapping``): an unknown
job is ``ResourceNotFound('Job not found')``, else the posting with its
full description and its fit. Rebuilt on applika's model:

* a posting that left the list (``is_active`` false) is shown only to a
  caller with an application from it - that application keeps its link
  (R-007); to anyone else it is the same 404;
* ``fits`` holds every master CV of the caller, scored live with
  ``score_fit(job.keywords, cv_text(cv))`` (ADR-0017), with the matched and
  missing keywords (R-012). A job with no keywords has no fit to show, so it
  has no entry; a caller with no master CV gets ``fits: []`` and
  ``best_fit: null`` (R-015);
* ``best_fit`` is the highest of those live fits (ties: the lowest master
  CV id, as the list's stored best fit);
* without the "cvs" feature (``with_fit`` false, ADR-0021) the caller's
  master CVs are not read: ``fits: []`` and ``best_fit: null``.
"""

from pydantic import ValidationError

from app.application.dto.base_cv import BaseCVDTO
from app.application.dto.job import JobBestFitDTO, JobDetailDTO, JobFitDTO
from app.application.services.keyword_fit import cv_text, score_fit
from app.application.use_cases.jobs.list_jobs import to_job_summary
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.models import BaseCVModel
from app.domain.repositories.base_cv_repository import BaseCVRepository
from app.domain.repositories.job_repository import JobRepository

JOB_NOT_FOUND = 'Job not found'


def _fit(keywords: list[str], cv: BaseCVModel) -> JobFitDTO | None:
    try:
        dto = BaseCVDTO.model_validate(cv)
    except ValidationError:
        logger.warning(
            'Job fit skipped a master CV that does not validate',
            extra={
                'extra_data': {
                    'event': 'job_fit_invalid_cv',
                    'base_cv_id': cv.id,
                }
            },
        )
        return None
    result = score_fit(keywords, cv_text(dto))
    if result.score is None:
        return None
    return JobFitDTO(
        base_cv_id=cv.id,
        base_cv_name=cv.name,
        score=result.score,
        matched_keywords=result.matched,
        missing_keywords=result.missing,
    )


class GetJobUseCase:
    def __init__(self, job_repo: JobRepository, base_cv_repo: BaseCVRepository):
        self.job_repo = job_repo
        self.base_cv_repo = base_cv_repo

    async def execute(
        self, job_id: int, user_id: int, *, with_fit: bool
    ) -> JobDetailDTO:
        row = await self.job_repo.get_for_user(job_id, user_id)
        if row is None or (
            not row.job.is_active and row.application_id is None
        ):
            raise ResourceNotFound(JOB_NOT_FOUND)

        fits: list[JobFitDTO] = []
        if with_fit:
            keywords = list(row.job.keywords)
            fits = [
                fit
                for cv in await self.base_cv_repo.list_by_user_id(user_id)
                if (fit := _fit(keywords, cv)) is not None
            ]
        best = max(fits, key=lambda f: (f.score, -f.base_cv_id), default=None)

        summary = to_job_summary(row, with_fit=with_fit)
        return JobDetailDTO.model_validate({
            **dict(summary),
            'best_fit': (
                JobBestFitDTO(base_cv_id=best.base_cv_id, score=best.score)
                if best is not None
                else None
            ),
            'description_text': row.job.description_text,
            'company_url': row.job.company_url,
            'fits': fits,
        })
