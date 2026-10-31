"""Restore a dismissed job to the acting user's list (KODI-047, PRD 0012
R-029)."""

from app.application.use_cases.jobs.get_job import JOB_NOT_FOUND
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceNotFound
from app.domain.repositories.job_dismissal_repository import (
    JobDismissalRepository,
)
from app.domain.repositories.job_repository import JobRepository


class RestoreJobUseCase:
    """An unknown job is a 404. A known one loses the caller's own
    dismissal row; restoring a job that is not dismissed is a no-op."""

    def __init__(
        self, job_repo: JobRepository, dismissal_repo: JobDismissalRepository
    ):
        self.job_repo = job_repo
        self.dismissal_repo = dismissal_repo

    async def execute(self, job_id: int, user_id: int) -> None:
        if not await self.job_repo.exists(job_id):
            raise ResourceNotFound(JOB_NOT_FOUND, ErrorCode.JOB_JOB_NOT_FOUND)
        await self.dismissal_repo.restore(user_id, job_id)
