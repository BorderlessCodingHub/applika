"""Round-trip test for the ``discord_connections`` / ``discord_report_webhooks``
revision ``ba44f9cfd3c1`` (K5, KODI-023, Release A2).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres — upgrade to the
revision, downgrade to its parent ``c1d9f4a7b3e6``, upgrade again — seeding
``users`` rows before the upgrade and asserting the data after each step.

What the revision has to get right, and what is asserted here:

* both tables and the ``discord_connection_status`` enum exist after the
  upgrade, and nothing else in the schema moves — ``users`` rows, columns
  and values (``is_org_member`` true and false) are unchanged (AC per K5);
* a connection and a webhook can be inserted, ``role_ids`` defaults to an
  empty array and ``status`` defaults to ``active``;
* a duplicate ``discord_id``, a second connection row for the same
  ``user_id`` and a duplicate ``webhook_url`` each raise ``IntegrityError``
  (AC1: at most one Discord account per Applika user, both directions);
* deleting the user deletes its connection (AC2, ``ON DELETE CASCADE``);
* ``downgrade()`` to ``c1d9f4a7b3e6`` drops exactly the two tables and the
  enum this revision added, and ``users`` is intact
  (non-destructive-migrations.md 1, an empty/``pass`` downgrade is
  forbidden);
* the second upgrade is identical to the first, schema and data
  (migration-tests.md 3).

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is the same as
``tests/integration/test_migration_tailored_cv_base_snapshot.py``, and for
the same reasons.

Every user and connection here is invented.
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

REVISION = 'ba44f9cfd3c1'
PARENT_REVISION = 'c1d9f4a7b3e6'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_discord_connections_and_report_webhooks.py'
)

USER_ID = 7300000000000000001
ORG_MEMBER_USER_ID = 7300000000000000002
CONNECTION_ID = 7300000000000000003
SECOND_CONNECTION_ID = 7300000000000000004
THIRD_CONNECTION_ID = 7300000000000000005
WEBHOOK_ID = 7300000000000000006
SECOND_WEBHOOK_ID = 7300000000000000007

DISCORD_ID = 800000000000000001
OTHER_DISCORD_ID = 800000000000000002


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
        'discord_connections_migration_under_test', _MIGRATION_PATH
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


def _enums(url: str) -> set[str]:
    return {
        row['typname']
        for row in _query(
            url,
            "SELECT typname FROM pg_type WHERE typtype = 'e'",
        )
    }


_COLUMN_DETAILS_SQL = (
    'SELECT column_name, udt_name, character_maximum_length, is_nullable, '
    'column_default FROM information_schema.columns '
    "WHERE table_schema = 'public' AND table_name = :table_name "
    'ORDER BY ordinal_position'
)


def _column_details(url: str, table_name: str) -> list[dict[str, Any]]:
    return _query(url, _COLUMN_DETAILS_SQL, {'table_name': table_name})


# The exact shape T080/T081 specify, column by column, in declared order.
# Pinning this closes AC3 (the record's own columns), AC4 (no access-token
# column, encrypted_refresh_token present) and AC5 (no server/role column).
_EXPECTED_DISCORD_CONNECTIONS_COLUMNS = [
    {
        'column_name': 'id',
        'udt_name': 'int8',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'created_at',
        'udt_name': 'timestamptz',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'updated_at',
        'udt_name': 'timestamptz',
        'character_maximum_length': None,
        'is_nullable': 'YES',
        'column_default': None,
    },
    {
        'column_name': 'user_id',
        'udt_name': 'int8',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'discord_id',
        'udt_name': 'int8',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'username',
        'udt_name': 'varchar',
        'character_maximum_length': 32,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'global_name',
        'udt_name': 'varchar',
        'character_maximum_length': 32,
        'is_nullable': 'YES',
        'column_default': None,
    },
    {
        'column_name': 'avatar',
        'udt_name': 'varchar',
        'character_maximum_length': 64,
        'is_nullable': 'YES',
        'column_default': None,
    },
    {
        'column_name': 'scopes',
        'udt_name': 'varchar',
        'character_maximum_length': 255,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'encrypted_refresh_token',
        'udt_name': 'text',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'access_token_expires_at',
        'udt_name': 'timestamptz',
        'character_maximum_length': None,
        'is_nullable': 'YES',
        'column_default': None,
    },
    {
        'column_name': 'status',
        'udt_name': 'discord_connection_status',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': "'active'::discord_connection_status",
    },
    {
        'column_name': 'linked_at',
        'udt_name': 'timestamptz',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': 'now()',
    },
]

_EXPECTED_DISCORD_REPORT_WEBHOOKS_COLUMNS = [
    {
        'column_name': 'id',
        'udt_name': 'int8',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'created_at',
        'udt_name': 'timestamptz',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'updated_at',
        'udt_name': 'timestamptz',
        'character_maximum_length': None,
        'is_nullable': 'YES',
        'column_default': None,
    },
    {
        'column_name': 'guild_id',
        'udt_name': 'int8',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'webhook_url',
        'udt_name': 'varchar',
        'character_maximum_length': 500,
        'is_nullable': 'NO',
        'column_default': None,
    },
    {
        'column_name': 'role_ids',
        'udt_name': '_int8',
        'character_maximum_length': None,
        'is_nullable': 'NO',
        'column_default': "'{}'::bigint[]",
    },
    {
        'column_name': 'label',
        'udt_name': 'varchar',
        'character_maximum_length': 100,
        'is_nullable': 'YES',
        'column_default': None,
    },
]


_CONSTRAINTS_SQL = """
    SELECT conname, contype::text, pg_get_constraintdef(oid) AS definition
    FROM pg_constraint
    WHERE conrelid = to_regclass(:table_name)
    ORDER BY conname
