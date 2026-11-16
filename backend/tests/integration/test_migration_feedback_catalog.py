"""Round-trip test for revision ``11a92f3a9dc1`` (release C, ADR-0028,
ADR-0012 Delta 3): ``feedbacks_definition`` -> ``feedbacks_definition_old``.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres: upgrade to the
revision, downgrade to its parent ``0ee9f822e6d1``, upgrade again, seeding
rows at the parent and asserting the data after each step.

Seeded at the parent, next to the catalog rows the initial revision
inserts: two invented catalog rows, and an application whose
``feedback_id_old`` points at one of them through
``fk_applications_feedback_id_old``.

The plumbing (dedicated container, synchronous tests around
``asyncio.run``, ``envs.DATABASE_URL`` patched because ``migrations/env.py``
overwrites ``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_retire_github_discord.py``.

Every row here is invented; no request leaves the test.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timezone
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

REVISION = '11a92f3a9dc1'
PARENT_REVISION = '0ee9f822e6d1'

CATALOG = 'feedbacks_definition'
CATALOG_OLD = 'feedbacks_definition_old'
FK_NAME = 'fk_applications_feedback_id_old'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_feedback_catalog_contract.py'
)

USER_ID = 7600000000000000001
PLATFORM_ID = 7600000000000000101
APPLICATION_ID = 7600000000000000201
FEEDBACK_KEPT_ID = 7600000000000000301
FEEDBACK_OTHER_ID = 7600000000000000302
CREATED = datetime(2026, 11, 14, 9, 0, tzinfo=timezone.utc)


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
    _apply(
        url,
        [
            ('DROP SCHEMA IF EXISTS public CASCADE', {}),
            ('CREATE SCHEMA public', {}),
        ],
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
        'feedback_catalog_migration_under_test', _MIGRATION_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------
# Schema inventory / seeding / snapshots
# --------------------------------------------------------------------------


def _columns(url: str) -> set[tuple[str, str]]:
    return {
        (row['table_name'], row['column_name'])
        for row in _query(
            url,
            'SELECT c.table_name, c.column_name '
            'FROM information_schema.columns c '
            'JOIN information_schema.tables t '
            'ON t.table_schema = c.table_schema '
            'AND t.table_name = c.table_name '
            "WHERE c.table_schema = 'public' "
            "AND t.table_type = 'BASE TABLE'",
        )
    }


def _tables(url: str) -> set[str]:
    return {
        row['table_name']
        for row in _query(
            url,
            'SELECT table_name FROM information_schema.tables '
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE'",
        )
    }


def _renamed(name: str) -> str:
    return CATALOG_OLD if name == CATALOG else name


def _expected_after_upgrade(
    tables: set[str], columns: set[tuple[str, str]]
) -> tuple[set[str], set[tuple[str, str]]]:
    """The parent's inventory with only the one ``_old`` rename applied."""
    return (
        {_renamed(table) for table in tables},
        {(_renamed(table), column) for table, column in columns},
    )


def _catalog(url: str, table: str) -> list[dict[str, Any]]:
    return _query(
        url,
        f'SELECT id, name, color, created_at, updated_at FROM {table} '
        'ORDER BY id',
    )


def _application(url: str) -> dict[str, Any]:
    [row] = _query(
        url,
        'SELECT id, feedback_id_old, feedback_date_old FROM applications '
        'WHERE id = :id',
        {'id': APPLICATION_ID},
    )
    return row


def _fk_target(url: str) -> str | None:
    """The table ``fk_applications_feedback_id_old`` points at, by OID."""
    rows = _query(
        url,
        'SELECT confrelid::regclass::text AS target FROM pg_constraint '
        'WHERE conname = :name',
        {'name': FK_NAME},
    )
    return rows[0]['target'] if rows else None


def _pk_table(url: str) -> str | None:
    rows = _query(
        url,
        'SELECT conrelid::regclass::text AS target FROM pg_constraint '
        "WHERE conname = 'pk_feedbacks_definition'",
    )
    return rows[0]['target'] if rows else None


def _code_naming_the_catalog(url: str) -> list[dict[str, Any]]:
    """Functions (trigger bodies included) and views that name the table."""
    return _query(
        url,
        "SELECT 'function' AS kind, proname AS name FROM pg_proc p "
        'JOIN pg_namespace n ON n.oid = p.pronamespace '
        "WHERE n.nspname = 'public' AND p.prosrc ILIKE :pattern "
        "UNION ALL SELECT 'view', viewname FROM pg_views "
        "WHERE schemaname = 'public' AND definition ILIKE :pattern",
        {'pattern': f'%{CATALOG}%'},
    )


def _seed_at_parent(url: str) -> None:
    _apply(
        url,
        [
            (
                'INSERT INTO users '
                '(id, username, email, experience_years, is_admin, '
                'created_at) '
                "VALUES (:id, 'feedback-catalog', "
                "'feedback-catalog@example.test', 2, false, :now)",
                {'id': USER_ID, 'now': CREATED},
            ),
            (
                'INSERT INTO platforms (id, name, created_at) '
                "VALUES (:id, 'Invented Board', :now)",
                {'id': PLATFORM_ID, 'now': CREATED},
            ),
            (
                f'INSERT INTO {CATALOG} (id, name, color, created_at) '
                "VALUES (:kept, 'Invented kept', '#123456', :now), "
                "(:other, 'Invented other', '#654321', :now)",
                {
                    'kept': FEEDBACK_KEPT_ID,
                    'other': FEEDBACK_OTHER_ID,
                    'now': CREATED,
                },
            ),
            (
                'INSERT INTO applications '
                '(id, user_id, platform_id, application_date, role, mode, '
                'company_name, feedback_id_old, feedback_date_old, '
                'created_at) '
                'VALUES (:id, :user_id, :platform_id, :day, '
                "'Backend Engineer', 'active', 'Invented Co', :feedback, "
                ':day, :now)',
                {
                    'id': APPLICATION_ID,
                    'user_id': USER_ID,
                    'platform_id': PLATFORM_ID,
                    'day': date(2026, 11, 1),
                    'feedback': FEEDBACK_KEPT_ID,
                    'now': CREATED,
                },
            ),
        ],
    )


