"""Round-trip test for the CV period revision ``d3f7b1c9e2a4``.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic chain**
against a dedicated testcontainers Postgres — upgrade to the revision,
downgrade to its parent ``f2a9c1d4b6e8``, upgrade again — seeding rows before
the upgrade and asserting the data after each step.

What the revision has to get right, and what is asserted here step by step:

* the free-text ``period`` columns are **renamed**, not dropped
  (``experience`` → ``experience_old``, ``education`` → ``education_old``), on
  ``base_cvs`` *and* ``tailored_cvs``;
* the new ``experience``/``education`` columns arrive JSONB, NOT NULL,
  ``server_default '[]'``;
* every migrated item loses ``period``, gains ``start``/``end`` seeded at
  ``2026-01`` — the owner: "for default during migration, seed as "01/2026" to
  both start and finish" — and keeps every one of its other fields;
* **nothing is parsed.** An item whose old text was a perfectly readable
  ``09/2016 - 07/2018`` gets the same ``2026-01`` as one that said
  ``sometime around the pandemic``. The original text survives verbatim in the
  ``_old`` column, which is the whole reason the owner chose that route;
* a CV with an empty section migrates to ``[]``, never NULL — ``jsonb_agg``
  over zero rows returns NULL and the column is NOT NULL;
* ``downgrade()`` puts the original columns back, with their original data.

The plumbing (dedicated container, synchronous tests around ``asyncio.run``,
``envs.DATABASE_URL`` patched because ``migrations/env.py`` overwrites
``sqlalchemy.url`` itself) is the same as
``tests/integration/test_migration_cv_builder.py``, and for the same reasons.

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

REVISION = 'd3f7b1c9e2a4'
PARENT_REVISION = 'f2a9c1d4b6e8'

# The owner's migration default, stored ISO: "seed as "01/2026" to both start
# and finish".
SEED_MONTH = '2026-01'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_cv_period_start_end.py'
)

USER_ID = 7100000000000000001
PLATFORM_ID = 7100000000000000002
APPLICATION_ID = 7100000000000000003
BASE_CV_ID = 7100000000000000004
EMPTY_BASE_CV_ID = 7100000000000000005
TAILORED_CV_ID = 7100000000000000006

_CV_SECTIONS = (
    'links',
    'skills',
    'experience',
    'projects',
    'education',
    'certifications',
    'languages',
)

_CV_TABLES = ('base_cvs', 'tailored_cvs')
_DATED_SECTIONS = ('experience', 'education')

# The stored shape *before* this revision: a single free-text ``period``.
#
# Two items on purpose, and the second one matters most: ``09/2016 - 07/2018``
# is trivially parseable, and the owner's ruling is that it is **not** parsed.
# Both come out with the same seeded ``2026-01``.
_OLD_EXPERIENCE = [
    {
        'id': 'exp-1',
        'company': 'Acme',
        'company_description': 'Anvils, mostly',
        'role': 'Staff Engineer',
        'period': 'sometime around the pandemic',
        'location': 'Lisbon, PT',
        'bullets': ['Cut p99 by half', 'Owned the billing rewrite'],
    },
    {
        'id': 'exp-2',
        'company': 'Globex',
        'company_description': None,
        'role': 'Senior Engineer',
        'period': '09/2016 - 07/2018',
        'location': None,
        'bullets': [],
    },
]

_OLD_EDUCATION = [
    {
        'id': 'edu-1',
        'institution': 'Riverside Institute',
        'degree': "Master's degree",
        'area': 'Distributed Systems',
        'period': '09/2016 - 07/2018',
    },
    {
        # ``period`` was *optional* on education before this revision. An item
        # that never had one still has to come out with a seeded pair.
        'id': 'edu-2',
        'institution': 'Northgate College',
        'degree': "Bachelor's degree",
        'area': None,
    },
]

_OLD_BY_SECTION = {
    'experience': _OLD_EXPERIENCE,
    'education': _OLD_EDUCATION,
}


def _migrated(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """What each old item must look like after the upgrade.

    ``period`` gone, ``start``/``end`` seeded, **every other key untouched**
    and in the same order as the list it came from.
    """
    migrated: list[dict[str, Any]] = []
    for item in items:
        carried = {k: v for k, v in item.items() if k != 'period'}
        migrated.append({**carried, 'start': SEED_MONTH, 'end': SEED_MONTH})
    return migrated


@pytest.fixture(autouse=True)
def reset_pk_sequences() -> None:
    """Neutralise the directory-wide autouse fixture (see the sibling test)."""
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
        'cv_period_migration_under_test', _MIGRATION_PATH
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


def _cv_payload(prefix: str, *, populated: bool) -> dict[str, Any]:
    """A CV row at the parent revision. ``populated=False`` is the empty case.

    The empty case is not decoration: ``jsonb_agg`` over an empty array returns
    NULL, and the new column is NOT NULL, so a CV with no experience is exactly
    what makes a missing ``COALESCE`` abort the migration.
    """
    return {
        'name': f'{prefix} CV',
        'full_name': 'Ada Example',
        'headline': 'Backend Engineer',
        'location': 'Lisbon, PT',
        'email': 'ada@example.com',
        'phone': None,
        'summary': f'{prefix} summary',
        'links': json.dumps([
            {'id': 'lnk-1', 'label': 'site', 'url': 'https://ada.example.com'}
        ]),
        'skills': json.dumps([
            {'id': 'skl-1', 'category': 'Platform', 'keywords': ['python']}
        ]),
        'experience': json.dumps(_OLD_EXPERIENCE if populated else []),
        'projects': json.dumps([{'id': 'prj-1', 'name': 'applika'}]),
        'education': json.dumps(_OLD_EDUCATION if populated else []),
        'certifications': json.dumps([
            {'id': 'crt-1', 'name': 'AWS SAA', 'issuer': 'Amazon'}
        ]),
        'languages': json.dumps([
            {'id': 'lng-1', 'name': 'English', 'level': 'C2'}
        ]),
    }


def _seed_at_parent(url: str) -> None:
    """A user, a platform, an application, and three CV rows.

    Two ``base_cvs`` — one with both dated sections populated, one with both
    empty — and one ``tailored_cvs``, because the revision has to do the same
    work on the copy table as on the master table.
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
                    'github_id': 90101,
                    'username': 'cv_period_user',
                    'email': 'cv.period@example.com',
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
        ],
    )

    populated = _cv_payload('Master', populated=True)
    populated.update({'id': BASE_CV_ID, 'user_id': USER_ID, 'now': now})
    empty = _cv_payload('Bare', populated=False)
    empty.update({'id': EMPTY_BASE_CV_ID, 'user_id': USER_ID, 'now': now})
    copy = _cv_payload('Tailored', populated=True)
    copy.update({
        'id': TAILORED_CV_ID,
        'user_id': USER_ID,
        'application_id': APPLICATION_ID,
        'base_cv_id': BASE_CV_ID,
        'was_ai_generated': False,
        'adjustments': json.dumps([]),
        'now': now,
    })
    _apply(
        url,
        [
            (_INSERT_BASE_CV, populated),
            (_INSERT_BASE_CV, empty),
            (_INSERT_TAILORED_CV, copy),
        ],
    )


