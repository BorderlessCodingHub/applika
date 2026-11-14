"""List-master-CVs use case."""

from app.application.dto.base_cv import BaseCVDTO
from app.domain.repositories.base_cv_repository import BaseCVRepository


class ListBaseCVsUseCase:
    """List the acting user's own master CVs, newest first.

    Scoped to the acting user (ADR-0004): another user's rows are never
    returned, admin or not.
    """

    def __init__(self, base_cv_repo: BaseCVRepository):
        self.base_cv_repo = base_cv_repo

    async def execute(self, user_id: int) -> list[BaseCVDTO]:
        base_cvs = await self.base_cv_repo.list_by_user_id(user_id)
        return [BaseCVDTO.model_validate(base_cv) for base_cv in base_cvs]
