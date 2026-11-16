"""Round-trip test for revision ``0ee9f822e6d1`` (release A of plan 0023,
ADR-0028): ``user_sessions.scope``, ``mcp`` / ``mcp_token`` in the CHECKs and
the scope pair CHECK ``ck_user_sessions_mcp_scope``.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``f823e8c34e01``, upgrade again - seeding
a web row and a cli row at the parent and asserting the data after each
step.

What is asserted here:

* the upgrade adds exactly ``user_sessions.scope`` (``VARCHAR(255) NULL``),
  NULL on the seeded rows; no table, no index; nothing that existed before
  is missing;
* an ``mcp`` / ``mcp_token`` row with a scope inserts; any space-separated
  scope names do (the set is open, no CHECK on values); ``mcp`` without a
  scope, ``web`` with a scope and an unknown client type are refused;
* the downgrade is refused, changing nothing, while an ``mcp`` row or a
  ``mcp_token`` row exists; without one it renames ``scope`` to
  ``scope_old`` and both CHECKs equal the parent's again, rows intact;
* the second upgrade re-adopts ``scope_old``: the schema equals the first
  upgrade's;
* nothing in ``app/`` maps ``scope``, ``scope_old``, ``mcp`` or
  ``mcp_token`` yet (release B ships the code).

Plumbing is copied from ``tests/integration/test_migration_user_sessions.py``
and ``tests/integration/test_migration_borderless_oidc.py``.

Every user, device and scope here is invented.
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

REVISION = '0ee9f822e6d1'
PARENT_REVISION = 'f823e8c34e01'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_mcp_sessions_expand.py'
)

TABLE = 'user_sessions'
SCOPE = 'scope'
SCOPE_OLD = 'scope_old'

CLIENT_TYPE_CHECK = 'ck_user_sessions_client_type'
SIGN_IN_CHECK = 'ck_user_sessions_sign_in_method'
MCP_SCOPE_CHECK = 'ck_user_sessions_mcp_scope'

PARENT_CLIENT_TYPES = ('web', 'cli')
CLIENT_TYPES = (*PARENT_CLIENT_TYPES, 'mcp')
PARENT_SIGN_IN_METHODS = (
    'github_web',
    'cli_browser',
    'cli_device',
    'cli_legacy',
    'borderless',
)
SIGN_IN_METHODS = (*PARENT_SIGN_IN_METHODS, 'mcp_token')
# ``pg_get_constraintdef`` of ``(client_type = 'mcp') = (scope IS NOT NULL)``.
MCP_SCOPE_DEF = (
    "CHECK ((((client_type)::text = 'mcp'::text) = (scope IS NOT NULL)))"
)
# column -> (data_type, max length, is_nullable, default)
SCOPE_SHAPE = ('character varying', 255, 'YES', None)

USER_ID = 7700000000000000001
WEB_SESSION_ID = 7700000000000000101
CLI_SESSION_ID = 7700000000000000102
MCP_SESSION_ID = 7700000000000000103
CREATED = datetime(2026, 11, 1, 9, 0, tzinfo=timezone.utc)


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


def _refused(url: str, statement: str, params: dict[str, Any]) -> str:
    """Run ``statement`` expecting an IntegrityError; return its text so a
    caller can check *which* constraint refused it."""
    with pytest.raises(IntegrityError) as caught:
        _apply(url, [(statement, params)])
    return str(caught.value)


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
        'mcp_sessions_migration_under_test', _MIGRATION_PATH
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


def _tables(url: str) -> set[str]:
    return {
        row['table_name']
        for row in _query(
            url,
            'SELECT table_name FROM information_schema.tables '
            "WHERE table_schema = 'public'",
        )
    }


def _shape(url: str, column: str) -> tuple[Any, ...]:
    rows = _query(
        url,
        'SELECT data_type, character_maximum_length, is_nullable, '
        'column_default FROM information_schema.columns '
        "WHERE table_schema = 'public' AND table_name = :table "
        'AND column_name = :column',
        {'table': TABLE, 'column': column},
    )
    assert len(rows) == 1, column
    row = rows[0]
    return (
        row['data_type'],
        row['character_maximum_length'],
        row['is_nullable'],
        row['column_default'],
    )


def _index_defs(url: str) -> dict[str, str]:
    return {
        row['indexname']: row['indexdef']
        for row in _query(
            url,
            'SELECT indexname, indexdef FROM pg_indexes '
            "WHERE schemaname = 'public'",
        )
    }


def _constraints(url: str) -> dict[str, str]:
    return {
        row['conname']: row['def']
        for row in _query(
            url,
            'SELECT conname, pg_get_constraintdef(oid) AS def '
            'FROM pg_constraint WHERE conrelid::regclass::text = :table',
            {'table': TABLE},
        )
    }


def _in_list_check(column: str, values: tuple[str, ...]) -> str:
    """``pg_get_constraintdef`` of ``column IN (values)`` on a varchar."""
    items = ', '.join(f"'{v}'::character varying" for v in values)
    return f'CHECK ((({column})::text = ANY ((ARRAY[{items}])::text[])))'


def _version(url: str) -> str:
    rows = _query(url, 'SELECT version_num FROM alembic_version')
    assert len(rows) == 1
    return rows[0]['version_num']


def _sessions(url: str) -> list[dict[str, Any]]:
    return _query(url, f'SELECT * FROM {TABLE} ORDER BY id')


def _snapshot(url: str) -> tuple[Any, ...]:
    """Everything a refused downgrade must leave as it was."""
    return (
        _tables(url),
        _columns(url),
        _constraints(url),
        _index_defs(url),
        _sessions(url),
        _version(url),
    )


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, username, email, experience_years, is_admin, created_at) '
    'VALUES (:id, :username, :email, 2, false, :created_at)'
)

_PARENT_INSERT_SESSION = (
    'INSERT INTO user_sessions '
    '(id, created_at, user_id, client_type, sign_in_method, device_name, '
    'expires_at) '
    'VALUES (:id, :created_at, :user_id, :client_type, :sign_in_method, '
    ':device_name, :expires_at)'
)

_INSERT_SESSION = (
    'INSERT INTO user_sessions '
    '(id, created_at, user_id, client_type, sign_in_method, device_name, '
    'expires_at, scope) '
    'VALUES (:id, :created_at, :user_id, :client_type, :sign_in_method, '
    ':device_name, :expires_at, :scope)'
)


def _session(
    row_id: int, client_type: str, sign_in_method: str, **override: Any
) -> dict[str, Any]:
    row = {
        'id': row_id,
        'created_at': CREATED,
        'user_id': USER_ID,
        'client_type': client_type,
        'sign_in_method': sign_in_method,
        'device_name': f'{client_type} device',
        'expires_at': CREATED + timedelta(days=30),
    }
    row.update(override)
    return row


def _mcp(row_id: int = MCP_SESSION_ID, **override: Any) -> dict[str, Any]:
    row = _session(
        row_id,
        'mcp',
        'mcp_token',
        device_name='Claude Desktop',
        scope='read write',
    )
    row.update(override)
    return row


def _seed_at_parent(url: str) -> None:
    """A user, an open web session and an open cli session, written at the
    parent revision (no ``scope`` column there)."""
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': USER_ID,
                    'username': 'mcp_scope_user',
                    'email': 'mcp.scope@example.com',
                    'created_at': CREATED,
                },
            ),
            (
                _PARENT_INSERT_SESSION,
                _session(WEB_SESSION_ID, 'web', 'borderless'),
            ),
            (
                _PARENT_INSERT_SESSION,
                _session(CLI_SESSION_ID, 'cli', 'cli_device'),
            ),
        ],
    )


def _at_parent(url: str) -> None:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url)


def _upgraded(url: str) -> None:
    _at_parent(url)
    _upgrade(url, REVISION)


def _with(rows: list[dict[str, Any]], column: str) -> list[dict[str, Any]]:
    """The parent's rows as they read once ``column`` exists, all NULL."""
    return [{**row, column: None} for row in rows]


