"""Round-trip test for the schedule-interview-only revision
``af50c83911a7`` (R4, KODI-016).

``.claude/rules/migration-tests.md``: the **real Alembic chain** against a
dedicated testcontainers Postgres - upgrade to the revision, downgrade to
its parent ``c8b3e9f4a1d6`` (R3), upgrade again - with rows seeded before
the upgrade and the data asserted after every step.

Seeding strategy: the chain is upgraded to R3 first (empty database, so R1's
and R3's own backfills are no-ops), then rows are seeded **at R3's own
schema**, directly into ``application_steps`` for every event that should
have a legacy-step counterpart - R3's own (not-yet-replaced) sync trigger is
already live at that point, so a plain ``INSERT INTO application_steps``
fires it exactly like an old-code write and produces a matching
``timeline_events`` row with its schedule copied verbatim (R3 never touched
schedule fields), i.e. precisely the "dirty" pre-R4 shape this revision must
clean up. One event (a native ``note``) is seeded directly into
``timeline_events`` with no ``application_steps`` counterpart at all - a
Release B/C-native event a schedule (no validation existed before KODI-016's
backend part), which is exactly the case the revision's own docstring
documents as **not** recoverable on downgrade (owner: "you can remove the
value in the database as well in case of problems").

What is proved here, by acceptance criterion of KODI-016:

* 4 - ``downgrade()`` is not empty and works.
* 5 - the real Alembic chain, seed before upgrade, assert after every step.
* 6 - additive only in spirit (no column dropped, no table dropped); the
  schedule fields already existed since R1, this revision only tightens
  what they may hold on a non-interview row.
* The schedule-nulling: every non-interview event loses its schedule,
  interview events keep theirs.
* The CHECK: a direct write that violates it is refused.
* The trigger-function swap: an old-code write (a raw ``application_steps``
  insert/update - the Release A image's own shape) still satisfies the new
  CHECK after R4 runs, during the whole A -> B window, and the event is not
  swallowed by the catch-all.
* The finalize-sync function is untouched by this revision (it never writes
  a schedule) - pinned at the source level against R3's own copy.
* Downgrade restores R3's own step-function body byte-for-byte, drops the
  CHECK, and restores every schedule it can from ``application_steps`` -
  except the native note event, which has nowhere to restore from and stays
  cleared, exactly as documented.

The plumbing is the one of ``test_timeline_denied_reason_migration.py``.
Every row here is invented.
"""

import asyncio
import importlib.util
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, time, timezone
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

REVISION = 'af50c83911a7'
# R4's own down_revision - the round trip's target parent.
PARENT_REVISION = 'c8b3e9f4a1d6'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_timeline_events_schedule_interview_only.py'
)
_R3_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{PARENT_REVISION}_timeline_events_denied_reason.py'
)

USER_ID = 7401000000000000001
PLATFORM_ID = 7401000000000000002

APP_INTERVIEW = 7401000000000000101  # Phase 2 step, times -> kept
APP_OFFER = 7401000000000000102  # Offer step, times -> cleared
APP_DENIED = 7401000000000000103  # Denied step, times -> cleared
APP_NATIVE_NOTE = 7401000000000000104  # timeline-native note, times set
APP_NATIVE_NOTE_NO_TIMES = 7401000000000000105  # timeline-native, no times

S_INTERVIEW = 7401000000000001001
S_OFFER = 7401000000000001002
S_DENIED = 7401000000000001003

E_NATIVE_NOTE = 7401000000000002001
E_NATIVE_NOTE_NO_TIMES = 7401000000000002002

# Old-code writes simulated after R4 has run (the A -> B window).
S_OLD_CODE_NEW_OFFER = 7401000000000003001
S_OLD_CODE_NEW_INTERVIEW = 7401000000000003002
S_OLD_CODE_EDITED_OFF_INTERVIEW = S_INTERVIEW  # existing, edited to Offer

# Direct CHECK-violation probe.
E_CHECK_NOTE_WITH_SCHEDULE = 7401000000000004001

TIMES = {
    'start_time': time(9, 0),
    'end_time': time(10, 0),
    'timezone': 'America/Sao_Paulo',
}


# --------------------------------------------------------------------------
# Container / connection / Alembic plumbing (as ``test_timeline_denied_
# reason_migration.py``)
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
        _MIGRATION_PATH, 'timeline_schedule_interview_only_migration_under_test'
    )


def _load_r3_module() -> ModuleType:
    return _load_module(
        _R3_MIGRATION_PATH, 'timeline_denied_reason_migration_reference_for_r4'
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
# Seeding at R3's own schema (chain upgraded to PARENT_REVISION first).
# --------------------------------------------------------------------------

_INSERT_APP = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, application_date, role, mode, company_name, '
    'created_at) '
    'VALUES (:id, :user_id, :platform_id, :application_date, :role, '
    ':mode, :company_name, :now)'
)

