import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest_asyncio.fixture(autouse=True)
async def reset_pk_sequences(db_session: AsyncSession):
    """Reset PostgreSQL PK sequences after base_data inserts explicit IDs.

    When fixtures seed rows with explicit IDs (e.g. CompanyModel(id=1)),
    the sequence is not advanced. The next auto-generated INSERT would try
    to reuse id=1 and hit a unique constraint violation. This fixture
    resets every sequence to MAX(id) of its table so auto-increments work.
    """
    tables = ['users', 'companies', 'platforms', 'feedbacks_definition',
              'steps_definition', 'applications', 'application_steps']
    for table in tables:
        await db_session.execute(text(
            f"SELECT setval(pg_get_serial_sequence('{table}', 'id'), "
            f"GREATEST(COALESCE((SELECT MAX(id) FROM {table}), 1), 1))"
        ))
    await db_session.commit()