# --------------------------------------------------------------------------
# non-destructive-migrations.md 1, 2 - source inspection
# --------------------------------------------------------------------------


def test_source_drops_nothing_and_downgrade_is_real() -> None:
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)
    whole_source = _MIGRATION_PATH.read_text()

    assert 'op.drop_column' not in whole_source
    assert 'op.drop_table' not in whole_source
    assert 'drop_index' not in whole_source
    assert 'pass' not in downgrade_source
    # The guard runs before any DDL.
    guard_at = downgrade_source.index('_refuse_if_mcp_was_used')
    assert guard_at < downgrade_source.index('op.drop_constraint')
    assert guard_at < downgrade_source.index('op.alter_column')
    assert 'SCOPE_OLD' in downgrade_source
    assert 'SCOPE_OLD' in upgrade_source


def test_the_revision_is_a_new_child_of_the_oidc_revision() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


# --------------------------------------------------------------------------
# Round trip - migration-tests.md 2, 3, 4
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_constraints = _constraints(migration_db)
    parent_indexes = _index_defs(migration_db)
    parent_rows = _sessions(migration_db)
    assert [r['id'] for r in parent_rows] == [WEB_SESSION_ID, CLI_SESSION_ID]
    assert parent_constraints[CLIENT_TYPE_CHECK] == _in_list_check(
        'client_type', PARENT_CLIENT_TYPES
    )
    assert parent_constraints[SIGN_IN_CHECK] == _in_list_check(
        'sign_in_method', PARENT_SIGN_IN_METHODS
    )
    assert MCP_SCOPE_CHECK not in parent_constraints

    # -- 1. Upgrade: one nullable column, two wider CHECKs, one new CHECK.
    _upgrade(migration_db, REVISION)

    assert _version(migration_db) == REVISION
    assert _tables(migration_db) == parent_tables
    # Nothing that existed is missing; only ``scope`` is new.
    assert _columns(migration_db) == parent_columns | {(TABLE, SCOPE)}
    assert _shape(migration_db, SCOPE) == SCOPE_SHAPE
    assert _sessions(migration_db) == _with(parent_rows, SCOPE)
    assert _index_defs(migration_db) == parent_indexes
    assert _constraints(migration_db) == {
        **parent_constraints,
        CLIENT_TYPE_CHECK: _in_list_check('client_type', CLIENT_TYPES),
        SIGN_IN_CHECK: _in_list_check('sign_in_method', SIGN_IN_METHODS),
        MCP_SCOPE_CHECK: MCP_SCOPE_DEF,
    }
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)
    first_constraints = _constraints(migration_db)
    first_indexes = _index_defs(migration_db)
    first_rows = _sessions(migration_db)

    # An MCP token with its scope set is writable.
    _apply(migration_db, [(_INSERT_SESSION, _mcp())])
    mcp_row = _sessions(migration_db)[-1]
    assert (mcp_row['client_type'], mcp_row['sign_in_method']) == (
        'mcp',
        'mcp_token',
    )
    assert mcp_row['scope'] == 'read write'

    # -- 2. Downgrade refused while the MCP row exists: nothing changes.
    before_refusal = _snapshot(migration_db)
    with pytest.raises(RuntimeError, match=f'Refusing to downgrade {REVISION}'):
        _downgrade(migration_db, PARENT_REVISION)
    assert _snapshot(migration_db) == before_refusal

    # -- 3. Without it, the downgrade renames ``scope`` to ``scope_old``.
    _apply(
        migration_db,
        [
            (
                f'DELETE FROM {TABLE} WHERE id = :id',
                {'id': MCP_SESSION_ID},
            )
        ],
    )
    _downgrade(migration_db, PARENT_REVISION)

    assert _version(migration_db) == PARENT_REVISION
    assert _tables(migration_db) == parent_tables
    down_columns = _columns(migration_db)
    assert (TABLE, SCOPE) not in down_columns
    assert down_columns == parent_columns | {(TABLE, SCOPE_OLD)}
    assert _shape(migration_db, SCOPE_OLD) == SCOPE_SHAPE
    # Both CHECKs equal the parent's; the pair CHECK is gone.
    assert _constraints(migration_db) == parent_constraints
    assert _index_defs(migration_db) == parent_indexes
    assert _sessions(migration_db) == _with(parent_rows, SCOPE_OLD)
    # The parent's lists are enforced again.
    error = _refused(
        migration_db,
        _PARENT_INSERT_SESSION,
        _session(MCP_SESSION_ID, 'mcp', 'cli_device'),
    )
    assert CLIENT_TYPE_CHECK in error
    error = _refused(
        migration_db,
        _PARENT_INSERT_SESSION,
        _session(MCP_SESSION_ID, 'web', 'mcp_token'),
    )
    assert SIGN_IN_CHECK in error

    # -- 4. Upgrade again: ``scope_old`` re-adopted, equal to step 1.
    _upgrade(migration_db, REVISION)

    assert _version(migration_db) == REVISION
    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert (TABLE, SCOPE_OLD) not in _columns(migration_db)
    assert _shape(migration_db, SCOPE) == SCOPE_SHAPE
    assert _constraints(migration_db) == first_constraints
    assert _index_defs(migration_db) == first_indexes
    assert _sessions(migration_db) == first_rows

    # The re-adopted column takes an MCP token again.
    _apply(migration_db, [(_INSERT_SESSION, _mcp())])
    assert _sessions(migration_db)[-1]['scope'] == 'read write'


