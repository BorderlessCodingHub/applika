"""Round-trip test for the feature registry, the beta list and the admin
opt-outs, revision ``641001baff09`` (KODI-051, Release A of plan 0013).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``b28d5134631f``, upgrade again - seeding
an admin A and users B and C at the parent revision and asserting the data
after each step.

What is asserted here:

* the upgrade adds exactly the three tables, with every column, length,
  nullability, default and index the plan names; no table or column that
  existed before is missing (AC1, AC9, AC10);
* ``jobs`` / "Job board" is seeded once, in ``beta``, ``released_at`` NULL,
  with no beta-list row and no opt-out row (AC2, AC3);
* the constraints: one beta-list row and one opt-out per
  ``(feature, user)``, ``stage`` only ``beta`` / ``general``, one ``key``;
  deleting a user removes their own rows, deleting the admin who added a
  user nulls ``added_by`` and keeps the row, deleting a feature removes its
  rows;
* the downgrade renames the three tables to ``*_old``, every row kept, the
  original names gone, none of this revision's indexes left (AC5);
* the second upgrade renames everything back: rows, columns and index
  definitions equal the first upgrade's, ``jobs`` still once; a ``jobs`` row
  removed while rolled back is seeded again (AC8);
* ``upgrade()`` drops nothing and ``downgrade()`` is real (AC5, AC6);
* nothing in ``app/`` maps any of it (AC7, AC10).

Plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_job_board.py``.

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

REVISION = '641001baff09'
PARENT_REVISION = 'b28d5134631f'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT / 'migrations' / 'versions' / f'{REVISION}_feature_flags.py'
)

NEW_TABLES = ('features', 'feature_beta_users', 'feature_admin_opt_outs')
NEW_COLUMNS = {
    'features': {
        'id',
        'created_at',
        'updated_at',
        'key',
        'name',
        'description',
        'stage',
        'released_at',
    },
    'feature_beta_users': {
        'id',
        'created_at',
        'updated_at',
        'feature_id',
        'user_id',
        'added_by',
    },
    'feature_admin_opt_outs': {
        'id',
        'created_at',
        'updated_at',
        'feature_id',
        'user_id',
    },
}
# The indexes this revision builds with ``create_index`` (dropped on
# downgrade, rebuilt on re-upgrade). PKs and table-level UNIQUE constraints
# travel with the renamed tables instead.
CREATED_INDEXES = {
    'ix_feature_beta_users_user_id',
    'ix_feature_admin_opt_outs_user_id',
}
CONSTRAINTS = {
    'pk_features',
    'uq_features_key',
    'ck_features_stage',
    'pk_feature_beta_users',
    'fk_feature_beta_users_feature_id',
    'fk_feature_beta_users_user_id',
    'fk_feature_beta_users_added_by',
    'uq_feature_beta_users_feature_user',
    'pk_feature_admin_opt_outs',
    'fk_feature_admin_opt_outs_feature_id',
    'fk_feature_admin_opt_outs_user_id',
    'uq_feature_admin_opt_outs_feature_user',
}

ADMIN_A_ID = 7700000000000000001
USER_B_ID = 7700000000000000002
USER_C_ID = 7700000000000000003

BETA_B_ID = 7700000000000000101
BETA_C_ID = 7700000000000000102
OPT_OUT_A_ID = 7700000000000000201


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


def _refused(url: str, statement: str, params: dict[str, Any]) -> None:
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
        'feature_flags_migration_under_test', _MIGRATION_PATH
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


# --------------------------------------------------------------------------
# Schema inventory
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


def _column_shapes(url: str, table: str) -> dict[str, tuple[Any, ...]]:
    """column -> (data_type, max length, is_nullable, default)."""
    return {
        row['column_name']: (
            row['data_type'],
            row['character_maximum_length'],
            row['is_nullable'],
            row['column_default'],
        )
        for row in _query(
            url,
            'SELECT column_name, data_type, character_maximum_length, '
            'is_nullable, column_default FROM information_schema.columns '
            "WHERE table_schema = 'public' AND table_name = :table",
            {'table': table},
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


def _index_defs(url: str) -> dict[str, str]:
    """Every index in the schema, name -> definition."""
    return {
        row['indexname']: row['indexdef']
        for row in _query(
            url,
            'SELECT indexname, indexdef FROM pg_indexes '
            "WHERE schemaname = 'public'",
        )
    }


def _constraints(url: str, tables: set[str]) -> dict[str, str]:
    """name -> definition of every constraint on ``tables``."""
    return {
        row['conname']: row['def']
        for row in _query(
            url,
            'SELECT conname, pg_get_constraintdef(oid) AS def '
            'FROM pg_constraint '
            'WHERE conrelid::regclass::text = ANY(:tables)',
            {'tables': sorted(tables)},
        )
    }


def _rows(url: str, table: str) -> list[dict[str, Any]]:
    return _query(url, f'SELECT * FROM {table} ORDER BY id')


def _snapshot(url: str, suffix: str = '') -> dict[str, list[dict[str, Any]]]:
    return {table: _rows(url, f'{table}{suffix}') for table in NEW_TABLES}


def _jobs_id(url: str) -> int:
    rows = _query(url, "SELECT id FROM features WHERE key = 'jobs'")
    assert len(rows) == 1
    return rows[0]['id']


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_admin, '
    'created_at) '
    'VALUES (:id, :github_id, :username, :email, 2, :is_admin, :now)'
)

_INSERT_BETA = (
    'INSERT INTO feature_beta_users '
    '(id, feature_id, user_id, added_by, created_at) '
    'VALUES (:id, :feature_id, :user_id, :added_by, :now)'
)

_INSERT_OPT_OUT = (
    'INSERT INTO feature_admin_opt_outs '
    '(id, feature_id, user_id, created_at) '
    'VALUES (:id, :feature_id, :user_id, :now)'
)

_INSERT_FEATURE = (
    'INSERT INTO features (id, key, name, stage, created_at) '
    'VALUES (:id, :key, :name, :stage, :now)'
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seed_at_parent(url: str) -> None:
    """Admin A, users B and C, written at the parent revision."""
    now = _now()
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': user_id,
                    'github_id': github_id,
                    'username': username,
                    'email': f'{username}@example.com',
                    'is_admin': is_admin,
                    'now': now,
                },
            )
            for user_id, github_id, username, is_admin in (
                (ADMIN_A_ID, 97101, 'beta_admin_a', True),
                (USER_B_ID, 97102, 'beta_user_b', False),
                (USER_C_ID, 97103, 'beta_user_c', False),
            )
        ],
    )


def _upgraded(url: str) -> None:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url)
    _upgrade(url, REVISION)


def _beta(row_id: int, feature_id: int, user_id: int) -> dict[str, Any]:
    return {
        'id': row_id,
        'feature_id': feature_id,
        'user_id': user_id,
        'added_by': ADMIN_A_ID,
        'now': _now(),
    }


def _opt_out(row_id: int, feature_id: int, user_id: int) -> dict[str, Any]:
    return {
        'id': row_id,
        'feature_id': feature_id,
        'user_id': user_id,
        'now': _now(),
    }


def _write_feature_rows(url: str) -> int:
    """B and C on the ``jobs`` beta list (added by A), A's opt-out - as
    Release B's code would write them."""
    jobs = _jobs_id(url)
    _apply(
        url,
        [
            (_INSERT_BETA, _beta(BETA_B_ID, jobs, USER_B_ID)),
            (_INSERT_BETA, _beta(BETA_C_ID, jobs, USER_C_ID)),
            (_INSERT_OPT_OUT, _opt_out(OPT_OUT_A_ID, jobs, ADMIN_A_ID)),
        ],
    )
    return jobs


