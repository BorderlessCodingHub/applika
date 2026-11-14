"""Round-trip test for the report webhook badges revision ``b86d7ee66d94``
(Release A of plan 0018, second revision).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``d9e0b46dd7e1``, upgrade again - seeding
three ``report_webhooks`` rows (badge NULL, BASE, PSP) at the parent and
asserting the data after each step.

What is asserted here:

* the upgrade adds ``report_webhook_badges`` with its columns, PK, FK
  (ON DELETE CASCADE) and CHECK, copies every non-null badge into one link
  row, renames ``report_webhooks.badge`` to ``badge_old`` with its values
  and its CHECK; nothing else is missing;
* the link table refuses a duplicate pair and an unknown badge, and
  deleting a webhook removes its link rows;
* the downgrade restores ``badge`` from the link rows (NULL for none,
  ``borderless_base`` for a webhook holding both) and keeps the full set in
  ``report_webhook_badges_old``;
* the second upgrade re-adopts ``report_webhook_badges_old``, equal to the
  first upgrade, with no duplicate link row;
* ``upgrade()`` drops nothing, ``downgrade()`` is real, and no ORM model
  maps an ``_old`` object.

Plumbing is copied from ``tests/integration/test_migration_borderless_expand.py``.

Every URL here is invented.
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

REVISION = 'b86d7ee66d94'
PARENT_REVISION = 'd9e0b46dd7e1'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_report_webhook_badges.py'
)

LINK = 'report_webhook_badges'
LINK_OLD = f'{LINK}_old'
BASE = 'borderless_base'
PSP = 'borderless_psp'

WEBHOOK_NONE_ID = 7910000000000000001
WEBHOOK_BASE_ID = 7910000000000000002
WEBHOOK_PSP_ID = 7910000000000000003
CREATED = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)

LINK_COLUMNS = {
    'report_webhook_id': ('bigint', None, 'NO', None),
    'badge': ('character varying', 40, 'NO', None),
}
LINK_CONSTRAINTS = {
    f'pk_{LINK}': 'PRIMARY KEY (report_webhook_id, badge)',
    f'fk_{LINK}_report_webhook_id': (
        'FOREIGN KEY (report_webhook_id) REFERENCES report_webhooks(id) '
        'ON DELETE CASCADE'
    ),
    f'ck_{LINK}_badge': (
        "CHECK (((badge)::text = ANY ((ARRAY['borderless_base'::character "
        "varying, 'borderless_psp'::character varying])::text[])))"
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
        'report_webhook_badges_migration_under_test', _MIGRATION_PATH
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


def _webhooks(url: str) -> list[dict[str, Any]]:
    return _query(url, 'SELECT * FROM report_webhooks ORDER BY id')


def _links(url: str, table: str = LINK) -> list[tuple[int, str]]:
    return [
        (row['report_webhook_id'], row['badge'])
        for row in _query(
            url,
            f'SELECT report_webhook_id, badge FROM {table} '
            'ORDER BY report_webhook_id, badge',
        )
    ]


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_WEBHOOK = (
    'INSERT INTO report_webhooks (id, created_at, url, badge, label) '
    'VALUES (:id, :created_at, :url, :badge, :label)'
)
_INSERT_LINK = (
    f'INSERT INTO {LINK} (report_webhook_id, badge) '
    'VALUES (:report_webhook_id, :badge)'
)


def _webhook(row_id: int, badge: str | None, label: str) -> dict[str, Any]:
    return {
        'id': row_id,
        'created_at': CREATED,
        'url': f'https://discord.com/api/webhooks/{row_id}/token',
        'badge': badge,
        'label': label,
    }


def _seed_at_parent(url: str) -> None:
    """A carried-over webhook (no badge), a BASE one and a PSP one."""
    _apply(
        url,
        [
            (_INSERT_WEBHOOK, _webhook(WEBHOOK_NONE_ID, None, 'Carried')),
            (_INSERT_WEBHOOK, _webhook(WEBHOOK_BASE_ID, BASE, 'BASE')),
            (_INSERT_WEBHOOK, _webhook(WEBHOOK_PSP_ID, PSP, 'PSP')),
        ],
    )


def _upgraded(url: str) -> None:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url)
    _upgrade(url, REVISION)


def _rename_badge_key(
    rows: list[dict[str, Any]], old: str, new: str
) -> list[dict[str, Any]]:
    return [
        {**{k: v for k, v in r.items() if k != old}, new: r[old]} for r in rows
    ]


def _without(rows: list[dict[str, Any]], key: str) -> list[dict[str, Any]]:
    return [{k: v for k, v in r.items() if k != key} for r in rows]


# --------------------------------------------------------------------------
# non-destructive-migrations.md 1, 2 - source inspection
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing() -> None:
    module = _load_migration_module()
    downgrade_source = inspect.getsource(module.downgrade)
    whole_source = _MIGRATION_PATH.read_text()

    assert 'op.drop_column' not in whole_source
    assert 'op.drop_table' not in whole_source
    assert 'drop_' not in inspect.getsource(module.upgrade)
    assert 'pass' not in downgrade_source
    assert 'rename_table' in downgrade_source
    assert 'KODI-' not in whole_source


def test_the_revision_is_a_child_of_the_borderless_expand() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_no_model_maps_an_old_object() -> None:
    """Non-destructive rule 7: ``badge_old`` and ``report_webhook_badges_old``
    are never mapped. Release A maps neither table; Release B maps
    ``report_webhooks`` without ``badge_old``."""
    from app.domain.models import Base

    assert LINK_OLD not in Base.metadata.tables
    webhooks = Base.metadata.tables.get('report_webhooks')
    assert webhooks is None or 'badge_old' not in webhooks.c


# --------------------------------------------------------------------------
# Upgrade
# --------------------------------------------------------------------------


def test_upgrade_copies_the_badges_and_nothing_is_missing(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)
    parent_webhooks = _webhooks(migration_db)
    parent_webhook_constraints = _constraints(migration_db, 'report_webhooks')

    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == parent_tables | {LINK}
    # Only renamed: badge -> badge_old, plus the link table's columns.
    assert _columns(migration_db) == (
        parent_columns - {('report_webhooks', 'badge')}
    ) | {('report_webhooks', 'badge_old')} | {
        (LINK, column) for column in LINK_COLUMNS
    }
    assert _column_shapes(migration_db, LINK) == LINK_COLUMNS
    assert _constraints(migration_db, LINK) == LINK_CONSTRAINTS
    # The CHECK travels with the renamed column, same name.
    webhook_constraints = _constraints(migration_db, 'report_webhooks')
    assert set(webhook_constraints) == set(parent_webhook_constraints)
    assert 'badge_old' in webhook_constraints['ck_report_webhooks_badge']

    assert _links(migration_db) == [
        (WEBHOOK_BASE_ID, BASE),
        (WEBHOOK_PSP_ID, PSP),
    ]
    # badge_old holds every original value, NULL included.
    assert _webhooks(migration_db) == _rename_badge_key(
        parent_webhooks, 'badge', 'badge_old'
    )


def test_the_link_table_refuses_a_duplicate_pair_and_an_unknown_badge(
    migration_db: str,
) -> None:
    _upgraded(migration_db)

    assert f'pk_{LINK}' in _refused(
        migration_db,
        _INSERT_LINK,
        {'report_webhook_id': WEBHOOK_BASE_ID, 'badge': BASE},
    )
    assert f'ck_{LINK}_badge' in _refused(
        migration_db,
        _INSERT_LINK,
        {'report_webhook_id': WEBHOOK_BASE_ID, 'badge': 'borderless_free'},
    )
    assert f'fk_{LINK}_report_webhook_id' in _refused(
        migration_db,
        _INSERT_LINK,
        {'report_webhook_id': 7910000000000009999, 'badge': BASE},
    )


def test_deleting_a_webhook_removes_its_badges(migration_db: str) -> None:
    _upgraded(migration_db)
    _apply(
        migration_db,
        [
            (
                _INSERT_LINK,
                {'report_webhook_id': WEBHOOK_BASE_ID, 'badge': PSP},
            ),
            (
                'DELETE FROM report_webhooks WHERE id = :id',
                {'id': WEBHOOK_BASE_ID},
            ),
        ],
    )

    assert _links(migration_db) == [(WEBHOOK_PSP_ID, PSP)]


# --------------------------------------------------------------------------
# Round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_webhook_constraints = _constraints(migration_db, 'report_webhooks')

    # -- 1. Upgrade, then change the sets as Release B would: the PSP
    # webhook gets BASE too (both -> the downgrade must pick BASE, not its
    # original PSP) and the BASE webhook loses its only badge (none -> the
    # downgrade must give NULL, not its original BASE).
    _upgrade(migration_db, REVISION)
    _apply(
        migration_db,
        [
            (
                _INSERT_LINK,
                {'report_webhook_id': WEBHOOK_PSP_ID, 'badge': BASE},
            ),
            (
                f'DELETE FROM {LINK} WHERE report_webhook_id = :id',
                {'id': WEBHOOK_BASE_ID},
            ),
        ],
    )
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)
    first_constraints = _constraints(migration_db, LINK)
    first_webhook_constraints = _constraints(migration_db, 'report_webhooks')
    first_webhooks = _webhooks(migration_db)
    first_links = _links(migration_db)
    assert first_links == [(WEBHOOK_PSP_ID, BASE), (WEBHOOK_PSP_ID, PSP)]

    # -- 2. Downgrade: badge rebuilt from the link rows, link table renamed
    # _old, nothing dropped.
    _downgrade(migration_db, PARENT_REVISION)

    assert _tables(migration_db) == parent_tables | {LINK_OLD}
    assert _columns(migration_db) == parent_columns | {
        (LINK_OLD, column) for column in LINK_COLUMNS
    }
    assert _constraints(migration_db, 'report_webhooks') == (
        parent_webhook_constraints
    )
    rebuilt = {
        WEBHOOK_NONE_ID: None,
        # No link row left -> NULL (its original was BASE).
        WEBHOOK_BASE_ID: None,
        # Holding both -> MIN(badge) = BASE (its original was PSP).
        WEBHOOK_PSP_ID: BASE,
    }
    down_webhooks = _webhooks(migration_db)
    assert {r['id']: r['badge'] for r in down_webhooks} == rebuilt
    # Every other value unchanged.
    assert _without(down_webhooks, 'badge') == _without(
        first_webhooks, 'badge_old'
    )
    # The full set is kept.
    assert _links(migration_db, LINK_OLD) == first_links
    assert _constraints(migration_db, LINK_OLD) == first_constraints

    # -- 3. Upgrade again: re-adopted, equal to the first, no duplicate.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _constraints(migration_db, LINK) == first_constraints
    assert _constraints(migration_db, 'report_webhooks') == (
        first_webhook_constraints
    )
    assert _links(migration_db) == first_links
    again = _webhooks(migration_db)
    assert _without(again, 'badge_old') == _without(first_webhooks, 'badge_old')
    # badge_old now holds what the downgraded release last had.
    assert {r['id']: r['badge_old'] for r in again} == rebuilt


def test_a_second_round_trip_keeps_the_rows(migration_db: str) -> None:
    _upgraded(migration_db)
    first_webhooks = _webhooks(migration_db)
    first_links = _links(migration_db)

    for _ in range(2):
        _downgrade(migration_db, PARENT_REVISION)
        _upgrade(migration_db, REVISION)

    assert _webhooks(migration_db) == first_webhooks
    assert _links(migration_db) == first_links
    assert LINK_OLD not in _tables(migration_db)
