from sqlalchemy.exc import IntegrityError

from app.application.dto.admin import AdminCompanyRowDTO
from app.config.logging import logger
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.repositories.admin_repository import AdminRepository
from app.domain.repositories.company_repository import CompanyRepository


class PublishCompanyUseCase:
    """``POST /admin/companies/{id}/publish`` (ADR-0014, R-025/R-026): makes
    a private company visible to every user, keeping who added it
    (``created_by`` is never cleared). Idempotent - publishing an already
    public row is a no-op 200. Refused with a 409 naming the public row it
    would duplicate on ``(lower(name), url)``."""

    def __init__(
        self,
        company_repo: CompanyRepository,
        admin_repo: AdminRepository,
    ):
        self.company_repo = company_repo
        self.admin_repo = admin_repo

    async def execute(
        self, company_id: int, admin_id: int
    ) -> AdminCompanyRowDTO:
        company = await self.company_repo.get_by_id_unfiltered(company_id)
        if not company:
            raise ResourceNotFound('Company not found')

        if company.is_public:
            return await self._row(company_id)

        collision = await self.company_repo.find_public_collision(
            company.name, company.url, exclude_id=company.id
        )
        if collision:
            raise ResourceConflict(
                'A public company with this name and URL already exists: '
                f'{collision.name} ({collision.url}, id {collision.id})'
            )

        company.is_public = True
        try:
            await self.company_repo.update(company)
        except IntegrityError as err:
            raise ResourceConflict(
                'A public company with this name and URL already exists: '
                f'{company.name} ({company.url})'
            ) from err

        logger.info(
            f'Admin published company: {company_id}',
            extra={
                'extra_data': {
                    'event': 'admin_publish_company',
                    'company_id': company_id,
                    'admin_id': admin_id,
                }
            },
        )

        return await self._row(company_id)

    async def _row(self, company_id: int) -> AdminCompanyRowDTO:
        row = await self.admin_repo.get_admin_company_row(company_id)
        if not row:
            raise ResourceNotFound('Company not found')
        return AdminCompanyRowDTO(**row)
