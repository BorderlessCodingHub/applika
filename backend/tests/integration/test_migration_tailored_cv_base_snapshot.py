"""Round-trip test for the ``tailored_cvs.base_snapshot`` revision
``c1d9f4a7b3e6`` (R5, KODI-017 part 2).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres — upgrade to the
revision, downgrade to its parent ``ad747aba90fc``, upgrade again — seeding a
row before the upgrade and asserting the data after each step.

What the revision has to get right, and what is asserted here:

* the column is purely additive: ``op.add_column`` only, nothing renamed and
  nothing dropped in ``upgrade()`` (non-destructive-migrations.md 2);
* ``base_snapshot`` arrives JSONB, nullable, with **no** server default and
  **no backfill** — an existing row seeded before the upgrade reads back
  ``base_snapshot IS NULL`` after it, not ``'{}'::jsonb`` and not some
  synthesized value;
* a row written *after* the upgrade can store and read back a JSONB
  document under the column, field for field;
* ``downgrade()`` drops exactly the column this revision added, and nothing
  else — no other column, no other table, no data on any other column is
  lost (non-destructive-migrations.md 1, an empty/``pass`` downgrade is
  forbidden);
* the second upgrade is identical to the first, schema and data
  (migration-tests.md 3).

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is the same as
``tests/integration/test_migration_cv_period.py``, and for the same reasons.

Every CV here is invented.
"""

import asyncio
import importlib.util
import inspect
import json
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
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = 'c1d9f4a7b3e6'
PARENT_REVISION = 'ad747aba90fc'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_tailored_cv_base_snapshot.py'
)

USER_ID = 7200000000000000001
PLATFORM_ID = 7200000000000000002
APPLICATION_ID = 7200000000000000003
BASE_CV_ID = 7200000000000000004
TAILORED_CV_ID = 7200000000000000005
SECOND_TAILORED_CV_ID = 7200000000000000006
SECOND_APPLICATION_ID = 7200000000000000007

_CV_SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

