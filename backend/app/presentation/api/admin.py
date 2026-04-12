import math

from fastapi import APIRouter, Query

from app.core.exceptions import (
    ResourceConflict,
    ResourceNotFound,
)
from app.domain.models import (
    CompanyModel,
    FeedbackDefinitionModel,
    PlatformModel,
    StepDefinitionModel,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
    CompanyRepositoryDp,
    FeedbackDefinitionRepositoryDp,
    PlatformRepositoryDp,
    StepDefinitionRepositoryDp,
    UserRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    ActivityHeatmapPointSchema,
    AdminCompanyRowSchema,
    AdminPlatformStatsSchema,
    AdminUpdateUserSchema,
    AdminUserDetailSchema,
    CreateCompanySchema,
    CreateFeedbackDefinitionSchema,
    CreatePlatformSchema,
    CreateStepDefinitionSchema,
    FeedbackDefinitionSchema,
    PaginatedCompaniesSchema,
    PaginatedUsersSchema,
    PlatformSchema,
    SeniorityBreakdownSchema,
    StepDefinitionSchema,
    TopCompanyStatSchema,
    TopPlatformStatSchema,
    UpdateCompanySchema,
    UpdateFeedbackDefinitionSchema,
    UpdatePlatformSchema,
    UpdateStepDefinitionSchema,
    UserGrowthPointSchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin'],
    responses={
        '403': {'model': DetailSchema},
    },
)


# ── Dashboard Analytics ─────────────────────────────────────────────


