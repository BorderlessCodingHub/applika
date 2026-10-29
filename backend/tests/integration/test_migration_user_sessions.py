"""Round-trip test for the ``user_sessions`` table, revision
``ed39a0fad1e5`` (KODI-056, Release A of plan 0014).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``641001baff09``, upgrade again - seeding
users A and B at the parent revision and asserting the data after each step.

What is asserted here:

* the upgrade adds exactly ``user_sessions``, with every column, type,
  length and nullability the plan names, the four CHECKs, the FK with
  ``ON DELETE CASCADE`` and both indexes (the partial one with its
  ``WHERE``); no table or column that existed before is missing (AC1, AC6,
  AC7);
* an open ``web`` row and an ended ``revoked`` ``cli`` row are both kept -
  an ended device stays visible (AC1); a bad ``client_type``,
  ``sign_in_method`` or ``end_reason`` and an ``ended_at`` without an
  ``end_reason`` (or the reverse) are refused; deleting a user removes only
  that user's rows;
* the downgrade renames the table to ``user_sessions_old``, every row kept,
  ``user_sessions`` gone, neither index left (AC2);
* the second upgrade renames it back: rows, columns, constraints and index
  definitions equal the first upgrade's (AC5);
* ``upgrade()`` drops nothing and ``downgrade()`` is real (AC2, AC3);
* nothing in ``app/`` maps ``user_sessions_old`` (AC4, AC7); since
  KODI-057 ``UserSessionModel`` maps ``user_sessions`` and ``create_all``
  builds exactly the migrated table.

Plumbing is copied from ``tests/integration/test_migration_feature_flags.py``.

Every user here is invented.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
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

REVISION = 'ed39a0fad1e5'
PARENT_REVISION = '641001baff09'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT / 'migrations' / 'versions' / f'{REVISION}_user_sessions.py'
)

TABLE = 'user_sessions'
OLD_TABLE = 'user_sessions_old'

_TS = 'timestamp with time zone'
_VC = 'character varying'
# column -> (data_type, max length, is_nullable, default)
COLUMN_SHAPES: dict[str, tuple[Any, ...]] = {
    'id': ('bigint', None, 'NO', None),
    'created_at': (_TS, None, 'NO', None),
    'updated_at': (_TS, None, 'YES', None),
    'user_id': ('bigint', None, 'NO', None),
    'client_type': (_VC, 10, 'NO', None),
    'sign_in_method': (_VC, 20, 'NO', None),
    'device_name': (_VC, 100, 'NO', None),
    'user_agent': (_VC, 512, 'YES', None),
    'created_ip': (_VC, 45, 'YES', None),
    'last_ip': (_VC, 45, 'YES', None),
    'last_used_at': (_TS, None, 'YES', None),
    'expires_at': (_TS, None, 'NO', None),
    'ended_at': (_TS, None, 'YES', None),
    'end_reason': (_VC, 20, 'YES', None),
}
CREATED_INDEXES = {
    'ix_user_sessions_user_id_created_at',
    'ix_user_sessions_open',
}
CONSTRAINTS = {
    'pk_user_sessions',
    'fk_user_sessions_user_id',
    'ck_user_sessions_client_type',
    'ck_user_sessions_sign_in_method',
    'ck_user_sessions_end_reason',
    'ck_user_sessions_ended_pair',
}

USER_A_ID = 7800000000000000001
USER_B_ID = 7800000000000000002

SESSION_A_ID = 7800000000000000101
SESSION_B_ID = 7800000000000000102


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
) -> str:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            with pytest.raises(IntegrityError) as caught:
                await conn.execute(sa.text(statement), params)
            return str(caught.value)
    finally:
        await engine.dispose()


def _refused(url: str, statement: str, params: dict[str, Any]) -> str:
    """Run ``statement`` expecting an IntegrityError; return its text so a
    caller can check *which* constraint refused it."""
    return _run(_execute_expect_integrity_error(url, statement, params))


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
        'user_sessions_migration_under_test', _MIGRATION_PATH
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
    return {
        row['indexname']: row['indexdef']
        for row in _query(
            url,
            'SELECT indexname, indexdef FROM pg_indexes '
            "WHERE schemaname = 'public'",
        )
    }


def _constraints(url: str, table: str) -> dict[str, str]:
    return {
        row['conname']: row['def']
        for row in _query(
            url,
            'SELECT conname, pg_get_constraintdef(oid) AS def '
            'FROM pg_constraint WHERE conrelid::regclass::text = :table',
            {'table': table},
        )
    }


def _in_list_check(column: str, values: tuple[str, ...]) -> str:
    """``pg_get_constraintdef`` of ``column IN (values)`` on a varchar."""
    items = ', '.join(f"'{v}'::character varying" for v in values)
    return f'CHECK ((({column})::text = ANY ((ARRAY[{items}])::text[])))'


def _rows(url: str, table: str) -> list[dict[str, Any]]:
    return _query(url, f'SELECT * FROM {table} ORDER BY id')


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_admin, '
    'created_at) '
    'VALUES (:id, :github_id, :username, :email, 2, false, :now)'
)

_INSERT_SESSION = (
    'INSERT INTO user_sessions '
    '(id, created_at, user_id, client_type, sign_in_method, device_name, '
    'user_agent, created_ip, last_ip, last_used_at, expires_at, ended_at, '
    'end_reason) '
    'VALUES (:id, :created_at, :user_id, :client_type, :sign_in_method, '
    ':device_name, :user_agent, :created_ip, :last_ip, :last_used_at, '
    ':expires_at, :ended_at, :end_reason)'
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _seed_at_parent(url: str) -> None:
    """Users A and B, written at the parent revision."""
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
                    'now': now,
                },
            )
            for user_id, github_id, username in (
                (USER_A_ID, 98101, 'session_user_a'),
                (USER_B_ID, 98102, 'session_user_b'),
            )
        ],
    )


def _upgraded(url: str) -> None:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url)
    _upgrade(url, REVISION)


def _open_web(row_id: int, owner: int, **override: Any) -> dict[str, Any]:
    granted = _now() - timedelta(days=1)
    row = {
        'id': row_id,
        'created_at': granted,
        'user_id': owner,
        'client_type': 'web',
        'sign_in_method': 'github_web',
        'device_name': 'Firefox on Linux',
        'user_agent': 'Mozilla/5.0 (X11; Linux x86_64) Firefox/131.0',
        'created_ip': '203.0.113.7',
        'last_ip': '2001:db8::1',
        'last_used_at': granted + timedelta(hours=3),
        'expires_at': granted + timedelta(days=7),
        'ended_at': None,
        'end_reason': None,
    }
    row.update(override)
    return row


def _ended_cli(row_id: int, user_id: int) -> dict[str, Any]:
    granted = _now() - timedelta(days=2)
    return {
        'id': row_id,
        'created_at': granted,
        'user_id': user_id,
        'client_type': 'cli',
        'sign_in_method': 'cli_device',
        'device_name': 'applika-cli on build-box',
        'user_agent': None,
        'created_ip': None,
        'last_ip': None,
        'last_used_at': None,
        'expires_at': granted + timedelta(days=30),
        'ended_at': granted + timedelta(days=1),
        'end_reason': 'revoked',
    }


def _write_sessions(url: str) -> None:
    """An open web row for A and an ended ``revoked`` cli row for B - as
    Release B's code would write them."""
    _apply(
        url,
        [
            (_INSERT_SESSION, _open_web(SESSION_A_ID, USER_A_ID)),
            (_INSERT_SESSION, _ended_cli(SESSION_B_ID, USER_B_ID)),
        ],
    )


