from pydantic import HttpUrl

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
            url=HttpUrl(data.url),
            created_by=created_by,
        )
        # Owner decision, 2026-09-25: the admin screens are the only place a
        # company is created public at once (R-021/R-022); it still keeps
        # ``created_by`` (the admin who added it).
        company = await self.company_repo.create(dto, is_public=True)

        logger.info(
            f'Admin created company: {company.name}',
            extra={
                'extra_data': {
                    'event': 'admin_create_company',
                    'company_id': company.id,
                    'company_name': company.name,
                    'admin_id': created_by,
                }
            },
        )

        row = await self.admin_repo.get_admin_company_row(company.id)
        if row:
            return AdminCompanyRowDTO(**row)
        return AdminCompanyRowDTO.model_validate(company)
