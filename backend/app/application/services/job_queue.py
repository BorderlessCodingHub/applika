"""The ``JobQueue`` port (ADR-0016): how the API asks the background worker
for work, without knowing taskiq. ``app/worker/queue.py`` binds it.

Every method raises when the queue cannot be reached; the caller decides
what that means (a WARNING after a master CV save, a 503 on "run now").
"""

from typing import Protocol

from app.config.logging import logger

# The Redis key that keeps two collection runs apart (R-009). Held by the
# running ``ingest_jobs`` task, read by ``ingest_running``.
INGEST_LOCK_KEY = 'applika:jobs:ingest:lock'


class JobQueue(Protocol):
    async def enqueue_ingest(self) -> None:
        """Queue one collection run now."""
        ...

    async def enqueue_recompute_fit(self, base_cv_id: int) -> None:
        """Queue a fit recompute for one master CV."""
        ...

    async def ingest_running(self) -> bool:
        """Whether a collection run holds the lock right now."""
        ...


async def request_fit_recompute(queue: JobQueue, base_cv_id: int) -> None:
    """Best effort (ADR-0016, R-016): ask for a fit recompute after a master
    CV save. A queue that cannot be reached logs a WARNING and is otherwise
    ignored - the save already succeeded, and the next hourly run rescores
    the CV because it is stale."""
    try:
        await queue.enqueue_recompute_fit(base_cv_id)
    except Exception as exc:
        logger.warning(
            'Fit recompute not queued; the next hourly run will do it',
            extra={
                'extra_data': {
                    'event': 'fit_recompute_enqueue_failed',
                    'base_cv_id': base_cv_id,
                    'error': type(exc).__name__,
                }
            },
        )
