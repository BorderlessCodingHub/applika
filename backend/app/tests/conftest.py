from datetime import datetime, timezone

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from testcontainers.postgres import PostgresContainer

from app.config.db import get_session
from app.domain.models import Base
from app.main import app as main_app
from app.presentation.dependencies import get_current_user
from app.tests.base_db_setup import base_data


@pytest_asyncio.fixture(scope="session")
async def db_container():
    container = PostgresContainer('postgres:14', driver='asyncpg')
    container.start()
    yield container
    container.stop()


@pytest_asyncio.fixture
async def db_session(db_container):
    db_url = db_container.get_connection_url().replace(
        "postgresql://", "postgresql+asyncpg://"
    )
    async_engine = create_async_engine(db_url, echo=False, future=True)

    # Reset database tables before each test
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async_session_maker = async_sessionmaker(
        async_engine, autoflush=False, expire_on_commit=False
    )
    async with async_session_maker() as session:
        session.add_all(base_data.to_list())
        await session.commit()
        yield session


@pytest_asyncio.fixture
async def async_client(db_session: AsyncSession):
    """
    Async HTTP client for the FastAPI app, using the test DB session.
    """
    # Dependency override to inject the test session
    async def override_get_session():
        yield db_session

    main_app.dependency_overrides[get_session] = override_get_session

    async def override_get_current_user():
        # Mocked user DTO for authentication
        from app.application.dto.user import UserDTO
        return UserDTO(
            id=base_data.user.id,
            github_id=base_data.user.github_id,
            username=base_data.user.username,
            email=base_data.user.email,
            created_at=datetime.now(timezone.utc)
        )

    main_app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=main_app)
    async with AsyncClient(transport=transport,
                           base_url="http://test/api") as client:
        yield client

    main_app.dependency_overrides.clear()
