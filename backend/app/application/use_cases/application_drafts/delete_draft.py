from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class DeleteDraftUseCase:
    """Delete the caller's own draft. Its CV copy goes with it through the
    same FK ON DELETE CASCADE the ordinary application delete relies on
    (``tailored_cvs.application_id``)."""

    def __init__(self, application_repo: ApplicationRepository):
        self.application_repo = application_repo

    async def execute(self, id: int, user_id: int) -> None:
        application = await self.application_repo.get_draft(id, user_id)
        if not application:
            raise ResourceNotFound('Draft not found')
        await self.application_repo.delete_by_id(id)
