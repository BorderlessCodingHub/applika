from typing import List

from fastapi import APIRouter

from app.application.dto.application import (
    ApplicationCreateDTO,
    ApplicationUpdateDTO,
    FinalizeApplicationDTO,
)
from app.application.use_cases.create_application import (
    CreateApplicationUseCase,
)
from app.application.use_cases.delete_application import (
    DeleteApplicationUseCase,
)
from app.application.use_cases.finalize_application import (
    FinalizeApplicationUseCase,
)
from app.application.use_cases.list_applications import ListApplicationsUseCase
from app.application.use_cases.update_application import (
    UpdateApplicationUseCase,
)
from app.presentation.dependencies import (
    ApplicationRepositoryDp,
    ApplicationStepRepositoryDp,
    CurrentUserDp,
    FeedbackDefinitionRepositoryDp,
    PlatformRepositoryDp,
    StepDefinitionRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.application import (
    Application,
    CreateApplication,
    FinalizeApplication,
    UpdateApplication,
)

router = APIRouter(
    tags=['Applications'], responses={'403': {'model': DetailSchema}}
)


@router.post(
    '/applications',
    response_model=Application,
    status_code=201,
    responses={'404': {'model': DetailSchema}},
)
async def create(
    payload: CreateApplication,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = CreateApplicationUseCase(app_repo, platform_repo)
    data = ApplicationCreateDTO(**payload.model_dump(), user_id=c_user.id)
    application = await use_case.execute(data)
    return Application.model_validate(application)


@router.get('/applications', response_model=List[Application])
async def list_applications(
    c_user: CurrentUserDp, app_repo: ApplicationRepositoryDp
):
    use_case = ListApplicationsUseCase(app_repo)
    applications = await use_case.execute(c_user.id)
    return applications


@router.put(
    '/applications/{application_id}',
    response_model=Application,
    responses={'404': {'model': DetailSchema}},
)
async def update_application(
    application_id: int,
    payload: UpdateApplication,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = UpdateApplicationUseCase(app_repo, platform_repo)
    data = ApplicationUpdateDTO(**payload.model_dump(), user_id=c_user.id)
    application = await use_case.execute(application_id, data)
    return Application.model_validate(application)


@router.delete(
    '/applications/{application_id}',
    status_code=204,
    responses={'404': {'model': DetailSchema}},
)
async def delete_application(
    application_id: int,
    c_user: CurrentUserDp,
    app_repo: ApplicationRepositoryDp,
    app_steps_repo: ApplicationStepRepositoryDp,
):
    use_case = DeleteApplicationUseCase(app_repo, app_steps_repo)
    await use_case.execute(application_id, c_user.id)


@router.post(
    '/applications/{application_id}/finalize',
    response_model=Application,
    status_code=201,
    responses={
        '404': {'model': DetailSchema},
        '409': {'model': DetailSchema},
    },
)
async def finalize_application(
    application_id: int,
    payload: FinalizeApplication,
    c_user: CurrentUserDp,
    step_repo: StepDefinitionRepositoryDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
    app_step_repo: ApplicationStepRepositoryDp,
    app_repo: ApplicationRepositoryDp,
):
    use_case = FinalizeApplicationUseCase(
        step_repo=step_repo,
        feedback_repo=feedback_repo,
        application_step_repo=app_step_repo,
        application_repo=app_repo,
    )
    data = FinalizeApplicationDTO(**payload.model_dump())
    application = await use_case.execute(application_id, c_user.id, data)
    return Application.model_validate(application)