# --------------------------------------------------------------------------
# non-destructive-migrations.md at the source
# --------------------------------------------------------------------------


def test_source_drops_nothing_and_downgrade_is_real() -> None:
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)
    whole_source = _MIGRATION_PATH.read_text()

    assert 'op.drop_' not in whole_source
    for statement in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM'):
        assert statement not in whole_source.upper()
    assert 'pass' not in downgrade_source
    assert 'rename_table(CATALOG_OLD, CATALOG)' in downgrade_source
    assert 'rename_table(CATALOG, CATALOG_OLD)' in upgrade_source
    assert module.CATALOG_OLD == CATALOG_OLD


def test_the_revision_is_a_new_child_of_release_a() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_orm_maps_the_catalog_under_neither_name() -> None:
    """Rule 7: no model maps ``feedbacks_definition`` or its ``_old`` copy;
    the step catalog keeps its name and its model."""
    from app.domain import models

    mapped_tables = set(models.Base.metadata.tables)
    assert CATALOG not in mapped_tables
    assert CATALOG_OLD not in mapped_tables
    assert not hasattr(models, 'FeedbackDefinitionModel')
    assert 'steps_definition' in mapped_tables


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``0ee9f822e6d1`` -> upgrade again, data
    asserted after every step (migration-tests.md 3)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_catalog = _catalog(migration_db, CATALOG)
    parent_application = _application(migration_db)
    # The initial revision's rows plus the two invented ones.
    assert len(parent_catalog) > 2
    assert {FEEDBACK_KEPT_ID, FEEDBACK_OTHER_ID} <= {
        row['id'] for row in parent_catalog
    }
    assert _fk_target(migration_db) == CATALOG
    # No trigger, function or view at the parent names the table.
    assert _code_naming_the_catalog(migration_db) == []

    # -- 1. Upgrade: renamed with every row, the FK follows, nothing else
    #       missing.
    _upgrade(migration_db, REVISION)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)

    expected_tables, expected_columns = _expected_after_upgrade(
        parent_tables, parent_columns
    )
    assert first_tables == expected_tables
    assert first_columns == expected_columns
    assert CATALOG not in first_tables
    assert CATALOG_OLD in first_tables
    assert _catalog(migration_db, CATALOG_OLD) == parent_catalog
    assert _fk_target(migration_db) == CATALOG_OLD
    assert _pk_table(migration_db) == CATALOG_OLD
    assert _application(migration_db) == parent_application
    assert _code_naming_the_catalog(migration_db) == []
    # The FK still holds: a feedback id with no catalog row is refused.
    with pytest.raises(IntegrityError):
        _apply(
            migration_db,
            [
                (
                    'UPDATE applications SET feedback_id_old = 1 '
                    'WHERE id = :id',
                    {'id': APPLICATION_ID},
                )
            ],
        )
    first_catalog = _catalog(migration_db, CATALOG_OLD)

    # -- 2. Downgrade: the original name back with its rows and the FK.
    _downgrade(migration_db, PARENT_REVISION)

    assert _tables(migration_db) == parent_tables
    assert _columns(migration_db) == parent_columns
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _catalog(migration_db, CATALOG) == parent_catalog
    assert _fk_target(migration_db) == CATALOG
    assert _pk_table(migration_db) == CATALOG
    assert _application(migration_db) == parent_application

    # -- 3. Upgrade again: identical to the first upgrade.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _catalog(migration_db, CATALOG_OLD) == first_catalog
    assert _fk_target(migration_db) == CATALOG_OLD
    assert _application(migration_db) == parent_application


def test_with_both_names_present_the_guard_keeps_both(
    migration_db: str,
) -> None:
    """Re-adopt guard: an own downgrade, then ``feedbacks_definition``
    re-created next to a leftover ``_old`` copy. Upgrade keeps
    ``feedbacks_definition`` and leaves the ``_old`` copy and its rows
    untouched; so does the downgrade. Nothing is dropped."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    retired = _catalog(migration_db, CATALOG_OLD)
    _apply(
        migration_db,
        [
            (
                f'CREATE TABLE {CATALOG} (id BIGINT PRIMARY KEY, '
                'name VARCHAR(100) NOT NULL, color VARCHAR(7), '
                'created_at TIMESTAMPTZ NOT NULL, updated_at TIMESTAMPTZ)',
                {},
            ),
            (
                f'INSERT INTO {CATALOG} (id, name, color, created_at) '
                "VALUES (1, 'Re-created', '#000000', :now)",
                {'now': CREATED},
            ),
        ],
    )
    recreated = _catalog(migration_db, CATALOG)

    _downgrade(migration_db, PARENT_REVISION)
    assert _catalog(migration_db, CATALOG) == recreated
    assert _catalog(migration_db, CATALOG_OLD) == retired

    _upgrade(migration_db, REVISION)
    assert _catalog(migration_db, CATALOG) == recreated
    assert _catalog(migration_db, CATALOG_OLD) == retired
    assert _fk_target(migration_db) == CATALOG_OLD
