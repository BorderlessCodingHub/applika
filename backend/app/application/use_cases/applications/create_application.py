from app.application.dto.application import (
    ApplicationCompanyInputDTO,
    ApplicationCreateDTO,
    ApplicationDTO,
)
from app.application.dto.company import CompanyCreateDTO
from app.application.validators.application_date import ensure_not_in_future
from app.config.logging import logger
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.platform_repository import PlatformRepository


class CreateApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
    ):
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo

    async def execute(self, data: ApplicationCreateDTO) -> ApplicationDTO:
        ensure_not_in_future(data.application_date, 'application_date')

        platform = await self.platform_repo.get_by_id(data.platform_id)
        if not platform:
            logger.warning(
                f'Platform not found: {data.platform_id}',
                extra={'extra_data': {
                    'event': 'create_application_failed',
                    'reason': 'platform_not_found',
                    'user_id': data.user_id,
                }},
            )
            raise ResourceNotFound('Platform not found')

        company_id, company_name = await self._resolve_company(
            data.company, data.user_id
        )

        application = await self.application_repo.create(
            data, company_id=company_id, company_name=company_name
        )
        logger.info(
            f'Application created: {application.id}',
            extra={'extra_data': {
                'event': 'application_created',
                'application_id': application.id,
                'user_id': data.user_id,
                'company': company_name,
                'role': data.role,
            }},
        )
        return ApplicationDTO.model_validate(application)

    async def _resolve_company(
        self,
        company: int | ApplicationCompanyInputDTO,
        user_id: int,
    ) -> tuple[int | None, str]:
        if isinstance(company, int):
            existing = await self.company_repo.get_by_id(company)
            if not existing:
                raise ResourceNotFound('Company not found')
            return existing.id, existing.name

        if company.url is not None:
            new_company = await self.company_repo.create(
                CompanyCreateDTO(
                    name=company.name,
                    url=company.url,
                    created_by=user_id,
                )
            )
            return new_company.id, new_company.name

        return None, company.name
