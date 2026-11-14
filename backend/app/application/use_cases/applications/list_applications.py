from app.application.dto.application import ApplicationDTO
from app.application.use_cases.applications.read_model import (
    ApplicationReadModel,
)
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class ListApplicationsUseCase:
    def __init__(
        self,
        app_repo: ApplicationRepository,
        read_model: ApplicationReadModel,
    ):
        self.app_repo = app_repo
        self.read_model = read_model

    async def execute(
        self, user_id: int, cycle_id: int | None = None
    ) -> list[ApplicationDTO]:
        db_applications = await self.app_repo.get_all_by_user_id(
            user_id, cycle_id
        )
        return await self.read_model.many(db_applications)
