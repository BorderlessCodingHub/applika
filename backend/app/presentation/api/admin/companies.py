from fastapi import APIRouter, Query

from app.application.dto.admin import (
    AdminCompanyCreateDTO,
    AdminCompanyUpdateDTO,
)
from app.application.use_cases.admin.companies.create_company import (
    CreateAdminCompanyUseCase,
)
from app.application.use_cases.admin.companies.delete_company import (
    DeleteAdminCompanyUseCase,
)
from app.application.use_cases.admin.companies.list_companies import (
    ListAdminCompaniesUseCase,
)
from app.application.use_cases.admin.companies.publish_company import (
    PublishCompanyUseCase,
)
from app.application.use_cases.admin.companies.update_company import (
    UpdateAdminCompanyUseCase,
)
from app.presentation.dependencies import (
    AdminRepositoryDp,
    AdminUserDp,
    CompanyRepositoryDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.admin import (
    AdminCompanyRowSchema,
    CreateCompanySchema,
    CreatedBySchema,
    PaginatedCompaniesSchema,
    UpdateCompanySchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Companies'],
    responses={'403': {'model': DetailSchema}},
)


def _row_schema(item) -> AdminCompanyRowSchema:
    created_by = None
    if item.created_by is not None and item.created_by_username is not None:
        created_by = CreatedBySchema(
            id=item.created_by, username=item.created_by_username
        )
    return AdminCompanyRowSchema(
        id=item.id,
        name=item.name,
        url=item.url,
        is_active=item.is_active,
        is_public=item.is_public,
        applications_count=item.applications_count,
        created_by=created_by,
        created_at=item.created_at,
    )


@router.get('/companies', response_model=PaginatedCompaniesSchema)
async def list_admin_companies(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
    visibility: str | None = Query(None, pattern='^(public|private)$'),
    sort_by: str = Query('name'),
    sort_order: str = Query('asc'),
    page: int = Query(1, ge=1),
    per_page: int = Query(25, ge=1, le=100),
):
    use_case = ListAdminCompaniesUseCase(admin_repo)
    dto = await use_case.execute(
        admin_id=admin.id,
        search=search,
        is_active=is_active,
        visibility=visibility,
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedCompaniesSchema(
        items=[_row_schema(item) for item in dto.items],
        total=dto.total,
        page=dto.page,
        per_page=dto.per_page,
        total_pages=dto.total_pages,
    )


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
    use_case = CreateAdminCompanyUseCase(company_repo, admin_repo)
    data = AdminCompanyCreateDTO(name=body.name, url=body.url)
    dto = await use_case.execute(data, created_by=admin.id)
    return _row_schema(dto)


@router.patch(
    '/companies/{company_id}',
    response_model=AdminCompanyRowSchema,
)
async def update_admin_company(
    company_id: int,
    body: UpdateCompanySchema,
    admin: AdminUserDp,
    company_repo: CompanyRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = UpdateAdminCompanyUseCase(company_repo, admin_repo)
    data = AdminCompanyUpdateDTO(**body.model_dump(exclude_unset=True))
    dto = await use_case.execute(company_id, data, admin.id)
    return _row_schema(dto)


@router.post(
    '/companies/{company_id}/publish',
    response_model=AdminCompanyRowSchema,
)
async def publish_admin_company(
    company_id: int,
    admin: AdminUserDp,
    company_repo: CompanyRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = PublishCompanyUseCase(company_repo, admin_repo)
    dto = await use_case.execute(company_id, admin.id)
    return _row_schema(dto)


@router.delete('/companies/{company_id}', status_code=204)
async def delete_admin_company(
    company_id: int,
    admin: AdminUserDp,
    company_repo: CompanyRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = DeleteAdminCompanyUseCase(company_repo, admin_repo)
    await use_case.execute(company_id, admin.id)
