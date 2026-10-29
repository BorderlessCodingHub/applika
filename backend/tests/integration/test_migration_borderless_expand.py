"""Round-trip test for the Borderless expand revision ``d9e0b46dd7e1``
(Release A of plan 0018).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``647a047921ec``, upgrade again - seeding
two users (one email in mixed case), an open ``github_web`` session and two
labelled Discord report webhooks at the parent revision and asserting the
data after each step.

What is asserted here:

* the upgrade adds exactly ``borderless_accounts``, ``github_connections``,
  ``user_badges`` and ``report_webhooks`` with every column, type, length,
  nullability and default, every PK, unique, CHECK and FK name, and both
  indexes (``uq_user_badges_live`` with its ``WHERE``); adds
  ``users.github_restore_prompt_seen_at``; makes ``users.github_id``
  nullable; widens ``ck_user_sessions_sign_in_method`` with ``borderless``;
  no table or column that existed before is missing;
* every user gets one ``github_connections`` row (``github_id``,
  ``username``, ``linked_at = created_at``) and every Discord report webhook
  one ``report_webhooks`` row (``url``, ``label``, ``created_at``) with
  ``badge`` NULL;
* the constraints refuse bad rows and the cascade removes a user's rows;
* the downgrade guard raises and changes nothing while a user has no
  ``github_id`` or a session is ``borderless``;
* the downgrade renames everything to ``_old`` with every row and value,
  narrows the CHECK and restores ``github_id NOT NULL``;
* the second upgrade renames everything back, equal to the first upgrade,
  with no duplicate seed, and tops up a user added while downgraded;
* ``upgrade()`` drops nothing, ``downgrade()`` is real, and nothing in
  ``app/`` maps any of these objects (Release A).

Plumbing is copied from ``tests/integration/test_migration_user_sessions.py``.

Every user and URL here is invented.
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

REVISION = 'd9e0b46dd7e1'
PARENT_REVISION = '647a047921ec'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_borderless_badges_expand.py'
)

NEW_TABLES = (
    'borderless_accounts',
    'github_connections',
    'user_badges',
    'report_webhooks',
)
OLD_TABLES = tuple(f'{table}_old' for table in NEW_TABLES)
PROMPT = 'github_restore_prompt_seen_at'
PROMPT_OLD = f'{PROMPT}_old'

_TS = 'timestamp with time zone'
_VC = 'character varying'
_BASE_SHAPES: dict[str, tuple[Any, ...]] = {
    'id': ('bigint', None, 'NO', None),
    'created_at': (_TS, None, 'NO', None),
    'updated_at': (_TS, None, 'YES', None),
}
# table -> column -> (data_type, max length, is_nullable, default)
COLUMN_SHAPES: dict[str, dict[str, tuple[Any, ...]]] = {
    'borderless_accounts': {
        **_BASE_SHAPES,
        'user_id': ('bigint', None, 'NO', None),
        'borderless_user_id': (_VC, 64, 'NO', None),
        'email': (_VC, 320, 'NO', None),
        'encrypted_access_token': ('text', None, 'NO', None),
        'access_token_expires_at': (_TS, None, 'NO', None),
        'status': (_VC, 20, 'NO', "'active'::character varying"),
        'linked_at': (_TS, None, 'NO', 'now()'),
        'profile_read_at': (_TS, None, 'YES', None),
        'profile_read_failed_at': (_TS, None, 'YES', None),
    },
    'github_connections': {
        **_BASE_SHAPES,
        'user_id': ('bigint', None, 'NO', None),
        'github_id': ('bigint', None, 'NO', None),
        'username': (_VC, 100, 'NO', None),
        'linked_at': (_TS, None, 'NO', None),
    },
    'user_badges': {
        **_BASE_SHAPES,
        'user_id': ('bigint', None, 'NO', None),
        'badge': (_VC, 40, 'NO', None),
        'source': (_VC, 40, 'NO', None),
        'granted_at': (_TS, None, 'NO', 'now()'),
        'revoked_at': (_TS, None, 'YES', None),
    },
    'report_webhooks': {
        **_BASE_SHAPES,
        'url': (_VC, 500, 'NO', None),
        'badge': (_VC, 40, 'YES', None),
        'label': (_VC, 100, 'YES', None),
    },
}

_FK_USER = 'FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE'
BADGES = ('borderless_base', 'borderless_psp')
OLD_METHODS = ('github_web', 'cli_browser', 'cli_device', 'cli_legacy')
NEW_METHODS = (*OLD_METHODS, 'borderless')


def _in_list_check(column: str, values: tuple[str, ...]) -> str:
    """``pg_get_constraintdef`` of ``column IN (values)`` on a varchar."""
    items = ', '.join(f"'{v}'::character varying" for v in values)
    return f'CHECK ((({column})::text = ANY ((ARRAY[{items}])::text[])))'


CONSTRAINTS: dict[str, dict[str, str]] = {
    'borderless_accounts': {
        'pk_borderless_accounts': 'PRIMARY KEY (id)',
        'fk_borderless_accounts_user_id': _FK_USER,
        'uq_borderless_accounts_user_id': 'UNIQUE (user_id)',
        'uq_borderless_accounts_borderless_user_id': (
            'UNIQUE (borderless_user_id)'
        ),
        'ck_borderless_accounts_status': _in_list_check(
            'status', ('active', 'needs_reconnect')
        ),
    },
    'github_connections': {
        'pk_github_connections': 'PRIMARY KEY (id)',
        'fk_github_connections_user_id': _FK_USER,
        'uq_github_connections_user_id': 'UNIQUE (user_id)',
        'uq_github_connections_github_id': 'UNIQUE (github_id)',
    },
    'user_badges': {
        'pk_user_badges': 'PRIMARY KEY (id)',
        'fk_user_badges_user_id': _FK_USER,
        'ck_user_badges_badge': _in_list_check('badge', BADGES),
        # Postgres normalises a one-value IN list to ``=``.
        'ck_user_badges_source': (
            "CHECK (((source)::text = 'borderless'::text))"
        ),
    },
    'report_webhooks': {
        'pk_report_webhooks': 'PRIMARY KEY (id)',
        'uq_report_webhooks_url': 'UNIQUE (url)',
        'ck_report_webhooks_badge': _in_list_check('badge', BADGES),
    },
}

CREATED_INDEXES = {
    'ix_user_badges_user_id': (
        'CREATE INDEX ix_user_badges_user_id ON public.user_badges '
        'USING btree (user_id)'
    ),
    'uq_user_badges_live': (
        'CREATE UNIQUE INDEX uq_user_badges_live ON public.user_badges '
        'USING btree (user_id, badge) WHERE (revoked_at IS NULL)'
    ),
}

USER_A_ID = 7900000000000000001
USER_B_ID = 7900000000000000002
USER_C_ID = 7900000000000000003
SESSION_A_ID = 7900000000000000101
WEBHOOK_1_ID = 7900000000000000201
WEBHOOK_2_ID = 7900000000000000202
WEBHOOK_1_URL = 'https://discord.com/api/webhooks/111/aaaa'
WEBHOOK_2_URL = 'https://discord.com/api/webhooks/222/bbbb'


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
        'borderless_expand_migration_under_test', _MIGRATION_PATH
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


def _rows(url: str, table: str) -> list[dict[str, Any]]:
    return _query(url, f'SELECT * FROM {table} ORDER BY id')


def _snapshot(url: str, tables: tuple[str, ...]) -> dict[str, Any]:
    return {table: _rows(url, table) for table in tables}


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_admin, '
    'created_at) '
    'VALUES (:id, :github_id, :username, :email, 2, false, :created_at)'
)

_INSERT_SESSION = (
    'INSERT INTO user_sessions '
    '(id, created_at, user_id, client_type, sign_in_method, device_name, '
    'expires_at) '
    "VALUES (:id, :created_at, :user_id, 'web', :sign_in_method, "
    "'Firefox on Linux', :expires_at)"
)

_INSERT_WEBHOOK = (
    'INSERT INTO discord_report_webhooks '
    '(id, created_at, guild_id, webhook_url, label) '
    'VALUES (:id, :created_at, :guild_id, :webhook_url, :label)'
)

_INSERT_ACCOUNT = (
    'INSERT INTO borderless_accounts '
    '(id, created_at, user_id, borderless_user_id, email, '
    'encrypted_access_token, access_token_expires_at, status) '
    'VALUES (:id, :created_at, :user_id, :borderless_user_id, :email, '
    "'encrypted', :expires_at, :status)"
)

_INSERT_BADGE = (
    'INSERT INTO user_badges '
    '(id, created_at, user_id, badge, source, revoked_at) '
    'VALUES (:id, :created_at, :user_id, :badge, :source, :revoked_at)'
)

_INSERT_REPORT_WEBHOOK = (
    'INSERT INTO report_webhooks (id, created_at, url, badge, label) '
    'VALUES (:id, :created_at, :url, :badge, :label)'
)

CREATED_A = datetime(2025, 3, 1, 9, 30, tzinfo=timezone.utc)
CREATED_B = datetime(2025, 6, 15, 18, 0, tzinfo=timezone.utc)
WEBHOOK_1_CREATED = datetime(2026, 1, 2, 10, 0, tzinfo=timezone.utc)
WEBHOOK_2_CREATED = datetime(2026, 2, 3, 11, 0, tzinfo=timezone.utc)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _user(
    user_id: int, github_id: int | None, username: str, created: datetime
) -> dict[str, Any]:
    return {
        'id': user_id,
        'github_id': github_id,
        'username': username,
        'email': f'{username}@example.com',
        'created_at': created,
    }


def _session(row_id: int, user_id: int, method: str) -> dict[str, Any]:
    now = _now()
    return {
        'id': row_id,
        'created_at': now,
        'user_id': user_id,
        'sign_in_method': method,
        'expires_at': now + timedelta(days=7),
    }


def _seed_at_parent(url: str) -> None:
    """Users A (mixed-case email) and B, an open ``github_web`` session for
    A and two labelled Discord report webhooks."""
    user_a = _user(USER_A_ID, 99101, 'borderless_user_a', CREATED_A)
    user_a['email'] = 'Ada.Lovelace@Example.COM'
    _apply(
        url,
        [
            (_INSERT_USER, user_a),
            (
                _INSERT_USER,
                _user(USER_B_ID, 99102, 'borderless_user_b', CREATED_B),
            ),
            (_INSERT_SESSION, _session(SESSION_A_ID, USER_A_ID, 'github_web')),
            (
                _INSERT_WEBHOOK,
                {
                    'id': WEBHOOK_1_ID,
                    'created_at': WEBHOOK_1_CREATED,
                    'guild_id': 900000000000000001,
                    'webhook_url': WEBHOOK_1_URL,
                    'label': 'BASE reports',
                },
            ),
            (
                _INSERT_WEBHOOK,
                {
                    'id': WEBHOOK_2_ID,
                    'created_at': WEBHOOK_2_CREATED,
                    'guild_id': 900000000000000002,
                    'webhook_url': WEBHOOK_2_URL,
                    'label': 'PSP reports',
                },
            ),
        ],
    )


def _upgraded(url: str) -> None:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url)
    _upgrade(url, REVISION)


def _account(row_id: int, user_id: int, **override: Any) -> dict[str, Any]:
    row = {
        'id': row_id,
        'created_at': _now(),
        'user_id': user_id,
        'borderless_user_id': f'bl-{row_id}',
        'email': 'Ada.Lovelace@Example.COM',
        'expires_at': _now() + timedelta(hours=1),
        'status': 'active',
    }
    row.update(override)
    return row


def _badge(row_id: int, user_id: int, **override: Any) -> dict[str, Any]:
    row = {
        'id': row_id,
        'created_at': _now(),
        'user_id': user_id,
        'badge': 'borderless_base',
        'source': 'borderless',
        'revoked_at': None,
    }
    row.update(override)
    return row


def _write_new_rows(url: str) -> None:
    """A binding and two badges (one revoked) for A, a prompt value for A
    - as Release B's code would write them."""
    _apply(
        url,
        [
            (_INSERT_ACCOUNT, _account(7900000000000000301, USER_A_ID)),
            (_INSERT_BADGE, _badge(7900000000000000401, USER_A_ID)),
            (
                _INSERT_BADGE,
                _badge(
                    7900000000000000402,
                    USER_A_ID,
                    badge='borderless_psp',
                    revoked_at=_now(),
                ),
            ),
            (
                f'UPDATE users SET {PROMPT} = :seen WHERE id = :id',
                {'seen': CREATED_B, 'id': USER_A_ID},
            ),
        ],
    )


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
    assert 'KODI-' not in whole_source


