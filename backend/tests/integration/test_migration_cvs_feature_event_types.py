"""Round-trip test for revision ``f28e3d9705dd`` (Release A of plan 0015):
the ``cvs`` feature seeded with its CV owners, note and feedback events
converted to interviews of type unknown, and the switch-over trigger.

``.claude/rules/migration-tests.md`` 2: this drives the **real Alembic
chain** against a dedicated testcontainers Postgres - upgrade to the
revision, downgrade to its parent ``ed39a0fad1e5``, upgrade again - seeding
rows at the parent and asserting the data after each step.

Seed at the parent: user A (a master CV), user B (a CV copy on a draft
only), user C (no CV), admin D (no CV); on A's application a note with an
observation, a feedback, an unknown and a technical interview, an offer with
a salary and a denied with a reason.

Every user here is invented.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs
from app.core.enums import EventType
from app.domain.models import TimelineEventModel

REVISION = 'f28e3d9705dd'
PARENT_REVISION = 'ed39a0fad1e5'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_VERSIONS = _BACKEND_ROOT / 'migrations' / 'versions'
_MIGRATION_PATH = _VERSIONS / f'{REVISION}_cvs_feature_and_event_types.py'
_EXPAND_PATH = _VERSIONS / 'afd4074c70c2_timeline_events_expand.py'

CHECK_NAME = 'ck_timeline_events_event_type'
TRIGGER_NAME = 'trg_timeline_events_legacy_event_type'
FUNCTION_NAME = 'timeline_events_legacy_event_type'
DESCRIPTION = (
    'Master CVs, CV copies on applications and the new application with '
    'CV flow.'
)

USER_A = 7815000000000000001
USER_B = 7815000000000000002
USER_C = 7815000000000000003
ADMIN_D = 7815000000000000004
USER_E = 7815000000000000005

PLATFORM_ID = 7815000000000000101
APP_A = 7815000000000000201
DRAFT_B = 7815000000000000202
BASE_CV_A = 7815000000000000301
COPY_B = 7815000000000000302

NOTE_ID = 7815000000000000401
FEEDBACK_ID = 7815000000000000402
UNKNOWN_ID = 7815000000000000403
TECHNICAL_ID = 7815000000000000404
OFFER_ID = 7815000000000000405
DENIED_ID = 7815000000000000406
NOTE_2_ID = 7815000000000000407
FEEDBACK_2_ID = 7815000000000000408
RAW_NOTE_ID = 7815000000000000409

CREATED = datetime(2026, 3, 1, 9, 30, tzinfo=timezone.utc)
UPDATED = datetime(2026, 3, 2, 18, 45, tzinfo=timezone.utc)

# id -> original event_type, for every seeded event.
ORIGINAL_TYPES: dict[int, str] = {
    NOTE_ID: 'note',
    FEEDBACK_ID: 'feedback',
    UNKNOWN_ID: 'interview',
    TECHNICAL_ID: 'interview',
    OFFER_ID: 'offer',
    DENIED_ID: 'denied',
}
CONVERTED = {NOTE_ID, FEEDBACK_ID}


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


async def _expect_integrity_error(url: str, statements: list[str]) -> str:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with engine.connect() as conn:
            async with conn.begin():
                for statement in statements[:-1]:
                    await conn.execute(sa.text(statement))
                with pytest.raises(IntegrityError) as caught:
                    await conn.execute(sa.text(statements[-1]))
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
    return _load_module(_MIGRATION_PATH, 'cvs_event_types_under_test')


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


def _check_def(url: str) -> str | None:
    rows = _query(
        url,
        'SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint '
        "WHERE conname = :name AND conrelid = 'timeline_events'::regclass",
        {'name': CHECK_NAME},
    )
    return rows[0]['def'] if rows else None


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


def _events(url: str) -> dict[int, dict[str, Any]]:
    rows = _query(url, 'SELECT * FROM timeline_events ORDER BY id')
    return {row['id']: row for row in rows}


def _event(url: str, event_id: int) -> dict[str, Any]:
    return _events(url)[event_id]


def _cvs_features(url: str) -> list[dict[str, Any]]:
    return _query(url, "SELECT * FROM features WHERE key = 'cvs'")


def _beta_list(url: str) -> list[dict[str, Any]]:
    return _query(
        url,
        'SELECT fb.* FROM feature_beta_users fb '
        'JOIN features f ON f.id = fb.feature_id '
        "WHERE f.key = 'cvs' ORDER BY fb.user_id",
    )


def _listed(url: str) -> set[int]:
    return {row['user_id'] for row in _beta_list(url)}


def _version(url: str) -> str:
    return _query(url, 'SELECT version_num FROM alembic_version')[0][
        'version_num'
    ]


# --------------------------------------------------------------------------
# Seeding (at the parent revision)
# --------------------------------------------------------------------------

_INSERT_USER = (
    'INSERT INTO users '
    '(id, github_id, username, email, experience_years, is_admin, '
    'created_at) '
    'VALUES (:id, :id, :username, :email, 2, :is_admin, :now)'
)

_INSERT_EVENT = (
    'INSERT INTO timeline_events '
    '(id, application_id, user_id, event_type, interview_type, event_date, '
    'start_time, end_time, timezone, observation, salary_amount, '
    'salary_currency, salary_period, denied_reason, created_at, '
    'updated_at) '
    'VALUES (:id, :application_id, :user_id, '
    'CAST(:event_type AS event_type), '
    'CAST(:interview_type AS interview_type), :event_date, :start_time, '
    ':end_time, :timezone, :observation, :salary_amount, '
    'CAST(:salary_currency AS currency), '
    'CAST(:salary_period AS salaryperiod), '
    'CAST(:denied_reason AS denied_reason), :created_at, :updated_at)'
)


def _event_params(event_id: int, event_type: str, **over: Any) -> dict:
    params: dict[str, Any] = {
        'id': event_id,
        'application_id': APP_A,
        'user_id': USER_A,
        'event_type': event_type,
        'interview_type': None,
        'event_date': date(2026, 3, 1) + timedelta(days=event_id - NOTE_ID),
        'start_time': None,
        'end_time': None,
        'timezone': None,
        'observation': None,
        'salary_amount': None,
        'salary_currency': None,
        'salary_period': None,
        'denied_reason': None,
        'created_at': CREATED,
        'updated_at': UPDATED,
    }
    params.update(over)
    return params


def _cv_insert(table: str, extra_cols: str, extra_vals: str) -> str:
    return (
        f'INSERT INTO {table} '
        f'(id, user_id, {extra_cols}name, full_name, headline, location, '
        'email, created_at) '
        f'VALUES (:id, :user_id, {extra_vals}:name, :full_name, :headline, '
        ':location, :email, :now)'
    )


def _cv_params(row_id: int, user_id: int, **over: Any) -> dict:
    params: dict[str, Any] = {
        'id': row_id,
        'user_id': user_id,
        'name': 'Main CV',
        'full_name': 'Invented Person',
        'headline': 'Backend Engineer',
        'location': 'Remote',
        'email': 'invented@example.com',
        'now': CREATED,
    }
    params.update(over)
    return params


def _seed_at_parent(url: str, *, extra: list | None = None) -> None:
    _upgrade(url, PARENT_REVISION)
    users = [
        (USER_A, 'cvs_owner_a', False),
        (USER_B, 'cvs_copy_b', False),
        (USER_C, 'cvs_none_c', False),
        (ADMIN_D, 'cvs_admin_d', True),
    ]
    statements: list[tuple[str, dict[str, Any]]] = [
        (
            _INSERT_USER,
            {
                'id': uid,
                'username': name,
                'email': f'{name}@example.com',
                'is_admin': admin,
                'now': CREATED,
            },
        )
        for uid, name, admin in users
    ]
    statements += [
        (
            'INSERT INTO platforms (id, name, created_at) '
            'VALUES (:id, :name, :now)',
            {'id': PLATFORM_ID, 'name': 'Invented Board', 'now': CREATED},
        ),
        (
            'INSERT INTO applications '
            '(id, user_id, platform_id, application_date, role, mode, '
            'company_name, is_draft, created_at) '
            'VALUES (:id, :user_id, :platform_id, :day, :role, :mode, '
            ':company, :draft, :now)',
            {
                'id': APP_A,
                'user_id': USER_A,
                'platform_id': PLATFORM_ID,
                'day': date(2026, 2, 20),
                'role': 'Backend Engineer',
                'mode': 'active',
                'company': 'Invented Co',
                'draft': False,
                'now': CREATED,
            },
        ),
        (
            'INSERT INTO applications '
            '(id, user_id, platform_id, application_date, role, mode, '
            'company_name, is_draft, created_at) '
            'VALUES (:id, :user_id, :platform_id, :day, :role, :mode, '
            ':company, :draft, :now)',
            {
                'id': DRAFT_B,
                'user_id': USER_B,
                'platform_id': PLATFORM_ID,
                'day': date(2026, 2, 21),
                'role': 'Data Engineer',
                'mode': 'active',
                'company': 'Draft Co',
                'draft': True,
                'now': CREATED,
            },
        ),
        (_cv_insert('base_cvs', '', ''), _cv_params(BASE_CV_A, USER_A)),
        (
            _cv_insert('tailored_cvs', 'application_id, ', ':app, '),
            _cv_params(COPY_B, USER_B, app=DRAFT_B),
        ),
        (
            _INSERT_EVENT,
            _event_params(
                NOTE_ID, 'note', observation='Recruiter said they liked me'
            ),
        ),
        (
            _INSERT_EVENT,
            _event_params(FEEDBACK_ID, 'feedback', observation='Waiting'),
        ),
        (
            _INSERT_EVENT,
            _event_params(UNKNOWN_ID, 'interview', interview_type='unknown'),
        ),
        (
            _INSERT_EVENT,
            _event_params(
                TECHNICAL_ID,
                'interview',
                interview_type='technical',
                start_time=time(10, 0),
                end_time=time(11, 0),
                timezone='Europe/Lisbon',
            ),
        ),
        (
            _INSERT_EVENT,
            _event_params(
                OFFER_ID,
                'offer',
                salary_amount=Decimal('5000.00'),
                salary_currency='USD',
                salary_period='MONTHLY',
            ),
        ),
        (
            _INSERT_EVENT,
            _event_params(DENIED_ID, 'denied', denied_reason='ghosted'),
        ),
    ]
    statements += extra or []
    _apply(url, statements)


# --------------------------------------------------------------------------
# Source-level checks
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing() -> None:
    module = _migration()
    upgrade_src = inspect.getsource(module.upgrade)
    for helper in (
        module._convert_events,
        module._seed_feature,
        module._enrol_cv_owners,
        module._guard_step_definitions,
    ):
        upgrade_src += inspect.getsource(helper)
    assert 'drop_column' not in upgrade_src
    assert 'drop_table' not in upgrade_src
    assert 'DROP TABLE' not in upgrade_src.upper()
    assert 'DROP COLUMN' not in upgrade_src.upper()

    # The guard runs before any write.
    body = inspect.getsource(module.upgrade)
    assert body.index('_guard_step_definitions(') < body.index('_seed_feature(')

    downgrade_src = inspect.getsource(module.downgrade)
    assert downgrade_src.strip().splitlines()[-1].strip() != 'pass'
    assert 'UPDATE timeline_events' in downgrade_src


def test_revision_is_the_only_head_on_user_sessions() -> None:
    script = ScriptDirectory.from_config(Config(str(_ALEMBIC_INI)))
    assert list(script.get_heads()) == [REVISION]
    assert script.get_revision(REVISION).down_revision == PARENT_REVISION


def test_no_app_code_maps_event_type_old() -> None:
    assert 'event_type_old' not in TimelineEventModel.__table__.columns
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


def test_upgrade_seeds_cvs_in_beta_once(migration_db: str) -> None:
    _seed_at_parent(migration_db)
    before = datetime.now(timezone.utc)
    _upgrade(migration_db, REVISION)

    rows = _cvs_features(migration_db)
    assert len(rows) == 1
    row = rows[0]
    assert row['name'] == 'CV builder'
    assert row['description'] == DESCRIPTION
    assert row['stage'] == 'beta'
    assert row['released_at'] is None
    assert row['created_at'] >= before.replace(microsecond=0)
    keys = [r['key'] for r in _query(migration_db, 'SELECT key FROM features')]
    assert sorted(keys) == ['cvs', 'jobs']


def test_upgrade_lists_every_cv_owner_added_by_no_admin(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    rows = _beta_list(migration_db)
    # A owns a master CV, B only a CV copy on a draft; C and admin D own
    # no CV and are not listed.
    assert [r['user_id'] for r in rows] == [USER_A, USER_B]
    assert all(r['added_by'] is None for r in rows)
    assert all(r['created_at'] is not None for r in rows)
    assert len({r['id'] for r in rows}) == 2
    # Nobody is on the jobs list: only cvs was written.
    assert (
        _query(
            migration_db,
            'SELECT fb.id FROM feature_beta_users fb '
            "JOIN features f ON f.id = fb.feature_id WHERE f.key = 'jobs'",
        )
        == []
    )


def test_upgrade_lists_an_owner_of_both_kinds_once(migration_db: str) -> None:
    extra = [
        (
            _cv_insert('base_cvs', '', ''),
            _cv_params(BASE_CV_A + 10, USER_B, name='B master'),
        ),
        (
            _cv_insert('base_cvs', '', ''),
            _cv_params(BASE_CV_A + 11, USER_B, name='B second master'),
        ),
    ]
    _seed_at_parent(migration_db, extra=extra)
    _upgrade(migration_db, REVISION)

    assert [r['user_id'] for r in _beta_list(migration_db)] == [
        USER_A,
        USER_B,
    ]


def test_upgrade_converts_note_and_feedback_keeping_their_data(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    before = _events(migration_db)
    _upgrade(migration_db, REVISION)
    after = _events(migration_db)

    assert set(after) == set(before)
    assert not any(
        r['event_type'] in ('note', 'feedback') for r in after.values()
    )
    untouched_columns = (
        'id',
        'application_id',
        'user_id',
        'event_date',
        'observation',
        'start_time',
        'end_time',
        'timezone',
        'created_at',
        'updated_at',
    )
    for event_id in CONVERTED:
        row = after[event_id]
        assert row['event_type'] == 'interview'
        assert row['interview_type'] == 'unknown'
        for column in untouched_columns:
            assert row[column] == before[event_id][column], column
    assert after[NOTE_ID]['observation'] == 'Recruiter said they liked me'
    assert after[NOTE_ID]['updated_at'] == UPDATED
    assert after[NOTE_ID]['created_at'] == CREATED

    # Every other row is exactly as it was, plus its copy.
    for event_id in set(before) - CONVERTED:
        row = dict(after[event_id])
        assert row.pop('event_type_old') == before[event_id]['event_type']
        assert row == before[event_id]


def test_event_type_old_holds_the_original_type_on_every_row(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    assert {
        event_id: row['event_type_old']
        for event_id, row in _events(migration_db).items()
    } == ORIGINAL_TYPES


def test_check_allows_only_interview_offer_and_denied(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    definition = _check_def(migration_db)
    assert definition is not None
    for kept in ('interview', 'offer', 'denied'):
        assert f"'{kept}'" in definition
    for legacy in ('note', 'feedback'):
        assert f"'{legacy}'" not in definition

    # With the trigger out of the way the CHECK alone refuses a note.
    message = _run(
        _expect_integrity_error(
            migration_db,
            [
                f'ALTER TABLE timeline_events DISABLE TRIGGER {TRIGGER_NAME}',
                'INSERT INTO timeline_events '
                '(id, application_id, user_id, event_type, event_date, '
                f'created_at) VALUES ({RAW_NOTE_ID}, {APP_A}, {USER_A}, '
                "'note', '2026-03-20', now())",
            ],
        )
    )
    assert CHECK_NAME in message
    # The ALTER was rolled back with the failed transaction.
    assert _trigger_enabled(migration_db)


def _trigger_enabled(url: str) -> bool:
    rows = _query(
        url,
        'SELECT tgenabled::text AS tgenabled FROM pg_trigger '
        'WHERE tgname = :name',
        {'name': TRIGGER_NAME},
    )
    return bool(rows) and rows[0]['tgenabled'] == 'O'


def test_trigger_converts_what_the_previous_release_writes(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    assert _trigger_exists(migration_db)
    assert _function_exists(migration_db)

    # A raw INSERT of a note, exactly what the old code sends.
    _apply(
        migration_db,
        [
            (
                _INSERT_EVENT,
                _event_params(
                    RAW_NOTE_ID,
                    'note',
                    observation='written by the old image',
                    updated_at=None,
                ),
            ),
            # A raw UPDATE of an interview to feedback.
            (
                'UPDATE timeline_events SET '
                "event_type = 'feedback', interview_type = NULL "
                'WHERE id = :id',
                {'id': TECHNICAL_ID},
            ),
        ],
    )
    inserted = _event(migration_db, RAW_NOTE_ID)
    assert inserted['event_type'] == 'interview'
    assert inserted['interview_type'] == 'unknown'
    assert inserted['event_type_old'] == 'note'
    assert inserted['observation'] == 'written by the old image'

    updated = _event(migration_db, TECHNICAL_ID)
    assert updated['event_type'] == 'interview'
    assert updated['interview_type'] == 'unknown'
    assert updated['event_type_old'] == 'feedback'

    # Interview, offer and denied writes pass through untouched.
    _apply(
        migration_db,
        [
            (
                "UPDATE timeline_events SET interview_type = 'final' "
                'WHERE id = :id',
                {'id': UNKNOWN_ID},
            ),
        ],
    )
    final = _event(migration_db, UNKNOWN_ID)
    assert (final['event_type'], final['interview_type']) == (
        'interview',
        'final',
    )
    assert final['event_type_old'] == 'interview'


def test_every_step_id_a_0_1_4_client_reads_stays_the_same(
    migration_db: str,
) -> None:
    """R-017: ``afd4074c70c2`` ``REVERSE_STEP_MAP`` sends note and feedback
    to the same step as an interview of type unknown, so a converted event
    keeps the step id ``/steps`` showed for it."""
    reverse = _load_module(
        _EXPAND_PATH, 'timeline_expand_reverse'
    ).REVERSE_STEP_MAP
    assert reverse[('note', None)] == reverse[('interview', 'unknown')]
    assert reverse[('feedback', None)] == reverse[('interview', 'unknown')]

    _seed_at_parent(migration_db)
    steps = {
        r['name']: r['id']
        for r in _query(migration_db, 'SELECT id, name FROM steps_definition')
    }

    def step_ids() -> dict[int, int]:
        return {
            event_id: steps[reverse[(row['event_type'], row['interview_type'])]]
            for event_id, row in _events(migration_db).items()
        }

    before = step_ids()
    _upgrade(migration_db, REVISION)
    assert step_ids() == before


def test_no_column_or_table_is_missing_after_upgrade(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    tables_before = _tables(migration_db)
    columns_before = _columns(migration_db)
    _upgrade(migration_db, REVISION)

    assert _tables(migration_db) == tables_before
    columns_after = _columns(migration_db)
    assert columns_before <= columns_after
    assert columns_after - columns_before == {
        ('timeline_events', 'event_type_old')
    }


# --------------------------------------------------------------------------
# Downgrade and the second upgrade
# --------------------------------------------------------------------------


def test_downgrade_restores_unedited_rows_and_keeps_the_copy(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    seeded = _events(migration_db)
    _upgrade(migration_db, REVISION)
    first_list = _beta_list(migration_db)
    first_feature = _cvs_features(migration_db)

    _downgrade(migration_db, PARENT_REVISION)

    assert _version(migration_db) == PARENT_REVISION
    after = _events(migration_db)
    for event_id, row in after.items():
        row = dict(row)
        assert row.pop('event_type_old') == ORIGINAL_TYPES[event_id]
        assert row == seeded[event_id]
    assert after[NOTE_ID]['event_type'] == 'note'
    assert after[NOTE_ID]['interview_type'] is None
    assert after[FEEDBACK_ID]['event_type'] == 'feedback'
    assert after[FEEDBACK_ID]['interview_type'] is None
    # An original unknown interview is not a converted row.
    assert after[UNKNOWN_ID]['event_type'] == 'interview'
    assert after[UNKNOWN_ID]['interview_type'] == 'unknown'

    assert _check_def(migration_db) is None
    assert not _trigger_exists(migration_db)
    assert not _function_exists(migration_db)
    assert ('timeline_events', 'event_type_old') in _columns(migration_db)
    assert _cvs_features(migration_db) == first_feature
    assert _beta_list(migration_db) == first_list

    # The previous release writes a note and it stays a note.
    _apply(migration_db, [(_INSERT_EVENT, _event_params(RAW_NOTE_ID, 'note'))])
    assert _event(migration_db, RAW_NOTE_ID)['event_type'] == 'note'


def test_downgrade_keeps_a_converted_row_edited_in_between(
    migration_db: str,
) -> None:
    extra = [
        (_INSERT_EVENT, _event_params(NOTE_2_ID, 'note', observation='n2')),
        (
            _INSERT_EVENT,
            _event_params(FEEDBACK_2_ID, 'feedback', observation='f2'),
        ),
    ]
    _seed_at_parent(migration_db, extra=extra)
    _upgrade(migration_db, REVISION)

    # Release A users edit two converted rows: one to technical, one given
    # a schedule (still unknown).
    _apply(
        migration_db,
        [
            (
                "UPDATE timeline_events SET interview_type = 'technical' "
                'WHERE id = :id',
                {'id': NOTE_2_ID},
            ),
            (
                'UPDATE timeline_events SET start_time = :start, '
                'end_time = :end, timezone = :tz WHERE id = :id',
                {
                    'id': FEEDBACK_2_ID,
                    'start': time(14, 0),
                    'end': time(15, 0),
                    'tz': 'UTC',
                },
            ),
        ],
    )

    _downgrade(migration_db, PARENT_REVISION)

    events = _events(migration_db)
    assert (
        events[NOTE_2_ID]['event_type'],
        events[NOTE_2_ID]['interview_type'],
    ) == ('interview', 'technical')
    edited = events[FEEDBACK_2_ID]
    assert (edited['event_type'], edited['interview_type']) == (
        'interview',
        'unknown',
    )
    assert edited['start_time'] == time(14, 0)
    assert edited['timezone'] == 'UTC'
    # The unedited ones are back.
    assert events[NOTE_ID]['event_type'] == 'note'
    assert events[FEEDBACK_ID]['event_type'] == 'feedback'


def test_round_trip_second_upgrade_equals_the_first(
    migration_db: str,
) -> None:
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    first_events = _events(migration_db)
    first_list = _beta_list(migration_db)
    first_feature = _cvs_features(migration_db)
    first_check = _check_def(migration_db)

    _downgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    assert _version(migration_db) == REVISION
    assert _events(migration_db) == first_events
    assert _beta_list(migration_db) == first_list
    assert _cvs_features(migration_db) == first_feature
    assert len(_cvs_features(migration_db)) == 1
    assert _check_def(migration_db) == first_check
    assert _trigger_exists(migration_db)
    assert _function_exists(migration_db)
    # The trigger works after the re-upgrade too.
    _apply(migration_db, [(_INSERT_EVENT, _event_params(RAW_NOTE_ID, 'note'))])
    raw = _event(migration_db, RAW_NOTE_ID)
    assert (raw['event_type'], raw['event_type_old']) == ('interview', 'note')


def test_reupgrade_writes_no_list_row(migration_db: str) -> None:
    """The list is written only by the upgrade that creates the cvs row: an
    admin's removal made before a rollback stays after the roll-forward, and
    an owner who came after the seed is the later top-up's job."""
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)

    _apply(
        migration_db,
        [
            (
                'DELETE FROM feature_beta_users WHERE user_id = :id',
                {'id': USER_A},
            ),
            (
                _INSERT_USER,
                {
                    'id': USER_E,
                    'username': 'cvs_late_e',
                    'email': 'cvs_late_e@example.com',
                    'is_admin': False,
                    'now': CREATED,
                },
            ),
            (
                _cv_insert('base_cvs', '', ''),
                _cv_params(BASE_CV_A + 20, USER_E),
            ),
        ],
    )
    _upgrade(migration_db, REVISION)

    assert _listed(migration_db) == {USER_B}


