# Backend Architecture - Clean/Hexagonal Architecture

This document outlines the backend project structure following clean architecture principles. Each file contains real code examples.

## Project Structure

```
app/
├── application/         # Application layer (use-cases, DTOs)
│   ├── dto/             # Data Transfer Objects
│   └── use_cases/       # Business logic orchestration
├── domain/              # Domain layer (models, repositories)
│   ├── models.py        # Database models and entities
│   └── repositories/    # Data access interfaces
├── presentation/        # Presentation layer (HTTP handlers)
│   ├── api/             # API endpoint handlers
│   ├── dependencies.py  # Dependency injection setup
│   └── handlers.py      # Custom handlers
├── config/              # Configuration layer
│   ├── db.py            # Database setup
│   ├── logging.py       # Logging configuration
│   ├── middleware.py    # Custom middleware
│   └── settings.py      # Environment settings
├── tests/               # Test suite
│   ├── conftest.py      # Pytest fixtures
│   ├── integration/     # Integration tests
│   └── unit/            # Unit tests
├── core/                # Core suite
│   └── exc.py/          # Customs exceptions
└── main.py              # Application entry point
```

---

## Domain Layer

### `domain/models.py`

The domain layer contains core business entities and models. These are database models using SQLAlchemy ORM.

```python
from datetime import date, datetime
from typing import List, Optional

import sqlalchemy as sa
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class BaseMixin:
    """Base fields for all models (id, timestamps)"""
    id: Mapped[int] = mapped_column(
        sa.Integer, primary_key=True, autoincrement=True
    )
    created_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=sa.func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        sa.DateTime(timezone=True), default=None,
        onupdate=sa.func.now(), nullable=True
    )


class Base(DeclarativeBase):
    """SQLAlchemy declarative base"""
    pass


class UserModel(BaseMixin, Base):
    """User entity"""
    __tablename__ = 'users'

    username: Mapped[str] = mapped_column(sa.String(100), nullable=False)
    email: Mapped[str] = mapped_column(
        sa.String(100), unique=True, index=True, nullable=False
    )
```

### `domain/repositories/user_repository.py`

Repository pattern for async data access. Encapsulates database queries and transaction handling.

```python
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserCreateDTO
from app.domain.models import UserModel


class UserRepository:
    """Async repository for User entity"""
    
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_id(self, id: int) -> UserModel | None:
        """Fetch user by ID"""
        return await self.session.scalar(
            select(UserModel).where(UserModel.id == id)
        )

    async def create(self, user: UserCreateDTO) -> UserModel:
        """Create new user with transaction handling"""
        try:
            db_user = UserModel(**user.model_dump())
            self.session.add(db_user)
            await self.session.commit()
            await self.session.refresh(db_user)
            return db_user
        except Exception as e:
            await self.session.rollback()
            raise e
```

Repository pattern for sync data access. Encapsulates database queries and transaction handling.

```python
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.application.dto.user import UserCreateDTO
from app.domain.models import UserModel


class UserRepository:
    """Async repository for User entity"""
    
    def __init__(self, session: Session):
        self.session = session

    def get_by_id(self, id: int) -> UserModel | None:
        """Fetch user by ID"""
        return self.session.scalar(
            select(UserModel).where(UserModel.id == id)
        )

    def create(self, user: UserCreateDTO) -> UserModel:
        """Create new user with transaction handling"""
        try:
            db_user = UserModel(**user.model_dump())
            self.session.add(db_user)
            self.session.commit()
            self.session.refresh(db_user)
            return db_user
        except Exception as e:
            self.session.rollback()
            raise e
```

---

## Core Layer

### `core/exc.py`

Define customs exceptions to use in use cases.

```python
class UnicornException(Exception):
    message: str

    def __init__(self, message: str):
        self.message = message

    def __str__(self):
        return f'{self.message}'

class ResourceConflict(UnicornException): ...
```

---

## Application Layer

### `application/dto/user.py`

Data Transfer Objects for request/response validation using Pydantic.

```python
from typing import List

from pydantic import BaseModel, EmailStr

from app.application.dto import BaseSchema


class UserCreateDTO(BaseModel):
    """DTO for creating a new user"""
    username: str
    email: EmailStr


class UserDTO(BaseSchema):
    """DTO for user response"""
    id: int
    username: str
    email: EmailStr
```