"""


def _constraints(url: str, table_name: str) -> dict[str, dict[str, Any]]:
    return {
        row['conname']: {
            'contype': row['contype'],
            'definition': row['definition'],
        }
        for row in _query(url, _CONSTRAINTS_SQL, {'table_name': table_name})
    }


def _index_definition(url: str, index_name: str) -> str | None:
    rows = _query(
        url,
        'SELECT indexdef FROM pg_indexes WHERE indexname = :index_name',
        {'index_name': index_name},
    )
    return rows[0]['indexdef'] if rows else None


_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_org_member, '
    'created_at) '
    'VALUES (:id, :github_id, :username, :email, :years, :is_org_member, '
    ':now)'
)


def _seed_users_at_parent(url: str) -> None:
    """Two users, ``is_org_member`` true and false, at ``c1d9f4a7b3e6``."""
    now = datetime.now(timezone.utc)
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': USER_ID,
                    'github_id': 93101,
                    'username': 'discord_user',
                    'email': 'discord.user@example.com',
                    'years': 3,
                    'is_org_member': False,
                    'now': now,
                },
            ),
            (
                _INSERT_USER,
                {
                    'id': ORG_MEMBER_USER_ID,
                    'github_id': 93102,
                    'username': 'discord_org_member',
                    'email': 'discord.org.member@example.com',
                    'years': 6,
                    'is_org_member': True,
                    'now': now,
                },
            ),
        ],
    )


def _users_snapshot(url: str) -> list[dict[str, Any]]:
    return _query(url, 'SELECT * FROM users ORDER BY id')


_INSERT_CONNECTION = (
    'INSERT INTO discord_connections '
    '(id, created_at, user_id, discord_id, username, scopes, '
    'encrypted_refresh_token) '
    'VALUES (:id, :now, :user_id, :discord_id, :username, :scopes, '
    ':token)'
)


def _connection_payload(
    conn_id: int, user_id: int, discord_id: int
) -> dict[str, Any]:
    return {
        'id': conn_id,
        'now': datetime.now(timezone.utc),
        'user_id': user_id,
        'discord_id': discord_id,
        'username': 'ada',
        'scopes': 'identify guilds guilds.members.read',
        'token': 'encrypted-refresh-token',
    }


_INSERT_WEBHOOK = (
    'INSERT INTO discord_report_webhooks '
    '(id, created_at, guild_id, webhook_url) '
    'VALUES (:id, :now, :guild_id, :webhook_url)'
)


def _webhook_payload(webhook_id: int, webhook_url: str) -> dict[str, Any]:
    return {
        'id': webhook_id,
        'now': datetime.now(timezone.utc),
        'guild_id': 900000000000000001,
        'webhook_url': webhook_url,
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
    assert 'op.drop_constraint' not in upgrade_source
    downgrade_source = inspect.getsource(module.downgrade)
    assert 'op.drop_table' in downgrade_source
    assert 'pass' not in downgrade_source


def test_the_revision_is_a_new_child_at_head(migration_db: str) -> None:
    module = _load_migration_module()

    assert module.revision == REVISION, module.revision
    assert module.down_revision == PARENT_REVISION, module.down_revision


def test_upgrade_creates_only_the_two_tables_and_the_enum(
    migration_db: str,
) -> None:
    """Nothing else in the schema moves - purely additive."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)
    enums_before = _enums(migration_db)

    _upgrade(migration_db, REVISION)

    tables_after = _tables(migration_db)
    assert tables_after - tables_before == {
        'discord_connections',
        'discord_report_webhooks',
    }, tables_after - tables_before
    assert tables_before - tables_after == set()

    columns_after = _columns(migration_db)
    assert {table for table, _ in columns_after - columns_before} == {
        'discord_connections',
        'discord_report_webhooks',
    }
    assert columns_before - columns_after == set()

    enums_after = _enums(migration_db)
    assert enums_after - enums_before == {'discord_connection_status'}


