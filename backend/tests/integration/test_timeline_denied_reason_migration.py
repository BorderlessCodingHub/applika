"""Round-trip test for the denied-reason revision ``c8b3e9f4a1d6`` (R3,
KODI-014).

``.claude/rules/migration-tests.md``: the **real Alembic chain** against a
dedicated testcontainers Postgres - upgrade to the revision, downgrade to its
parent ``afd4074c70c2`` (R1), upgrade again - with rows seeded before the
upgrade and the data asserted after every step. Legacy rows are seeded
*before R1 itself runs* (at R1's own parent, ``d3f7b1c9e2a4``), exactly like
``test_timeline_expand_migration.py`` seeds its own fixtures, so R1's real
backfill is what turns the seeded ``Denied`` steps into ``denied``
``timeline_events`` rows before R3 ever runs.

What is proved here, by acceptance criterion of KODI-014:

* 4 (backend/migration part) - every ``denied`` event gets a reason from a
  fixed list, matched by the application's legacy feedback **name**, never
  its id; an unmapped or missing feedback falls back to ``unknown``.
* 5 - ``downgrade()`` is not empty and works.
* 6 - the real Alembic chain, seed before upgrade, assert after every step.
* 7 - additive only: no column or table is dropped by ``upgrade()``.
* The trigger-function swap: an old-code write (a raw ``application_steps``
  insert/update, a raw ``applications.feedback_id`` update - exactly the SQL
  shape the Release A image's own use cases issued) still satisfies the new
  CHECK after R3 runs, during the whole A -> B window.
* The CHECK itself: a direct write that violates it is refused.
* Downgrade restores R1's own trigger bodies byte-for-byte and leaves no
  trace of ``denied_reason`` (column, type, CHECK all gone).

The plumbing is the one of ``test_timeline_expand_migration.py``. Every row
here is invented.
"""

import asyncio
import importlib.util
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

REVISION = 'c8b3e9f4a1d6'
# R3's own down_revision - the round trip's target parent.
PARENT_REVISION = 'afd4074c70c2'
# R1's own down_revision - where legacy rows are seeded, before R1 itself
# runs (the brief: "seed legacy rows before R1").
GRANDPARENT_REVISION = 'd3f7b1c9e2a4'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_timeline_events_denied_reason.py'
)
_R1_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{PARENT_REVISION}_timeline_events_expand.py'
)

USER_ID = 7400000000000000001
PLATFORM_ID = 7400000000000000002

# Applications, one per feedback-mapping scenario, all with a Denied step
# except APP_NON_DENIED.
APP_NOT_GOOD_ENOUGH = 7400000000000000101
APP_SKILLS = 7400000000000000102
APP_ASSESSMENT_FAILED = 7400000000000000103
APP_TOO_MANY = 7400000000000000104
APP_POSITION_FILLED = 7400000000000000105
APP_ROLE_CLOSED = 7400000000000000106
APP_GHOST = 7400000000000000107
APP_UNMAPPED = 7400000000000000108  # feedback 'On going' - not in the map
APP_NO_FEEDBACK = 7400000000000000109  # Denied step, never finalized
APP_NON_DENIED = 7400000000000000110  # no Denied step at all

S_NOT_GOOD_ENOUGH = 7400000000000001001
S_SKILLS = 7400000000000001002
S_ASSESSMENT_FAILED = 7400000000000001003
S_TOO_MANY = 7400000000000001004
S_POSITION_FILLED = 7400000000000001005
S_ROLE_CLOSED = 7400000000000001006
S_GHOST = 7400000000000001007
S_UNMAPPED = 7400000000000001008
S_NO_FEEDBACK = 7400000000000001009
S_NON_DENIED = 7400000000000001010

# Old-code writes simulated after R3 has run (the A -> B window).
S_OLD_CODE_NEW_DENIED = 7400000000000002001  # a fresh Denied step insert
S_OLD_CODE_UNDENY = S_GHOST  # existing Denied step, edited off Denied

