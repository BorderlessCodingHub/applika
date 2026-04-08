# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it whenever the project changes in ways that affect how you work here.**

Update CLAUDE.md when:
- New entities, relationships, or domain concepts are added (update Domain Model Relationships)
- A new architectural pattern or layer is introduced
- A new essential command is added (tasks, scripts, docker targets)
- A new environment variable becomes required or optional
- A new domain exception is introduced and mapped to an HTTP status
- The authentication/token strategy changes
- A new dependency is added that has non-obvious usage patterns
- Project skills or MCP usage patterns change

Do NOT bloat CLAUDE.md with:
- Implementation details already visible in the code
- Ephemeral task notes or in-progress work
- Debugging steps or one-off fixes
- Anything already in git history or docstrings

---

## Seed Script Rule

**Always keep `scripts/seed_mock_data.py` up to date and working.**

The seed script exercises the full public API to create realistic mock data. It is the fastest way to verify that all endpoints work end-to-end after changes.

When you add or modify any of the following, update the seed script accordingly:
- New required or optional fields on `POST /applications` or `POST /applications/{id}/steps` or `POST /applications/{id}/finalize`
- New enums (e.g., `work_mode`, `experience_level`, `salary_period`, `currency`, `mode`, `availability`)
- New support data endpoints (platforms, steps, feedbacks) — update the `/supports` fetch and field extraction
- Renamed or removed fields that the seed script currently sends
- New endpoints the seed script should exercise to keep coverage complete
- Changes to authentication (cookie name, token format)

After any such change, mentally walk through the seed script from top to bottom and confirm it would still run without errors against a fresh database.

---

## Project Overview

This is a FastAPI backend for **Applika.dev** (Application Panel), a job application tracking system with biweekly reporting and analytics. The codebase follows Clean Architecture with strict layer separation and uses async SQLAlchemy with PostgreSQL. All entity IDs use Snowflake-generated BigIntegers.

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

### Seed Script
```bash
# Full reset + seed (downgrade → upgrade → seed)
uv run task seed

# Or seed manually (server must be running, requires a valid JWT access token)
python scripts/seed_mock_data.py
```

### Docker
```bash
# Start backend + PostgreSQL
docker compose up --build

# Run migrations in container (entrypoint already runs them)
docker exec applika.dev-api alembic upgrade head
```

## Architecture

The codebase uses Clean Architecture with four main layers:

