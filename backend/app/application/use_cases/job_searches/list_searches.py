from app.application.dto.job_search import JobSearchDTO
from app.domain.repositories.saved_job_search_repository import (
    SavedJobSearchRepository,
)


class ListJobSearchesUseCase:
    """The acting user's saved searches, by name ignoring case."""

    def __init__(self, search_repo: SavedJobSearchRepository):
        self.search_repo = search_repo

    async def execute(self, user_id: int) -> list[JobSearchDTO]:
        return [
            JobSearchDTO.model_validate(search)
            for search in await self.search_repo.list_by_user_id(user_id)
        ]