# --------------------------------------------------------------------------
# non-destructive-migrations.md 1, 2 - source inspection
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing() -> None:
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)
    whole_source = _MIGRATION_PATH.read_text()

    assert 'op.drop_column' not in whole_source
    assert 'op.drop_table' not in whole_source
    assert 'drop_index' not in upgrade_source
    assert 'pass' not in downgrade_source
    assert 'rename_table' in downgrade_source


def test_the_revision_is_a_new_child_at_head() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


# --------------------------------------------------------------------------
# AC1 / AC9 / AC10 - upgrade adds, nothing is missing
# --------------------------------------------------------------------------


def test_upgrade_adds_the_three_tables_and_nothing_is_missing(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)
    users_before = _rows(migration_db, 'users')

    _upgrade(migration_db, REVISION)

    expected_columns = {
        (table, column)
        for table, columns in NEW_COLUMNS.items()
        for column in columns
    }
    assert _tables(migration_db) == tables_before | set(NEW_TABLES)
    assert _columns(migration_db) == columns_before | expected_columns
    assert _rows(migration_db, 'users') == users_before

    features = _column_shapes(migration_db, 'features')
    assert features['id'][:3] == ('bigint', None, 'NO')
    assert features['id'][3] is None  # snowflake, no sequence
    assert features['key'] == ('character varying', 50, 'NO', None)
    assert features['name'] == ('character varying', 100, 'NO', None)
    assert features['description'] == ('character varying', 500, 'YES', None)
    assert features['stage'][:3] == ('character varying', 20, 'NO')
    assert features['stage'][3].startswith("'beta'")
    assert features['released_at'] == (
        'timestamp with time zone',
        None,
        'YES',
        None,
    )
    for table in NEW_TABLES:
        shapes = _column_shapes(migration_db, table)
        assert shapes['id'] == ('bigint', None, 'NO', None)
        assert shapes['created_at'][:3] == (
            'timestamp with time zone',
            None,
            'NO',
        )
        assert shapes['updated_at'][:3] == (
            'timestamp with time zone',
            None,
            'YES',
        )
    beta = _column_shapes(migration_db, 'feature_beta_users')
    assert beta['feature_id'][:3] == ('bigint', None, 'NO')
    assert beta['user_id'][:3] == ('bigint', None, 'NO')
    assert beta['added_by'][:3] == ('bigint', None, 'YES')
    opt_out = _column_shapes(migration_db, 'feature_admin_opt_outs')
    assert opt_out['feature_id'][:3] == ('bigint', None, 'NO')
    assert opt_out['user_id'][:3] == ('bigint', None, 'NO')

    index_defs = _index_defs(migration_db)
    assert index_defs['ix_feature_beta_users_user_id'].endswith(
        'ON public.feature_beta_users USING btree (user_id)'
    )
    assert index_defs['ix_feature_admin_opt_outs_user_id'].endswith(
        'ON public.feature_admin_opt_outs USING btree (user_id)'
    )

    constraints = _constraints(migration_db, set(NEW_TABLES))
    assert set(constraints) == CONSTRAINTS
    assert constraints['uq_features_key'] == 'UNIQUE (key)'
    assert constraints['uq_feature_beta_users_feature_user'] == (
        'UNIQUE (feature_id, user_id)'
    )
    assert constraints['uq_feature_admin_opt_outs_feature_user'] == (
        'UNIQUE (feature_id, user_id)'
    )
    assert "'beta'" in constraints['ck_features_stage']
    assert "'general'" in constraints['ck_features_stage']
    assert constraints['fk_feature_beta_users_feature_id'].endswith(
        'REFERENCES features(id) ON DELETE CASCADE'
    )
    assert constraints['fk_feature_beta_users_user_id'].endswith(
        'REFERENCES users(id) ON DELETE CASCADE'
    )
    assert constraints['fk_feature_beta_users_added_by'].endswith(
        'REFERENCES users(id) ON DELETE SET NULL'
    )
    assert constraints['fk_feature_admin_opt_outs_feature_id'].endswith(
        'REFERENCES features(id) ON DELETE CASCADE'
    )
    assert constraints['fk_feature_admin_opt_outs_user_id'].endswith(
        'REFERENCES users(id) ON DELETE CASCADE'
    )


