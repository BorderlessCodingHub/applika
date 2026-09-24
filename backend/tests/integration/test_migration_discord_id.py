"""Round-trip test for the ``users.discord_id`` revision ``a7e5c2f19b4d``
(R-004, R-007 schema level, KODI-019, plan 0009 K1).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres — upgrade to the
revision, downgrade to its parent ``c1d9f4a7b3e6``, upgrade again —
seeding rows before the upgrade and asserting the data after each step.

What the revision has to get right, and what is asserted here:

* the column and index are purely additive: ``op.add_column`` /
  ``op.create_index`` only, nothing renamed and nothing dropped in
  ``upgrade()`` (non-destructive-migrations.md 2);
* every existing user row survives the upgrade intact, with
  ``discord_id`` NULL — many NULLs are accepted, since the unique index
  does not constrain NULLs in Postgres;
* two distinct non-null ids can both be stored (the unique index accepts
  them);
* a duplicate non-null id raises ``IntegrityError`` — a Discord account
  links to at most one Applika user at the schema level (AC1, R-004);
* no column or table goes missing after the upgrade — only the new column
  and index are added;
* ``downgrade()`` drops exactly the column and index this revision added,
  and nothing else — every user row and every other column is untouched
  (non-destructive-migrations.md 1, an empty/``pass`` downgrade is
  forbidden);
* the second upgrade is identical to the first, schema and data
  (migration-tests.md 3).

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is the same as
``tests/integration/test_migration_tailored_cv_base_snapshot.py``, and for
the same reasons.

Every user here is invented.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = 'a7e5c2f19b4d'
PARENT_REVISION = 'c1d9f4a7b3e6'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_add_discord_id_to_users.py'
)

USER_ONE_ID = 7400000000000000001
USER_TWO_ID = 7400000000000000002
USER_THREE_ID = 7400000000000000003


@pytest.fixture(autouse=True)
def reset_pk_sequences() -> None:
    """Neutralise the directory-wide autouse fixture (see the sibling
    tests)."""
    return None


# --------------------------------------------------------------------------
# Container / connection plumbing
# --------------------------------------------------------------------------


@pytest.fixture(scope='module')
def migration_container() -> Iterator[PostgresContainer]:
    container = PostgresContainer('postgres:16', driver='asyncpg')
    container.start()
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture
def migration_db(migration_container: PostgresContainer) -> str:
    url = migration_container.get_connection_url()
    _run(
        _execute(
            url,
            [
                ('DROP SCHEMA IF EXISTS public CASCADE', {}),
                ('CREATE SCHEMA public', {}),
            ],
        )
    )
    return url


def _run(coro: Any) -> Any:
    return asyncio.run(coro)


async def _execute(
    url: str, statements: list[tuple[str, dict[str, Any]]]
) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            for statement, params in statements:
                await conn.execute(sa.text(statement), params)
    finally:
        await engine.dispose()


async def _fetch(
    url: str, statement: str, params: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            result = await conn.execute(sa.text(statement), params or {})
            return [dict(row) for row in result.mappings().all()]
    finally:
        await engine.dispose()


def _query(
    url: str, statement: str, params: dict[str, Any] | None = None
) -> list[dict[str, Any]]:
    return _run(_fetch(url, statement, params))


def _apply(url: str, statements: list[tuple[str, dict[str, Any]]]) -> None:
    _run(_execute(url, statements))


async def _execute_expect_integrity_error(
    url: str, statement: str, params: dict[str, Any]
) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
                with pytest.raises(IntegrityError):
                    await conn.execute(sa.text(statement), params)
    finally:
        await engine.dispose()


def _assert_duplicate_raises(
    url: str, statement: str, params: dict[str, Any]
) -> None:
    _run(_execute_expect_integrity_error(url, statement, params))


# --------------------------------------------------------------------------
# Alembic plumbing
# --------------------------------------------------------------------------


@contextmanager
def _database_url(url: str) -> Iterator[None]:
    original = envs.DATABASE_URL
    envs.DATABASE_URL = url
    try:
        yield
    finally:
        envs.DATABASE_URL = original


def _alembic(url: str, action: Callable[..., None], target: str) -> None:
    config = Config(str(_ALEMBIC_INI))
    with _database_url(url):
        action(config, target)


def _upgrade(url: str, target: str) -> None:
    _alembic(url, command.upgrade, target)


def _downgrade(url: str, target: str) -> None:
    _alembic(url, command.downgrade, target)


def _load_migration_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        'discord_id_migration_under_test', _MIGRATION_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------
# Schema inventory / seeding
# --------------------------------------------------------------------------

_COLUMNS_SQL = (
    'SELECT table_name, column_name FROM information_schema.columns '
    "WHERE table_schema = 'public'"
)


def _columns(url: str) -> set[tuple[str, str]]:
    return {
        (row['table_name'], row['column_name'])
        for row in _query(url, _COLUMNS_SQL)
    }


def _tables(url: str) -> set[str]:
    return {
        row['table_name']
        for row in _query(
            url,
            'SELECT table_name FROM information_schema.tables '
            "WHERE table_schema = 'public'",
        )
    }


_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, created_at) '
    'VALUES (:id, :github_id, :username, :email, :years, :now)'
)


def _user_payload(
    user_id: int, github_id: int, username: str
) -> dict[str, Any]:
    return {
        'id': user_id,
        'github_id': github_id,
        'username': username,
        'email': f'{username}@example.com',
        'years': 5,
        'now': datetime.now(timezone.utc),
    }


def _seed_users_at_parent(url: str) -> None:
    """Two ordinary users, seeded before ``discord_id`` exists at all."""
    _apply(
        url,
        [
            (
                _INSERT_USER,
                _user_payload(USER_ONE_ID, 94101, 'discord_id_user_one'),
            ),
            (
                _INSERT_USER,
                _user_payload(USER_TWO_ID, 94102, 'discord_id_user_two'),
            ),
        ],
    )


def _discord_id_of(url: str, user_id: int) -> Any:
    rows = _query(
        url, 'SELECT discord_id FROM users WHERE id = :id', {'id': user_id}
    )
    assert len(rows) == 1, rows
    return rows[0]['discord_id']


def _indexes(url: str, table: str) -> set[str]:
    return {
        row['indexname']
        for row in _query(
            url,
            'SELECT indexname FROM pg_indexes WHERE tablename = :table',
            {'table': table},
        )
    }


# --------------------------------------------------------------------------
# non-destructive-migrations.md — upgrade drops nothing, downgrade works
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing(migration_db: str) -> None:
    """Rule 2 at the source: ``op.drop_*`` lives only in ``downgrade``."""
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)

    assert 'op.drop_column' not in upgrade_source
    assert 'op.drop_table' not in upgrade_source
    assert 'op.drop_index' not in upgrade_source
    assert 'op.drop_column' in inspect.getsource(module.downgrade)
    assert 'op.drop_index' in inspect.getsource(module.downgrade)
    assert 'pass' not in inspect.getsource(module.downgrade)


def test_the_revision_is_a_new_child_at_head(migration_db: str) -> None:
    module = _load_migration_module()

    assert module.revision == REVISION, module.revision
    assert module.down_revision == PARENT_REVISION, module.down_revision


def test_upgrade_adds_only_the_new_column(migration_db: str) -> None:
    """Nothing else in the schema moves - purely additive."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    assert after_columns - before_columns == {('users', 'discord_id')}, (
        after_columns - before_columns
    )
    assert before_columns - after_columns == set(), (
        before_columns - after_columns
    )
    assert _tables(migration_db) == before_tables