# --------------------------------------------------------------------------
# non-destructive-migrations.md 1, 2 - source inspection (AC2, AC3)
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


def test_the_revision_is_a_new_child_of_the_feature_flags_head() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


# --------------------------------------------------------------------------
# AC1 / AC6 / AC7 - upgrade adds one table, nothing is missing
# --------------------------------------------------------------------------


def test_upgrade_adds_user_sessions_and_nothing_is_missing(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)
    indexes_before = _index_defs(migration_db)
    users_before = _rows(migration_db, 'users')

    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == tables_before | {TABLE}
    assert _columns(migration_db) == columns_before | {
        (TABLE, column) for column in COLUMN_SHAPES
    }
    assert _rows(migration_db, 'users') == users_before
    # Every column with its type, length, nullability and no default (the
    # id is a snowflake with no sequence). No refresh value or hash of it.
    assert _column_shapes(migration_db, TABLE) == COLUMN_SHAPES

    index_defs = _index_defs(migration_db)
    assert set(index_defs) - set(indexes_before) == CREATED_INDEXES | {
        'pk_user_sessions'
    }
    assert {n: index_defs[n] for n in indexes_before} == indexes_before
    assert index_defs['ix_user_sessions_user_id_created_at'] == (
        'CREATE INDEX ix_user_sessions_user_id_created_at '
        'ON public.user_sessions USING btree (user_id, created_at DESC)'
    )
    assert index_defs['ix_user_sessions_open'] == (
        'CREATE INDEX ix_user_sessions_open ON public.user_sessions '
        'USING btree (user_id) WHERE (ended_at IS NULL)'
    )

    constraints = _constraints(migration_db, TABLE)
    assert set(constraints) == CONSTRAINTS
    assert constraints['pk_user_sessions'] == 'PRIMARY KEY (id)'
    assert constraints['fk_user_sessions_user_id'] == (
        'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
    )
    # Exact definitions: a value missing from, or added to, a list fails.
    for name, column, values in (
        ('ck_user_sessions_client_type', 'client_type', ('web', 'cli')),
        (
            'ck_user_sessions_sign_in_method',
            'sign_in_method',
            ('github_web', 'cli_browser', 'cli_device', 'cli_legacy'),
        ),
        (
            'ck_user_sessions_end_reason',
            'end_reason',
            ('logout', 'revoked', 'expired', 'github_revoked', 'replaced'),
        ),
    ):
        assert constraints[name] == _in_list_check(column, values)
    assert constraints['ck_user_sessions_ended_pair'] == (
        'CHECK (((ended_at IS NULL) = (end_reason IS NULL)))'
    )


