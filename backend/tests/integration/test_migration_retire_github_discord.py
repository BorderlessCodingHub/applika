"""Round-trip test for revision ``4d3bbb20127f`` (Release C, ADR-0024 §8):
top up ``github_connections`` and ``report_webhooks`` from the rows created
between Release A and Release B, then retire ``discord_connections``,
``discord_report_webhooks``, ``users.github_id`` and
``users.encrypted_github_token`` to ``*_old``.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres — upgrade to the
revision, downgrade to its parent ``b86d7ee66d94``, upgrade again — seeding
rows at the parent and asserting the data after each step.

Seeded at the parent:

* a *gap* user, signed up with GitHub after Release A's migration: a
  ``github_id`` and an encrypted token, no ``github_connections`` row;
* a *covered* user, already carried over by Release A;
* a Borderless user with no ``github_id`` (nothing to copy);
* a ``discord_connections`` row;
* a carried-over webhook (in both tables, with a badge) and a *gap* Discord
  webhook absent from ``report_webhooks``.

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_retire_is_org_member.py``.

Every user and webhook here is invented; no request leaves the test.
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
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = '4d3bbb20127f'
PARENT_REVISION = 'b86d7ee66d94'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_retire_github_discord_objects.py'
)

GAP_USER_ID = 7500000000000000001
COVERED_USER_ID = 7500000000000000002
BORDERLESS_USER_ID = 7500000000000000003
COVERED_CONNECTION_ID = 7500000000000000101
DISCORD_CONNECTION_ID = 7500000000000000201
CARRIED_DISCORD_WEBHOOK_ID = 7500000000000000301
GAP_DISCORD_WEBHOOK_ID = 7500000000000000302
CARRIED_REPORT_WEBHOOK_ID = 7500000000000000401

GAP_GITHUB_ID = 95101
COVERED_GITHUB_ID = 95102
GAP_CREATED = datetime(2026, 10, 30, 8, 15, tzinfo=timezone.utc)
COVERED_CREATED = datetime(2025, 4, 2, 12, 0, tzinfo=timezone.utc)
WEBHOOK_CREATED = datetime(2026, 10, 30, 9, 0, tzinfo=timezone.utc)

CARRIED_URL = 'https://discord.example.test/api/webhooks/1/carried'
GAP_URL = 'https://discord.example.test/api/webhooks/2/gap'

RENAMED_TABLES = {
    'discord_connections': 'discord_connections_old',
    'discord_report_webhooks': 'discord_report_webhooks_old',
}
RENAMED_COLUMNS = {
    ('users', 'github_id'): ('users', 'github_id_old'),
    ('users', 'encrypted_github_token'): (
        'users',
        'encrypted_github_token_old',
    ),
}


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
        'retire_github_discord_migration_under_test', _MIGRATION_PATH
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


def _expected_after_upgrade(
    tables: set[str], columns: set[tuple[str, str]]
) -> tuple[set[str], set[tuple[str, str]]]:
    """The parent's inventory with only the four ``_old`` renames applied."""
    new_tables = {RENAMED_TABLES.get(table, table) for table in tables}
    new_columns: set[tuple[str, str]] = set()
    for table, column in columns:
        if (table, column) in RENAMED_COLUMNS:
            new_columns.add(RENAMED_COLUMNS[(table, column)])
        else:
            new_columns.add((RENAMED_TABLES.get(table, table), column))
    return new_tables, new_columns


_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, encrypted_github_token, username, email, '
    'experience_years, is_admin, created_at) '
    'VALUES (:id, :github_id, :token, :username, :email, 2, false, '
    ':created_at)'
)


