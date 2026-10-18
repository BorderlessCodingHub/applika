"""Round-trip test for revision ``647a047921ec`` (Release B of plan 0015):
the ``cvs`` beta list topped up with the users whose first CV came after
Release A, and the switch-over trigger dropped.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``f28e3d9705dd``, upgrade again - seeding
rows before the upgrade and asserting the data after each step.

Seed at ``ed39a0fad1e5`` (Release A's parent), then up to ``f28e3d9705dd``:

* P - a master CV before Release A, so Release A listed them; an admin then
  removed P from the list, and P made a second master CV after it;
* L - a CV copy before Release A (listed by it), still listed;
* N - first master CV after Release A;
* T - first CV is a CV copy after Release A;
* K - first master CV after Release A, enrolled by admin D in between;
* O - no CV; admin D - no CV.

Every user here is invented.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = '647a047921ec'
PARENT_REVISION = 'f28e3d9705dd'
RELEASE_A_PARENT = 'ed39a0fad1e5'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_VERSIONS = _BACKEND_ROOT / 'migrations' / 'versions'
_MIGRATION_PATH = _VERSIONS / f'{REVISION}_cvs_topup_and_drop_legacy_trigger.py'
_PARENT_PATH = _VERSIONS / f'{PARENT_REVISION}_cvs_feature_and_event_types.py'

CHECK_NAME = 'ck_timeline_events_event_type'
TRIGGER_NAME = 'trg_timeline_events_legacy_event_type'
FUNCTION_NAME = 'timeline_events_legacy_event_type'

USER_P = 7816000000000000001
USER_L = 7816000000000000002
USER_N = 7816000000000000003
USER_T = 7816000000000000004
USER_K = 7816000000000000005
USER_O = 7816000000000000006
ADMIN_D = 7816000000000000007

PLATFORM_ID = 7816000000000000101
APP_O = 7816000000000000201
APP_L = 7816000000000000202
APP_T = 7816000000000000203

CV_P_OLD = 7816000000000000301
CV_P_NEW = 7816000000000000302
COPY_L = 7816000000000000303
CV_N = 7816000000000000304
COPY_T = 7816000000000000305
CV_K = 7816000000000000306

INTERVIEW_ID = 7816000000000000401
RAW_ID = 7816000000000000402

ADMIN_ROW_ID = 7816000000000000501

BEFORE_A = datetime(2026, 3, 1, 9, 30, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def reset_pk_sequences() -> None:
    """Neutralise the directory-wide autouse fixture (see the sibling
    migration tests)."""
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


async def _integrity_error(
    url: str, statement: str, params: dict[str, Any]
) -> str:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
                with pytest.raises(IntegrityError) as caught:
                    await conn.execute(sa.text(statement), params)
                return str(caught.value)
    finally:
        await engine.dispose()


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


def _load_module(path: Path, name: str) -> ModuleType:
    spec = importlib.util.spec_from_file_location(name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _migration() -> ModuleType:
    return _load_module(_MIGRATION_PATH, 'cvs_topup_under_test')


def _parent() -> ModuleType:
    return _load_module(_PARENT_PATH, 'cvs_event_types_parent')


# --------------------------------------------------------------------------
# Inventory
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


def _trigger_exists(url: str) -> bool:
    return bool(
        _query(
            url,
            'SELECT 1 FROM pg_trigger WHERE tgname = :name '
            'AND NOT tgisinternal',
            {'name': TRIGGER_NAME},
        )
    )


def _function_exists(url: str) -> bool:
    return bool(
        _query(
            url,
            'SELECT 1 FROM pg_proc WHERE proname = :name',
            {'name': FUNCTION_NAME},
        )
    )


def _function_source(url: str) -> str:
    return _query(
        url,
        'SELECT pg_get_functiondef(oid) AS def FROM pg_proc '
        'WHERE proname = :name',
        {'name': FUNCTION_NAME},
    )[0]['def']


def _trigger_def(url: str) -> str:
    return _query(
        url,
        'SELECT pg_get_triggerdef(oid) AS def FROM pg_trigger '
        'WHERE tgname = :name',
        {'name': TRIGGER_NAME},
    )[0]['def']


def _cvs_feature(url: str) -> dict[str, Any]:
    rows = _query(url, "SELECT * FROM features WHERE key = 'cvs'")
    assert len(rows) == 1
    return rows[0]


def _beta_list(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT fb.* FROM feature_beta_users fb '
        'JOIN features f ON f.id = fb.feature_id '
        "WHERE f.key = 'cvs' ORDER BY fb.user_id",
    )


def _listed(url: str) -> set[int]:
    return {row['user_id'] for row in _beta_list(url)}


def _jobs_list(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT fb.* FROM feature_beta_users fb '
        'JOIN features f ON f.id = fb.feature_id '
        "WHERE f.key = 'jobs' ORDER BY fb.user_id",
    )


def _events(url: str) -> dict[int, dict[str, Any]]:
    rows = _query(url, 'SELECT * FROM timeline_events ORDER BY id')
    return {row['id']: row for row in rows}


def _version(url: str) -> str:
    return _query(url, 'SELECT version_num FROM alembic_version')[0][
        'version_num'
    ]


# --------------------------------------------------------------------------
# Seeding
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_admin, '
    'created_at) '
    'VALUES (:id, :id, :username, :email, 2, :is_admin, :now)'
)

_INSERT_APPLICATION = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, application_date, role, mode, '
    'company_name, is_draft, created_at) '
    "VALUES (:id, :user_id, :platform_id, :day, 'Backend Engineer', "
    "'active', 'Invented Co', false, :now)"
)

_INSERT_EVENT = (
    'INSERT INTO timeline_events '
    '(id, application_id, user_id, event_type, interview_type, event_date, '
    'observation, created_at) '
    'VALUES (:id, :application_id, :user_id, '
    'CAST(:event_type AS event_type), '
    'CAST(:interview_type AS interview_type), :event_date, :observation, '
    ':now)'
)


def _user(user_id: int, name: str, admin: bool = False) -> tuple[str, dict]:
    return (
        _INSERT_USER,
        {
            'id': user_id,
            'username': name,
            'email': f'{name}@example.com',
            'is_admin': admin,
            'now': BEFORE_A,
        },
    )


def _application(app_id: int, user_id: int) -> tuple[str, dict]:
    return (
        _INSERT_APPLICATION,
        {
            'id': app_id,
            'user_id': user_id,
            'platform_id': PLATFORM_ID,
            'day': date(2026, 2, 20),
            'now': BEFORE_A,
        },
    )


def _base_cv(row_id: int, user_id: int, at: datetime) -> tuple[str, dict]:
    return (
        'INSERT INTO base_cvs '
        '(id, user_id, name, full_name, headline, location, email, '
        'created_at) '
        "VALUES (:id, :user_id, 'Main CV', 'Invented Person', "
        "'Backend Engineer', 'Remote', 'invented@example.com', :at)",
        {'id': row_id, 'user_id': user_id, 'at': at},
    )


def _copy(
    row_id: int, user_id: int, app_id: int, at: datetime
) -> tuple[str, dict]:
    return (
        'INSERT INTO tailored_cvs '
        '(id, user_id, application_id, name, full_name, headline, location, '
        'email, created_at) '
        "VALUES (:id, :user_id, :app, 'Copy', 'Invented Person', "
        "'Backend Engineer', 'Remote', 'invented@example.com', :at)",
        {'id': row_id, 'user_id': user_id, 'app': app_id, 'at': at},
    )


def _event(
    event_id: int, event_type: str, interview_type: str | None = None
) -> tuple[str, dict]:
    return (
        _INSERT_EVENT,
        {
            'id': event_id,
            'application_id': APP_O,
            'user_id': USER_O,
            'event_type': event_type,
            'interview_type': interview_type,
            'event_date': date(2026, 3, 5),
            'observation': f'raw {event_type}',
            'now': BEFORE_A,
        },
    )


def _seed_at_release_a(url: str) -> datetime:
    """The state the B deploy finds; returns the ``cvs`` row's
    ``created_at``."""
    _upgrade(url, RELEASE_A_PARENT)
    _apply(
        url,
        [
            _user(USER_P, 'topup_removed_p'),
            _user(USER_L, 'topup_listed_l'),
            _user(USER_N, 'topup_late_n'),
            _user(USER_T, 'topup_late_copy_t'),
            _user(USER_K, 'topup_admin_added_k'),
            _user(USER_O, 'topup_none_o'),
            _user(ADMIN_D, 'topup_admin_d', admin=True),
            (
                'INSERT INTO platforms (id, name, created_at) '
                'VALUES (:id, :name, :now)',
                {'id': PLATFORM_ID, 'name': 'Invented Board', 'now': BEFORE_A},
            ),
            _application(APP_O, USER_O),
            _application(APP_L, USER_L),
            _application(APP_T, USER_T),
            _base_cv(CV_P_OLD, USER_P, BEFORE_A),
            _copy(COPY_L, USER_L, APP_L, BEFORE_A),
            _event(INTERVIEW_ID, 'interview', 'technical'),
        ],
    )
    _upgrade(url, PARENT_REVISION)
    seeded_at = _cvs_feature(url)['created_at']
    after_a = seeded_at + timedelta(minutes=5)
    feature_id = _cvs_feature(url)['id']
    _apply(
        url,
        [
            # An admin removes P between the releases; P then makes a
            # second master CV.
            (
                'DELETE FROM feature_beta_users '
                'WHERE user_id = :id AND feature_id = :feature_id',
                {'id': USER_P, 'feature_id': feature_id},
            ),
            _base_cv(CV_P_NEW, USER_P, after_a),
            _base_cv(CV_N, USER_N, after_a),
            _copy(COPY_T, USER_T, APP_T, after_a),
            _base_cv(CV_K, USER_K, after_a),
            # Admin D enrols K at /admin/features before the B deploy.
            (
                'INSERT INTO feature_beta_users '
                '(id, feature_id, user_id, added_by, created_at) '
                'VALUES (:id, :feature_id, :user_id, :admin, :now)',
                {
                    'id': ADMIN_ROW_ID,
                    'feature_id': feature_id,
                    'user_id': USER_K,
                    'admin': ADMIN_D,
                    'now': after_a,
                },
            ),
        ],
    )
    return seeded_at


# --------------------------------------------------------------------------
# Source-level checks
# --------------------------------------------------------------------------


def test_revision_is_the_only_head_on_release_a() -> None:
    script = ScriptDirectory.from_config(Config(str(_ALEMBIC_INI)))
    assert list(script.get_heads()) == [REVISION]
    assert script.get_revision(REVISION).down_revision == PARENT_REVISION


def test_upgrade_source_drops_no_column_or_table() -> None:
    module = _migration()
    source = inspect.getsource(module.upgrade)
    for helper in (module._top_up, module._cvs_feature):
        source += inspect.getsource(helper)
    source += module._DROP_LEGACY_TRIGGER_SQL + module._DROP_LEGACY_FUNCTION_SQL
    assert 'drop_column' not in source
    assert 'drop_table' not in source
    assert 'DROP TABLE' not in source.upper()
    assert 'DROP COLUMN' not in source.upper()


def test_duplicated_constants_match_revision_f28e3d9705dd() -> None:
    """A revision never imports another: the downgrade recreates Release A's
    function and trigger from a byte-for-byte copy, pinned here."""
    r2 = _migration()
    r1 = _parent()

    for name in (
        'FEATURE_KEY',
        'LEGACY_TYPES',
        'CONVERTED_TYPE',
        'CONVERTED_INTERVIEW_TYPE',
        'OLD_COLUMN',
        'LEGACY_FUNCTION',
        'LEGACY_TRIGGER',
        '_LEGACY_FUNCTION_SQL',
        '_CREATE_LEGACY_TRIGGER_SQL',
        '_DROP_LEGACY_TRIGGER_SQL',
        '_DROP_LEGACY_FUNCTION_SQL',
    ):
        assert getattr(r2, name) == getattr(r1, name), name
    assert inspect.getsource(r2._in_list) == inspect.getsource(r1._in_list)


def test_no_app_code_reads_event_type_old() -> None:
    app_dir = _BACKEND_ROOT / 'app'
    hits = [
        path
        for path in app_dir.rglob('*.py')
        if 'event_type_old' in path.read_text(encoding='utf-8')
    ]
    assert hits == []


# --------------------------------------------------------------------------
# Upgrade
# --------------------------------------------------------------------------


def test_upgrade_tops_up_users_whose_first_cv_came_after_release_a(
    migration_db: str,
) -> None:
    _seed_at_release_a(migration_db)
    assert _listed(migration_db) == {USER_L, USER_K}

    _upgrade(migration_db, REVISION)

    # N (master CV) and T (CV copy) came after A: added. L stays. K keeps
    # the admin's row. P's earliest CV predates the cvs row: stays off,
    # even with a new CV. O and D own no CV.
    assert _listed(migration_db) == {USER_L, USER_N, USER_T, USER_K}
    rows = {row['user_id']: row for row in _beta_list(migration_db)}
    assert rows[USER_N]['added_by'] is None
    assert rows[USER_T]['added_by'] is None
    assert rows[USER_N]['created_at'] is not None
    assert rows[USER_N]['id'] != rows[USER_T]['id']
    assert rows[USER_K]['id'] == ADMIN_ROW_ID
    assert rows[USER_K]['added_by'] == ADMIN_D
    # Only the cvs list is written.
    assert _jobs_list(migration_db) == []


def test_upgrade_drops_the_trigger_and_the_check_refuses_legacy_types(
    migration_db: str,
) -> None:
    _seed_at_release_a(migration_db)
    assert _trigger_exists(migration_db)

    _upgrade(migration_db, REVISION)

    assert not _trigger_exists(migration_db)
    assert not _function_exists(migration_db)
    for legacy in ('note', 'feedback'):
        error = _run(_integrity_error(migration_db, *_event(RAW_ID, legacy)))
        assert CHECK_NAME in error
    assert RAW_ID not in _events(migration_db)
    # A kept type still writes, untouched.
    _apply(migration_db, [_event(RAW_ID, 'interview', 'final')])
    raw = _events(migration_db)[RAW_ID]
    assert (raw['event_type'], raw['interview_type']) == ('interview', 'final')
    assert raw['event_type_old'] is None


def test_upgrade_leaves_events_and_every_column_and_table(
    migration_db: str,
) -> None:
    _seed_at_release_a(migration_db)
    events = _events(migration_db)
    columns = _columns(migration_db)
    tables = _tables(migration_db)
    feature = _cvs_feature(migration_db)

    _upgrade(migration_db, REVISION)

    assert _events(migration_db) == events
    assert _columns(migration_db) == columns
    assert ('timeline_events', 'event_type_old') in _columns(migration_db)
    assert _tables(migration_db) == tables
    assert _cvs_feature(migration_db) == feature


def test_upgrade_without_the_cvs_row_raises_and_writes_nothing(
    migration_db: str,
) -> None:
    _seed_at_release_a(migration_db)
    _apply(migration_db, [("DELETE FROM features WHERE key = 'cvs'", {})])

    with pytest.raises(RuntimeError, match="'cvs' features row is missing"):
        _upgrade(migration_db, REVISION)

    assert _version(migration_db) == PARENT_REVISION
    assert _trigger_exists(migration_db)
    assert _function_exists(migration_db)


# --------------------------------------------------------------------------
# Downgrade and round trip
# --------------------------------------------------------------------------


def test_downgrade_restores_the_trigger_and_keeps_the_top_up(
    migration_db: str,
) -> None:
    _seed_at_release_a(migration_db)
    function_a = _function_source(migration_db)
    trigger_a = _trigger_def(migration_db)
    columns_a = _columns(migration_db)
    _upgrade(migration_db, REVISION)
    listed = _beta_list(migration_db)

    _downgrade(migration_db, PARENT_REVISION)

    assert _version(migration_db) == PARENT_REVISION
    assert _trigger_exists(migration_db)
    assert _function_source(migration_db) == function_a
    assert _trigger_def(migration_db) == trigger_a
    assert _columns(migration_db) == columns_a
    # The top-up rows stay: the Release A image gates nothing on cvs.
    assert _beta_list(migration_db) == listed
    assert USER_N in _listed(migration_db)

    # The Release A image's note is converted again.
    _apply(migration_db, [_event(RAW_ID, 'note')])
    raw = _events(migration_db)[RAW_ID]
    assert (raw['event_type'], raw['interview_type']) == (
        'interview',
        'unknown',
    )
    assert raw['event_type_old'] == 'note'
    assert raw['observation'] == 'raw note'


def test_downgrade_then_release_a_rollback_restores_the_converted_rows(
    migration_db: str,
) -> None:
    """Release B rolled back, then Release A: a note the Release A image
    wrote after B's rollback is a note again."""
    _seed_at_release_a(migration_db)
    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)
    _apply(migration_db, [_event(RAW_ID, 'feedback')])

    _downgrade(migration_db, RELEASE_A_PARENT)

    raw = _events(migration_db)[RAW_ID]
    assert (raw['event_type'], raw['interview_type']) == ('feedback', None)
    assert not _trigger_exists(migration_db)


