# Applika.dev

Applika.dev is a full-stack application designed to manage applications and user statistics. It consists of a backend (Python/FastAPI) and a frontend (Next.js/React), organized in separate folders for modular development.

## Project Structure

```
root/
├── backend/      # Python FastAPI backend
├── cli/          # Python CLI package for the applika command
├── frontend/     # Next.js React frontend
├── legacy/       # Legacy code
├── CONTRIBUTORS.md
└── README.md
```

## Prerequisites

- Docker & Docker Compose (recommended for local development)
- Python 3.9+ (for backend, if running without Docker)
- Node.js 20+ and pnpm (for frontend, if running without Docker)
- [uv](https://docs.astral.sh/uv/) (for backend and CLI Python environments)

## CLI

Install the published CLI from PyPI. The package page has the current install
and usage docs:

- [applika-cli on PyPI](https://pypi.org/project/applika-cli/)

```bash
uv tool install applika-cli
# or
pipx install applika-cli
```

This installs the global `applika` command:

```bash
applika --help
applika --version
applika version
```

For local CLI development from this repository:

```bash
cd cli
uv sync
uv run applika --help
```

If you want the global `applika` command to point at your local checkout while
you develop, install it in editable mode:

```bash
cd cli
uv tool install --force --editable .
```

Useful commands:

```bash
cd cli
make test    # Run CLI tests
make format  # Format CLI code
make lint    # Lint CLI code
```

CLI commands:

```bash
applika login
applika logout
applika applications list
applika applications new \
  --company "Acme" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-08
applika applications edit 123 --role "Senior Backend Engineer"
applika applications -n \
  --company "Acme" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-08
applika applications steps list 123
applika applications steps add 123 \
  --step "Initial Screen" \
  --date 2026-05-11
applika applications finalize 123 \
  --step "Offer" \
  --feedback "Accepted" \
  --date 2026-05-18 \
  --salary-offer 180000
```

## Quick Start (Docker Compose)

One command brings up the whole app — api, static frontend, the taskiq worker
and scheduler, Postgres and Redis — wired the way production serves it. The schema is applied by the real Alembic
chain on every api start.

1. **Configure the environment.**

   ```bash
   cp .env.example .env
   ```

   `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` are required settings with no
   defaults — the api will not boot without them. Create a GitHub OAuth app at
   <https://github.com/settings/developers> with:

   | Field | Value |
   |---|---|
   | Homepage URL | `http://127.0.0.1:8080` |
   | Authorization callback URL | `http://127.0.0.1:8000/api/auth/github/callback` |

   `GITHUB_TOKEN_ENCRYPTION_KEY` must be a valid Fernet key:

   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

2. **Start everything.**

   ```bash
   docker compose up -d --build --wait
   ```

   | | |
   |---|---|
   | Frontend | <http://127.0.0.1:8080> |
   | API docs | <http://127.0.0.1:8000/api/docs> |

3. **Stop it.**

   ```bash
   docker compose down        # keeps the database
   docker compose down -v     # drops the database too
   ```

### Background worker (taskiq)

Job collection (Himalayas and RemoteOK) and the CV fit recompute do not run in
the api. They run in a [taskiq](https://taskiq-python.github.io/) worker that
reads its tasks from a Redis queue (ADR-0016). Two processes, both built from
the backend image with the api's environment:

| Service | Command | Role |
|---|---|---|
| `worker` | `taskiq worker app.worker.broker:broker app.worker.tasks` | Runs the queued tasks: job collection, fit recompute. |
| `scheduler` | `taskiq scheduler app.worker.broker:scheduler app.worker.tasks` | Enqueues job collection on `JOBS_INGEST_CRON` (hourly, UTC). Run **exactly one**. |

`docker compose up` starts both once the api is healthy, so the migration has
already run; they never run Alembic themselves. Without them the app still
works, but `/jobs` stays empty and Admin → Jobs → Run now has nothing to pick
the run up.

```bash
docker compose logs -f worker scheduler
```

To run them on the host instead (Postgres and Redis up, `DATABASE_URL` and
`REDIS_URL` set as for the api):

```bash
cd backend
uv run taskiq worker app.worker.broker:broker app.worker.tasks
uv run taskiq scheduler app.worker.broker:scheduler app.worker.tasks
```

To collect right away instead of waiting for the next hour, sign in as an admin
and use **Admin → Jobs → Run now**.

Settings (all optional, shared with the api):

| Variable | Default | Meaning |
|---|---|---|
| `TASKIQ_BROKER_URL` | `REDIS_URL` | Redis the queue lives on. |
| `JOBS_INGEST_ENABLED` | `true` | `false` makes every collection run a no-op. |
| `JOBS_INGEST_CRON` | `0 * * * *` | Collection schedule, UTC. |
| `JOBS_SCRAPERS` | `himalayas,remoteok` | Sources to collect from. `fixture` reads `JOBS_FIXTURE_PATH` instead of the live sites (tests and E2E; refused when `ENVIRONMENT=PROD`). |
| `JOBS_LOOKBACK_DAYS` | `7` | Postings published this many days back are collected. |
| `JOBS_RETENTION_DAYS` | `15` | A posting leaves the list this many days after publication. |
| `JOBS_SCRAPER_TIMEOUT_SECONDS` | `30` | Timeout per request to a job board. |
| `JOBS_INGEST_LOCK_SECONDS` | `900` | Run lock TTL, so two runs never overlap. |

### Iterating on the frontend

The Next.js build is a **static export** and `NEXT_PUBLIC_API_BASE_URL` is baked
in at build time, so a source change only appears after
`docker compose up -d --build web`. For a fast UI loop, run the infrastructure in
Docker and the frontend on the host:

```bash
docker compose up -d --wait api worker scheduler   # api, worker, scheduler, db and redis
cd frontend && pnpm install && pnpm dev   # http://127.0.0.1:3000
```

Point the dev server at the api with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api`
in `frontend/.env.local`, and add `http://127.0.0.1:3000` to `CORS_ORIGINS` for the
`api` service.

### Signing in without a GitHub OAuth app

GitHub is the sole login (ADR 0002), so the UI cannot sign you in without a real
OAuth app. To poke at a signed-in session anyway, mint one directly:

```bash
docker compose exec api python -m app.scripts.seed_e2e
```

It prints `__access` and `__refresh` cookies — set them for host `127.0.0.1` in
DevTools. It refuses to run when `ENVIRONMENT=PROD`.

### The other compose files

| File | Purpose |
|---|---|
| `docker-compose.yml` | This stack. Local development, persistent volumes. |
| `docker-compose.e2e.yml` | Ephemeral E2E stack (`scripts/e2e.sh`). No volumes, empty DB every run. |
| `backend/docker-compose.yml`, `frontend/docker-compose.yml` | Older per-project stacks, superseded by the root file. Their volumes live under different project names, so their databases are separate. |
