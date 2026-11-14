from app.application.dto.application import (
    ApplicationCreateDTO,
    ApplicationDTO,
)
from app.application.use_cases.catalog.resolve import (
    ensure_platform_visible,
    resolve_company,
)
from app.application.validators.application_date import ensure_not_in_future
from app.config.logging import logger
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

        # Platform, then company, then the write - a 404 on either writes
        # nothing (ADR-0014).
        await ensure_platform_visible(
            self.platform_repo, data.platform_id, data.user_id
        )

        company_id, company_name = await resolve_company(
            self.company_repo, data.company, data.user_id
        )

        application = await self.application_repo.create(
            data, company_id=company_id, company_name=company_name
        )
        logger.info(
            f'Application created: {application.id}',
            extra={
                'extra_data': {
                    'event': 'application_created',
                    'application_id': application.id,
                    'user_id': data.user_id,
                    'company': company_name,
                    'role': data.role,
                }
            },
        )
        return ApplicationDTO.model_validate(application)
