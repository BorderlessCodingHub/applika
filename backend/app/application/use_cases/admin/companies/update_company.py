from app.application.dto.admin import (
    AdminCompanyRowDTO,
    AdminCompanyUpdateDTO,
)
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.company_repository import CompanyRepository


class UpdateAdminCompanyUseCase:
    def __init__(
        self,
        company_repo: CompanyRepository,
        admin_repo: AdminRepository,
    ):
        self.company_repo = company_repo
        self.admin_repo = admin_repo

    async def execute(
        self,
        company_id: int,
        data: AdminCompanyUpdateDTO,
        admin_id: int,
    ) -> AdminCompanyRowDTO:
        company = await self.company_repo.get_by_id_unfiltered(
            company_id
        )
        if not company:
            logger.warning(
                f'Admin update company failed: {company_id}',
                extra={'extra_data': {
                    'event': 'admin_update_company_failed',
                    'reason': 'company_not_found',
                    'company_id': company_id,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceNotFound('Company not found')

        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(company, key, value)

        await self.company_repo.update(company)

        logger.info(
            f'Admin updated company: {company_id}',
            extra={'extra_data': {
                'event': 'admin_update_company',
                'company_id': company_id,
                'admin_id': admin_id,
                'fields_updated': list(update_data.keys()),
            }},
        )

        rows, _ = await self.admin_repo.get_admin_companies(
            search=company.name, page=1, per_page=1
        )
        if rows:
            return AdminCompanyRowDTO(**rows[0])
        return AdminCompanyRowDTO.model_validate(company)