# --------------------------------------------------------------------------
# AC1 - open and ended rows both kept; the CHECKs and the cascade
# --------------------------------------------------------------------------


def test_open_and_ended_sessions_are_both_kept(migration_db: str) -> None:
    _upgraded(migration_db)
    _write_sessions(migration_db)

    rows = _rows(migration_db, TABLE)
    assert [(r['id'], r['user_id'], r['end_reason']) for r in rows] == [
        (SESSION_A_ID, USER_A_ID, None),
        (SESSION_B_ID, USER_B_ID, 'revoked'),
    ]
    ended = rows[1]
    assert ended['ended_at'] is not None
    assert ended['client_type'] == 'cli'
    assert ended['device_name'] == 'applika-cli on build-box'
    opened = rows[0]
    assert opened['created_ip'] == '203.0.113.7'
    assert opened['last_ip'] == '2001:db8::1'
    assert opened['last_used_at'] is not None
    assert opened['ended_at'] is None


@pytest.mark.parametrize(
    ('override', 'constraint'),
    [
        ({'client_type': 'mobile'}, 'ck_user_sessions_client_type'),
        ({'sign_in_method': 'password'}, 'ck_user_sessions_sign_in_method'),
        (
            {'ended_at': datetime(2026, 10, 1, tzinfo=timezone.utc)},
            'ck_user_sessions_ended_pair',
        ),
        ({'end_reason': 'logout'}, 'ck_user_sessions_ended_pair'),
        (
            {
                'ended_at': datetime(2026, 10, 1, tzinfo=timezone.utc),
                'end_reason': 'stolen',
            },
            'ck_user_sessions_end_reason',
        ),
        ({'user_id': 7800000000000000999}, 'fk_user_sessions_user_id'),
        ({'device_name': None}, 'device_name'),
        ({'expires_at': None}, 'expires_at'),
    ],
)
def test_constraints_refuse_bad_rows(
    migration_db: str, override: dict[str, Any], constraint: str
) -> None:
    _upgraded(migration_db)

    error = _refused(
        migration_db,
        _INSERT_SESSION,
        _open_web(7800000000000000200, USER_A_ID, **override),
    )

    assert constraint in error
    assert _rows(migration_db, TABLE) == []