def test_the_revision_is_a_new_child_of_the_cvs_topup_head() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_nothing_in_app_maps_the_new_or_old_objects() -> None:
    """Release A: no ORM model maps the four tables, their ``_old`` twins,
    or the prompt column (runbook rule 4, non-destructive rule 7)."""
    from app.domain.models import Base

    mapped = set(Base.metadata.tables)
    assert not mapped & {*NEW_TABLES, *OLD_TABLES}
    users = Base.metadata.tables['users']
    assert PROMPT not in users.c
    assert PROMPT_OLD not in users.c


# --------------------------------------------------------------------------
# Upgrade - shapes, seeds, nothing missing
# --------------------------------------------------------------------------


def test_upgrade_adds_the_schema_and_nothing_is_missing(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)
    indexes_before = _index_defs(migration_db)
    users_before = _rows(migration_db, 'users')
    users_shapes_before = _column_shapes(migration_db, 'users')
    webhooks_before = _rows(migration_db, 'discord_report_webhooks')
    sessions_before = _rows(migration_db, 'user_sessions')
    session_constraints_before = _constraints(migration_db, 'user_sessions')

    _upgrade(migration_db, REVISION)

    # Nothing missing; exactly the four tables and one column added.
    assert _tables(migration_db) == tables_before | set(NEW_TABLES)
    assert _columns(migration_db) == columns_before | {
        (table, column)
        for table, shapes in COLUMN_SHAPES.items()
        for column in shapes
    } | {('users', PROMPT)}
    for table, shapes in COLUMN_SHAPES.items():
        assert _column_shapes(migration_db, table) == shapes
        assert _constraints(migration_db, table) == CONSTRAINTS[table]

    # users: github_id nullable (unique index kept), the prompt column, the
    # other columns unchanged (nothing shrinks).
    users_shapes = _column_shapes(migration_db, 'users')
    assert users_shapes['github_id'] == ('bigint', None, 'YES', None)
    assert users_shapes[PROMPT] == (_TS, None, 'YES', None)
    expected_users = dict(users_shapes_before)
    expected_users['github_id'] = ('bigint', None, 'YES', None)
    expected_users[PROMPT] = (_TS, None, 'YES', None)
    assert users_shapes == expected_users
    assert users_shapes['username'][1] == 100
    assert [
        {k: v for k, v in row.items() if k != PROMPT}
        for row in _rows(migration_db, 'users')
    ] == users_before
    assert all(row[PROMPT] is None for row in _rows(migration_db, 'users'))
    assert _rows(migration_db, 'discord_report_webhooks') == webhooks_before
    assert _rows(migration_db, 'user_sessions') == sessions_before

    # Indexes: the parent's unchanged, plus the PKs, the table UNIQUEs and
    # the two created ones.
    index_defs = _index_defs(migration_db)
    assert {n: index_defs[n] for n in indexes_before} == indexes_before
    assert 'ix_users_github_id' in index_defs
    assert 'UNIQUE' in index_defs['ix_users_github_id']
    for name, definition in CREATED_INDEXES.items():
        assert index_defs[name] == definition
    assert set(index_defs) - set(indexes_before) == set(CREATED_INDEXES) | {
        name
        for constraints in CONSTRAINTS.values()
        for name, definition in constraints.items()
        if definition.startswith(('PRIMARY KEY', 'UNIQUE'))
    }

    # The CHECK, widened by exactly one value; the others untouched.
    session_constraints = _constraints(migration_db, 'user_sessions')
    assert session_constraints[
        'ck_user_sessions_sign_in_method'
    ] == _in_list_check('sign_in_method', NEW_METHODS)
    assert {
        k: v
        for k, v in session_constraints.items()
        if k != 'ck_user_sessions_sign_in_method'
    } == {
        k: v
        for k, v in session_constraints_before.items()
        if k != 'ck_user_sessions_sign_in_method'
    }


