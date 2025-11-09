# Applika.dev - Backend

## Project Structure

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

### Structure Explanation

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

| Name                        | Description                                          | Example Value                                      | Required |
| --------------------------- | ---------------------------------------------------- | -------------------------------------------------- | -------- |
| ENVIRONMENT                 | Application environment (PROD, DEV, TEST)            | PROD                                               | Yes      |
| DATABASE_URL                | Async DB connection string (SQLAlchemy async format) | postgresql+asyncpg://user:passw@host:port/database | Yes      |
| GITHUB_CLIENT_ID            | GitHub OAuth client ID                               | <your-client-id>                                   | Yes      |
| GITHUB_CLIENT_SECRET        | GitHub OAuth client secret                           | <your-client-secret>                               | Yes      |
| GITHUB_REDIRECT_URI         | GitHub OAuth redirect URI                            | http://127.0.0.1:8000/api/auth/github/callback     | No       |
| LOGIN_REDIRECT_URI          | Login redirect URI after authentication              | http://127.0.0.1:8000/api/docs                     | No       |
| JWT_ALGORITHM               | JWT signing algorithm                                | HS256                                              | No       |
| JWT_SECRET                  | JWT secret key                                       | my-jwt-secret                                      | No       |
| ACCESS_TOKEN_EXPIRE_MINUTES | Access token expiration (minutes)                    | 15                                                 | No       |
| REFRESH_TOKEN_EXPIRE_DAYS   | Refresh token expiration (days)                      | 7                                                  | No       |
| LOG_LEVEL                   | Logging level                                        | INFO                                               | No       |
| LOG_FORMAT                  | Logging format string                                | "[%(asctime)s] [%(levelname)s] %(message)s"        | No       |
| API_PREFIX                  | API route prefix                                     | /api                                               | No       |
| CORS_ORIGINS                | Allowed CORS origins                                 | ["http://127.0.0.1:3000","http://127.0.0.1:8000"]  | No       |
| CORS_HEADERS                | Allowed CORS headers                                 | ["X-Request-ID","Content-Type"]                    | No       |
| CORS_METHODS                | Allowed CORS methods                                 | ["GET","POST","PUT","DELETE","OPTIONS"]            | No       |
| DATABASE_ECHO               | SQLAlchemy echo flag (show SQL queries)              | False                                              | No       |

### Creating a GitHub OAuth App

To authenticate users with GitHub OAuth, you need to create a GitHub OAuth App:

1. Visit [GitHub OAuth App Creation](https://github.com/settings/developers)
2. Click "New OAuth App"
3. Fill in the required fields:
   - Application name
   - Homepage URL
   - Authorization callback URL
     - `http://127.0.0.1:8000/api/auth/github/callback`
4. Click "Register application"
5. Copy the generated Client ID and Client Secret
6. Add these credentials to your environment variables:
   ```
   GITHUB_CLIENT_ID=<your-client-id>
   GITHUB_CLIENT_SECRET=<your-client-secret>
   ```

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
   docker compose up --build
   ```

4. **Access the backend API:**

   - The API will be available at `http://127.0.0.1:8000`

5. **Run database migrations (if needed):**
   ```bash
   docker exec applika.dev-api alembic upgrade head
   ```

---

## Prerequisites to run without docker

Before running this application, ensure you have the following installed:

- **Python 3.9+**: This application requires Python version 3.9 or higher. You can download it from the [official Python website](https://www.python.org/downloads/).
- **Poetry**: Package management and dependency resolution is handled by Poetry. Install it following the [official Poetry installation guide](https://python-poetry.org/docs/#installation).

These requirements are essential for local development. If you're using Docker, these dependencies will be handled automatically by the container.

### Setup Instructions

1. **Install dependencies:**

   ```bash
   poetry install
   ```

   This command will create a virtual environment and install all required dependencies.

2. **Create a `.env` file:**

   - Create a `.env` file in the root of your project and add the required environment variables.

3. **Run database migrations:**

   ```bash
   poetry run alembic upgrade head
   ```

   This command will execute the database migrations.

4. **Run the application:**
   ```bash
   poetry run task run
   ```
   This command will start the application.

---

For more details, check the source code and configuration files. If you have any issues, feel free to ask for help!
