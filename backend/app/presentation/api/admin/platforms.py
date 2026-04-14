from fastapi import APIRouter

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
    CreatePlatformSchema,
    PlatformSchema,
    UpdatePlatformSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Platforms'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/platforms', response_model=list[PlatformSchema]
)
async def list_admin_platforms(
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
):
    use_case = ListPlatformsUseCase(platform_repo)
    dtos = await use_case.execute(admin.id)
    return [
        PlatformSchema.model_validate(d) for d in dtos
    ]


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
    dto = await use_case.execute(data, admin.id)
    return PlatformSchema.model_validate(dto)


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
    data = PlatformUpdateDTO(
        **body.model_dump(exclude_unset=True)
    )
    dto = await use_case.execute(
        platform_id, data, admin.id
    )
    return PlatformSchema.model_validate(dto)


@router.delete('/platforms/{platform_id}', status_code=204)
async def delete_admin_platform(
    platform_id: int,
    admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = DeletePlatformUseCase(
        platform_repo, admin_repo
    )
    await use_case.execute(platform_id, admin.id)
