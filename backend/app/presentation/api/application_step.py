"""The deprecated steps routes, kept for installed ``applika-cli`` 0.1.4
(R-016, R-020, .claude/rules/cli-compatibility.md).

Same paths, same request and response shapes as before; the data is the
timeline, reached through the compat use cases. Every route is marked
``deprecated`` in OpenAPI and every response, errors included, carries the
``Deprecation`` header (``app/presentation/deprecation.py``). New clients use
``/applications/{id}/timeline``.
"""

from fastapi import APIRouter, Depends

from app.application.dto.legacy_step import LegacyStepWriteDTO
from app.application.use_cases.compat.legacy_steps import (
    CreateLegacyStepUseCase,
    DeleteLegacyStepUseCase,
    ListLegacyStepsUseCase,
    UpdateLegacyStepUseCase,
)
from app.lib.types import SnowflakeID
from app.presentation.dependencies import (
    ApplicationRepositoryDp,
    CurrentUserDp,
    StepDefinitionRepositoryDp,
    TimelineEventRepositoryDp,
)
from app.presentation.deprecation import mark_deprecated
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application_step import (
    ApplicationStep,
    CreateApplicationStep,
    UpdateApplicationStep,
)

router = APIRouter(
    prefix='/applications',
    tags=['Applications Steps (deprecated)'],
    responses={'403': {'model': DetailSchema}},
    dependencies=[Depends(mark_deprecated)],
    deprecated=True,
)

_WRITE_RESPONSES: dict[int | str, dict] = {
    '404': {'model': DetailSchema},
    '409': {
        'model': DetailSchema,
        'description': 'Application closed, or a second initial screening',
    },
    '422': {'description': 'Application archived in a cycle, or invalid'},
}


@router.get(
    '/{application_id}/steps',
    response_model=list[ApplicationStep],
    responses={'404': {'model': DetailSchema}},
)
async def get_all_application_steps(
    c_user: CurrentUserDp,
    application_id: SnowflakeID,
    app_repo: ApplicationRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Deprecated. Every timeline event, shown as a legacy step."""
    use_case = ListLegacyStepsUseCase(app_repo, step_repo, timeline_repo)
    steps = await use_case.execute(application_id, c_user.id)
    return [ApplicationStep.model_validate(step) for step in steps]


@router.post(
    '/{application_id}/steps',
    status_code=201,
    response_model=ApplicationStep,
    responses=_WRITE_RESPONSES,
)
async def add_step(
    c_user: CurrentUserDp,
    application_id: SnowflakeID,
    payload: CreateApplicationStep,
    app_repo: ApplicationRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Deprecated. Adds the timeline event the (non-strict) step maps to."""
    use_case = CreateLegacyStepUseCase(app_repo, step_repo, timeline_repo)
    step = await use_case.execute(
        application_id, c_user.id, LegacyStepWriteDTO(**payload.model_dump())
    )
    return ApplicationStep.model_validate(step)


@router.put(
    '/{application_id}/steps/{step_id}',
    response_model=ApplicationStep,
    responses=_WRITE_RESPONSES,
)
async def update_step(
    c_user: CurrentUserDp,
    application_id: SnowflakeID,
    step_id: SnowflakeID,
    payload: UpdateApplicationStep,
    app_repo: ApplicationRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Deprecated. Replaces the timeline event ``step_id`` (the recorded
    step's id, i.e. the event id)."""
    use_case = UpdateLegacyStepUseCase(app_repo, step_repo, timeline_repo)
    step = await use_case.execute(
        step_id,
        application_id,
        c_user.id,
        LegacyStepWriteDTO(**payload.model_dump()),
    )
    return ApplicationStep.model_validate(step)


@router.delete(
    '/{application_id}/steps/{step_id}',
    status_code=204,
    responses=_WRITE_RESPONSES,
)
async def delete_step(
    c_user: CurrentUserDp,
    application_id: SnowflakeID,
    step_id: SnowflakeID,
    app_repo: ApplicationRepositoryDp,
    step_repo: StepDefinitionRepositoryDp,
    timeline_repo: TimelineEventRepositoryDp,
):
    """Deprecated. Deletes the timeline event."""
    use_case = DeleteLegacyStepUseCase(app_repo, step_repo, timeline_repo)
    await use_case.execute(step_id, application_id, c_user.id)
