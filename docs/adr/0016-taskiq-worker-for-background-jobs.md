# ADR-0016: A taskiq worker and scheduler on Redis for background jobs

**Status:** Accepted (LuisMSoares, 2026-10-11) · **Date:** 2026-10-11 · **Deciders:** LuisMSoares

## Context

PRD 0012 collects remote job postings from Himalayas and RemoteOK every hour. Applika has no background
runtime: the API image runs uvicorn only (`backend/Dockerfile`), and nothing is scheduled. Ían
Muliterno's `job_scrapping` branch (head `e670914`) ran an asyncio loop inside the API process at 03:00 UTC.
That loop ran in every replica and on every boot, and its background tasks reused the request's database
session. The owner: "separate service, taskiq worker using redis as broker scheduled to run hourly". On
Himalayas' Cloudflare check: "Keep cloudscraper". Redis already exists (ADR-0002, ADR-0015). The deploy is a
Docker Swarm stack. CD deploys the images; migrations stay manual (ADR-0010,
`.claude/rules/prod-release-runbook.md`).

## Decision

- New direct dependencies, pinned in `backend/pyproject.toml`: `taskiq`, `taskiq-redis`, `httpx`
  (transitive only today) and `cloudscraper`.
- Broker: `taskiq_redis.ListQueueBroker` on `TASKIQ_BROKER_URL` (default `REDIS_URL`), with queue name
  `applika:tasks`. There is no result backend. The outcome of each run is stored in the database
  (`job_sources.last_run_*`).
- Code: `backend/app/worker/` is a delivery layer next to `app/presentation/`, which extends ADR-0001.
  `broker.py` holds the broker and the scheduler. `tasks.py` holds thin task functions that call use cases.
  Use cases stay transport-agnostic and enqueue through a `JobQueue` port
  (`app/application/services/job_queue.py`), which `app/worker/queue.py` binds to taskiq.
- Two new swarm services run the API image (`api-latest`) with a different command. There is no new image.
  - `worker`: `taskiq worker app.worker.broker:broker app.worker.tasks`, with one or more replicas.
  - `scheduler`: `taskiq scheduler app.worker.broker:scheduler app.worker.tasks`, with exactly one replica.
- Schedule: `ingest_jobs` runs on cron `JOBS_INGEST_CRON` (default `0 * * * *`, UTC).
  `JOBS_INGEST_ENABLED=false` makes every run a no-op.
- One run at a time: the task takes the Redis lock `applika:jobs:ingest:lock` (`SET NX EX`,
  `JOBS_INGEST_LOCK_SECONDS`, default 900) and skips the run when the lock is held. A second scheduler or a
  manual run therefore never overlaps a scheduled run.
- Each task opens its own session from `AsyncLocalSession` (`app/config/db.py`) and never shares a request's
  session.
- Each source request has a timeout (`JOBS_SCRAPER_TIMEOUT_SECONDS`, default 30). When a source fails or is
  blocked, the failure is recorded for that source and the other source still runs.
- The API only produces tasks. `app/main.py` gets a lifespan that starts and stops the broker client.
  Enqueueing a fit recompute after a master CV save is best-effort: a failure logs a WARNING, and the hourly run
  recomputes stale scores. The admin "run now" route answers 503 when the broker is unreachable.
- The worker and the scheduler never run Alembic; the ADR-0010 non-goal stands. Worker code ships only in a
  release after the owner confirms that `alembic upgrade head` ran (expand first).
- CD: `.github/workflows/backend-cd.yaml` also updates the services named by
  `vars.SWARM_WORKER_SERVICE_NAME` and `vars.SWARM_SCHEDULER_SERVICE_NAME` to the same image. Each update is
  guarded by `docker service inspect`, so a stack without these services still deploys.
- The dev and e2e compose files run the same two services. Unit and integration tests use taskiq's
  `InMemoryBroker`.

## Consequences

- The swarm stack grows from two services to four. Before the deploy that ships worker code, the owner adds
  `worker` and `scheduler` to the stack file with the API's environment.
- Redis now also carries a queue. If Redis is down, runs and recompute requests pause, but the API keeps
  serving.
- The VPS runs two more Python processes from the API image.
- Himalayas is fetched through `cloudscraper`, which passes Cloudflare's browser check. The owner accepts the
  terms-of-service risk. If Himalayas blocks the request, the admin screen shows the source as `blocked` and
  RemoteOK keeps running.
- This amends ADR-0010's Decision by adding the two services. "Two images" stays true.
- Rollback: point the API service back to the previous tag, and scale `worker` and `scheduler` to 0 when the
  previous release has no worker code.

## Non-goals

- Running migrations in a worker, in CD or on container start.
- A result backend, retries with backoff, or a task dashboard.
- Moving other work (reports, Discord posts, PDF renders) to the worker. Each move needs its own decision.
- Notifications of any kind (PRD 0012 non-goal).
