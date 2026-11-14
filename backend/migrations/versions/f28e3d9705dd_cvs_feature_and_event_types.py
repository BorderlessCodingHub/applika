"""cvs feature seeded with its CV owners; note and feedback become interviews (Release A)

Revision ID: f28e3d9705dd
Revises: ed39a0fad1e5
Create Date: 2026-10-17 10:00:00.000000

Plan ``docs/plan/0015-cvs-beta-and-three-event-types.md`` ``## Data`` (R1),
ADR-0020 (three timeline event types), ADR-0021 (gating a shipped feature).

upgrade(), in this order:

1. Guard, before any write: a ``steps_definition`` row mapped to ``note`` or
   ``feedback`` raises. Never true: ``afd4074c70c2`` ``STEP_MAPPING`` and
   ``STEP_FALLBACK`` map every definition to interview, offer or denied.
2. Seed ``features``: ``cvs`` / "CV builder" / the PRD description, stage
   ``beta``, ``released_at`` NULL, ``ON CONFLICT (key) DO NOTHING`` (shape of
   ``641001baff09`` ``_seed_features``).
3. Enrol (ADR-0021): one ``feature_beta_users`` row per distinct ``user_id``
   of ``base_cvs`` and ``tailored_cvs`` (draft copies included), ``added_by``
   NULL, ``ON CONFLICT (feature_id, user_id) DO NOTHING``. Only when step 2
   created the ``cvs`` row: a re-upgrade after a rollback finds the row and
   writes no list row, so an admin's removal made in between stays (the
   later top-up revision enrols the owners who came after the seed).
4. ``timeline_events.event_type_old`` (type ``event_type``, NULL) holds a
   copy of every row's ``event_type``.
5. Every ``note`` and ``feedback`` becomes ``interview`` / ``unknown``. Id,
   application, user, date, observation, ``created_at`` and ``updated_at``
   are untouched (raw SQL, no ``updated_at = now()``). The four CHECKs hold:
   a note or feedback carries no schedule, salary or reason.
6. ``ck_timeline_events_event_type``: ``event_type IN ('interview', 'offer',
   'denied')``, created only when missing.
7. Switch-over trigger ``trg_timeline_events_legacy_event_type`` (function
   ``timeline_events_legacy_event_type()``), ``BEFORE INSERT OR UPDATE``:
   the previous release still writes ``note`` / ``feedback``; the row is
   stored as ``interview`` / ``unknown`` with the original type in
   ``event_type_old``. The later top-up revision drops it and carries a
   byte-for-byte copy of ``_LEGACY_FUNCTION_SQL`` and
   ``_CREATE_LEGACY_TRIGGER_SQL`` for its downgrade (a revision never
   imports another).

The PG type ``event_type`` keeps its five labels (ADR-0020 non-goal); the
three-type storage is the CHECK plus the trigger.

downgrade():

* drops the trigger, the function and the CHECK;
* turns back every converted row that was not edited since (still
  ``interview`` / ``unknown`` with no schedule) into the ``note`` or
  ``feedback`` ``event_type_old`` holds, ``interview_type`` NULL. A row
  edited in between keeps its edit (ADR-0020);
* keeps ``event_type_old`` (the copy), the ``cvs`` row and its list rows:
  the previous image types ``features.key`` as ``str`` and shows the row
  harmlessly.

## Rules

non-destructive-migrations.md rule 1: ``downgrade()`` is real. Rule 2:
``upgrade()`` drops no column and no table. Rule 5: ``downgrade()`` restores
the original types from the copy in ``event_type_old``. Rule 7: no app code
reads any of it; the ORM maps neither ``event_type_old`` nor the ``cvs``
key - the code ships in Release B. Rule 8: the enum keeps every label, rows
are remapped in both directions, none is deleted.
prod-release-runbook.md rule 4: this is Release A, migration only; the
previous release's code keeps working on this schema (the trigger converts
what it writes). ADR-0005 (non-destructive migrations), ADR-0020, ADR-0021.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = 'f28e3d9705dd'
down_revision: Union[str, Sequence[str], None] = 'ed39a0fad1e5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

FEATURE_KEY = 'cvs'
FEATURE_NAME = 'CV builder'
FEATURE_DESCRIPTION = (
    'Master CVs, CV copies on applications and the new application with '
    'CV flow.'
)

KEPT_TYPES: tuple[str, ...] = ('interview', 'offer', 'denied')
LEGACY_TYPES: tuple[str, ...] = ('note', 'feedback')
CONVERTED_TYPE = 'interview'
CONVERTED_INTERVIEW_TYPE = 'unknown'

CHECK_NAME = 'ck_timeline_events_event_type'
OLD_COLUMN = 'event_type_old'
LEGACY_FUNCTION = 'timeline_events_legacy_event_type'
LEGACY_TRIGGER = 'trg_timeline_events_legacy_event_type'


def _in_list(values: tuple[str, ...]) -> str:
    return ', '.join(f"'{value}'" for value in values)


_LEGACY_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {LEGACY_FUNCTION}() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
    IF NEW.event_type IN ({_in_list(LEGACY_TYPES)}) THEN
        NEW.{OLD_COLUMN} := NEW.event_type;
        NEW.event_type := '{CONVERTED_TYPE}';
        NEW.interview_type := '{CONVERTED_INTERVIEW_TYPE}';
    END IF;
    RETURN NEW;
END;
$fn$
"""

