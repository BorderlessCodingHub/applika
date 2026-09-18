"""Round-trip test for the contract revision ``ad747aba90fc`` (R2, KODI-013).

``.claude/rules/migration-tests.md``: the **real Alembic chain** against a
dedicated testcontainers Postgres - upgrade to the revision, downgrade to its
parent ``afd4074c70c2`` (R1), upgrade again - with rows seeded before the
upgrade and the data asserted after every step.

What is proved here, by acceptance criterion of KODI-013 (Engineer A's
ownership - see the slice brief):

* AC1 (R-015) - the **reconcile design**: an old-code write the R1 trigger
  failed to sync is copied into ``timeline_events`` by the upgrade; an event
  a Release B/C user deleted is **not** resurrected. Both cases are seeded
  side by side and asserted separately
  (``test_reconcile_copies_unsynced_writes_and_never_resurrects_deletions``).
* AC7 (R-029), AC8, AC9 - the round trip: every rename reverses, the
  triggers come back working, ``downgrade()`` is not empty, nothing is ever
  dropped (``op.drop_column``/``op.drop_table`` do not appear anywhere in
  this revision - checked by grep in ``.claude/rules/
  non-destructive-migrations.md`` and pinned here too).
* AC10 - ``test_upgrade_renames_and_drops_nothing`` compares the full
  column/table inventory before and after: exactly the renamed objects
  change name, nothing is missing.
* AC16 - no new feature work: this file and the revision touch only the R2
  migration.
* AC17 (R-031, row remap) - ``ANNUAL`` -> ``ANNUALLY`` on ``applications``,
  ``users`` and ``timeline_events``, reversed on downgrade.
* The KODI-010 Denied-with-salary flag survives the round trip in
  ``applications.salary_offer_old``, pinned by
  ``test_denied_with_salary_survives_the_round_trip``.
* T052 (AC2-AC5, backend side, on the **post-R2** schema): the deprecated
  0.1.4 routes, the new optional-outcome finalize, ``/supports`` and the
  timeline CRUD all run against the real migrated schema through the real
  API, not ``Base.metadata.create_all`` - see the module's second half.

The plumbing (container, Alembic invocation, schema inventory) is the one of
``test_timeline_expand_migration.py`` (R1). Every row here is invented.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import AsyncIterator, Callable, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import pytest_asyncio
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = 'ad747aba90fc'
PARENT_REVISION = 'afd4074c70c2'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_timeline_events_contract.py'
)
_R1_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{PARENT_REVISION}_timeline_events_expand.py'
)

USER_ID = 7300000000000000001
PLATFORM_ID = 7300000000000000002

# Applications.
APP_UNSYNCED = 7300000000000000101  # old-code write the trigger failed to sync
APP_BDELETED = 7300000000000000102  # step whose migrated event was deleted
APP_OFFER_SALARY = 7300000000000000103  # finalized offer, untouched by C
APP_DENIED_SALARY = 7300000000000000104  # KODI-010 flag: Denied + salary
APP_ANNUAL = 7300000000000000105  # ANNUAL rows on all 3 tables
APP_TOUCHED_BY_C = 7300000000000000106  # Release C writes after the upgrade

# application_steps ids.
S_UNSYNCED = 7300000000000001001
S_BDELETED = 7300000000000001002
S_OFFER = 7300000000000001003
S_DENIED = 7300000000000001004
S_TOUCHED = 7300000000000001005

# Standalone timeline_events ids (never a step).
E_ANNUAL_OFFER = 7300000000000002001

# Release C writes, simulated after the R2 upgrade.
C_NOTE = 7300000000000003001
C_DENIED = 7300000000000003002


# --------------------------------------------------------------------------
# Container / connection plumbing (as ``test_timeline_expand_migration.py``)
# --------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def reset_pk_sequences() -> None:
    """Neutralise the directory-wide autouse fixture (see the sibling test)."""
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


def _load_migration_module() -> ModuleType:
    return _load_module(
        _MIGRATION_PATH, 'timeline_contract_migration_under_test'
    )


def _load_r1_module() -> ModuleType:
    return _load_module(
        _R1_MIGRATION_PATH, 'timeline_expand_migration_reference'
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


def _enum_labels(url: str, name: str) -> list[str]:
    return [
        row['enumlabel']
        for row in _query(
            url,
            'SELECT e.enumlabel FROM pg_enum e '
            'JOIN pg_type t ON t.oid = e.enumtypid '
            'WHERE t.typname = :name ORDER BY e.enumsortorder',
            {'name': name},
        )
    ]


def _triggers(url: str) -> list[str]:
    return [
        row['tgname']
        for row in _query(
            url,
            "SELECT tgname FROM pg_trigger WHERE tgname LIKE 'trg_%sync'",
        )
    ]


# --------------------------------------------------------------------------
# Catalog lookups (steps_definition/feedbacks_definition, frozen since R1,
# seeded by ``e3abe9dc93d4`` and mapped by ``afd4074c70c2``).
# --------------------------------------------------------------------------


def _ids_by_name(url: str, table: str) -> dict[str, int]:
    return {
        row['name']: row['id']
        for row in _query(url, f'SELECT id, name FROM {table}')
    }


def _steps(url: str) -> dict[str, int]:
    return _ids_by_name(url, 'steps_definition')


def _feedbacks(url: str) -> dict[str, int]:
    return _ids_by_name(url, 'feedbacks_definition')


# --------------------------------------------------------------------------
# Seeding directly at R1's post-upgrade shape (no migration re-run: R1
# already ran in production; this seeds rows the way it leaves them, the
# same approach ``test_migrated_data_reads.py`` uses for reads).
# --------------------------------------------------------------------------

_INSERT_APP = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, application_date, role, mode, company_name, '
    'salary_offer, currency, salary_period, last_step_id, last_step_date, '
    'feedback_id, feedback_date, finalized_at, created_at) '
    'VALUES (:id, :user_id, :platform_id, :application_date, :role, '
    ':mode, :company_name, :salary_offer, CAST(:currency AS currency), '
    'CAST(:salary_period AS salaryperiod), :last_step_id, :last_step_date, '
    ':feedback_id, :feedback_date, :finalized_at, :now)'
)

_INSERT_STEP = (
    'INSERT INTO application_steps '
    '(id, application_id, step_id, step_date, start_time, end_time, '
    'timezone, observation, user_id, created_at) '
    'VALUES (:id, :application_id, :step_id, :step_date, :start_time, '
    ':end_time, :timezone, :observation, :user_id, :now)'
)

_INSERT_EVENT = (
    'INSERT INTO timeline_events '
    '(id, application_id, user_id, event_type, interview_type, event_date, '
    'observation, salary_amount, salary_currency, salary_period, created_at) '
    'VALUES (:id, :application_id, :user_id, CAST(:event_type AS event_type), '
    'CAST(:interview_type AS interview_type), :event_date, :observation, '
    ':salary_amount, CAST(:salary_currency AS currency), '
    'CAST(:salary_period AS salaryperiod), :now)'
)


def _seed_at_r1(url: str) -> None:
    module = _load_migration_module()
    cutover = module._R1_MIGRATION_RAN_AT
    before_cutover = cutover - timedelta(days=400)
    after_cutover = cutover + timedelta(hours=2)
    now = datetime(2025, 7, 1, 12, 0, tzinfo=timezone.utc)

    _apply(
        url,
        [
            (
                'INSERT INTO users '
                '(id, github_id, username, email, experience_years, '
                'created_at) '
                'VALUES (:id, :github_id, :username, :email, 5, :now)',
                {
                    'id': USER_ID,
                    'github_id': 90310,
                    'username': 'contract_user',
                    'email': 'contract@example.com',
                    'now': now,
                },
            ),
            (
                'INSERT INTO platforms (id, name, created_at) '
                "VALUES (:id, 'Contract Board', :now)",
                {'id': PLATFORM_ID, 'now': now},
            ),
        ],
    )
    steps = _steps(url)
    feedbacks = _feedbacks(url)

    def app(
        app_id: int,
        *,
        salary: str | None = None,
        currency: str | None = None,
        period: str | None = None,
        last_step: str | None = None,
        feedback: str | None = None,
        closed_on: date | None = None,
    ) -> tuple[str, dict[str, Any]]:
        return (
            _INSERT_APP,
            {
                'id': app_id,
                'user_id': USER_ID,
                'platform_id': PLATFORM_ID,
                'application_date': date(2025, 7, 1),
                'role': 'Backend Engineer',
                'mode': 'active',
                'company_name': f'Company {app_id % 1000}',
                'salary_offer': Decimal(salary) if salary else None,
                'currency': currency,
                'salary_period': period,
                'last_step_id': steps[last_step] if last_step else None,
                'last_step_date': closed_on if last_step else None,
                'feedback_id': feedbacks[feedback] if feedback else None,
                'feedback_date': closed_on if feedback else None,
                'finalized_at': (
                    datetime(
                        closed_on.year,
                        closed_on.month,
                        closed_on.day,
                        tzinfo=timezone.utc,
                    )
                    if closed_on
                    else None
                ),
                'now': now,
            },
        )

    _apply(
        url,
        [
            app(APP_UNSYNCED),
            app(APP_BDELETED),
            app(
                APP_OFFER_SALARY,
                salary='5000.00',
                currency='EUR',
                period='MONTHLY',
                last_step='Offer',
                feedback='Accepted',
                closed_on=date(2025, 8, 20),
            ),
            app(
                # KODI-010 flag: last step Denied, but a salary was kept -
                # no offer event exists for this application at all.
                APP_DENIED_SALARY,
                salary='3000.00',
                currency='USD',
                period='MONTHLY',
                last_step='Denied',
                feedback='Not good enough',
                closed_on=date(2025, 8, 15),
            ),
            app(APP_ANNUAL, currency='SEK', period='ANNUAL'),
            app(APP_TOUCHED_BY_C),
        ],
    )

    # -- The finalized apps' terminal events (no backfill runs here: the
    #    rows are inserted already in R1's shape).
    _apply(
        url,
        [
            (
                _INSERT_EVENT,
                {
                    'id': S_OFFER,
                    'application_id': APP_OFFER_SALARY,
                    'user_id': USER_ID,
                    'event_type': 'offer',
                    'interview_type': None,
                    'event_date': date(2025, 8, 20),
                    'observation': 'Feedback: Accepted',
                    'salary_amount': Decimal('5000.00'),
                    'salary_currency': 'EUR',
                    'salary_period': 'MONTHLY',
                    'now': now,
                },
            ),
            (
                _INSERT_EVENT,
                {
                    'id': S_DENIED,
                    'application_id': APP_DENIED_SALARY,
                    'user_id': USER_ID,
                    'event_type': 'denied',
                    'interview_type': None,
                    'event_date': date(2025, 8, 15),
                    'observation': 'Feedback: Not good enough',
                    'salary_amount': None,
                    'salary_currency': None,
                    'salary_period': None,
                    'now': now,
                },
            ),
            (
                _INSERT_EVENT,
                {
                    'id': S_TOUCHED,
                    'application_id': APP_TOUCHED_BY_C,
                    'user_id': USER_ID,
                    'event_type': 'interview',
                    'interview_type': 'unknown',
                    'event_date': date(2025, 8, 9),
                    'observation': None,
                    'salary_amount': None,
                    'salary_currency': None,
                    'salary_period': None,
                    'now': now,
                },
            ),
            (
                _INSERT_EVENT,
                {
                    'id': E_ANNUAL_OFFER,
                    'application_id': APP_ANNUAL,
                    'user_id': USER_ID,
                    'event_type': 'offer',
                    'interview_type': None,
                    'event_date': date(2025, 8, 18),
                    'observation': None,
                    'salary_amount': Decimal('90000.00'),
                    'salary_currency': 'SEK',
                    'salary_period': 'ANNUAL',
                    'now': now,
                },
            ),
        ],
    )
    _sql(
        url,
        "UPDATE users SET salary_period = 'ANNUAL' WHERE id = :id",
        id=USER_ID,
    )

    # -- application_steps rows for the synced ones: same id as their event.
    _apply(
        url,
        [
            (
                _INSERT_STEP,
                {
                    'id': S_OFFER,
                    'application_id': APP_OFFER_SALARY,
                    'step_id': steps['Offer'],
                    'step_date': date(2025, 8, 20),
                    'start_time': None,
                    'end_time': None,
                    'timezone': None,
                    'observation': None,
                    'user_id': USER_ID,
                    'now': now,
                },
            ),
            (
                _INSERT_STEP,
                {
                    'id': S_DENIED,
                    'application_id': APP_DENIED_SALARY,
                    'step_id': steps['Denied'],
                    'step_date': date(2025, 8, 15),
                    'start_time': None,
                    'end_time': None,
                    'timezone': None,
                    'observation': None,
                    'user_id': USER_ID,
                    'now': now,
                },
            ),
            (
                _INSERT_STEP,
                {
                    'id': S_TOUCHED,
                    'application_id': APP_TOUCHED_BY_C,
                    'step_id': steps['Phase 2'],
                    'step_date': date(2025, 8, 9),
                    'start_time': None,
                    'end_time': None,
                    'timezone': None,
                    'observation': None,
                    'user_id': USER_ID,
                    'now': now,
                },
            ),
        ],
    )

    # -- APP_BDELETED: the step existed before R1 ran (created_at before the
    #    cutover), its event synced normally, then a Release B/C user
    #    deleted the event. The step row is left orphaned - reconcile must
    #    NOT bring it back.
    _sql(
        url,
        _INSERT_STEP,
        id=S_BDELETED,
        application_id=APP_BDELETED,
        step_id=steps['Phase 2'],
        step_date=date(2025, 6, 1),
        start_time=None,
        end_time=None,
        timezone=None,
        observation='Pre-R1 step',
        user_id=USER_ID,
        now=before_cutover,
    )
    # The trigger synced it (application_steps existed before R1's cutover,
    # but the trigger fires on any INSERT regardless of created_at - so the
    # insert above already produced a timeline_events row with the same id;
    # simulate the B/C deletion of that migrated event).
    _sql(url, 'DELETE FROM timeline_events WHERE id = :id', id=S_BDELETED)

    # -- APP_UNSYNCED: an old-code write during the switch-over
    #    (created_at after the cutover) whose sync the trigger fails - block
    #    every sync with a temporary CHECK, insert, then lift the block. The
    #    write itself must still succeed (the trigger swallows the error).
    _sql(
        url,
        'ALTER TABLE timeline_events ADD CONSTRAINT '
        'ck_test_block_sync CHECK (false) NOT VALID',
    )
    _sql(
        url,
        _INSERT_STEP,
        id=S_UNSYNCED,
        application_id=APP_UNSYNCED,
        step_id=steps['Phase 3'],
        step_date=date(2026, 9, 18),
        start_time=None,
        end_time=None,
        timezone=None,
        observation='Written during the switch-over',
        user_id=USER_ID,
        now=after_cutover,
    )
    assert S_UNSYNCED not in {
        row['id'] for row in _query(url, 'SELECT id FROM timeline_events')
    }
    _sql(url, 'ALTER TABLE timeline_events DROP CONSTRAINT ck_test_block_sync')


# --------------------------------------------------------------------------
# Snapshots (suffix '' pre-upgrade/post-downgrade, '_old' post-upgrade)
# --------------------------------------------------------------------------

_STEP_COLUMNS = (
    'id',
    'application_id',
    'step_id',
    'step_date',
    'start_time',
    'end_time',
    'timezone',
    'observation',
    'user_id',
    'created_at',
    'updated_at',
)
_LEGACY_APP_COLUMNS = (
    'last_step_id',
    'last_step_date',
    'feedback_id',
    'feedback_date',
    'salary_offer',
)

_EVENT_ROWS_SQL = (
    'SELECT id, application_id, user_id, event_type::text AS event_type, '
    'interview_type::text AS interview_type, event_date, start_time, '
    'end_time, timezone, observation, salary_amount, '
    'salary_currency::text AS salary_currency, '
    'salary_period::text AS salary_period, created_at, updated_at '
    'FROM timeline_events ORDER BY id'
)


def _events(url: str) -> dict[int, dict[str, Any]]:
    return {row['id']: row for row in _query(url, _EVENT_ROWS_SQL)}


def _step_rows(
    url: str, table: str = 'application_steps'
) -> dict[int, dict[str, Any]]:
    columns = ', '.join(_STEP_COLUMNS)
    return {
        row['id']: row
        for row in _query(url, f'SELECT {columns} FROM {table} ORDER BY id')
    }


def _app_rows(url: str, suffix: str = '') -> dict[int, dict[str, Any]]:
    legacy = ', '.join(
        f'{name}{suffix} AS {name}' for name in _LEGACY_APP_COLUMNS
    )
    return {
        row['id']: row
        for row in _query(
            url,
            f'SELECT id, {legacy}, currency::text AS currency, '
            'salary_period::text AS salary_period, finalized_at '
            'FROM applications ORDER BY id',
        )
    }


# --------------------------------------------------------------------------
# Source-level checks (AC8, AC9, consistency with R1)
# --------------------------------------------------------------------------


def test_upgrade_source_drops_no_column_or_table() -> None:
    """non-destructive-migrations.md 2: drops live only in downgrade(), and
    this revision - being rename-only - has none at all (AC8, AC9)."""
    module = _load_migration_module()

    upgrade_source = inspect.getsource(module.upgrade)
    downgrade_source = inspect.getsource(module.downgrade)
    assert 'op.drop_column' not in upgrade_source
    assert 'op.drop_table' not in upgrade_source
    assert 'op.drop_column' not in downgrade_source
    assert 'op.drop_table' not in downgrade_source
    # AC8: downgrade() is not empty/pass.
    assert downgrade_source.strip() != 'def downgrade() -> None:\n    pass'
    assert len(downgrade_source.splitlines()) > 5


def test_the_revision_is_a_child_of_r1() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_duplicated_constants_match_revision_afd4074c70c2_and_step_translation() -> (
    None
):
    """A revision must not import another revision, so R2 copies R1's
    constants and SQL - this pins the copies against drift."""
    r2 = _load_migration_module()
    r1 = _load_r1_module()

    assert r2.REVERSE_STEP_MAP == r1.REVERSE_STEP_MAP
    assert r2.REVERSE_FEEDBACK_MAP == r1.REVERSE_FEEDBACK_MAP
    assert r2.FEEDBACK_FALLBACK == r1.FEEDBACK_FALLBACK
    assert r2.STEP_FALLBACK == r1.STEP_FALLBACK
    assert r2.OFFER_DEFAULT_CURRENCY == r1.OFFER_DEFAULT_CURRENCY
    assert r2.OFFER_DEFAULT_PERIOD == r1.OFFER_DEFAULT_PERIOD
    assert r2.CURRENCIES_KNOWN == r1.CURRENCIES_KNOWN
    assert r2._LEGACY_SALARY_LIMIT == r1._LEGACY_SALARY_LIMIT
    assert r2.SALARY_PERIOD_ADDED == r1.SALARY_PERIOD_ADDED
    assert r2.SALARY_PERIOD_LEGACY == r1.SALARY_PERIOD_LEGACY
    assert r2._STEP_TRIGGER == r1._STEP_TRIGGER
    assert r2._APP_TRIGGER == r1._APP_TRIGGER
    assert r2._STEP_FUNCTION == r1._STEP_FUNCTION
    assert r2._APP_FUNCTION == r1._APP_FUNCTION
    assert r2._STEP_FUNCTION_SQL == r1._STEP_FUNCTION_SQL
    assert r2._APP_FUNCTION_SQL == r1._APP_FUNCTION_SQL

    from app.application.use_cases.compat.step_translation import (
        REVERSE_STEP_NAMES,
    )
    from app.core.enums import EventType, InterviewType

    for (event_type, interview_type), name in r2.REVERSE_STEP_MAP.items():
        key = (
            EventType(event_type),
            InterviewType(interview_type) if interview_type else None,
        )
        assert REVERSE_STEP_NAMES[key] == name, key


def test_app_never_reads_or_writes_an_old_object() -> None:
    """non-destructive-migrations.md 7."""
    app_dir = _BACKEND_ROOT / 'app'
    offenders = [
        path.relative_to(_BACKEND_ROOT)
        for path in app_dir.rglob('*.py')
        if '_old' in path.read_text(encoding='utf-8')
    ]
    assert offenders == [], offenders


# --------------------------------------------------------------------------
# Upgrade: schema inventory (AC9, AC10)
# --------------------------------------------------------------------------

_RENAMED_STEP_COLUMNS = {('application_steps', name) for name in _STEP_COLUMNS}
_RENAMED_STEP_COLUMNS_OLD = {
    ('application_steps_old', name) for name in _STEP_COLUMNS
}
_RENAMED_APP_COLUMNS = {('applications', name) for name in _LEGACY_APP_COLUMNS}
_RENAMED_APP_COLUMNS_OLD = {
    ('applications', f'{name}_old') for name in _LEGACY_APP_COLUMNS
}


def test_upgrade_renames_and_drops_nothing(migration_db: str) -> None:
    """AC9, AC10: the full column/table inventory before and after differs
    only by the renamed objects - nothing is missing."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    assert before_columns - after_columns == (
        _RENAMED_STEP_COLUMNS | _RENAMED_APP_COLUMNS
    )
    assert after_columns - before_columns == (
        _RENAMED_STEP_COLUMNS_OLD | _RENAMED_APP_COLUMNS_OLD
    )
    after_tables = _tables(migration_db)
    assert before_tables - after_tables == {'application_steps'}
    assert after_tables - before_tables == {'application_steps_old'}
    # Catalogs keep their names (AC4/R-018): untouched by the diff above.
    assert 'steps_definition' in after_tables
    assert 'feedbacks_definition' in after_tables
    # No index/table shrinks - AC8/rule 6: application_steps_old still has
    # every row's data (checked in the reconcile test below), and no
    # secondary index existed on any renamed column to lose.
    assert _triggers(migration_db) == []


