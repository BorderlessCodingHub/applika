from typing import List

from fastapi import APIRouter, Query

from app.application.use_cases.companies.list_companies import (
    ListCompaniesUseCase,
)
from app.presentation.dependencies import (
    CompanyRepositoryDp,
    CurrentUserDp,
)
from app.presentation.schemas import DetailSchema
from app.presentation.schemas.company import Company

router = APIRouter(
    tags=['Companies'],
    responses={'403': {'model': DetailSchema}},
)


@router.get('/companies', response_model=List[Company])
async def list_companies(
    c_user: CurrentUserDp,
    company_repo: CompanyRepositoryDp,
    name: str | None = Query(None, description='Filter companies by name'),
):
    use_case = ListCompaniesUseCase(company_repo)
    return await use_case.execute(name=name)
