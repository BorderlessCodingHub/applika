from typing import List

from fastapi import APIRouter

from app.application.dto.application_step import (
    ApplicationStepCreateDTO,
    ApplicationStepUpdateDTO,
)
from app.application.use_cases.create_application_step import (
    CreateApplicationStepUseCase,
)
from app.application.use_cases.delete_application_step import (
    DeleteApplicationStepUseCase,
)
from app.application.use_cases.list_application_steps import (
    ListApplicationStepsUseCase,
)
from app.application.use_cases.update_application_step import (
    UpdateApplicationStepUseCase,
)
from app.presentation.dependencies import (
    ApplicationRepositoryDp,
    ApplicationStepRepositoryDp,
    CurrentUserDp,
    StepDefinitionRepositoryDp,
)
from app.presentation.schemas.application_step import (
    ApplicationStep,
    CreateApplicationStep,
    UpdateApplicationStep,
)

router = APIRouter(prefix='/applications', tags=['Applications Steps'])


@router.get('/{application_id}/steps', response_model=List[ApplicationStep])
async def get_all_application_steps(
    c_user: CurrentUserDp,
    application_id: int,
    app_step_repo: ApplicationStepRepositoryDp,
):
    use_case = ListApplicationStepsUseCase(app_step_repo=app_step_repo)
    app_steps = await use_case.execute(application_id, c_user.id)
    return app_steps


@router.post(
    '/{application_id}/steps', status_code=201, response_model=ApplicationStep
)
async def add_step(
    c_user: CurrentUserDp,
    application_id: int,
    payload: CreateApplicationStep,
    step_repo: StepDefinitionRepositoryDp,
    app_repo: ApplicationRepositoryDp,
    app_step_repo: ApplicationStepRepositoryDp,
):
    use_case = CreateApplicationStepUseCase(
        step_repo=step_repo,
        application_repo=app_repo,
        application_step_repo=app_step_repo,
    )
    data = ApplicationStepCreateDTO(
        application_id=application_id, **payload.model_dump()
    )
    app_step = await use_case.execute(c_user.id, data)
    return ApplicationStep.model_validate(app_step)


@router.put(
    '/{application_id}/steps/{step_id}', response_model=ApplicationStep
)
async def update_step(
    c_user: CurrentUserDp,
    application_id: int,
    step_id: int,
    payload: UpdateApplicationStep,
    step_repo: StepDefinitionRepositoryDp,
    app_repo: ApplicationRepositoryDp,
    app_step_repo: ApplicationStepRepositoryDp,
):
    use_case = UpdateApplicationStepUseCase(
        step_repo=step_repo,
        application_repo=app_repo,
        application_step_repo=app_step_repo,
    )
    data = ApplicationStepUpdateDTO(
        application_id=application_id, **payload.model_dump()
    )
    app_step = await use_case.execute(step_id, c_user.id, data)
    return ApplicationStep.model_validate(app_step)


@router.delete('/{application_id}/steps/{step_id}', status_code=204)
async def delete_step(
    c_user: CurrentUserDp,
    application_id: int,
    step_id: int,
    app_step_repo: ApplicationStepRepositoryDp,
):
    use_case = DeleteApplicationStepUseCase(
        application_step_repo=app_step_repo
    )
    await use_case.execute(step_id, application_id, c_user.id)