def test_every_github_user_keeps_its_identity(migration_db: str) -> None:
    """AC1: one ``github_connections`` row per user, ``linked_at`` =
    ``users.created_at``, the mixed-case-email user included."""
    _upgraded(migration_db)

    rows = _query(
        migration_db,
        'SELECT user_id, github_id, username, linked_at '
        'FROM github_connections ORDER BY user_id',
    )
    assert rows == [
        {
            'user_id': USER_A_ID,
            'github_id': 99101,
            'username': 'borderless_user_a',
            'linked_at': CREATED_A,
        },
        {
            'user_id': USER_B_ID,
            'github_id': 99102,
            'username': 'borderless_user_b',
            'linked_at': CREATED_B,
        },
    ]
    ids = [r['id'] for r in _rows(migration_db, 'github_connections')]
    assert len(set(ids)) == 2
    assert all(isinstance(i, int) and i > 2**40 for i in ids)
    assert all(
        r['created_at'] is not None
        for r in _rows(migration_db, 'github_connections')
    )


def test_report_webhooks_are_carried_over_without_a_badge(
    migration_db: str,
) -> None:
    """AC2: both Discord webhooks, URL, label and created_at, badge NULL."""
    _upgraded(migration_db)

    rows = _query(
        migration_db,
        'SELECT url, label, badge, created_at, updated_at '
        'FROM report_webhooks ORDER BY url',
    )
    assert rows == [
        {
            'url': WEBHOOK_1_URL,
            'label': 'BASE reports',
            'badge': None,
            'created_at': WEBHOOK_1_CREATED,
            'updated_at': None,
        },
        {
            'url': WEBHOOK_2_URL,
            'label': 'PSP reports',
            'badge': None,
            'created_at': WEBHOOK_2_CREATED,
            'updated_at': None,
        },
    ]


