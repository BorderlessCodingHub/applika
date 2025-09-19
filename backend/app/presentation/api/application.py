from fastapi import APIRouter

from app.application.dto.application import ApplicationCreateDTO
from app.application.use_cases.create_application import CreateApplicationUseCase
from app.presentation.dependencies import (
    ApplicationRepositoryDp, CurrentUserDp, PlatformRepositoryDp)
from app.presentation.schemas.application import Application, CreateApplication

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
