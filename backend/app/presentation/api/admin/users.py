from fastapi import APIRouter, Query

from app.application.dto.admin import AdminUserUpdateDTO
from app.application.use_cases.admin.users.get_seniority_breakdown import (
    GetSeniorityBreakdownUseCase,
)
from app.application.use_cases.admin.users.get_user_detail import (
    GetAdminUserDetailUseCase,
)
from app.application.use_cases.admin.users.get_user_growth import (
    GetUserGrowthUseCase,
)
from app.application.use_cases.admin.users.list_users import (
    ListAdminUsersUseCase,
)
from app.application.use_cases.admin.users.update_admin_user import (
    UpdateAdminUserUseCase,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
    UserRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    AdminUpdateUserSchema,
    AdminUserDetailSchema,
    PaginatedUsersSchema,
    SeniorityBreakdownSchema,
    UserGrowthPointSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Users'],
    responses={'403': {'model': DetailSchema}},
)


@router.get('/users', response_model=PaginatedUsersSchema)
async def list_admin_users(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
    search: str | None = Query(None),
    seniority: str | None = Query(None),
    sort_by: str = Query('joined_at'),
    sort_order: str = Query('desc'),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    use_case = ListAdminUsersUseCase(admin_repo)
    dto = await use_case.execute(
        admin_id=admin.id,
        search=search,
        seniority=seniority,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedUsersSchema.model_validate(dto)


@router.get(
    '/users/growth',
    response_model=list[UserGrowthPointSchema],
)
async def get_user_growth(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetUserGrowthUseCase(admin_repo)
    dtos = await use_case.execute(admin.id)
    return [
        UserGrowthPointSchema.model_validate(d)
        for d in dtos
    ]


@router.get(
    '/users/seniority',
    response_model=list[SeniorityBreakdownSchema],
)
async def get_seniority_breakdown(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetSeniorityBreakdownUseCase(admin_repo)
    dtos = await use_case.execute(admin.id)
    return [
        SeniorityBreakdownSchema.model_validate(d)
        for d in dtos
    ]


@router.get(
    '/users/{user_id}',
    response_model=AdminUserDetailSchema,
)
async def get_admin_user_detail(
    user_id: int,
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = GetAdminUserDetailUseCase(admin_repo)
    dto = await use_case.execute(user_id, admin.id)
    return AdminUserDetailSchema.model_validate(dto)


@router.patch(
    '/users/{user_id}',
    response_model=AdminUserDetailSchema,
)
async def update_admin_user(
    user_id: int,
    body: AdminUpdateUserSchema,
    admin: AdminUserDp,
    user_repo: UserRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = UpdateAdminUserUseCase(user_repo, admin_repo)
    data = AdminUserUpdateDTO(
        **body.model_dump(exclude_unset=True)
    )
    dto = await use_case.execute(
        user_id, data, admin.id
    )
    return AdminUserDetailSchema.model_validate(dto)