# Direct CHECK-violation probes.
E_CHECK_DENIED_NO_REASON = 7400000000000003001
E_CHECK_NOTE_WITH_REASON = 7400000000000003002

EXPECTED_REASON = {
    APP_NOT_GOOD_ENOUGH: 'not_good_enough',
    APP_SKILLS: 'skills_mismatch',
    APP_ASSESSMENT_FAILED: 'assessment_failed',
    APP_TOO_MANY: 'too_many_candidates',
    APP_POSITION_FILLED: 'position_filled',
    APP_ROLE_CLOSED: 'role_closed',
    APP_GHOST: 'ghosted',
    APP_UNMAPPED: 'unknown',
    APP_NO_FEEDBACK: 'unknown',
}


# --------------------------------------------------------------------------
# Container / connection / Alembic plumbing (as ``test_timeline_expand_
# migration.py``)
# --------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_pk_sequences() -> None:
    """Neutralise the directory-wide autouse fixture (see the sibling
    tests)."""
    return None


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


def _sql(url: str, statement: str, **params: Any) -> None:
    _apply(url, [(statement, params)])


def _raises_integrity_error(url: str, statement: str, **params: Any) -> bool:
    try:
        _sql(url, statement, **params)
    except IntegrityError:
        return True
    return False


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


def _load_migration_module() -> ModuleType:
    return _load_module(
        _MIGRATION_PATH, 'timeline_denied_reason_migration_under_test'
    )


def _load_r1_module() -> ModuleType:
    return _load_module(
        _R1_MIGRATION_PATH, 'timeline_expand_migration_reference_for_r3'
    )


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


def _types(url: str) -> set[str]:
    return {
        row['typname']
        for row in _query(
            url, "SELECT typname FROM pg_type WHERE typtype = 'e'"
        )
    }


def _checks(url: str) -> set[str]:
    return {
        row['conname']
        for row in _query(
            url,
            "SELECT conname FROM pg_constraint WHERE contype = 'c' "
            "AND conrelid = 'timeline_events'::regclass",
        )
    }


def _function_def(url: str, name: str) -> str:
    rows = _query(
        url,
        'SELECT pg_get_functiondef(oid) AS def FROM pg_proc '
        'WHERE proname = :name',
        {'name': name},
    )
    assert len(rows) == 1, (name, rows)
    return rows[0]['def']


# --------------------------------------------------------------------------
# Seeding at R1's own parent (pre-R1 schema, same shape
# ``test_timeline_expand_migration.py`` seeds).
# --------------------------------------------------------------------------

_INSERT_APP = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, application_date, role, mode, company_name, '
    'last_step_id, last_step_date, feedback_id, feedback_date, created_at) '
    'VALUES (:id, :user_id, :platform_id, :application_date, :role, '
    ':mode, :company_name, :last_step_id, :last_step_date, :feedback_id, '
    ':feedback_date, :now)'
)

_INSERT_STEP = (
    'INSERT INTO application_steps '
    '(id, application_id, step_id, step_date, start_time, end_time, '
    'timezone, observation, user_id, created_at) '
    'VALUES (:id, :application_id, :step_id, :step_date, NULL, NULL, '
    'NULL, NULL, :user_id, :now)'
)


def _ids_by_name(url: str, table: str) -> dict[str, int]:
    return {
        row['name']: row['id']
        for row in _query(url, f'SELECT id, name FROM {table}')
    }


def _steps(url: str) -> dict[str, int]:
    return _ids_by_name(url, 'steps_definition')


def _feedbacks(url: str) -> dict[str, int]:
    return _ids_by_name(url, 'feedbacks_definition')