# --------------------------------------------------------------------------
# Constraints and cascade
# --------------------------------------------------------------------------


def test_one_live_badge_per_user_and_badge(migration_db: str) -> None:
    _upgraded(migration_db)
    _apply(
        migration_db,
        [
            (_INSERT_BADGE, _badge(7900000000000000501, USER_A_ID)),
            # A revoked row next to a live one is fine.
            (
                _INSERT_BADGE,
                _badge(7900000000000000502, USER_A_ID, revoked_at=_now()),
            ),
            # The same badge for another user is fine.
            (_INSERT_BADGE, _badge(7900000000000000503, USER_B_ID)),
        ],
    )

    error = _refused(
        migration_db, _INSERT_BADGE, _badge(7900000000000000504, USER_A_ID)
    )
    assert 'uq_user_badges_live' in error
    assert len(_rows(migration_db, 'user_badges')) == 3


@pytest.mark.parametrize(
    ('statement', 'params', 'constraint'),
    [
        (
            _INSERT_ACCOUNT,
            _account(7900000000000000601, USER_A_ID, status='expired'),
            'ck_borderless_accounts_status',
        ),
        (
            _INSERT_BADGE,
            _badge(7900000000000000602, USER_A_ID, badge='borderless_gold'),
            'ck_user_badges_badge',
        ),
        (
            _INSERT_BADGE,
            _badge(7900000000000000603, USER_A_ID, source='discord'),
            'ck_user_badges_source',
        ),
        (
            _INSERT_REPORT_WEBHOOK,
            {
                'id': 7900000000000000604,
                'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
                'url': 'https://example.com/hook',
                'badge': 'borderless_gold',
                'label': None,
            },
            'ck_report_webhooks_badge',
        ),
        (
            _INSERT_REPORT_WEBHOOK,
            {
                'id': 7900000000000000605,
                'created_at': datetime(2026, 1, 1, tzinfo=timezone.utc),
                'url': WEBHOOK_1_URL,
                'badge': None,
                'label': None,
            },
            'uq_report_webhooks_url',
        ),
        (
            _INSERT_ACCOUNT,
            _account(7900000000000000606, 7900000000000000999),
            'fk_borderless_accounts_user_id',
        ),
        (
            'INSERT INTO github_connections '
            '(id, created_at, user_id, github_id, username, linked_at) '
            "VALUES (:id, now(), :user_id, 99101, 'dup', now())",
            {'id': 7900000000000000607, 'user_id': USER_A_ID},
            'uq_github_connections_user_id',
        ),
    ],
)
def test_constraints_refuse_bad_rows(
    migration_db: str,
    statement: str,
    params: dict[str, Any],
    constraint: str,
) -> None:
    _upgraded(migration_db)

    assert constraint in _refused(migration_db, statement, params)