def test_every_allowed_value_is_accepted(migration_db: str) -> None:
    """The CHECK lists are not narrower than the plan: each client type,
    sign-in method and end reason is writable."""
    _upgraded(migration_db)
    ended = datetime(2026, 10, 1, tzinfo=timezone.utc)
    statements: list[tuple[str, dict[str, Any]]] = []
    row_id = 7800000000000000300
    for method, client in (
        ('github_web', 'web'),
        ('cli_browser', 'cli'),
        ('cli_device', 'cli'),
        ('cli_legacy', 'cli'),
    ):
        row_id += 1
        statements.append((
            _INSERT_SESSION,
            _open_web(
                row_id,
                USER_A_ID,
                client_type=client,
                sign_in_method=method,
            ),
        ))
    for reason in (
        'logout',
        'revoked',
        'expired',
        'github_revoked',
        'replaced',
    ):
        row_id += 1
        statements.append((
            _INSERT_SESSION,
            _open_web(row_id, USER_A_ID, ended_at=ended, end_reason=reason),
        ))
    _apply(migration_db, statements)

    assert len(_rows(migration_db, TABLE)) == 9


def test_deleting_a_user_removes_only_their_sessions(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _write_sessions(migration_db)

    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_B_ID})],
    )

    assert [r['id'] for r in _rows(migration_db, TABLE)] == [SESSION_A_ID]
    assert [r['id'] for r in _rows(migration_db, 'users')] == [USER_A_ID]


# --------------------------------------------------------------------------
# Round trip - migration-tests.md 2, 3, 4 (AC2, AC5, AC6)
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_indexes = _index_defs(migration_db)
    parent_users = _rows(migration_db, 'users')

    # -- 1. Upgrade, then write an open and an ended session.
    _upgrade(migration_db, REVISION)
    _write_sessions(migration_db)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)
    first_indexes = _index_defs(migration_db)
    first_constraints = _constraints(migration_db, TABLE)
    first_rows = _rows(migration_db, TABLE)
    assert len(first_rows) == 2

    # -- 2. Downgrade to the parent: renamed, never dropped.
    _downgrade(migration_db, PARENT_REVISION)

    down_tables = _tables(migration_db)
    assert down_tables == parent_tables | {OLD_TABLE}
    assert TABLE not in down_tables
    assert _columns(migration_db) == parent_columns | {
        (OLD_TABLE, column) for column in COLUMN_SHAPES
    }
    assert _rows(migration_db, OLD_TABLE) == first_rows
    assert _rows(migration_db, 'users') == parent_users

    # Neither created index remains; the parent's indexes are back exactly,
    # plus only the PK the renamed table keeps.
    down_indexes = _index_defs(migration_db)
    assert not CREATED_INDEXES & set(down_indexes)
    assert set(down_indexes) - set(parent_indexes) == {'pk_user_sessions'}
    assert {n: down_indexes[n] for n in parent_indexes} == parent_indexes
    # The constraints travelled with the table.
    assert _constraints(migration_db, OLD_TABLE) == first_constraints

    # -- 3. Upgrade again: the name is back, everything equals step 1.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _index_defs(migration_db) == first_indexes
    assert _constraints(migration_db, TABLE) == first_constraints
    assert _rows(migration_db, TABLE) == first_rows
    assert _rows(migration_db, 'users') == parent_users

    # The re-adopted table still enforces its CHECKs and its cascade.
    error = _refused(
        migration_db,
        _INSERT_SESSION,
        _open_web(7800000000000000400, USER_A_ID, client_type='tv'),
    )
    assert 'ck_user_sessions_client_type' in error
    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_A_ID})],
    )
    assert [r['id'] for r in _rows(migration_db, TABLE)] == [SESSION_B_ID]