# app_id -> (step id, step name, feedback name or None)
_SCENARIOS: dict[int, tuple[int, str, str | None]] = {
    APP_NOT_GOOD_ENOUGH: (S_NOT_GOOD_ENOUGH, 'Denied', 'Not good enough'),
    APP_SKILLS: (S_SKILLS, 'Denied', 'Skills'),
    APP_ASSESSMENT_FAILED: (
        S_ASSESSMENT_FAILED,
        'Denied',
        'Assessment failed',
    ),
    APP_TOO_MANY: (S_TOO_MANY, 'Denied', 'Too many candidates'),
    APP_POSITION_FILLED: (S_POSITION_FILLED, 'Denied', 'Position filled'),
    APP_ROLE_CLOSED: (S_ROLE_CLOSED, 'Denied', 'Role closed'),
    APP_GHOST: (S_GHOST, 'Denied', 'Ghost'),
    APP_UNMAPPED: (S_UNMAPPED, 'Denied', 'On going'),
    APP_NO_FEEDBACK: (S_NO_FEEDBACK, 'Denied', None),
    APP_NON_DENIED: (S_NON_DENIED, 'Phase 2', None),
}


def _seed_legacy(url: str) -> None:
    now = datetime(2025, 7, 1, 12, 0, tzinfo=timezone.utc)
    _apply(
        url,
        [
            (
                'INSERT INTO users '
                '(id, github_id, username, email, experience_years, '
                'created_at) '
                "VALUES (:id, :github_id, 'denied_reason_user', "
                "'denied_reason@example.com', 5, :now)",
                {'id': USER_ID, 'github_id': 90211, 'now': now},
            ),
            (
                'INSERT INTO platforms (id, name, created_at) '
                "VALUES (:id, 'Denied Reason Board', :now)",
                {'id': PLATFORM_ID, 'now': now},
            ),
        ],
    )
    steps = _steps(url)
    feedbacks = _feedbacks(url)
    closed = date(2025, 8, 20)

    app_rows: list[tuple[str, dict[str, Any]]] = []
    step_rows: list[tuple[str, dict[str, Any]]] = []
    for app_id, (step_id, step_name, feedback_name) in _SCENARIOS.items():
        finalized = feedback_name is not None
        app_rows.append((
            _INSERT_APP,
            {
                'id': app_id,
                'user_id': USER_ID,
                'platform_id': PLATFORM_ID,
                'application_date': date(2025, 7, 1),
                'role': 'Backend Engineer',
                'mode': 'active',
                'company_name': f'Company {app_id % 1000}',
                'last_step_id': steps[step_name],
                'last_step_date': closed if finalized else None,
                'feedback_id': (
                    feedbacks[feedback_name]
                    if feedback_name is not None
                    else None
                ),
                'feedback_date': closed if finalized else None,
                'now': now,
            },
        ))
        step_rows.append((
            _INSERT_STEP,
            {
                'id': step_id,
                'application_id': app_id,
                'step_id': steps[step_name],
                'step_date': closed,
                'user_id': USER_ID,
                'now': now,
            },
        ))
    _apply(url, app_rows)
    _apply(url, step_rows)


# --------------------------------------------------------------------------
# Snapshots
# --------------------------------------------------------------------------

_EVENT_ROWS_SQL = (
    'SELECT id, application_id, event_type::text AS event_type, '
    'interview_type::text AS interview_type, '
    'denied_reason::text AS denied_reason, event_date, observation '
    'FROM timeline_events ORDER BY id'
)


def _events(url: str) -> dict[int, dict[str, Any]]:
    return {row['id']: row for row in _query(url, _EVENT_ROWS_SQL)}


def _denied_event_for(url: str, application_id: int) -> dict[str, Any]:
    events = [
        row
        for row in _events(url).values()
        if row['application_id'] == application_id
        and row['event_type'] == 'denied'
    ]
    assert len(events) == 1, (application_id, events)
    return events[0]


def _to_r1(migration_db: str) -> None:
    """Real chain to R1's own parent, seed, real chain through R1 itself."""
    _upgrade(migration_db, GRANDPARENT_REVISION)
    _seed_legacy(migration_db)
    _upgrade(migration_db, PARENT_REVISION)