def _sections_of(url: str, table: str, cv_id: int) -> dict[str, Any]:
    rows = _query(
        url,
        f'SELECT experience, education FROM {table} WHERE id = :id',
        {'id': cv_id},
    )
    assert len(rows) == 1, rows
    return rows[0]


def _old_sections_of(url: str, table: str, cv_id: int) -> dict[str, Any]:
    rows = _query(
        url,
        f'SELECT experience_old, education_old FROM {table} WHERE id = :id',
        {'id': cv_id},
    )
    assert len(rows) == 1, rows
    return rows[0]


def _assert_migrated(url: str) -> None:
    """Every assertion that must hold right after an upgrade.

    Called after the first upgrade *and* after the second one, which is how
    ``.claude/rules/migration-tests.md`` 3's "the second upgrade equals the
    first" is proved rather than assumed.
    """
    for table, cv_id in (
        ('base_cvs', BASE_CV_ID),
        ('tailored_cvs', TAILORED_CV_ID),
    ):
        new = _sections_of(url, table, cv_id)
        old = _old_sections_of(url, table, cv_id)
        for section in _DATED_SECTIONS:
            expected = _migrated(_OLD_BY_SECTION[section])
            assert new[section] == expected, (table, section, new[section])
            # The original free text, verbatim and untouched. This is the
            # entire point of the ``_old`` route.
            assert old[f'{section}_old'] == _OLD_BY_SECTION[section], (
                table,
                section,
                old[f'{section}_old'],
            )

    # The empty CV: ``[]``, never NULL.
    empty = _sections_of(url, 'base_cvs', EMPTY_BASE_CV_ID)
    for section in _DATED_SECTIONS:
        assert empty[section] == [], (section, empty[section])
    empty_old = _old_sections_of(url, 'base_cvs', EMPTY_BASE_CV_ID)
    for section in _DATED_SECTIONS:
        assert empty_old[f'{section}_old'] == [], empty_old


