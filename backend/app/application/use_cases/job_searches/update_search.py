from app.application.dto.job_search import JobSearchDTO, JobSearchUpdateDTO
from app.application.use_cases.job_searches import SEARCH_NOT_FOUND
from app.core.exceptions import ResourceConflict, ResourceNotFound
from app.domain.repositories.saved_job_search_repository import (
    NAME_TAKEN,
    SavedJobSearchRepository,
)


class UpdateJobSearchUseCase:
    """Rename a saved search and/or replace its filters. Another user's
    search is a 404; a name another of the user's searches has, in any case,
    is a 409. Renaming a search to itself in another case is allowed."""

    def __init__(self, search_repo: SavedJobSearchRepository):
        self.search_repo = search_repo

    async def execute(self, id: int, data: JobSearchUpdateDTO) -> JobSearchDTO:
        search = await self.search_repo.get_by_id_and_user_id(id, data.user_id)
        if search is None:
            raise ResourceNotFound(SEARCH_NOT_FOUND)
        if data.name is not None and await self.search_repo.name_taken(
            data.user_id, data.name, exclude_id=search.id
        ):
            raise ResourceConflict(NAME_TAKEN)
        search = await self.search_repo.update(search, data.name, data.filters)
        return JobSearchDTO.model_validate(search)
