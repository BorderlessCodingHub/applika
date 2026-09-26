from fastapi import APIRouter

from app.application.dto.platform import PlatformCreateDTO
from app.application.use_cases.platforms.create_platform import (
    CreatePlatformUseCase,
)
from app.presentation.dependencies import CurrentUserDp, PlatformRepositoryDp
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.platform import PlatformCreate, PlatformOut

router = APIRouter(
    tags=['Platforms'],
    responses={'403': {'model': DetailSchema}},
)


@router.post('/platforms', response_model=PlatformOut, status_code=201)
async def create_platform(
    payload: PlatformCreate,
    c_user: CurrentUserDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = CreatePlatformUseCase(platform_repo)
    data = PlatformCreateDTO(
        name=payload.name,
        url=str(payload.url) if payload.url else None,
    )
    dto = await use_case.execute(data, c_user.id)
    return PlatformOut.model_validate(dto)
