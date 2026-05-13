from __future__ import annotations

from datetime import date

from app.application.dto.application import (
    ApplicationCompanyInputDTO,
    ApplicationCreateDTO,
    ApplicationDTO,
)
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.domain.repositories.job_repository import JobRepository
from app.domain.repositories.platform_repository import PlatformRepository

_SOURCE_NAME_MAP = {
    'himalayas': 'Himalayas',
    'remoteok': 'RemoteOK',
}


class CreateApplicationFromJobUseCase:
    def __init__(
        self,
        job_repo: JobRepository,
        application_repo: ApplicationRepository,
        platform_repo: PlatformRepository,
        company_repo: CompanyRepository,
    ):
        self.job_repo = job_repo
        self.application_repo = application_repo
        self.platform_repo = platform_repo
        self.company_repo = company_repo

    async def execute(self, job_id: int, user_id: int) -> ApplicationDTO:
        job = await self.job_repo.get_by_id(job_id)
        if job is None:
            raise ResourceNotFound('Job not found')

        platform = await self._resolve_platform(job.source.code)

        data = ApplicationCreateDTO(
            user_id=user_id,
            role=job.title,
            company=ApplicationCompanyInputDTO(
                name=job.company_name,
                url=job.company_url,
            ),
            mode='active',
            platform_id=platform.id,
            application_date=date.today(),
            link_to_job=job.job_url,
        )

        company = data.company
        if isinstance(company, ApplicationCompanyInputDTO):
            if company.url is not None:
                from app.application.dto.company import CompanyCreateDTO

                new_company = await self.company_repo.create(
                    CompanyCreateDTO(
                        name=company.name,
                        url=company.url,
                        created_by=user_id,
                    )
                )
                company_id = new_company.id
                company_name = new_company.name
            else:
                company_id = None
                company_name = company.name
        else:
            existing = await self.company_repo.get_by_id(company)
            if not existing:
                raise ResourceNotFound('Company not found')
            company_id = existing.id
            company_name = existing.name

        application = await self.application_repo.create(
            data, company_id=company_id, company_name=company_name
        )
        return ApplicationDTO.model_validate(application)

    async def _resolve_platform(self, source_code: str):
        platforms = await self.platform_repo.get_all()
        name = _SOURCE_NAME_MAP.get(source_code, source_code.title())
        for p in platforms:
            if p.name.lower() == name.lower():
                return p
        return await self.platform_repo.create(name=name)
