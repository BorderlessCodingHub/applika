"""Round-trip test for catalog visibility and draft flag columns, revision
``3b78c3cd2a71`` (KODI-030, Release A).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres — upgrade to the
revision, downgrade to its parent ``583226ca46bc``, upgrade again — seeding
``users``, ``companies``, ``platforms`` and ``applications`` rows at the
parent revision and asserting the data after each step.

What the revision has to get right, and what is asserted here:

* every company, platform and application that exists at the parent revision
  becomes public / not-draft after the upgrade, values otherwise intact
  (AC1, ADR-0014 "every row that exists when the migration runs is public");
* an "old-shape" insert — one that never mentions the new columns, exactly
  what installed code still does in Release A — lands public / not draft by
  the column defaults alone (AC8, prod-release-runbook.md rule 4);
* two users may each hold a private company, or a private platform, with the
  same name (+ url for companies): both rows are kept (AC2 schema half);
  a duplicate **public** company is refused by
  ``uq_companies_public_name_url`` (AC2 schema half, IntegrityError) and a
  second private company for the same creator/name/url is refused by
  ``uq_companies_private_owner_name_url``; the platform equivalents mirror
  this except there is deliberately no public-platform index, so two public
  platforms with the same name are allowed;
* deleting the creating user nulls ``platforms.created_by``
  (``fk_platforms_created_by ... ON DELETE SET NULL``);
* no column or table is missing after upgrade, only the new ones added
  (AC7/migration-tests.md 4);
* the downgrade renames every new column to its ``*_old`` twin, the values
  travel with the rename, and it rebuilds a single company index: UNIQUE
  when no ``(lower(name), url)`` collision exists, non-unique
  (``ix_companies_name_url``) plus a logged warning naming the colliding ids
  when one does (ADR-0014 Decision, "Open 2");
* upgrading a second time renames the ``*_old`` columns back, restores every
  flag and reproduces the first upgrade's index set exactly
  (migration-tests.md 3).

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_retire_is_org_member.py``, and for the
same reasons.

Every user, company, platform and application here is invented.
"""

import asyncio
import importlib.util
import inspect
import logging
import re
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from types import ModuleType
from typing import Any
from unittest.mock import patch

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = '3b78c3cd2a71'
PARENT_REVISION = '583226ca46bc'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_catalog_visibility_and_drafts.py'
)
# The name Alembic's own loader (``alembic.util.pyfiles.load_python_file``)
# gives this revision's module: ``re.sub(r'\W', '_', filename)``. Used only
# to force this specific logger back on below — its ``.disabled`` flag is a
# process-global singleton that a previous test's real ``fileConfig`` call
# may have already flipped to ``True`` before this test ever runs.
_MIGRATION_LOGGER_NAME = re.sub(r'\W', '_', _MIGRATION_PATH.name)

USER_A_ID = 7500000000000000001
USER_B_ID = 7500000000000000002

COMPANY_A_ID = 7500000000000000102
NEW_COMPANY_ID = 7500000000000000103

PLATFORM_NO_URL_ID = 7500000000000000201
PLATFORM_A_ID = 7500000000000000202
NEW_PLATFORM_ID = 7500000000000000203

APPLICATION_ID = 7500000000000000301
NEW_APPLICATION_ID = 7500000000000000302


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
        'catalog_visibility_and_drafts_migration_under_test', _MIGRATION_PATH
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


def _indexes(url: str, table: str) -> set[str]:
    return {
        row['indexname']
        for row in _query(
            url,
            'SELECT indexname FROM pg_indexes '
            "WHERE schemaname = 'public' AND tablename = :table",
            {'table': table},
        )
    }


# --------------------------------------------------------------------------
# Seeding at the parent revision
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, created_at) '
    'VALUES (:id, :github_id, :username, :email, :years, :now)'
)

_INSERT_COMPANY = (
    'INSERT INTO companies (id, name, url, created_at) '
    'VALUES (:id, :name, :url, :now)'
)

