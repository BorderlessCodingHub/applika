from app.application.dto.company import (
    CompanyCreateDTO,
    CompanyDTO,
    CompanyInputDTO,
)
from app.domain.repositories.company_repository import CompanyRepository
from app.lib.urls import normalize_company_url


class CreateCompanyUseCase:
    """``POST /companies`` (ADR-0014, R-024): reuse a company the caller
    already sees matching the normalised name and url, else create a new
    **private** one owned by the caller - admins included, there is no
    admin branch (owner decision, 2026-09-25)."""

    def __init__(self, company_repo: CompanyRepository):
        self.company_repo = company_repo

    async def execute(
        self, data: CompanyInputDTO, user_id: int
    ) -> tuple[CompanyDTO, bool]:
        """Returns ``(dto, created)`` - ``created`` is ``False`` when an
        existing visible row was reused (the route answers 200), ``True``
        for a brand-new row (201)."""
        normalized_url = normalize_company_url(str(data.url))

        existing = await self.company_repo.find_visible_match(
            data.name, normalized_url, user_id
        )
        if existing:
            return CompanyDTO.model_validate(existing), False

        create_dto = CompanyCreateDTO(
            name=data.name, url=data.url, created_by=user_id
        ).model_copy(update={'url': normalized_url})
        company = await self.company_repo.create(create_dto, is_public=False)
        return CompanyDTO.model_validate(company), True
