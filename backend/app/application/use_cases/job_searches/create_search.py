from app.application.dto.job_search import JobSearchDTO, JobSearchInputDTO
from app.application.use_cases.job_searches import (
    LIMIT_REACHED,
    MAX_SAVED_SEARCHES,
)
from app.config.logging import logger
from app.core.exceptions import ResourceConflict
from app.domain.repositories.saved_job_search_repository import (
    NAME_TAKEN,
    SavedJobSearchRepository,
)


class CreateJobSearchUseCase:
    """Save a search for the acting user, at most ten.

    The ``base_cvs/create.py`` pattern: the user row is locked
    (``SELECT ... FOR UPDATE``), the user's searches are counted under the
    lock, and at the cap the transaction is rolled back (releasing the lock)
    before the 409 - so two concurrent creates can never make an eleventh.
    A name the user already has, in any case, is a 409 too; the
    ``lower(name)`` unique index answers the same if a rename races it.
    """

    def __init__(self, search_repo: SavedJobSearchRepository):
        self.search_repo = search_repo

    async def execute(self, data: JobSearchInputDTO) -> JobSearchDTO:
        await self.search_repo.lock_user(data.user_id)
        existing = await self.search_repo.count_by_user_id(data.user_id)
        if existing >= MAX_SAVED_SEARCHES:
            await self.search_repo.rollback()
            logger.info(
                f'Saved search limit reached for user {data.user_id}',
                extra={
                    'extra_data': {
                        'event': 'saved_job_search_limit_reached',
                        'user_id': data.user_id,
                    }
                },
            )
            raise ResourceConflict(LIMIT_REACHED)
        if await self.search_repo.name_taken(data.user_id, data.name):
            await self.search_repo.rollback()
            raise ResourceConflict(NAME_TAKEN)

        search = await self.search_repo.create(
            data.user_id, data.name, data.filters
        )
        return JobSearchDTO.model_validate(search)
