# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a FastAPI backend for Applika.dev (Application Panel), a job application tracking system. The codebase follows Clean Architecture with strict layer separation and uses async SQLAlchemy with PostgreSQL.

## Essential Commands

### Development
```bash
# Install dependencies
uv sync

# Run development server (port 8000 with auto-reload)
uv run task run

# Run linter with auto-fix
uv run task ruff

# Run tests with coverage
uv run task pytest
```

### Database Migrations
```bash
# Create new migration (auto-generate from models)
uv run task autorevision

# Apply migrations
uv run task auhead

# Rollback all migrations
uv run task adbase
```

### Docker
```bash
# Start backend + PostgreSQL
docker compose up --build

# Run migrations in container
docker exec applika.dev-api alembic upgrade head
```

## Architecture

The codebase uses Clean Architecture with three main layers:

### Domain Layer (`app/domain/`)
- **models.py**: SQLAlchemy ORM models (ApplicationModel, UserModel, etc.)
- **repositories/**: Repository interfaces defining data access contracts
  - All repositories use AsyncSession and follow async/await patterns
  - Handle transactions with explicit commit/rollback in try/except blocks

### Application Layer (`app/application/`)
- **use_cases/**: Business logic encapsulated in single-purpose classes
  - Each use case has one `execute()` method
  - Use cases are injected with repository dependencies
  - Keep transport-agnostic (no HTTP concerns)
- **dto/**: Data Transfer Objects using Pydantic for validation
  - Separate DTOs for creation, updates, and responses

### Presentation Layer (`app/presentation/`)
- **api/**: FastAPI route handlers organized by resource
- **schemas/**: API request/response schemas (Pydantic)
- **dependencies.py**: FastAPI dependency injection factories
  - Repository factories like `get_user_repository()`
  - Authentication via `get_current_user()`
- **handlers.py**: Global exception handlers mapping domain exceptions to HTTP responses

## Key Patterns

### Repository Pattern
All repositories follow this structure:
- Constructor accepts `AsyncSession`
- Methods are async and use SQLAlchemy 2.0 select/insert syntax
- Explicit transaction management: `session.add()`, `await session.commit()`, `await session.rollback()`
- Eager loading with `selectinload()` for relationships

See `app/domain/repositories/application_repository.py` for reference implementation.

### Use Case Pattern
Use cases encapsulate business operations:
- Class-based with constructor dependency injection
- Single `async def execute()` method
- Raise domain exceptions (ResourceNotFound, ResourceConflict, etc.)
- Return DTOs, not ORM models

See `app/application/use_cases/applications/create_application.py` for reference.

### Authentication
- GitHub OAuth via `fastapi-sso`
- JWT tokens stored in HTTP-only cookies (access + refresh)
- `get_current_user()` dependency extracts user from access token cookie
- Token utilities in `app/core/tokens.py`

### Exception Handling
Domain exceptions in `app/core/exceptions.py`:
- `ResourceNotFound` → 404
- `ResourceConflict` → 409
- `ApplicationFinalized` → 409

Handlers registered in `app/presentation/handlers.py` via `register_handlers(app)`.

### Request ID Logging
- Every request gets a UUID via `HTTPLifecycleMiddleware`
- Request ID propagated via context variable (`request_id_ctx`)
- Added to logs via `RequestIdFilter`
- Returned in response header `X-Request-ID`

## Testing

Uses pytest with testcontainers for integration tests:
- Postgres container spun up per test session
- `async_client` fixture overrides dependencies to use test DB
- Base data seeded via `base_data()` helper
- Tests run with `asyncio_mode = "auto"`

See `app/tests/conftest.py` for test fixtures.

## Environment Variables

Required:
- `DATABASE_URL`: postgresql+asyncpg://user:pass@host:port/db
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret

Optional (see README.md for defaults):
- JWT settings (JWT_SECRET, JWT_ALGORITHM, token expiration)
- CORS settings (origins, headers, methods)
- Logging (LOG_LEVEL, LOG_FORMAT)

## Domain Model Relationships

### Core Entities
- **User**: GitHub OAuth authenticated users
- **Application**: Job applications with tracking
- **ApplicationStep**: Timeline of application progress steps
- **StepDefinition**: Predefined step types (Applied, Interview, Offer, etc.)
  - `strict=True` steps can only be used in final application status
- **FeedbackDefinition**: Final outcomes (Accepted, Rejected, etc.)
- **Platform**: Job platforms (LinkedIn, Indeed, etc.)

### Key Relationships
- Application → User (many-to-one)
- Application → Platform (many-to-one)
- Application → last_step_def (many-to-one, nullable)
- Application → feedback_def (many-to-one, nullable, only set when finalized)
- ApplicationStep → Application (many-to-one, cascade delete)
- ApplicationStep → StepDefinition (many-to-one)

Applications are "finalized" when `feedback_id` is set (irreversible).

## Code Conventions

### Formatting
- Ruff formatter with single quotes (`'`)
- Line length: 79 (hard), 120 (max for pycodestyle)
- Import sorting via Ruff

### Async/Await
- All database operations are async
- Use `await` for session operations
- Repository methods return ORM models or None
- Use case methods return DTOs

### Dependency Injection
Use FastAPI `Depends()` with type aliases:
```python
UserRepositoryDp = Annotated[UserRepository, Depends(get_user_repository)]
CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]
```

### File Organization
- Use cases grouped in subdirectories by feature (applications/, application_steps/, user_stats/)
- One repository per model in `domain/repositories/`
- API routes in `presentation/api/` match resource names

## MCP Usage

Use available MCP (Model Context Protocol) servers during interactions.
**Always prefer MCP tools over bash equivalents when an MCP server is available.**

### Git MCP
- **Always use the Git MCP for every commit** — prefer `git_add`, `git_commit`, `git_diff`, `git_status`, etc. over bash git commands
- Create meaningful commits as you work — don't batch everything at the end
- Commit after completing logical units of work (e.g., after finishing a migration, after adding a new feature layer)
- Write descriptive commit messages following conventional commits style
(feat(backend): message, fix(backend): message, test(backend): message, etc)

### Context7 MCP
- Use context7 to look up library documentation when working with FastAPI, SQLAlchemy, Alembic, Pydantic, or any other dependency
- Prefer context7 over guessing API signatures or relying on outdated knowledge

### Other MCPs
- Use any other available MCP server when relevant (e.g., Docker MCP for container operations)
- Check available MCPs at the start of complex tasks and leverage them throughout

## Project Skills

This repository includes Claude Code skills in `.claude/skills/backend-patterns/` covering:
- async-repository, use-case, pydantic-dto patterns
- JWT cookie auth, OAuth2 integration
- Custom exception handling
- Testcontainers testing setup
- Context variable logging

Refer to `CLAUDE_SKILLS.md` for full examples from the codebase.