def test_the_new_column_is_bigint_nullable_no_default(
    migration_db: str,
) -> None:
    _upgrade(migration_db, REVISION)

    definition = _query(
        migration_db,
        'SELECT data_type, is_nullable, column_default '
        'FROM information_schema.columns '
        "WHERE table_name = 'users' AND column_name = 'discord_id'",
    )
    assert definition == [
        {'data_type': 'bigint', 'is_nullable': 'YES', 'column_default': None}
    ], definition


def test_the_unique_index_exists(migration_db: str) -> None:
    _upgrade(migration_db, REVISION)

    assert 'ix_users_discord_id' in _indexes(migration_db, 'users')


# --------------------------------------------------------------------------
# Existing rows, NULLs, uniqueness (AC1/AC2, R-004/R-007 schema level)
# --------------------------------------------------------------------------


def test_existing_user_rows_survive_with_null_discord_id(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    assert _discord_id_of(migration_db, USER_ONE_ID) is None
    assert _discord_id_of(migration_db, USER_TWO_ID) is None
    rows = _query(migration_db, 'SELECT id FROM users ORDER BY id')
    assert {row['id'] for row in rows} == {USER_ONE_ID, USER_TWO_ID}


def test_many_null_discord_ids_are_accepted(migration_db: str) -> None:
    """Postgres does not constrain NULLs under a unique index."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    _apply(
        migration_db,
        [
            (
                _INSERT_USER,
                _user_payload(USER_THREE_ID, 94103, 'discord_id_user_three'),
            )
        ],
    )

    assert _discord_id_of(migration_db, USER_ONE_ID) is None
    assert _discord_id_of(migration_db, USER_TWO_ID) is None
    assert _discord_id_of(migration_db, USER_THREE_ID) is None


def test_two_distinct_discord_ids_are_accepted(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    _apply(
        migration_db,
        [
            (
                'UPDATE users SET discord_id = :discord_id WHERE id = :id',
                {'discord_id': 555111, 'id': USER_ONE_ID},
            ),
            (
                'UPDATE users SET discord_id = :discord_id WHERE id = :id',
                {'discord_id': 555222, 'id': USER_TWO_ID},
            ),
        ],
    )

    assert _discord_id_of(migration_db, USER_ONE_ID) == 555111
    assert _discord_id_of(migration_db, USER_TWO_ID) == 555222


def test_a_duplicate_non_null_discord_id_raises_integrity_error(
    migration_db: str,
) -> None:
    """AC1 (R-004): a Discord account is linked to at most one Applika
    user, enforced at the schema level by ``ix_users_discord_id``."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    _apply(
        migration_db,
        [
            (
                'UPDATE users SET discord_id = :discord_id WHERE id = :id',
                {'discord_id': 999888, 'id': USER_ONE_ID},
            )
        ],
    )

    _assert_duplicate_raises(
        migration_db,
        'UPDATE users SET discord_id = :discord_id WHERE id = :id',
        {'discord_id': 999888, 'id': USER_TWO_ID},
    )
    # Neither user changed as a result of the refused write.
    assert _discord_id_of(migration_db, USER_ONE_ID) == 999888
    assert _discord_id_of(migration_db, USER_TWO_ID) is None


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``c1d9f4a7b3e6`` -> upgrade again.

    Data asserted after every step, as
    ``.claude/rules/migration-tests.md`` 3 requires.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)

    # -- 1. Upgrade: the column and index exist, no column or table missing.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    assert ('users', 'discord_id') in first_upgrade_columns
    assert 'ix_users_discord_id' in _indexes(migration_db, 'users')
    assert _discord_id_of(migration_db, USER_ONE_ID) is None
    assert _discord_id_of(migration_db, USER_TWO_ID) is None

    # -- 2. Downgrade: exactly the column and index this revision added
    #       disappear, nothing else does, and both users survive intact.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert 'ix_users_discord_id' not in _indexes(migration_db, 'users')
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    rows = {
        row['id']: row
        for row in _query(
            migration_db, 'SELECT id, username, email FROM users ORDER BY id'
        )
    }
    assert rows[USER_ONE_ID]['username'] == 'discord_id_user_one'
    assert rows[USER_TWO_ID]['username'] == 'discord_id_user_two'

    # -- 3. Upgrade again: identical to the first upgrade, schema and data.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    assert 'ix_users_discord_id' in _indexes(migration_db, 'users')
    assert _discord_id_of(migration_db, USER_ONE_ID) is None
    assert _discord_id_of(migration_db, USER_TWO_ID) is None


def test_no_orm_model_maps_discord_id_yet() -> None:
    """prod-release-runbook.md rule 4: Release A is migration only - the
    ORM does not map ``discord_id`` in this ticket (KODI-020/K2 does)."""
    from app.domain.models import UserModel

    mapped = {column.name for column in UserModel.__table__.columns}
    assert 'discord_id' not in mapped
