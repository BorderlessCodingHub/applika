from app.application.dto.company import CompanyDTO
from app.domain.repositories.company_repository import CompanyRepository


class ListCompaniesUseCase:
    def __init__(self, company_repo: CompanyRepository):
        self.company_repo = company_repo

    async def execute(
        self, user_id: int, name: str | None = None
    ) -> list[CompanyDTO]:
        """Public companies plus the caller's own private ones (R-018,
        R-024): ``GET /companies`` never shows another user's private row."""
        companies = await self.company_repo.list_visible(user_id, name=name)
        return [CompanyDTO.model_validate(c) for c in companies]