_INSERT_PLATFORM = (
    'INSERT INTO platforms (id, name, url, created_at) '
    'VALUES (:id, :name, :url, :now)'
)

_INSERT_APPLICATION = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, company_id, company_name, '
    'application_date, role, mode, created_at) '
    'VALUES (:id, :user_id, :platform_id, :company_id, :company_name, '
    ':application_date, :role, :mode, :now)'
)


def _applika_placeholder_company_id(url: str) -> int:
    """The ``Applika.dev`` placeholder company is seeded by migration
    ``b2c3d4e5f6a1`` itself (it runs long before the parent revision), not
    by this test — inserting a second row with the same name/url would
    collide with the very ``uq_companies_name_url`` index this revision
    later replaces."""
    rows = _query(
        url,
        "SELECT id FROM companies WHERE name = 'Applika.dev'",
    )
    assert len(rows) == 1, rows
    return rows[0]['id']


def _seed_at_parent(url: str) -> int:
    """Two users, one extra company (with a real url, alongside the
    already-seeded Applika.dev placeholder), two platforms (one with a NULL
    url) and one application, all at ``583226ca46bc`` — before any of this
    revision's columns exist. Returns the placeholder company's id."""
    now = datetime.now(timezone.utc)
    applika_company_id = _applika_placeholder_company_id(url)
    _apply(
        url,
        [
            (
                _INSERT_USER,
                {
                    'id': USER_A_ID,
                    'github_id': 95101,
                    'username': 'catalog_user_a',
                    'email': 'catalog.a@example.com',
                    'years': 3,
                    'now': now,
                },
            ),
            (
                _INSERT_USER,
                {
                    'id': USER_B_ID,
                    'github_id': 95102,
                    'username': 'catalog_user_b',
                    'email': 'catalog.b@example.com',
                    'years': 5,
                    'now': now,
                },
            ),
            (
                _INSERT_COMPANY,
                {
                    'id': COMPANY_A_ID,
                    'name': 'Acme Corp',
                    'url': 'https://acme.example.com',
                    'now': now,
                },
            ),
            (
                _INSERT_PLATFORM,
                {
                    'id': PLATFORM_NO_URL_ID,
                    'name': 'Referral',
                    'url': None,
                    'now': now,
                },
            ),
            (
                _INSERT_PLATFORM,
                {
                    'id': PLATFORM_A_ID,
                    'name': 'LinkedIn',
                    'url': 'https://linkedin.com',
                    'now': now,
                },
            ),
            (
                _INSERT_APPLICATION,
                {
                    'id': APPLICATION_ID,
                    'user_id': USER_A_ID,
                    'platform_id': PLATFORM_A_ID,
                    'company_id': COMPANY_A_ID,
                    'company_name': 'Acme Corp',
                    'application_date': date(2026, 1, 5),
                    'role': 'Backend Engineer',
                    'mode': 'active',
                    'now': now,
                },
            ),
        ],
    )
    return applika_company_id


# --------------------------------------------------------------------------
# non-destructive-migrations.md — upgrade drops nothing, downgrade works
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing(migration_db: str) -> None:
    """Rule 2: ``op.drop_column``/``op.drop_table`` never appear anywhere in
    this revision; rule 1: ``downgrade()`` is real, not empty/pass."""
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


# --------------------------------------------------------------------------
# AC1 / AC7 — upgrade: everything public/not-draft, nothing missing
# --------------------------------------------------------------------------


def test_upgrade_only_adds_expected_columns_and_no_table_is_missing(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)

    _upgrade(migration_db, REVISION)

    tables_after = _tables(migration_db)
    columns_after = _columns(migration_db)

    assert tables_after == tables_before
    expected_new_columns = {
        ('companies', 'is_public'),
        ('platforms', 'is_public'),
        ('platforms', 'created_by'),
        ('applications', 'is_draft'),
    }
    assert columns_after == columns_before | expected_new_columns