def test_reupgrade_keeps_an_index_that_already_exists(
    migration_db: str,
) -> None:
    """T004: the indexes are created only when missing - a rolled-back
    table that still carries one of them is re-adopted without error."""
    _upgraded(migration_db)
    _write_sessions(migration_db)
    first_indexes = _index_defs(migration_db)
    _downgrade(migration_db, PARENT_REVISION)
    _apply(
        migration_db,
        [
            (
                'CREATE INDEX ix_user_sessions_open ON user_sessions_old '
                '(user_id) WHERE ended_at IS NULL',
                {},
            )
        ],
    )

    _upgrade(migration_db, REVISION)

    assert _index_defs(migration_db) == first_indexes
    assert len(_rows(migration_db, TABLE)) == 2


def test_a_second_round_trip_keeps_the_rows(migration_db: str) -> None:
    """Rollback and roll-forward twice: the history is never reset."""
    _upgraded(migration_db)
    _write_sessions(migration_db)
    first_rows = _rows(migration_db, TABLE)

    for _ in range(2):
        _downgrade(migration_db, PARENT_REVISION)
        _upgrade(migration_db, REVISION)

    assert _rows(migration_db, TABLE) == first_rows
    assert OLD_TABLE not in _tables(migration_db)


# --------------------------------------------------------------------------
# KODI-057 - the ORM maps the table (Release B), never its _old twin, and
# create_all builds exactly the migrated schema
# --------------------------------------------------------------------------


def test_orm_maps_the_table_but_never_its_old_twin() -> None:
    """KODI-056 (Release A) asserted nothing mapped ``user_sessions``;
    KODI-057 (Release B) maps it as ``UserSessionModel``. ``_old`` stays
    unmapped (non-destructive-migrations.md rule 7)."""
    from app.domain.models import Base

    mapped_tables = set(Base.metadata.tables)
    assert TABLE in mapped_tables
    assert OLD_TABLE not in mapped_tables


async def _create_all(url: str) -> None:
    from app.domain.models import Base

    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    finally:
        await engine.dispose()


def test_create_all_builds_the_migrated_user_sessions(
    migration_db: str,
) -> None:
    """``UserSessionModel.__table_args__`` mirror the migrated table name
    for name (revision ``ed39a0fad1e5``, its sign-in CHECK widened with
    ``borderless`` by ``d9e0b46dd7e1``): the tests' ``create_all`` schema
    equals the head one - columns, the four CHECKs, the FK and both
    indexes."""
    _upgrade(migration_db, 'head')
    migrated = (
        _column_shapes(migration_db, TABLE),
        _constraints(migration_db, TABLE),
        {
            name: definition
            for name, definition in _index_defs(migration_db).items()
            if name in CREATED_INDEXES | {'pk_user_sessions'}
        },
    )

    _apply(
        migration_db,
        [
            ('DROP SCHEMA IF EXISTS public CASCADE', {}),
            ('CREATE SCHEMA public', {}),
        ],
    )
    _run(_create_all(migration_db))
    built = (
        _column_shapes(migration_db, TABLE),
        _constraints(migration_db, TABLE),
        {
            name: definition
            for name, definition in _index_defs(migration_db).items()
            if name in CREATED_INDEXES | {'pk_user_sessions'}
        },
    )

    assert built == migrated
