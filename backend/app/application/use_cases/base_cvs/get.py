"""Get-master-CV use case."""

from app.application.dto.base_cv import BaseCVDTO
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.base_cv_repository import BaseCVRepository


class GetBaseCVUseCase:
    """Fetch one of the acting user's own master CVs.

    A master CV that does not exist *or* belongs to another user surfaces as a
    404 ``ResourceNotFound`` (ADR-0004), so cross-user access is
    indistinguishable from a genuine miss. Being an admin grants nothing here.
    """

    def __init__(self, base_cv_repo: BaseCVRepository):
        self.base_cv_repo = base_cv_repo

    async def execute(self, base_cv_id: int, user_id: int) -> BaseCVDTO:
        base_cv = await self.base_cv_repo.get_by_id_and_user_id(
            base_cv_id, user_id
        )
        if not base_cv:
            raise ResourceNotFound(
                'Base CV not found', ErrorCode.CV_BASE_CV_NOT_FOUND
            )
        return BaseCVDTO.model_validate(base_cv)