# --------------------------------------------------------------------------
# AC2 / AC3 - "jobs" seeded in beta with an empty beta list
# --------------------------------------------------------------------------


def test_jobs_is_seeded_once_in_beta_with_an_empty_list(
    migration_db: str,
) -> None:
    _upgraded(migration_db)

    features = _rows(migration_db, 'features')
    assert len(features) == 1
    jobs = features[0]
    assert jobs['key'] == 'jobs'
    assert jobs['name'] == 'Job board'
    assert jobs['description'] == (
        'Remote job list, CV fit and keyword tailoring (PRD 0012)'
    )
    assert jobs['stage'] == 'beta'
    assert jobs['released_at'] is None
    assert jobs['created_at'] is not None
    assert jobs['id'] > 0
    assert _rows(migration_db, 'feature_beta_users') == []
    assert _rows(migration_db, 'feature_admin_opt_outs') == []


def test_stage_defaults_to_beta_and_description_is_optional(
    migration_db: str,
) -> None:
    """The next feature joins the list in beta without naming a stage."""
    _upgraded(migration_db)

    _apply(
        migration_db,
        [
            (
                'INSERT INTO features (id, key, name, created_at) '
                "VALUES (7700000000000000301, 'next', 'Next', now())",
                {},
            )
        ],
    )

    row = _query(
        migration_db,
        'SELECT stage, description, released_at FROM features '
        "WHERE key = 'next'",
    )
    assert row == [{'stage': 'beta', 'description': None, 'released_at': None}]