### `application/use_cases/user_registration.py`

Use-case pattern for business logic using async respository, but can be adapted to sync repository. Orchestrates repositories and returns DTOs.

```python
from app.application.dto.user import UserCreateDTO, UserDTO
from app.domain.repositories.user_repository import UserRepository


class UserRegistrationUseCase:
    """Use-case: Register or retrieve existing user from OAuth provider"""
    
    def __init__(self, user_repository: UserRepository):
        self.user_repository = user_repository

    async def execute(self, payload: UserCreateDTO) -> UserDTO:
        """
        Execute user registration:
        1. Check if has a user with this email
        2. If exists, return existing user
        3. If not, create new user
        4. Return user as DTO
        """
        # Check for existing user by email
        existing_user = await self.user_repository.get_by_email(
            payload.email
        )
        if existing_user:
            raise ResourceConflict("Email already in use by another user.")

        # Create new user from payload data
        user_data = UserCreateDTO(
            username=user.username,
            email=user.email,
        )

        created_user = await self.user_repository.create(user_data)
        return UserDTO.model_validate(created_user)
```

---

## Presentation Layer

### `presentation/dependencies.py`

Dependency injection setup using FastAPI's `Depends()` with Annotated type aliases and sqlalchemy async session.

```python
from typing import Annotated

from fastapi import Depends, Security
from sqlalchemy.ext.asyncio import AsyncSession

from app.application.dto.user import UserDTO
from app.config.db import get_session
from app.domain.repositories.user_repository import UserRepository



# Database session dependency
DbSession = Annotated[AsyncSession, Depends(get_session)]


# Repository factories
def get_user_repository(session: DbSession):
    return UserRepository(session)


# Type-aliased dependencies for easy injection
UserRepositoryDp = Annotated[
    UserRepository, Depends(get_user_repository)
]
```

Dependency injection setup using FastAPI's `Depends()` with Annotated type aliases and sqlalchemy sync session.

```python
from typing import Annotated

from fastapi import Depends, Security
from sqlalchemy.orm import Session

from app.application.dto.user import UserDTO
from app.config.db import get_session
from app.domain.repositories.user_repository import UserRepository



# Database session dependency
DbSession = Annotated[Session, Depends(get_session)]


# Repository factories
def get_user_repository(session: DbSession):
    return UserRepository(session)


# Type-aliased dependencies for easy injection
UserRepositoryDp = Annotated[
    UserRepository, Depends(get_user_repository)
]
```


### `presentation/api/user.py`

API endpoint handlers - lightweight adapters that call use-cases.

```python
from fastapi import APIRouter

from app.application.use_cases.get_user_by_id import GetUserByIdUseCase
from app.presentation.dependencies import UserRepositoryDp
from app.presentation.schemas.user import UserResponse

router = APIRouter(tags=['Users'])


@router.get('/users/{id}', response_model=UserResponse)
def get_user_by_id(id: int, user_repo: UserRepositoryDp):
    """
    Get user by id
    
    Dependencies injected:
    - user_repo: UserRepositoryDp - annotated user repository
    """
    use_case = GetUserByIdUseCase(user_repo)
    user = use_case.execute(id)
    return UserResponse(**user.model_dump())
```

---

## Configuration Layer

### `config/settings.py`

Environment settings using Pydantic Settings with `.env` file support.

```python
from typing import List, Literal

from pydantic import PostgresDsn, UrlConstraints
from pydantic_settings import BaseSettings, SettingsConfigDict

# Environment type
EnvType = Literal['PROD', 'DEV', 'TEST']

class AsyncpgDsn(PostgresDsn):
    """PostgreSQL async connection string"""
    _constraints = UrlConstraints(
        host_required=True,
        allowed_schemes=['postgresql+asyncpg'],
    )

    def to_sync(self) -> str:
        """Convert async DSN to synchronous"""
        return self.__str__().replace(
            'postgresql+asyncpg', 'postgresql'
        )


class Settings(BaseSettings):
    """Application settings from environment"""
    model_config = SettingsConfigDict(
        env_file='.env',
        env_ignore_empty=True,
        env_file_encoding='utf-8',
        extra='ignore',
    )

    LOG_LEVEL: str = 'INFO'
    LOG_FORMAT: str = '[%(asctime)s] |%(levelname)s| [%(filename)s] > %(request_id)s >> %(message)s'

    API_PREFIX: str = '/api'
    ENVIRONMENT: EnvType = 'DEV'

    CORS_ORIGINS: List[str] = [
        'http://127.0.0.1:3000',
        'http://127.0.0.1:8000',
    ]
    CORS_HEADERS: List[str] = ['X-Request-ID', 'Content-Type']
    CORS_METHODS: List[str] = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']

    DATABASE_URL: AsyncpgDsn
    DATABASE_ECHO: bool = False


envs = Settings()  # Singleton instance
```

