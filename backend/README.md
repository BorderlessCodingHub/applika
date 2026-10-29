# Applika.dev - Backend

FastAPI backend for Applika.dev, a job application tracker: applications and their timeline,
statistics and agenda, biweekly reports, master CVs and tailored CV copies with server-side PDF
export, a job board fed by a background worker, beta features, and the sign-in of the web app and
`applika-cli`. Built with Clean Architecture, async SQLAlchemy, PostgreSQL and Redis.

How the API fits with the rest of the stack (Traefik, the frontend, Postgres, Redis, the worker,
GitHub and Discord): [docs/infrastructure.md](../docs/infrastructure.md).

## Project Structure

```
backend/
├── alembic.ini
├── CHANGELOG.md              # Every backend change (Keep a Changelog)
├── Dockerfile                # API image (uvicorn only; migrations run by hand)
├── docker-compose.yml        # Older per-project stack (the root one supersedes it)
├── Makefile                  # format, lint, test
├── pyproject.toml / uv.lock
├── app/
│   ├── main.py               # FastAPI app, middleware, routers, broker lifespan
│   ├── application/
│   │   ├── dto/              # Data Transfer Objects
│   │   ├── services/         # GitHub, Discord (webhook + OAuth), session store, CV rendering,
│   │   │                     #   tailoring, keyword fit, job ingestion scrapers, job queue port
│   │   ├── use_cases/        # One class per business operation, grouped by feature
│   │   └── validators/
│   ├── config/               # settings, db, redis, logging, middleware, rate limiter
│   ├── core/                 # enums, exceptions, tokens, crypto, PKCE, features (beta keys)
│   ├── domain/
│   │   ├── models.py         # SQLAlchemy ORM models
│   │   └── repositories/     # Data access layer
│   ├── lib/                  # Snowflake ID type, URL utilities
│   ├── presentation/
│   │   ├── api/              # FastAPI routers (admin/ holds the admin routes)
│   │   ├── schemas/          # Request/response schemas
│   │   ├── dependencies.py   # DI factories, auth, require_feature
│   │   └── handlers.py       # Domain exception → HTTP mapping
│   ├── scripts/seed_e2e.py   # Seeds users and sessions for the E2E stack
│   └── worker/               # taskiq broker, scheduler and tasks (ADR-0016)
├── migrations/versions/      # Alembic revisions
├── scripts/seed_mock_data.py # Exercises the public API with realistic mock data
└── tests/
    ├── unit/
    ├── integration/          # testcontainers Postgres, migration round trips
    └── fixtures/             # job postings, CV diff contract
```

## Tech Stack

- **Python 3.14** with uv and taskipy
- **FastAPI** with async/await
- **SQLAlchemy 2** async with asyncpg, **PostgreSQL 16**
- **Alembic** for migrations
- **Pydantic 2** for validation and settings
- **Redis 7**: sessions, GitHub cache, rate limiter, the taskiq queue
- **taskiq** + taskiq-redis: background worker and scheduler
- **RenderCV + Typst**: CV PDF and Markdown rendering
- **httpx** for Borderless sign-in and the GitHub restore, **PyJWT** for access tokens
- **cryptography** (Fernet) for the stored Borderless access token
- **Snowflake IDs** for every primary key

## Environment Variables

Settings are read from the environment or a `.env` file (`app/config/settings.py`).

### Required

| Name | Description | Example |
|------|-------------|---------|
| `DATABASE_URL` | Async DB connection string | `postgresql+asyncpg://user:pass@host:5432/db` |
| `BORDERLESS_API_URL` | Borderless API (https in PROD); sign-in answers 503 until set | `https://<borderless host>` |
| `BORDERLESS_TOKEN_ENCRYPTION_KEY` | Fernet key for the stored Borderless access token | `<fernet key>` |

### Optional

