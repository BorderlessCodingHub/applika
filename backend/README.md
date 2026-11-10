# Applika.dev — Backend

The API behind the web app and `applika-cli`, plus a background worker that
collects job postings. FastAPI, async SQLAlchemy, PostgreSQL and Redis, laid
out in Clean Architecture layers.

How it fits with the rest of production: [docs/infrastructure.md](../docs/infrastructure.md).

## Run it

The easiest way is the whole stack from the repository root — see the
[root README](../README.md#run-it-locally). The API is then at
<http://127.0.0.1:8000/api/docs>.

On your machine instead (needs [uv](https://docs.astral.sh/uv/), PostgreSQL 16
and Redis 7):

```bash
uv sync                  # Python 3.14 and the dependencies
# create backend/.env with DATABASE_URL, REDIS_URL and the BORDERLESS_* values
uv run task auhead       # apply the migrations
uv run task run          # http://127.0.0.1:8000, reloads on change
```

The job board also needs the worker and its scheduler (run exactly one scheduler):

```bash
uv run taskiq worker app.worker.broker:broker app.worker.tasks
uv run taskiq scheduler app.worker.broker:scheduler app.worker.tasks
```

## Commands

```bash
make format                # ruff format
make lint                  # ruff check --fix
make test                  # pytest; Docker must be running (testcontainers Postgres)
uv run task autorevision   # new Alembic revision from the models
uv run task auhead         # apply migrations
uv run task adbase         # roll every migration back
uv run task seed           # fill a running API with realistic mock data
```

Migrations never drop a column or a table — retired ones are renamed `_old` —
and every revision has a working downgrade
([ADR-0005](../docs/adr/0005-non-destructive-migrations.md)).

## Sign-in

Users sign in with their [Borderless](https://borderlesscoding.com) account
through OpenID Connect ([ADR-0026](../docs/adr/0026-borderless-openid-connect-sign-in.md)).
The web gets two HTTP-only cookies (`__access`, `__refresh`); the CLI gets the
same tokens and sends `Authorization: Bearer`. Every sign-in is a device the
user can see and revoke. A user's BASE or PSP membership at Borderless becomes
a badge that unlocks the biweekly reports.

For local runs, `make run-fake-auth` at the repository root starts a fake
Borderless and prints the settings to use.

## Settings

Read from the environment or a `.env` file (`app/config/settings.py`).

**Required**

| Name | What it is |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://user:pass@host:5432/db` |
| `BORDERLESS_ISSUER`, `BORDERLESS_CLIENT_ID`, `BORDERLESS_CLIENT_SECRET` | applika's client at Borderless. Sign-in fails with `AUTH-1018` until they are set |
| `BORDERLESS_TOKEN_ENCRYPTION_KEY` | A Fernet key; encrypts the stored Borderless tokens |

**Public URLs** — change them together when the web or the API moves

| Name | Default |
|---|---|
| `CORS_ORIGINS` | the local web, `http://127.0.0.1:8080` |
| `WEB_SIGNIN_URI` — the web sign-in page every sign-in ends on | `http://127.0.0.1:8080/login` |
| `BORDERLESS_REDIRECT_URI` — must match what is registered at Borderless | `http://127.0.0.1:8000/api/auth/borderless/callback` |
| `DEVICE_VERIFICATION_URI` — shown by `applika login --device` | `http://127.0.0.1:8080/device` |
| `CLI_MANUAL_REDIRECT_URI` — shown by `applika login --manual` | `http://127.0.0.1:8080/cli/code` |
| `ACCOUNT_LINK_REDIRECT_URI` — where the GitHub data restore returns | `http://127.0.0.1:8080/profile` |

**Common optional settings**

| Name | Default | |
|---|---|---|
| `ENVIRONMENT` | `DEV` | `PROD` hides `/api/docs` and makes cookies Secure |
| `REDIS_URL` | `redis://localhost:6379/0` | Sessions, rate limiter, task queue |
| `JWT_SECRET` | a placeholder | Set a long random value outside development |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | A session ends this long after its last use |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | unset | Only for the one-time "restore data from GitHub" |
| `DISCORD_FEEDBACK_WEBHOOK` | unset | Where in-app feedback is posted |
| `RATE_LIMIT_ENABLED`, `RATE_LIMIT_DEFAULT`, `RATE_LIMIT_AUTH` | `True`, `120`, `10` | Requests per minute |
| `FORWARDED_ALLOW_IPS` | `127.0.0.1` | The trusted proxy (Traefik in production) |
| `JOBS_INGEST_CRON` | `0 * * * *` | When the worker collects job postings (UTC) |
| `JOBS_SCRAPERS` | `himalayas,remoteok` | Where it collects them from |

Every other setting, with its default, is in `app/config/settings.py`.

## What the API offers

Everything lives under `/api`; the OpenAPI document is at `/api/docs`
(outside `PROD`).

| Area | Routes |
|---|---|
| Sign-in | `/auth/borderless/*`, `/auth/refresh`, `/auth/logout`; for the CLI `/auth/cli/authorize`, `/auth/token`, `/auth/revoke`, `/auth/device/*` |
| Account | `/users/me`, `/users/me/agenda`, `/users/me/features`, `/users/me/sessions` (devices) |
| Applications | `/applications`, their `/timeline`, `/finalize`, `/reopen`, `/applications/statistics*` |
| Cycles, companies, platforms | `/cycles`, `/companies`, `/platforms`, `/supports` |
| Reports | `/reports` — for Borderless BASE and PSP members |
| CVs (beta `cvs`) | `/base-cvs`, `/applications/{id}/cv`, `/applications/drafts` |
| Job board (beta `jobs`) | `/jobs`, `/job-searches` |
| Admin | `/admin/*` — users, statistics, companies, platforms, report webhooks, job sources, features |

Routes that published CLI versions call are never broken: an old payload is
translated in a compatibility layer and the route is marked deprecated.

## Beta features

A new user-facing feature starts in beta
([ADR-0018](../docs/adr/0018-beta-features-registry-and-allowlist.md)): only
users on its list (and admins) get it, and everyone else gets the same 404 as
an unknown route. To add one: a `FeatureKey` in `app/core/features.py`, a seed
row in its migration, and `require_feature` on its routes.

## Layout

```
app/
├── presentation/   # FastAPI routers, request/response schemas, dependencies
├── application/    # use cases (one class per operation), DTOs, services
├── domain/         # SQLAlchemy models and repositories
├── worker/         # taskiq broker, scheduler and tasks
├── config/         # settings, database, Redis, logging, middleware
└── core/           # enums, exceptions, error codes, tokens
migrations/         # Alembic revisions
tests/              # unit/ and integration/ (real Postgres in a container)
```

Every change is recorded in [CHANGELOG.md](CHANGELOG.md). More detail on each
area: [AGENTS.md](AGENTS.md).
