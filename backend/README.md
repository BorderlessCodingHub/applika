# Borderless Panel Backend

## Project Architecture

```
backend/
├── alembic.ini
├── app.log
├── Dockerfile
├── poetry.lock
├── pyproject.toml
├── docker-compose.yml
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── application/
│   │   ├── dto/
│   │   └── use_cases/
│   ├── config/
│   ├── core/
│   ├── domain/
│   │   ├── models.py
│   │   └── repositories/
│   ├── presentation/
│   │   ├── api/
│   │   ├── schemas/
│   │   ├── dependencies.py
│   │   └── handlers.py
│   └── tests/
│       ├── integration/
│       └── unit/
├── migrations/
│   ├── env.py
│   └── versions/
```

### Architecture Explanation
- **app/**: Main application code, organized by domain, presentation, config, and core logic.
  - **application/**: Business logic, DTOs, and use cases.
  - **config/**: Configuration files (DB, logging, middleware, settings).
  - **core/**: Core utilities (exceptions, tokens).
  - **domain/**: Domain models and repositories.
  - **presentation/**: API routes, schemas, handlers, and dependencies.
  - **tests/**: Unit and integration tests.
- **migrations/**: Database migration scripts managed by Alembic.
- **Dockerfile**: Containerization instructions for backend service.
- **docker-compose.yml**: Multi-container orchestration (backend + Postgres).
- **pyproject.toml / poetry.lock**: Python dependencies managed by Poetry.

## Required Environment Variables


| Name                    | Description                                           | Example Value                                        | Required |
|-------------------------|-------------------------------------------------------|------------------------------------------------------|----------|
| ENVIRONMENT             | Application environment (PROD, DEV, TEST)             | PROD                                                 | Yes      |
| DATABASE_URL            | Async DB connection string (SQLAlchemy async format)  | postgresql+asyncpg://user:passw@host:port/database   | Yes      |
| GITHUB_CLIENT_ID        | GitHub OAuth client ID                                | <your-client-id>                                     | Yes      |
| GITHUB_CLIENT_SECRET    | GitHub OAuth client secret                            | <your-client-secret>                                 | Yes      |
| GITHUB_REDIRECT_URI     | GitHub OAuth redirect URI                             | http://127.0.0.1:8000/api/auth/github/callback       | No       |
| LOGIN_REDIRECT_URI      | Login redirect URI after authentication               | http://127.0.0.1:8000/api/docs                       | No       |
| JWT_ALGORITHM           | JWT signing algorithm                                 | HS256                                                | No       |
| JWT_SECRET              | JWT secret key                                        | my-jwt-secret                                        | No       |
| ACCESS_TOKEN_EXPIRE_MINUTES | Access token expiration (minutes)                 | 15                                                   | No       |
| REFRESH_TOKEN_EXPIRE_DAYS   | Refresh token expiration (days)                   | 7                                                    | No       |
| LOG_LEVEL               | Logging level                                         | INFO                                                 | No       |
| LOG_FORMAT              | Logging format string                                 | [%(asctime)s] [%(levelname)s] %(message)s            | No       |
| API_PREFIX              | API route prefix                                      | /api                                                 | No       |
| CORS_ORIGINS            | Allowed CORS origins (comma separated)                | http://127.0.0.1:3000,http://127.0.0.1:8000          | No       |
| CORS_HEADERS            | Allowed CORS headers (comma separated)                | X-Request-ID,Content-Type                            | No       |
| CORS_METHODS            | Allowed CORS methods (comma separated)                | GET,POST,PUT,DELETE,OPTIONS                          | No       |
| DATABASE_ECHO           | SQLAlchemy echo flag (show SQL queries)               | False                                                | No       |

## How to Run the Application

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ProgramadoresSemPatria/application_panel.git borderless-panel
   cd borderless-panel/backend
   ```

2. **Set up environment variables:**
   - Create a `.env` file or set variables in `docker-compose.yml` as needed.

3. **Build and start services with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

4. **Access the backend API:**
   - The API will be available at `http://127.0.0.1:8000`

5. **Run database migrations (if needed):**
   ```bash
   docker-compose exec backend_app alembic upgrade head
   ```

---

For more details, check the source code and configuration files. If you have any issues, feel free to ask for help!