### `config/db.py`

Async database connection and session factory setup. (adapt for sync session)

```python
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.config.settings import envs

# Create async engine
_async_engine = create_async_engine(
    envs.DATABASE_URL.__str__(),
    echo=envs.DATABASE_ECHO,
)

# Session factory
AsyncLocalSession = async_sessionmaker(
    _async_engine,
    autoflush=False,
    expire_on_commit=False
)


async def get_session():
    """
    Dependency for getting database session.
    Handles cleanup and rollback on errors.
    """
    async with AsyncLocalSession() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
```

### `config/logging.py`

Structured logging with request ID context propagation.

```python
import contextvars
import logging

from app.config.settings import envs

# Context variable to store request ID across async calls
request_id_ctx = contextvars.ContextVar('request_id', default=None)

# Application logger
logger = logging.getLogger('app')
logger.setLevel(envs.LOG_LEVEL)


class RequestIdFilter(logging.Filter):
    """Add request ID to log records for correlation"""
    def filter(self, record):
        if not hasattr(record, 'request_id'):
            record.request_id = request_id_ctx.get() or 'app'
        return True


log_formatter = logging.Formatter(
    envs.LOG_FORMAT, datefmt='%Y-%m-%dT%H:%M:%S%z'
)

# Console handler (disabled in TEST environment)
if envs.ENVIRONMENT != 'TEST':
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(log_formatter)
    console_handler.setLevel(envs.LOG_LEVEL)
    logger.addHandler(console_handler)

logger.addFilter(RequestIdFilter())
```

### `config/middleware.py`

HTTP middleware for request ID generation and logging.

```python
import logging
import uuid

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.config.logging import request_id_ctx


class HTTPLifecycleMiddleware(BaseHTTPMiddleware):
    """
    Middleware to:
    1. Generate unique request ID for each request
    2. Set it in context variable for logging
    3. Add it to response headers
    4. Log request and response
    """
    
    def __init__(self, app, dispatch=None) -> None:
        super().__init__(app, dispatch)
        self.logger = logging.getLogger('app')

    async def dispatch(self, request: Request, call_next):
        # Generate unique request ID
        request_id = str(uuid.uuid4())
        request_id_ctx.set(request_id)

        # Get client IP (handles X-Forwarded-For)
        client_ip = (
            request.headers.get('X-Forwarded-For', request.client.host)
            .split(',')[0]
            .strip()
        )

        # Log incoming request
        self.logger.info(
            f'[{client_ip}][{request.method}][{request.url}]'
        )

        try:
            response = await call_next(request)
            status_code = response.status_code
            
            # Log outgoing response
            self.logger.info(
                f'[{client_ip}][{request.method}][{request.url}][{status_code}]'
            )
        except Exception as err:
            self.logger.exception(
                f'{str(err)}\n', exc_info=err, stack_info=True
            )
            raise

        # Add request ID to response headers
        response.headers['X-Request-ID'] = request_id
        return response
```

---

## Tests

### `tests/conftest.py`

Pytest fixtures for testing with Testcontainers and dependency injection overrides.

