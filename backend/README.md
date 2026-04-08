# Applika.dev - Backend

FastAPI backend for Applika.dev, a job application tracking system with biweekly reporting and analytics. Built with Clean Architecture, async SQLAlchemy, and PostgreSQL.

## Project Structure

```
backend/
├── alembic.ini
├── Dockerfile
├── docker-compose.yml
├── pyproject.toml
├── uv.lock
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── application/
│   │   ├── dto/                  # Data Transfer Objects
│   │   ├── services/             # External integrations (Discord)
│   │   └── use_cases/            # Business logic
│   │       ├── applications/
│   │       ├── application_steps/
│   │       ├── companies/
│   │       ├── quinzenal_reports/
│   │       ├── user_feedbacks/
│   │       └── user_stats/
│   ├── config/
│   │   ├── db.py                 # Async SQLAlchemy engine & session
│   │   ├── logging.py            # Request ID context + logging
│   │   ├── middleware.py          # HTTP & WebSocket lifecycle
│   │   └── settings.py           # Pydantic settings
│   ├── core/
│   │   ├── enums.py              # Domain enums
│   │   ├── exceptions.py         # Domain exceptions
│   │   └── tokens.py             # JWT cookie utilities
│   ├── domain/
│   │   ├── models.py             # SQLAlchemy ORM models
│   │   └── repositories/         # Data access layer
│   ├── lib/
│   │   ├── types.py              # Snowflake ID type
│   │   └── urls.py               # URL utilities
│   ├── presentation/
│   │   ├── api/                   # FastAPI route handlers
│   │   ├── schemas/               # Request/response schemas
│   │   ├── dependencies.py        # DI factories
│   │   └── handlers.py            # Exception → HTTP mapping
│   └── tests/
│       ├── integration/
│       └── unit/
├── migrations/
│   ├── env.py
│   └── versions/
└── scripts/
    └── seed_mock_data.py
```

## Tech Stack

- **Python 3.14** with uv package manager
- **FastAPI** 0.115+ with async/await
- **SQLAlchemy** 2.0 async with asyncpg
- **PostgreSQL** 16
- **Alembic** for migrations
- **Pydantic** 2.0 for validation and settings
- **Snowflake IDs** for distributed unique identifiers
- **fastapi-sso** for GitHub OAuth
- **PyJWT** for token management

## Required Environment Variables

| Name | Description | Example | Required |
|------|-------------|---------|----------|
| `DATABASE_URL` | Async DB connection string | `postgresql+asyncpg://user:pass@host:5432/db` | Yes |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID | `<your-client-id>` | Yes |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret | `<your-client-secret>` | Yes |

## Optional Environment Variables

| Name | Description | Default |
|------|-------------|---------|
| `ENVIRONMENT` | PROD, DEV, or TEST | `DEV` |
| `JWT_SECRET` | JWT signing secret | changeme placeholder |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Access token TTL | `15` |
| `GITHUB_REDIRECT_URI` | OAuth callback URL | `http://127.0.0.1:8000/api/auth/github/callback` |
| `LOGIN_REDIRECT_URI` | Post-login redirect | `http://127.0.0.1:8000/api/docs` |
| `DISCORD_REPORTS_WEBHOOK` | Discord webhook for biweekly reports | `None` |
| `DISCORD_FEEDBACK_WEBHOOK` | Discord webhook for user feedback | `None` |
| `CORS_ORIGINS` | Allowed CORS origins | `["http://127.0.0.1:3000","http://127.0.0.1:8000"]` |
| `CORS_HEADERS` | Allowed CORS headers | `["X-Request-ID","Content-Type"]` |
| `CORS_METHODS` | Allowed CORS methods | `["GET","PATCH","POST","PUT","DELETE","OPTIONS"]` |
| `API_PREFIX` | API route prefix | `/api` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `LOG_FORMAT` | Logging format string | `[%(asctime)s] \|%(levelname)s\| ...` |
| `DATABASE_ECHO` | SQLAlchemy echo flag | `False` |

## How to Run

