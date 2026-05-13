from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Query

from app.application.use_cases.fit.get_job_fit import GetJobFitUseCase
from app.application.use_cases.fit.refresh_fit import RefreshFitUseCase
from app.application.use_cases.jobs.create_application_from_job import (
    CreateApplicationFromJobUseCase,
)
from app.application.use_cases.jobs.get_job import GetJobUseCase
from app.application.use_cases.jobs.list_jobs import ListJobsUseCase
from app.application.use_cases.tailoring.tailor_cv import TailorCvUseCase
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    ApplicationRepositoryDp,
    CompanyRepositoryDp,
    CurrentUserDp,
    JobFitSnapshotRepositoryDp,
    JobRepositoryDp,
    JobSourceRepositoryDp,
    PlatformRepositoryDp,
    TailoredDocumentRepositoryDp,
    UserResumeRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application import Application
from app.presentation.schemas.jobs import (
    JobDetailSchema,
    JobFiltersSchema,
    JobListResponseSchema,
)
from app.presentation.schemas.tailored_documents import TailoredDocumentSchema

router = APIRouter(
    prefix='/jobs',
    tags=['Jobs'],
    responses={'403': {'model': DetailSchema}},
)


@router.get('', response_model=JobListResponseSchema)
async def list_jobs(
    current_user: CurrentUserDp,
    resume_repo: UserResumeRepositoryDp,
    job_repo: JobRepositoryDp,
    params: Annotated[JobFiltersSchema, Query()],
):
    default_resume = await resume_repo.get_default_by_user(current_user.id)
    resume_id = default_resume.id if default_resume else None

    use_case = ListJobsUseCase(job_repo)
    dto = await use_case.execute(
        user_id=current_user.id,
        resume_id=resume_id,
        source=params.source,
        search=params.search,
        min_fit=params.min_fit,
        posted_after=params.posted_after,
        sort=params.sort,
        page=params.page,
        page_size=params.page_size,
    )
    return JobListResponseSchema.model_validate(dto.model_dump())


@router.get(
    '/{job_id}',
    response_model=JobDetailSchema,
    responses={'404': {'model': DetailSchema}},
)
async def get_job(
    job_id: SnowflakeID,
    current_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    resume_repo: UserResumeRepositoryDp,
    fit_repo: JobFitSnapshotRepositoryDp,
):
    default_resume = await resume_repo.get_default_by_user(current_user.id)
    resume_id = default_resume.id if default_resume else None

    use_case = GetJobUseCase(job_repo, fit_repo)
    dto = await use_case.execute(int(job_id), current_user.id, resume_id)
    return JobDetailSchema.model_validate(dto.model_dump())


@router.post(
    '/{job_id}/applications',
    response_model=Application,
    status_code=201,
    responses={'404': {'model': DetailSchema}},
)
async def create_application_from_job(
    job_id: SnowflakeID,
    current_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    application_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
    company_repo: CompanyRepositoryDp,
):
    use_case = CreateApplicationFromJobUseCase(
        job_repo, application_repo, platform_repo, company_repo
    )
    dto = await use_case.execute(int(job_id), current_user.id)
    return Application.model_validate(dto)


async def _refresh_fit_task(
    user_id: int,
    resume_id: int | None,
    job_repo: JobRepositoryDp,
    resume_repo: UserResumeRepositoryDp,
    fit_repo: JobFitSnapshotRepositoryDp,
):
    use_case = RefreshFitUseCase(job_repo, resume_repo, fit_repo)
    await use_case.execute(user_id=user_id, resume_id=resume_id)


@router.post('/fit/refresh', status_code=202)
async def refresh_fit(
    current_user: CurrentUserDp,
    background_tasks: BackgroundTasks,
    job_repo: JobRepositoryDp,
    resume_repo: UserResumeRepositoryDp,
    fit_repo: JobFitSnapshotRepositoryDp,
    resume_id: SnowflakeID | None = Query(None),
):
    background_tasks.add_task(
        RefreshFitUseCase(job_repo, resume_repo, fit_repo).execute,
        user_id=current_user.id,
        resume_id=int(resume_id) if resume_id else None,
    )
    return {'status': 'scheduled'}


@router.get('/{job_id}/fit')
async def get_job_fit(
    job_id: SnowflakeID,
    current_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    resume_repo: UserResumeRepositoryDp,
    fit_repo: JobFitSnapshotRepositoryDp,
    resume_id: SnowflakeID | None = Query(None),
):
    use_case = GetJobFitUseCase(job_repo, resume_repo, fit_repo)
    return await use_case.execute(
        job_id=int(job_id),
        user_id=current_user.id,
        resume_id=int(resume_id) if resume_id else None,
    )


@router.post(
    '/{job_id}/tailor-cv',
    response_model=TailoredDocumentSchema,
    status_code=201,
    responses={'404': {'model': DetailSchema}},
)
async def tailor_cv(
    job_id: SnowflakeID,
    current_user: CurrentUserDp,
    job_repo: JobRepositoryDp,
    resume_repo: UserResumeRepositoryDp,
    tailored_doc_repo: TailoredDocumentRepositoryDp,
    resume_id: SnowflakeID | None = Query(None),
):
    use_case = TailorCvUseCase(job_repo, resume_repo, tailored_doc_repo)
    dto = await use_case.execute(
        job_id=int(job_id),
        user_id=current_user.id,
        resume_id=int(resume_id) if resume_id else None,
    )
    return TailoredDocumentSchema.model_validate(dto.model_dump())