_SNAPSHOT_DOCUMENT = {
    'name': 'Backend CV',
    'full_name': 'Ada Lovelace',
    'headline': 'Staff Backend Engineer',
    'location': 'Lisbon, PT',
    'email': 'ada@example.com',
    'phone': None,
    'summary': 'Ten years of backend engineering.',
    'links': [],
    'skills': [
        {'id': 'skl-1', 'category': 'Languages', 'keywords': ['Python']}
    ],
    'experience': [],
    'projects': [],
    'education': [],
    'certifications': [],
    'languages': [],
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
        'tailored_cv_base_snapshot_migration_under_test', _MIGRATION_PATH
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


_SECTION_COLUMNS = ', '.join(_CV_SECTIONS)
_SECTION_CASTS = ', '.join(f'CAST(:{name} AS jsonb)' for name in _CV_SECTIONS)

_INSERT_TAILORED_CV = (
    'INSERT INTO tailored_cvs '
    '(id, user_id, application_id, base_cv_id, name, full_name, headline, '
    f'location, email, phone, summary, {_SECTION_COLUMNS}, '
    'was_ai_generated, adjustments, created_at) '
    'VALUES (:id, :user_id, :application_id, :base_cv_id, :name, :full_name, '
    ':headline, :location, :email, :phone, :summary, '
    f'{_SECTION_CASTS}, :was_ai_generated, CAST(:adjustments AS jsonb), :now)'
)


def _tailored_cv_payload(cv_id: int) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    return {
        'id': cv_id,
        'user_id': USER_ID,
        'application_id': APPLICATION_ID,
        'base_cv_id': BASE_CV_ID,
        'name': 'Tailored CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Staff Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': None,
        'summary': 'Ten years of backend engineering.',
        'links': json.dumps([]),
        'skills': json.dumps([]),
        'experience': json.dumps([]),
        'projects': json.dumps([]),
        'education': json.dumps([]),
        'certifications': json.dumps([]),
        'languages': json.dumps([]),
        'was_ai_generated': False,
        'adjustments': json.dumps([]),
        'now': now,
    }


def _seed_at_parent(url: str) -> None:
    """A user, a platform, a master CV, an application and one CV copy."""
    now = datetime.now(timezone.utc)
    _apply(
        url,
        [
            (
                'INSERT INTO users '
                '(id, github_id, username, email, experience_years, '
                'created_at) '
                'VALUES (:id, :github_id, :username, :email, :years, :now)',
                {
                    'id': USER_ID,
                    'github_id': 90201,
                    'username': 'base_snapshot_user',
                    'email': 'base.snapshot@example.com',
                    'years': 5,
                    'now': now,
                },
            ),
            (
                'INSERT INTO platforms (id, name, created_at) '
                'VALUES (:id, :name, :now)',
                {'id': PLATFORM_ID, 'name': 'LinkedIn', 'now': now},
            ),
            (
                'INSERT INTO applications '
                '(id, user_id, platform_id, application_date, role, mode, '
                'company_name, created_at) '
                'VALUES (:id, :user_id, :platform_id, :application_date, '
                ':role, :mode, :company_name, :now)',
                {
                    'id': APPLICATION_ID,
                    'user_id': USER_ID,
                    'platform_id': PLATFORM_ID,
                    'application_date': date(2026, 9, 1),
                    'role': 'Senior Backend Engineer',
                    'mode': 'active',
                    'company_name': 'Acme Corp',
                    'now': now,
                },
            ),
            (
                'INSERT INTO base_cvs '
                '(id, user_id, name, full_name, headline, location, email, '
                'summary, created_at) '
                'VALUES (:id, :user_id, :name, :full_name, :headline, '
                ':location, :email, :summary, :now)',
                {
                    'id': BASE_CV_ID,
                    'user_id': USER_ID,
                    'name': 'Backend CV',
                    'full_name': 'Ada Lovelace',
                    'headline': 'Staff Backend Engineer',
                    'location': 'Lisbon, PT',
                    'email': 'ada@example.com',
                    'summary': 'Ten years of backend engineering.',
                    'now': now,
                },
            ),
        ],
    )
    _apply(url, [(_INSERT_TAILORED_CV, _tailored_cv_payload(TAILORED_CV_ID))])


def _base_snapshot_of(url: str, cv_id: int) -> Any:
    rows = _query(
        url,
        'SELECT base_snapshot FROM tailored_cvs WHERE id = :id',
        {'id': cv_id},
    )
    assert len(rows) == 1, rows
    value = rows[0]['base_snapshot']
    return json.loads(value) if isinstance(value, str) else value


# --------------------------------------------------------------------------
# non-destructive-migrations.md — upgrade drops nothing, downgrade works
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing(migration_db: str) -> None:
    """Rule 2 at the source: ``op.drop_*`` lives only in ``downgrade``."""
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)

    assert 'op.drop_column' not in upgrade_source
    assert 'op.drop_table' not in upgrade_source
    assert 'op.drop_constraint' not in upgrade_source
    assert 'op.drop_index' not in upgrade_source
    assert 'op.drop_column' in inspect.getsource(module.downgrade)
    assert 'pass' not in inspect.getsource(module.downgrade)


def test_the_revision_is_a_new_child_at_head(migration_db: str) -> None:
    """The owner-accepted exception: a new revision at head, after R2."""
    module = _load_migration_module()

    assert module.revision == REVISION, module.revision
    assert module.down_revision == PARENT_REVISION, module.down_revision


def test_upgrade_adds_only_the_new_column(migration_db: str) -> None:
    """Nothing else in the schema moves - purely additive."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    before = _columns(migration_db)

    _upgrade(migration_db, REVISION)

    after = _columns(migration_db)
    assert after - before == {('tailored_cvs', 'base_snapshot')}, after - before
    assert before - after == set(), before - after


def test_the_new_column_is_jsonb_nullable_no_default(
    migration_db: str,
) -> None:
    """No ``server_default``: this revision explicitly does not backfill."""
    _upgrade(migration_db, REVISION)

    definition = _query(
        migration_db,
        'SELECT data_type, is_nullable, column_default '
        'FROM information_schema.columns '
        "WHERE table_name = 'tailored_cvs' AND column_name = 'base_snapshot'",
    )
    assert definition == [
        {'data_type': 'jsonb', 'is_nullable': 'YES', 'column_default': None}
    ], definition


# --------------------------------------------------------------------------
# No backfill
# --------------------------------------------------------------------------


def test_a_row_seeded_before_the_upgrade_has_no_snapshot_after_it(
    migration_db: str,
) -> None:
    """The owner's ruling: "no backfill (existing copies have none)"."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    assert _base_snapshot_of(migration_db, TAILORED_CV_ID) is None


