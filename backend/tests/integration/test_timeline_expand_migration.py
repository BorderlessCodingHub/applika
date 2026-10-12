"""Round-trip test for the timeline expand revision ``afd4074c70c2`` (R1).

``.claude/rules/migration-tests.md`` 2: the **real Alembic chain** against a
dedicated testcontainers Postgres - upgrade to the revision, downgrade to its
parent ``d3f7b1c9e2a4``, upgrade again - with rows seeded before the upgrade
and the data asserted after every step.

What is proved here, by acceptance criterion of KODI-010:

* 1, 2, 3, 12 - the schema: one ``event_type`` per event, the two CHECKs and
  the one-initial-screening partial unique index refuse bad rows;
* 4 - every step is an event with its id, date, times, timezone and
  observation; decision (a) types, earliest Initial Screen only;
* 5 - every finalized application is closed (``finalized_at``), its feedback
  name is on the terminal event and its salary on the offer event (decision
  (b)), including one finalized with no step row at all;
* 6 - writes shaped like the **old use cases' own SQL** (create, update,
  delete step, finalize, admin-created definition) reach ``timeline_events``
  through the transitional triggers, and a trigger failure never fails the
  old write. Release B (KODI-011) removed those use cases, so the helpers now
  issue the statements they issued;
* 7, 10 - downgrade restores the originals and brings Release B events back
  as steps; the second upgrade equals the first;
* 8, 9, 11 - downgrade works, upgrade drops nothing; since Release B the ORM
  maps exactly R1's new objects and nothing ``_old``;
* KODI-011 criterion 26 - the **Release B code itself** runs on this schema,
  and what it writes comes back as steps on ``alembic downgrade``;
* 13 - the 20 currencies and ``ANNUALLY`` exist, ``ANNUAL`` still works.

The plumbing is the one of ``test_migration_cv_period.py``. Every row here is
invented.
"""

import asyncio
import importlib.util
import inspect
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, time, timezone
from decimal import Decimal
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest
import sqlalchemy as sa
from alembic import command
from alembic.config import Config
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from testcontainers.postgres import PostgresContainer

from app.config.settings import envs

REVISION = 'afd4074c70c2'
PARENT_REVISION = 'd3f7b1c9e2a4'
# KODI-014: "Fold into Release A" chains R1 -> R3 -> R2, so R3 ships in the
# same release as R1. Used only by the Release B round-trip test below,
# which needs the true Release A shape (R1 + R3) before running Release B's
# own use cases - they always write ``denied_reason``.
R3_REVISION = 'c8b3e9f4a1d6'

_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_ALEMBIC_INI = _BACKEND_ROOT / 'alembic.ini'
_MIGRATION_PATH = (
    _BACKEND_ROOT
    / 'migrations'
    / 'versions'
    / f'{REVISION}_timeline_events_expand.py'
)

USER_ID = 7200000000000000001
PLATFORM_ID = 7200000000000000002
ADMIN_DEF_ID = 7200000000000000003

# Applications.
APP_OPEN = 7200000000000000101  # open, 3 Initial Screens, admin step
APP_OFFER = 7200000000000000102  # finalized, full salary
APP_OFFER_NO_CURRENCY = 7200000000000000103  # salary, no currency/period
APP_OFFER_NO_PERIOD = 7200000000000000104  # salary + EUR, no period
APP_DENIED = 7200000000000000105  # finalized denied, Ghost
APP_TWO_OFFERS = 7200000000000000106  # two Offer steps, ANNUAL
APP_NO_STEPS = 7200000000000000107  # finalized, no step row at all
APP_OPEN_OFFER = 7200000000000000108  # open, Offer step, no salary
APP_FRESH = 7200000000000000109  # open, no steps
APP_TO_DENY = 7200000000000000110  # open, one step

# Steps.
S_IS_LATE = 7200000000000001001
S_P2 = 7200000000000001002
S_IS_LATER = 7200000000000001003
S_ADMIN = 7200000000000001004
S_P3 = 7200000000000001005
S_IS_EARLY = 7200000000000001006
S_OFFER_IS = 7200000000000001011
S_OFFER = 7200000000000001012
S_NO_CUR = 7200000000000001021
S_NO_PERIOD = 7200000000000001031
S_DENIED_P2 = 7200000000000001041
S_DENIED = 7200000000000001042
S_FIRST_OFFER = 7200000000000001051
S_LAST_OFFER = 7200000000000001052
S_OPEN_OFFER = 7200000000000001061
S_TO_DENY_P2 = 7200000000000001071

# Release B events (written straight into timeline_events).
B_NOTE = 7200000000000002001
B_DENIED = 7200000000000002002
B_OFFER = 7200000000000002003
B_SCREEN = 7200000000000002004
B_TECH = 7200000000000002005

LONG_TIMEZONE = 'America/Argentina/ComodRivadavia' + '/x' * 30  # > 50
SAO_PAULO = 'America/Sao_Paulo'

ADDED_CURRENCIES = {
    'CNY',
    'SEK',
    'NOK',
    'DKK',
    'PLN',
    'SGD',
    'HKD',
    'NZD',
    'MXN',
    'ZAR',
    'AED',
}
KNOWN_CURRENCIES = {
    'USD',
    'BRL',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
    'CHF',
    'INR',
}

_NEW_COLUMNS = {
    ('timeline_events', name)
    for name in (
        'id',
        'application_id',
        'user_id',
        'event_type',
        'interview_type',
        'event_date',
        'start_time',
        'end_time',
        'timezone',
        'observation',
        'salary_amount',
        'salary_currency',
        'salary_period',
        'created_at',
        'updated_at',
    )
} | {
    ('applications', 'finalized_at'),
    ('steps_definition', 'event_type'),
    ('steps_definition', 'interview_type'),
}


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
    _apply(
        url,
        [
            ('DROP SCHEMA IF EXISTS public CASCADE', {}),
            ('CREATE SCHEMA public', {}),
        ],
    )
    # Enum types live in the schema, so they go with it.
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


def _load_migration_module() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        'timeline_expand_migration_under_test', _MIGRATION_PATH
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