# --------------------------------------------------------------------------
# Constraints after upgrade
# --------------------------------------------------------------------------


def test_uniqueness_and_stage_check(migration_db: str) -> None:
    _upgraded(migration_db)
    jobs = _write_feature_rows(migration_db)

    # The same (feature, user) twice on the beta list.
    _refused(
        migration_db,
        _INSERT_BETA,
        _beta(7700000000000000110, jobs, USER_B_ID),
    )
    # The same (feature, admin) opt-out twice.
    _refused(
        migration_db,
        _INSERT_OPT_OUT,
        _opt_out(7700000000000000210, jobs, ADMIN_A_ID),
    )
    # A second "jobs".
    _refused(
        migration_db,
        _INSERT_FEATURE,
        {
            'id': 7700000000000000310,
            'key': 'jobs',
            'name': 'Again',
            'stage': 'beta',
            'now': _now(),
        },
    )
    # A stage outside beta/general.
    _refused(
        migration_db,
        _INSERT_FEATURE,
        {
            'id': 7700000000000000311,
            'key': 'alpha_one',
            'name': 'Alpha',
            'stage': 'alpha',
            'now': _now(),
        },
    )
    _refused(
        migration_db,
        "UPDATE features SET stage = 'alpha' WHERE key = 'jobs'",
        {},
    )

    # What the constraints do allow: general, another feature for the same
    # user, the same user on two lists, another admin's opt-out.
    _apply(
        migration_db,
        [
            (
                "UPDATE features SET stage = 'general', released_at = now() "
                "WHERE key = 'jobs'",
                {},
            ),
            (
                _INSERT_FEATURE,
                {
                    'id': 7700000000000000312,
                    'key': 'other',
                    'name': 'Other',
                    'stage': 'beta',
                    'now': _now(),
                },
            ),
            (
                _INSERT_BETA,
                _beta(7700000000000000111, 7700000000000000312, USER_B_ID),
            ),
            (
                _INSERT_OPT_OUT,
                _opt_out(7700000000000000211, 7700000000000000312, ADMIN_A_ID),
            ),
            (
                _INSERT_OPT_OUT,
                _opt_out(7700000000000000212, jobs, USER_C_ID),
            ),
        ],
    )
    assert len(_rows(migration_db, 'feature_beta_users')) == 3
    assert len(_rows(migration_db, 'feature_admin_opt_outs')) == 3


