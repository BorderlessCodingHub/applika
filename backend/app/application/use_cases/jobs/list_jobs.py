"""List the job board for the acting user (KODI-047, PRD 0012 R-010,
R-011).

Ported from Ían Muliterno's ``list_jobs.py`` (``job_scrapping``, PR origin
of the feature): the repository returns the page's rows and the total, and
each row is mapped to the list item. Rebuilt on applika's tables: the fit is
the caller's best among their master CVs, and each item carries the
caller's dismissal and application from the job.
"""

import math

from app.application.dto.job import (
    JobApplicationRefDTO,
    JobBestFitDTO,
    JobFiltersDTO,
    JobPageDTO,
    JobSourceRefDTO,
    JobSummaryDTO,
)
from app.domain.repositories.job_repository import JobRepository, JobUserRow


def to_job_summary(row: JobUserRow) -> JobSummaryDTO:
    """One row as a ``JobSummary``, shared by the list and the detail."""
    job = row.job
    best_fit = (
        JobBestFitDTO(
            base_cv_id=row.best_fit_base_cv_id, score=row.best_fit_score
        )
        if row.best_fit_score is not None
        and row.best_fit_base_cv_id is not None
        else None
    )
    application = (
        JobApplicationRefDTO(
            id=row.application_id,
            is_draft=bool(row.application_is_draft),
        )
        if row.application_id is not None
        else None
    )
    return JobSummaryDTO(
        id=job.id,
        source=JobSourceRefDTO(code=row.source_code, name=row.source_name),
        title=job.title,
        company_name=job.company_name,
        location_text=job.location_text,
        employment_type=job.employment_type,
        salary_text=job.salary_text,
        tags=list(job.tags),
        posted_at=job.posted_at,
        job_url=job.job_url,
        is_active=job.is_active,
        best_fit=best_fit,
        dismissed=row.dismissed,
        application=application,
    )


class ListJobsUseCase:
    def __init__(self, job_repo: JobRepository):
        self.job_repo = job_repo

    async def execute(
        self,
        user_id: int,
        filters: JobFiltersDTO,
        page: int,
        per_page: int,
    ) -> JobPageDTO:
        rows, total = await self.job_repo.list_for_user(
            user_id, filters, page, per_page
        )
        return JobPageDTO(
            items=[to_job_summary(row) for row in rows],
            total=total,
            page=page,
            per_page=per_page,
            total_pages=math.ceil(total / per_page) if total else 0,
        )
