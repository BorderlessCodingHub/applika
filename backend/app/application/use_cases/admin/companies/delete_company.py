from app.config.logging import logger
from app.core.exceptions import ResourceConflict
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.company_repository import CompanyRepository


class DeleteAdminCompanyUseCase:
    def __init__(
        self,
        company_repo: CompanyRepository,
        admin_repo: AdminRepository,
    ):
        self.company_repo = company_repo
        self.admin_repo = admin_repo

    async def execute(
        self, company_id: int, admin_id: int
    ) -> None:
        refs = await self.admin_repo.count_entity_references(
            'company', company_id
        )
        if refs > 0:
            logger.warning(
                f'Admin delete company blocked: {company_id}',
                extra={'extra_data': {
                    'event': 'admin_delete_company_blocked',
                    'reason': 'has_references',
                    'company_id': company_id,
                    'references_count': refs,
                    'admin_id': admin_id,
                }},
            )
            raise ResourceConflict(
                f'Cannot delete: {refs} application(s) '
                f'reference this company'
            )

        await self.company_repo.delete(company_id)

        logger.info(
            f'Admin deleted company: {company_id}',
            extra={'extra_data': {
                'event': 'admin_delete_company',
                'company_id': company_id,
                'admin_id': admin_id,
            }},
        )