def test_a_row_written_after_the_upgrade_can_store_a_snapshot(
    migration_db: str,
) -> None:
    """The column is writable and round-trips a full document."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    # A second, distinct application: ``uq_tailored_cvs_application_id``
    # allows at most one copy per application.
    now = datetime.now(timezone.utc)
    _apply(
        migration_db,
        [
            (
                'INSERT INTO applications '
                '(id, user_id, platform_id, application_date, role, mode, '
                'company_name, created_at) '
                'VALUES (:id, :user_id, :platform_id, :application_date, '
                ':role, :mode, :company_name, :now)',
                {
                    'id': SECOND_APPLICATION_ID,
                    'user_id': USER_ID,
                    'platform_id': PLATFORM_ID,
                    'application_date': date(2026, 9, 2),
                    'role': 'Another Role',
                    'mode': 'active',
                    'company_name': 'Acme Corp',
                    'now': now,
                },
            )
        ],
    )

    payload = _tailored_cv_payload(SECOND_TAILORED_CV_ID)
    payload['application_id'] = SECOND_APPLICATION_ID
    _apply(
        migration_db,
        [
            (
                'INSERT INTO tailored_cvs '
                '(id, user_id, application_id, base_cv_id, name, full_name, '
                'headline, location, email, phone, summary, '
                f'{_SECTION_COLUMNS}, was_ai_generated, adjustments, '
                'base_snapshot, created_at) '
                'VALUES (:id, :user_id, :application_id, :base_cv_id, '
                ':name, :full_name, :headline, :location, :email, :phone, '
                f':summary, {_SECTION_CASTS}, :was_ai_generated, '
                'CAST(:adjustments AS jsonb), '
                'CAST(:base_snapshot AS jsonb), :now)',
                {**payload, 'base_snapshot': json.dumps(_SNAPSHOT_DOCUMENT)},
            )
        ],
    )

    assert _base_snapshot_of(migration_db, SECOND_TAILORED_CV_ID) == (
        _SNAPSHOT_DOCUMENT
    )


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``ad747aba90fc`` -> upgrade again.

    Data asserted after every step, as
    ``.claude/rules/migration-tests.md`` 3 requires.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_columns = _columns(migration_db)

    # -- 1. Upgrade: the column exists, no backfill, no other column moved.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    assert ('tailored_cvs', 'base_snapshot') in first_upgrade_columns
    assert _base_snapshot_of(migration_db, TAILORED_CV_ID) is None

    # -- 2. Downgrade: exactly the column this revision added disappears,
    #       nothing else does, and every other field of the seeded row is
    #       untouched.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    row = _query(
        migration_db,
        'SELECT full_name, headline, summary FROM tailored_cvs WHERE id = :id',
        {'id': TAILORED_CV_ID},
    )
    assert row == [
        {
            'full_name': 'Ada Lovelace',
            'headline': 'Staff Backend Engineer',
            'summary': 'Ten years of backend engineering.',
        }
    ], row

    # -- 3. Upgrade again: identical to the first upgrade, schema and data.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    assert _base_snapshot_of(migration_db, TAILORED_CV_ID) is None


def test_no_orm_model_maps_an_old_column() -> None:
    """non-destructive-migrations.md 7 - this revision creates no ``_old``
    object, so there is nothing for the ORM to accidentally map."""
    from app.domain.models import TailoredCVModel

    mapped = {column.name for column in TailoredCVModel.__table__.columns}
    assert 'base_snapshot' in mapped
    assert not [name for name in mapped if name.endswith('_old')], mapped