def test_a_second_round_trip_keeps_the_rows(migration_db: str) -> None:
    """Rollback and roll-forward twice: the rows are never reset."""
    _upgraded(migration_db)
    first_rows = _sessions(migration_db)
    first_constraints = _constraints(migration_db)

    for _ in range(2):
        _downgrade(migration_db, PARENT_REVISION)
        _upgrade(migration_db, REVISION)

    assert _sessions(migration_db) == first_rows
    assert _constraints(migration_db) == first_constraints
    assert (TABLE, SCOPE_OLD) not in _columns(migration_db)


# --------------------------------------------------------------------------
# The CHECKs on the upgraded schema
# --------------------------------------------------------------------------


@pytest.mark.parametrize(
    ('row', 'constraint'),
    [
        (_mcp(scope=None), MCP_SCOPE_CHECK),
        (
            _session(MCP_SESSION_ID, 'web', 'borderless', scope='read'),
            MCP_SCOPE_CHECK,
        ),
        (
            _session(MCP_SESSION_ID, 'cli', 'cli_device', scope='read'),
            MCP_SCOPE_CHECK,
        ),
        (
            _session(MCP_SESSION_ID, 'x', 'mcp_token', scope=None),
            CLIENT_TYPE_CHECK,
        ),
        (_mcp(sign_in_method='api_key'), SIGN_IN_CHECK),
    ],
    ids=[
        'mcp-without-scope',
        'web-with-scope',
        'cli-with-scope',
        'unknown-client-type',
        'unknown-sign-in-method',
    ],
)
def test_the_checks_refuse_bad_rows(
    migration_db: str, row: dict[str, Any], constraint: str
) -> None:
    _upgraded(migration_db)
    before = _sessions(migration_db)

    error = _refused(migration_db, _INSERT_SESSION, row)

    assert constraint in error
    assert _sessions(migration_db) == before


