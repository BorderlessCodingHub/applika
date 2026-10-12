from app.application.use_cases.job_searches import SEARCH_NOT_FOUND
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.saved_job_search_repository import (
    SavedJobSearchRepository,
)


class DeleteJobSearchUseCase:
    """Delete one of the acting user's saved searches; another user's is a
    404."""

    def __init__(self, search_repo: SavedJobSearchRepository):
        self.search_repo = search_repo

    async def execute(self, id: int, user_id: int) -> None:
        search = await self.search_repo.get_by_id_and_user_id(id, user_id)
        if search is None:
            raise ResourceNotFound(SEARCH_NOT_FOUND)
        await self.search_repo.delete(search)
