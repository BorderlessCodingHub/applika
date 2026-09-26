from fastapi import APIRouter, Query, Response

from app.application.dto.company import CompanyInputDTO
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


@router.get('/companies', response_model=list[Company])
async def list_companies(
    c_user: CurrentUserDp,
    company_repo: CompanyRepositoryDp,
    name: str | None = Query(None, description='Filter companies by name'),
):
    use_case = ListCompaniesUseCase(company_repo)
    return await use_case.execute(c_user.id, name=name)


@router.post('/companies', response_model=Company)
async def create_company(
    payload: CreateCompany,
    response: Response,
    c_user: CurrentUserDp,
    company_repo: CompanyRepositoryDp,
):
    use_case = CreateCompanyUseCase(company_repo)
    dto, created = await use_case.execute(
        CompanyInputDTO(name=payload.name, url=payload.url), c_user.id
    )
    response.status_code = 201 if created else 200
    return Company.model_validate(dto)