def _types(url: str) -> set[str]:
    return {
        row['typname']
        for row in _query(
            url,
            "SELECT typname FROM pg_type WHERE typtype = 'e'",
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


def _timezone_width(url: str) -> int:
    rows = _query(
        url,
        'SELECT character_maximum_length AS width '
        'FROM information_schema.columns '
        "WHERE table_name = 'application_steps' AND column_name = 'timezone'",
    )
    return rows[0]['width']


# --------------------------------------------------------------------------
# Seeding at the parent revision
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


_INSERT_APP = (
    'INSERT INTO applications '
    '(id, user_id, platform_id, application_date, role, mode, company_name, '
    'salary_offer, currency, salary_period, last_step_id, last_step_date, '
    'feedback_id, feedback_date, created_at) '
    'VALUES (:id, :user_id, :platform_id, :application_date, :role, '
    ':mode, :company_name, :salary_offer, CAST(:currency AS currency), '
    'CAST(:salary_period AS salaryperiod), :last_step_id, :last_step_date, '
    ':feedback_id, :feedback_date, :now)'
)

_INSERT_STEP = (
    'INSERT INTO application_steps '
    '(id, application_id, step_id, step_date, start_time, end_time, '
    'timezone, observation, user_id, created_at) '
    'VALUES (:id, :application_id, :step_id, :step_date, :start_time, '
    ':end_time, :timezone, :observation, :user_id, :now)'
)

# id -> (application, step name, date, start, end, timezone, observation)
_SEED_STEPS: dict[
    int,
    tuple[int, str, date, time | None, time | None, str | None, str | None],
] = {
    S_IS_LATE: (
        APP_OPEN,
        'Initial Screen',
        date(2025, 8, 2),
        time(10, 0),
        None,
        None,
        None,
    ),
    S_P2: (
        APP_OPEN,
        'Phase 2',
        date(2025, 8, 5),
        time(14, 0),
        time(15, 0),
        SAO_PAULO,
        'Tech round',
    ),
    S_IS_LATER: (
        APP_OPEN,
        'Initial Screen',
        date(2025, 8, 6),
        None,
        None,
        None,
        None,
    ),
    S_ADMIN: (
        APP_OPEN,
        'Coding Challenge',
        date(2025, 8, 7),
        None,
        None,
        None,
        'Take-home',
    ),
    S_P3: (
        APP_OPEN,
        'Phase 3',
        date(2025, 8, 8),
        None,
        None,
        None,
        None,
    ),
    # Inserted last, dated first: the ordering is by date, not by id.
    S_IS_EARLY: (
        APP_OPEN,
        'Initial Screen',
        date(2025, 8, 1),
        time(9, 0),
        None,
        None,
        'Recruiter call',
    ),
    S_OFFER_IS: (
        APP_OFFER,
        'Initial Screen',
        date(2025, 8, 3),
        None,
        None,
        None,
        None,
    ),
    S_OFFER: (
        APP_OFFER,
        'Offer',
        date(2025, 8, 20),
        None,
        None,
        None,
        'Signed',
    ),
    S_NO_CUR: (
        APP_OFFER_NO_CURRENCY,
        'Offer',
        date(2025, 8, 21),
        None,
        None,
        None,
        None,
    ),
    S_NO_PERIOD: (
        APP_OFFER_NO_PERIOD,
        'Offer',
        date(2025, 8, 21),
        None,
        None,
        None,
        None,
    ),
    S_DENIED_P2: (
        APP_DENIED,
        'Phase 2',
        date(2025, 8, 10),
        None,
        None,
        None,
        None,
    ),
    S_DENIED: (
        APP_DENIED,
        'Denied',
        date(2025, 8, 15),
        None,
        None,
        None,
        'They never called back',
    ),
    S_FIRST_OFFER: (
        APP_TWO_OFFERS,
        'Offer',
        date(2025, 8, 10),
        None,
        None,
        None,
        None,
    ),
    S_LAST_OFFER: (
        APP_TWO_OFFERS,
        'Offer',
        date(2025, 8, 25),
        None,
        None,
        None,
        None,
    ),
    S_OPEN_OFFER: (
        APP_OPEN_OFFER,
        'Offer',
        date(2025, 8, 12),
        None,
        None,
        None,
        None,
    ),
    S_TO_DENY_P2: (
        APP_TO_DENY,
        'Phase 2',
        date(2025, 8, 4),
        None,
        None,
        None,
        None,
    ),
}


@dataclass(frozen=True)
class _Catalog:
    steps: dict[str, int]
    feedbacks: dict[str, int]
    now: datetime


def _app(
    app_id: int,
    catalog: _Catalog,
    *,
    salary: str | None = None,
    currency: str | None = None,
    period: str | None = None,
    last_step: str | None = None,
    feedback: str | None = None,
    closed_on: date | None = None,
) -> tuple[str, dict[str, Any]]:
    steps = catalog.steps
    feedbacks = catalog.feedbacks
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
            'now': catalog.now,
        },
    )


def _seed_at_parent(url: str) -> None:
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
                    'github_id': 90210,
                    'username': 'timeline_user',
                    'email': 'timeline@example.com',
                    'now': now,
                },
            ),
            (
                'INSERT INTO platforms (id, name, created_at) '
                "VALUES (:id, 'Timeline Board', :now)",
                {'id': PLATFORM_ID, 'now': now},
            ),
            # An admin-created definition: not in STEP_MAPPING.
            (
                'INSERT INTO steps_definition '
                '(id, name, color, strict, created_at) '
                "VALUES (:id, 'Coding Challenge', '#123456', false, :now)",
                {'id': ADMIN_DEF_ID, 'now': now},
            ),
        ],
    )
    steps = _steps(url)
    feedbacks = _feedbacks(url)
    catalog = _Catalog(steps=steps, feedbacks=feedbacks, now=now)
    closed = date(2025, 8, 20)
    _apply(
        url,
        [
            _app(APP_OPEN, catalog),
            _app(
                APP_OFFER,
                catalog,
                salary='5000.00',
                currency='USD',
                period='MONTHLY',
                last_step='Offer',
                feedback='Accepted',
                closed_on=closed,
            ),
            _app(
                APP_OFFER_NO_CURRENCY,
                catalog,
                salary='7000.00',
                last_step='Offer',
                feedback='Accepted',
                closed_on=date(2025, 8, 21),
            ),
            _app(
                APP_OFFER_NO_PERIOD,
                catalog,
                salary='100.00',
                currency='EUR',
                last_step='Offer',
                feedback='Accepted',
                closed_on=date(2025, 8, 21),
            ),
            _app(
                APP_DENIED,
                catalog,
                last_step='Denied',
                feedback='Ghost',
                closed_on=date(2025, 8, 15),
            ),
            _app(
                APP_TWO_OFFERS,
                catalog,
                salary='9000.00',
                currency='BRL',
                period='ANNUAL',
                last_step='Offer',
                feedback='Accepted',
                closed_on=date(2025, 8, 25),
            ),
            _app(
                APP_NO_STEPS,
                catalog,
                salary='3000.00',
                currency='GBP',
                period='HOURLY',
                last_step='Offer',
                feedback='Accepted',
                closed_on=date(2025, 8, 30),
            ),
            _app(APP_OPEN_OFFER, catalog),
            _app(APP_FRESH, catalog, currency='EUR', period='MONTHLY'),
            _app(APP_TO_DENY, catalog),
        ],
    )
    _apply(
        url,
        [
            (
                _INSERT_STEP,
                {
                    'id': step_id,
                    'application_id': app_id,
                    'step_id': steps[name],
                    'step_date': day,
                    'start_time': start,
                    'end_time': end,
                    'timezone': tz,
                    'observation': observation,
                    'user_id': USER_ID,
                    'now': now,
                },
            )
            for step_id, (
                app_id,
                name,
                day,
                start,
                end,
                tz,
                observation,
            ) in _SEED_STEPS.items()
        ],
    )


# --------------------------------------------------------------------------
# Snapshots
# --------------------------------------------------------------------------