def test_the_scope_set_is_open(migration_db: str) -> None:
    """ADR-0028: no CHECK on scope values. A scope name no code knows yet
    is stored as written, next to the earlier tokens, which keep theirs."""
    _upgraded(migration_db)
    scopes = {
        MCP_SESSION_ID: 'read',
        MCP_SESSION_ID + 1: 'read write',
        MCP_SESSION_ID + 2: 'read write applications:archive',
    }
    for row_id, scope in scopes.items():
        _apply(migration_db, [(_INSERT_SESSION, _mcp(row_id, scope=scope))])

    stored = {
        row['id']: row['scope']
        for row in _sessions(migration_db)
        if row['client_type'] == 'mcp'
    }
    assert stored == scopes
    # The web and cli rows still carry no scope.
    assert {
        row['id']: row['scope']
        for row in _sessions(migration_db)
        if row['client_type'] != 'mcp'
    } == {WEB_SESSION_ID: None, CLI_SESSION_ID: None}


# --------------------------------------------------------------------------
# The downgrade guard
# --------------------------------------------------------------------------


def test_downgrade_refused_for_a_web_row_signed_in_by_mcp_token(
    migration_db: str,
) -> None:
    """The CHECKs do not pair ``client_type`` with ``sign_in_method``: a
    ``web`` / ``mcp_token`` row (NULL scope) is valid after the upgrade,
    and the parent's sign-in CHECK cannot hold it. The guard refuses
    before any DDL runs."""
    _upgraded(migration_db)
    _apply(
        migration_db,
        [
            (
                _INSERT_SESSION,
                _session(MCP_SESSION_ID, 'web', 'mcp_token', scope=None),
            )
        ],
    )
    before_refusal = _snapshot(migration_db)

    with pytest.raises(RuntimeError, match="sign_in_method 'mcp_token'"):
        _downgrade(migration_db, PARENT_REVISION)

    assert _snapshot(migration_db) == before_refusal
    assert _version(migration_db) == REVISION


def test_deleting_the_user_removes_their_mcp_tokens(migration_db: str) -> None:
    """Tenancy: the ``user_id`` FK keeps ``ON DELETE CASCADE``."""
    _upgraded(migration_db)
    _apply(migration_db, [(_INSERT_SESSION, _mcp())])

    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_ID})],
    )

    assert _sessions(migration_db) == []
    assert _constraints(migration_db)['fk_user_sessions_user_id'] == (
        'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
    )


# --------------------------------------------------------------------------
# Release B maps the new objects (prod-release-runbook.md 4,
# non-destructive-migrations.md 7)
# --------------------------------------------------------------------------


def test_the_orm_maps_scope_and_the_mcp_checks_as_the_migration_names_them() -> (
    None
):
    """Release A shipped the schema only; release B maps it.
    ``UserSessionModel`` maps ``scope`` (never ``scope_old``) and carries
    the three CHECKs with the exact names and text this revision creates,
    so ``create_all`` builds the migrated schema
    (``test_migration_user_sessions.py`` compares the two at head)."""
    from app.domain.models import Base

    module = _load_migration_module()
    table = Base.metadata.tables[TABLE]
    assert SCOPE in table.columns
    assert table.columns[SCOPE].nullable is True
    assert table.columns[SCOPE].type.length == 255
    assert SCOPE_OLD not in table.columns
    assert not any(
        column.name.endswith('_old')
        for mapped in Base.metadata.tables.values()
        for column in mapped.columns
    )
    checks = {
        constraint.name: str(constraint.sqltext)
        for constraint in table.constraints
        if isinstance(constraint, sa.CheckConstraint)
    }
    assert checks[CLIENT_TYPE_CHECK] == module.CLIENT_TYPES
    assert checks[SIGN_IN_CHECK] == module.SIGN_IN_METHODS
    assert checks[MCP_SCOPE_CHECK] == module.MCP_SCOPE
