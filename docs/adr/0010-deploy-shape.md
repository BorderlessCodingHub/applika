# ADR-0010: Current deploy stays; single image is a late target

**Status:** Accepted by LuisMSoares on 2026-09-15 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares · Amended by ADR-0016 on 2026-10-11 (worker and scheduler services)

## Context

The owner: "applika project runs in a vps with docker swarm, there ir no CD automation, once the
image is published in docker hub, I upgrade the swarm stack to use the latest version, docker exec
in api image, i run alembic upgrade and then restart the api container." Clarified: "yes, there
is a cd automation, but not for migrations"

The single-image shape: Node builds the static export, FastAPI serves `out/`, and the
entrypoint runs `alembic upgrade head`. Selected: "Converge, as a
late feature".

## Decision

Today, as built:

- Two images: the API (`backend/Dockerfile`, uvicorn only) and the frontend served by nginx
  (`frontend/docker/Dockerfile`, `frontend/docker/nginx.conf`).
- Both run on a Docker Swarm stack on a VPS.
- A push to `main` deploys both images automatically (`.github/workflows/backend-cd.yaml`,
  `.github/workflows/frontend-cd.yaml`: Docker Hub publish, `docker service update` over SSH).
- Migrations are not automated. The owner runs Alembic by hand inside the API container after the
  deploy (`.claude/rules/prod-release-runbook.md`).
- The API and the frontend are separate origins. CORS with credentials is on
  (`backend/app/main.py`, `frontend/src/lib/api-client.ts`).

Target:

- A single image serving the static export from FastAPI is adopted only after identity, CV builder,
  steps and Discord linking ship.
- It ships as its own feature with its own ADR.

## Consequences

- Until then, features assume cross-origin cookies and a manual migration step after an automated
  image deploy, so new code runs against the old schema for a window.
- Migrations ship expand first, code second: the additive migration reaches `main` with code that
  still works on the old schema; code using the new objects ships in a later release, after the
  owner runs `alembic upgrade head` (`.claude/rules/prod-release-runbook.md`).
- The Discord link callback redirects across origins (ADR-0008).

## Non-goals

- Running migrations on container start or in CD now.