@router.get('/stats', response_model=AdminPlatformStatsSchema)
async def get_admin_stats(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    return await admin_repo.get_platform_stats()


@router.get('/users', response_model=PaginatedUsersSchema)
async def list_admin_users(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
    search: str | None = Query(None),
    seniority: str | None = Query(None),
    sort_by: str = Query('joined_at'),
    sort_order: str = Query('desc'),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    rows, total = await admin_repo.get_user_rows(
        search=search,
        seniority=seniority,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return {
        'items': rows,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': math.ceil(total / per_page) if total else 0,
    }


@router.get(
    '/users/growth', response_model=list[UserGrowthPointSchema]
)
async def get_user_growth(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    return await admin_repo.get_user_growth()


@router.get(
    '/users/seniority',
    response_model=list[SeniorityBreakdownSchema],
)
async def get_seniority_breakdown(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    return await admin_repo.get_seniority_breakdown()


@router.get(
    '/stats/top-platforms',
    response_model=list[TopPlatformStatSchema],
)
async def get_top_platforms(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    return await admin_repo.get_top_platforms()


@router.get(
    '/stats/top-companies',
    response_model=list[TopCompanyStatSchema],
)
async def get_top_companies(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    return await admin_repo.get_top_companies()


@router.get(
    '/stats/activity-heatmap',
    response_model=list[ActivityHeatmapPointSchema],
)
async def get_activity_heatmap(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    return await admin_repo.get_activity_heatmap()


# ── User Management ─────────────────────────────────────────────────


@router.get(
    '/users/{user_id}', response_model=AdminUserDetailSchema
)
async def get_admin_user_detail(
    user_id: int,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    detail = await admin_repo.get_user_detail(user_id)
    if not detail:
        raise ResourceNotFound('User not found')
    return detail


@router.patch(
    '/users/{user_id}', response_model=AdminUserDetailSchema
)
async def update_admin_user(
    user_id: int,
    body: AdminUpdateUserSchema,
    _admin: AdminUserDp,
    user_repo: UserRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    user = await user_repo.get_by_id(user_id)
    if not user:
        raise ResourceNotFound('User not found')

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(user, key, value)

    await user_repo.update(user)

    return await admin_repo.get_user_detail(user_id)


# ── Company Management ──────────────────────────────────────────────


@router.get(
    '/companies', response_model=PaginatedCompaniesSchema
)
async def list_admin_companies(
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    sort_by: str = Query('name'),
    sort_order: str = Query('asc'),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    rows, total = await admin_repo.get_admin_companies(
        search=search,
        is_active=is_active,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return {
        'items': rows,
        'total': total,
        'page': page,
        'per_page': per_page,
        'total_pages': math.ceil(total / per_page) if total else 0,
    }


@router.post(
    '/companies',
    response_model=AdminCompanyRowSchema,
    status_code=201,
)
async def create_admin_company(
    body: CreateCompanySchema,
    admin: AdminUserDp,
    company_repo: CompanyRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    from app.application.dto.company import CompanyCreateDTO

    dto = CompanyCreateDTO(
        name=body.name, url=body.url, created_by=admin.id
    )
    company = await company_repo.create(dto)

    rows, _ = await admin_repo.get_admin_companies(
        search=company.name, page=1, per_page=1
    )
    return rows[0] if rows else company


@router.patch(
    '/companies/{company_id}',
    response_model=AdminCompanyRowSchema,
)
async def update_admin_company(
    company_id: int,
    body: UpdateCompanySchema,
    _admin: AdminUserDp,
    company_repo: CompanyRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    company = await company_repo.get_by_id_unfiltered(company_id)
    if not company:
        raise ResourceNotFound('Company not found')

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(company, key, value)

    await company_repo.update(company)

    rows, _ = await admin_repo.get_admin_companies(
        search=company.name, page=1, per_page=1
    )
    return rows[0] if rows else company


@router.delete('/companies/{company_id}', status_code=204)
async def delete_admin_company(
    company_id: int,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    refs = await admin_repo.count_entity_references(
        'company', company_id
    )
    if refs > 0:
        raise ResourceConflict(
            f'Cannot delete: {refs} application(s) reference this '
            f'company'
        )

    from sqlalchemy import delete

    await admin_repo.session.execute(
        delete(CompanyModel).where(CompanyModel.id == company_id)
    )
    await admin_repo.session.commit()


# ── Supports: Platforms ─────────────────────────────────────────────


@router.get(
    '/platforms', response_model=list[PlatformSchema]
)
async def list_admin_platforms(
    _admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
):
    platforms = await platform_repo.get_all()
    return platforms


@router.post(
    '/platforms', response_model=PlatformSchema, status_code=201
)
async def create_admin_platform(
    body: CreatePlatformSchema,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    platform = PlatformModel(name=body.name, url=body.url)
    admin_repo.session.add(platform)
    await admin_repo.session.commit()
    await admin_repo.session.refresh(platform)
    return platform


@router.patch(
    '/platforms/{platform_id}', response_model=PlatformSchema
)
async def update_admin_platform(
    platform_id: int,
    body: UpdatePlatformSchema,
    _admin: AdminUserDp,
    platform_repo: PlatformRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    platform = await platform_repo.get_by_id(platform_id)
    if not platform:
        raise ResourceNotFound('Platform not found')

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(platform, key, value)

    admin_repo.session.add(platform)
    await admin_repo.session.commit()
    await admin_repo.session.refresh(platform)
    return platform


@router.delete('/platforms/{platform_id}', status_code=204)
async def delete_admin_platform(
    platform_id: int,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    refs = await admin_repo.count_entity_references(
        'platform', platform_id
    )
    if refs > 0:
        raise ResourceConflict(
            f'Cannot delete: {refs} application(s) reference this '
            f'platform'
        )

    await admin_repo.session.execute(
        PlatformModel.__table__.delete().where(
            PlatformModel.id == platform_id
        )
    )
    await admin_repo.session.commit()


# ── Supports: Step Definitions ──────────────────────────────────────


@router.get(
    '/step-definitions',
    response_model=list[StepDefinitionSchema],
)
async def list_admin_step_definitions(
    _admin: AdminUserDp,
    step_repo: StepDefinitionRepositoryDp,
):
    return await step_repo.get_all()


@router.post(
    '/step-definitions',
    response_model=StepDefinitionSchema,
    status_code=201,
)
async def create_admin_step_definition(
    body: CreateStepDefinitionSchema,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    step = StepDefinitionModel(
        name=body.name, color=body.color, strict=body.strict
    )
    admin_repo.session.add(step)
    await admin_repo.session.commit()
    await admin_repo.session.refresh(step)
    return step


@router.patch(
    '/step-definitions/{step_id}',
    response_model=StepDefinitionSchema,
)
async def update_admin_step_definition(
    step_id: int,
    body: UpdateStepDefinitionSchema,
    _admin: AdminUserDp,
    step_repo: StepDefinitionRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    step = await step_repo.get_all()
    found = None
    for s in step:
        if s.id == step_id:
            found = s
            break
    if not found:
        raise ResourceNotFound('Step definition not found')

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(found, key, value)

    admin_repo.session.add(found)
    await admin_repo.session.commit()
    await admin_repo.session.refresh(found)
    return found


@router.delete(
    '/step-definitions/{step_id}', status_code=204
)
async def delete_admin_step_definition(
    step_id: int,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    refs = await admin_repo.count_entity_references(
        'step_definition', step_id
    )
    if refs > 0:
        raise ResourceConflict(
            f'Cannot delete: {refs} application step(s) reference '
            f'this step definition'
        )

    await admin_repo.session.execute(
        StepDefinitionModel.__table__.delete().where(
            StepDefinitionModel.id == step_id
        )
    )
    await admin_repo.session.commit()


# ── Supports: Feedback Definitions ──────────────────────────────────


@router.get(
    '/feedback-definitions',
    response_model=list[FeedbackDefinitionSchema],
)
async def list_admin_feedback_definitions(
    _admin: AdminUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
):
    return await feedback_repo.get_all()


@router.post(
    '/feedback-definitions',
    response_model=FeedbackDefinitionSchema,
    status_code=201,
)
async def create_admin_feedback_definition(
    body: CreateFeedbackDefinitionSchema,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    feedback = FeedbackDefinitionModel(
        name=body.name, color=body.color
    )
    admin_repo.session.add(feedback)
    await admin_repo.session.commit()
    await admin_repo.session.refresh(feedback)
    return feedback


@router.patch(
    '/feedback-definitions/{feedback_id}',
    response_model=FeedbackDefinitionSchema,
)
async def update_admin_feedback_definition(
    feedback_id: int,
    body: UpdateFeedbackDefinitionSchema,
    _admin: AdminUserDp,
    feedback_repo: FeedbackDefinitionRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    feedback = await feedback_repo.get_by_id(feedback_id)
    if not feedback:
        raise ResourceNotFound('Feedback definition not found')

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(feedback, key, value)

    admin_repo.session.add(feedback)
    await admin_repo.session.commit()
    await admin_repo.session.refresh(feedback)
    return feedback


@router.delete(
    '/feedback-definitions/{feedback_id}', status_code=204
)
async def delete_admin_feedback_definition(
    feedback_id: int,
    _admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
):
    refs = await admin_repo.count_entity_references(
        'feedback_definition', feedback_id
    )
    if refs > 0:
        raise ResourceConflict(
            f'Cannot delete: {refs} application(s) reference this '
            f'feedback definition'
        )

    await admin_repo.session.execute(
        FeedbackDefinitionModel.__table__.delete().where(
            FeedbackDefinitionModel.id == feedback_id
        )
    )
    await admin_repo.session.commit()