# --------------------------------------------------------------------------
# Guard
# --------------------------------------------------------------------------


def test_guard_raises_before_any_write(migration_db: str) -> None:
    extra = [
        (
            'INSERT INTO steps_definition '
            '(id, name, color, strict, event_type, created_at) '
            "VALUES (:id, 'Odd step', '#000000', false, "
            "CAST('note' AS event_type), :now)",
            {'id': 7815000000000000501, 'now': CREATED},
        )
    ]
    _seed_at_parent(migration_db, extra=extra)
    columns_before = _columns(migration_db)
    seeded = _events(migration_db)

    with pytest.raises(RuntimeError, match='note or feedback'):
        _upgrade(migration_db, REVISION)

    assert _version(migration_db) == PARENT_REVISION
    assert _cvs_features(migration_db) == []
    assert _query(migration_db, 'SELECT id FROM feature_beta_users') == []
    assert _events(migration_db) == seeded
    assert _columns(migration_db) == columns_before
    assert _check_def(migration_db) is None
    assert not _trigger_exists(migration_db)


async def _orm_writes(url: str) -> None:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        async with AsyncSession(engine, expire_on_commit=False) as session:
            note = TimelineEventModel(
                id=RAW_NOTE_ID,
                application_id=APP_A,
                user_id=USER_A,
                event_type=EventType.NOTE,
                event_date=date(2026, 3, 20),
                observation='through the ORM',
            )
            session.add(note)
            await session.commit()
            edited = await session.get(TimelineEventModel, OFFER_ID)
            assert edited is not None
            edited.event_type = EventType.FEEDBACK
            edited.salary_amount = None
            edited.salary_currency = None
            edited.salary_period = None
            await session.commit()
    finally:
        await engine.dispose()


def test_the_previous_release_orm_writes_are_converted(
    migration_db: str,
) -> None:
    """The model the running image maps (five-member ``EventType``) writes a
    note and turns an offer into a feedback: both are stored as interviews
    of type unknown, the original type in ``event_type_old``."""
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    _run(_orm_writes(migration_db))

    note = _event(migration_db, RAW_NOTE_ID)
    assert (note['event_type'], note['interview_type']) == (
        'interview',
        'unknown',
    )
    assert note['event_type_old'] == 'note'
    assert note['observation'] == 'through the ORM'
    edited = _event(migration_db, OFFER_ID)
    assert (edited['event_type'], edited['interview_type']) == (
        'interview',
        'unknown',
    )
    assert edited['event_type_old'] == 'feedback'
