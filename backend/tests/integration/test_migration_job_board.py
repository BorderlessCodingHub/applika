"""Round-trip test for the job board tables, ``applications.job_id`` and the
source platforms, revision ``b28d5134631f`` (KODI-044, Release A).

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``3b78c3cd2a71``, upgrade again - seeding
users, platforms, applications and base CVs at the parent revision and
asserting the data after each step.

What is asserted here:

* the upgrade adds exactly the five tables and ``applications.job_id``; no
  table or column that existed before is missing (AC7);
* two sources are seeded; ``himalayas`` reuses an existing public platform
  whose name differs only in case, ``remoteok`` gets a new public platform
  (``created_by`` NULL, url ``https://remoteok.com``) when only a *private*
  platform carries its name; on a database still holding the built-in
  ``Himalayas``/``RemoteOK`` platforms ``e3abe9dc93d4`` seeded (production's
  case), both are reused and no platform is added (AC1, R-019);
* an old-shape ``INSERT INTO applications`` that never names ``job_id`` still
  works after the upgrade and after the downgrade (AC2/AC8);
* the constraints: one job per ``(source_id, external_id)``, one application
  per user per job (NULLs free, another user free), ``score`` 0..100, one
  saved search name per user ignoring case, deleting a base CV removes its
  fit rows, deleting a job nulls ``applications.job_id``;
* the downgrade renames the five tables and ``job_id`` to ``*_old``, every row
  kept, every other ``applications`` column intact, the seeded platforms kept,
  none of this revision's indexes left (AC3);
* the second upgrade renames everything back: rows, columns and index
  definitions equal the first upgrade's, no second source or platform; a
  source whose platform vanished while rolled back gets one again;
* Release B (KODI-046, KODI-047): ``app/`` maps the five tables and
  ``applications.job_id`` exactly as this revision builds them -
  autogenerate finds no difference, and ``create_all`` builds the same
  constraints and indexes - and maps no ``*_old`` object.

Plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is copied from
``tests/integration/test_migration_catalog_visibility_drafts.py``.

Every user, platform, application, CV and job here is invented.
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

REVISION = 'b28d5134631f'
PARENT_REVISION = '3b78c3cd2a71'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT / 'migrations' / 'versions' / f'{REVISION}_job_board.py'
)

NEW_TABLES = (
    'job_sources',
    'jobs',
    'job_fit_scores',
    'job_dismissals',
    'saved_job_searches',
)
NEW_COLUMNS = {
    'job_sources': {
        'id',
        'created_at',
        'updated_at',
        'code',
        'name',
        'base_url',
        'platform_id',
        'is_enabled',
        'last_run_at',
        'last_run_status',
        'last_run_error',
        'last_run_found',
        'last_run_saved',
    },
    'jobs': {
        'id',
        'created_at',
        'updated_at',
        'source_id',
        'external_id',
        'title',
        'company_name',
        'company_url',
        'location_text',
        'job_url',
        'description_text',
        'employment_type',
        'salary_text',
        'tags',
        'keywords',
        'content_hash',
        'posted_at',
        'first_seen_at',
        'last_seen_at',
        'is_active',
    },
    'job_fit_scores': {
        'id',
        'created_at',
        'updated_at',
        'user_id',
        'job_id',
        'base_cv_id',
        'score',
        'computed_at',
    },
    'job_dismissals': {'id', 'created_at', 'updated_at', 'user_id', 'job_id'},
    'saved_job_searches': {
        'id',
        'created_at',
        'updated_at',
        'user_id',
        'name',
        'filters',
    },
}
# The indexes this revision builds with ``create_index`` (dropped on
# downgrade, rebuilt on re-upgrade). PKs and table-level UNIQUE constraints
# travel with the renamed tables instead.
CREATED_INDEXES = {
    'ix_jobs_active_posted',
    'ix_jobs_tags',
    'ix_job_fit_scores_user_job',
    'uq_saved_job_searches_user_name',
    'uq_applications_user_job',
}

USER_A_ID = 7600000000000000001
USER_B_ID = 7600000000000000002

PLATFORM_HIMALAYAS_ID = 7600000000000000101
PLATFORM_PRIVATE_REMOTEOK_ID = 7600000000000000102
PLATFORM_LINKEDIN_ID = 7600000000000000103

APPLICATION_A_ID = 7600000000000000201
APPLICATION_B_ID = 7600000000000000202

BASE_CV_A_ID = 7600000000000000301
BASE_CV_A2_ID = 7600000000000000302
BASE_CV_B_ID = 7600000000000000303

JOB_1_ID = 7600000000000000401
JOB_2_ID = 7600000000000000402


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
) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.begin() as conn:
            with pytest.raises(IntegrityError):
                await conn.execute(sa.text(statement), params)
    finally:
        await engine.dispose()


def _refused(url: str, statement: str, params: dict[str, Any]) -> None:
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
        'job_board_migration_under_test', _MIGRATION_PATH
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


def _index_defs(url: str) -> dict[str, str]:
    """Every index in the schema, name -> definition."""
    return {
        row['indexname']: row['indexdef']
        for row in _query(
            url,
            'SELECT indexname, indexdef FROM pg_indexes '
            "WHERE schemaname = 'public'",
        )
    }


def _rows(url: str, table: str) -> list[dict[str, Any]]:
    return _query(url, f'SELECT * FROM {table} ORDER BY id')


def _platforms(url: str) -> list[dict[str, Any]]:
    return _rows(url, 'platforms')


def _sources(url: str) -> dict[str, dict[str, Any]]:
    return {
        row['code']: row
        for row in _query(url, 'SELECT * FROM job_sources ORDER BY code')
    }


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, created_at) '
    'VALUES (:id, :github_id, :username, :email, :years, :now)'
)

_INSERT_PLATFORM = (
    'INSERT INTO platforms (id, name, url, is_public, created_by, created_at) '
    'VALUES (:id, :name, :url, :is_public, :created_by, :now)'
)

# Old shape: exactly the columns the code in production writes today - no
# ``job_id``.
_INSERT_APPLICATION = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, company_name, application_date, role, '
    'mode, created_at) '
    'VALUES (:id, :user_id, :platform_id, :company_name, '
    ':application_date, :role, :mode, :now)'
)

_INSERT_BASE_CV = (
    'INSERT INTO base_cvs '
    '(id, user_id, name, full_name, headline, location, email, created_at) '
    "VALUES (:id, :user_id, :name, 'Ada Test', 'Engineer', 'Remote', "
    "'ada@example.com', :now)"
)

_INSERT_JOB = (
    'INSERT INTO jobs '
    '(id, source_id, external_id, title, company_name, job_url, '
    'description_text, tags, keywords, content_hash, posted_at, '
    'first_seen_at, last_seen_at, created_at) '
    'VALUES (:id, :source_id, :external_id, :title, :company_name, '
    ':job_url, :description, :tags, CAST(:keywords AS jsonb), :hash, '
    ':now, :now, :now, :now)'
)

_INSERT_FIT = (
    'INSERT INTO job_fit_scores '
    '(id, user_id, job_id, base_cv_id, score, computed_at, created_at) '
    'VALUES (:id, :user_id, :job_id, :base_cv_id, :score, :now, :now)'
)

_INSERT_DISMISSAL = (
    'INSERT INTO job_dismissals (id, user_id, job_id, created_at) '
    'VALUES (:id, :user_id, :job_id, :now)'
)

_INSERT_SEARCH = (
    'INSERT INTO saved_job_searches (id, user_id, name, filters, created_at) '
    'VALUES (:id, :user_id, :name, CAST(:filters AS jsonb), :now)'
)

_INSERT_APPLICATION_WITH_JOB = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, company_name, application_date, role, '
    'mode, job_id, created_at) '
    'VALUES (:id, :user_id, :platform_id, :company_name, '
    ':application_date, :role, :mode, :job_id, :now)'
)


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _application(
    app_id: int, user_id: int, job_id: int | None = None
) -> dict[str, Any]:
    params: dict[str, Any] = {
        'id': app_id,
        'user_id': user_id,
        'platform_id': PLATFORM_LINKEDIN_ID,
        'company_name': 'Acme',
        'application_date': date(2026, 9, 1),
        'role': 'Backend Engineer',
        'mode': 'active',
        'now': _now(),
    }
    if job_id is not None:
        params['job_id'] = job_id
    return params


def _seed_at_parent(url: str, *, rename_builtin_platforms: bool) -> None:
    """Users A and B, a LinkedIn-like platform, applications, base CVs.

    ``rename_builtin_platforms`` moves the ``Himalayas``/``RemoteOK`` rows
    ``e3abe9dc93d4`` seeds out of the way (renamed, never deleted) and adds
    a public ``himalayas`` (lower case) and user A's *private* ``RemoteOK``,
    so both seed branches run: a case-insensitive reuse and a new platform.
    """
    now = _now()
    statements: list[tuple[str, dict[str, Any]]] = [
        (
            _INSERT_USER,
            {
                'id': USER_A_ID,
                'github_id': 96101,
                'username': 'jobs_user_a',
                'email': 'jobs.a@example.com',
                'years': 3,
                'now': now,
            },
        ),
        (
            _INSERT_USER,
            {
                'id': USER_B_ID,
                'github_id': 96102,
                'username': 'jobs_user_b',
                'email': 'jobs.b@example.com',
                'years': 5,
                'now': now,
            },
        ),
        (
            _INSERT_PLATFORM,
            {
                'id': PLATFORM_LINKEDIN_ID,
                'name': 'Jobs Test Board',
                'url': 'https://board.example.com',
                'is_public': True,
                'created_by': None,
                'now': now,
            },
        ),
        (_INSERT_APPLICATION, _application(APPLICATION_A_ID, USER_A_ID)),
        (_INSERT_APPLICATION, _application(APPLICATION_B_ID, USER_B_ID)),
        (
            _INSERT_BASE_CV,
            {
                'id': BASE_CV_A_ID,
                'user_id': USER_A_ID,
                'name': 'A1',
                'now': now,
            },
        ),
        (
            _INSERT_BASE_CV,
            {
                'id': BASE_CV_A2_ID,
                'user_id': USER_A_ID,
                'name': 'A2',
                'now': now,
            },
        ),
        (
            _INSERT_BASE_CV,
            {
                'id': BASE_CV_B_ID,
                'user_id': USER_B_ID,
                'name': 'B1',
                'now': now,
            },
        ),
    ]
    if rename_builtin_platforms:
        statements += [
            (
                "UPDATE platforms SET name = name || ' (legacy)' "
                "WHERE lower(name) IN ('himalayas', 'remoteok')",
                {},
            ),
            (
                _INSERT_PLATFORM,
                {
                    'id': PLATFORM_HIMALAYAS_ID,
                    'name': 'himalayas',
                    'url': 'https://himalayas.example.com',
                    'is_public': True,
                    'created_by': None,
                    'now': now,
                },
            ),
            (
                _INSERT_PLATFORM,
                {
                    'id': PLATFORM_PRIVATE_REMOTEOK_ID,
                    'name': 'RemoteOK',
                    'url': 'https://private.example.com',
                    'is_public': False,
                    'created_by': USER_A_ID,
                    'now': now,
                },
            ),
        ]
    _apply(url, statements)


def _upgraded(url: str, *, rename_builtin_platforms: bool = True) -> None:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url, rename_builtin_platforms=rename_builtin_platforms)
    _upgrade(url, REVISION)


def _job(job_id: int, source_id: int, external_id: str) -> dict[str, Any]:
    return {
        'id': job_id,
        'source_id': source_id,
        'external_id': external_id,
        'title': 'Senior Python Engineer',
        'company_name': 'Remote Co',
        'job_url': f'https://jobs.example.com/{external_id}',
        'description': 'Build things with Python and Postgres.',
        'tags': ['python', 'postgres'],
        'keywords': json.dumps(['python', 'fastapi']),
        'hash': 'a' * 64,
        'now': _now(),
    }


def _write_feature_rows(url: str) -> None:
    """Rows in every new object, as Release B's code would write them."""
    sources = _sources(url)
    himalayas = sources['himalayas']['id']
    remoteok = sources['remoteok']['id']
    now = _now()
    _apply(
        url,
        [
            (_INSERT_JOB, _job(JOB_1_ID, himalayas, 'hm-1')),
            (_INSERT_JOB, _job(JOB_2_ID, remoteok, 'rk-1')),
            (
                _INSERT_FIT,
                {
                    'id': 7600000000000000501,
                    'user_id': USER_A_ID,
                    'job_id': JOB_1_ID,
                    'base_cv_id': BASE_CV_A_ID,
                    'score': 87,
                    'now': now,
                },
            ),
            (
                _INSERT_FIT,
                {
                    'id': 7600000000000000502,
                    'user_id': USER_A_ID,
                    'job_id': JOB_1_ID,
                    'base_cv_id': BASE_CV_A2_ID,
                    'score': 40,
                    'now': now,
                },
            ),
            (
                _INSERT_DISMISSAL,
                {
                    'id': 7600000000000000601,
                    'user_id': USER_B_ID,
                    'job_id': JOB_2_ID,
                    'now': now,
                },
            ),
            (
                _INSERT_SEARCH,
                {
                    'id': 7600000000000000701,
                    'user_id': USER_A_ID,
                    'name': 'Python remote',
                    'filters': json.dumps({'q': 'python'}),
                    'now': now,
                },
            ),
            (
                'UPDATE applications SET job_id = :job_id WHERE id = :id',
                {'job_id': JOB_1_ID, 'id': APPLICATION_A_ID},
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
    assert len(downgrade_source.splitlines()) > 5


def test_the_revision_is_a_new_child_at_head() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


# --------------------------------------------------------------------------
# AC7 - upgrade adds, nothing is missing
# --------------------------------------------------------------------------


def test_upgrade_adds_tables_and_column_and_nothing_is_missing(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db, rename_builtin_platforms=True)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)

    _upgrade(migration_db, REVISION)

    expected_columns = {
        (table, column)
        for table, columns in NEW_COLUMNS.items()
        for column in columns
    } | {('applications', 'job_id')}
    assert _tables(migration_db) == tables_before | set(NEW_TABLES)
    assert _columns(migration_db) == columns_before | expected_columns
    index_defs = _index_defs(migration_db)
    assert CREATED_INDEXES <= set(index_defs)
    # The shape of each index, not just its name.
    assert index_defs['ix_jobs_active_posted'].endswith(
        '(is_active, posted_at DESC)'
    )
    assert 'USING gin (tags)' in index_defs['ix_jobs_tags']
    assert index_defs['ix_job_fit_scores_user_job'].endswith(
        '(user_id, job_id)'
    )
    assert index_defs['uq_saved_job_searches_user_name'].startswith(
        'CREATE UNIQUE INDEX'
    )
    assert index_defs['uq_saved_job_searches_user_name'].endswith(
        '(user_id, lower((name)::text))'
    )
    assert index_defs['uq_applications_user_job'].startswith(
        'CREATE UNIQUE INDEX'
    )
    assert index_defs['uq_applications_user_job'].endswith(
        '(user_id, job_id) WHERE (job_id IS NOT NULL)'
    )


# --------------------------------------------------------------------------
# AC1 / R-019 - every source is a platform every user sees
# --------------------------------------------------------------------------


def test_seed_reuses_public_platform_ignoring_case_and_adds_the_missing_one(
    migration_db: str,
) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db, rename_builtin_platforms=True)
    platforms_before = {p['id']: p for p in _platforms(migration_db)}

    _upgrade(migration_db, REVISION)

    sources = _sources(migration_db)
    assert set(sources) == {'himalayas', 'remoteok'}
    assert sources['himalayas']['name'] == 'Himalayas'
    assert sources['himalayas']['base_url'] == 'https://himalayas.app'
    assert sources['remoteok']['name'] == 'RemoteOK'
    assert sources['remoteok']['base_url'] == 'https://remoteok.com'
    assert all(s['is_enabled'] for s in sources.values())
    assert all(s['last_run_status'] is None for s in sources.values())

    # himalayas: the existing public "himalayas" (lower case), reused.
    assert sources['himalayas']['platform_id'] == PLATFORM_HIMALAYAS_ID

    # remoteok: user A's *private* "RemoteOK" is not reused; a new public
    # platform is added.
    platforms_after = {p['id']: p for p in _platforms(migration_db)}
    added = set(platforms_after) - set(platforms_before)
    assert added == {sources['remoteok']['platform_id']}
    new_platform = platforms_after[sources['remoteok']['platform_id']]
    assert new_platform['name'] == 'RemoteOK'
    assert new_platform['url'] == 'https://remoteok.com'
    assert new_platform['is_public'] is True
    assert new_platform['created_by'] is None
    assert new_platform['created_at'] is not None
    # Every pre-existing platform is untouched.
    for platform_id, row in platforms_before.items():
        assert platforms_after[platform_id] == row


def test_seed_reuses_the_builtin_platforms_production_already_holds(
    migration_db: str,
) -> None:
    """Production still carries the ``Himalayas``/``RemoteOK`` rows
    ``e3abe9dc93d4`` seeded: both are reused, no platform is added, and a
    second public ``HIMALAYAS`` does not win over the lowest id."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db, rename_builtin_platforms=False)
    _apply(
        migration_db,
        [
            (
                _INSERT_PLATFORM,
                {
                    'id': 9100000000000000001,
                    'name': 'HIMALAYAS',
                    'url': None,
                    'is_public': True,
                    'created_by': None,
                    'now': _now(),
                },
            )
        ],
    )
    platforms_before = _platforms(migration_db)

    _upgrade(migration_db, REVISION)

    assert _platforms(migration_db) == platforms_before
    sources = _sources(migration_db)
    for code in ('himalayas', 'remoteok'):
        lowest = _query(
            migration_db,
            'SELECT min(id) AS id FROM platforms '
            'WHERE is_public AND lower(name) = :code',
            {'code': code},
        )[0]['id']
        assert sources[code]['platform_id'] == lowest
        assert lowest != 9100000000000000001


# --------------------------------------------------------------------------
# AC2 / AC8 - the code in production keeps working on the new schema
# --------------------------------------------------------------------------


def test_old_shape_application_insert_works_after_upgrade(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    new_id = 7600000000000000299

    _apply(
        migration_db,
        [(_INSERT_APPLICATION, _application(new_id, USER_A_ID))],
    )

    row = _query(
        migration_db,
        'SELECT job_id, role FROM applications WHERE id = :id',
        {'id': new_id},
    )
    assert row == [{'job_id': None, 'role': 'Backend Engineer'}]
    # A user delete (the old code's DELETE /users/me) still works.
    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_B_ID})],
    )


# --------------------------------------------------------------------------
# Constraints after upgrade
# --------------------------------------------------------------------------


def test_jobs_and_applications_uniqueness(migration_db: str) -> None:
    _upgraded(migration_db)
    _write_feature_rows(migration_db)
    himalayas = _sources(migration_db)['himalayas']['id']

    # Same (source_id, external_id) twice.
    _refused(migration_db, _INSERT_JOB, _job(JOB_2_ID + 1, himalayas, 'hm-1'))
    # Same external id on another source is a different job.
    remoteok = _sources(migration_db)['remoteok']['id']
    _apply(
        migration_db,
        [(_INSERT_JOB, _job(JOB_2_ID + 2, remoteok, 'hm-1'))],
    )

    # A second application of A for JOB_1.
    _refused(
        migration_db,
        _INSERT_APPLICATION_WITH_JOB,
        _application(7600000000000000210, USER_A_ID, JOB_1_ID),
    )
    # Two of A's applications with job_id NULL, and B for JOB_1: fine.
    _apply(
        migration_db,
        [
            (
                _INSERT_APPLICATION,
                _application(7600000000000000211, USER_A_ID),
            ),
            (
                _INSERT_APPLICATION,
                _application(7600000000000000212, USER_A_ID),
            ),
            (
                _INSERT_APPLICATION_WITH_JOB,
                _application(7600000000000000213, USER_B_ID, JOB_1_ID),
            ),
        ],
    )
    # A dismissal twice.
    _refused(
        migration_db,
        _INSERT_DISMISSAL,
        {
            'id': 7600000000000000602,
            'user_id': USER_B_ID,
            'job_id': JOB_2_ID,
            'now': _now(),
        },
    )
    # A fit row twice for the same (base_cv, job).
    _refused(
        migration_db,
        _INSERT_FIT,
        {
            'id': 7600000000000000503,
            'user_id': USER_A_ID,
            'job_id': JOB_1_ID,
            'base_cv_id': BASE_CV_A_ID,
            'score': 10,
            'now': _now(),
        },
    )
    # A source code twice.
    _refused(
        migration_db,
        'INSERT INTO job_sources (id, code, name, base_url, created_at) '
        "VALUES (1, 'himalayas', 'X', 'https://x.example.com', now())",
        {},
    )


def test_score_and_run_status_checks(migration_db: str) -> None:
    _upgraded(migration_db)
    _write_feature_rows(migration_db)

    for score in (101, -1):
        _refused(
            migration_db,
            _INSERT_FIT,
            {
                'id': 7600000000000000510,
                'user_id': USER_B_ID,
                'job_id': JOB_1_ID,
                'base_cv_id': BASE_CV_B_ID,
                'score': score,
                'now': _now(),
            },
        )
    for score, fit_id in ((0, 7600000000000000511), (100, 7600000000000000512)):
        job_id = JOB_1_ID if score == 0 else JOB_2_ID
        _apply(
            migration_db,
            [
                (
                    _INSERT_FIT,
                    {
                        'id': fit_id,
                        'user_id': USER_B_ID,
                        'job_id': job_id,
                        'base_cv_id': BASE_CV_B_ID,
                        'score': score,
                        'now': _now(),
                    },
                )
            ],
        )
    _refused(
        migration_db,
        "UPDATE job_sources SET last_run_status = 'weird'",
        {},
    )
    _apply(
        migration_db,
        [
            (
                "UPDATE job_sources SET last_run_status = 'blocked' "
                "WHERE code = 'remoteok'",
                {},
            )
        ],
    )


def test_saved_search_name_unique_per_user_ignoring_case(
    migration_db: str,
) -> None:
    _upgraded(migration_db)
    _write_feature_rows(migration_db)

    _refused(
        migration_db,
        _INSERT_SEARCH,
        {
            'id': 7600000000000000702,
            'user_id': USER_A_ID,
            'name': 'PYTHON REMOTE',
            'filters': '{}',
            'now': _now(),
        },
    )
    _apply(
        migration_db,
        [
            (
                _INSERT_SEARCH,
                {
                    'id': 7600000000000000703,
                    'user_id': USER_B_ID,
                    'name': 'PYTHON REMOTE',
                    'filters': '{}',
                    'now': _now(),
                },
            )
        ],
    )


def test_cascades_and_set_null(migration_db: str) -> None:
    _upgraded(migration_db)
    _write_feature_rows(migration_db)

    # A source with jobs cannot be deleted (RESTRICT).
    _refused(
        migration_db,
        "DELETE FROM job_sources WHERE code = 'remoteok'",
        {},
    )

    # Deleting a base CV removes its fit rows only.
    _apply(
        migration_db,
        [('DELETE FROM base_cvs WHERE id = :id', {'id': BASE_CV_A_ID})],
    )
    fits = _query(migration_db, 'SELECT base_cv_id FROM job_fit_scores')
    assert fits == [{'base_cv_id': BASE_CV_A2_ID}]

    # Deleting a job used by an application nulls applications.job_id and
    # removes the job's fit rows; the application stays.
    _apply(
        migration_db,
        [('DELETE FROM jobs WHERE id = :id', {'id': JOB_1_ID})],
    )
    application = _query(
        migration_db,
        'SELECT id, job_id FROM applications WHERE id = :id',
        {'id': APPLICATION_A_ID},
    )
    assert application == [{'id': APPLICATION_A_ID, 'job_id': None}]
    assert _query(migration_db, 'SELECT id FROM job_fit_scores') == []

    # Deleting a job removes its dismissals (CASCADE).
    _apply(
        migration_db,
        [('DELETE FROM jobs WHERE id = :id', {'id': JOB_2_ID})],
    )
    assert _query(migration_db, 'SELECT id FROM job_dismissals') == []

    # Deleting a user removes their dismissals and searches.
    remoteok = _sources(migration_db)['remoteok']['id']
    _apply(
        migration_db,
        [
            (_INSERT_JOB, _job(JOB_2_ID + 5, remoteok, 'rk-5')),
            (
                _INSERT_DISMISSAL,
                {
                    'id': 7600000000000000605,
                    'user_id': USER_B_ID,
                    'job_id': JOB_2_ID + 5,
                    'now': _now(),
                },
            ),
        ],
    )
    assert len(_query(migration_db, 'SELECT id FROM job_dismissals')) == 1
    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_B_ID})],
    )
    assert _query(migration_db, 'SELECT id FROM job_dismissals') == []
    _apply(
        migration_db,
        [('DELETE FROM users WHERE id = :id', {'id': USER_A_ID})],
    )
    assert _query(migration_db, 'SELECT id FROM saved_job_searches') == []


# --------------------------------------------------------------------------
# Round trip - migration-tests.md 2, 3, 4
# --------------------------------------------------------------------------


def _snapshot(url: str) -> dict[str, list[dict[str, Any]]]:
    return {table: _rows(url, table) for table in NEW_TABLES}


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db, rename_builtin_platforms=True)
    parent_tables = _tables(migration_db)
    parent_columns = _columns(migration_db)
    parent_indexes = _index_defs(migration_db)
    parent_applications = _rows(migration_db, 'applications')

    # -- 1. Upgrade, then write a row into every new object.
    _upgrade(migration_db, REVISION)
    _write_feature_rows(migration_db)
    first_tables = _tables(migration_db)
    first_columns = _columns(migration_db)
    first_indexes = _index_defs(migration_db)
    first_rows = _snapshot(migration_db)
    first_applications = _rows(migration_db, 'applications')
    first_platforms = _platforms(migration_db)
    assert all(first_rows[table] for table in NEW_TABLES)

    # -- 2. Downgrade to the parent.
    _downgrade(migration_db, PARENT_REVISION)

    down_tables = _tables(migration_db)
    old_tables = {f'{table}_old' for table in NEW_TABLES}
    assert down_tables == parent_tables | old_tables
    assert not set(NEW_TABLES) & down_tables
    expected_down_columns = (
        parent_columns
        | {
            (f'{table}_old', column)
            for table, columns in NEW_COLUMNS.items()
            for column in columns
        }
        | {('applications', 'job_id_old')}
    )
    assert _columns(migration_db) == expected_down_columns

    # Every row stays, in the *_old twins.
    for table in NEW_TABLES:
        assert _rows(migration_db, f'{table}_old') == first_rows[table]
    # applications: job_id travelled to job_id_old, every other column is
    # exactly what the parent revision held.
    down_applications = _rows(migration_db, 'applications')
    assert [(row['id'], row['job_id_old']) for row in down_applications] == [
        (row['id'], row['job_id']) for row in first_applications
    ]
    assert [
        {k: v for k, v in row.items() if k != 'job_id_old'}
        for row in down_applications
    ] == parent_applications
    # The seeded platforms remain.
    assert _platforms(migration_db) == first_platforms

    # No index this revision created remains; the parent's indexes are back
    # exactly, and the only extra ones are the PK/UNIQUE constraints the
    # *_old tables keep.
    down_indexes = _index_defs(migration_db)
    assert not CREATED_INDEXES & set(down_indexes)
    assert {
        name: d for name, d in down_indexes.items() if name in parent_indexes
    } == parent_indexes
    extra = set(down_indexes) - set(parent_indexes)
    constraint_indexes = {
        row['conname']
        for row in _query(
            migration_db,
            "SELECT conname FROM pg_constraint WHERE contype IN ('p', 'u') "
            'AND conrelid::regclass::text = ANY(:tables)',
            {'tables': sorted(old_tables)},
        )
    }
    assert extra == constraint_indexes

    # The code that runs after a rollback still writes applications.
    _apply(
        migration_db,
        [
            (
                _INSERT_APPLICATION,
                _application(7600000000000000298, USER_B_ID),
            )
        ],
    )
    _apply(
        migration_db,
        [
            (
                'DELETE FROM applications WHERE id = :id',
                {'id': 7600000000000000298},
            )
        ],
    )

    # -- 3. Upgrade again: names back, rows/indexes equal the first upgrade.
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == first_tables
    assert _columns(migration_db) == first_columns
    assert _index_defs(migration_db) == first_indexes
    assert _snapshot(migration_db) == first_rows
    assert _rows(migration_db, 'applications') == first_applications
    assert _platforms(migration_db) == first_platforms
    assert len(_sources(migration_db)) == 2

    # The constraints are live again on the re-adopted tables.
    _refused(
        migration_db,
        _INSERT_APPLICATION_WITH_JOB,
        _application(7600000000000000220, USER_A_ID, JOB_1_ID),
    )


def test_reupgrade_repeats_the_platform_lookup(migration_db: str) -> None:
    """A source whose platform vanished while rolled back (the FK is SET
    NULL) gets one again on the next upgrade - and only once."""
    _upgraded(migration_db)
    remoteok_platform = _sources(migration_db)['remoteok']['platform_id']
    _downgrade(migration_db, PARENT_REVISION)

    _apply(
        migration_db,
        [
            (
                'DELETE FROM platforms WHERE id = :id',
                {'id': remoteok_platform},
            )
        ],
    )
    platforms_before = _platforms(migration_db)

    _upgrade(migration_db, REVISION)

    sources = _sources(migration_db)
    platforms_after = {p['id']: p for p in _platforms(migration_db)}
    added = set(platforms_after) - {p['id'] for p in platforms_before}
    assert added == {sources['remoteok']['platform_id']}
    assert platforms_after[sources['remoteok']['platform_id']]['is_public']
    assert sources['himalayas']['platform_id'] == PLATFORM_HIMALAYAS_ID


# --------------------------------------------------------------------------
# AC5, as amended by Release B (KODI-046, KODI-047): app/ maps all five
# tables and applications.job_id exactly as this revision builds them; no
# ``*_old`` object is ever mapped
# --------------------------------------------------------------------------

MAPPED_TABLES = NEW_TABLES
# The applications objects this revision adds (the rest of the table belongs
# to older revisions, some of whose legacy columns the ORM deliberately
# leaves unmapped).
APPLICATION_JOB_OBJECTS = ('job_id', 'fk_applications_job_id')
APPLICATION_JOB_INDEX = 'uq_applications_user_job'


def test_orm_maps_every_new_table_and_job_id_and_no_old_object() -> None:
    from app.domain.models import ApplicationModel, Base

    mapped_tables = set(Base.metadata.tables)
    for table in NEW_TABLES:
        assert table in mapped_tables
        assert f'{table}_old' not in mapped_tables
    application_columns = {c.name for c in ApplicationModel.__table__.columns}
    assert 'job_id' in application_columns
    assert 'job_id_old' not in application_columns


def _metadata_diffs(url: str) -> list[Any]:
    from alembic.autogenerate import compare_metadata
    from alembic.migration import MigrationContext

    from app.domain.models import Base

    def compare(connection: sa.Connection) -> list[Any]:
        context = MigrationContext.configure(
            connection,
            opts={'compare_type': True, 'compare_server_default': True},
        )
        return list(compare_metadata(context, Base.metadata))

    async def run() -> list[Any]:
        engine = create_async_engine(url, poolclass=NullPool)
        try:
            async with engine.connect() as conn:
                return await conn.run_sync(compare)
        finally:
            await engine.dispose()

    return _run(run())


def _touches_application_job(diff: Any) -> bool:
    """Whether an autogenerate diff entry concerns ``applications.job_id``,
    its FK or ``uq_applications_user_job``."""
    entries = diff if isinstance(diff, list) else [diff]
    for entry in entries:
        for part in entry:
            name = getattr(part, 'name', None)
            if name in (*APPLICATION_JOB_OBJECTS, APPLICATION_JOB_INDEX):
                return True
            if isinstance(part, str) and part in APPLICATION_JOB_OBJECTS:
                return True
    return False


def _touches(diff: Any, tables: tuple[str, ...]) -> bool:
    """Whether an autogenerate diff entry concerns one of ``tables``."""
    entries = diff if isinstance(diff, list) else [diff]
    for entry in entries:
        for part in entry:
            name = getattr(part, 'name', None)
            table = getattr(part, 'table', None)
            if name in tables or getattr(table, 'name', None) in tables:
                return True
            if isinstance(part, str) and part in tables:
                return True
    return False


def test_orm_mapping_equals_the_migrated_worker_tables(
    migration_db: str,
) -> None:
    """``alembic`` autogenerate against a database at this revision finds
    nothing to change on the five tables and on ``applications.job_id``:
    the ``create_all`` test schema and production's migrated schema are the
    same objects."""
    _upgrade(migration_db, REVISION)

    diffs = [
        d
        for d in _metadata_diffs(migration_db)
        if _touches(d, MAPPED_TABLES) or _touches_application_job(d)
    ]

    assert diffs == []


def _catalog(url: str) -> dict[str, set[tuple[str, str]]]:
    """Every constraint (name, definition) and index (name, definition) of
    the five mapped tables, plus the ``applications`` FK and partial unique
    index this revision adds, read from ``pg_catalog``."""
    constraints = _query(
        url,
        'SELECT c.conrelid::regclass::text AS tbl, c.conname AS name, '
        'pg_get_constraintdef(c.oid) AS def FROM pg_constraint c '
        'WHERE c.conrelid::regclass::text = ANY(:tables) '
        "OR c.conname = 'fk_applications_job_id'",
        {'tables': list(MAPPED_TABLES)},
    )
    indexes = _query(
        url,
        'SELECT tablename AS tbl, indexname AS name, indexdef AS def '
        'FROM pg_indexes WHERE tablename = ANY(:tables) '
        "OR indexname = 'uq_applications_user_job'",
        {'tables': list(MAPPED_TABLES)},
    )
    return {
        'constraints': {
            (f'{r["tbl"]}.{r["name"]}', r['def']) for r in constraints
        },
        'indexes': {(r['name'], r['def']) for r in indexes},
    }


def test_create_all_builds_the_same_constraints_and_indexes(
    migration_db: str,
) -> None:
    """Names, FK targets and ``ondelete``, UNIQUE, CHECK, the PKs and the
    B-tree/GIN index definitions, which autogenerate does not compare:
    ``Base.metadata.create_all`` (the test schema) and this revision build
    them identically."""
    from app.domain.models import Base

    _upgrade(migration_db, REVISION)
    migrated = _catalog(migration_db)

    _apply(
        migration_db,
        [
            ('DROP SCHEMA public CASCADE', {}),
            ('CREATE SCHEMA public', {}),
        ],
    )

    async def create_all() -> None:
        engine = create_async_engine(migration_db, poolclass=NullPool)
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        finally:
            await engine.dispose()

    _run(create_all())
    created = _catalog(migration_db)

    assert created == migrated
    assert migrated['constraints']
    assert migrated['indexes']