| Name | Description | Default |
|------|-------------|---------|
| `ENVIRONMENT` | `PROD`, `DEV` or `TEST`. `PROD` hides `/api/docs` and makes cookies Secure | `DEV` |
| `API_PREFIX` | API route prefix | `/api` |
| `JWT_SECRET` | JWT signing secret | changeme placeholder |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `15` |
| `REFRESH_TOKEN_EXPIRE_DAYS` | A session ends this many days after its last refresh | `7` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379/0` |
| `GITHUB_REDIRECT_URI` | OAuth callback URL | `http://127.0.0.1:8000/api/auth/github/callback` |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app of the one-shot data restore; 503 until set | `None` |
| `WEB_SIGNIN_URI` | Web sign-in page every CLI browser sign-in lands on | `http://127.0.0.1:8080/login` |
| `BORDERLESS_TIMEOUT_SECONDS` / `BORDERLESS_REFRESH_TIMEOUT_SECONDS` | Borderless call timeouts (sign-in / refresh read) | `5.0` / `3.0` |
| `BORDERLESS_SIGNIN_EMAIL_LIMIT` / `BORDERLESS_SIGNIN_EMAIL_WINDOW_SECONDS` | Failed sign-ins per email before a 429, and the window | `5` / `900` |
| `LOGIN_REDIRECT_URI` | Post-login redirect | `http://127.0.0.1:8000/api/docs` |
| `DEVICE_CODE_TTL_SECONDS` | CLI device-code lifetime | `600` |
| `DEVICE_CODE_POLL_INTERVAL_SECONDS` | CLI device-code poll interval | `10` |
| `DEVICE_VERIFICATION_URI` | Web page that approves a device code | `http://127.0.0.1:8080/device` |
| `CLI_MANUAL_REDIRECT_URI` | Web page that shows a PKCE code to paste | `http://127.0.0.1:8080/cli/code` |
| `SESSION_HISTORY_DAYS` | Ended devices stay listed this long | `30` |
| `DISCORD_FEEDBACK_WEBHOOK` | Discord webhook that receives user feedback | `None` |
| `ACCOUNT_LINK_REDIRECT_URI` | Profile page the GitHub restore returns to | `http://127.0.0.1:8080/profile` |
| `ACCOUNT_LINK_STATE_TTL_SECONDS` | TTL of the account-link CSRF nonce | `600` |
| `CV_PDF_RENDER_TIMEOUT_SECONDS` | Ceiling for one CV PDF render | `30` |
| `RATE_LIMIT_ENABLED` | API rate limiter on/off | `True` |
| `RATE_LIMIT_DEFAULT` / `RATE_LIMIT_AUTH` | Requests per window, other routes / `/auth/*` | `120` / `10` |
| `RATE_LIMIT_WINDOW_SECONDS` | Fixed window width | `60` |
| `FORWARDED_ALLOW_IPS` | uvicorn's trusted proxies for `X-Forwarded-For` (Traefik's subnet in production) | `127.0.0.1` |
| `TASKIQ_BROKER_URL` | Redis of the task queue | `REDIS_URL` |
| `JOBS_*` | Job collection settings (`JOBS_INGEST_ENABLED`, `JOBS_INGEST_CRON`, `JOBS_SCRAPERS`, `JOBS_LOOKBACK_DAYS`, `JOBS_RETENTION_DAYS`, `JOBS_SCRAPER_TIMEOUT_SECONDS`, `JOBS_INGEST_LOCK_SECONDS`, `JOBS_FIXTURE_PATH`) | see the [root README](../README.md#background-worker-taskiq) |
| `CORS_ORIGINS` / `CORS_HEADERS` / `CORS_METHODS` | CORS configuration | see `settings.py` |
| `LOG_LEVEL` / `LOG_FORMAT` / `LOG_FILE` | Logging | `INFO`, see `settings.py`, `logs/app.log` |
| `DATABASE_ECHO` | SQLAlchemy echo flag | `False` |

Production values are stored as Docker secrets on the VPS: see [docs/readme.md](../docs/readme.md).

## How to Run

### With Docker (recommended)

The root `docker-compose.yml` runs the API with the frontend, the worker, Postgres and Redis. See
the [root README](../README.md#quick-start-docker-compose).

```bash
git clone https://github.com/ProgramadoresSemPatria/applika.git
cd applika
cp .env.example .env        # set BORDERLESS_API_URL, BORDERLESS_TOKEN_ENCRYPTION_KEY
docker compose up -d --build --wait
```

The compose `api` runs `alembic upgrade head` before uvicorn. The production image does not: there,
migrations are run by hand inside the container. API docs: `http://127.0.0.1:8000/api/docs`.

### Without Docker

**Prerequisites:** [uv](https://docs.astral.sh/uv/), PostgreSQL 16 and Redis 7 running locally.

```bash
uv sync                     # install dependencies (Python 3.14)
# create backend/.env with the required variables
uv run task auhead          # apply migrations
uv run task run             # dev server on port 8000, hot reload
```

For the job board, also run the worker and the scheduler:

```bash
uv run taskiq worker app.worker.broker:broker app.worker.tasks
uv run taskiq scheduler app.worker.broker:scheduler app.worker.tasks
```

### Seeding Mock Data

`scripts/seed_mock_data.py` drives the public API (the server must be running) to create realistic
applications, timelines (and the deprecated steps), master CVs, CV copies and their PDFs, drafts
and saved job searches. It asks for the `__access` cookie of a live browser session. Parts behind a beta feature are skipped, with
a message, when the seed user lacks that feature.

```bash
uv run task seed
```

## Authentication

GitHub OAuth is the only login ([ADR-0002](../docs/adr/0002-github-oauth-sole-login.md)).

1. `GET /api/auth/github/login` redirects to GitHub.
2. The callback opens a session and sets two HTTP-only cookies: `__access` (a short-lived JWT) and
   `__refresh` (an opaque value whose session lives in Redis).
3. `GET /api/auth/refresh` slides the session and re-issues the access cookie.
4. `GET /api/auth/logout` ends the session and clears both cookies.

The API reads `Authorization: Bearer` first, then the `__access` cookie. Each sign-in is its own
session (a device), listed in the web profile's Devices tab. `applika-cli` 1.1.0 signs in with
PKCE or a device code ([ADR-0019](../docs/adr/0019-device-sessions-and-cli-oauth.md)); the older
CLI routes keep working ([ADR-0009](../docs/adr/0009-cli-compatibility-layer.md)). When Redis is
down, signed-in routes answer 503 rather than signing anyone out.

GitHub and Discord tokens are stored **encrypted** (Fernet) and never exposed.

### Creating a GitHub OAuth App

1. Visit [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Set Authorization callback URL to `http://127.0.0.1:8000/api/auth/github/callback`
4. Copy Client ID and Client Secret to your `.env`

## Beta features

A new user-facing feature starts in beta
([ADR-0018](../docs/adr/0018-beta-features-registry-and-allowlist.md)): it needs a `FeatureKey`
member (`app/core/features.py`), a seed row in its release migration, and `require_feature` on its
routes. A user without the feature gets the same 404 as an unknown route. Today: `cvs` (master
CVs, CV copies, drafts) and `jobs` (job board, saved searches). Admins manage them at
`/api/admin/features`.

## API Endpoints

All routes live under `/api`. Everything except the sign-in routes needs a session.

| Area | Routes |
|------|--------|
| Sign-in | `/auth/github/*`, `/auth/refresh`, `/auth/logout`; CLI: `/auth/cli/authorize`, `/auth/token`, `/auth/revoke`, `/auth/device/*`, and the deprecated `/auth/cli/start`, `/auth/cli/login/{id}`, `/auth/cli/exchange` |
| Account links | `POST`/`DELETE /auth/link/discord`, `GET /auth/link/discord/callback` |
| Users | `GET`/`PATCH`/`DELETE /users/me`, `GET /users/me/agenda`, `GET /users/me/features` |
| Devices | `GET /users/me/sessions`, `DELETE /users/me/sessions/{id}`, `POST /users/me/sessions/revoke-others` |
| Applications | `GET`/`POST /applications`, `PUT`/`DELETE /applications/{id}`, `POST /applications/{id}/finalize`, `POST /applications/{id}/reopen` |
| Timeline | `GET`/`POST /applications/{id}/timeline`, `PUT`/`DELETE /applications/{id}/timeline/{event_id}` |
| Steps (deprecated) | `/applications/{id}/steps*`, kept for installed CLIs |
| Statistics | `/applications/statistics`, `/statistics/steps/conversion_rate`, `/statistics/steps/avarage_days`, `/statistics/platforms`, `/statistics/mode`, `/statistics/trends` |
| Cycles | `GET`/`POST /cycles`, `DELETE /cycles/{id}` |
| Companies, platforms | `GET`/`POST /companies`, `GET`/`POST /platforms`, `GET /supports` |
| Biweekly reports | `GET /reports`, `GET /reports/{day}`, `POST /reports/{day}/submit` |
| Feedback | `POST /feedbacks` |
| Master CVs (`cvs`) | `/base-cvs*`, including PDF and Markdown exports |
| CV copies (`cvs`) | `/applications/{id}/cv*`, including PDF, Markdown, diff and fit |
| Drafts (`cvs`) | `/applications/drafts*`, `POST /applications/drafts/{id}/finish` |
| Jobs (`jobs`) | `GET /jobs`, `GET /jobs/{id}`, `PUT`/`DELETE /jobs/{id}/dismissal`, `/job-searches*` |
| Admin | `/admin/stats*`, `/admin/users*`, `/admin/companies*`, `/admin/platforms*`, `/admin/discord-webhooks*`, `/admin/jobs/*`, `/admin/features*` |

The full contract is the OpenAPI document at `/api/docs` (outside `PROD`). Routes that installed
`applika-cli` versions call are never broken: an old payload is translated in a compatibility
layer and the route is marked deprecated.

## Development Tasks

```bash
make format                 # ruff format
make lint                   # ruff check --fix
make test                   # pytest (testcontainers Postgres; Docker must be running)
uv run task run             # dev server (port 8000, hot reload)
uv run task autorevision    # generate an Alembic revision
uv run task auhead          # apply migrations
uv run task adbase          # roll back every migration
uv run task seed            # seed mock data through the API
```

Migrations follow [ADR-0005](../docs/adr/0005-non-destructive-migrations.md): an upgrade never drops
a column or a table (retired ones are renamed `_old`), every revision has a working downgrade, and
each new revision gets an upgrade/downgrade/upgrade test under `tests/integration/`.

Every backend change is recorded in [CHANGELOG.md](CHANGELOG.md); one that changes what the CLI
sends or receives also goes in [cli/CHANGELOG.md](../cli/CHANGELOG.md).

---

More detail on each area lives in [`CLAUDE.md`](CLAUDE.md).