def test_upgrade_marks_every_existing_row_public_and_not_draft(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    applika_company_id = _seed_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    # ``e3abe9dc93d4``/``b2c3d4e5f6a1`` already seed their own companies and
    # platforms rows (the Applika.dev placeholder and the built-in platform
    # catalog), so these assertions are scoped to the ids seeded above.
    companies = _query(
        migration_db,
        'SELECT id, name, url, is_public FROM companies '
        'WHERE id IN (:applika_id, :company_a)',
        {'applika_id': applika_company_id, 'company_a': COMPANY_A_ID},
    )
    assert {c['id']: c['is_public'] for c in companies} == {
        applika_company_id: True,
        COMPANY_A_ID: True,
    }
    # Values otherwise intact.
    acme = next(c for c in companies if c['id'] == COMPANY_A_ID)
    assert acme['name'] == 'Acme Corp'
    assert acme['url'] == 'https://acme.example.com'

    platforms = _query(
        migration_db,
        'SELECT id, name, url, is_public, created_by FROM platforms '
        'WHERE id IN (:no_url, :platform_a)',
        {'no_url': PLATFORM_NO_URL_ID, 'platform_a': PLATFORM_A_ID},
    )
    assert {p['id']: p['is_public'] for p in platforms} == {
        PLATFORM_NO_URL_ID: True,
        PLATFORM_A_ID: True,
    }
    assert all(p['created_by'] is None for p in platforms)
    no_url_platform = next(
        p for p in platforms if p['id'] == PLATFORM_NO_URL_ID
    )
    assert no_url_platform['url'] is None

    applications = _query(
        migration_db,
        'SELECT id, role, is_draft FROM applications WHERE id = :id',
        {'id': APPLICATION_ID},
    )
    assert {a['id']: a['is_draft'] for a in applications} == {
        APPLICATION_ID: False
    }
    assert applications[0]['role'] == 'Backend Engineer'


def test_old_shape_insert_lands_public_and_not_draft(
    migration_db: str,
) -> None:
    """AC8/prod-release-runbook.md 4: code that never mentions the new
    columns — exactly what still runs in Release A — keeps working, and the
    row it inserts is public/not-draft by the column defaults alone."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    _apply(
        migration_db,
        [
            (
                _INSERT_COMPANY,
                {
                    'id': NEW_COMPANY_ID,
                    'name': 'Old Shape Co',
                    'url': 'https://old-shape.example.com',
                    'now': now,
                },
            ),
            (
                _INSERT_PLATFORM,
                {
                    'id': NEW_PLATFORM_ID,
                    'name': 'Old Shape Platform',
                    'url': None,
                    'now': now,
                },
            ),
            (
                _INSERT_APPLICATION,
                {
                    'id': NEW_APPLICATION_ID,
                    'user_id': USER_A_ID,
                    'platform_id': NEW_PLATFORM_ID,
                    'company_id': NEW_COMPANY_ID,
                    'company_name': 'Old Shape Co',
                    'application_date': date(2026, 2, 1),
                    'role': 'Old shape role',
                    'mode': 'passive',
                    'now': now,
                },
            ),
        ],
    )

    company = _query(
        migration_db,
        'SELECT is_public FROM companies WHERE id = :id',
        {'id': NEW_COMPANY_ID},
    )
    assert company == [{'is_public': True}]
    platform = _query(
        migration_db,
        'SELECT is_public, created_by FROM platforms WHERE id = :id',
        {'id': NEW_PLATFORM_ID},
    )
    assert platform == [{'is_public': True, 'created_by': None}]
    application = _query(
        migration_db,
        'SELECT is_draft FROM applications WHERE id = :id',
        {'id': NEW_APPLICATION_ID},
    )
    assert application == [{'is_draft': False}]


# --------------------------------------------------------------------------
# AC2 (schema half) — scoped uniqueness
# --------------------------------------------------------------------------

_INSERT_COMPANY_SCOPED = (
    'INSERT INTO companies (id, name, url, is_public, created_by, created_at) '
    'VALUES (:id, :name, :url, :is_public, :created_by, :now)'
)

_INSERT_PLATFORM_SCOPED = (
    'INSERT INTO platforms (id, name, url, is_public, created_by, created_at) '
    'VALUES (:id, :name, :url, :is_public, :created_by, :now)'
)


def test_two_private_companies_same_name_and_url_are_kept(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    private_a = COMPANY_A_ID + 1
    private_b = COMPANY_A_ID + 2
    _apply(
        migration_db,
        [
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': private_a,
                    'name': 'Shared Startup',
                    'url': 'https://shared-startup.example.com',
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            ),
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': private_b,
                    'name': 'Shared Startup',
                    'url': 'https://shared-startup.example.com',
                    'is_public': False,
                    'created_by': USER_B_ID,
                    'now': now,
                },
            ),
        ],
    )

    rows = _query(
        migration_db,
        'SELECT id, created_by FROM companies WHERE id IN (:a, :b)',
        {'a': private_a, 'b': private_b},
    )
    assert {r['id'] for r in rows} == {private_a, private_b}


def test_same_creator_private_company_duplicate_is_refused(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    _apply(
        migration_db,
        [
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': COMPANY_A_ID + 3,
                    'name': 'Duplicate Co',
                    'url': 'https://duplicate.example.com',
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            )
        ],
    )
    _apply_expect_integrity_error(
        migration_db,
        _INSERT_COMPANY_SCOPED,
        {
            'id': COMPANY_A_ID + 4,
            'name': 'Duplicate Co',
            'url': 'https://duplicate.example.com',
            'is_public': False,
            'created_by': USER_A_ID,
            'now': now,
        },
    )


def test_two_public_companies_same_name_and_url_refused(
    migration_db: str,
) -> None:
    """AC2 schema half: a duplicate PUBLIC company is refused by the
    database — the admin-facing collision message is K2 (Release B) code,
    out of scope for this migration-only ticket."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    _apply(
        migration_db,
        [
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': COMPANY_A_ID + 5,
                    'name': 'Public Twice',
                    'url': 'https://public-twice.example.com',
                    'is_public': True,
                    'created_by': None,
                    'now': now,
                },
            )
        ],
    )
    _apply_expect_integrity_error(
        migration_db,
        _INSERT_COMPANY_SCOPED,
        {
            'id': COMPANY_A_ID + 6,
            'name': 'Public Twice',
            'url': 'https://public-twice.example.com',
            'is_public': True,
            'created_by': None,
            'now': now,
        },
    )


