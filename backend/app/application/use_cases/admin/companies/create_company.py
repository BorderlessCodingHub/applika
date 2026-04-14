from app.application.dto.admin import (
    AdminCompanyCreateDTO,
    AdminCompanyRowDTO,
)
from app.application.dto.company import CompanyCreateDTO
from app.config.logging import logger
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.company_repository import CompanyRepository


class CreateAdminCompanyUseCase:
    def __init__(
        self,
        company_repo: CompanyRepository,
        admin_repo: AdminRepository,
    ):
        self.company_repo = company_repo
        self.admin_repo = admin_repo

    async def execute(
        self, data: AdminCompanyCreateDTO, created_by: int
    ) -> AdminCompanyRowDTO:
        dto = CompanyCreateDTO(
            name=data.name,
            url=data.url,
            created_by=created_by,
        )
        company = await self.company_repo.create(dto)

        logger.info(
            f'Admin created company: {company.name}',
            extra={'extra_data': {
                'event': 'admin_create_company',
                'company_id': company.id,
                'company_name': company.name,
                'admin_id': created_by,
            }},
        )

        rows, _ = await self.admin_repo.get_admin_companies(
            search=company.name, page=1, per_page=1
        )
        if rows:
            return AdminCompanyRowDTO(**rows[0])
        return AdminCompanyRowDTO.model_validate(company)
