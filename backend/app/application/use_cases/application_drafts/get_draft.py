from app.application.dto.application_draft import DraftDTO
from app.application.use_cases.application_drafts.create_draft import (
    to_draft_dto,
)
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class GetDraftUseCase:
    def __init__(self, application_repo: ApplicationRepository):
        self.application_repo = application_repo

    async def execute(self, id: int, user_id: int) -> DraftDTO:
        application = await self.application_repo.get_draft(id, user_id)
        if not application:
            raise ResourceNotFound(
                'Draft not found', ErrorCode.APP_DRAFT_NOT_FOUND
            )
        return to_draft_dto(
            application, has_cv=application.tailored_cv is not None
        )
