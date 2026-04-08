from typing import List

from app.application.dto.company import CompanyDTO
from app.domain.repositories.company_repository import CompanyRepository


class ListCompaniesUseCase:
    def __init__(self, company_repo: CompanyRepository):
        self.company_repo = company_repo

    async def execute(self, name: str | None = None) -> List[CompanyDTO]:
        companies = await self.company_repo.get_all(name=name)
        return [CompanyDTO.model_validate(c) for c in companies]
