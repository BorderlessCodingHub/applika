from fastapi import APIRouter, Query

from app.application.dto.platform import PlatformCreateDTO
from app.application.use_cases.platforms.create_platform import (
    CreatePlatformUseCase,
)
from app.application.use_cases.platforms.list_platforms import (
    ListPlatformsUseCase,
)
from app.presentation.dependencies import CurrentUserDp, PlatformRepositoryDp
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.platform import PlatformCreate, PlatformOut

router = APIRouter(
    tags=['Platforms'],
    responses={'403': {'model': DetailSchema}},
)


@router.get('/platforms', response_model=list[PlatformOut])
async def list_platforms(
    c_user: CurrentUserDp,
    platform_repo: PlatformRepositoryDp,
    name: str | None = Query(None, description='Filter platforms by name'),
):
    """The web platform picker (S7): visible platforms only, searched by
    name and ordered by it - never ``/supports``, which keeps its own
    unfiltered, id-ordered list for installed CLI clients (R-036)."""
    use_case = ListPlatformsUseCase(platform_repo)
    dtos = await use_case.execute(c_user.id, name=name)
    return [PlatformOut.model_validate(d) for d in dtos]


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