# --------------------------------------------------------------------------
# Source-level checks
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing() -> None:
    """non-destructive-migrations.md 2: drops only ever appear in
    downgrade()."""
    import inspect

    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)
    assert 'DROP' not in upgrade_source
    assert 'op.drop_column' not in upgrade_source
    assert 'op.drop_table' not in upgrade_source
    assert downgrade_source.strip() != 'def downgrade() -> None:\n    pass'
    assert 'DROP CONSTRAINT' in downgrade_source
    assert 'DROP COLUMN' in downgrade_source
    assert 'DROP TYPE' in downgrade_source


def test_the_revision_is_a_child_of_r1() -> None:
    module = _load_migration_module()
    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_r1_trigger_bodies_are_copied_byte_for_byte() -> None:
    """Downgrade must restore R1's own bodies exactly - pinned at the
    source level, the same technique R2's own test uses
    (``test_duplicated_constants_match_revision_afd4074c70c2_and_step_
    translation``)."""
    r3 = _load_migration_module()
    r1 = _load_r1_module()

    assert r3._R1_STEP_FUNCTION_SQL == r1._STEP_FUNCTION_SQL
    assert r3._R1_APP_FUNCTION_SQL == r1._APP_FUNCTION_SQL


def test_no_temp_table_is_used() -> None:
    """The brief's warning: KODI-013 hit a temp-table name collision when a
    single multi-revision command crossed two revisions' bodies sharing an
    outer transaction. R3 sidesteps the whole class by using none."""
    import inspect

    module = _load_migration_module()
    source = inspect.getsource(module)
    assert 'TEMPORARY TABLE' not in source
    assert 'TEMP TABLE' not in source


# --------------------------------------------------------------------------
# Upgrade: schema inventory, backfill (KODI-014 criterion 4, 5, 6, 7)
# --------------------------------------------------------------------------


