from app.application.services.job_queue import JobQueue
from app.config.logging import logger
from app.core.error_codes import ErrorCode
from app.core.exceptions import ResourceConflict, ServiceUnavailable

RUN_IN_PROGRESS = 'A run is already in progress'
SERVICE_UNAVAILABLE = 'Background service unavailable'


class StartJobRunUseCase:
    """Start a collection run now (R-035): refused while one holds the run
    lock; a queue that cannot be reached is "Background service
    unavailable". The run itself still takes the lock, so a race between
    two admins never runs twice (R-009)."""

    def __init__(self, job_queue: JobQueue):
        self.job_queue = job_queue

    async def execute(self, admin_id: int) -> None:
        try:
            running = await self.job_queue.ingest_running()
        except Exception as exc:
            self._unavailable(admin_id, exc)
            raise ServiceUnavailable(
                SERVICE_UNAVAILABLE,
                ErrorCode.ADM_BACKGROUND_SERVICE_UNAVAILABLE,
            ) from exc
        if running:
            raise ResourceConflict(
                RUN_IN_PROGRESS, ErrorCode.ADM_JOB_RUN_IN_PROGRESS
            )
        try:
            await self.job_queue.enqueue_ingest()
        except Exception as exc:
            self._unavailable(admin_id, exc)
            raise ServiceUnavailable(
                SERVICE_UNAVAILABLE,
                ErrorCode.ADM_BACKGROUND_SERVICE_UNAVAILABLE,
            ) from exc
        logger.info(
            'Admin started a job collection run',
            extra={
                'extra_data': {
                    'event': 'admin_start_job_run',
                    'admin_id': admin_id,
                }
            },
        )

    @staticmethod
    def _unavailable(admin_id: int, exc: Exception) -> None:
        logger.warning(
            'Job collection run not started: the queue is unreachable',
            extra={
                'extra_data': {
                    'event': 'admin_start_job_run_unavailable',
                    'admin_id': admin_id,
                    'error': type(exc).__name__,
                }
            },
        )