# --------------------------------------------------------------------------
# non-destructive-migrations.md — upgrade drops nothing
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


def test_the_revision_is_a_new_child_of_the_cv_builder_revision(
    migration_db: str,
) -> None:
    """The owner: "to this change it needs to be in a new migration".

    ``f2a9c1d4b6e8`` was amended in place once, by explicit order and while it
    had never run anywhere. This one is a child of it, not an edit to it.
    """
    module = _load_migration_module()

    assert module.revision == REVISION, module.revision
    assert module.down_revision == PARENT_REVISION, module.down_revision


def test_upgrade_renames_rather_than_drops_and_adds_the_new_columns(
    migration_db: str,
) -> None:
    """Rules 2 and 3: nothing disappears, the retired columns get ``_old``."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    after_tables = _tables(migration_db)

    assert before_tables <= after_tables
    # Every column that existed still exists - the retired ones under a
    # ``_old`` name, which is the only kind of disappearance the rule allows.
    renamed = {
        (table, section) for table in _CV_TABLES for section in _DATED_SECTIONS
    }
    assert before_columns - after_columns == set(), (
        before_columns - after_columns
    )
    assert after_columns - before_columns == {
        (table, f'{section}_old') for table, section in renamed
    }, after_columns - before_columns


def test_the_new_columns_are_declared_like_every_other_section(
    migration_db: str,
) -> None:
    """JSONB, NOT NULL, ``server_default '[]'`` - as ``f2a9c1d4b6e8`` has it."""
    _upgrade(migration_db, REVISION)

    for table in _CV_TABLES:
        for section in _DATED_SECTIONS:
            definition = _query(
                migration_db,
                'SELECT data_type, is_nullable, column_default '
                'FROM information_schema.columns '
                'WHERE table_name = :table AND column_name = :column',
                {'table': table, 'column': section},
            )
            assert definition == [
                {
                    'data_type': 'jsonb',
                    'is_nullable': 'NO',
                    'column_default': "'[]'::jsonb",
                }
            ], (table, section, definition)


# --------------------------------------------------------------------------
# The data move
# --------------------------------------------------------------------------


def test_upgrade_seeds_every_item_and_keeps_the_original_text(
    migration_db: str,
) -> None:
    """The owner's two rulings, together: seed ``01/2026``, parse nothing."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    _assert_migrated(migration_db)


def test_a_parseable_period_is_seeded_exactly_like_an_unparseable_one(
    migration_db: str,
) -> None:
    """No parser, by order - and this is the assertion that proves it.

    ``exp-2`` said ``09/2016 - 07/2018``, which any date parser would read.
    It comes out with the same ``2026-01`` as ``exp-1``, whose period was
    prose. A parser sneaking in later fails here.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    experience = _sections_of(migration_db, 'base_cvs', BASE_CV_ID)[
        'experience'
    ]
    assert [item['start'] for item in experience] == [SEED_MONTH, SEED_MONTH]
    assert [item['end'] for item in experience] == [SEED_MONTH, SEED_MONTH]
    assert [item['id'] for item in experience] == ['exp-1', 'exp-2'], (
        'item order is preserved'
    )
    assert not any('period' in item for item in experience), experience


def test_every_other_field_of_every_item_crosses_unchanged(
    migration_db: str,
) -> None:
    """Only ``period`` is dropped; nothing else is touched or reordered."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    experience = _sections_of(migration_db, 'base_cvs', BASE_CV_ID)[
        'experience'
    ][0]
    assert experience['company'] == 'Acme'
    assert experience['company_description'] == 'Anvils, mostly'
    assert experience['role'] == 'Staff Engineer'
    assert experience['location'] == 'Lisbon, PT'
    assert experience['bullets'] == [
        'Cut p99 by half',
        'Owned the billing rewrite',
    ]

    education = _sections_of(migration_db, 'base_cvs', BASE_CV_ID)['education']
    assert education[1] == {
        'id': 'edu-2',
        'institution': 'Northgate College',
        'degree': "Bachelor's degree",
        'area': None,
        'start': SEED_MONTH,
        'end': SEED_MONTH,
    }, education[1]