def test_upgrade_only_adds(migration_db: str) -> None:
    _to_r1(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    after_tables = _tables(migration_db)
    assert before_columns <= after_columns
    assert after_columns - before_columns == {
        ('timeline_events', 'denied_reason')
    }
    assert before_tables == after_tables
    assert 'denied_reason' in _types(migration_db)
    assert _checks(migration_db) >= {'ck_timeline_events_denied_reason'}


def test_every_denied_event_gets_the_mapped_reason(migration_db: str) -> None:
    _to_r1(migration_db)

    _upgrade(migration_db, REVISION)

    for app_id, expected in EXPECTED_REASON.items():
        event = _denied_event_for(migration_db, app_id)
        assert event['denied_reason'] == expected, app_id

    # No denied event at all for the non-denied application.
    assert not [
        row
        for row in _events(migration_db).values()
        if row['application_id'] == APP_NON_DENIED
        and row['event_type'] == 'denied'
    ]
    # And its (interview) event carries no reason.
    non_denied_event = next(
        row
        for row in _events(migration_db).values()
        if row['application_id'] == APP_NON_DENIED
    )
    assert non_denied_event['denied_reason'] is None


def test_the_check_rejects_a_mismatched_row(migration_db: str) -> None:
    _to_r1(migration_db)
    _upgrade(migration_db, REVISION)

    # denied without a reason.
    assert _raises_integrity_error(
        migration_db,
        'INSERT INTO timeline_events '
        '(id, application_id, user_id, event_type, event_date, created_at) '
        "VALUES (:id, :app_id, :user_id, 'denied', :day, now())",
        id=E_CHECK_DENIED_NO_REASON,
        app_id=APP_NON_DENIED,
        user_id=USER_ID,
        day=date(2025, 9, 1),
    )
    # a reason on a non-denied event.
    assert _raises_integrity_error(
        migration_db,
        'INSERT INTO timeline_events '
        '(id, application_id, user_id, event_type, denied_reason, '
        'event_date, created_at) '
        "VALUES (:id, :app_id, :user_id, 'note', 'unknown', :day, now())",
        id=E_CHECK_NOTE_WITH_REASON,
        app_id=APP_NON_DENIED,
        user_id=USER_ID,
        day=date(2025, 9, 1),
    )


# --------------------------------------------------------------------------
# Old-code writes during the A -> B window (trigger-function swap)
# --------------------------------------------------------------------------


def test_old_code_new_denied_step_gets_the_mapped_reason(
    migration_db: str,
) -> None:
    """A raw ``application_steps`` insert (old-code shape) for an
    application whose current feedback maps to a reason."""
    _to_r1(migration_db)
    _upgrade(migration_db, REVISION)
    steps = _steps(migration_db)

    _sql(
        migration_db,
        'INSERT INTO application_steps '
        '(id, application_id, step_id, step_date, user_id, created_at) '
        'VALUES (:id, :app_id, :step_id, :day, :user_id, now())',
        id=S_OLD_CODE_NEW_DENIED,
        app_id=APP_TOO_MANY,
        step_id=steps['Denied'],
        day=date(2025, 9, 2),
        user_id=USER_ID,
    )

    events = _events(migration_db)
    assert events[S_OLD_CODE_NEW_DENIED]['event_type'] == 'denied'
    assert (
        events[S_OLD_CODE_NEW_DENIED]['denied_reason'] == 'too_many_candidates'
    )


def test_old_code_step_with_no_feedback_gets_unknown(
    migration_db: str,
) -> None:
    _to_r1(migration_db)
    _upgrade(migration_db, REVISION)
    steps = _steps(migration_db)

    _sql(
        migration_db,
        'INSERT INTO application_steps '
        '(id, application_id, step_id, step_date, user_id, created_at) '
        'VALUES (:id, :app_id, :step_id, :day, :user_id, now())',
        id=7400000000000002002,
        app_id=APP_NO_FEEDBACK,
        step_id=steps['Denied'],
        day=date(2025, 9, 2),
        user_id=USER_ID,
    )

    events = _events(migration_db)
    assert events[7400000000000002002]['denied_reason'] == 'unknown'


def test_old_code_step_edited_off_denied_nulls_the_reason(
    migration_db: str,
) -> None:
    _to_r1(migration_db)
    _upgrade(migration_db, REVISION)
    steps = _steps(migration_db)
    before = _denied_event_for(migration_db, APP_GHOST)
    assert before['denied_reason'] == 'ghosted'

    _sql(
        migration_db,
        'UPDATE application_steps SET step_id = :step_id, updated_at = now() '
        'WHERE id = :id',
        id=S_OLD_CODE_UNDENY,
        step_id=steps['Phase 2'],
    )

    events = _events(migration_db)
    assert events[S_OLD_CODE_UNDENY]['event_type'] == 'interview'
    assert events[S_OLD_CODE_UNDENY]['denied_reason'] is None


def test_old_code_finalize_sets_the_terminal_denied_events_reason(
    migration_db: str,
) -> None:
    """The application had no feedback (so its Denied event was backfilled
    ``unknown``); an old-code finalize write (raw ``applications.feedback_id``
    update) now sets it."""
    _to_r1(migration_db)
    _upgrade(migration_db, REVISION)
    feedbacks = _feedbacks(migration_db)
    before = _denied_event_for(migration_db, APP_NO_FEEDBACK)
    assert before['denied_reason'] == 'unknown'

    _sql(
        migration_db,
        'UPDATE applications SET feedback_id = :feedback_id, '
        'feedback_date = :day WHERE id = :id',
        id=APP_NO_FEEDBACK,
        feedback_id=feedbacks['Role closed'],
        day=date(2025, 9, 3),
    )

    after = _denied_event_for(migration_db, APP_NO_FEEDBACK)
    assert after['denied_reason'] == 'role_closed'
    # And finalized_at moved (R1's own behaviour, untouched by R3).
    apps = _query(
        migration_db,
        'SELECT finalized_at FROM applications WHERE id = :id',
        {'id': APP_NO_FEEDBACK},
    )
    assert apps[0]['finalized_at'] is not None


def test_old_code_finalize_never_sets_a_reason_on_a_non_denied_terminal(
    migration_db: str,
) -> None:
    """The finalize sync's denied_reason update is a no-op on a terminal
    event that is not itself denied - the CHECK is never at risk."""
    _to_r1(migration_db)
    _upgrade(migration_db, REVISION)
    feedbacks = _feedbacks(migration_db)

    _sql(
        migration_db,
        'UPDATE applications SET feedback_id = :feedback_id, '
        'feedback_date = :day WHERE id = :id',
        id=APP_NON_DENIED,
        feedback_id=feedbacks['On going'],
        day=date(2025, 9, 3),
    )

    non_denied_event = next(
        row
        for row in _events(migration_db).values()
        if row['application_id'] == APP_NON_DENIED
    )
    assert non_denied_event['denied_reason'] is None


# --------------------------------------------------------------------------
# Round trip (upgrade -> downgrade -> upgrade)
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _to_r1(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)
    parent_step_function = _function_def(
        migration_db, 'timeline_events_sync_application_step'
    )
    parent_app_function = _function_def(
        migration_db, 'timeline_events_sync_application_finalize'
    )
    other_data_before = _query(
        migration_db,
        'SELECT id, application_id, event_type::text AS event_type, '
        'interview_type::text AS interview_type, event_date, observation '
        'FROM timeline_events ORDER BY id',
    )

    # -- 1. Upgrade.
    _upgrade(migration_db, REVISION)
    first_events = _events(migration_db)

    # -- 2. Downgrade: R1's schema and R1's data, exactly.
    _downgrade(migration_db, PARENT_REVISION)

    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert 'denied_reason' not in _types(migration_db)
    assert 'ck_timeline_events_denied_reason' not in _checks(migration_db)
    assert (
        _function_def(migration_db, 'timeline_events_sync_application_step')
        == parent_step_function
    )
    assert (
        _function_def(migration_db, 'timeline_events_sync_application_finalize')
        == parent_app_function
    )
    other_data_after = _query(
        migration_db,
        'SELECT id, application_id, event_type::text AS event_type, '
        'interview_type::text AS interview_type, event_date, observation '
        'FROM timeline_events ORDER BY id',
    )
    assert other_data_after == other_data_before

    # -- 3. Upgrade again: identical to the first upgrade.
    _upgrade(migration_db, REVISION)
    second_events = _events(migration_db)
    assert second_events == first_events
    assert _checks(migration_db) >= {'ck_timeline_events_denied_reason'}


def test_single_command_downgrade_and_upgrade_cross_two_revisions(
    migration_db: str,
) -> None:
    """A single ``alembic downgrade``/``upgrade`` command that crosses R3's
    downgrade() and R1's own downgrade() in the same outer transaction
    (``migrations/env.py``) must not collide - R3 uses no temp table at all,
    so the KODI-013 class of bug cannot reproduce here, but the composed
    round trip itself is still pinned end to end."""
    _upgrade(migration_db, GRANDPARENT_REVISION)
    pre_r1_columns = _columns(migration_db)
    pre_r1_tables = _tables(migration_db)

    _seed_legacy(migration_db)
    _upgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    _downgrade(migration_db, GRANDPARENT_REVISION)

    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': GRANDPARENT_REVISION}
    ]
    assert _columns(migration_db) == pre_r1_columns
    assert _tables(migration_db) == pre_r1_tables

    _upgrade(migration_db, REVISION)
    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': REVISION}
    ]
    for app_id, expected in EXPECTED_REASON.items():
        assert _denied_event_for(migration_db, app_id)['denied_reason'] == (
            expected
        )
