"""The job board for every signed-in user (KODI-047, PRD 0012 R-007,
R-010..R-015, R-029, R-031).

Each user sees the shared postings with *their own* fit, dismissal and
application only - an admin included (ADR-0004: no admin access to other
users' fits, dismissals or searches). The admin side of the board (sources,
run now) is ``api/admin/jobs.py``.

The fit needs "cvs" on top of "jobs" (ADR-0021): without it the list and the
job answer as if the caller had no fit at all (``with_fit`` false).
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
    FeatureRepositoryDp,
    JobDismissalRepositoryDp,
    JobRepositoryDp,
    require_feature,
    user_has_feature,
)
from app.presentation.gated_slash import add_slash_twins
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
    feature_repo: FeatureRepositoryDp,
):
    filters = JobFiltersDTO.model_validate(
        query.model_dump(exclude={'page', 'per_page'})
    )
    return await ListJobsUseCase(job_repo).execute(
        c_user.id,
        filters,
        query.page,
        query.per_page,
        with_fit=await user_has_feature(FeatureKey.CVS, c_user, feature_repo),
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
    feature_repo: FeatureRepositoryDp,
):
    return await GetJobUseCase(job_repo, base_cv_repo).execute(
        int(job_id),
        c_user.id,
        with_fit=await user_has_feature(FeatureKey.CVS, c_user, feature_repo),
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


# ADR-0018: `/jobs/` and friends hit the gate too, never Starlette's 307.
add_slash_twins(router)
