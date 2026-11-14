from app.application.dto.application_draft import DraftSummaryDTO
from app.domain.repositories.application_repository import (
    ApplicationRepository,
)


class ListDraftsUseCase:
    def __init__(self, application_repo: ApplicationRepository):
        self.application_repo = application_repo

    async def execute(self, user_id: int) -> list[DraftSummaryDTO]:
        drafts = await self.application_repo.list_drafts(user_id)
        return [
            DraftSummaryDTO(
                id=draft.id,
                created_at=draft.created_at,
                updated_at=draft.updated_at,
                company_name=draft.company_name,
                role=draft.role,
                platform_id=draft.platform_id,
                has_cv=draft.tailored_cv is not None,
            )
            for draft in drafts
        ]