def test_borderless_accounts_unique_per_user_and_per_borderless_id(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _apply(
        migration_db,
        [(_INSERT_ACCOUNT, _account(7900000000000000701, USER_A_ID))],
    )

    assert 'uq_borderless_accounts_user_id' in _refused(
        migration_db,
        _INSERT_ACCOUNT,
        _account(7900000000000000702, USER_A_ID),
    )
    assert 'uq_borderless_accounts_borderless_user_id' in _refused(
        migration_db,
        _INSERT_ACCOUNT,
        _account(
            7900000000000000703,
            USER_B_ID,
            borderless_user_id='bl-7900000000000000701',
        ),
    )


def test_a_borderless_session_and_a_github_less_user_are_accepted(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _apply(
        migration_db,
        [
            (
                _INSERT_USER,
                _user(USER_C_ID, None, 'borderless_only', CREATED_B),
            ),
            (
                _INSERT_SESSION,
                _session(7900000000000000801, USER_C_ID, 'borderless'),
            ),
        ],
    )

    assert _query(
        migration_db,
        'SELECT github_id FROM users WHERE id = :id',
        {'id': USER_C_ID},
    ) == [{'github_id': None}]
    assert 'ck_user_sessions_sign_in_method' in _refused(
        migration_db,
        _INSERT_SESSION,
        _session(7900000000000000802, USER_C_ID, 'password'),
    )


def test_deleting_a_user_removes_binding_badges_and_github_row(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _write_new_rows(migration_db)

    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_A_ID})],
    )

    assert _rows(migration_db, 'borderless_accounts') == []
    assert _rows(migration_db, 'user_badges') == []
    assert [
        r['user_id'] for r in _rows(migration_db, 'github_connections')
    ] == [USER_B_ID]
    assert len(_rows(migration_db, 'report_webhooks')) == 2


