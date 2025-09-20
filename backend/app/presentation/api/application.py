from typing import List
from fastapi import APIRouter

from app.application.dto.application import ApplicationCreateDTO
from app.application.use_cases.create_application import CreateApplicationUseCase
from app.application.use_cases.list_applications import ListApplicationsUseCase
from app.presentation.dependencies import (
    ApplicationRepositoryDp, CurrentUserDp, PlatformRepositoryDp)
from app.presentation.schemas.application import (
    Application, CreateApplication, UpdateApplication)

router = APIRouter(tags=["Application"])


@router.post("/applications", response_model=Application, status_code=201)
async def create(
        payload: CreateApplication, c_user: CurrentUserDp,
        app_repo: ApplicationRepositoryDp,
        platform_repo: PlatformRepositoryDp):
    use_case = CreateApplicationUseCase(app_repo, platform_repo)
    data = ApplicationCreateDTO(**payload.model_dump(), user_id=c_user.id)
    application = await use_case.execute(data)
    return Application.model_validate(application)


@router.get("/applications", response_model=List[Application])
async def list_applications(
        c_user: CurrentUserDp, app_repo: ApplicationRepositoryDp):
    use_case = ListApplicationsUseCase(app_repo)
    applications = await use_case.execute(c_user.id)
    return applications


@router.put("/applications/{application_id}", response_model=Application)
async def update_application(application_id: int, payload: UpdateApplication,
                             app_repo: ApplicationRepositoryDp):
    raise NotImplementedError("This endpoint is not implemented yet.")


@router.delete("/applications/{application_id}", status_code=204)
async def delete_application(application_id: int, c_user: CurrentUserDp,
                             app_repo: ApplicationRepositoryDp):
    raise NotImplementedError("This endpoint is not implemented yet.")
