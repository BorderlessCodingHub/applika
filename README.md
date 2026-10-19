# Applika.dev

Applika.dev is a job application tracker for active job seekers: track every application and its
timeline (interviews, offers, denials), see your statistics and agenda, write master CVs and
tailored CV copies, and file biweekly reports. It has three parts, each in its own folder:

| Part | Stack | README |
|---|---|---|
| `backend/` | Python 3.14, FastAPI, SQLAlchemy 2 async, Alembic, PostgreSQL 16, Redis, taskiq | [backend/README.md](backend/README.md) |
| `frontend/` | Next.js 16 static export, React 19, Tailwind 4, shadcn/ui, TanStack Query | [frontend/README.md](frontend/README.md) |
| `cli/` | Python 3.10+, Typer, httpx, published on PyPI as `applika-cli` | [cli/README.md](cli/README.md) |

## Documentation

| Document | What it covers |
|---|---|
| [docs/readme.md](docs/readme.md) | Where each part of the production infrastructure lives, who owns each account, what must be transferred |
| [docs/infrastructure.md](docs/infrastructure.md) | How the parts connect, with diagrams: request flow, auth, deploy, secrets, the beta modules on `develop` |
| [docs/prd/](docs/prd/) | Product requirements; [0000](docs/prd/0000-product-vision.md) is the product vision |
| [docs/adr/](docs/adr/) | Architecture decisions |
| [docs/plan/](docs/plan/) | Technical plans per feature |
| [backend/CHANGELOG.md](backend/CHANGELOG.md), [cli/CHANGELOG.md](cli/CHANGELOG.md) | What changed, release by release |

## Project Structure

```
root/
├── .github/workflows/      # CI (backend, frontend + e2e, cli) and CD (images, PyPI)
├── backend/                # FastAPI API and the taskiq background worker
├── cli/                    # applika-cli, the `applika` command
├── docs/                   # PRDs, ADRs, plans, infrastructure
├── frontend/               # Next.js web app (static export served by nginx)
├── legacy/                 # Legacy code
├── docker-compose.yml      # Local development stack (the whole app)
├── docker-compose.e2e.yml  # Ephemeral E2E stack
├── .env.example            # Settings for docker-compose.yml
├── CONTRIBUTORS.md
├── SECURITY.md
└── README.md
```

## How it runs in production

```
Browser / applika-cli ──► https://applika.dev ──► Traefik ──┬─ /api ──► api (FastAPI) ──► PostgreSQL, Redis
                                                            └─ /*   ──► web (nginx, static export)
```

Both images run on a Docker Swarm stack on a VPS. A merge to `main` builds and publishes them to
Docker Hub; the containers are then upgraded on the VPS, and migrations are run by hand
(`alembic upgrade head` in the API container). Details, owners and the parts still on `develop`:
[docs/infrastructure.md](docs/infrastructure.md).

Branches: work goes to `develop`; `develop` → `main` is a release.

## Prerequisites

- Docker & Docker Compose (recommended for local development)
- [uv](https://docs.astral.sh/uv/) for the backend and the CLI
- Python 3.14 for the backend, 3.10+ for the CLI (uv installs them for you)
- Node.js 22 and pnpm 10 for the frontend

## CLI

Install the published CLI from PyPI ([applika-cli on PyPI](https://pypi.org/project/applika-cli/)):

```bash
uv tool install applika-cli
# or
pipx install applika-cli
```

This installs the global `applika` command:

```bash
applika login                     # GitHub sign-in in the browser (--device without one)
applika whoami
applika applications list
applika applications new \
  --company "Acme" \
  --role "Backend Engineer" \
  --platform "LinkedIn" \
  --mode active \
  --date 2026-05-08
applika applications timeline add 123 \
  --type interview --interview-type technical --date 2026-05-11
applika applications finalize 123 --outcome offer \
  --salary 180000 --currency USD --period annually --date 2026-05-18
applika cvs list
applika update                    # install the latest version now
```

Every command, flag and exit code: [cli/README.md](cli/README.md).

For local CLI development from this repository:

```bash
cd cli
uv sync
uv run applika --help
uv tool install --force --editable .   # point the global `applika` at this checkout
make test && make lint && make format
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

### Beta features

New user-facing features start in **beta** ([ADR-0018](docs/adr/0018-beta-features-registry-and-allowlist.md)):
only users on a feature's beta list see it, and admins see it unless they opt out. Today there are
two: `cvs` (the CV builder, CV copies and drafts) and `jobs` (the job board, which needs the worker
below). On a fresh database, make your user an admin, or add it to the list at **Admin → Features**,
to see them. Releasing a feature to everyone is an admin action on the same screen, never a deploy.

### Background worker (taskiq)

Job collection (Himalayas and RemoteOK) and the CV fit recompute do not run in
the api. They run in a [taskiq](https://taskiq-python.github.io/) worker that
reads its tasks from a Redis queue ([ADR-0016](docs/adr/0016-taskiq-worker-for-background-jobs.md)).
The worker exists for the `jobs` feature. Two processes, both built from the backend image with the
api's environment:

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
cd frontend && pnpm install && pnpm dev            # http://127.0.0.1:8080
```

Point the dev server at the api with `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000/api`
in `frontend/.env.local`. `pnpm dev` serves on port 8080, the origin the compose `api` already
allows in `CORS_ORIGINS`, so leave the `web` service down while it runs.

### Signing in without a GitHub OAuth app

GitHub is the sole login ([ADR-0002](docs/adr/0002-github-oauth-sole-login.md)), so the UI cannot
sign you in without a real OAuth app. To poke at a signed-in session anyway, mint one directly:

```bash
docker compose exec api python -m app.scripts.seed_e2e
```

It prints `__access` and `__refresh` cookies — set them for host `127.0.0.1` in
DevTools. It refuses to run when `ENVIRONMENT=PROD`.

### The other compose files

| File | Purpose |
|---|---|
| `docker-compose.yml` | This stack. Local development, persistent volumes. |
| `docker-compose.e2e.yml` | Ephemeral E2E stack (`frontend/scripts/e2e.sh`). No volumes, empty DB every run. |
| `backend/docker-compose.yml`, `frontend/docker-compose.yml` | Older per-project stacks, superseded by the root file. Their volumes live under different project names, so their databases are separate. |

## Quality gates

A change to `develop` is ready when every gate of the parts it touches is green:

```bash
cd backend  && make format && make lint && make test
cd frontend && pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm build
cd frontend && ./scripts/e2e.sh          # Playwright against the real stack
cd cli      && make format && make lint && make test
```

Database changes follow [ADR-0005](docs/adr/0005-non-destructive-migrations.md): an upgrade never
drops a column or a table, and every revision has a working downgrade.