# --------------------------------------------------------------------------
# The downgrade guard
# --------------------------------------------------------------------------


def _schema_state(url: str) -> tuple[Any, ...]:
    return (
        _tables(url),
        _columns(url),
        _index_defs(url),
        _constraints(url, 'user_sessions'),
        _column_shapes(url, 'users'),
        _snapshot(url, ('users', 'user_sessions', *NEW_TABLES)),
    )


@pytest.mark.parametrize('cause', ['null_github_id', 'borderless_session'])
def test_the_guard_refuses_the_downgrade_and_changes_nothing(
    migration_db: str, cause: str
) -> None:
    _upgraded(migration_db)
    _write_new_rows(migration_db)
    if cause == 'null_github_id':
        _apply(
            migration_db,
            [
                (
                    _INSERT_USER,
                    _user(USER_C_ID, None, 'borderless_only', CREATED_B),
                )
            ],
        )
        expected = '1 user(s) with no github_id and 0 user_sessions'
    else:
        _apply(
            migration_db,
            [
                (
                    _INSERT_SESSION,
                    _session(7900000000000000901, USER_B_ID, 'borderless'),
                )
            ],
        )
        expected = '0 user(s) with no github_id and 1 user_sessions'
    before = _schema_state(migration_db)

    with pytest.raises(RuntimeError) as caught:
        _downgrade(migration_db, PARENT_REVISION)

    assert expected in str(caught.value)
    assert _schema_state(migration_db) == before
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': REVISION}
    ]


