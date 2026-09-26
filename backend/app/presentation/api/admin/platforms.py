from fastapi import APIRouter, Query

from app.application.dto.platform import (
    PlatformCreateDTO,
    PlatformUpdateDTO,
)
from app.application.use_cases.admin.platforms.create_platform import (
    CreatePlatformUseCase,
)
from app.application.use_cases.admin.platforms.delete_platform import (
    DeletePlatformUseCase,
)
from app.application.use_cases.admin.platforms.list_platforms import (
    ListPlatformsUseCase,
)
from app.application.use_cases.admin.platforms.publish_platform import (
    PublishPlatformUseCase,
)
from app.application.use_cases.admin.platforms.update_platform import (
    UpdatePlatformUseCase,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
    PlatformRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    CreatedBySchema,
    CreatePlatformSchema,
    PlatformSchema,
    UpdatePlatformSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Platforms'],
    responses={'403': {'model': DetailSchema}},
)


def _platform_schema(dto) -> PlatformSchema:
    created_by = None
    if dto.created_by is not None and dto.created_by_username is not None:
        created_by = CreatedBySchema(
            id=dto.created_by, username=dto.created_by_username
        )
    return PlatformSchema(
        id=dto.id,
        name=dto.name,
        url=dto.url,
        is_public=dto.is_public,
        created_by=created_by,
    )


@router.get('/platforms', response_model=list[PlatformSchema])
async def list_admin_platforms(
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
    visibility: str | None = Query(None, pattern='^(public|private)$'),
):
    use_case = ListPlatformsUseCase(platform_repo)
    dtos = await use_case.execute(admin.id, visibility=visibility)
    return [_platform_schema(d) for d in dtos]


@router.post(
    '/platforms',
    response_model=PlatformSchema,
    status_code=201,
)
async def create_admin_platform(
    body: CreatePlatformSchema,
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = CreatePlatformUseCase(platform_repo)
    data = PlatformCreateDTO(name=body.name, url=body.url)
    dto = await use_case.execute(data, admin.id, admin_username=admin.username)
    return _platform_schema(dto)


@router.patch(
    '/platforms/{platform_id}',
    response_model=PlatformSchema,
)
async def update_admin_platform(
    platform_id: int,
    body: UpdatePlatformSchema,
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = UpdatePlatformUseCase(platform_repo)
    data = PlatformUpdateDTO(**body.model_dump(exclude_unset=True))
    dto = await use_case.execute(platform_id, data, admin.id)
    return _platform_schema(dto)


@router.post(
    '/platforms/{platform_id}/publish',
    response_model=PlatformSchema,
)
async def publish_admin_platform(
    platform_id: int,
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = PublishPlatformUseCase(platform_repo)
    dto = await use_case.execute(platform_id, admin.id)
    return _platform_schema(dto)


@router.delete('/platforms/{platform_id}', status_code=204)
async def delete_admin_platform(
    platform_id: int,
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = DeletePlatformUseCase(platform_repo, admin_repo)
    await use_case.execute(platform_id, admin.id)
