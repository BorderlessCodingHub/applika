from typing import List

from fastapi import APIRouter, Query

from app.application.dto.company import CompanyCreateDTO
from app.application.use_cases.companies.create_company import (
    CreateCompanyUseCase,
)
from app.application.use_cases.companies.list_companies import (
    ListCompaniesUseCase,
)
from app.presentation.dependencies import (
    CompanyRepositoryDp,
    CurrentUserDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.company import Company, CreateCompany

router = APIRouter(
    tags=['Companies'],
    responses={'403': {'model': DetailSchema}},
)


@router.post(
    '/companies',
    response_model=Company,
    status_code=201,
)
async def create(
    payload: CreateCompany,
    c_user: CurrentUserDp,
    company_repo: CompanyRepositoryDp,
):
    use_case = CreateCompanyUseCase(company_repo)
    data = CompanyCreateDTO(
        **payload.model_dump(), created_by=c_user.id
    )
    company = await use_case.execute(data)
    return Company.model_validate(company)


@router.get('/companies', response_model=List[Company])
async def list_companies(
    c_user: CurrentUserDp,
    company_repo: CompanyRepositoryDp,
    name: str | None = Query(
        None, description='Filter companies by name'
    ),
):
    use_case = ListCompaniesUseCase(company_repo)
    return await use_case.execute(name=name)