_INSERT_STEP_WITH_TIMES = (
    'INSERT INTO application_steps '
    '(id, application_id, step_id, step_date, start_time, end_time, '
    'timezone, observation, user_id, created_at) '
    'VALUES (:id, :application_id, :step_id, :step_date, :start_time, '
    ':end_time, :timezone, NULL, :user_id, :now)'
)

_INSERT_NATIVE_EVENT = (
    'INSERT INTO timeline_events '
    '(id, application_id, user_id, event_type, event_date, start_time, '
    'end_time, timezone, created_at) '
    "VALUES (:id, :application_id, :user_id, 'note', :event_date, "
    ':start_time, :end_time, :timezone, :now)'
)


def _ids_by_name(url: str, table: str) -> dict[str, int]:
    return {
        row['name']: row['id']
        for row in _query(url, f'SELECT id, name FROM {table}')
    }


def _steps(url: str) -> dict[str, int]:
    return _ids_by_name(url, 'steps_definition')


def _seed(url: str) -> None:
    now = datetime(2025, 7, 1, 12, 0, tzinfo=timezone.utc)
    _apply(
        url,
        [
            (
                'INSERT INTO users '
                '(id, github_id, username, email, experience_years, '
                'created_at) '
                "VALUES (:id, :github_id, 'schedule_only_user', "
                "'schedule_only@example.com', 5, :now)",
                {'id': USER_ID, 'github_id': 90311, 'now': now},
            ),
            (
                'INSERT INTO platforms (id, name, created_at) '
                "VALUES (:id, 'Schedule Only Board', :now)",
                {'id': PLATFORM_ID, 'now': now},
            ),
        ],
    )
    steps = _steps(url)
    step_date = date(2025, 8, 1)

    for app_id in (
        APP_INTERVIEW,
        APP_OFFER,
        APP_DENIED,
        APP_NATIVE_NOTE,
        APP_NATIVE_NOTE_NO_TIMES,
    ):
        _sql(
            url,
            _INSERT_APP,
            id=app_id,
            user_id=USER_ID,
            platform_id=PLATFORM_ID,
            application_date=date(2025, 7, 1),
            role='Backend Engineer',
            mode='active',
            company_name=f'Company {app_id % 1000}',
            now=now,
        )

    # -- Legacy-step-shaped rows: the still-live R3 trigger fires and
    #    copies the schedule verbatim into timeline_events (the pre-R4
    #    "dirty" shape).
    _sql(
        url,
        _INSERT_STEP_WITH_TIMES,
        id=S_INTERVIEW,
        application_id=APP_INTERVIEW,
        step_id=steps['Phase 2'],
        step_date=step_date,
        user_id=USER_ID,
        now=now,
        **TIMES,
    )
    _sql(
        url,
        _INSERT_STEP_WITH_TIMES,
        id=S_OFFER,
        application_id=APP_OFFER,
        step_id=steps['Offer'],
        step_date=step_date,
        user_id=USER_ID,
        now=now,
        **TIMES,
    )
    _sql(
        url,
        _INSERT_STEP_WITH_TIMES,
        id=S_DENIED,
        application_id=APP_DENIED,
        step_id=steps['Denied'],
        step_date=step_date,
        user_id=USER_ID,
        now=now,
        **TIMES,
    )

    # -- A Release B/C-native note event with a schedule: no application_
    #    steps counterpart, so it has nowhere to be restored from on a
    #    downgrade (the documented caveat).
    _sql(
        url,
        _INSERT_NATIVE_EVENT,
        id=E_NATIVE_NOTE,
        application_id=APP_NATIVE_NOTE,
        user_id=USER_ID,
        event_date=step_date,
        now=now,
        **TIMES,
    )
    _sql(
        url,
        _INSERT_NATIVE_EVENT,
        id=E_NATIVE_NOTE_NO_TIMES,
        application_id=APP_NATIVE_NOTE_NO_TIMES,
        user_id=USER_ID,
        event_date=step_date,
        now=now,
        start_time=None,
        end_time=None,
        timezone=None,
    )


def _events(url: str) -> dict[int, dict[str, Any]]:
    return {
        row['id']: row
        for row in _query(
            url,
            'SELECT id, application_id, event_type::text AS event_type, '
            'start_time, end_time, timezone, event_date '
            'FROM timeline_events ORDER BY id',
        )
    }


