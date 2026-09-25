"""Round-trip test for ``users.is_org_member`` -> ``is_org_member_old``
revision ``583226ca46bc`` (S10, KODI-029, Release C).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres — upgrade to the
revision, downgrade to its parent ``ba44f9cfd3c1``, upgrade again — seeding
``users`` rows before the upgrade and asserting the data after each step.

What the revision has to get right, and what is asserted here:

* two users seeded at the parent revision with ``is_org_member`` true and
  false;
* after upgrade: ``is_org_member_old`` holds the same value per user,
  ``is_org_member`` is absent, ``NOT NULL`` and the ``false`` default are
  kept (a new user inserted without the column gets ``false``, and the
  column still refuses NULL), and no other column or table is missing —
  only the one rename differs from the full column/table set before the
  upgrade;
* after downgrade to the parent: ``is_org_member`` is restored with the same
  values, ``is_org_member_old`` is gone, and the ``NOT NULL``/default are
  back;
* the second upgrade is identical to the first, schema and data
  (migration-tests.md 3).

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_discord_connections.py``, and for the
same reasons.

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

REVISION = '583226ca46bc'
PARENT_REVISION = 'ba44f9cfd3c1'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_retire_users_is_org_member.py'
)

TRUE_USER_ID = 7400000000000000001
FALSE_USER_ID = 7400000000000000002
NEW_USER_ID = 7400000000000000003


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
        async with engine.begin() as conn:
            with pytest.raises(IntegrityError):
                await conn.execute(sa.text(statement), params)
    finally:
        await engine.dispose()


def _apply_expect_integrity_error(
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
        'retire_is_org_member_migration_under_test', _MIGRATION_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------
# Schema inventory / seeding
# --------------------------------------------------------------------------


def _columns(url: str) -> set[tuple[str, str]]:
    return {
        (row['table_name'], row['column_name'])
        for row in _query(
            url,
            'SELECT table_name, column_name FROM information_schema.columns '
            "WHERE table_schema = 'public'",
        )
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


_USERS_COLUMN_DETAILS_SQL = (
    'SELECT column_name, udt_name, is_nullable, column_default '
    'FROM information_schema.columns '
    "WHERE table_schema = 'public' AND table_name = 'users' "
    "AND column_name = :column_name"
)


def _column_detail(url: str, column_name: str) -> dict[str, Any] | None:
    rows = _query(
        url, _USERS_COLUMN_DETAILS_SQL, {'column_name': column_name}
    )
    return rows[0] if rows else None


_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_org_member, '
    'created_at) '
    'VALUES (:id, :github_id, :username, :email, :years, :is_org_member, '
    ':now)'
)

_INSERT_USER_NO_ORG_MEMBER_COLUMN = (
    'INSERT INTO users (id, github_id, username, email, experience_years, '
    'created_at) VALUES (:id, :github_id, :username, :email, :years, :now)'
)


def _seed_users_at_parent(url: str) -> None:
    """Two users, ``is_org_member`` true and false, at ``ba44f9cfd3c1``."""
    now = datetime.now(timezone.utc)
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': TRUE_USER_ID,
                    'github_id': 94101,
                    'username': 'org_member',
                    'email': 'org.member@example.com',
                    'years': 4,
                    'is_org_member': True,
                    'now': now,
                },
            ),
            (
                _INSERT_USER,
                {
                    'id': FALSE_USER_ID,
                    'github_id': 94102,
                    'username': 'not_org_member',
                    'email': 'not.org.member@example.com',
                    'years': 2,
                    'is_org_member': False,
                    'now': now,
                },
            ),
        ],
    )


def _users_snapshot(url: str, org_member_column: str) -> list[dict[str, Any]]:
    """Every column, with the renamed one aliased back to a stable key so
    the two snapshots compare equal across the rename."""
    return _query(
        url,
        f'SELECT id, github_id, username, email, experience_years, '
        f'{org_member_column} AS org_member_value, created_at '
        'FROM users ORDER BY id',
    )


# --------------------------------------------------------------------------
# non-destructive-migrations.md — upgrade drops nothing, downgrade works
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing(migration_db: str) -> None:
    """Rule 2 at the source: ``op.drop_*`` never appears, this revision is
    rename-only."""
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)

    assert 'op.drop_column' not in upgrade_source
    assert 'op.drop_table' not in upgrade_source
    assert 'op.drop_column' not in downgrade_source
    assert 'op.drop_table' not in downgrade_source
    assert downgrade_source.strip() != 'def downgrade() -> None:\n    pass'
    assert 'pass' not in downgrade_source
    assert len(downgrade_source.splitlines()) > 1


def test_the_revision_is_a_new_child_at_head(migration_db: str) -> None:
    module = _load_migration_module()

    assert module.revision == REVISION, module.revision
    assert module.down_revision == PARENT_REVISION, module.down_revision


def test_upgrade_only_renames_is_org_member(migration_db: str) -> None:
    """No column or table is missing after upgrade — only the one rename
    differs from the full set before it."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)

    _upgrade(migration_db, REVISION)

    tables_after = _tables(migration_db)
    columns_after = _columns(migration_db)

    assert tables_after == tables_before
    expected_columns = (columns_before - {('users', 'is_org_member')}) | {
        ('users', 'is_org_member_old')
    }
    assert columns_after == expected_columns
    assert ('users', 'is_org_member') not in columns_after
    assert ('users', 'is_org_member_old') in columns_after


