"""Round-trip test for the CV builder revision ``f2a9c1d4b6e8``.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic chain**
(``alembic.command.upgrade`` / ``alembic.command.downgrade``) against a
dedicated testcontainers Postgres — upgrade to the revision, downgrade to its
parent, upgrade again — seeding rows before the upgrade and asserting the data
after each step.

Two hazards of this repo are worked around here, not papered over:

1. ``migrations/env.py`` unconditionally overwrites ``sqlalchemy.url`` from
   ``app.config.settings.envs.DATABASE_URL``, so the container is wired in by
   patching that attribute (and restoring it afterwards), not by
   ``Config.set_main_option``.
2. ``env.py`` calls ``asyncio.run()``, which explodes inside a running loop.
   ``asyncio_mode = "auto"`` only wraps ``async def`` tests, so every test here
   is a plain synchronous ``def`` and every database round-trip goes through
   :func:`_run`.

The container is dedicated and module-scoped: the shared ``create_all`` schema
container from ``tests/conftest.py`` is never touched.
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = 'f2a9c1d4b6e8'
PARENT_REVISION = 'a1b2c3d4e5f7'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_cv_builder_tables.py'
)

# Seed ids are explicit: ADR-0003 says every PK is a Snowflake BigInteger
# generated in Python, so there is no sequence to fall back on.
USER_ID = 7000000000000000001
PLATFORM_ID = 7000000000000000002
APPLICATION_ID = 7000000000000000003
BASE_CV_ID = 7000000000000000004
TAILORED_CV_ID = 7000000000000000005
OTHER_TAILORED_CV_ID = 7000000000000000006

_CV_SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'certifications',
    'languages',
)


@pytest.fixture(autouse=True)
def reset_pk_sequences() -> None:
    """Neutralise the directory-wide autouse fixture for this module.

    ``tests/integration/conftest.py`` declares an autouse
    ``reset_pk_sequences(db_session)`` that would drag the shared
    ``create_all`` schema container into every test here. These tests own their
    own container and their own schema, so the fixture is shadowed by this
    no-op override (the conftest itself stays untouched).
    """
    return None


# --------------------------------------------------------------------------
# Container / connection plumbing
# --------------------------------------------------------------------------


@pytest.fixture(scope='module')
def migration_container() -> Iterator[PostgresContainer]:
    """A dedicated Postgres 16, isolated from the shared schema container."""
    container = PostgresContainer('postgres:16', driver='asyncpg')
    container.start()
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture
def migration_db(migration_container: PostgresContainer) -> str:
    """A blank public schema for each test, on the shared container."""
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
    """Drive a coroutine from a synchronous test (no loop is running)."""
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
    """Point ``migrations/env.py`` at the test container, then put it back."""
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
        'cv_builder_migration_under_test', _MIGRATION_PATH
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
_TABLES_SQL = (
    'SELECT table_name FROM information_schema.tables '
    "WHERE table_schema = 'public'"
)


def _columns(url: str) -> set[tuple[str, str]]:
    return {
        (row['table_name'], row['column_name'])
        for row in _query(url, _COLUMNS_SQL)
    }


def _tables(url: str) -> set[str]:
    return {row['table_name'] for row in _query(url, _TABLES_SQL)}


def _seed_at_parent(url: str) -> None:
    """Seed a user + platform + application with raw SQL.

    Raw SQL on purpose: the ORM models describe the schema as it will be, not
    the schema at ``a1b2c3d4e5f7``.
    """
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
                    'github_id': 90001,
                    'username': 'cv_builder_user',
                    'email': 'cv.builder@example.com',
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
                'company_name, observation, created_at) '
                'VALUES (:id, :user_id, :platform_id, :application_date, '
                ':role, :mode, :company_name, :observation, :now)',
                {
                    'id': APPLICATION_ID,
                    'user_id': USER_ID,
                    'platform_id': PLATFORM_ID,
                    'application_date': date(2026, 9, 1),
                    'role': 'Senior Backend Engineer',
                    'mode': 'active',
                    'company_name': 'Acme Corp',
                    'observation': 'seeded before the upgrade',
                    'now': now,
                },
            ),
        ],
    )


def _application_row(url: str) -> dict[str, Any]:
    rows = _query(
        url,
        'SELECT id, user_id, platform_id, application_date, role, mode, '
        'company_name, observation FROM applications WHERE id = :id',
        {'id': APPLICATION_ID},
    )
    assert len(rows) == 1
    return rows[0]


_EXPECTED_APPLICATION = {
    'id': APPLICATION_ID,
    'user_id': USER_ID,
    'platform_id': PLATFORM_ID,
    'application_date': date(2026, 9, 1),
    'role': 'Senior Backend Engineer',
    'mode': 'active',
    'company_name': 'Acme Corp',
    'observation': 'seeded before the upgrade',
}


def _cv_payload(prefix: str) -> dict[str, Any]:
    return {
        'name': f'{prefix} CV',
        'full_name': 'Ada Lovelace',
        'headline': 'Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': None,
        'summary': f'{prefix} summary',
        'links': json.dumps([{'label': 'site', 'url': 'https://ada.dev'}]),
        'skills': json.dumps(['python', 'postgres']),
        'experience': json.dumps([{'company': 'Acme', 'years': 3}]),
        'projects': json.dumps([{'name': 'applika'}]),
        'certifications': json.dumps(['AWS SAA']),
        'languages': json.dumps(['en', 'pt']),
    }


_SECTION_COLUMNS = ', '.join(_CV_SECTIONS)
_SECTION_CASTS = ', '.join(f'CAST(:{name} AS jsonb)' for name in _CV_SECTIONS)

_INSERT_BASE_CV = (
    'INSERT INTO base_cvs '
    '(id, user_id, name, full_name, headline, location, email, phone, '
    f'summary, {_SECTION_COLUMNS}, created_at) '
    'VALUES (:id, :user_id, :name, :full_name, :headline, :location, '
    f':email, :phone, :summary, {_SECTION_CASTS}, :now)'
)

_INSERT_TAILORED_CV = (
    'INSERT INTO tailored_cvs '
    '(id, user_id, application_id, base_cv_id, name, full_name, headline, '
    f'location, email, phone, summary, {_SECTION_COLUMNS}, '
    'was_ai_generated, adjustments, created_at) '
    'VALUES (:id, :user_id, :application_id, :base_cv_id, :name, :full_name, '
    ':headline, :location, :email, :phone, :summary, '
    f'{_SECTION_CASTS}, :was_ai_generated, CAST(:adjustments AS jsonb), :now)'
)


def _insert_base_cv(url: str) -> None:
    params = _cv_payload('Master')
    params.update(
        {
            'id': BASE_CV_ID,
            'user_id': USER_ID,
            'now': datetime.now(timezone.utc),
        }
    )
    _apply(url, [(_INSERT_BASE_CV, params)])


def _insert_tailored_cv(
    url: str,
    cv_id: int = TAILORED_CV_ID,
    application_id: int = APPLICATION_ID,
    base_cv_id: int | None = BASE_CV_ID,
) -> None:
    params = _cv_payload('Tailored')
    params.update(
        {
            'id': cv_id,
            'user_id': USER_ID,
            'application_id': application_id,
            'base_cv_id': base_cv_id,
            'was_ai_generated': False,
            'adjustments': json.dumps(['rewrote the summary for Acme']),
            'now': datetime.now(timezone.utc),
        }
    )
    _apply(url, [(_INSERT_TAILORED_CV, params)])


# --------------------------------------------------------------------------
# AC4 / AC6 — upgrade is additive and drops nothing
# --------------------------------------------------------------------------


def test_upgrade_is_additive_and_drops_no_column_or_table(
    migration_db: str,
) -> None:
    """AC4 + AC6: nothing pre-existing disappears; the new objects appear."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    after_tables = _tables(migration_db)

    # migration-tests.md 4: no column and no table went missing.
    assert before_columns <= after_columns
    assert before_tables <= after_tables
    # Nothing was renamed to `_old` either: this revision retires nothing.
    assert not [name for name in after_tables if name.endswith('_old')]
    assert not [
        column for _, column in after_columns if column.endswith('_old')
    ]

    # The additions, and only the additions.
    assert after_tables - before_tables == {'base_cvs', 'tailored_cvs'}
    new_application_columns = {
        column
        for table, column in after_columns - before_columns
        if table == 'applications'
    }
    assert new_application_columns == {'job_description'}

    # The seeded application survived untouched, with a NULL job_description.
    assert _application_row(migration_db) == _EXPECTED_APPLICATION
    assert _query(
        migration_db,
        'SELECT job_description FROM applications WHERE id = :id',
        {'id': APPLICATION_ID},
    ) == [{'job_description': None}]


