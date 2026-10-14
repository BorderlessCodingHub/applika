"""The job board for every signed-in user (KODI-047, PRD 0012 R-007,
R-010..R-015, R-029, R-031).

Each user sees the shared postings with *their own* fit, dismissal and
application only - an admin included (ADR-0004: no admin access to other
users' fits, dismissals or searches). The admin side of the board (sources,
run now) is ``api/admin/jobs.py``.
"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.application.dto.job import JobFiltersDTO
from app.application.use_cases.jobs.dismiss_job import DismissJobUseCase
from app.application.use_cases.jobs.get_job import GetJobUseCase
from app.application.use_cases.jobs.list_jobs import ListJobsUseCase
from app.application.use_cases.jobs.restore_job import RestoreJobUseCase
from app.core.features import FeatureKey
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    BaseCVRepositoryDp,
    CurrentUserDp,
    JobDismissalRepositoryDp,
    JobRepositoryDp,
    require_feature,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.jobs import JobDetail, JobListQuery, JobPage

router = APIRouter(
    prefix='/jobs',
    tags=['Jobs'],
    # ADR-0018: without "jobs" every route here is an unknown route (404).
    dependencies=[require_feature(FeatureKey.JOBS)],
    responses={'401': {'model': DetailSchema}},
)


@router.get('', response_model=JobPage)
async def list_jobs(
    query: Annotated[JobListQuery, Query()],
    c_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
):
    filters = JobFiltersDTO.model_validate(
        query.model_dump(exclude={'page', 'per_page'})
    )
    return await ListJobsUseCase(job_repo).execute(
        c_user.id, filters, query.page, query.per_page
    )


@router.get(
    '/{job_id}',
    response_model=JobDetail,
    responses={'404': {'model': DetailSchema}},
)
async def get_job(
    job_id: SnowflakeID,
    c_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    base_cv_repo: BaseCVRepositoryDp,
):
    return await GetJobUseCase(job_repo, base_cv_repo).execute(
        int(job_id), c_user.id
    )


@router.put(
    '/{job_id}/dismissal',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def dismiss_job(
    job_id: SnowflakeID,
    c_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    dismissal_repo: JobDismissalRepositoryDp,
):
    await DismissJobUseCase(job_repo, dismissal_repo).execute(
        int(job_id), c_user.id
    )


@router.delete(
    '/{job_id}/dismissal',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def restore_job(
    job_id: SnowflakeID,
    c_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    dismissal_repo: JobDismissalRepositoryDp,
):
    await RestoreJobUseCase(job_repo, dismissal_repo).execute(
        int(job_id), c_user.id
    )
