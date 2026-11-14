from app.application.dto.job import JobSourceDTO
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)


class UpdateJobSourceUseCase:
    """Switch a source off or on (R-034). A run skips a source that is
    off; its listed jobs stay until they expire."""

    def __init__(self, source_repo: JobSourceRepository):
        self.source_repo = source_repo

    async def execute(
        self, source_id: int, is_enabled: bool, admin_id: int
    ) -> JobSourceDTO:
        source = await self.source_repo.set_enabled(source_id, is_enabled)
        if source is None:
            raise ResourceNotFound(
                'Job source not found', ErrorCode.ADM_JOB_SOURCE_NOT_FOUND
            )
        active = await self.source_repo.active_job_counts()
        logger.info(
            f'Admin switched job source {source.code} '
            f'{"on" if is_enabled else "off"}',
            extra={
                'extra_data': {
                    'event': 'admin_update_job_source',
                    'source_id': source_id,
                    'is_enabled': is_enabled,
                    'admin_id': admin_id,
                }
            },
        )
        return JobSourceDTO.model_validate(source).model_copy(
            update={'active_jobs': active.get(source_id, 0)}
        )