```python
from datetime import datetime, timezone

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from testcontainers.postgres import PostgresContainer

from app.config.db import get_session
from app.domain.models import Base
from app.main import app as main_app


@pytest_asyncio.fixture(scope="session")
async def db_container():
    """
    Session-scoped fixture: Start PostgreSQL container for all tests
    """
    container = PostgresContainer("postgres:14", driver="asyncpg")
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture
async def async_engine(db_container: PostgresContainer):
    """
    Function-scoped fixture: Create fresh database for each test
    - Drops all tables
    - Creates all tables
    - Cleans up after test
    """
    db_url = db_container.get_connection_url().replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    async_engine = create_async_engine(db_url, echo=False)

    # Create all tables
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    yield async_engine
    
    # Cleanup
    await async_engine.dispose()


@pytest_asyncio.fixture
async def db_session(async_engine: AsyncEngine):
    """
    Function-scoped fixture: Database session with seed data
    - Inserts base test data
    - Yields session for test
    - Cleans up after test
    """
    SessionLocal = async_sessionmaker(
        bind=async_engine,
        expire_on_commit=False,
    )

    async with SessionLocal() as session:
        # Insert base test data
        session.add_all(base_data().values())
        await session.commit()
        yield session


@pytest_asyncio.fixture
async def async_client(async_engine: AsyncEngine):
    """
    Function-scoped fixture: HTTP client with overridden dependencies
    - Overrides get_session to use test database
    - Allows making requests to FastAPI app
    """
    SessionLocal = async_sessionmaker(
        bind=async_engine,
        expire_on_commit=False,
    )

    # Override database session dependency
    async def override_get_session():
        async with SessionLocal() as session:
            yield session

    main_app.dependency_overrides[get_session] = override_get_session

    # Create async HTTP client
    async with AsyncClient(
        app=main_app,
        base_url="http://test",
        transport=ASGITransport(app=main_app),
    ) as client:
        yield client
```

### `tests/integration/test_applications.py`

Integration tests using fixtures and HTTP client.

```python
from datetime import date

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.domain.models import ApplicationModel


async def test_create_user(
        async_client: AsyncClient, db_session: AsyncSession):
    """
    Integration test: Create new user
    
    Arrange: Prepare payload
    Act: POST to /users
    Assert: Verify 201 status and response data
    """
    # Arrange
    payload = {
        "username": "John Doe",
        "email": "john.doe@example.com"
    }

    # Act
    response = await async_client.post("/users", json=payload)

    # Assert: verify the response
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == payload["username"], \
        f"Expected {payload["username"]} but got {data["username"]}"
    assert data["email"] == payload["email"], \
        f"Expected {payload["email"]} but got {data["email"]}"
```

---

## Data Flow Example

Here's how a request flows through the architecture:

```
1. HTTP Request
   ↓
2. HTTPLifecycleMiddleware
   - Generates request_id
   - Sets request_id_ctx
   - Logs request
   ↓
3. API Handler (presentation/api/user.py)
   - get_user_by_id(id: int, user_repo: UserRepositoryDp)
   - FastAPI resolves dependencies
   ↓
4. Dependencies Resolution (presentation/dependencies.py)
   - get_user_repository()
   - Calls GetUserByIdUseCase
   ↓
5. Use-Case (application/use_cases/get_user_by_id.py)
   - execute(id: int)
   - Calls UserRepository methods
   ↓
6. Repository (domain/repositories/user_repository.py)
   - Query database via AsyncSession or Session
   - Handle transactions if needed
   ↓
7. Domain Model (domain/models.py)
   - Maps database row to UserModel in case of existing user manipulation
   ↓
8. DTO Conversion (application/dto/user.py)
   - UserDTO.model_validate(user_model)
   ↓
9. Response
   - Converts DTO schema to the api schema: UserDTO to UserResponse
   - Return UserResponse schema
   - Middleware adds X-Request-ID header
```

---

## Key Architectural Principles

### Clean Architecture / Hexagonal Architecture
- **Domain** layer contains pure business logic (no frameworks)
- **Application** layer orchestrates use-cases (no HTTP details)
- **Presentation** layer handles HTTP (thin adapters)
- **Configuration** layer glues everything together
- **Core** layer utilities (exceptions, http-only cookies, tokens encoding and decoding).

### Dependency Injection
- All dependencies are injected (easy to test and mock)
- Type-aliased Annotated dependencies for clarity
- Overridable in tests via `app.dependency_overrides`

### Async-First
- All I/O operations are async (database, HTTP)
- Context variables propagate request ID through async chain
- Proper resource cleanup with context managers

### Testing Strategy
- Testcontainers for ephemeral PostgreSQL
- Fixture-based setup for clean test isolation
- Dependency overrides for test-specific implementations
- AAA pattern (Arrange, Act, Assert) for readability
