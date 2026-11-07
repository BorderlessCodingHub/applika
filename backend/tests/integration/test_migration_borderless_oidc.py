"""Round-trip test for revision ``f823e8c34e01`` (ADR-0026 §6, §9): the
Borderless refresh token column, the access token columns retired to
``_old``, and ``borderless_revoked`` on ``ck_user_sessions_end_reason``.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``4d3bbb20127f``, upgrade again - seeding
rows at the parent and asserting the data after each step.

Seeded at the parent: a user, a password-era binding (an encrypted access
token and its expiry) and a web session ended ``logout``. Written after the
first upgrade, as the OpenID Connect code writes them: a second user bound
with a refresh token only, and a web session ended ``borderless_revoked``.

The plumbing (dedicated container, synchronous tests around
``asyncio.run``, ``envs.DATABASE_URL`` patched because ``migrations/env.py``
overwrites ``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_retire_github_discord.py``.

Every user, token and address here is invented.
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

REVISION = 'f823e8c34e01'
PARENT_REVISION = '4d3bbb20127f'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_borderless_oidc_refresh_token.py'
)

PASSWORD_USER_ID = 7600000000000000001
OIDC_USER_ID = 7600000000000000002
PASSWORD_ACCOUNT_ID = 7600000000000000101
OIDC_ACCOUNT_ID = 7600000000000000102
LOGOUT_SESSION_ID = 7600000000000000201
REVOKED_SESSION_ID = 7600000000000000202

CREATED = datetime(2026, 10, 30, 8, 15, tzinfo=timezone.utc)
LINKED_PASSWORD = datetime(2026, 10, 31, 9, 0, tzinfo=timezone.utc)
LINKED_OIDC = datetime(2026, 11, 6, 10, 30, tzinfo=timezone.utc)
ACCESS_EXPIRES = datetime(2026, 11, 7, 9, 0, tzinfo=timezone.utc)
ENDED = datetime(2026, 11, 1, 12, 0, tzinfo=timezone.utc)

PASSWORD_ACCESS_TOKEN = 'gAAAA-password-era-access-token'
OIDC_REFRESH_TOKEN = 'gAAAA-oidc-era-refresh-token'

RENAMED_COLUMNS = {
    ('borderless_accounts', 'encrypted_access_token'): (
        'borderless_accounts',
        'encrypted_access_token_old',
    ),
    ('borderless_accounts', 'access_token_expires_at'): (
        'borderless_accounts',
        'access_token_expires_at_old',
    ),
}
ADDED_COLUMN = ('borderless_accounts', 'encrypted_refresh_token')
ADDED_COLUMN_OLD = ('borderless_accounts', 'encrypted_refresh_token_old')

PARENT_REASONS = ('logout', 'revoked', 'expired', 'github_revoked', 'replaced')
NEW_REASONS = (*PARENT_REASONS, 'borderless_revoked')

_TS = 'timestamp with time zone'


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


def _refused(url: str, statement: str, params: dict[str, Any]) -> None:
    """The statement is refused by the database and writes nothing."""
    with pytest.raises(IntegrityError):
        _apply(url, [(statement, params)])


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
        'borderless_oidc_migration_under_test', _MIGRATION_PATH
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


def _shape(url: str, column: str) -> tuple[Any, ...]:
    """``(data_type, is_nullable)`` of one ``borderless_accounts`` column."""
    rows = _query(
        url,
        'SELECT data_type, is_nullable FROM information_schema.columns '
        "WHERE table_schema = 'public' AND table_name = 'borderless_accounts' "
        'AND column_name = :column',
        {'column': column},
    )
    assert len(rows) == 1, column
    return (rows[0]['data_type'], rows[0]['is_nullable'])


def _end_reason_check(url: str) -> str:
    rows = _query(
        url,
        'SELECT pg_get_constraintdef(oid) AS definition '
        'FROM pg_constraint '
        "WHERE conname = 'ck_user_sessions_end_reason'",
    )
    assert len(rows) == 1
    return rows[0]['definition']


def _in_list_check(column: str, values: tuple[str, ...]) -> str:
    """``pg_get_constraintdef`` of ``column IN (values)`` on a varchar."""
    items = ', '.join(f"'{v}'::character varying" for v in values)
    return f'CHECK ((({column})::text = ANY ((ARRAY[{items}])::text[])))'


def _expected_after_upgrade(
    columns: set[tuple[str, str]],
) -> set[tuple[str, str]]:
    """The parent's columns with only the two ``_old`` renames applied,
    plus the refresh token column."""
    return {RENAMED_COLUMNS.get(column, column) for column in columns} | {
        ADDED_COLUMN
    }


# --------------------------------------------------------------------------
# Seeding and snapshots
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, username, email, experience_years, is_admin, created_at) '
    'VALUES (:id, :username, :email, 2, false, :created_at)'
)

_INSERT_SESSION = (
    'INSERT INTO user_sessions '
    '(id, created_at, user_id, client_type, sign_in_method, device_name, '
    'expires_at, ended_at, end_reason) '
    "VALUES (:id, :created_at, :user_id, 'web', 'borderless', "
    "'Firefox on Linux', :expires_at, :ended_at, :end_reason)"
)


def _seed_at_parent(url: str) -> None:
    """A user, a password-era binding and a session ended ``logout``."""
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': PASSWORD_USER_ID,
                    'username': 'password_era_user',
                    'email': 'password.era@example.com',
                    'created_at': CREATED,
                },
            ),
            (
                'INSERT INTO borderless_accounts '
                '(id, created_at, user_id, borderless_user_id, email, '
                'encrypted_access_token, access_token_expires_at, status, '
                'linked_at, profile_read_at) '
                'VALUES (:id, :created_at, :user_id, :sub, :email, :token, '
                ":expires, 'active', :linked_at, :linked_at)",
                {
                    'id': PASSWORD_ACCOUNT_ID,
                    'created_at': LINKED_PASSWORD,
                    'user_id': PASSWORD_USER_ID,
                    'sub': 'bl-password-era',
                    'email': 'password.era@example.com',
                    'token': PASSWORD_ACCESS_TOKEN,
                    'expires': ACCESS_EXPIRES,
                    'linked_at': LINKED_PASSWORD,
                },
            ),
            (
                _INSERT_SESSION,
                {
                    'id': LOGOUT_SESSION_ID,
                    'created_at': CREATED,
                    'user_id': PASSWORD_USER_ID,
                    'expires_at': CREATED + timedelta(days=7),
                    'ended_at': ENDED,
                    'end_reason': 'logout',
                },
            ),
        ],
    )


def _write_oidc_rows(url: str) -> None:
    """A binding with a refresh token only and a ``borderless_revoked``
    web session, as the OpenID Connect code writes them."""
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': OIDC_USER_ID,
                    'username': 'oidc_era_user',
                    'email': 'oidc.era@example.com',
                    'created_at': LINKED_OIDC,
                },
            ),
            (
                'INSERT INTO borderless_accounts '
                '(id, created_at, user_id, borderless_user_id, email, '
                'encrypted_refresh_token, status, linked_at) '
                'VALUES (:id, :created_at, :user_id, :sub, :email, :token, '
                "'active', :linked_at)",
                {
                    'id': OIDC_ACCOUNT_ID,
                    'created_at': LINKED_OIDC,
                    'user_id': OIDC_USER_ID,
                    'sub': 'bl-oidc-era',
                    'email': 'oidc.era@example.com',
                    'token': OIDC_REFRESH_TOKEN,
                    'linked_at': LINKED_OIDC,
                },
            ),
            (
                _INSERT_SESSION,
                {
                    'id': REVOKED_SESSION_ID,
                    'created_at': LINKED_OIDC,
                    'user_id': OIDC_USER_ID,
                    'expires_at': LINKED_OIDC + timedelta(days=7),
                    'ended_at': LINKED_OIDC + timedelta(hours=2),
                    'end_reason': 'borderless_revoked',
                },
            ),
        ],
    )


def _accounts(url: str, access_suffix: str, refresh_column: str | None):
    """Bindings with the moving columns aliased to stable keys."""
    refresh = (
        f'{refresh_column} AS refresh_token'
        if refresh_column
        else 'NULL AS refresh_token'
    )
    return _query(
        url,
        'SELECT id, user_id, borderless_user_id, email, status, linked_at, '
        'profile_read_at, profile_read_failed_at, '
        f'encrypted_access_token{access_suffix} AS access_token, '
        f'access_token_expires_at{access_suffix} AS access_expires, '
        f'{refresh} '
        'FROM borderless_accounts ORDER BY id',
    )


def _upgraded_accounts(url: str) -> list[dict[str, Any]]:
    return _accounts(url, '_old', 'encrypted_refresh_token')


def _sessions(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT id, user_id, client_type, sign_in_method, ended_at, '
        'end_reason FROM user_sessions ORDER BY id',
    )


def _by_id(rows: list[dict[str, Any]], row_id: int) -> dict[str, Any]:
    return next(row for row in rows if row['id'] == row_id)


# --------------------------------------------------------------------------
# non-destructive-migrations.md at the source
# --------------------------------------------------------------------------


def test_source_drops_nothing_and_downgrade_is_real() -> None:
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)
    whole_source = _MIGRATION_PATH.read_text()

    assert 'op.drop_column' not in whole_source
    assert 'op.drop_table' not in whole_source
    for statement in ('DROP TABLE', 'DROP COLUMN', 'DELETE FROM'):
        assert statement not in whole_source.upper()
    assert 'pass' not in downgrade_source
    assert 'new_column_name' in downgrade_source
    assert 'new_column_name' in upgrade_source


def test_the_revision_is_a_new_child_of_the_retire_revision() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``4d3bbb20127f`` -> upgrade again, data
    asserted after every step (migration-tests.md 3)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_accounts = _accounts(migration_db, '', None)
    parent_sessions = _sessions(migration_db)
    assert _end_reason_check(migration_db) == _in_list_check(
        'end_reason', PARENT_REASONS
    )

    # -- 1. Upgrade: the refresh token column, both access columns renamed
    #       with their values and nullable, the wider CHECK; nothing else
    #       missing.
    _upgrade(migration_db, REVISION)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)

    assert first_tables == parent_tables
    assert first_columns == _expected_after_upgrade(parent_columns)
    for original, renamed in RENAMED_COLUMNS.items():
        assert original not in first_columns
        assert renamed in first_columns
    assert ADDED_COLUMN_OLD not in first_columns
    assert _shape(migration_db, 'encrypted_refresh_token') == ('text', 'YES')
    assert _shape(migration_db, 'encrypted_access_token_old') == (
        'text',
        'YES',
    )
    assert _shape(migration_db, 'access_token_expires_at_old') == (
        _TS,
        'YES',
    )
    assert _end_reason_check(migration_db) == _in_list_check(
        'end_reason', NEW_REASONS
    )

    # Nothing copied: the old binding keeps its values in ``_old`` and
    # gets no refresh token.
    upgraded = _upgraded_accounts(migration_db)
    assert len(upgraded) == 1
    assert {k: v for k, v in upgraded[0].items() if k != 'refresh_token'} == {
        k: v for k, v in parent_accounts[0].items() if k != 'refresh_token'
    }
    assert upgraded[0]['access_token'] == PASSWORD_ACCESS_TOKEN
    assert upgraded[0]['access_expires'] == ACCESS_EXPIRES
    assert upgraded[0]['refresh_token'] is None
    assert _sessions(migration_db) == parent_sessions

    # The new code's rows fit: a refresh-token-only binding and a
    # ``borderless_revoked`` session.
    _write_oidc_rows(migration_db)
    oidc = _by_id(_upgraded_accounts(migration_db), OIDC_ACCOUNT_ID)
    assert oidc['refresh_token'] == OIDC_REFRESH_TOKEN
    assert oidc['access_token'] is None
    assert oidc['access_expires'] is None
    assert (
        _by_id(_sessions(migration_db), REVOKED_SESSION_ID)['end_reason']
        == 'borderless_revoked'
    )
    first_accounts = _upgraded_accounts(migration_db)
    first_sessions = _sessions(migration_db)

    # -- 2. Downgrade: the original columns back with their values, the
    #       refresh token kept in ``_old``, the narrow CHECK.
    _downgrade(migration_db, PARENT_REVISION)

    assert _tables(migration_db) == parent_tables
    assert _columns(migration_db) == parent_columns | {ADDED_COLUMN_OLD}
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _shape(migration_db, 'encrypted_access_token') == ('text', 'NO')
    assert _shape(migration_db, 'access_token_expires_at') == (_TS, 'NO')
    assert _end_reason_check(migration_db) == _in_list_check(
        'end_reason', PARENT_REASONS
    )

    downgraded = _accounts(migration_db, '', 'encrypted_refresh_token_old')
    password_row = _by_id(downgraded, PASSWORD_ACCOUNT_ID)
    assert {
        k: v for k, v in password_row.items() if k != 'refresh_token'
    } == {k: v for k, v in parent_accounts[0].items() if k != 'refresh_token'}
    assert password_row['refresh_token'] is None
    oidc_row = _by_id(downgraded, OIDC_ACCOUNT_ID)
    # The OIDC binding: an empty access token that expired when linked,
    # the refresh token kept for the re-upgrade.
    assert oidc_row['access_token'] == ''
    assert oidc_row['access_expires'] == LINKED_OIDC
    assert oidc_row['refresh_token'] == OIDC_REFRESH_TOKEN
    sessions = _sessions(migration_db)
    assert _by_id(sessions, REVOKED_SESSION_ID)['end_reason'] == 'revoked'
    assert _by_id(sessions, LOGOUT_SESSION_ID) == _by_id(
        parent_sessions, LOGOUT_SESSION_ID
    )
    assert len(sessions) == 2

    # NOT NULL and the narrow CHECK refuse what the parent cannot hold.
    _refused(
        migration_db,
        'UPDATE borderless_accounts SET encrypted_access_token = NULL '
        'WHERE id = :id',
        {'id': PASSWORD_ACCOUNT_ID},
    )
    _refused(
        migration_db,
        'UPDATE borderless_accounts SET access_token_expires_at = NULL '
        'WHERE id = :id',
        {'id': PASSWORD_ACCOUNT_ID},
    )
    _refused(
        migration_db,
        "UPDATE user_sessions SET end_reason = 'borderless_revoked' "
        'WHERE id = :id',
        {'id': LOGOUT_SESSION_ID},
    )

    # -- 3. Upgrade again: equal to the first upgrade, the refresh token
    #       re-adopted with its rows.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _shape(migration_db, 'encrypted_refresh_token') == ('text', 'YES')
    assert _end_reason_check(migration_db) == _in_list_check(
        'end_reason', NEW_REASONS
    )
    second_accounts = _upgraded_accounts(migration_db)
    assert _by_id(second_accounts, PASSWORD_ACCOUNT_ID) == _by_id(
        first_accounts, PASSWORD_ACCOUNT_ID
    )
    second_oidc = _by_id(second_accounts, OIDC_ACCOUNT_ID)
    first_oidc = _by_id(first_accounts, OIDC_ACCOUNT_ID)
    assert second_oidc['refresh_token'] == OIDC_REFRESH_TOKEN
    # Every value but the downgrade's filler in the retired columns.
    moved = ('access_token', 'access_expires')
    assert {k: v for k, v in second_oidc.items() if k not in moved} == {
        k: v for k, v in first_oidc.items() if k not in moved
    }
    assert second_oidc['access_token'] == ''
    assert second_oidc['access_expires'] == LINKED_OIDC
    second_sessions = _sessions(migration_db)
    assert _by_id(second_sessions, LOGOUT_SESSION_ID) == _by_id(
        first_sessions, LOGOUT_SESSION_ID
    )
    # The parent had no ``borderless_revoked``: the round trip reads it
    # ``revoked``, which the Devices list shows the same way.
    assert (
        _by_id(second_sessions, REVOKED_SESSION_ID)['end_reason'] == 'revoked'
    )


def test_upgrade_after_a_downgrade_of_a_password_era_database(
    migration_db: str,
) -> None:
    """A database never touched by the OpenID Connect code round-trips to
    exactly the first upgrade."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    first_columns = _columns(migration_db)
    first_accounts = _upgraded_accounts(migration_db)
    first_sessions = _sessions(migration_db)

    _downgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_columns
    assert _upgraded_accounts(migration_db) == first_accounts
    assert _sessions(migration_db) == first_sessions


def test_the_upgraded_schema_refuses_an_unknown_end_reason(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    _refused(
        migration_db,
        "UPDATE user_sessions SET end_reason = 'borderless_gone' "
        'WHERE id = :id',
        {'id': LOGOUT_SESSION_ID},
    )
    assert (
        _by_id(_sessions(migration_db), LOGOUT_SESSION_ID)['end_reason']
        == 'logout'
    )


def test_the_orm_maps_the_refresh_token_and_no_retired_column() -> None:
    """Rule 7: ``BorderlessAccountModel`` maps the refresh token and
    neither access token column, under either name."""
    from app.domain.models import BorderlessAccountModel

    columns = {c.name: c for c in BorderlessAccountModel.__table__.columns}
    assert 'encrypted_refresh_token' in columns
    assert columns['encrypted_refresh_token'].nullable is True
    for retired in (
        'encrypted_access_token',
        'access_token_expires_at',
        'encrypted_access_token_old',
        'access_token_expires_at_old',
        'encrypted_refresh_token_old',
    ):
        assert retired not in columns