# --------------------------------------------------------------------------
# Upgrade: the reconcile (AC1, R-015, resurrection risk)
# --------------------------------------------------------------------------


def test_reconcile_copies_unsynced_writes_and_never_resurrects_deletions(
    migration_db: str,
) -> None:
    """AC1: an old-code write the trigger failed to sync during the
    switch-over reaches the timeline; a step whose migrated event a
    Release B/C user deleted is never brought back."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)

    _upgrade(migration_db, REVISION)

    events = _events(migration_db)
    steps_old = _step_rows(migration_db, 'application_steps_old')

    # The unsynced old-code write: copied, decision (a) mapping applied.
    assert S_UNSYNCED in events
    unsynced = events[S_UNSYNCED]
    assert unsynced['application_id'] == APP_UNSYNCED
    assert unsynced['event_type'] == 'interview'
    assert unsynced['interview_type'] == 'unknown'  # Phase 3
    assert unsynced['observation'] == 'Written during the switch-over'
    assert unsynced['event_date'] == date(2026, 9, 18)

    # The B-deleted event: NOT resurrected, but the step row survives
    # untouched under _old (rule: a rename destroys no data).
    assert S_BDELETED not in events
    assert S_BDELETED in steps_old
    assert steps_old[S_BDELETED]['observation'] == 'Pre-R1 step'
    assert steps_old[S_BDELETED]['application_id'] == APP_BDELETED


# --------------------------------------------------------------------------
# Upgrade: row remap (AC17) and the KODI-010 flag
# --------------------------------------------------------------------------


def test_annual_rows_are_remapped_to_annually(migration_db: str) -> None:
    """AC17 (R-031): the row remap, on every table that carries the column.
    The PG enum label itself is untouched (Postgres cannot drop one)."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)

    _upgrade(migration_db, REVISION)

    apps = _app_rows(migration_db, suffix='_old')
    assert apps[APP_ANNUAL]['salary_period'] == 'ANNUALLY'
    events = _events(migration_db)
    assert events[E_ANNUAL_OFFER]['salary_period'] == 'ANNUALLY'
    users = _query(
        migration_db,
        'SELECT salary_period::text AS period FROM users WHERE id = :id',
        {'id': USER_ID},
    )
    assert users == [{'period': 'ANNUALLY'}]
    # The label stays available; nothing is dropped from the PG enum.
    assert {'ANNUAL', 'ANNUALLY'} <= set(
        _enum_labels(migration_db, 'salaryperiod')
    )