def test_cascades_and_set_null(migration_db: str) -> None:
    _upgraded(migration_db)
    _write_feature_rows(migration_db)

    # Deleting B removes B's list row only.
    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_B_ID})],
    )
    beta = _rows(migration_db, 'feature_beta_users')
    assert [(r['id'], r['user_id']) for r in beta] == [(BETA_C_ID, USER_C_ID)]
    assert beta[0]['added_by'] == ADMIN_A_ID

    # Deleting A keeps C's row with added_by NULL and removes A's opt-out.
    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': ADMIN_A_ID})],
    )
    beta = _rows(migration_db, 'feature_beta_users')
    assert [(r['id'], r['user_id'], r['added_by']) for r in beta] == [
        (BETA_C_ID, USER_C_ID, None)
    ]
    assert _rows(migration_db, 'feature_admin_opt_outs') == []


def test_deleting_a_feature_removes_its_list_and_opt_outs(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _write_feature_rows(migration_db)

    _apply(migration_db, [("DELETE FROM features WHERE key = 'jobs'", {})])

    assert _rows(migration_db, 'feature_beta_users') == []
    assert _rows(migration_db, 'feature_admin_opt_outs') == []
    assert len(_rows(migration_db, 'users')) == 3


# --------------------------------------------------------------------------
# Round trip - migration-tests.md 2, 3, 4
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_indexes = _index_defs(migration_db)
    parent_users = _rows(migration_db, 'users')

    # -- 1. Upgrade, then write a row into every new table.
    _upgrade(migration_db, REVISION)
    _write_feature_rows(migration_db)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)
    first_indexes = _index_defs(migration_db)
    first_constraints = _constraints(migration_db, set(NEW_TABLES))
    first_rows = _snapshot(migration_db)
    assert all(first_rows[table] for table in NEW_TABLES)

    # -- 2. Downgrade to the parent.
    _downgrade(migration_db, PARENT_REVISION)

    down_tables = _tables(migration_db)
    old_tables: set[str] = {f'{table}_old' for table in NEW_TABLES}
    assert down_tables == parent_tables | old_tables
    assert not set(NEW_TABLES) & down_tables
    assert _columns(migration_db) == parent_columns | {
        (f'{table}_old', column)
        for table, columns in NEW_COLUMNS.items()
        for column in columns
    }

    # Every row stays, in the *_old twins; users untouched.
    assert _snapshot(migration_db, '_old') == first_rows
    assert _rows(migration_db, 'users') == parent_users

    # No index this revision created remains; the parent's indexes are back
    # exactly, and the only extra ones are the PK/UNIQUE constraints the
    # *_old tables keep.
    down_indexes = _index_defs(migration_db)
    assert not CREATED_INDEXES & set(down_indexes)
    assert {
        name: d for name, d in down_indexes.items() if name in parent_indexes
    } == parent_indexes
    extra = set(down_indexes) - set(parent_indexes)
    constraint_indexes = {
        row['conname']
        for row in _query(
            migration_db,
            "SELECT conname FROM pg_constraint WHERE contype IN ('p', 'u') "
            'AND conrelid::regclass::text = ANY(:tables)',
            {'tables': sorted(old_tables)},
        )
    }
    assert extra == constraint_indexes
    # The constraints travelled with the tables (the FKs follow the rename
    # of ``features`` to ``features_old``).
    assert _constraints(migration_db, old_tables) == {
        name: d.replace('REFERENCES features(', 'REFERENCES features_old(')
        for name, d in first_constraints.items()
    }

    # -- 3. Upgrade again: names back, rows/indexes equal the first upgrade.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _index_defs(migration_db) == first_indexes
    assert _constraints(migration_db, set(NEW_TABLES)) == first_constraints
    assert _snapshot(migration_db) == first_rows
    assert _rows(migration_db, 'users') == parent_users
    jobs = _jobs_id(migration_db)

    # The constraints are live again on the re-adopted tables.
    _refused(
        migration_db,
        _INSERT_BETA,
        _beta(7700000000000000120, jobs, USER_C_ID),
    )


def test_reupgrade_seeds_jobs_again_when_it_went_missing(
    migration_db: str,
) -> None:
    """The seed runs on the re-adoption path too: a ``jobs`` row removed
    while rolled back comes back, once, in beta, with an empty list."""
    _upgraded(migration_db)
    _write_feature_rows(migration_db)
    _downgrade(migration_db, PARENT_REVISION)
    _apply(
        migration_db,
        [("DELETE FROM features_old WHERE key = 'jobs'", {})],
    )

    _upgrade(migration_db, REVISION)

    features = _rows(migration_db, 'features')
    assert [(f['key'], f['stage'], f['released_at']) for f in features] == [
        ('jobs', 'beta', None)
    ]
    assert _rows(migration_db, 'feature_beta_users') == []
    assert _rows(migration_db, 'feature_admin_opt_outs') == []


