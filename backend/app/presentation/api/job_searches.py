"""Saved job searches of the signed-in user (KODI-047, PRD 0012 R-030,
R-032). Each user sees and changes only their own - admins too (ADR-0004).
A saved search never sends a notification."""

from fastapi import APIRouter

from app.application.dto.job_search import (
    JobSearchInputDTO,
    JobSearchUpdateDTO,
)
from app.application.use_cases.job_searches.create_search import (
    CreateJobSearchUseCase,
)
from app.application.use_cases.job_searches.delete_search import (
    DeleteJobSearchUseCase,
)
from app.application.use_cases.job_searches.list_searches import (
    ListJobSearchesUseCase,
)
from app.application.use_cases.job_searches.update_search import (
    UpdateJobSearchUseCase,
)
from app.core.features import FeatureKey
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    CurrentUserDp,
    SavedJobSearchRepositoryDp,
    require_feature,
)
from app.presentation.gated_slash import add_slash_twins
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.job_searches import (
    JobSearch,
    JobSearchCreate,
    JobSearchUpdate,
)

router = APIRouter(
    prefix='/job-searches',
    tags=['Job searches'],
    # ADR-0018: without "jobs" every route here is an unknown route (404).
    dependencies=[require_feature(FeatureKey.JOBS)],
    responses={'401': {'model': DetailSchema}},
)


@router.get('', response_model=list[JobSearch])
async def list_job_searches(
    c_user: CurrentUserDp, search_repo: SavedJobSearchRepositoryDp
):
    return await ListJobSearchesUseCase(search_repo).execute(c_user.id)


@router.post(
    '',
    response_model=JobSearch,
    status_code=201,
    responses={'409': {'model': DetailSchema}, '422': {'model': DetailSchema}},
)
async def create_job_search(
    payload: JobSearchCreate,
    c_user: CurrentUserDp,
    search_repo: SavedJobSearchRepositoryDp,
):
    return await CreateJobSearchUseCase(search_repo).execute(
        JobSearchInputDTO(
            user_id=c_user.id,
            name=payload.name,
            filters=payload.filters.model_dump(mode='json', exclude_unset=True),
        )
    )


@router.put(
    '/{search_id}',
    response_model=JobSearch,
    responses={
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
        '422': {'model': DetailSchema},
    },
)
async def update_job_search(
    search_id: SnowflakeID,
    payload: JobSearchUpdate,
    c_user: CurrentUserDp,
    search_repo: SavedJobSearchRepositoryDp,
):
    return await UpdateJobSearchUseCase(search_repo).execute(
        int(search_id),
        JobSearchUpdateDTO(
            user_id=c_user.id,
            name=payload.name,
            filters=(
                payload.filters.model_dump(mode='json', exclude_unset=True)
                if payload.filters is not None
                else None
            ),
        ),
    )


@router.delete(
    '/{search_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_job_search(
    search_id: SnowflakeID,
    c_user: CurrentUserDp,
    search_repo: SavedJobSearchRepositoryDp,
):
    await DeleteJobSearchUseCase(search_repo).execute(int(search_id), c_user.id)


# ADR-0018: `/job-searches/` and friends hit the gate too, never a 307.
add_slash_twins(router)
