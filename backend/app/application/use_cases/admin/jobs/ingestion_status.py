from app.application.dto.jobs import JobSourceDTO
from app.domain.repositories.job_source_repository import (
    JobSourceRepository,
)


class IngestionStatusUseCase:
    def __init__(self, job_source_repo: JobSourceRepository):
        self.job_source_repo = job_source_repo

    async def execute(self) -> list[JobSourceDTO]:
        sources = await self.job_source_repo.get_all()
        return [JobSourceDTO.model_validate(s) for s in sources]
