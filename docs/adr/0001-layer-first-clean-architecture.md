# ADR-0001: Layer-first clean architecture (as-built)

**Status:** Accepted by LuisMSoares on 2026-09-16 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

The applika backend is organised by layer, not by feature. No ADR records it. New features land in the
same shape.

## Decision

This records what the code does today.

- `app/domain/`: `models.py` holds the SQLAlchemy models. `repositories/` holds one repository per
  model. Repositories take an `AsyncSession` and commit.
- `app/application/`: `use_cases/<feature>/` holds one class per operation with one `execute()`.
  `dto/` holds Pydantic DTOs. `services/` holds external integrations
  (`github_service.py`, `discord_service.py`).
- `app/presentation/`: `api/` holds routers per resource, `schemas/` the wire schemas,
  `dependencies.py` the DI factories, `handlers.py` the domain-exception-to-HTTP mapping.
- `app/core/`: enums, exceptions, tokens, crypto. `app/config/`: settings, db, redis, logging,
  middleware. `app/lib/`: Snowflake type and URL helpers.
- Domain exceptions map to 404, 409, 422 and 501 in `app/presentation/handlers.py`.
- Every request gets a request id through `app/config/middleware.py`, returned as `X-Request-ID`.

Proof: `backend/app/`, `backend/app/application/use_cases/applications/create_application.py`,
`backend/app/domain/repositories/application_repository.py`, `backend/CLAUDE.md`.

## Consequences

- New features (CV builder, timeline, Discord linking) add files in the same layers.
- Use cases stay transport-agnostic, so the CLI compatibility layer (ADR-0009) can reuse them.

## Non-goals

- Moving to feature-first folders.
- Adopting a ruff C90 complexity limit; that is not decided here.