# --------------------------------------------------------------------------
# KODI-052 (Release B) maps the three tables, never an ``*_old`` twin, and
# the ``create_all`` test schema equals the migrated one
# --------------------------------------------------------------------------


def test_orm_maps_the_three_tables_and_no_old_object() -> None:
    """Release A mapped nothing (KODI-051); Release B (KODI-052) maps the
    three tables. No ``*_old`` object is ever mapped (rule 7)."""
    from app.domain.models import Base

    mapped_tables = set(Base.metadata.tables)
    for table in NEW_TABLES:
        assert table in mapped_tables
        assert f'{table}_old' not in mapped_tables


def _metadata_diffs(url: str) -> list[Any]:
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from app.domain.models import Base

    def compare(connection: sa.Connection) -> list[Any]:
        context = MigrationContext.configure(
            connection,
            opts={'compare_type': True, 'compare_server_default': True},
        )
        return list(compare_metadata(context, Base.metadata))

    async def run() -> list[Any]:
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(compare)
        finally:
            await engine.dispose()

    return _run(run())


def _touches(diff: Any, tables: tuple[str, ...]) -> bool:
    """Whether an autogenerate diff entry concerns one of ``tables``."""
    entries = diff if isinstance(diff, list) else [diff]
    for entry in entries:
        for part in entry:
            name = getattr(part, 'name', None)
            table = getattr(part, 'table', None)
            if name in tables or getattr(table, 'name', None) in tables:
                return True
            if isinstance(part, str) and part in tables:
                return True
    return False


def test_orm_mapping_equals_the_migrated_feature_tables(
    migration_db: str,
) -> None:
    """Autogenerate against a database at this revision finds nothing to
    change on the three tables."""
    _upgrade(migration_db, REVISION)

    diffs = [
        d for d in _metadata_diffs(migration_db) if _touches(d, NEW_TABLES)
    ]

    assert diffs == []


def _catalog(url: str) -> dict[str, set[tuple[str, str]]]:
    """Every constraint and index (name, definition) of the three tables,
    read from ``pg_catalog``."""
    constraints = _query(
        url,
        'SELECT c.conrelid::regclass::text AS tbl, c.conname AS name, '
        'pg_get_constraintdef(c.oid) AS def FROM pg_constraint c '
        'WHERE c.conrelid::regclass::text = ANY(:tables)',
        {'tables': list(NEW_TABLES)},
    )
    indexes = _query(
        url,
        'SELECT tablename AS tbl, indexname AS name, indexdef AS def '
        'FROM pg_indexes WHERE tablename = ANY(:tables)',
        {'tables': list(NEW_TABLES)},
    )
    return {
        'constraints': {
            (f'{r["tbl"]}.{r["name"]}', r['def']) for r in constraints
        },
        'indexes': {(r['name'], r['def']) for r in indexes},
    }


def test_create_all_builds_the_same_constraints_and_indexes(
    migration_db: str,
) -> None:
    """Names, FK targets and ``ondelete``, UNIQUE, CHECK, the PKs and the
    indexes, which autogenerate does not fully compare: ``create_all`` (the
    test schema) and this revision build them identically."""
    from app.domain.models import Base

    _upgrade(migration_db, REVISION)
    migrated = _catalog(migration_db)

    _apply(
        migration_db,
        [
            ('DROP SCHEMA public CASCADE', {}),
            ('CREATE SCHEMA public', {}),
        ],
    )

    async def create_all() -> None:
        engine = create_async_engine(migration_db, poolclass=NullPool)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        finally:
            await engine.dispose()

    _run(create_all())
    created = _catalog(migration_db)

    assert created == migrated
    assert migrated['constraints']
    assert migrated['indexes']