def _seed_at_parent(url: str) -> None:
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': GAP_USER_ID,
                    'github_id': GAP_GITHUB_ID,
                    'token': 'gAAAA-gap-user-encrypted-token',
                    'username': 'gap_user',
                    'email': 'gap.user@example.com',
                    'created_at': GAP_CREATED,
                },
            ),
            (
                _INSERT_USER,
                {
                    'id': COVERED_USER_ID,
                    'github_id': COVERED_GITHUB_ID,
                    'token': 'gAAAA-covered-user-encrypted-token',
                    'username': 'covered_user',
                    'email': 'covered.user@example.com',
                    'created_at': COVERED_CREATED,
                },
            ),
            (
                _INSERT_USER,
                {
                    'id': BORDERLESS_USER_ID,
                    'github_id': None,
                    'token': None,
                    'username': 'borderless_user',
                    'email': 'borderless.user@example.com',
                    'created_at': GAP_CREATED,
                },
            ),
            (
                'INSERT INTO github_connections '
                '(id, created_at, user_id, github_id, username, linked_at) '
                'VALUES (:id, :created_at, :user_id, :github_id, '
                "'covered_user', :created_at)",
                {
                    'id': COVERED_CONNECTION_ID,
                    'created_at': COVERED_CREATED,
                    'user_id': COVERED_USER_ID,
                    'github_id': COVERED_GITHUB_ID,
                },
            ),
            (
                'INSERT INTO discord_connections '
                '(id, created_at, user_id, discord_id, username, scopes, '
                'encrypted_refresh_token) '
                'VALUES (:id, :created_at, :user_id, 880011, '
                "'covered_discord', 'identify', 'gAAAA-discord-refresh')",
                {
                    'id': DISCORD_CONNECTION_ID,
                    'created_at': COVERED_CREATED,
                    'user_id': COVERED_USER_ID,
                },
            ),
            (
                'INSERT INTO discord_report_webhooks '
                '(id, created_at, guild_id, webhook_url, label) '
                'VALUES (:id, :created_at, 770011, :url, :label)',
                {
                    'id': CARRIED_DISCORD_WEBHOOK_ID,
                    'created_at': COVERED_CREATED,
                    'url': CARRIED_URL,
                    'label': 'Carried by Release A',
                },
            ),
            (
                'INSERT INTO discord_report_webhooks '
                '(id, created_at, guild_id, webhook_url, label) '
                'VALUES (:id, :created_at, 770012, :url, :label)',
                {
                    'id': GAP_DISCORD_WEBHOOK_ID,
                    'created_at': WEBHOOK_CREATED,
                    'url': GAP_URL,
                    'label': 'Added between A and B',
                },
            ),
            (
                'INSERT INTO report_webhooks (id, created_at, url, label) '
                "VALUES (:id, :created_at, :url, 'Carried by Release A')",
                {
                    'id': CARRIED_REPORT_WEBHOOK_ID,
                    'created_at': COVERED_CREATED,
                    'url': CARRIED_URL,
                },
            ),
            (
                'INSERT INTO report_webhook_badges '
                "(report_webhook_id, badge) VALUES (:id, 'borderless_psp')",
                {'id': CARRIED_REPORT_WEBHOOK_ID},
            ),
        ],
    )


def _users(url: str, suffix: str) -> list[dict[str, Any]]:
    """Users with the two retired columns aliased to stable keys."""
    return _query(
        url,
        f'SELECT id, username, email, created_at, '
        f'github_id{suffix} AS github_id, '
        f'encrypted_github_token{suffix} AS encrypted_github_token '
        'FROM users ORDER BY id',
    )


def _discord_connections(url: str, table: str) -> list[dict[str, Any]]:
    return _query(
        url,
        f'SELECT id, user_id, discord_id, username, scopes, '
        f'encrypted_refresh_token, status::text AS status '
        f'FROM {table} ORDER BY id',
    )


def _discord_webhooks(url: str, table: str) -> list[dict[str, Any]]:
    return _query(
        url,
        f'SELECT id, created_at, guild_id, webhook_url, role_ids, label '
        f'FROM {table} ORDER BY id',
    )


def _github_connections(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT id, user_id, github_id, username, linked_at '
        'FROM github_connections ORDER BY user_id',
    )


def _report_webhooks(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT id, created_at, url, label, badge_old '
        'FROM report_webhooks ORDER BY url',
    )


def _webhook_badges(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT report_webhook_id, badge FROM report_webhook_badges '
        'ORDER BY report_webhook_id, badge',
    )


def _snapshot(url: str) -> dict[str, Any]:
    """Everything the revision touches, at the upgraded schema."""
    return {
        'users': _users(url, '_old'),
        'discord_connections': _discord_connections(
            url, 'discord_connections_old'
        ),
        'discord_report_webhooks': _discord_webhooks(
            url, 'discord_report_webhooks_old'
        ),
        'github_connections': _github_connections(url),
        'report_webhooks': _report_webhooks(url),
        'report_webhook_badges': _webhook_badges(url),
    }


def _assert_topped_up(url: str) -> None:
    connections = {row['user_id']: row for row in _github_connections(url)}
    # Gap user: copied, linked_at = created_at. Covered user: untouched.
    # Borderless user: nothing to copy.
    assert set(connections) == {GAP_USER_ID, COVERED_USER_ID}
    gap = connections[GAP_USER_ID]
    assert gap['github_id'] == GAP_GITHUB_ID
    assert gap['username'] == 'gap_user'
    assert gap['linked_at'] == GAP_CREATED
    assert gap['id'] not in {COVERED_CONNECTION_ID}
    assert connections[COVERED_USER_ID]['id'] == COVERED_CONNECTION_ID

    webhooks = {row['url']: row for row in _report_webhooks(url)}
    assert set(webhooks) == {CARRIED_URL, GAP_URL}
    gap_hook = webhooks[GAP_URL]
    assert gap_hook['label'] == 'Added between A and B'
    assert gap_hook['created_at'] == WEBHOOK_CREATED
    assert gap_hook['badge_old'] is None
    assert webhooks[CARRIED_URL]['id'] == CARRIED_REPORT_WEBHOOK_ID
    # The gap webhook holds no badge: it receives nothing until assigned.
    assert _webhook_badges(url) == [
        {
            'report_webhook_id': CARRIED_REPORT_WEBHOOK_ID,
            'badge': 'borderless_psp',
        }
    ]


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
    assert 'rename_table' in downgrade_source
    assert 'new_column_name' in downgrade_source
    assert 'rename_table' in upgrade_source