def test_round_trip_second_upgrade_equals_the_first(
    migration_db: str,
) -> None:
    _seed_at_release_a(migration_db)
    _upgrade(migration_db, REVISION)
    first_list = _beta_list(migration_db)
    first_events = _events(migration_db)
    first_columns = _columns(migration_db)
    first_feature = _cvs_feature(migration_db)

    _downgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    assert _version(migration_db) == REVISION
    assert _beta_list(migration_db) == first_list
    assert _events(migration_db) == first_events
    assert _columns(migration_db) == first_columns
    assert _cvs_feature(migration_db) == first_feature
    assert not _trigger_exists(migration_db)
    assert not _function_exists(migration_db)
    error = _run(_integrity_error(migration_db, *_event(RAW_ID, 'note')))
    assert CHECK_NAME in error


def test_reupgrade_adds_an_owner_who_came_during_the_rollback(
    migration_db: str,
) -> None:
    """The top-up is the rule, not a one-off: after a rollback to Release A,
    a user whose first CV came meanwhile is added by the re-upgrade."""
    seeded_at = _seed_at_release_a(migration_db)
    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)
    _apply(
        migration_db,
        [_base_cv(CV_P_NEW + 100, USER_O, seeded_at + timedelta(hours=1))],
    )

    _upgrade(migration_db, REVISION)

    assert _listed(migration_db) == {USER_L, USER_N, USER_T, USER_K, USER_O}