def test_discord_connections_column_shape(migration_db: str) -> None:
    """AC3/AC4/AC5: the record's own columns, exactly T080 - the identity,
    consent and state fields the ADR names, ``encrypted_refresh_token``
    (never an access-token column), and no server/role column. Exact
    equality (not a subset check) is what proves the absent columns are
    really absent."""
    _upgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    assert (
        _column_details(migration_db, 'discord_connections')
        == _EXPECTED_DISCORD_CONNECTIONS_COLUMNS
    )

    constraints = _constraints(migration_db, 'discord_connections')
    assert constraints['pk_discord_connections']['contype'] == 'p'
    assert constraints['uq_discord_connections_user_id'] == {
        'contype': 'u',
        'definition': 'UNIQUE (user_id)',
    }
    assert constraints['uq_discord_connections_discord_id'] == {
        'contype': 'u',
        'definition': 'UNIQUE (discord_id)',
    }
    assert constraints['fk_discord_connections_user_id'] == {
        'contype': 'f',
        'definition': (
            'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
        ),
    }


def test_discord_report_webhooks_column_shape(migration_db: str) -> None:
    """AC5: no ``user_id`` (platform catalog, admin-only), a unique webhook
    URL and an indexed guild id."""
    _upgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    assert (
        _column_details(migration_db, 'discord_report_webhooks')
        == _EXPECTED_DISCORD_REPORT_WEBHOOKS_COLUMNS
    )
    assert 'user_id' not in {
        row['column_name']
        for row in _column_details(migration_db, 'discord_report_webhooks')
    }

    constraints = _constraints(migration_db, 'discord_report_webhooks')
    assert constraints['pk_discord_report_webhooks']['contype'] == 'p'
    assert constraints['uq_discord_report_webhooks_webhook_url'] == {
        'contype': 'u',
        'definition': 'UNIQUE (webhook_url)',
    }

    index = _index_definition(
        migration_db, 'ix_discord_report_webhooks_guild_id'
    )
    assert index is not None
    assert 'UNIQUE' not in index
    assert '(guild_id)' in index


