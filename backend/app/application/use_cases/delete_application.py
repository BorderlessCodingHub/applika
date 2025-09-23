from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class DeleteApplicationUseCase:
    def __init__(
        self,
        application_repo: ApplicationRepository,
    ):
        self.application_repo = application_repo

    async def execute(self, id: int, user_id: int) -> None:
        count = await self.application_repo.delete_by_id_and_user_id(
            id, user_id
        )
        if count == 0:
            raise ResourceNotFound(
                'Application not found or not owned by user'
            )
