from app.application.dto.company import CompanyCreateDTO, CompanyDTO
from app.domain.repositories.company_repository import CompanyRepository


class CreateCompanyUseCase:
    def __init__(self, company_repo: CompanyRepository):
        self.company_repo = company_repo

    async def execute(self, data: CompanyCreateDTO) -> CompanyDTO:
        company = await self.company_repo.create(data)
        return CompanyDTO.model_validate(company)
