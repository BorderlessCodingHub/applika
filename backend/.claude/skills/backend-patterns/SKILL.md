---
name: backend-patterns
description: >
  Patterns and conventions for this FastAPI Clean Architecture backend (Applika.dev).
  Use this skill whenever adding a new feature, endpoint, CRUD resource, model,
  repository, use case, DTO, schema, migration, test, or exception to the backend.
  Also use when the user asks how the project is structured, how layers connect,
  or how to follow existing conventions. Trigger on any backend code generation task
  involving FastAPI, SQLAlchemy, Alembic, Pydantic, or async Python in this project —
  even if the user doesn't explicitly mention "patterns" or "conventions".
---

# Applika.dev Backend Patterns

This skill encodes the architecture and conventions of the Applika.dev FastAPI backend so that every new feature follows the same structure as the existing codebase.

## Architecture Overview

The codebase follows **Clean Architecture** with three layers. Data flows inward — the presentation layer depends on the application layer, which depends on the domain layer. No layer reaches outward.

```
Presentation (API routes, schemas, dependencies)
    ↓ calls
Application (use cases, DTOs)
    ↓ calls
Domain (ORM models, repositories)
```

When adding a new feature, work **bottom-up**: model → repository → DTOs → use case → schemas → route → dependency wiring → migration → tests.

## Quick Reference: File Locations

| What                 | Where                                         |
|----------------------|-----------------------------------------------|
| ORM models           | `app/domain/models.py`                        |
| Repositories         | `app/domain/repositories/<name>_repository.py`|
| Use cases            | `app/application/use_cases/<feature>/`        |
| DTOs                 | `app/application/dto/<name>.py`               |
| API routes           | `app/presentation/api/<name>.py`              |
| Presentation schemas | `app/presentation/schemas/<name>.py`          |
| Dependencies (DI)    | `app/presentation/dependencies.py`            |
| Exception handlers   | `app/presentation/handlers.py`                |
| Domain exceptions    | `app/core/exceptions.py`                      |
| Migrations           | `migrations/versions/`                        |
| Tests                | `app/tests/integration/`, `app/tests/unit/`   |

## Step-by-Step: Adding a New Feature

Follow these steps in order. Read the relevant reference file for detailed patterns and examples.

### 1. Domain Model

Add the SQLAlchemy model to `app/domain/models.py`. Read `references/models-and-repos.md` for the full pattern including `BaseMixin`, relationship conventions, and TypedDict properties.

Key conventions:
- Inherit from `BaseMixin, Base` (gives you `id`, `created_at`, `updated_at`)
- Use `Mapped[type]` with `mapped_column()` for all columns
- Use `sa.ForeignKey('table.id', ondelete='CASCADE')` for cascading deletes
- Use `Optional` for nullable fields, not `nullable=True` alone

### 2. Repository

Create `app/domain/repositories/<name>_repository.py`. Read `references/models-and-repos.md` for repository patterns.

Key conventions:
- Constructor takes `AsyncSession` only
- All methods are `async`
- Use `select()` / `delete()` from SQLAlchemy 2.0 style
- Write operations (`create`, `update`): wrap in try/except, call `session.commit()`, call `session.rollback()` on failure
- Read operations: use `selectinload()` or `joinedload()` for relationship eager loading
- Return ORM models (not DTOs)

### 3. DTOs (Data Transfer Objects)

Create `app/application/dto/<name>.py`. Read `references/dtos-and-schemas.md` for the full pattern.

Key conventions:
- **CreateDTO / UpdateDTO**: inherit from `BaseModel` — plain Pydantic, no `id` or timestamps
- **ResponseDTO**: inherit from `BaseSchema` (defined in `app/application/dto/__init__.py`) — includes `id`, `created_at`, `updated_at` with `from_attributes=True`
- DTOs live in the application layer and are what use cases accept and return

### 4. Use Case

Create `app/application/use_cases/<feature>/<action>.py`. Read `references/use-cases-and-di.md` for the full pattern.

Key conventions:
- Class-based: constructor receives repository dependencies
- Single `async def execute(self, ...)` method
- Validate business rules, raise domain exceptions (`ResourceNotFound`, `ResourceConflict`, `ApplicationFinalized`)
- Return DTOs via `SomeDTO.model_validate(orm_model)`
- No HTTP concerns — transport-agnostic

### 5. Presentation Schemas

Create `app/presentation/schemas/<name>.py`. Read `references/dtos-and-schemas.md` for details.

Key conventions:
- Request schemas: inherit from presentation `BaseSchema` (in `app/presentation/schemas/__init__.py`) — has `extra='forbid'`, `from_attributes=True`
- Response schemas: inherit from both `BaseSchema` and `TimeSchema`
- These are separate from DTOs — schemas handle API serialization, DTOs handle business logic data

### 6. API Route

Create `app/presentation/api/<name>.py`. Read `references/use-cases-and-di.md` for how routes wire everything together.

Key conventions:
- Create an `APIRouter` with `tags` and default `responses`
- Inject repositories and `CurrentUserDp` via FastAPI `Depends`
- Instantiate use case in the route handler, call `execute()`
- Return schema via `Schema.model_validate(dto)`
- Use `status_code=201` for creates, `status_code=204` for deletes

### 7. Dependency Wiring

Update `app/presentation/dependencies.py`. Read `references/use-cases-and-di.md`.

Key conventions:
- Add a factory function: `def get_<name>_repository(session: DbSession): return <Name>Repository(session)`
- Add a type alias: `<Name>RepositoryDp = Annotated[<Name>Repository, Depends(get_<name>_repository)]`
- Register the router in `app/main.py` via `app.include_router()`

### 8. Exception Handling

If the feature needs new domain exceptions, read `references/exceptions-and-logging.md`.

Key conventions:
- Define exceptions in `app/core/exceptions.py` inheriting from `UnicornException`
- Register handler in `app/presentation/handlers.py` via `app.add_exception_handler()`
- Handler returns `JSONResponse` with `status_code` and `{'detail': exc.message}`

### 9. Migration

Run `uv run alembic revision --autogenerate -m 'descriptive message'` to auto-generate from model changes with meaningful revision messages. Read `references/migrations-and-tests.md` for the critical post-generation steps.

Key conventions:
- Alembic auto-generates with `None` for all constraint names — rename them with descriptive names like `fk_<table>_<column>`, `uq_<table>_<column>`, `ix_<table>_<column>`
- Include both `upgrade()` and `downgrade()` — verify the downgrade is correct
- For seed data, use `op.bulk_insert()` with `sa.table()` / `sa.column()`

### 10. Tests

Add tests in `app/tests/integration/`. Read `references/migrations-and-tests.md` for test patterns.

Key conventions:
- Use `async_client` fixture for API integration tests
- Use `db_session` fixture for direct DB tests
- Seed test data in `app/tests/base_db_setup.py`
- Arrange-Act-Assert pattern
- Test files: `test_<feature>.py`

## Code Style

- Single quotes (`'`) everywhere
- Line length: 79 characters (hard limit)
- Ruff for linting and formatting
- Imports sorted via Ruff (`I` rule)
- Run `uv run task ruff` before committing
