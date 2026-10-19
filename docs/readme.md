# Applika.dev infrastructure

> How the parts connect, with diagrams and the beta modules: see
> [infrastructure.md](infrastructure.md).

Where each part of Applika's production infrastructure lives, who owns each account and what must
move to the BorderlessCodingHub.

> **This document holds no password, token or key.** It only says where each secret is stored and
> who can reach it.

Legend:

- **to transfer**: an account in Brunno's or Luis's personal name that must move to Borderless.
- **to confirm with Brunno**: Luis does not have this information; Brunno manages it.

Gathered on 2026-10-19 from the repository (`.github/workflows/`, `backend/app/config/settings.py`,
`docker-compose.yml`, `cli/pyproject.toml`, [`docs/adr/0010-deploy-shape.md`](adr/0010-deploy-shape.md)).

---

## 1. Repository

| Item | Status |
|---|---|
| Main repository | `github.com/ProgramadoresSemPatria/applika` (ProgramadoresSemPatria org). **to transfer** |
| Working fork | `github.com/luis0ares/applika`, Luis's personal fork used for development. Not the production repository |
| URL declared in the CLI package | `github.com/ApplikaDev/applika` (`cli/pyproject.toml`, `[project.urls]`) |
| Destination | A repository on BorderlessCodingHub, with full history and Borderless as owner |
| Branches | `develop` (integration) and `main` (release; a push to `main` triggers the deploy) |
| Old repository | Archive `ProgramadoresSemPatria/applika`, or leave a notice in its README pointing to the new one |

When transferring: GitHub Secrets do **not** come along if the repository is re-created (they only
come with a GitHub repository transfer). Re-create the ones in section 3.1 in the new repository, and
the `pypi` environment.

## 2. Database

| Item | Status |
|---|---|
| Engine | PostgreSQL |
| Management | Managed by **Brunno**. Luis has no access to the database or its provider. The API connects through `DATABASE_URL` (Docker secret, section 3.2) |
| Provider / region / instance name | **to confirm with Brunno** |
| Owning account | **Brunno** (personal). **to transfer** |
| Access | Brunno only; the API, through `DATABASE_URL` |
| Migrations | Manual: `alembic upgrade head` inside the API container, then restart ([ADR-0010](adr/0010-deploy-shape.md), [ADR-0005](adr/0005-non-destructive-migrations.md)) |
| Backup | **to confirm with Brunno** (provider backups: frequency, retention, how to restore). The repository has no backup routine |
| Schema rollback | `alembic downgrade <previous_revision>` inside the container, point the stack back to the previous image tag, restart |

## 3. Secrets and variables

There is no Vault, Doppler or Vercel. Secrets live in two places:

### 3.1 GitHub Secrets (Settings → Secrets and variables → Actions of the main repository)

Three secrets. Access: admins of `ProgramadoresSemPatria/applika`. **to transfer** with the repository.