def test_two_private_platforms_same_name_are_kept(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    private_a = PLATFORM_A_ID + 1
    private_b = PLATFORM_A_ID + 2
    _apply(
        migration_db,
        [
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': private_a,
                    'name': 'Shared Board',
                    'url': None,
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            ),
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': private_b,
                    'name': 'Shared Board',
                    'url': None,
                    'is_public': False,
                    'created_by': USER_B_ID,
                    'now': now,
                },
            ),
        ],
    )

    rows = _query(
        migration_db,
        'SELECT id, created_by FROM platforms WHERE id IN (:a, :b)',
        {'a': private_a, 'b': private_b},
    )
    assert {r['id'] for r in rows} == {private_a, private_b}


def test_same_creator_private_platform_duplicate_is_refused(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    _apply(
        migration_db,
        [
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': PLATFORM_A_ID + 3,
                    'name': 'Duplicate Board',
                    'url': None,
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            )
        ],
    )
    _apply_expect_integrity_error(
        migration_db,
        _INSERT_PLATFORM_SCOPED,
        {
            'id': PLATFORM_A_ID + 4,
            'name': 'Duplicate Board',
            'url': None,
            'is_public': False,
            'created_by': USER_A_ID,
            'now': now,
        },
    )


def test_two_public_platforms_same_name_are_allowed(
    migration_db: str,
) -> None:
    """No public-platform uniqueness index — prod may already hold
    duplicate public platform names (T004)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    public_a = PLATFORM_A_ID + 5
    public_b = PLATFORM_A_ID + 6
    _apply(
        migration_db,
        [
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': public_a,
                    'name': 'Indeed',
                    'url': None,
                    'is_public': True,
                    'created_by': None,
                    'now': now,
                },
            ),
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': public_b,
                    'name': 'Indeed',
                    'url': None,
                    'is_public': True,
                    'created_by': None,
                    'now': now,
                },
            ),
        ],
    )

    rows = _query(
        migration_db,
        'SELECT id FROM platforms WHERE id IN (:a, :b)',
        {'a': public_a, 'b': public_b},
    )
    assert {r['id'] for r in rows} == {public_a, public_b}


def test_user_delete_nulls_platform_created_by(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    owned_platform = PLATFORM_A_ID + 7
    _apply(
        migration_db,
        [
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': owned_platform,
                    'name': 'Owned Board',
                    'url': None,
                    'is_public': False,
                    'created_by': USER_B_ID,
                    'now': now,
                },
            ),
            ('DELETE FROM users WHERE id = :id', {'id': USER_B_ID}),
        ],
    )

    row = _query(
        migration_db,
        'SELECT created_by FROM platforms WHERE id = :id',
        {'id': owned_platform},
    )
    assert row == [{'created_by': None}]


# --------------------------------------------------------------------------
# The round trip (clean downgrade branch)
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``583226ca46bc`` -> upgrade again, with a
    draft and private rows written between upgrade and downgrade so the
    ``*_old`` columns have real values to carry across the round trip
    (``.claude/rules/migration-tests.md`` 3)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)

    # -- 1. Upgrade.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    first_upgrade_tables = _tables(migration_db)
    first_upgrade_company_indexes = _indexes(migration_db, 'companies')
    first_upgrade_platform_indexes = _indexes(migration_db, 'platforms')
    first_upgrade_application_indexes = _indexes(migration_db, 'applications')

    assert first_upgrade_tables == parent_tables
    assert first_upgrade_columns == parent_columns | {
        ('companies', 'is_public'),
        ('platforms', 'is_public'),
        ('platforms', 'created_by'),
        ('applications', 'is_draft'),
    }
    assert 'uq_companies_public_name_url' in first_upgrade_company_indexes
    assert (
        'uq_companies_private_owner_name_url' in first_upgrade_company_indexes
    )
    assert 'uq_platforms_private_owner_name' in first_upgrade_platform_indexes
    assert 'ix_platforms_created_by' in first_upgrade_platform_indexes
    assert 'ix_applications_user_id_drafts' in first_upgrade_application_indexes

    # Mark a draft and a private row via plain SQL, as the pending K2 code
    # would once it exists.
    now = datetime.now(timezone.utc)
    private_company = COMPANY_A_ID + 10
    _apply(
        migration_db,
        [
            (
                'UPDATE applications SET is_draft = true WHERE id = :id',
                {'id': APPLICATION_ID},
            ),
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': private_company,
                    'name': 'Round Trip Co',
                    'url': 'https://round-trip.example.com',
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            ),
        ],
    )

    # -- 2. Downgrade: *_old columns hold the marked values, originals
    #       (the ones this revision restores) are intact, and — no
    #       duplicate (lower(name), url) group exists — the global unique
    #       index is restored.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns | {
        ('companies', 'is_public_old'),
        ('platforms', 'is_public_old'),
        ('platforms', 'created_by_old'),
        ('applications', 'is_draft_old'),
    }
    assert _tables(migration_db) == parent_tables
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]

    draft_value = _query(
        migration_db,
        'SELECT is_draft_old FROM applications WHERE id = :id',
        {'id': APPLICATION_ID},
    )
    assert draft_value == [{'is_draft_old': True}]
    # ``companies.created_by`` is pre-existing (unrelated to this ticket) and
    # is never renamed; only ``is_public`` moves to ``is_public_old`` here.
    private_company_row = _query(
        migration_db,
        'SELECT is_public_old, created_by FROM companies WHERE id = :id',
        {'id': private_company},
    )
    assert private_company_row == [
        {'is_public_old': False, 'created_by': USER_A_ID}
    ]
    downgrade_company_indexes = _indexes(migration_db, 'companies')
    assert 'uq_companies_name_url' in downgrade_company_indexes
    assert 'ix_companies_name_url' not in downgrade_company_indexes
    assert 'uq_companies_public_name_url' not in downgrade_company_indexes
    assert (
        'uq_companies_private_owner_name_url' not in downgrade_company_indexes
    )

    # -- 3. Upgrade again: *_old renamed back, flags restored, index set
    #       identical to the first upgrade.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    assert _tables(migration_db) == first_upgrade_tables
    second_upgrade_company_indexes = _indexes(migration_db, 'companies')
    assert second_upgrade_company_indexes == first_upgrade_company_indexes
    assert 'ix_companies_name_url' not in second_upgrade_company_indexes
    assert _indexes(migration_db, 'platforms') == first_upgrade_platform_indexes
    assert (
        _indexes(migration_db, 'applications')
        == first_upgrade_application_indexes
    )

    restored_draft = _query(
        migration_db,
        'SELECT is_draft FROM applications WHERE id = :id',
        {'id': APPLICATION_ID},
    )
    assert restored_draft == [{'is_draft': True}]
    restored_private_company = _query(
        migration_db,
        'SELECT is_public, created_by FROM companies WHERE id = :id',
        {'id': private_company},
    )
    assert restored_private_company == [
        {'is_public': False, 'created_by': USER_A_ID}
    ]


# --------------------------------------------------------------------------
# The downgrade duplicate branch
# --------------------------------------------------------------------------


def test_downgrade_with_duplicate_companies_builds_non_unique_index_and_logs(
    migration_db: str, caplog: pytest.LogCaptureFixture
) -> None:
    """A public company and a private company can share ``(lower(name),
    url)`` after the upgrade (they sit in different partial indexes); on
    downgrade that pair collides under the pre-feature global unique index,
    so the migration must fall back to a non-unique index, keep both rows,
    and log the colliding ids (ADR-0014 Decision, 'Open 2')."""
    # ``migrations/env.py`` calls ``logging.config.fileConfig`` on every
    # single alembic command. Its real implementation replaces the root
    # logger's handlers outright (``disable_existing_loggers`` defaults to
    # ``True`` and it rebuilds the handler list from the ini), which strips
    # pytest's own ``caplog`` handler off the root logger the first time any
    # alembic command runs in this test — after that, no later log record
    # would ever reach ``caplog``, from this revision or any other. This
    # neutralises ``fileConfig`` for every alembic call in this test, the
    # same problem ``tests/conftest.py``'s ``_app_logger_enabled`` fixture
    # works around for the ``app`` logger during ordinary API tests. A
    # previous test in this same process may also have already disabled
    # this exact module logger for real, before this test's patch ever
    # takes effect — force it back on too.
    logging.getLogger(_MIGRATION_LOGGER_NAME).disabled = False
    with patch('logging.config.fileConfig'), caplog.at_level(logging.WARNING):
        _upgrade(migration_db, PARENT_REVISION)
        _seed_at_parent(migration_db)
        _upgrade(migration_db, REVISION)
        first_upgrade_company_indexes = _indexes(migration_db, 'companies')

        now = datetime.now(timezone.utc)
        public_row = COMPANY_A_ID + 20
        private_row = COMPANY_A_ID + 21
        _apply(
            migration_db,
            [
                (
                    _INSERT_COMPANY_SCOPED,
                    {
                        'id': public_row,
                        'name': 'Colliding Co',
                        'url': 'https://colliding.example.com',
                        'is_public': True,
                        'created_by': None,
                        'now': now,
                    },
                ),
                (
                    _INSERT_COMPANY_SCOPED,
                    {
                        'id': private_row,
                        'name': 'Colliding Co',
                        'url': 'https://colliding.example.com',
                        'is_public': False,
                        'created_by': USER_A_ID,
                        'now': now,
                    },
                ),
            ],
        )

        _downgrade(migration_db, PARENT_REVISION)

        downgrade_company_indexes = _indexes(migration_db, 'companies')
        assert 'ix_companies_name_url' in downgrade_company_indexes
        assert 'uq_companies_name_url' not in downgrade_company_indexes

        rows = _query(
            migration_db,
            'SELECT id FROM companies WHERE id IN (:a, :b)',
            {'a': public_row, 'b': private_row},
        )
        assert {r['id'] for r in rows} == {public_row, private_row}

        logged = [record.getMessage() for record in caplog.records]
        assert any(
            str(public_row) in message and str(private_row) in message
            for message in logged
        ), caplog.text

        # migration-tests.md 3: upgrading again from the *non-unique*
        # duplicate branch must still reproduce the first upgrade's index
        # set exactly — ``ix_companies_name_url`` dropped, the two scoped
        # partial indexes back, and both colliding rows keeping the
        # visibility/ownership the upgrade gives them (T007's "upgrade
        # again -> ... ix_companies_name_url gone", proven on this branch
        # too, not only on the no-duplicate one covered by
        # ``test_round_trip_upgrade_downgrade_upgrade``).
        _upgrade(migration_db, REVISION)

        second_upgrade_company_indexes = _indexes(migration_db, 'companies')
        assert second_upgrade_company_indexes == first_upgrade_company_indexes
        assert 'ix_companies_name_url' not in second_upgrade_company_indexes

        restored_rows = _query(
            migration_db,
            'SELECT id, is_public, created_by FROM companies '
            'WHERE id IN (:a, :b) ORDER BY id',
            {'a': public_row, 'b': private_row},
        )
        assert restored_rows == [
            {'id': public_row, 'is_public': True, 'created_by': None},
            {'id': private_row, 'is_public': False, 'created_by': USER_A_ID},
        ]


# --------------------------------------------------------------------------
# Owner decision, 2026-09-26 — upgrade() pre-checks duplicate public
# companies before building uq_companies_public_name_url
# --------------------------------------------------------------------------


def test_upgrade_refuses_duplicate_public_companies_with_clear_message(
    migration_db: str,
) -> None:
    """After a rollback onto the non-unique ``ix_companies_name_url``
    branch, old code can insert a new public company that duplicates an
    existing ``(lower(name), url)`` pair. The next ``alembic upgrade head``
    must stop with a clear ``RuntimeError`` naming
    ``uq_companies_public_name_url`` and both colliding ids — not a raw
    Postgres unique-violation — and must leave the schema exactly as the
    downgraded state, nothing half-applied."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    public_row = COMPANY_A_ID + 30
    private_row = COMPANY_A_ID + 31
    _apply(
        migration_db,
        [
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': public_row,
                    'name': 'Pending Dup Co',
                    'url': 'https://pending-dup.example.com',
                    'is_public': True,
                    'created_by': None,
                    'now': now,
                },
            ),
            (
                _INSERT_COMPANY_SCOPED,
                {
                    'id': private_row,
                    'name': 'Pending Dup Co',
                    'url': 'https://pending-dup.example.com',
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            ),
        ],
    )

    # This pair collides on (lower(name), url) across the whole table (one
    # public, one private), which forces downgrade()'s non-unique
    # ix_companies_name_url branch — the state a rollback actually leaves in
    # production.
    _downgrade(migration_db, PARENT_REVISION)
    downgraded_columns = _columns(migration_db)
    downgraded_indexes = _indexes(migration_db, 'companies')
    assert 'ix_companies_name_url' in downgraded_indexes
    assert 'uq_companies_name_url' not in downgraded_indexes

    # Old code — unaware of is_public_old — inserts a second row that
    # duplicates the *public* row's (lower(name), url); the non-unique index
    # allows it.
    new_public_duplicate = COMPANY_A_ID + 32
    _apply(
        migration_db,
        [
            (
                _INSERT_COMPANY,
                {
                    'id': new_public_duplicate,
                    'name': 'Pending Dup Co',
                    'url': 'https://pending-dup.example.com',
                    'now': now,
                },
            ),
        ],
    )

    with pytest.raises(RuntimeError) as excinfo:
        _upgrade(migration_db, REVISION)

    message = str(excinfo.value)
    assert 'uq_companies_public_name_url' in message
    assert str(public_row) in message
    assert str(new_public_duplicate) in message
    # The private row does not collide under is_public_old and must not be
    # named as part of this group.
    assert str(private_row) not in message

    # Nothing half-applied: still exactly the downgraded state.
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _columns(migration_db) == downgraded_columns
    assert _indexes(migration_db, 'companies') == downgraded_indexes
    rows = _query(
        migration_db,
        'SELECT id FROM companies WHERE id IN (:a, :b, :c)',
        {'a': public_row, 'b': private_row, 'c': new_public_duplicate},
    )
    assert {r['id'] for r in rows} == {
        public_row,
        private_row,
        new_public_duplicate,
    }

    # Resolve the duplicate by hand, then upgrade succeeds.
    _apply(
        migration_db,
        [
            (
                'DELETE FROM companies WHERE id = :id',
                {'id': new_public_duplicate},
            ),
        ],
    )
    _upgrade(migration_db, REVISION)
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': REVISION}
    ]


