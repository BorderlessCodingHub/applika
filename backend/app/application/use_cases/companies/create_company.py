from app.application.dto.company import CompanyCreateDTO, CompanyDTO
from app.domain.repositories.company_repository import CompanyRepository
from app.lib.urls import normalize_company_url


class CreateCompanyUseCase:
    def __init__(self, company_repo: CompanyRepository):
        self.company_repo = company_repo

    async def execute(self, data: CompanyCreateDTO) -> CompanyDTO:
        normalized = data.model_copy(
            update={'url': normalize_company_url(str(data.url))}
        )
        company = await self.company_repo.create(normalized)
        return CompanyDTO.model_validate(company)