def test_denied_with_salary_moves_to_salary_offer_old_untouched(
    migration_db: str,
) -> None:
    """The KODI-010 flag: no new home is invented for the value."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)

    _upgrade(migration_db, REVISION)

    apps = _app_rows(migration_db, suffix='_old')
    flagged = apps[APP_DENIED_SALARY]
    assert flagged['salary_offer'] == Decimal('3000.00')
    assert flagged['currency'] == 'USD'


# --------------------------------------------------------------------------
# Round trip (AC7, AC8)
# --------------------------------------------------------------------------


def _release_c_writes(url: str) -> None:
    """What Release C would write on ``APP_TOUCHED_BY_C`` after the R2
    upgrade: a brand-new event, an edit to a migrated one, and a close."""
    edited_at = datetime(2026, 10, 1, 9, 0, tzinfo=timezone.utc)
    _sql(
        url,
        _INSERT_EVENT,
        id=C_NOTE,
        application_id=APP_TOUCHED_BY_C,
        user_id=USER_ID,
        event_type='note',
        interview_type=None,
        event_date=date(2026, 9, 25),
        observation='Recruiter follow-up',
        salary_amount=None,
        salary_currency=None,
        salary_period=None,
        now=edited_at,
    )
    _sql(
        url,
        'UPDATE timeline_events SET observation = :obs, updated_at = :at '
        'WHERE id = :id',
        obs='Edited in C',
        at=edited_at,
        id=S_TOUCHED,
    )
    _sql(
        url,
        _INSERT_EVENT,
        id=C_DENIED,
        application_id=APP_TOUCHED_BY_C,
        user_id=USER_ID,
        event_type='denied',
        interview_type=None,
        event_date=date(2026, 10, 2),
        observation=None,
        salary_amount=None,
        salary_currency=None,
        salary_period=None,
        now=edited_at,
    )
    _sql(
        url,
        'UPDATE applications SET finalized_at = :at WHERE id = :id',
        at=datetime(2026, 10, 2, 0, 0, tzinfo=timezone.utc),
        id=APP_TOUCHED_BY_C,
    )


# Applications no reconcile, no step-less event and no Release C write ever
# touches: the downgrade's rename-back is the *only* thing that can change
# their legacy columns, so they must come back byte for byte.
_NEVER_TOUCHED_APPS = (APP_OFFER_SALARY, APP_DENIED_SALARY)


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    """AC7, AC8: no Release C writes in between - the second upgrade must
    equal the first, exactly, on every row this revision itself owns.

    ``APP_ANNUAL`` is deliberately excluded from the byte-for-byte checks:
    its offer event never had an ``application_steps`` row (seeded that way
    on purpose, R-015's "events without a step row"), so the downgrade
    treats it exactly like a Release C write and folds it into
    ``application_steps`` - proved here too, not just in the C-writes test.
    """
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)

    # -- 1. Upgrade.
    _upgrade(migration_db, REVISION)
    first_events = _events(migration_db)
    first_apps = _app_rows(migration_db, suffix='_old')

    # -- 2. Downgrade: the parent schema and the original data.
    _downgrade(migration_db, PARENT_REVISION)

    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert _triggers(migration_db) == [
        'trg_application_steps_sync',
        'trg_applications_finalize_sync',
    ]
    steps = _steps(migration_db)
    step_rows = _step_rows(migration_db)
    apps = _app_rows(migration_db)
    for app_id in _NEVER_TOUCHED_APPS:
        assert apps[app_id] == first_apps[app_id], app_id

    # ANNUALLY remapped back to ANNUAL.
    assert apps[APP_ANNUAL]['salary_period'] == 'ANNUAL'
    users = _query(
        migration_db,
        'SELECT salary_period::text AS period FROM users WHERE id = :id',
        {'id': USER_ID},
    )
    assert users == [{'period': 'ANNUAL'}]
    # The KODI-010 flag survived the round trip untouched.
    assert apps[APP_DENIED_SALARY]['salary_offer'] == Decimal('3000.00')

    # The step-less offer event folds back into application_steps too.
    assert step_rows[E_ANNUAL_OFFER]['step_id'] == steps['Offer']
    assert apps[APP_ANNUAL]['last_step_id'] == steps['Offer']

    # -- 3. Upgrade again: identical to the first upgrade for every
    #    application no reconcile/step-less event/Release C write touched.
    _upgrade(migration_db, REVISION)
    second_events = _events(migration_db)
    second_apps = _app_rows(migration_db, suffix='_old')
    for event_id, event in first_events.items():
        assert second_events[event_id] == event, event_id
    for app_id in _NEVER_TOUCHED_APPS:
        assert second_apps[app_id] == first_apps[app_id], app_id
    assert _triggers(migration_db) == []


def test_downgrade_brings_release_c_back_with_its_writes(
    migration_db: str,
) -> None:
    """AC7 (R-029): a rollback keeps what users did in Release C - new
    events become steps via the reverse map, an edit reaches its step, the
    application closes with the reverse-mapped feedback and last step."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)
    _upgrade(migration_db, REVISION)
    _release_c_writes(migration_db)

    _downgrade(migration_db, PARENT_REVISION)

    steps = _steps(migration_db)
    feedbacks = _feedbacks(migration_db)
    step_rows = _step_rows(migration_db)
    apps = _app_rows(migration_db)

    assert step_rows[S_BDELETED]['observation'] == 'Pre-R1 step'
    # The reconciled old-code write came back as a step too (it is a step,
    # under application_steps' real name again).
    assert step_rows[S_UNSYNCED]['step_id'] == steps['Phase 3']

    # APP_TOUCHED_BY_C: C's new events -> steps via the reverse map; the
    # edited one keeps its id and definition, carries the edit.
    assert step_rows[C_NOTE]['step_id'] == steps['Phase 2']
    assert step_rows[C_NOTE]['observation'] == 'Recruiter follow-up'
    assert step_rows[C_DENIED]['step_id'] == steps['Denied']
    assert step_rows[S_TOUCHED]['observation'] == 'Edited in C'
    assert step_rows[S_TOUCHED]['step_id'] == steps['Phase 2']
    touched = apps[APP_TOUCHED_BY_C]
    assert touched['last_step_id'] == steps['Denied']
    assert touched['feedback_id'] == feedbacks['Not good enough']
    assert touched['feedback_date'] == date(2026, 10, 2)

    # Applications C never touched keep exactly what the rename restored.
    assert apps[APP_OFFER_SALARY]['salary_offer'] == Decimal('5000.00')
    assert apps[APP_DENIED_SALARY]['salary_offer'] == Decimal('3000.00')

    # And the previous release's data upgrades again.
    _upgrade(migration_db, REVISION)
    events = _events(migration_db)
    assert step_rows[C_NOTE]['id'] in events
    assert step_rows[C_DENIED]['id'] in events
    assert _triggers(migration_db) == []


def test_denied_with_salary_survives_the_round_trip(migration_db: str) -> None:
    """Pinned separately, isolated from the other applications' writes."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_r1(migration_db)

    _upgrade(migration_db, REVISION)
    _downgrade(migration_db, PARENT_REVISION)
    _upgrade(migration_db, REVISION)

    apps = _app_rows(migration_db, suffix='_old')
    assert apps[APP_DENIED_SALARY]['salary_offer'] == Decimal('3000.00')
    assert apps[APP_DENIED_SALARY]['currency'] == 'USD'


# ==========================================================================
# T052 - Release C's own API on the post-R2 schema (AC2, AC3, AC4, AC5)
# ==========================================================================
#
# ``tests/conftest.py``'s fixtures build the schema with
# ``Base.metadata.create_all``, which never exercises a migration - it
# proves the ORM mapping is internally consistent, not that the real,
# migrated production schema satisfies it. These fixtures instead run the
# real Alembic chain to R2's head on their own testcontainers Postgres, the
# same technique ``test_release_b_code_runs_on_r1_and_rolls_back_with_its_
# data`` (R1's own test) uses one revision earlier.


@pytest.fixture(scope='module')
def contract_container() -> Iterator[PostgresContainer]:
    container = PostgresContainer('postgres:16', driver='asyncpg')
    container.start()
    try:
        yield container
    finally:
        container.stop()


@pytest.fixture
def contract_db_url(contract_container: PostgresContainer) -> str:
    url = contract_container.get_connection_url()
    _apply(
        url,
        [
            ('DROP SCHEMA IF EXISTS public CASCADE', {}),
            ('CREATE SCHEMA public', {}),
        ],
    )
    _upgrade(url, REVISION)
    return url


@pytest_asyncio.fixture
async def contract_engine(contract_db_url: str) -> AsyncIterator[AsyncEngine]:
    engine = create_async_engine(contract_db_url, poolclass=NullPool)
    try:
        yield engine
    finally:
        await engine.dispose()


@pytest_asyncio.fixture
async def contract_session(
    contract_engine: AsyncEngine,
) -> AsyncIterator[AsyncSession]:
    from tests.base_db_setup import base_data

    maker = async_sessionmaker(bind=contract_engine, expire_on_commit=False)
    async with maker() as session:
        session.add_all(base_data().values())
        await session.commit()
        yield session


@pytest_asyncio.fixture
async def contract_client(
    contract_engine: AsyncEngine,
) -> AsyncIterator[AsyncClient]:
    from datetime import datetime as dt
    from datetime import timezone as tz

    from app.application.dto.user import UserDTO
    from app.config.db import get_session
    from app.main import app as main_app
    from app.presentation.dependencies import get_current_user
    from tests.base_db_setup import base_data

    maker = async_sessionmaker(bind=contract_engine, expire_on_commit=False)

    async def override_get_session() -> AsyncIterator[AsyncSession]:
        async with maker() as session:
            yield session

    async def override_get_current_user() -> UserDTO:
        user = base_data()['user']
        return UserDTO(
            id=user.id,
            github_id=user.github_id,
            username=user.username,
            email=user.email,
            created_at=dt.now(tz.utc),
        )

    main_app.dependency_overrides[get_session] = override_get_session
    main_app.dependency_overrides[get_current_user] = override_get_current_user

    transport = ASGITransport(app=main_app)
    try:
        async with AsyncClient(
            transport=transport, base_url='http://test/api'
        ) as client:
            yield client
    finally:
        main_app.dependency_overrides.clear()


def test_orm_maps_only_objects_that_exist_post_r2_and_nothing_old(
    contract_db_url: str,
) -> None:
    """T052: every ORM-mapped table/column exists in the post-R2 schema,
    and the ORM maps no ``_old`` object (rule 7, still true after R2 - it
    was already true since Release B, R1's own test pins it at R1)."""
    from app.domain import models

    live_tables = _tables(contract_db_url)
    live_columns = _columns(contract_db_url)

    assert not any(
        name.endswith('_old') for name in models.Base.metadata.tables
    )
    for table_name, table in models.Base.metadata.tables.items():
        assert table_name in live_tables, table_name
        for column in table.columns:
            assert not column.name.endswith('_old'), (table_name, column.name)
            assert (table_name, column.name) in live_columns, (
                table_name,
                column.name,
            )
    # And the renamed objects really are gone from the ORM's own metadata.
    assert 'application_steps' not in models.Base.metadata.tables
    app_columns = {
        c.name for c in models.Base.metadata.tables['applications'].columns
    }
    assert app_columns.isdisjoint(set(_LEGACY_APP_COLUMNS))


async def test_release_c_api_runs_on_the_post_r2_schema(
    contract_client: AsyncClient, contract_session: AsyncSession
) -> None:
    """AC2 (R-016), AC3 (R-017), AC4 (R-018), AC5 (R-019) on the schema this
    revision leaves: the deprecated 0.1.4 routes, the legacy finalize body,
    the new optional-outcome finalize, ``/supports`` and the timeline all
    keep working through the real API."""
    from sqlalchemy import text as sa_text

    from tests.base_db_setup import base_data

    seed = base_data()
    step_id = seed['step_applied'].id
    fb_id = seed['fb_accepted'].id
    platform_id = seed['plat_linkedin'].id
    # The 0.1.4 finalize body needs a *strict* step (legacy_finalize.py
    # refuses a non-strict one, 404) - the real, frozen catalog has one.
    strict_step_id = await contract_session.scalar(
        sa_text("SELECT id FROM steps_definition WHERE name = 'Denied'")
    )

    created = await contract_client.post(
        '/applications',
        json={
            'company': {'name': 'Contract Co', 'url': None},
            'role': 'Backend Engineer',
            'mode': 'active',
            'platform_id': str(platform_id),
            'application_date': '2026-01-10',
        },
    )
    assert created.status_code == 201, created.text
    app_id = created.json()['id']

    # AC4 (R-018): /supports still serves the frozen catalog.
    supports = await contract_client.get('/supports')
    assert supports.status_code == 200
    assert supports.json()['steps']
    assert supports.json()['feedbacks']

    # AC2 (R-016): the deprecated legacy steps routes, with their Deprecation
    # header, still write and read through the timeline.
    step_created = await contract_client.post(
        f'/applications/{app_id}/steps',
        json={'step_id': str(step_id), 'step_date': '2026-01-11'},
    )
    assert step_created.status_code == 201, step_created.text
    assert step_created.headers['deprecation'] == '@1789430400'
    legacy_step_id = step_created.json()['id']

    listed_steps = await contract_client.get(f'/applications/{app_id}/steps')
    assert listed_steps.status_code == 200
    assert listed_steps.headers['deprecation'] == '@1789430400'
    assert [s['id'] for s in listed_steps.json()] == [legacy_step_id]

    edited_step = await contract_client.put(
        f'/applications/{app_id}/steps/{legacy_step_id}',
        json={'step_id': str(step_id), 'step_date': '2026-01-12'},
    )
    assert edited_step.status_code == 200, edited_step.text

    deleted_step = await contract_client.delete(
        f'/applications/{app_id}/steps/{legacy_step_id}'
    )
    assert deleted_step.status_code == 204

    # AC3 (R-017): the 0.1.4 finalize body.
    legacy_finalize = await contract_client.post(
        f'/applications/{app_id}/finalize',
        json={
            'step_id': str(strict_step_id),
            'feedback_id': str(fb_id),
            'finalize_date': '2026-01-13',
        },
    )
    assert legacy_finalize.status_code == 201, legacy_finalize.text
    assert legacy_finalize.headers['deprecation'] == '@1789430400'

    # R-032: reopen, then the bodyless close (no Deprecation header).
    reopened = await contract_client.post(f'/applications/{app_id}/reopen')
    assert reopened.status_code == 200
    assert reopened.json()['finalized'] is False

    closed = await contract_client.post(f'/applications/{app_id}/finalize')
    assert closed.status_code == 200
    assert 'deprecation' not in {k.lower() for k in closed.headers}
    assert closed.json()['finalized'] is True

    # AC5 (R-019): the legacy application fields, derived from the timeline.
    apps = {
        a['id']: a for a in (await contract_client.get('/applications')).json()
    }
    read_back = apps[app_id]
    assert read_back['finalized'] is True
    assert read_back['finalized_at'] is not None
    assert read_back['last_step'] is not None
    assert read_back['feedback'] is None

    # The timeline routes themselves, on a fresh, open application.
    second = await contract_client.post(
        '/applications',
        json={
            'company': {'name': 'Contract Co 2', 'url': None},
            'role': 'Backend Engineer',
            'mode': 'active',
            'platform_id': str(platform_id),
            'application_date': '2026-01-14',
        },
    )
    assert second.status_code == 201
    second_id = second.json()['id']

    added = await contract_client.post(
        f'/applications/{second_id}/timeline',
        json={'event_type': 'note', 'event_date': '2026-01-15'},
    )
    assert added.status_code == 201, added.text
    event_id = added.json()['id']

    fetched = await contract_client.get(f'/applications/{second_id}/timeline')
    assert fetched.status_code == 200
    assert [e['id'] for e in fetched.json()] == [event_id]

    updated = await contract_client.put(
        f'/applications/{second_id}/timeline/{event_id}',
        json={'event_type': 'note', 'event_date': '2026-01-16'},
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()['event_date'] == '2026-01-16'

    removed = await contract_client.delete(
        f'/applications/{second_id}/timeline/{event_id}'
    )
    assert removed.status_code == 204