def test_upgrade_pre_check_does_not_fire_without_duplicates(
    migration_db: str,
) -> None:
    """The clean path (no duplicate public companies) is unchanged: the
    pre-check finds nothing and every regular index/column assertion from
    the round-trip test above still holds after a second clean upgrade."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)

    downgrade_indexes = _indexes(migration_db, 'companies')
    assert 'uq_companies_name_url' in downgrade_indexes
    assert 'ix_companies_name_url' not in downgrade_indexes

    _upgrade(migration_db, REVISION)

    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': REVISION}
    ]
    upgraded_indexes = _indexes(migration_db, 'companies')
    assert 'uq_companies_public_name_url' in upgraded_indexes


# --------------------------------------------------------------------------
# N2 — a private platform (is_public false, created_by set) survives the
# clean round trip
# --------------------------------------------------------------------------


def test_round_trip_carries_a_private_platform(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    now = datetime.now(timezone.utc)
    private_platform = PLATFORM_A_ID + 8
    _apply(
        migration_db,
        [
            (
                _INSERT_PLATFORM_SCOPED,
                {
                    'id': private_platform,
                    'name': 'My Private Board',
                    'url': None,
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            ),
        ],
    )

    _downgrade(migration_db, PARENT_REVISION)
    row = _query(
        migration_db,
        'SELECT is_public_old, created_by_old FROM platforms WHERE id = :id',
        {'id': private_platform},
    )
    assert row == [{'is_public_old': False, 'created_by_old': USER_A_ID}]

    _upgrade(migration_db, REVISION)
    row = _query(
        migration_db,
        'SELECT is_public, created_by FROM platforms WHERE id = :id',
        {'id': private_platform},
    )
    assert row == [{'is_public': False, 'created_by': USER_A_ID}]


# --------------------------------------------------------------------------
# non-destructive-migrations.md rule 7 — Release A's columns, mapped only
# where the owning release says so
# --------------------------------------------------------------------------


def test_orm_maps_only_what_its_own_release_ships() -> None:
    """Release A (this revision) shipped no ORM change. Release B (K2,
    KODI-031) mapped ``is_public`` on both tables and ``created_by`` on
    ``platforms``; S3 (KODI-032, drafts) later mapped ``is_draft`` on
    ``applications`` - this test now confirms all four are mapped."""
    from app.domain.models import ApplicationModel, CompanyModel, PlatformModel

    company_columns = {c.name for c in CompanyModel.__table__.columns}
    platform_columns = {c.name for c in PlatformModel.__table__.columns}
    application_columns = {c.name for c in ApplicationModel.__table__.columns}

    assert 'is_public' in company_columns
    assert 'is_public' in platform_columns
    assert 'created_by' in platform_columns
    assert 'is_draft' in application_columns