| Name | Purpose | Used in |
|---|---|---|
| `DOCKER_HUB_USER` | Docker Hub user that publishes the images (Luis's personal account) | `backend-cd.yaml`, `frontend-cd.yaml` |
| `DOCKER_HUB_TOKEN` | Docker Hub access token (Luis's personal account) | `backend-cd.yaml`, `frontend-cd.yaml` |
| `PYPI_TOKEN` | publish `applika-cli` to PyPI (environment `pypi`) | `cli-cd.yaml` |

### 3.2 Runtime environment variables (on the VPS, in the swarm stack definition)

Stored as **Docker Swarm secrets** on the VPS (Hostinger, Luis's account). Access: whoever has SSH to
the VPS, today Luis. To list them without reading values: `docker secret ls`.

| Variable | What it is |
|---|---|
| `DATABASE_URL` | Postgres connection |
| `REDIS_URL` | Redis connection |
| `JWT_SECRET` | signs the session JWTs |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI` | GitHub OAuth (login) |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Fernet key for the stored GitHub tokens |
| `DISCORD_FEEDBACK_WEBHOOK` | Discord webhook that receives feedback (feedback only, not reports) |
| `CORS_ORIGINS`, `LOGIN_REDIRECT_URI` | public URLs |
| `ENVIRONMENT=PROD` | configuration |

## 4. Hosting and deploy

| Item | Status |
|---|---|
| Hosting | **Hostinger** VPS with Docker Swarm |
| VPS owner | **Luis** (personal). **to transfer** |
| Access | Luis only (Hostinger panel and SSH) |
| Swarm services | API (uvicorn), frontend (nginx with the static export), Redis (refresh-token state and GitHub cache), Traefik in front. Postgres lives outside, with Brunno (section 2) |
| Image registry | Docker Hub, Luis's personal account (secret `DOCKER_HUB_USER`). Tags `api-latest` and `latest`. **to transfer** |
| Pipeline | 1. Push to `main` → GitHub Actions (`backend-cd.yaml`, `frontend-cd.yaml`) builds and publishes the images to Luis's Docker Hub. 2. The containers are upgraded by accessing Luis's VPS over SSH (`docker service update`) |
| Migrations | Outside the pipeline, manual (section 2) |
| CI | `backend-ci.yaml`, `frontend-ci.yaml` (includes e2e against the real stack), `cli-ci.yaml` |

## 5. Domain

| Item | Status |
|---|---|
| Domain | `applika.dev` (site) and `applika.dev/api` (API, the CLI's default) |
| Registrar | **Hostinger** |
| Registration owner | **Luis** (personal). **to transfer** |
| DNS | **Hostinger** (same account as the registration) |
| TLS | Let's Encrypt, issued and renewed by the swarm's Traefik. The certificate is signed with **Luis's personal e-mail**; when migrating, change the e-mail in the Traefik configuration |

## 6. Third-party services

| Service | Use | Provider | Owning account |
|---|---|---|---|
| Auth (login) | Only login for the web and the CLI ([ADR-0002](adr/0002-github-oauth-sole-login.md)) | GitHub OAuth App | **Luis** (personal). **to transfer** to the Borderless org |
| Feedback | Feedback (`POST /api/feedbacks`) is sent to Discord by the `DISCORD_FEEDBACK_WEBHOOK` webhook (none received so far). Reports do not use this webhook (section 8) | Discord | **Brunno** (personal). **to transfer** |
| CV PDF | RenderCV + Typst inside the container | local | no account |
| E-mail | None: the product sends no e-mail | — | — |
| Analytics | None: the cookie policy states there are no analytics cookies | — | — |
| AI APIs | None: fit score and tailoring are computed in the backend, without an LLM | — | — |

## 7. CLI

| Item | Status |
|---|---|
| Package | `applika-cli` on **PyPI** (not npm): `pypi.org/project/applika-cli` |
| Publishing | `cli-cd.yaml` with `uv publish`, token `PYPI_TOKEN` in environment `pypi` |
| Authors in the package | Luis Eduardo Soares, David Alecrim (`cli/pyproject.toml`) |
| PyPI owner | **Luis** (personal). **to transfer**: create a Borderless organisation or account on PyPI and add it as owner |
| Recommendation | Replace the token with PyPI Trusted Publishing pointing at the new repository |

## 8. In development (not in production yet)

Parts that already exist in the code but **do not run in production** today. They join the
infrastructure when they go to production.

| Item | What it is | Infrastructure it will need |
|---|---|---|
| New Redis uses | Redis already runs in production (refresh token and GitHub cache). In development: the rate limiter ([ADR-0015](adr/0015-redis-api-rate-limiter.md)), the taskiq queue ([ADR-0016](adr/0016-taskiq-worker-for-background-jobs.md)) and CLI 1.1.0 device sessions ([ADR-0019](adr/0019-device-sessions-and-cli-oauth.md)) | The same swarm Redis; env `TASKIQ_BROKER_URL` only if the queue uses another Redis; env `DEVICE_VERIFICATION_URI` and `CLI_MANUAL_REDIRECT_URI` for the CLI 1.1.0 sign-in |
| taskiq worker and scheduler | Background jobs with the same image as the API ([ADR-0016](adr/0016-taskiq-worker-for-background-jobs.md)). Depend on Redis | Swarm services; the workflows already look for `SWARM_WORKER_SERVICE_NAME` and `SWARM_SCHEDULER_SERVICE_NAME` |
| Job collection (job board) | Hourly collection by the worker. Depends on the worker | Public APIs Himalayas and RemoteOK, no account; env `JOBS_*` |
| Rate limiter | Per-user/IP limit on the API. Depends on Redis | env `RATE_LIMIT_*` and `FORWARDED_ALLOW_IPS` (Traefik as trusted proxy) |
| Discord account link | The user connects Discord on the profile ([ADR-0008](adr/0008-discord-linked-account.md), [ADR-0013](adr/0013-discord-connection-and-report-webhook-routing.md)). Reports depend on it: when a user submits a report, the backend checks whether they connected Discord; if so, it lists the servers they are in and sends the report through the webhooks configured in the admin panel (`/admin/discord-webhooks`) for those servers, optionally filtered by roles, mentioning the user. Discord Application on the Developer Portal, Luis's personal account (**to transfer**) | env `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_LINK_REDIRECT_URI`, `DISCORD_TOKEN_ENCRYPTION_KEY`, `ACCOUNT_LINK_REDIRECT_URI` (Docker secrets) |

## 9. Accounts to transfer

Every account in Brunno's or Luis's personal name.

| Account | Owner today | Destination | Status |
|---|---|---|---|
| GitHub repository `ProgramadoresSemPatria/applika` | ProgramadoresSemPatria org | BorderlessCodingHub | to transfer |
| GitHub Secrets of the repository (3) | admins of the main repository | repository on BorderlessCodingHub | to transfer |
| GitHub OAuth App (login) | Luis (personal) | BorderlessCodingHub org | to transfer |
| Discord Application (account link, in development) | Luis (personal) | Borderless | to transfer |
| Discord of the feedback webhook | Brunno (personal) | Borderless Discord | to transfer |
| Docker Hub (images) | Luis (personal) | Borderless Docker Hub org | to transfer |
| Hostinger VPS (with the Docker secrets and Redis) | Luis (personal) | Borderless account | to transfer |
| Postgres and backups | Brunno (personal) | Borderless | to transfer |
| Domain registration `applika.dev` (Hostinger) | Luis (personal) | Borderless | to transfer |
| DNS (Hostinger) | Luis (personal) | Borderless | to transfer |
| PyPI `applika-cli` | Luis (personal) | Borderless PyPI organisation | to transfer |