### Domain Layer (`app/domain/`)
- **models.py**: SQLAlchemy ORM models with `BaseMixin` providing Snowflake IDs + timestamps
- **repositories/**: Repository classes handling data access
  - All repositories use AsyncSession and follow async/await patterns
  - Handle transactions with explicit commit/rollback in try/except blocks

### Application Layer (`app/application/`)
- **use_cases/**: Business logic encapsulated in single-purpose classes
  - Each use case has one `execute()` method
  - Use cases are injected with repository dependencies
  - Keep transport-agnostic (no HTTP concerns)
- **dto/**: Data Transfer Objects using Pydantic for validation
  - Separate DTOs for creation, updates, and responses
- **services/**: External integrations (e.g., Discord webhook service)

### Presentation Layer (`app/presentation/`)
- **api/**: FastAPI route handlers organized by resource
- **schemas/**: API request/response schemas (Pydantic)
- **dependencies.py**: FastAPI dependency injection factories
  - Repository factories like `get_user_repository()`
  - Service factories like `get_discord_service()`
  - Authentication via `get_current_user()`
- **handlers.py**: Global exception handlers mapping domain exceptions to HTTP responses

### Library Layer (`app/lib/`)
- **types.py**: Snowflake ID type with Pydantic serialization
- **urls.py**: URL utility functions

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
- **Access-only JWT** stored in HTTP-only cookie (`__access`) — no refresh token
- Payload: `{sub: github_id, kind: 'access', exp: ...}`
- `get_current_user()` dependency extracts user from access cookie
- `GET /auth/refresh` re-issues the cookie if the current token is still valid
- Token utilities in `app/core/tokens.py`
- Cookie settings: HTTPOnly, Secure in PROD, SameSite=Lax

### Exception Handling
Domain exceptions in `app/core/exceptions.py`:
- `ResourceNotFound` → 404
- `ResourceConflict` → 409
- `ApplicationFinalized` → 409
- `NotImplementedError` → 501

Handlers registered in `app/presentation/handlers.py` via `register_handlers(app)`.

### Snowflake IDs
All entity primary keys use Snowflake-generated `BigInteger` IDs instead of UUIDs or auto-increment. Defined in `app/lib/types.py` with Pydantic serialization to string for JSON/OpenAPI.

### Request ID Logging
- Every request gets a UUID via `HTTPLifecycleMiddleware`
- Request ID propagated via context variable (`request_id_ctx`)
- Added to logs via `RequestIdFilter`
- Returned in response header `X-Request-ID`

## API Endpoints

### OAuth (`/auth`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/auth/github/login` | No | Redirect to GitHub OAuth |
| GET | `/auth/github/callback` | No | OAuth callback, sets access cookie |
| GET | `/auth/refresh` | Yes | Re-issue access cookie |
| GET | `/auth/logout` | No | Clear access cookie |

### Users (`/users`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/users/me` | Yes | Get current user profile |
| PATCH | `/users/me` | Yes | Update profile |

### Applications (`/applications`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/applications` | Yes | Create application (201) |
| GET | `/applications` | Yes | List all user applications |
| PUT | `/applications/{id}` | Yes | Update application |
| DELETE | `/applications/{id}` | Yes | Delete application (204) |
| POST | `/applications/{id}/finalize` | Yes | Finalize with feedback (201) |

### Application Steps (`/applications/{id}/steps`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/{id}/steps` | Yes | List steps |
| POST | `/{id}/steps` | Yes | Create step (201) |
| PUT | `/{id}/steps/{step_id}` | Yes | Update step |
| DELETE | `/{id}/steps/{step_id}` | Yes | Delete step (204) |

### Companies (`/companies`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/companies` | Yes | List/search companies |

### Statistics (`/applications/statistics`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/statistics` | Yes | General statistics |
| GET | `/statistics/steps/conversion_rate` | Yes | Step conversion rates |
| GET | `/statistics/steps/avarage_days` | Yes | Average days per step |
| GET | `/statistics/platforms` | Yes | Applications per platform |
| GET | `/statistics/mode` | Yes | Active vs passive split |
| GET | `/statistics/trends` | Yes | Last month daily trends |

### Biweekly Reports (`/reports`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/reports` | Yes | List all reports |
| GET | `/reports/{day}` | Yes | Get report details |
| POST | `/reports/{day}/submit` | Yes | Submit report (201) |

### User Feedback (`/feedbacks`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/feedbacks` | Yes | Submit app feedback (201) |

### Support Data (`/supports`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/supports` | Yes | Steps, feedbacks, platforms |

## Testing

Uses pytest with testcontainers for integration tests:
- Postgres container spun up per test session
- `async_client` fixture overrides dependencies to use test DB
- Base data seeded via `base_data()` helper
- Tests run with `asyncio_mode = "auto"`
- Ryuk reaper disabled on Windows

See `app/tests/` for test fixtures and test files.

## Enums

Defined in `app/core/enums.py`:
- **Currency**: USD, BRL, EUR, GBP, CAD, AUD, JPY, CHF, INR
- **SalaryPeriod**: hourly, monthly, annual
- **ExperienceLevel**: intern, junior, mid_level, senior, staff, lead, principal, specialist
- **WorkMode**: remote, hybrid, on_site
- **Availability**: open_to_work, casually_looking, not_looking

## Environment Variables

Required:
- `DATABASE_URL`: postgresql+asyncpg://user:pass@host:port/db
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID
- `GITHUB_CLIENT_SECRET`: GitHub OAuth client secret

Optional (with defaults):
- `ENVIRONMENT`: PROD | DEV | TEST (default: DEV)
- `JWT_SECRET`: JWT signing secret (default: changeme placeholder)
- `JWT_ALGORITHM`: HS256 (default)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: 15 (default)
- `GITHUB_REDIRECT_URI`: OAuth callback URL
- `LOGIN_REDIRECT_URI`: Post-login redirect
- `DISCORD_REPORTS_WEBHOOK`: Discord webhook for biweekly reports
- `DISCORD_FEEDBACK_WEBHOOK`: Discord webhook for user feedback
- `CORS_ORIGINS`, `CORS_HEADERS`, `CORS_METHODS`: CORS configuration
- `LOG_LEVEL`, `LOG_FORMAT`: Logging configuration
- `API_PREFIX`: Route prefix (default: /api)
- `DATABASE_ECHO`: SQLAlchemy echo (default: False)

## Domain Model Relationships

### Core Entities
- **User**: GitHub OAuth authenticated users with profile (company, role, salary, tech stack, seniority, availability)
- **Company**: Job companies, user-created, unique on lower(name)+url
- **Application**: Job applications with tracking, salary info, and country
- **ApplicationStep**: Timeline of application progress steps
- **StepDefinition**: Predefined step types (Applied, Initial Screen, Interview phases, Offer, etc.)
  - `strict=True` steps can only be used in final application status
- **FeedbackDefinition**: Final outcomes (Accepted, Rejected, etc.)
- **Platform**: Job platforms (LinkedIn, Indeed, etc.)
- **QuinzenalReport**: Biweekly progress reports with fortnight + accumulated metrics
  - Report days: 1, 14, 28, 42, 56, 70, 84, 98, 112, 120
  - Phases: 1-4
  - Includes manual metrics (mock interviews, LinkedIn posts, strategic connections)
  - Discord integration for posting reports
- **UserFeedback**: In-app feedback from users (score 1-5 + optional text)

### Key Relationships
- Application → User (many-to-one, cascade delete)
- Application → Platform (many-to-one)
- Application → Company (many-to-one, optional)
- Application → last_step_def (many-to-one, nullable)
- Application → feedback_def (many-to-one, nullable, only set when finalized)
- ApplicationStep → Application (many-to-one, cascade delete)
- ApplicationStep → StepDefinition (many-to-one)
- ApplicationStep → User (many-to-one, cascade delete)
- Company → User (many-to-one via created_by, cascade delete)
- QuinzenalReport → User (many-to-one, cascade delete), unique on (user_id, report_day)
- UserFeedback → User (many-to-one, cascade delete)

Applications are "finalized" when `feedback_id` is set (irreversible).

## Code Conventions

### Formatting
- Ruff formatter with single quotes (`'`)
- Line length: 80 (hard), 120 (max for pycodestyle)
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
DiscordServiceDp = Annotated[DiscordService, Depends(get_discord_service)]
```

### File Organization
- Use cases grouped in subdirectories by feature (applications/, application_steps/, user_stats/, quinzenal_reports/, companies/, user_feedbacks/)
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