def test_upgrade_keeps_values_not_null_and_default(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    values = {
        row['id']: row['is_org_member_old']
        for row in _query(
            migration_db, 'SELECT id, is_org_member_old FROM users'
        )
    }
    assert values == {TRUE_USER_ID: True, FALSE_USER_ID: False}

    detail = _column_detail(migration_db, 'is_org_member_old')
    assert detail is not None
    assert detail['udt_name'] == 'bool'
    assert detail['is_nullable'] == 'NO'
    assert detail['column_default'] == 'false'

    # A user inserted without the column still gets the ``false`` default.
    _apply(
        migration_db,
        [
            (
                _INSERT_USER_NO_ORG_MEMBER_COLUMN,
                {
                    'id': NEW_USER_ID,
                    'github_id': 94103,
                    'username': 'default_org_member',
                    'email': 'default.org.member@example.com',
                    'years': 1,
                    'now': datetime.now(timezone.utc),
                },
            )
        ],
    )
    new_value = _query(
        migration_db,
        'SELECT is_org_member_old FROM users WHERE id = :id',
        {'id': NEW_USER_ID},
    )
    assert new_value == [{'is_org_member_old': False}]

    # NOT NULL still refused explicitly.
    _apply_expect_integrity_error(
        migration_db,
        'INSERT INTO users '
        '(id, github_id, username, email, experience_years, '
        'is_org_member_old, created_at) '
        'VALUES (:id, :github_id, :username, :email, :years, NULL, :now)',
        {
            'id': NEW_USER_ID + 1,
            'github_id': 94104,
            'username': 'null_org_member',
            'email': 'null.org.member@example.com',
            'years': 1,
            'now': datetime.now(timezone.utc),
        },
    )


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``ba44f9cfd3c1`` -> upgrade again.

    Data asserted after every step, as
    ``.claude/rules/migration-tests.md`` 3 requires.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)
    parent_users = _users_snapshot(migration_db, 'is_org_member')

    # -- 1. Upgrade: is_org_member_old holds the same values,
    #       is_org_member is absent, no column/table missing otherwise.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    first_upgrade_tables = _tables(migration_db)
    first_upgrade_users = _users_snapshot(migration_db, 'is_org_member_old')

    assert first_upgrade_tables == parent_tables
    assert ('users', 'is_org_member') not in first_upgrade_columns
    assert ('users', 'is_org_member_old') in first_upgrade_columns
    assert first_upgrade_columns == (
        parent_columns - {('users', 'is_org_member')}
        | {('users', 'is_org_member_old')}
    )
    assert first_upgrade_users == parent_users

    # -- 2. Downgrade: is_org_member restored with the same values,
    #       is_org_member_old gone, schema back to the parent's exactly.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert _query(
        migration_db, 'SELECT version_num FROM alembic_version'
    ) == [{'version_num': PARENT_REVISION}]
    downgraded_users = _users_snapshot(migration_db, 'is_org_member')
    assert downgraded_users == parent_users
    detail = _column_detail(migration_db, 'is_org_member')
    assert detail is not None
    assert detail['udt_name'] == 'bool'
    assert detail['is_nullable'] == 'NO'
    assert detail['column_default'] == 'false'

    # -- 3. Upgrade again: identical to the first upgrade, schema and data.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    assert _tables(migration_db) == first_upgrade_tables
    assert (
        _users_snapshot(migration_db, 'is_org_member_old')
        == first_upgrade_users
    )
    detail = _column_detail(migration_db, 'is_org_member_old')
    assert detail is not None
    assert detail['udt_name'] == 'bool'
    assert detail['is_nullable'] == 'NO'
    assert detail['column_default'] == 'false'


def test_orm_never_maps_is_org_member_or_its_old_column() -> None:
    """Rule 7: no ORM model maps either name (unchanged since Release B,
    KODI-026)."""
    from app.domain.models import UserModel

    mapped_columns = {c.name for c in UserModel.__table__.columns}
    assert 'is_org_member' not in mapped_columns
    assert 'is_org_member_old' not in mapped_columns