def test_users_rows_columns_and_values_unchanged(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    before = _users_snapshot(migration_db)

    _upgrade(migration_db, REVISION)

    after = _users_snapshot(migration_db)
    assert after == before, (before, after)
    assert {row['is_org_member'] for row in after} == {True, False}


# --------------------------------------------------------------------------
# Inserts, defaults, constraints
# --------------------------------------------------------------------------


def test_insert_connection_and_webhook(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    _apply(
        migration_db,
        [
            (
                _INSERT_CONNECTION,
                _connection_payload(CONNECTION_ID, USER_ID, DISCORD_ID),
            ),
            (
                _INSERT_WEBHOOK,
                _webhook_payload(
                    WEBHOOK_ID, 'https://discord.com/api/webhooks/1/aaa'
                ),
            ),
        ],
    )

    connection = _query(
        migration_db,
        'SELECT status::text, linked_at IS NOT NULL AS has_linked_at '
        'FROM discord_connections WHERE id = :id',
        {'id': CONNECTION_ID},
    )
    assert connection == [{'status': 'active', 'has_linked_at': True}]

    webhook = _query(
        migration_db,
        'SELECT role_ids FROM discord_report_webhooks WHERE id = :id',
        {'id': WEBHOOK_ID},
    )
    assert webhook == [{'role_ids': []}]


def test_duplicate_discord_id_raises_integrity_error(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    _apply(
        migration_db,
        [
            (
                _INSERT_CONNECTION,
                _connection_payload(CONNECTION_ID, USER_ID, DISCORD_ID),
            )
        ],
    )

    _apply_expect_integrity_error(
        migration_db,
        _INSERT_CONNECTION,
        _connection_payload(
            SECOND_CONNECTION_ID, ORG_MEMBER_USER_ID, DISCORD_ID
        ),
    )


def test_second_connection_for_same_user_raises_integrity_error(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    _apply(
        migration_db,
        [
            (
                _INSERT_CONNECTION,
                _connection_payload(CONNECTION_ID, USER_ID, DISCORD_ID),
            )
        ],
    )

    _apply_expect_integrity_error(
        migration_db,
        _INSERT_CONNECTION,
        _connection_payload(SECOND_CONNECTION_ID, USER_ID, OTHER_DISCORD_ID),
    )


def test_duplicate_webhook_url_raises_integrity_error(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    url = 'https://discord.com/api/webhooks/1/aaa'
    _apply(migration_db, [(_INSERT_WEBHOOK, _webhook_payload(WEBHOOK_ID, url))])

    _apply_expect_integrity_error(
        migration_db,
        _INSERT_WEBHOOK,
        _webhook_payload(SECOND_WEBHOOK_ID, url),
    )


def test_deleting_user_deletes_its_connection(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_users_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    _apply(
        migration_db,
        [
            (
                _INSERT_CONNECTION,
                _connection_payload(CONNECTION_ID, USER_ID, DISCORD_ID),
            )
        ],
    )

    _apply(
        migration_db, [('DELETE FROM users WHERE id = :id', {'id': USER_ID})]
    )

    remaining = _query(
        migration_db,
        'SELECT id FROM discord_connections WHERE id = :id',
        {'id': CONNECTION_ID},
    )
    assert remaining == []


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
    parent_users = _users_snapshot(migration_db)

    # -- 1. Upgrade: both tables and the enum exist, no column or table is
    #       missing, users are untouched.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    first_upgrade_tables = _tables(migration_db)
    assert 'discord_connections' in first_upgrade_tables
    assert 'discord_report_webhooks' in first_upgrade_tables
    assert 'discord_connection_status' in _enums(migration_db)
    assert parent_tables <= first_upgrade_tables
    assert parent_columns <= first_upgrade_columns
    assert _users_snapshot(migration_db) == parent_users

    _apply(
        migration_db,
        [
            (
                _INSERT_CONNECTION,
                _connection_payload(CONNECTION_ID, USER_ID, DISCORD_ID),
            ),
            (
                _INSERT_WEBHOOK,
                _webhook_payload(
                    WEBHOOK_ID, 'https://discord.com/api/webhooks/1/aaa'
                ),
            ),
        ],
    )

    # -- 2. Downgrade: exactly the two tables and the enum disappear,
    #       nothing else does, and every user row is untouched.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert 'discord_connection_status' not in _enums(migration_db)
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _users_snapshot(migration_db) == parent_users

    # -- 3. Upgrade again: identical to the first upgrade, schema and data -
    #       the full column shape (types, lengths, nullability, defaults),
    #       not just the (table, column) name sets.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    assert _tables(migration_db) == first_upgrade_tables
    assert 'discord_connection_status' in _enums(migration_db)
    assert _users_snapshot(migration_db) == parent_users
    assert (
        _column_details(migration_db, 'discord_connections')
        == _EXPECTED_DISCORD_CONNECTIONS_COLUMNS
    )
    assert (
        _column_details(migration_db, 'discord_report_webhooks')
        == _EXPECTED_DISCORD_REPORT_WEBHOOKS_COLUMNS
    )


def test_orm_maps_neither_discord_table_any_more() -> None:
    """K5 shipped this revision code-free (non-destructive-migrations.md 7 /
    prod-release-runbook.md 4): no ORM model mapped either table.

    K6 (KODI-024) added ``DiscordConnectionModel``, mapped onto
    ``discord_connections``; K7 (KODI-025) added
    ``DiscordReportWebhookModel``, mapped onto ``discord_report_webhooks`` -
    ADR-0024 removed Discord linking: both tables stay in the database
    and no model maps them any more. Reads ``Base.metadata.tables``
    directly rather than scanning ``app.domain.models``' namespace, so it
    also catches a model declared but not imported at module level."""
    from app.domain.models import Base

    mapped_tables = set(Base.metadata.tables)
    assert 'discord_connections' not in mapped_tables
    assert 'discord_report_webhooks' not in mapped_tables
