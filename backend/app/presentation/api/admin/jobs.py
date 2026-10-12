"""Admin job sources (KODI-046, R-033..R-035), a rebuild of Ían Muliterno's
``admin/jobs.py`` (``job_scrapping``, commit ``e670914``).

His two routes - start an ingestion (202) and read each source's status -
become ``POST /admin/jobs/runs`` (202, queued to the background worker
instead of a ``BackgroundTasks`` call inside the API process, ADR-0016) and
``GET /admin/jobs/sources``; ``PATCH /admin/jobs/sources/{id}`` switches a
source off or on. Admin only (``AdminUserDp``, ADR-0004).
"""

from fastapi import APIRouter

from app.application.use_cases.admin.jobs.list_sources import (
    ListJobSourcesUseCase,
)
from app.application.use_cases.admin.jobs.start_run import (
    StartJobRunUseCase,
)
from app.application.use_cases.admin.jobs.update_source import (
    UpdateJobSourceUseCase,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    AdminUserDp,
    JobQueueDp,
    JobSourceRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    JobSourceAdminRow,
    JobSourceUpdate,
    RunQueued,
)

router = APIRouter(
    prefix='/admin/jobs',
    tags=['Admin - Jobs'],
    responses={'403': {'model': DetailSchema}},
)


@router.get('/sources', response_model=list[JobSourceAdminRow])
async def list_job_sources(
    admin: AdminUserDp, source_repo: JobSourceRepositoryDp
):
    """Every source: its switch, its last run and its listed jobs."""
    sources = await ListJobSourcesUseCase(source_repo).execute(admin.id)
    return [JobSourceAdminRow.model_validate(s) for s in sources]


@router.patch(
    '/sources/{source_id}',
    response_model=JobSourceAdminRow,
    responses={'404': {'model': DetailSchema}},
)
async def update_job_source(
    source_id: SnowflakeID,
    body: JobSourceUpdate,
    admin: AdminUserDp,
    source_repo: JobSourceRepositoryDp,
):
    """Switch a source off or on; a run skips a source that is off."""
    source = await UpdateJobSourceUseCase(source_repo).execute(
        source_id, body.is_enabled, admin.id
    )
    return JobSourceAdminRow.model_validate(source)


@router.post(
    '/runs',
    response_model=RunQueued,
    status_code=202,
    responses={
        '409': {'model': DetailSchema},
        '503': {'model': DetailSchema},
    },
)
async def start_job_run(admin: AdminUserDp, job_queue: JobQueueDp):
    """Queue a collection run now: 409 while one is in progress, 503 when
    the background service cannot be reached."""
    await StartJobRunUseCase(job_queue).execute(admin.id)
    return RunQueued()