def test_upgrade_source_contains_no_drop(migration_db: str) -> None:
    """AC4, at the source: ``op.drop_*`` appears only inside ``downgrade``."""
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)

    assert 'op.drop_column' not in upgrade_source
    assert 'op.drop_table' not in upgrade_source
    assert 'op.drop_constraint' not in upgrade_source
    assert 'op.drop_index' not in upgrade_source


# --------------------------------------------------------------------------
# AC3 / AC5 — the real Alembic round trip
# --------------------------------------------------------------------------


def test_downgrade_is_implemented(migration_db: str) -> None:
    """AC3: ``downgrade()`` has a real body, not ``pass`` and not empty."""
    module = _load_migration_module()
    body = [
        line.strip()
        for line in inspect.getsource(module.downgrade).splitlines()[1:]
        if line.strip() and not line.strip().startswith('#')
    ]

    assert body, 'downgrade() is empty'
    assert body != ['pass'], 'downgrade() is a no-op'
    assert any(line.startswith('op.') for line in body)


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """AC5: upgrade -> downgrade to the parent -> upgrade again.

    Data is asserted after every step, exactly as
    ``.claude/rules/migration-tests.md`` 3 requires.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_columns = _columns(migration_db)

    # -- 1. Upgrade: the new structure holds the CV copy.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    _insert_base_cv(migration_db)
    _insert_tailored_cv(migration_db)

    assert _application_row(migration_db) == _EXPECTED_APPLICATION
    copies = _query(
        migration_db,
        'SELECT id, application_id, base_cv_id, summary, skills, '
        'was_ai_generated, adjustments FROM tailored_cvs',
    )
    assert len(copies) == 1
    assert copies[0]['application_id'] == APPLICATION_ID
    assert copies[0]['base_cv_id'] == BASE_CV_ID
    assert copies[0]['summary'] == 'Tailored summary'
    assert copies[0]['skills'] == ['python', 'postgres']
    assert copies[0]['was_ai_generated'] is False
    assert copies[0]['adjustments'] == ['rewrote the summary for Acme']

    # -- 2. Downgrade to the parent: the original schema and data are back.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns
    assert _application_row(migration_db) == _EXPECTED_APPLICATION
    assert {'base_cvs', 'tailored_cvs'} & _tables(migration_db) == set()
    assert _query(
        migration_db,
        'SELECT version_num FROM alembic_version',
    ) == [{'version_num': PARENT_REVISION}]

    # -- 3. Upgrade again: the same result as the first upgrade.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    assert _application_row(migration_db) == _EXPECTED_APPLICATION
    assert _query(
        migration_db,
        'SELECT job_description FROM applications WHERE id = :id',
        {'id': APPLICATION_ID},
    ) == [{'job_description': None}]
    # The copy is re-insertable after the round trip.
    _insert_base_cv(migration_db)
    _insert_tailored_cv(migration_db)
    assert _query(migration_db, 'SELECT count(*) AS n FROM tailored_cvs') == [
        {'n': 1}
    ]


# --------------------------------------------------------------------------
# AC1 / AC2 — the schema-level guarantees on the CV copy
# --------------------------------------------------------------------------


def test_application_holds_at_most_one_cv_copy(migration_db: str) -> None:
    """AC1: a second copy on the same application is refused."""
    _upgrade(migration_db, REVISION)
    _seed_at_parent(migration_db)
    _insert_base_cv(migration_db)
    _insert_tailored_cv(migration_db)

    with pytest.raises(IntegrityError) as excinfo:
        _insert_tailored_cv(
            migration_db,
            cv_id=OTHER_TAILORED_CV_ID,
            application_id=APPLICATION_ID,
        )

    assert 'uq_tailored_cvs_application_id' in str(excinfo.value)
    assert _query(migration_db, 'SELECT count(*) AS n FROM tailored_cvs') == [
        {'n': 1}
    ]


def test_unique_constraint_on_application_id_exists(migration_db: str) -> None:
    """AC1, at the schema: the constraint is UNIQUE on ``application_id``."""
    _upgrade(migration_db, REVISION)

    rows = _query(
        migration_db,
        'SELECT c.conname, c.contype::text AS contype, a.attname '
        'FROM pg_constraint c '
        'JOIN pg_class t ON t.oid = c.conrelid '
        'JOIN unnest(c.conkey) AS k(attnum) ON true '
        'JOIN pg_attribute a '
        '  ON a.attrelid = t.oid AND a.attnum = k.attnum '
        "WHERE t.relname = 'tailored_cvs' AND c.contype = 'u'",
    )

    assert rows == [
        {
            'conname': 'uq_tailored_cvs_application_id',
            'contype': 'u',
            'attname': 'application_id',
        }
    ]


def test_deleting_the_application_deletes_its_cv_copy(
    migration_db: str,
) -> None:
    """AC2: the copy dies with its application, the master CV does not."""
    _upgrade(migration_db, REVISION)
    _seed_at_parent(migration_db)
    _insert_base_cv(migration_db)
    _insert_tailored_cv(migration_db)

    _apply(
        migration_db,
        [
            (
                'DELETE FROM applications WHERE id = :id',
                {'id': APPLICATION_ID},
            )
        ],
    )

    assert _query(migration_db, 'SELECT count(*) AS n FROM tailored_cvs') == [
        {'n': 0}
    ]
    # The master CV is not collateral damage.
    assert _query(migration_db, 'SELECT count(*) AS n FROM base_cvs') == [
        {'n': 1}
    ]


def test_deleting_the_base_cv_keeps_the_copy(migration_db: str) -> None:
    """The copy is a full snapshot: it outlives the master CV it came from."""
    _upgrade(migration_db, REVISION)
    _seed_at_parent(migration_db)
    _insert_base_cv(migration_db)
    _insert_tailored_cv(migration_db)

    _apply(
        migration_db,
        [('DELETE FROM base_cvs WHERE id = :id', {'id': BASE_CV_ID})],
    )

    rows = _query(
        migration_db,
        'SELECT base_cv_id, application_id, full_name, headline, summary, '
        'skills, experience, languages FROM tailored_cvs',
    )
    assert len(rows) == 1
    assert rows[0]['base_cv_id'] is None
    assert rows[0]['application_id'] == APPLICATION_ID
    assert rows[0]['full_name'] == 'Ada Lovelace'
    assert rows[0]['headline'] == 'Backend Engineer'
    assert rows[0]['summary'] == 'Tailored summary'
    assert rows[0]['skills'] == ['python', 'postgres']
    assert rows[0]['experience'] == [{'company': 'Acme', 'years': 3}]
    assert rows[0]['languages'] == ['en', 'pt']


def test_deleting_the_user_deletes_both_cvs(migration_db: str) -> None:
    """The user FKs cascade, like every other user-owned table."""
    _upgrade(migration_db, REVISION)
    _seed_at_parent(migration_db)
    _insert_base_cv(migration_db)
    _insert_tailored_cv(migration_db)

    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_ID})],
    )

    assert _query(migration_db, 'SELECT count(*) AS n FROM base_cvs') == [
        {'n': 0}
    ]
    assert _query(migration_db, 'SELECT count(*) AS n FROM tailored_cvs') == [
        {'n': 0}
    ]


def test_section_defaults_are_empty_arrays(migration_db: str) -> None:
    """The six JSONB sections and ``summary`` default to empty, not NULL."""
    _upgrade(migration_db, REVISION)
    _seed_at_parent(migration_db)

    _apply(
        migration_db,
        [
            (
                'INSERT INTO base_cvs '
                '(id, user_id, name, full_name, headline, location, email, '
                'created_at) '
                'VALUES (:id, :user_id, :name, :full_name, :headline, '
                ':location, :email, :now)',
                {
                    'id': BASE_CV_ID,
                    'user_id': USER_ID,
                    'name': 'Bare CV',
                    'full_name': 'Ada Lovelace',
                    'headline': 'Backend Engineer',
                    'location': 'Lisbon, PT',
                    'email': 'ada@example.com',
                    'now': datetime.now(timezone.utc),
                },
            )
        ],
    )

    rows = _query(
        migration_db,
        f'SELECT summary, phone, {_SECTION_COLUMNS} FROM base_cvs',
    )
    assert len(rows) == 1
    assert rows[0]['summary'] == ''
    assert rows[0]['phone'] is None
    for section in _CV_SECTIONS:
        assert rows[0][section] == [], section
