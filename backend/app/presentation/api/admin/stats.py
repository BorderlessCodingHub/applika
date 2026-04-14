from fastapi import APIRouter

from app.application.use_cases.admin.stats.get_activity_heatmap import (
    GetActivityHeatmapUseCase,
)
from app.application.use_cases.admin.stats.get_platform_stats import (
    GetPlatformStatsUseCase,
)
from app.application.use_cases.admin.stats.get_top_companies import (
    GetTopCompaniesUseCase,
)
from app.application.use_cases.admin.stats.get_top_platforms import (
    GetTopPlatformsUseCase,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    ActivityHeatmapPointSchema,
    AdminPlatformStatsSchema,
    TopCompanyStatSchema,
    TopPlatformStatSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Stats'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/stats', response_model=AdminPlatformStatsSchema
)
async def get_admin_stats(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetPlatformStatsUseCase(admin_repo)
    dto = await use_case.execute(admin.id)
    return AdminPlatformStatsSchema.model_validate(dto)


@router.get(
    '/stats/top-platforms',
    response_model=list[TopPlatformStatSchema],
)
async def get_top_platforms(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetTopPlatformsUseCase(admin_repo)
    dtos = await use_case.execute(admin.id)
    return [
        TopPlatformStatSchema.model_validate(d)
        for d in dtos
    ]


@router.get(
    '/stats/top-companies',
    response_model=list[TopCompanyStatSchema],
)
async def get_top_companies(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetTopCompaniesUseCase(admin_repo)
    dtos = await use_case.execute(admin.id)
    return [
        TopCompanyStatSchema.model_validate(d) for d in dtos
    ]


@router.get(
    '/stats/activity-heatmap',
    response_model=list[ActivityHeatmapPointSchema],
)
async def get_activity_heatmap(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetActivityHeatmapUseCase(admin_repo)
    dtos = await use_case.execute(admin.id)
    return [
        ActivityHeatmapPointSchema.model_validate(d)
        for d in dtos
    ]