# --------------------------------------------------------------------------
# Round trip - migration-tests.md 2, 3, 4
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_indexes = _index_defs(migration_db)
    parent_users_shapes = _column_shapes(migration_db, 'users')
    parent_session_constraints = _constraints(migration_db, 'user_sessions')

    # -- 1. Upgrade, then write rows as Release B would.
    _upgrade(migration_db, REVISION)
    _write_new_rows(migration_db)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)
    first_indexes = _index_defs(migration_db)
    first_constraints = {t: _constraints(migration_db, t) for t in NEW_TABLES}
    first_session_constraints = _constraints(migration_db, 'user_sessions')
    first_users_shapes = _column_shapes(migration_db, 'users')
    first_rows = _snapshot(migration_db, NEW_TABLES)
    first_users = _rows(migration_db, 'users')
    assert {t: len(r) for t, r in first_rows.items()} == {
        'borderless_accounts': 1,
        'github_connections': 2,
        'user_badges': 2,
        'report_webhooks': 2,
    }

    # -- 2. Downgrade to the parent: renamed, never dropped.
    _downgrade(migration_db, PARENT_REVISION)

    down_tables = _tables(migration_db)
    assert down_tables == parent_tables | set(OLD_TABLES)
    assert not down_tables & set(NEW_TABLES)
    assert _columns(migration_db) == parent_columns | {
        (f'{table}_old', column)
        for table, shapes in COLUMN_SHAPES.items()
        for column in shapes
    } | {('users', PROMPT_OLD)}
    for table in NEW_TABLES:
        assert _rows(migration_db, f'{table}_old') == first_rows[table]
        assert (
            _constraints(migration_db, f'{table}_old')
            == (first_constraints[table])
        )
    # The prompt value survives in the _old column.
    assert [
        {
            **{k: v for k, v in r.items() if k != PROMPT_OLD},
            PROMPT: r[PROMPT_OLD],
        }
        for r in _rows(migration_db, 'users')
    ] == first_users
    down_users_shapes = _column_shapes(migration_db, 'users')
    assert down_users_shapes['github_id'] == ('bigint', None, 'NO', None)
    assert {
        k: v for k, v in down_users_shapes.items() if k != PROMPT_OLD
    } == parent_users_shapes
    assert _constraints(migration_db, 'user_sessions') == (
        parent_session_constraints
    )
    assert 'ck_user_sessions_sign_in_method' in _refused(
        migration_db,
        _INSERT_SESSION,
        _session(7900000000000001001, USER_A_ID, 'borderless'),
    )
    down_indexes = _index_defs(migration_db)
    assert not set(CREATED_INDEXES) & set(down_indexes)
    assert {n: down_indexes[n] for n in parent_indexes} == parent_indexes

    # A user who signs in with GitHub while the previous release runs.
    created_c = datetime(2026, 10, 20, 8, 0, tzinfo=timezone.utc)
    # ... and a Discord report webhook added while downgraded.
    webhook_3_url = 'https://discord.com/api/webhooks/333/cccc'
    _apply(
        migration_db,
        [
            (_INSERT_USER, _user(USER_C_ID, 99103, 'late_user_c', created_c)),
            (
                _INSERT_WEBHOOK,
                {
                    'id': 7900000000000000203,
                    'created_at': created_c,
                    'guild_id': 900000000000000003,
                    'webhook_url': webhook_3_url,
                    'label': 'Late reports',
                },
            ),
        ],
    )

    # -- 3. Upgrade again: names back, rows equal, seeds topped up.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _index_defs(migration_db) == first_indexes
    assert {
        t: _constraints(migration_db, t) for t in NEW_TABLES
    } == first_constraints
    assert _constraints(migration_db, 'user_sessions') == (
        first_session_constraints
    )
    assert _column_shapes(migration_db, 'users') == first_users_shapes
    again = _snapshot(migration_db, NEW_TABLES)
    for table in ('borderless_accounts', 'user_badges'):
        assert again[table] == first_rows[table]
    # Report webhooks: the first two kept as they were, the late one topped
    # up without a badge.
    webhooks = again['report_webhooks']
    assert [r for r in webhooks if r['url'] != webhook_3_url] == (
        first_rows['report_webhooks']
    )
    assert [
        (r['label'], r['created_at'], r['badge'])
        for r in webhooks
        if r['url'] == webhook_3_url
    ] == [('Late reports', created_c, None)]
    # The two first-upgrade rows are kept as they were; C is topped up.
    connections = again['github_connections']
    assert [r for r in connections if r['user_id'] != USER_C_ID] == (
        first_rows['github_connections']
    )
    topped = [r for r in connections if r['user_id'] == USER_C_ID]
    assert len(connections) == 3
    assert [
        (r['github_id'], r['username'], r['linked_at']) for r in topped
    ] == [(99103, 'late_user_c', created_c)]
    users_again = {r['id']: r for r in _rows(migration_db, 'users')}
    assert users_again[USER_A_ID][PROMPT] == CREATED_B
    assert users_again[USER_C_ID][PROMPT] is None
    assert PROMPT_OLD not in users_again[USER_A_ID]


def test_reupgrade_keeps_an_index_that_already_exists(
    migration_db: str,
) -> None:
    """The indexes are created only when missing."""
    _upgraded(migration_db)
    _write_new_rows(migration_db)
    first_indexes = _index_defs(migration_db)
    _downgrade(migration_db, PARENT_REVISION)
    _apply(
        migration_db,
        [
            (
                'CREATE UNIQUE INDEX uq_user_badges_live ON user_badges_old '
                '(user_id, badge) WHERE revoked_at IS NULL',
                {},
            )
        ],
    )

    _upgrade(migration_db, REVISION)

    assert _index_defs(migration_db) == first_indexes
    assert len(_rows(migration_db, 'user_badges')) == 2


def test_a_second_round_trip_keeps_the_rows_and_seeds_once(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _write_new_rows(migration_db)
    first_rows = _snapshot(migration_db, NEW_TABLES)

    for _ in range(2):
        _downgrade(migration_db, PARENT_REVISION)
        _upgrade(migration_db, REVISION)

    assert _snapshot(migration_db, NEW_TABLES) == first_rows
    assert not _tables(migration_db) & set(OLD_TABLES)