def test_the_revision_is_a_new_child_of_a2() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``b86d7ee66d94`` -> upgrade again, data
    asserted after every step (migration-tests.md 3)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_users = _users(migration_db, '')
    parent_discord = _discord_connections(migration_db, 'discord_connections')
    parent_webhooks = _discord_webhooks(migration_db, 'discord_report_webhooks')

    # -- 1. Upgrade: top-up done, the four objects renamed with their data,
    #       nothing else missing.
    _upgrade(migration_db, REVISION)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)

    expected_tables, expected_columns = _expected_after_upgrade(
        parent_tables, parent_columns
    )
    assert first_tables == expected_tables
    assert first_columns == expected_columns
    for original, renamed in RENAMED_TABLES.items():
        assert original not in first_tables
        assert renamed in first_tables
    for original, renamed in RENAMED_COLUMNS.items():
        assert original not in first_columns
        assert renamed in first_columns

    _assert_topped_up(migration_db)
    assert _users(migration_db, '_old') == parent_users
    assert (
        _discord_connections(migration_db, 'discord_connections_old')
        == parent_discord
    )
    assert (
        _discord_webhooks(migration_db, 'discord_report_webhooks_old')
        == parent_webhooks
    )
    first_snapshot = _snapshot(migration_db)

    # -- 2. Downgrade: the four names back with their data, the topped-up
    #       rows still present.
    _downgrade(migration_db, PARENT_REVISION)

    assert _tables(migration_db) == parent_tables
    assert _columns(migration_db) == parent_columns
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _users(migration_db, '') == parent_users
    assert (
        _discord_connections(migration_db, 'discord_connections')
        == parent_discord
    )
    assert (
        _discord_webhooks(migration_db, 'discord_report_webhooks')
        == parent_webhooks
    )
    _assert_topped_up(migration_db)
    assert (
        _github_connections(migration_db)
        == (first_snapshot['github_connections'])
    )
    assert _report_webhooks(migration_db) == first_snapshot['report_webhooks']

    # -- 3. Upgrade again: identical to the first upgrade, no duplicate.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _snapshot(migration_db) == first_snapshot


def test_upgrade_tops_up_rows_added_after_a_downgrade(
    migration_db: str,
) -> None:
    """A row written to the restored sources while C is downgraded is
    copied by the next upgrade, once, ``ON CONFLICT DO NOTHING``-safe."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)

    late_user = 7500000000000000009
    _apply(
        migration_db,
        [
            (
                _INSERT_USER,
                {
                    'id': late_user,
                    'github_id': 95109,
                    'token': None,
                    'username': 'late_user',
                    'email': 'late.user@example.com',
                    'created_at': GAP_CREATED,
                },
            ),
        ],
    )
    _upgrade(migration_db, REVISION)

    rows = [
        row
        for row in _github_connections(migration_db)
        if row['user_id'] == late_user
    ]
    assert len(rows) == 1
    assert rows[0]['github_id'] == 95109
    assert len(_github_connections(migration_db)) == 3
    assert len(_report_webhooks(migration_db)) == 2


def test_upgrade_skips_a_github_id_already_held_by_another_user(
    migration_db: str,
) -> None:
    """A GitHub id already restored onto another account is not copied a
    second time (``github_connections.github_id`` is UNIQUE)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _apply(
        migration_db,
        [
            (
                'INSERT INTO github_connections '
                '(id, created_at, user_id, github_id, username, linked_at) '
                'VALUES (7500000000000000102, now(), :user_id, :github_id, '
                "'gap_user', now())",
                {'user_id': BORDERLESS_USER_ID, 'github_id': GAP_GITHUB_ID},
            )
        ],
    )

    _upgrade(migration_db, REVISION)

    owners = {
        row['github_id']: row['user_id']
        for row in _github_connections(migration_db)
    }
    assert owners == {
        GAP_GITHUB_ID: BORDERLESS_USER_ID,
        COVERED_GITHUB_ID: COVERED_USER_ID,
    }


def test_orm_maps_none_of_the_retired_objects() -> None:
    """Rule 7: no model maps the four objects, under either name."""
    from app.domain.models import Base, UserModel

    user_columns = {c.name for c in UserModel.__table__.columns}
    for column in (
        'github_id',
        'github_id_old',
        'encrypted_github_token',
        'encrypted_github_token_old',
    ):
        assert column not in user_columns
    mapped_tables = set(Base.metadata.tables)
    for table in (*RENAMED_TABLES, *RENAMED_TABLES.values()):
        assert table not in mapped_tables