### With Docker (recommended)

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ProgramadoresSemPatria/application_panel.git borderless-panel
   cd borderless-panel/backend
   ```

2. **Configure environment:**
   - Create a `.env` file or edit variables in `docker-compose.yml`

3. **Build and start:**
   ```bash
   docker compose up --build
   ```
   The entrypoint automatically runs migrations before starting the server.

4. **Access the API:** `http://127.0.0.1:8000/api/docs`

### Without Docker

**Prerequisites:** Python 3.14+, [uv](https://docs.astral.sh/uv/) package manager, PostgreSQL 16

1. **Install dependencies:**
   ```bash
   uv sync
   ```

2. **Create a `.env` file** with the required environment variables.

3. **Run database migrations:**
   ```bash
   uv run task auhead
   ```

4. **Run the application:**
   ```bash
   uv run task run
   ```

### Seeding Mock Data

The seed script creates 55 realistic job applications for testing:

```bash
# Full reset + seed (downgrade → upgrade → seed)
uv run task seed

# Or manually (server must be running)
python scripts/seed_mock_data.py
```

## Authentication

The API uses GitHub OAuth with access-only JWT cookies (no refresh token):

1. `GET /api/auth/github/login` — Redirects to GitHub
2. GitHub callback sets an `__access` HTTPOnly cookie
3. `GET /api/auth/refresh` — Re-issues the cookie if still valid
4. `GET /api/auth/logout` — Clears the cookie

### Creating a GitHub OAuth App

1. Visit [GitHub Developer Settings](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Set Authorization callback URL to `http://127.0.0.1:8000/api/auth/github/callback`
4. Copy Client ID and Client Secret to your `.env`

## API Endpoints

All endpoints (except OAuth) require authentication via the `__access` cookie.

| Method | Route | Description |
|--------|-------|-------------|
| **OAuth** | | |
| GET | `/auth/github/login` | GitHub login redirect |
| GET | `/auth/github/callback` | OAuth callback |
| GET | `/auth/refresh` | Refresh access cookie |
| GET | `/auth/logout` | Logout |
| **Users** | | |
| GET | `/users/me` | Get profile |
| PATCH | `/users/me` | Update profile |
| **Applications** | | |
| POST | `/applications` | Create application |
| GET | `/applications` | List applications |
| PUT | `/applications/{id}` | Update application |
| DELETE | `/applications/{id}` | Delete application |
| POST | `/applications/{id}/finalize` | Finalize with feedback |
| **Application Steps** | | |
| GET | `/applications/{id}/steps` | List steps |
| POST | `/applications/{id}/steps` | Create step |
| PUT | `/applications/{id}/steps/{step_id}` | Update step |
| DELETE | `/applications/{id}/steps/{step_id}` | Delete step |
| **Companies** | | |
| GET | `/companies` | List/search companies |
| **Statistics** | | |
| GET | `/applications/statistics` | General stats |
| GET | `/applications/statistics/steps/conversion_rate` | Step conversion |
| GET | `/applications/statistics/steps/avarage_days` | Avg days per step |
| GET | `/applications/statistics/platforms` | Per-platform stats |
| GET | `/applications/statistics/mode` | Active vs passive |
| GET | `/applications/statistics/trends` | Daily trends |
| **Biweekly Reports** | | |
| GET | `/reports` | List reports |
| GET | `/reports/{day}` | Get report details |
| POST | `/reports/{day}/submit` | Submit report |
| **Feedback** | | |
| POST | `/feedbacks` | Submit app feedback |
| **Support** | | |
| GET | `/supports` | Steps, feedbacks, platforms |

## Development Tasks

```bash
uv run task run            # Dev server (port 8000, hot reload)
uv run task pytest         # Run tests with coverage
uv run task ruff           # Lint and auto-fix
uv run task autorevision   # Generate Alembic migration
uv run task auhead         # Apply migrations
uv run task adbase         # Rollback all migrations
uv run task seed           # Reset DB + seed mock data
```

---

For more details, check the source code and `CLAUDE.md`. If you have any issues, feel free to ask for help!
