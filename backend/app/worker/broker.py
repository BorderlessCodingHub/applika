"""The taskiq broker and scheduler (ADR-0016).

``ListQueueBroker`` on ``TASKIQ_BROKER_URL`` (default ``REDIS_URL``), queue
``applika:tasks``, no result backend: a run's outcome is stored in
``job_sources.last_run_*``. The scheduler reads the ``schedule`` labels of
the tasks (``LabelScheduleSource``); exactly one scheduler runs.

Under ``ENVIRONMENT=TEST`` the broker is taskiq's ``InMemoryBroker`` with
``await_inplace``: a ``.kiq()`` runs the task at once, in the test's own
event loop, with no Redis.

Run locally (from ``backend/``)::

    uv run taskiq worker app.worker.broker:broker app.worker.tasks
    uv run taskiq scheduler app.worker.broker:scheduler app.worker.tasks
"""

from taskiq import AsyncBroker, InMemoryBroker, TaskiqScheduler
from taskiq.schedule_sources import LabelScheduleSource
from taskiq_redis import ListQueueBroker

from app.config.logging import logger
from app.config.settings import envs

QUEUE_NAME = 'applika:tasks'
# A Redis that does not answer must not hold an API request (an enqueue)
# for long, so connecting is bounded.
CONNECT_TIMEOUT_SECONDS = 2


def build_broker(url: str) -> ListQueueBroker:
    """``socket_timeout=None`` is required: redis-py 8 reads with a 5-second
    default timeout, and the worker's BRPOP blocks until a task arrives - with
    the default it dies every 5 seconds. An API enqueue is bounded by
    ``app/worker/queue.py`` instead."""
    return ListQueueBroker(
        url,
        queue_name=QUEUE_NAME,
        socket_connect_timeout=CONNECT_TIMEOUT_SECONDS,
        socket_timeout=None,
    )


broker: AsyncBroker = (
    InMemoryBroker(await_inplace=True)
    if envs.ENVIRONMENT == 'TEST'
    else build_broker(envs.taskiq_broker_url)
)

scheduler = TaskiqScheduler(
    broker=broker, sources=[LabelScheduleSource(broker)]
)


async def start_client() -> None:
    """The API's lifespan start: the API only produces tasks. A broker that
    cannot start (Redis down) logs a WARNING and never fails the boot
    (ADR-0016: runs pause, the API keeps serving)."""
    try:
        await broker.startup()
    except Exception:
        logger.warning(
            'Task broker unavailable at startup; background jobs pause',
            extra={'extra_data': {'event': 'task_broker_start_failed'}},
        )


async def stop_client() -> None:
    try:
        await broker.shutdown()
    except Exception:
        logger.warning(
            'Task broker did not shut down cleanly',
            extra={'extra_data': {'event': 'task_broker_stop_failed'}},
        )
