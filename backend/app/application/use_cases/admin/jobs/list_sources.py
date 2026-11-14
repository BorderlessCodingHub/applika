from app.application.dto.job import JobSourceDTO
from app.config.logging import logger
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)


class ListJobSourcesUseCase:
    """Every source with its switch, its last run and how many of its jobs
    are listed (R-033)."""

    def __init__(self, source_repo: JobSourceRepository):
        self.source_repo = source_repo

    async def execute(self, admin_id: int) -> list[JobSourceDTO]:
        sources = await self.source_repo.list_all()
        active = await self.source_repo.active_job_counts()
        logger.info(
            'Admin listed job sources',
            extra={
                'extra_data': {
                    'event': 'admin_list_job_sources',
                    'admin_id': admin_id,
                }
            },
        )
        return [
            JobSourceDTO.model_validate(source).model_copy(
                update={'active_jobs': active.get(source.id, 0)}
            )
            for source in sources
        ]
