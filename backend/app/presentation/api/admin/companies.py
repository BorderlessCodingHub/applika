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
    PaginatedCompaniesSchema,
    UpdateCompanySchema,
)

router = APIRouter(
    prefix='/admin',
    tags=['Admin - Companies'],
    responses={'403': {'model': DetailSchema}},
)


@router.get(
    '/companies', response_model=PaginatedCompaniesSchema
)
async def list_admin_companies(
    admin: AdminUserDp,
    admin_repo: AdminRepositoryDp,
    search: str | None = Query(None),
    is_active: bool | None = Query(None),
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
        sort_by=sort_by,
        sort_order=sort_order,
        page=page,
        per_page=per_page,
    )
    return PaginatedCompaniesSchema.model_validate(dto)


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
    use_case = CreateAdminCompanyUseCase(
        company_repo, admin_repo
    )
    data = AdminCompanyCreateDTO(name=body.name, url=body.url)
    dto = await use_case.execute(data, created_by=admin.id)
    return AdminCompanyRowSchema.model_validate(dto)


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
    use_case = UpdateAdminCompanyUseCase(
        company_repo, admin_repo
    )
    data = AdminCompanyUpdateDTO(
        **body.model_dump(exclude_unset=True)
    )
    dto = await use_case.execute(
        company_id, data, admin.id
    )
    return AdminCompanyRowSchema.model_validate(dto)


@router.delete('/companies/{company_id}', status_code=204)
async def delete_admin_company(
    company_id: int,
    admin: AdminUserDp,
    company_repo: CompanyRepositoryDp,
    admin_repo: AdminRepositoryDp,
):
    use_case = DeleteAdminCompanyUseCase(
        company_repo, admin_repo
    )
    await use_case.execute(company_id, admin.id)