def _to_r3(migration_db: str) -> None:
    """Real chain up to R3 (empty database - R1/R3's own backfills are
    no-ops), then seed at R3's own schema."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed(migration_db)


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


def test_the_revision_is_a_child_of_r3() -> None:
    module = _load_migration_module()
    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_r3_step_function_body_is_copied_byte_for_byte() -> None:
    """Downgrade must restore R3's own step-function body exactly - pinned
    at the source level, the same technique R2's and R3's own tests use."""
    r4 = _load_migration_module()
    r3 = _load_r3_module()

    assert r4._R3_STEP_FUNCTION_SQL == r3._STEP_FUNCTION_SQL


def test_finalize_function_is_left_unmodified() -> None:
    """The module docstring's claim: the finalize sync never writes a
    schedule, so this revision carries R3's body forward unchanged and
    never executes it (upgrade()/downgrade() never reference it)."""
    import inspect

    r4 = _load_migration_module()
    r3 = _load_r3_module()

    assert r4._APP_FUNCTION_SQL == r3._APP_FUNCTION_SQL
    upgrade_source = inspect.getsource(r4.upgrade)
    downgrade_source = inspect.getsource(r4.downgrade)
    assert '_APP_FUNCTION_SQL' not in upgrade_source
    assert '_APP_FUNCTION_SQL' not in downgrade_source


def test_no_temp_table_is_used() -> None:
    import inspect

    module = _load_migration_module()
    source = inspect.getsource(module)
    assert 'TEMPORARY TABLE' not in source
    assert 'TEMP TABLE' not in source


# --------------------------------------------------------------------------
# Upgrade: schema inventory, schedule clearing (KODI-016 criterion 4, 5, 6)
# --------------------------------------------------------------------------


def test_upgrade_only_adds_a_check(migration_db: str) -> None:
    _to_r3(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    after_tables = _tables(migration_db)
    assert before_columns == after_columns
    assert before_tables == after_tables
    assert _checks(migration_db) >= {
        'ck_timeline_events_schedule_interview_only'
    }


def test_non_interview_events_lose_their_schedule(migration_db: str) -> None:
    _to_r3(migration_db)

    _upgrade(migration_db, REVISION)

    events = _events(migration_db)
    for event_id in (E_NATIVE_NOTE,):
        event = events[event_id]
        assert event['start_time'] is None
        assert event['end_time'] is None
        assert event['timezone'] is None
    # Already-null native event is unaffected.
    no_times = events[E_NATIVE_NOTE_NO_TIMES]
    assert no_times['start_time'] is None

    # The step-shaped offer/denied events (whichever ids the trigger gave
    # them - same as the step id, R1's own convention) also lost theirs.
    offer_event = next(
        row for row in events.values() if row['application_id'] == APP_OFFER
    )
    denied_event = next(
        row for row in events.values() if row['application_id'] == APP_DENIED
    )
    assert offer_event['event_type'] == 'offer'
    assert offer_event['start_time'] is None
    assert offer_event['end_time'] is None
    assert offer_event['timezone'] is None
    assert denied_event['event_type'] == 'denied'
    assert denied_event['start_time'] is None
    assert denied_event['end_time'] is None
    assert denied_event['timezone'] is None


def test_interview_event_keeps_its_schedule(migration_db: str) -> None:
    _to_r3(migration_db)

    _upgrade(migration_db, REVISION)

    events = _events(migration_db)
    interview_event = next(
        row for row in events.values() if row['application_id'] == APP_INTERVIEW
    )
    assert interview_event['event_type'] == 'interview'
    assert interview_event['start_time'] == TIMES['start_time']
    assert interview_event['end_time'] == TIMES['end_time']
    assert interview_event['timezone'] == TIMES['timezone']


def test_the_check_rejects_a_direct_violation(migration_db: str) -> None:
    _to_r3(migration_db)
    _upgrade(migration_db, REVISION)

    assert _raises_integrity_error(
        migration_db,
        'INSERT INTO timeline_events '
        '(id, application_id, user_id, event_type, event_date, '
        'start_time, created_at) '
        "VALUES (:id, :app_id, :user_id, 'note', :day, :start_time, now())",
        id=E_CHECK_NOTE_WITH_SCHEDULE,
        app_id=APP_NATIVE_NOTE,
        user_id=USER_ID,
        day=date(2025, 9, 1),
        start_time=time(11, 0),
    )


# --------------------------------------------------------------------------
# Old-code writes during the A -> B window (trigger-function swap)
# --------------------------------------------------------------------------


def test_old_code_new_non_interview_step_syncs_with_null_schedule(
    migration_db: str,
) -> None:
    """A raw ``application_steps`` insert (old-code shape) for a
    non-interview step with times must still sync - the event exists, the
    catch-all did not swallow it - but with a null schedule."""
    _to_r3(migration_db)
    _upgrade(migration_db, REVISION)
    steps = _steps(migration_db)

    _sql(
        migration_db,
        _INSERT_STEP_WITH_TIMES,
        id=S_OLD_CODE_NEW_OFFER,
        application_id=APP_OFFER,
        step_id=steps['Offer'],
        step_date=date(2025, 9, 2),
        user_id=USER_ID,
        now=datetime(2025, 9, 2, 9, 0, tzinfo=timezone.utc),
        **TIMES,
    )

    events = _events(migration_db)
    assert S_OLD_CODE_NEW_OFFER in events
    event = events[S_OLD_CODE_NEW_OFFER]
    assert event['event_type'] == 'offer'
    assert event['start_time'] is None
    assert event['end_time'] is None
    assert event['timezone'] is None


def test_old_code_new_interview_step_keeps_its_schedule(
    migration_db: str,
) -> None:
    _to_r3(migration_db)
    _upgrade(migration_db, REVISION)
    steps = _steps(migration_db)

    _sql(
        migration_db,
        _INSERT_STEP_WITH_TIMES,
        id=S_OLD_CODE_NEW_INTERVIEW,
        application_id=APP_INTERVIEW,
        step_id=steps['Phase 3'],
        step_date=date(2025, 9, 2),
        user_id=USER_ID,
        now=datetime(2025, 9, 2, 9, 0, tzinfo=timezone.utc),
        **TIMES,
    )

    events = _events(migration_db)
    event = events[S_OLD_CODE_NEW_INTERVIEW]
    assert event['event_type'] == 'interview'
    assert event['start_time'] == TIMES['start_time']
    assert event['end_time'] == TIMES['end_time']
    assert event['timezone'] == TIMES['timezone']


def test_old_code_step_edited_off_interview_nulls_the_schedule(
    migration_db: str,
) -> None:
    _to_r3(migration_db)
    _upgrade(migration_db, REVISION)
    steps = _steps(migration_db)
    before = _events(migration_db)[S_OLD_CODE_EDITED_OFF_INTERVIEW]
    assert before['event_type'] == 'interview'
    assert before['start_time'] == TIMES['start_time']

    _sql(
        migration_db,
        'UPDATE application_steps SET step_id = :step_id, updated_at = now() '
        'WHERE id = :id',
        id=S_OLD_CODE_EDITED_OFF_INTERVIEW,
        step_id=steps['Offer'],
    )

    after = _events(migration_db)[S_OLD_CODE_EDITED_OFF_INTERVIEW]
    assert after['event_type'] == 'offer'
    assert after['start_time'] is None
    assert after['end_time'] is None
    assert after['timezone'] is None


# --------------------------------------------------------------------------
# Round trip (upgrade -> downgrade -> upgrade)
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _to_r3(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)
    parent_step_function = _function_def(
        migration_db, 'timeline_events_sync_application_step'
    )
    parent_app_function = _function_def(
        migration_db, 'timeline_events_sync_application_finalize'
    )

    # -- 1. Upgrade.
    _upgrade(migration_db, REVISION)
    first_events = _events(migration_db)
    assert first_events[E_NATIVE_NOTE]['start_time'] is None

    # -- 2. Downgrade: R3's schema, and the schedule restored wherever an
    #       application_steps row exists to restore it from.
    _downgrade(migration_db, PARENT_REVISION)

    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert 'ck_timeline_events_schedule_interview_only' not in _checks(
        migration_db
    )
    assert (
        _function_def(migration_db, 'timeline_events_sync_application_step')
        == parent_step_function
    )
    assert (
        _function_def(migration_db, 'timeline_events_sync_application_finalize')
        == parent_app_function
    )

    restored = _events(migration_db)
    offer_event = next(
        row for row in restored.values() if row['application_id'] == APP_OFFER
    )
    denied_event = next(
        row for row in restored.values() if row['application_id'] == APP_DENIED
    )
    assert offer_event['start_time'] == TIMES['start_time']
    assert offer_event['end_time'] == TIMES['end_time']
    assert offer_event['timezone'] == TIMES['timezone']
    assert denied_event['start_time'] == TIMES['start_time']
    interview_event = next(
        row
        for row in restored.values()
        if row['application_id'] == APP_INTERVIEW
    )
    assert interview_event['start_time'] == TIMES['start_time']
    # The native note event has no application_steps counterpart: nothing
    # to restore from, stays cleared (documented caveat).
    assert restored[E_NATIVE_NOTE]['start_time'] is None

    # -- 3. Upgrade again: identical to the first upgrade.
    _upgrade(migration_db, REVISION)
    second_events = _events(migration_db)
    assert second_events == first_events
    assert _checks(migration_db) >= {
        'ck_timeline_events_schedule_interview_only'
    }