_CREATE_LEGACY_TRIGGER_SQL = (
    f'CREATE TRIGGER {LEGACY_TRIGGER} '
    'BEFORE INSERT OR UPDATE ON timeline_events '
    f'FOR EACH ROW EXECUTE FUNCTION {LEGACY_FUNCTION}()'
)

_DROP_LEGACY_TRIGGER_SQL = (
    f'DROP TRIGGER IF EXISTS {LEGACY_TRIGGER} ON timeline_events'
)
_DROP_LEGACY_FUNCTION_SQL = f'DROP FUNCTION IF EXISTS {LEGACY_FUNCTION}()'


def _guard_step_definitions(bind: sa.engine.Connection) -> None:
    legacy = bind.execute(
        sa.text(
            'SELECT count(*) FROM steps_definition '
            f'WHERE event_type IN ({_in_list(LEGACY_TYPES)})'
        )
    ).scalar_one()
    if legacy > 0:
        raise RuntimeError(
            f'{legacy} steps_definition row(s) map to note or feedback; '
            'every definition must map to interview, offer or denied '
            'before the timeline types are reduced'
        )


def _seed_feature(bind: sa.engine.Connection) -> int | None:
    """Insert the ``cvs`` row; return its id, or None when it existed."""
    return bind.execute(
        sa.text(
            'INSERT INTO features '
            '(id, key, name, description, stage, released_at, created_at) '
            "VALUES (:id, :key, :name, :description, 'beta', NULL, :now) "
            'ON CONFLICT (key) DO NOTHING '
            'RETURNING id'
        ),
        {
            'id': generate_snowflake_id(),
            'key': FEATURE_KEY,
            'name': FEATURE_NAME,
            'description': FEATURE_DESCRIPTION,
            'now': datetime.now(timezone.utc),
        },
    ).scalar_one_or_none()


def _enrol_cv_owners(bind: sa.engine.Connection, feature_id: int) -> None:
    owners = bind.execute(
        sa.text(
            'SELECT user_id FROM base_cvs '
            'UNION SELECT user_id FROM tailored_cvs '
            'ORDER BY user_id'
        )
    ).scalars()
    now = datetime.now(timezone.utc)
    for user_id in list(owners):
        bind.execute(
            sa.text(
                'INSERT INTO feature_beta_users '
                '(id, feature_id, user_id, added_by, created_at) '
                'VALUES (:id, :feature_id, :user_id, NULL, :now) '
                'ON CONFLICT (feature_id, user_id) DO NOTHING'
            ),
            {
                'id': generate_snowflake_id(),
                'feature_id': feature_id,
                'user_id': user_id,
                'now': now,
            },
        )


def _check_exists(bind: sa.engine.Connection) -> bool:
    return (
        bind.execute(
            sa.text(
                'SELECT 1 FROM pg_constraint WHERE conname = :name '
                "AND conrelid = 'timeline_events'::regclass"
            ),
            {'name': CHECK_NAME},
        ).first()
        is not None
    )


def _convert_events(bind: sa.engine.Connection) -> None:
    op.execute(
        f'ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS {OLD_COLUMN} '
        'event_type NULL'
    )
    op.execute(f'UPDATE timeline_events SET {OLD_COLUMN} = event_type')
    op.execute(
        'UPDATE timeline_events SET '
        f"event_type = '{CONVERTED_TYPE}', "
        f"interview_type = '{CONVERTED_INTERVIEW_TYPE}' "
        f'WHERE event_type IN ({_in_list(LEGACY_TYPES)})'
    )
    if not _check_exists(bind):
        op.create_check_constraint(
            CHECK_NAME,
            'timeline_events',
            f'event_type IN ({_in_list(KEPT_TYPES)})',
        )


def upgrade() -> None:
    bind = op.get_bind()

    _guard_step_definitions(bind)

    feature_id = _seed_feature(bind)
    if feature_id is not None:
        _enrol_cv_owners(bind, feature_id)

    _convert_events(bind)

    op.execute(_LEGACY_FUNCTION_SQL)
    op.execute(_DROP_LEGACY_TRIGGER_SQL)
    op.execute(_CREATE_LEGACY_TRIGGER_SQL)


def downgrade() -> None:
    # The trigger goes first: with it, the restore below would be converted
    # straight back.
    op.execute(_DROP_LEGACY_TRIGGER_SQL)
    op.execute(_DROP_LEGACY_FUNCTION_SQL)
    op.execute(
        f'ALTER TABLE timeline_events DROP CONSTRAINT IF EXISTS {CHECK_NAME}'
    )

    # Unedited converted rows only: an edited row keeps its edit (ADR-0020).
    op.execute(
        'UPDATE timeline_events SET '
        f'event_type = {OLD_COLUMN}, interview_type = NULL '
        f'WHERE {OLD_COLUMN} IN ({_in_list(LEGACY_TYPES)}) '
        f"AND event_type = '{CONVERTED_TYPE}' "
        f"AND interview_type = '{CONVERTED_INTERVIEW_TYPE}' "
        'AND start_time IS NULL AND end_time IS NULL AND timezone IS NULL'
    )

    # Kept: the event_type_old copy, the cvs row and its beta list rows.