_STEP_ROWS_SQL = (
    'SELECT id, application_id, step_id, step_date, start_time, end_time, '
    'timezone, observation, user_id, created_at, updated_at '
    'FROM application_steps ORDER BY id'
)
_APP_ROWS_SQL = (
    'SELECT id, last_step_id, last_step_date, feedback_id, feedback_date, '
    'salary_offer, currency::text AS currency, '
    'salary_period::text AS salary_period '
    'FROM applications ORDER BY id'
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


def _event(url: str, event_id: int) -> dict[str, Any]:
    events = _events(url)
    assert event_id in events, (event_id, sorted(events))
    return events[event_id]


def _app_rows(url: str) -> dict[int, dict[str, Any]]:
    return {row['id']: row for row in _query(url, _APP_ROWS_SQL)}


def _step_rows(url: str) -> dict[int, dict[str, Any]]:
    return {row['id']: row for row in _query(url, _STEP_ROWS_SQL)}


def _finalized_at(url: str) -> dict[int, datetime | None]:
    return {
        row['id']: row['finalized_at']
        for row in _query(
            url, 'SELECT id, finalized_at FROM applications ORDER BY id'
        )
    }


def _mapping(url: str) -> dict[str, tuple[str | None, str | None]]:
    return {
        row['name']: (row['event_type'], row['interview_type'])
        for row in _query(
            url,
            'SELECT name, event_type::text AS event_type, '
            'interview_type::text AS interview_type FROM steps_definition',
        )
    }


def _midnight_utc(day: date) -> datetime:
    return datetime(day.year, day.month, day.day, tzinfo=timezone.utc)


def _salary(event: dict[str, Any]) -> tuple[Decimal | None, Any, Any]:
    return (
        event['salary_amount'],
        event['salary_currency'],
        event['salary_period'],
    )


def _migrated(url: str) -> dict[int, dict[str, Any]]:
    _upgrade(url, PARENT_REVISION)
    _seed_at_parent(url)
    _upgrade(url, REVISION)
    return _events(url)


# --------------------------------------------------------------------------
# Source-level rules (criteria 8, 9, 11)
# --------------------------------------------------------------------------


def test_upgrade_source_drops_nothing() -> None:
    """non-destructive-migrations.md 2: drops live only in downgrade()."""
    module = _load_migration_module()
    upgrade_source = inspect.getsource(module.upgrade)

    assert 'op.drop_' not in upgrade_source
    assert 'DROP ' not in upgrade_source.upper()
    downgrade_source = inspect.getsource(module.downgrade)
    assert 'op.drop_table' in downgrade_source
    assert 'op.drop_column' in downgrade_source


def test_the_revision_is_a_child_of_the_cv_period_revision() -> None:
    module = _load_migration_module()

    assert module.revision == REVISION
    assert module.down_revision == PARENT_REVISION


def test_the_mapping_constants_carry_the_owner_decisions() -> None:
    """Decision (a) and the reverse maps, as constants in the revision."""
    module = _load_migration_module()

    assert module.STEP_MAPPING == {
        'Initial Screen': ('interview', 'initial_screening'),
        'Phase 2': ('interview', 'unknown'),
        'Phase 3': ('interview', 'unknown'),
        'Phase 4': ('interview', 'unknown'),
        'Offer': ('offer', None),
        'Denied': ('denied', None),
    }
    assert module.STEP_FALLBACK == ('interview', 'unknown')
    # Every (event_type, interview_type) pair resolves to a step name.
    pairs = {('interview', kind) for kind in module.INTERVIEW_TYPES} | {
        (kind, None) for kind in module.EVENT_TYPES if kind != 'interview'
    }
    assert set(module.REVERSE_STEP_MAP) == pairs
    assert set(module.CURRENCIES_ADDED) == ADDED_CURRENCIES


def test_release_b_orm_maps_the_new_objects_and_nothing_old() -> None:
    """Release A read nothing new (prod-release-runbook.md 4); Release B
    (KODI-011) maps R1's objects and stops mapping the legacy columns, and
    still never touches an ``_old`` object (non-destructive-migrations 7)."""
    from app.domain import models
    from app.domain.models import ApplicationModel, StepDefinitionModel

    tables = set(models.Base.metadata.tables)
    assert 'timeline_events' in tables
    assert 'application_steps' not in tables
    app_columns = ApplicationModel.__table__.columns
    assert 'finalized_at' in app_columns
    for legacy in (
        'last_step_id',
        'last_step_date',
        'feedback_id',
        'feedback_date',
        'salary_offer',
    ):
        assert legacy not in app_columns, legacy
    step_columns = StepDefinitionModel.__table__.columns
    assert 'event_type' in step_columns
    assert 'interview_type' in step_columns

    app_dir = _BACKEND_ROOT / 'app'
    offenders = [
        path.relative_to(_BACKEND_ROOT)
        for path in app_dir.rglob('*.py')
        if '_old' in path.read_text(encoding='utf-8')
    ]
    assert offenders == [], offenders


# --------------------------------------------------------------------------
# Schema (criteria 1, 2, 3, 9, 12, 13)
# --------------------------------------------------------------------------


def test_upgrade_only_adds(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    before_columns = _columns(migration_db)
    before_tables = _tables(migration_db)

    _upgrade(migration_db, REVISION)

    after_columns = _columns(migration_db)
    assert before_columns - after_columns == set()
    assert after_columns - before_columns == _NEW_COLUMNS
    assert _tables(migration_db) - before_tables == {'timeline_events'}
    assert before_tables <= _tables(migration_db)
    assert {'event_type', 'interview_type'} <= _types(migration_db)
    # Widened for Release B timezones; never shrunk again.
    assert _timezone_width(migration_db) == 100


def test_event_and_interview_types(migration_db: str) -> None:
    _upgrade(migration_db, REVISION)

    assert _enum_labels(migration_db, 'event_type') == [
        'note',
        'interview',
        'feedback',
        'offer',
        'denied',
    ]
    assert _enum_labels(migration_db, 'interview_type') == [
        'unknown',
        'initial_screening',
        'technical',
        'cultural',
        'hiring_manager',
        'take_home',
        'final',
    ]


def test_currencies_and_salary_periods(migration_db: str) -> None:
    """Criterion 13: 20 currencies, ANNUALLY added, ANNUAL still valid."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    _upgrade(migration_db, REVISION)

    currencies = _enum_labels(migration_db, 'currency')
    assert set(currencies) == KNOWN_CURRENCIES | ADDED_CURRENCIES
    assert len(currencies) == 20
    assert _enum_labels(migration_db, 'salaryperiod') == [
        'HOURLY',
        'MONTHLY',
        'ANNUAL',
        'ANNUALLY',
    ]
    # An installed CLI still sends annual: the stored label keeps working,
    # and so do the new ones.
    _sql(
        migration_db,
        "UPDATE applications SET salary_period = 'ANNUAL', currency = 'SEK' "
        'WHERE id = :id',
        id=APP_FRESH,
    )
    _sql(
        migration_db,
        "UPDATE applications SET salary_period = 'ANNUALLY' WHERE id = :id",
        id=APP_TO_DENY,
    )
    from app.core.enums import SalaryPeriod

    assert SalaryPeriod('annual') is SalaryPeriod.ANNUALLY


_VALID_EVENT = {
    'event_type': 'note',
    'interview_type': None,
    'salary_amount': None,
    'salary_currency': None,
    'salary_period': None,
}


def _insert_event(url: str, event_id: int, app_id: int, **fields: Any) -> None:
    values = {**_VALID_EVENT, **fields}
    _sql(
        url,
        'INSERT INTO timeline_events (id, application_id, user_id, '
        'event_type, interview_type, event_date, salary_amount, '
        'salary_currency, salary_period, created_at) VALUES '
        '(:id, :app, :user_id, CAST(:event_type AS event_type), '
        'CAST(:interview_type AS interview_type), :day, :salary_amount, '
        'CAST(:salary_currency AS currency), '
        'CAST(:salary_period AS salaryperiod), now())',
        id=event_id,
        app=app_id,
        user_id=USER_ID,
        day=date(2025, 8, 29),
        **values,
    )


@pytest.mark.parametrize(
    ('fields', 'constraint'),
    [
        # Criterion 2: an interview type only on an interview.
        (
            {'event_type': 'note', 'interview_type': 'technical'},
            'ck_timeline_events_interview_type',
        ),
        (
            {
                'event_type': 'offer',
                'interview_type': 'final',
                'salary_amount': 1,
                'salary_currency': 'USD',
                'salary_period': 'MONTHLY',
            },
            'ck_timeline_events_interview_type',
        ),
        (
            {'event_type': 'interview', 'interview_type': None},
            'ck_timeline_events_interview_type',
        ),
        # Criterion 3: all three salary fields iff offer.
        ({'event_type': 'offer'}, 'ck_timeline_events_offer_salary'),
        (
            {
                'event_type': 'offer',
                'salary_amount': 10,
                'salary_currency': 'USD',
            },
            'ck_timeline_events_offer_salary',
        ),
        (
            {'event_type': 'denied', 'salary_amount': 10},
            'ck_timeline_events_offer_salary',
        ),
        (
            {'event_type': 'feedback', 'salary_currency': 'EUR'},
            'ck_timeline_events_offer_salary',
        ),
        (
            {
                'event_type': 'interview',
                'interview_type': 'technical',
                'salary_period': 'HOURLY',
            },
            'ck_timeline_events_offer_salary',
        ),
        # Criterion 12: APP_OFFER already has its initial screening.
        (
            {'event_type': 'interview', 'interview_type': 'initial_screening'},
            'uq_timeline_events_one_initial_screening',
        ),
    ],
)
def test_the_database_refuses_invalid_events(
    migration_db: str, fields: dict[str, Any], constraint: str
) -> None:
    _migrated(migration_db)

    with pytest.raises(IntegrityError) as refused:
        _insert_event(migration_db, B_NOTE, APP_OFFER, **fields)

    assert constraint in str(refused.value)
    assert B_NOTE not in _events(migration_db)


def test_the_database_accepts_valid_events(migration_db: str) -> None:
    """The mirror image: every type, and one screening per application."""
    _migrated(migration_db)

    _insert_event(migration_db, B_NOTE, APP_FRESH, event_type='note')
    _insert_event(
        migration_db,
        B_SCREEN,
        APP_FRESH,
        event_type='interview',
        interview_type='initial_screening',
    )
    _insert_event(
        migration_db,
        B_TECH,
        APP_FRESH,
        event_type='interview',
        interview_type='technical',
    )
    _insert_event(
        migration_db,
        B_OFFER,
        APP_FRESH,
        event_type='offer',
        salary_amount=Decimal('9999999999.99'),
        salary_currency='AED',
        salary_period='ANNUALLY',
    )
    _insert_event(migration_db, B_DENIED, APP_FRESH, event_type='denied')

    events = _events(migration_db)
    assert {B_NOTE, B_SCREEN, B_TECH, B_OFFER, B_DENIED} <= set(events)


# --------------------------------------------------------------------------
# Backfill (criteria 4 and 5)
# --------------------------------------------------------------------------


def test_every_definition_is_mapped(migration_db: str) -> None:
    _migrated(migration_db)

    assert _mapping(migration_db) == {
        'Initial Screen': ('interview', 'initial_screening'),
        'Phase 2': ('interview', 'unknown'),
        'Phase 3': ('interview', 'unknown'),
        'Phase 4': ('interview', 'unknown'),
        'Offer': ('offer', None),
        'Denied': ('denied', None),
        'Coding Challenge': ('interview', 'unknown'),
    }


def test_every_step_is_an_event_with_its_id_and_fields(
    migration_db: str,
) -> None:
    """Criterion 4: ids kept, date/times/timezone/observation carried."""
    events = _migrated(migration_db)
    steps = _step_rows(migration_db)

    assert set(steps) == set(_SEED_STEPS)
    assert set(steps) <= set(events)
    for step_id, step in steps.items():
        event = events[step_id]
        assert event['application_id'] == step['application_id']
        assert event['user_id'] == step['user_id']
        assert event['event_date'] == step['step_date']
        assert event['start_time'] == step['start_time']
        assert event['end_time'] == step['end_time']
        assert event['timezone'] == step['timezone']
        assert event['created_at'] == step['created_at']
        # The terminal events carry the feedback name on a last line.
        assert (event['observation'] or '').startswith(
            step['observation'] or ''
        ), (step_id, event['observation'])

    phase_2 = events[S_P2]
    assert phase_2['start_time'] == time(14, 0)
    assert phase_2['end_time'] == time(15, 0)
    assert phase_2['timezone'] == SAO_PAULO
    assert phase_2['observation'] == 'Tech round'
    # Only the synthetic terminal event is not a step.
    assert set(events) - set(steps) == {APP_NO_STEPS}


def test_step_types_follow_decision_a(migration_db: str) -> None:
    events = _migrated(migration_db)

    def kind(event_id: int) -> tuple[str, str | None]:
        return (
            events[event_id]['event_type'],
            events[event_id]['interview_type'],
        )

    # The earliest Initial Screen by date keeps the type, the rest are
    # unknown - even though it was inserted last.
    assert kind(S_IS_EARLY) == ('interview', 'initial_screening')
    assert kind(S_IS_LATE) == ('interview', 'unknown')
    assert kind(S_IS_LATER) == ('interview', 'unknown')
    assert kind(S_P2) == ('interview', 'unknown')
    assert kind(S_P3) == ('interview', 'unknown')
    assert kind(S_ADMIN) == ('interview', 'unknown')
    assert kind(S_OFFER_IS) == ('interview', 'initial_screening')
    assert kind(S_OFFER) == ('offer', None)
    assert kind(S_DENIED) == ('denied', None)
    screenings = [
        event['application_id']
        for event in events.values()
        if event['interview_type'] == 'initial_screening'
    ]
    assert len(screenings) == len(set(screenings))


def test_finalized_applications_are_closed_with_their_outcome(
    migration_db: str,
) -> None:
    """Criterion 5: finalized_at, feedback name on the terminal event."""
    events = _migrated(migration_db)
    finalized = _finalized_at(migration_db)

    assert finalized[APP_OFFER] == _midnight_utc(date(2025, 8, 20))
    assert finalized[APP_OFFER_NO_CURRENCY] == _midnight_utc(date(2025, 8, 21))
    assert finalized[APP_DENIED] == _midnight_utc(date(2025, 8, 15))
    assert finalized[APP_TWO_OFFERS] == _midnight_utc(date(2025, 8, 25))
    assert finalized[APP_NO_STEPS] == _midnight_utc(date(2025, 8, 30))
    for open_app in (APP_OPEN, APP_OPEN_OFFER, APP_FRESH, APP_TO_DENY):
        assert finalized[open_app] is None, open_app

    assert events[S_OFFER]['observation'] == 'Signed\n\nFeedback: Accepted'
    assert events[S_DENIED]['observation'] == (
        'They never called back\n\nFeedback: Ghost'
    )
    assert events[S_NO_CUR]['observation'] == 'Feedback: Accepted'
    # The later of two Offer steps is the terminal one.
    assert events[S_LAST_OFFER]['observation'] == 'Feedback: Accepted'
    assert events[S_FIRST_OFFER]['observation'] is None
    # Non-terminal events are untouched.
    assert events[S_OFFER_IS]['observation'] is None
    assert events[S_DENIED_P2]['observation'] is None


def test_a_finalized_application_without_steps_gets_a_terminal_event(
    migration_db: str,
) -> None:
    events = _migrated(migration_db)

    synthetic = events[APP_NO_STEPS]
    assert synthetic['application_id'] == APP_NO_STEPS
    assert synthetic['event_type'] == 'offer'
    assert synthetic['event_date'] == date(2025, 8, 30)
    assert synthetic['observation'] == 'Feedback: Accepted'
    assert _salary(synthetic) == (Decimal('3000.00'), 'GBP', 'HOURLY')


def test_offer_salaries_follow_decision_b(migration_db: str) -> None:
    events = _migrated(migration_db)

    assert _salary(events[S_OFFER]) == (Decimal('5000.00'), 'USD', 'MONTHLY')
    # Salary without currency and period: 0, USD, monthly.
    assert _salary(events[S_NO_CUR]) == (Decimal('0.00'), 'USD', 'MONTHLY')
    # Salary with a currency but no period: 0, its currency, monthly.
    assert _salary(events[S_NO_PERIOD]) == (Decimal('0.00'), 'EUR', 'MONTHLY')
    # Two offers: the latest carries the salary, ANNUAL is carried as is.
    assert _salary(events[S_LAST_OFFER]) == (
        Decimal('9000.00'),
        'BRL',
        'ANNUAL',
    )
    assert _salary(events[S_FIRST_OFFER]) == (Decimal('0.00'), 'BRL', 'ANNUAL')
    # An Offer step on an application with no salary at all.
    assert _salary(events[S_OPEN_OFFER]) == (Decimal('0.00'), 'USD', 'MONTHLY')
    for event in events.values():
        if event['event_type'] != 'offer':
            assert _salary(event) == (None, None, None), event['id']

    # The originals stay where they were.
    apps = _app_rows(migration_db)
    assert apps[APP_OFFER_NO_CURRENCY]['salary_offer'] == Decimal('7000.00')
    assert apps[APP_OFFER_NO_CURRENCY]['currency'] is None
    assert apps[APP_OFFER_NO_PERIOD]['salary_offer'] == Decimal('100.00')


# --------------------------------------------------------------------------
# Old-code writes through the triggers (criterion 6)
# --------------------------------------------------------------------------


# The statements the old (Release A) use cases issued. Their Python code is
# gone since Release B, so the helpers issue the same SQL: an ORM insert of
# every column, an update of the step's columns plus ``updated_at``, a delete
# by id, and finalize's step insert followed by the ``applications`` update.


def _create_step(
    url: str, app_id: int, step_id: int, day: date, **fields: Any
) -> int:
    from app.lib.types import generate_snowflake_id

    new_id = generate_snowflake_id()
    _sql(
        url,
        'INSERT INTO application_steps (id, application_id, step_id, '
        'step_date, start_time, end_time, timezone, observation, user_id, '
        'created_at, updated_at) VALUES (:id, :app, :step, :day, :start, '
        ':end, :tz, :obs, :user_id, now(), NULL)',
        id=new_id,
        app=app_id,
        step=step_id,
        day=day,
        start=fields.get('start_time'),
        end=fields.get('end_time'),
        tz=fields.get('timezone'),
        obs=fields.get('observation'),
        user_id=USER_ID,
    )
    return new_id


def _update_step(
    url: str, app_id: int, id: int, step_id: int, day: date, **fields: Any
) -> None:
    _sql(
        url,
        'UPDATE application_steps SET application_id = :app, '
        'step_id = :step, step_date = :day, start_time = :start, '
        'end_time = :end, timezone = :tz, observation = :obs, '
        'updated_at = now() WHERE id = :id',
        id=id,
        app=app_id,
        step=step_id,
        day=day,
        start=fields.get('start_time'),
        end=fields.get('end_time'),
        tz=fields.get('timezone'),
        obs=fields.get('observation'),
    )


def _delete_step(url: str, app_id: int, id: int) -> None:
    _sql(
        url,
        'DELETE FROM application_steps WHERE id = :id AND application_id = :app',
        id=id,
        app=app_id,
    )


def _finalize(
    url: str,
    app_id: int,
    step_id: int,
    feedback_id: int,
    day: date,
    salary: float | None = None,
    observation: str | None = None,
) -> None:
    _create_step(url, app_id, step_id, day, observation=observation)
    # The ORM update listed only the changed columns: salary_offer only
    # when one was sent.
    salary_set = ', salary_offer = :salary' if salary is not None else ''
    _sql(
        url,
        'UPDATE applications SET last_step_id = :step, '
        'last_step_date = :day, feedback_id = :feedback, '
        f'feedback_date = :day{salary_set}, updated_at = now() '
        'WHERE id = :id',
        id=app_id,
        step=step_id,
        day=day,
        feedback=feedback_id,
        **({'salary': salary} if salary is not None else {}),
    )


def _admin_creates_definition(url: str, name: str) -> int:
    from app.lib.types import generate_snowflake_id

    new_id = generate_snowflake_id()
    _sql(
        url,
        'INSERT INTO steps_definition (id, name, color, strict, created_at) '
        "VALUES (:id, :name, '#654321', false, now())",
        id=new_id,
        name=name,
    )
    return new_id


def test_old_code_step_writes_reach_the_timeline(migration_db: str) -> None:
    """Criterion 6 with the statements the old use cases issued."""
    _migrated(migration_db)
    steps = _steps(migration_db)

    # Insert: a plain step, same id, decision (a) type.
    phase_2 = _create_step(
        migration_db,
        APP_OPEN,
        steps['Phase 2'],
        date(2025, 8, 9),
        start_time=time(11, 0),
        timezone=SAO_PAULO,
        observation='Pairing',
    )
    event = _event(migration_db, phase_2)
    assert (event['event_type'], event['interview_type']) == (
        'interview',
        'unknown',
    )
    assert event['application_id'] == APP_OPEN
    assert event['start_time'] == time(11, 0)
    assert event['timezone'] == SAO_PAULO
    assert event['observation'] == 'Pairing'

    # Insert: a second Initial Screen is written as unknown and the old
    # write does not fail.
    second_screen = _create_step(
        migration_db, APP_OPEN, steps['Initial Screen'], date(2025, 8, 10)
    )
    assert _event(migration_db, second_screen)['interview_type'] == 'unknown'

    # Insert: the first Initial Screen of an application keeps the type.
    first_screen = _create_step(
        migration_db, APP_FRESH, steps['Initial Screen'], date(2025, 8, 10)
    )
    assert (
        _event(migration_db, first_screen)['interview_type']
        == 'initial_screening'
    )

    # Update: dates, times, timezone and observation follow.
    _update_step(
        migration_db,
        APP_FRESH,
        first_screen,
        steps['Initial Screen'],
        date(2025, 8, 11),
        start_time=time(16, 30),
        end_time=time(17, 0),
        timezone=LONG_TIMEZONE[:50],
        observation='Moved',
    )
    moved = _event(migration_db, first_screen)
    assert moved['event_date'] == date(2025, 8, 11)
    assert moved['start_time'] == time(16, 30)
    assert moved['end_time'] == time(17, 0)
    assert moved['timezone'] == LONG_TIMEZONE[:50]
    assert moved['observation'] == 'Moved'
    assert moved['interview_type'] == 'initial_screening'
    assert moved['updated_at'] is not None

    # Update that changes step_id into a second Initial Screen: unknown.
    _update_step(
        migration_db,
        APP_OPEN,
        phase_2,
        steps['Initial Screen'],
        date(2025, 8, 9),
    )
    assert _event(migration_db, phase_2)['interview_type'] == 'unknown'

    # Admin-created definition after the upgrade: NULL mapping, the step
    # still lands as interview/unknown.
    take_home = _admin_creates_definition(migration_db, 'Take-home')
    assert _mapping(migration_db)['Take-home'] == (None, None)
    admin_step = _create_step(
        migration_db, APP_FRESH, take_home, date(2025, 8, 12)
    )
    admin_event = _event(migration_db, admin_step)
    assert (admin_event['event_type'], admin_event['interview_type']) == (
        'interview',
        'unknown',
    )

    # Delete: the event goes with the step.
    _delete_step(migration_db, APP_FRESH, admin_step)
    assert admin_step not in _events(migration_db)
    assert admin_step not in _step_rows(migration_db)

    # Same count on both sides, plus the synthetic terminal event.
    assert set(_events(migration_db)) - set(_step_rows(migration_db)) == {
        APP_NO_STEPS
    }


def test_old_code_finalize_reaches_the_timeline(migration_db: str) -> None:
    """Old finalize: step insert, then the applications update."""
    _migrated(migration_db)
    steps = _steps(migration_db)
    feedbacks = _feedbacks(migration_db)

    # Offer with salary on an application that has EUR / monthly.
    _finalize(
        migration_db,
        APP_FRESH,
        steps['Offer'],
        feedbacks['Accepted'],
        date(2025, 8, 31),
        salary=1234.5,
        observation='Great team',
    )
    offer = [
        event
        for event in _events(migration_db).values()
        if event['application_id'] == APP_FRESH
    ]
    assert len(offer) == 1
    assert offer[0]['event_type'] == 'offer'
    assert offer[0]['observation'] == 'Great team\n\nFeedback: Accepted'
    assert _salary(offer[0]) == (Decimal('1234.50'), 'EUR', 'MONTHLY')
    assert _finalized_at(migration_db)[APP_FRESH] == _midnight_utc(
        date(2025, 8, 31)
    )

    # The old PUT /applications changes the currency afterwards: the offer
    # event follows.
    _sql(
        migration_db,
        "UPDATE applications SET currency = 'GBP' WHERE id = :id",
        id=APP_FRESH,
    )
    assert _salary(_event(migration_db, offer[0]['id'])) == (
        Decimal('1234.50'),
        'GBP',
        'MONTHLY',
    )

    # Denied without salary.
    _finalize(
        migration_db,
        APP_TO_DENY,
        steps['Denied'],
        feedbacks['Position filled'],
        date(2025, 8, 30),
    )
    denied = [
        event
        for event in _events(migration_db).values()
        if event['application_id'] == APP_TO_DENY
        and event['event_type'] == 'denied'
    ]
    assert len(denied) == 1
    assert denied[0]['observation'] == 'Feedback: Position filled'
    assert _salary(denied[0]) == (None, None, None)
    assert _finalized_at(migration_db)[APP_TO_DENY] == _midnight_utc(
        date(2025, 8, 30)
    )
    # The earlier step is not the terminal one.
    assert _event(migration_db, S_TO_DENY_P2)['observation'] is None


def test_a_trigger_failure_never_fails_the_old_write(
    migration_db: str,
) -> None:
    """Both triggers swallow their own errors: the old write commits."""
    _migrated(migration_db)
    steps = _steps(migration_db)
    feedbacks = _feedbacks(migration_db)
    # Every new or updated timeline row now fails.
    _sql(
        migration_db,
        'ALTER TABLE timeline_events ADD CONSTRAINT ck_test_refuse_all '
        'CHECK (false) NOT VALID',
    )

    step = _create_step(
        migration_db, APP_TO_DENY, steps['Phase 3'], date(2025, 8, 20)
    )
    assert step in _step_rows(migration_db)
    assert step not in _events(migration_db)

    _finalize(
        migration_db,
        APP_TO_DENY,
        steps['Denied'],
        feedbacks['Ghost'],
        date(2025, 8, 21),
    )
    app = _app_rows(migration_db)[APP_TO_DENY]
    assert app['feedback_id'] == feedbacks['Ghost']
    # finalized_at is set on the row itself, before the failing part.
    assert _finalized_at(migration_db)[APP_TO_DENY] == _midnight_utc(
        date(2025, 8, 21)
    )


# --------------------------------------------------------------------------
# Round trip (criteria 7, 8, 10)
# --------------------------------------------------------------------------


def test_round_trip_upgrade_downgrade_upgrade(migration_db: str) -> None:
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_columns = _columns(migration_db)
    parent_tables = _tables(migration_db)
    parent_steps = _step_rows(migration_db)
    parent_apps = _app_rows(migration_db)

    # -- 1. Upgrade.
    _upgrade(migration_db, REVISION)
    first_events = _events(migration_db)
    first_finalized = _finalized_at(migration_db)
    first_mapping = _mapping(migration_db)
    first_columns = _columns(migration_db)
    assert len(first_events) == len(parent_steps) + 1

    # -- 2. Downgrade: the parent schema and the original data.
    _downgrade(migration_db, PARENT_REVISION)

    assert _query(migration_db, 'SELECT version_num FROM alembic_version') == [
        {'version_num': PARENT_REVISION}
    ]
    assert _columns(migration_db) == parent_columns
    assert _tables(migration_db) == parent_tables
    assert _step_rows(migration_db) == parent_steps
    assert _app_rows(migration_db) == parent_apps
    types = _types(migration_db)
    assert 'event_type' not in types
    assert 'interview_type' not in types
    trigger_count = _query(
        migration_db,
        "SELECT count(*) AS n FROM pg_trigger WHERE tgname LIKE 'trg_%sync'",
    )
    assert trigger_count == [{'n': 0}]
    # Left on purpose: enum values cannot be removed, columns never shrink.
    assert ADDED_CURRENCIES <= set(_enum_labels(migration_db, 'currency'))
    assert 'ANNUALLY' in _enum_labels(migration_db, 'salaryperiod')
    assert _timezone_width(migration_db) == 100

    # -- 3. Upgrade again: identical to the first.
    _upgrade(migration_db, REVISION)

    assert _columns(migration_db) == first_columns
    assert _events(migration_db) == first_events
    assert _finalized_at(migration_db) == first_finalized
    assert _mapping(migration_db) == first_mapping


def _release_b_writes(url: str) -> None:
    """What Release B code would write, straight into the new objects."""
    edited_at = datetime(2025, 9, 1, 12, 0, tzinfo=timezone.utc)
    _insert_event(url, B_NOTE, APP_OPEN, event_type='note')
    _sql(
        url,
        'UPDATE timeline_events SET observation = :obs, timezone = :tz, '
        'event_date = :day WHERE id = :id',
        obs='Recruiter pinged',
        tz=LONG_TIMEZONE,
        day=date(2025, 8, 20),
        id=B_NOTE,
    )
    # APP_OPEN closed in B with a denied event.
    _insert_event(url, B_DENIED, APP_OPEN, event_type='denied')
    _sql(
        url,
        'UPDATE timeline_events SET event_date = :day WHERE id = :id',
        day=date(2025, 8, 22),
        id=B_DENIED,
    )
    _sql(
        url,
        'UPDATE applications SET finalized_at = :at WHERE id = :id',
        at=datetime(2025, 8, 22, 15, 30, tzinfo=timezone.utc),
        id=APP_OPEN,
    )
    # APP_OFFER (closed before the switch) reopened in B.
    _sql(
        url,
        'UPDATE applications SET finalized_at = NULL WHERE id = :id',
        id=APP_OFFER,
    )
    # APP_OPEN_OFFER closed in B with an offer event in EUR, annually.
    _insert_event(
        url,
        B_OFFER,
        APP_OPEN_OFFER,
        event_type='offer',
        salary_amount=Decimal('5555.00'),
        salary_currency='EUR',
        salary_period='ANNUALLY',
    )
    _sql(
        url,
        'UPDATE timeline_events SET event_date = :day WHERE id = :id',
        day=date(2025, 8, 28),
        id=B_OFFER,
    )
    _sql(
        url,
        'UPDATE applications SET finalized_at = :at WHERE id = :id',
        at=datetime(2025, 8, 28, 0, 0, tzinfo=timezone.utc),
        id=APP_OPEN_OFFER,
    )
    # APP_FRESH, still open, gets two interviews.
    _insert_event(
        url,
        B_SCREEN,
        APP_FRESH,
        event_type='interview',
        interview_type='initial_screening',
    )
    _insert_event(
        url,
        B_TECH,
        APP_FRESH,
        event_type='interview',
        interview_type='technical',
    )
    # An event migrated from a step, edited in B.
    _sql(
        url,
        'UPDATE timeline_events SET observation = :obs, updated_at = :at '
        'WHERE id = :id',
        obs='Tech round (edited)',
        at=edited_at,
        id=S_P2,
    )
    # An event migrated from a step, deleted in B.
    _sql(url, 'DELETE FROM timeline_events WHERE id = :id', id=S_P3)
    # The user profile moves to the new period.
    _sql(
        url,
        "UPDATE users SET salary_period = 'ANNUALLY' WHERE id = :id",
        id=USER_ID,
    )


def test_downgrade_brings_release_b_back_to_the_previous_release(
    migration_db: str,
) -> None:
    """Criterion 7: a rollback keeps what users did in Release B."""
    _upgrade(migration_db, PARENT_REVISION)
    _seed_at_parent(migration_db)
    parent_steps = _step_rows(migration_db)
    parent_apps = _app_rows(migration_db)
    _upgrade(migration_db, REVISION)
    _release_b_writes(migration_db)

    _downgrade(migration_db, PARENT_REVISION)

    steps_by_name = _steps(migration_db)
    feedbacks = _feedbacks(migration_db)
    steps = _step_rows(migration_db)
    apps = _app_rows(migration_db)

    # Events that were never steps are steps now, via the reverse map.
    assert steps[B_NOTE]['step_id'] == steps_by_name['Phase 2']
    assert steps[B_NOTE]['observation'] == 'Recruiter pinged'
    assert steps[B_NOTE]['timezone'] == LONG_TIMEZONE
    assert steps[B_NOTE]['step_date'] == date(2025, 8, 20)
    assert steps[B_DENIED]['step_id'] == steps_by_name['Denied']
    assert steps[B_OFFER]['step_id'] == steps_by_name['Offer']
    assert steps[B_SCREEN]['step_id'] == steps_by_name['Initial Screen']
    assert steps[B_TECH]['step_id'] == steps_by_name['Phase 2']
    for event_id in (B_NOTE, B_DENIED, B_OFFER, B_SCREEN, B_TECH):
        assert steps[event_id]['user_id'] == USER_ID

    # The edit made in B reaches its step; the step keeps its definition.
    assert steps[S_P2]['observation'] == 'Tech round (edited)'
    assert steps[S_P2]['step_id'] == parent_steps[S_P2]['step_id']
    # A delete in B never deletes on rollback.
    assert steps[S_P3] == parent_steps[S_P3]
    # The synthetic terminal event was never a step.
    assert APP_NO_STEPS not in steps
    # Every other original step is exactly as it was.
    for step_id, original in parent_steps.items():
        if step_id != S_P2:
            assert steps[step_id] == original, step_id

    # Closed in B, no feedback: reverse-mapped feedback and last step.
    assert apps[APP_OPEN]['feedback_id'] == feedbacks['Not good enough']
    assert apps[APP_OPEN]['feedback_date'] == date(2025, 8, 22)
    assert apps[APP_OPEN]['last_step_id'] == steps_by_name['Denied']
    assert apps[APP_OPEN]['last_step_date'] == date(2025, 8, 22)

    assert apps[APP_OPEN_OFFER]['feedback_id'] == feedbacks['Accepted']
    assert apps[APP_OPEN_OFFER]['feedback_date'] == date(2025, 8, 28)
    assert apps[APP_OPEN_OFFER]['last_step_id'] == steps_by_name['Offer']
    # The B offer's salary, in the old columns, ANNUALLY back to ANNUAL.
    assert apps[APP_OPEN_OFFER]['salary_offer'] == Decimal('5555.00')
    assert apps[APP_OPEN_OFFER]['currency'] == 'EUR'
    assert apps[APP_OPEN_OFFER]['salary_period'] == 'ANNUAL'

    # Reopened in B: open again for the previous release.
    assert apps[APP_OFFER]['feedback_id'] is None
    assert apps[APP_OFFER]['feedback_date'] is None
    assert apps[APP_OFFER]['last_step_id'] == steps_by_name['Offer']
    assert apps[APP_OFFER]['salary_offer'] == Decimal('5000.00')

    # Still open, new events: last step follows the latest event.
    assert apps[APP_FRESH]['feedback_id'] is None
    assert apps[APP_FRESH]['last_step_id'] is not None

    # Applications B never touched are exactly as they were.
    for app_id in (
        APP_OFFER_NO_CURRENCY,
        APP_OFFER_NO_PERIOD,
        APP_DENIED,
        APP_TWO_OFFERS,
        APP_NO_STEPS,
        APP_TO_DENY,
    ):
        assert apps[app_id] == parent_apps[app_id], app_id

    users = _query(
        migration_db,
        'SELECT salary_period::text AS period FROM users WHERE id = :id',
        {'id': USER_ID},
    )
    assert users == [{'period': 'ANNUAL'}]
    assert 'timeline_events' not in _tables(migration_db)

    # And the previous release's data upgrades again.
    _upgrade(migration_db, REVISION)
    events = _events(migration_db)
    assert set(_step_rows(migration_db)) <= set(events)
    assert _finalized_at(migration_db)[APP_OPEN] == _midnight_utc(
        date(2025, 8, 22)
    )
    assert _finalized_at(migration_db)[APP_OFFER] is None


# --------------------------------------------------------------------------
# Release B code on this schema, then rolled back (KODI-011 criterion 26)
# --------------------------------------------------------------------------


async def _session_run(url: str, work: Callable[..., Any]) -> Any:
    engine = create_async_engine(url, poolclass=NullPool)
    try:
        maker = async_sessionmaker(
            engine, autoflush=False, expire_on_commit=False
        )
        async with maker() as session:
            return await work(session)
    finally:
        await engine.dispose()


def _app_code(url: str, work: Callable[..., Any]) -> Any:
    """Run ``work(session)`` with the application's own repositories."""
    return _run(_session_run(url, work))


def _release_b_code_writes(url: str) -> dict[str, Any]:
    """What users do in Release B, through the Release B use cases."""
    from app.application.dto.application import LegacyFinalizeApplicationDTO
    from app.application.dto.legacy_step import LegacyStepWriteDTO
    from app.application.dto.timeline_event import CreateTimelineEventDTO
    from app.application.use_cases.applications.finalize_application import (
        FinalizeApplicationUseCase,
    )
    from app.application.use_cases.applications.list_applications import (
        ListApplicationsUseCase,
    )
    from app.application.use_cases.applications.read_model import (
        ApplicationReadModel,
    )
    from app.application.use_cases.applications.reopen_application import (
        ReopenApplicationUseCase,
    )
    from app.application.use_cases.compat.legacy_finalize import (
        LegacyFinalizeApplicationUseCase,
    )
    from app.application.use_cases.compat.legacy_steps import (
        CreateLegacyStepUseCase,
        UpdateLegacyStepUseCase,
    )
    from app.application.use_cases.timeline_events.create import (
        CreateTimelineEventUseCase,
    )
    from app.core.enums import EventType, InterviewType
    from app.domain.repositories.application_repository import (
        ApplicationRepository,
    )
    from app.domain.repositories.feedback_definition_repository import (
        FeedbackDefinitionRepository,
    )
    from app.domain.repositories.step_definition_repository import (
        StepDefinitionRepository,
    )
    from app.domain.repositories.timeline_event_repository import (
        TimelineEventRepository,
    )

    steps = _steps(url)
    feedbacks = _feedbacks(url)

    async def work(session: Any) -> dict[str, Any]:
        apps = ApplicationRepository(session)
        step_repo = StepDefinitionRepository(session)
        timeline = TimelineEventRepository(session)
        read_model = ApplicationReadModel(timeline, step_repo)
        create = CreateTimelineEventUseCase(apps, timeline)

        def event(app_id: int, day: date, **fields: Any) -> Any:
            return CreateTimelineEventDTO(
                user_id=USER_ID,
                application_id=app_id,
                event_date=day,
                **fields,
            )

        # APP_FRESH: a note and a technical interview on the web, then an
        # installed CLI finalizes it with the 0.1.4 body. The long timezone
        # sits on the interview, not the note - KODI-016 (R-038/R-039)
        # refuses a schedule on a non-interview event, even at this
        # pre-R4 schema state (the rule lives in the use case, not the DB).
        note = await create.execute(
            event(
                APP_FRESH,
                date(2025, 8, 20),
                event_type=EventType.NOTE,
                observation='Recruiter pinged',
            )
        )
        tech = await create.execute(
            event(
                APP_FRESH,
                date(2025, 8, 21),
                event_type=EventType.INTERVIEW,
                interview_type=InterviewType.TECHNICAL,
                timezone=LONG_TIMEZONE,
            )
        )
        await LegacyFinalizeApplicationUseCase(
            apps,
            step_repo,
            FeedbackDefinitionRepository(session),
            timeline,
            read_model,
        ).execute(
            APP_FRESH,
            USER_ID,
            LegacyFinalizeApplicationDTO(
                step_id=steps['Offer'],
                feedback_id=feedbacks['Accepted'],
                finalize_date=date(2025, 8, 31),
                salary_offer=1234.5,
            ),
        )

        # APP_TO_DENY: a 0.1.4 client edits the migrated step, the web
        # adds a denied event and closes it without a body.
        await UpdateLegacyStepUseCase(apps, step_repo, timeline).execute(
            S_TO_DENY_P2,
            APP_TO_DENY,
            USER_ID,
            LegacyStepWriteDTO(
                step_id=steps['Phase 2'],
                step_date=date(2025, 8, 15),
                observation='Edited in B',
            ),
        )
        denied = await create.execute(
            event(APP_TO_DENY, date(2025, 8, 22), event_type=EventType.DENIED)
        )
        await FinalizeApplicationUseCase(apps, read_model).execute(
            APP_TO_DENY, USER_ID
        )

        # APP_OPEN: a 0.1.4 client adds a Phase 3 step.
        phase_3 = await CreateLegacyStepUseCase(
            apps, step_repo, timeline
        ).execute(
            APP_OPEN,
            USER_ID,
            LegacyStepWriteDTO(
                step_id=steps['Phase 3'], step_date=date(2025, 8, 25)
            ),
        )

        # APP_OFFER, closed before the switch, is reopened.
        await ReopenApplicationUseCase(apps, read_model).execute(
            APP_OFFER, USER_ID
        )

        listed = await ListApplicationsUseCase(apps, read_model).execute(
            USER_ID
        )
        return {
            'note': note.id,
            'tech': tech.id,
            'denied': denied.id,
            'phase_3': phase_3.id,
            'listed': {dto.id: dto for dto in listed},
        }

    return _app_code(url, work)


def test_release_b_code_runs_on_r1_and_rolls_back_with_its_data(
    migration_db: str,
) -> None:
    """KODI-011 criterion 26: Release B's own use cases run on the schema
    Release A leaves (the ORM mapping matches it), and ``alembic downgrade``
    to R1's own parent brings everything they wrote back to the previous
    release.

    KODI-014 folded R3 (``c8b3e9f4a1d6``, ``denied_reason``) into Release A,
    chaining R1 -> R3 -> R2, so the schema Release B's code actually runs
    against always has R3 too (the owner's ``alembic upgrade head`` applies
    the whole Release A migration set in one go) - every event write since
    then carries ``denied_reason``. The single ``alembic downgrade`` to
    ``PARENT_REVISION`` below now crosses both R3's and R1's ``downgrade()``
    in one command, composing them the same way
    ``test_timeline_contract_migration.py``'s single-command test proves for
    R2 + R3 + R1.
    """
    _migrated(migration_db)
    _upgrade(migration_db, R3_REVISION)
    steps = _steps(migration_db)
    feedbacks = _feedbacks(migration_db)

    # KODI-032 (S3, well after this migration in the chain) mapped
    # ``ApplicationModel.is_draft`` unconditionally, so any ``select
    # (ApplicationModel)`` the Release B use cases below issue now names
    # that column. Real production always has it by the time this code
    # runs (prod-release-runbook.md's "expand first": migration
    # ``3b78c3cd2a71`` ships and is applied before code that reads its
    # columns does) - this ``ALTER TABLE`` mirrors that column existing
    # ahead of the R3 snapshot this test otherwise pins, without pulling in
    # the rest of that later revision's schema.
    _sql(
        migration_db,
        'ALTER TABLE applications ADD COLUMN is_draft boolean '
        'NOT NULL DEFAULT false',
    )
    # KODI-047 mapped ``ApplicationModel.job_id`` (revision
    # ``b28d5134631f``) the same way, so the column is added here for the
    # same reason. No FK: ``jobs`` does not exist at R3.
    _sql(migration_db, 'ALTER TABLE applications ADD COLUMN job_id bigint')

    written = _release_b_code_writes(migration_db)

    # Release B reads R1's data: the legacy fields come from the timeline.
    listed = written['listed']
    assert listed[APP_FRESH].finalized is True
    assert listed[APP_FRESH].salary_offer == 1234.5
    assert listed[APP_FRESH].last_step is not None
    assert listed[APP_FRESH].last_step.id == steps['Offer']
    assert listed[APP_OFFER].finalized is False
    assert listed[APP_TO_DENY].last_step is not None
    assert listed[APP_TO_DENY].last_step.id == steps['Denied']
    # B wrote timeline_events only; the steps table knows nothing yet.
    step_rows = _step_rows(migration_db)
    for key in ('note', 'tech', 'denied', 'phase_3'):
        assert written[key] not in step_rows, key
    offer = [
        e
        for e in _events(migration_db).values()
        if e['application_id'] == APP_FRESH and e['event_type'] == 'offer'
    ]
    assert len(offer) == 1
    assert offer[0]['observation'] == 'Feedback: Accepted'
    assert _salary(offer[0]) == (Decimal('1234.50'), 'EUR', 'MONTHLY')

    _downgrade(migration_db, PARENT_REVISION)

    steps_back = _step_rows(migration_db)
    apps = _app_rows(migration_db)
    assert steps_back[written['note']]['step_id'] == steps['Phase 2']
    assert steps_back[written['note']]['observation'] == 'Recruiter pinged'
    assert steps_back[written['tech']]['step_id'] == steps['Phase 2']
    assert steps_back[written['tech']]['timezone'] == LONG_TIMEZONE
    assert steps_back[written['denied']]['step_id'] == steps['Denied']
    assert steps_back[written['phase_3']]['step_id'] == steps['Phase 2']
    assert steps_back[offer[0]['id']]['step_id'] == steps['Offer']
    assert steps_back[S_TO_DENY_P2]['observation'] == 'Edited in B'
    assert steps_back[S_TO_DENY_P2]['step_date'] == date(2025, 8, 15)

    assert apps[APP_FRESH]['feedback_id'] == feedbacks['Accepted']
    assert apps[APP_FRESH]['feedback_date'] == date(2025, 8, 31)
    assert apps[APP_FRESH]['last_step_id'] == steps['Offer']
    assert apps[APP_FRESH]['salary_offer'] == Decimal('1234.50')
    assert apps[APP_TO_DENY]['feedback_id'] == feedbacks['Not good enough']
    assert apps[APP_TO_DENY]['last_step_id'] == steps['Denied']
    assert apps[APP_OFFER]['feedback_id'] is None
    assert apps[APP_OFFER]['feedback_date'] is None