def test_an_empty_section_migrates_to_an_empty_array_not_null(
    migration_db: str,
) -> None:
    """``jsonb_agg`` over zero rows is NULL; the column is NOT NULL.

    Without the ``COALESCE`` this row alone aborts the whole migration.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)

    _upgrade(migration_db, REVISION)

    sections = _sections_of(migration_db, 'base_cvs', EMPTY_BASE_CV_ID)
    assert sections == {'experience': [], 'education': []}, sections


# --------------------------------------------------------------------------
# The round trip
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """upgrade -> downgrade to ``f2a9c1d4b6e8`` -> upgrade again.

    Data asserted after every step, as
    ``.claude/rules/migration-tests.md`` 3 requires.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_columns = _columns(migration_db)

    # -- 1. Upgrade: the new structure holds the seeded copy, the ``_old``
    #       columns hold the original text.
    _upgrade(migration_db, REVISION)
    first_upgrade_columns = _columns(migration_db)
    _assert_migrated(migration_db)

    # -- 2. Downgrade: the original columns are back, with the original data,
    #       and no ``_old`` object is left behind.
    _downgrade(migration_db, PARENT_REVISION)

    assert _columns(migration_db) == parent_columns
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert not [
        column
        for _, column in _columns(migration_db)
        if column.endswith('_old')
    ]
    for table, cv_id in (
        ('base_cvs', BASE_CV_ID),
        ('tailored_cvs', TAILORED_CV_ID),
    ):
        restored = _sections_of(migration_db, table, cv_id)
        assert restored['experience'] == _OLD_EXPERIENCE, (table, restored)
        assert restored['education'] == _OLD_EDUCATION, (table, restored)
    empty = _sections_of(migration_db, 'base_cvs', EMPTY_BASE_CV_ID)
    assert empty == {'experience': [], 'education': []}, empty

    # -- 3. Upgrade again: identical to the first upgrade, schema and data.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_upgrade_columns
    _assert_migrated(migration_db)


def test_the_downgraded_columns_keep_their_not_null_and_default(
    migration_db: str,
) -> None:
    """A rollback has to leave a schema the previous release can write to."""
    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)

    for table in _CV_TABLES:
        for section in _DATED_SECTIONS:
            definition = _query(
                migration_db,
                'SELECT data_type, is_nullable, column_default '
                'FROM information_schema.columns '
                'WHERE table_name = :table AND column_name = :column',
                {'table': table, 'column': section},
            )
            assert definition == [
                {
                    'data_type': 'jsonb',
                    'is_nullable': 'NO',
                    'column_default': "'[]'::jsonb",
                }
            ], (table, section, definition)


def test_no_orm_model_maps_an_old_column() -> None:
    """non-destructive-migrations.md 7, asserted rather than trusted.

    The ``_old`` columns exist in the database and must exist **nowhere** in
    the application: not on ``BaseCVModel``, not on ``TailoredCVModel``, not
    in a DTO, not in a schema.
    """
    from app.domain.models import BaseCVModel, TailoredCVModel

    for model in (BaseCVModel, TailoredCVModel):
        mapped = {column.name for column in model.__table__.columns}
        assert not [name for name in mapped if name.endswith('_old')], (
            model.__name__,
            sorted(mapped),
        )

    app_dir = _BACKEND_ROOT / 'app'
    offenders = [
        path.relative_to(_BACKEND_ROOT)
        for path in app_dir.rglob('*.py')
        if '_old' in path.read_text(encoding='utf-8')
    ]
    assert offenders == [], offenders
