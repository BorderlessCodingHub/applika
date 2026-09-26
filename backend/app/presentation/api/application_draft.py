"""Draft applications - the "new application with CV" flow (KODI-032,
ADR-0014). Registered in ``app/main.py`` **before** ``application_router``
so a literal ``/applications/drafts`` path segment is matched by this
router first (``application_id`` on the sibling router is a
``SnowflakeID``, which would refuse "drafts" anyway, but the plan calls for
the explicit order).

A draft is a full application row with ``is_draft = true``: it never
appears through ``GET /applications`` or any other read model
(``application_filters.NOT_DRAFT``), only through these routes and the CV
copy routes under ``/applications/{id}/cv*``
(``tailored_cvs/guards.load_owned_application``).
"""

from fastapi import APIRouter

from app.application.dto.application_draft import (
    DraftFinishDTO,
    DraftInputDTO,
)
from app.application.use_cases.application_drafts.create_draft import (
    CreateDraftUseCase,
)
from app.application.use_cases.application_drafts.delete_draft import (
    DeleteDraftUseCase,
)
from app.application.use_cases.application_drafts.finish_draft import (
    FinishDraftUseCase,
)
from app.application.use_cases.application_drafts.get_draft import (
    GetDraftUseCase,
)
from app.application.use_cases.application_drafts.list_drafts import (
    ListDraftsUseCase,
)
from app.application.use_cases.application_drafts.update_draft import (
    UpdateDraftUseCase,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    ApplicationReadModelDp,
    ApplicationRepositoryDp,
    CompanyRepositoryDp,
    CurrentUserDp,
    PlatformRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application import Application
from app.presentation.schemas.application_draft import (
    Draft,
    DraftFinish,
    DraftInput,
    DraftSummary,
)

router = APIRouter(
    prefix='/applications/drafts',
    tags=['Application Drafts'],
    responses={'403': {'model': DetailSchema}},
)


def _to_input_dto(payload: DraftInput, user_id: int) -> DraftInputDTO:
    return DraftInputDTO(
        user_id=user_id,
        company_id=int(payload.company_id) if payload.company_id else None,
        company_name=payload.company_name,
        role=payload.role,
        mode=payload.mode,
        platform_id=int(payload.platform_id),
        link_to_job=payload.link_to_job,
        observation=payload.observation,
        expected_salary=payload.expected_salary,
        salary_range_min=payload.salary_range_min,
        salary_range_max=payload.salary_range_max,
        currency=payload.currency,
        salary_period=payload.salary_period,
        experience_level=payload.experience_level,
        work_mode=payload.work_mode,
        country=payload.country,
        job_description=payload.job_description,
    )


@router.post(
    '',
    response_model=Draft,
    status_code=201,
    responses={'404': {'model': DetailSchema}, '422': {'model': DetailSchema}},
)
async def create_draft(
    payload: DraftInput,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
    company_repo: CompanyRepositoryDp,
):
    use_case = CreateDraftUseCase(app_repo, platform_repo, company_repo)
    draft = await use_case.execute(_to_input_dto(payload, c_user.id))
    return draft


@router.get('', response_model=list[DraftSummary])
async def list_drafts(
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
):
    use_case = ListDraftsUseCase(app_repo)
    return await use_case.execute(c_user.id)


@router.get(
    '/{draft_id}',
    response_model=Draft,
    responses={'404': {'model': DetailSchema}},
)
async def get_draft(
    draft_id: SnowflakeID,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
):
    use_case = GetDraftUseCase(app_repo)
    return await use_case.execute(int(draft_id), c_user.id)


@router.put(
    '/{draft_id}',
    response_model=Draft,
    responses={'404': {'model': DetailSchema}, '422': {'model': DetailSchema}},
)
async def update_draft(
    draft_id: SnowflakeID,
    payload: DraftInput,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
    company_repo: CompanyRepositoryDp,
):
    use_case = UpdateDraftUseCase(app_repo, platform_repo, company_repo)
    return await use_case.execute(
        int(draft_id), _to_input_dto(payload, c_user.id)
    )


@router.delete(
    '/{draft_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_draft(
    draft_id: SnowflakeID,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
):
    use_case = DeleteDraftUseCase(app_repo)
    await use_case.execute(int(draft_id), c_user.id)


@router.post(
    '/{draft_id}/finish',
    response_model=Application,
    status_code=200,
    responses={'404': {'model': DetailSchema}, '422': {'model': DetailSchema}},
)
async def finish_draft(
    draft_id: SnowflakeID,
    payload: DraftFinish,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    read_model: ApplicationReadModelDp,
):
    use_case = FinishDraftUseCase(app_repo, read_model)
    application = await use_case.execute(
        int(draft_id),
        DraftFinishDTO(
            user_id=c_user.id, application_date=payload.application_date
        ),
    )
    return application
