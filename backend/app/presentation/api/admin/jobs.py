from fastapi import APIRouter, BackgroundTasks

from app.application.use_cases.admin.jobs.ingestion_status import (
    IngestionStatusUseCase,
)
from app.application.use_cases.admin.jobs.run_ingestion import (
    RunIngestionUseCase,
)
from app.presentation.dependencies import (
    AdminUserDp,
    JobRepositoryDp,
    JobSourceRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.jobs import JobListResponseSchema

router = APIRouter(
    prefix='/admin/jobs',
    tags=['Admin - Jobs'],
    responses={'403': {'model': DetailSchema}},
)


@router.post('/ingestion/run', status_code=202)
async def run_ingestion(
    admin: AdminUserDp,
    background_tasks: BackgroundTasks,
    job_repo: JobRepositoryDp,
    source_repo: JobSourceRepositoryDp,
):
    use_case = RunIngestionUseCase(job_repo, source_repo)
    background_tasks.add_task(use_case.execute)
    return {'status': 'scheduled'}


@router.get('/ingestion/status')
async def ingestion_status(
    admin: AdminUserDp,
    source_repo: JobSourceRepositoryDp,
):
    use_case = IngestionStatusUseCase(source_repo)
    dtos = await use_case.execute()
    return [d.model_dump() for d in dtos]
