"""cvs beta list topped up; the switch-over trigger dropped (Release B)

Revision ID: 647a047921ec
Revises: f28e3d9705dd
Create Date: 2026-10-18 10:00:00.000000

Plan ``docs/plan/0015-cvs-beta-and-three-event-types.md`` ``## Data`` (R2),
ADR-0020 (three timeline event types), ADR-0021 (gating a shipped feature).

prod-release-runbook.md: this runs right after the Release B deploy. From
that deploy until ``alembic upgrade head`` the new image gates the CV routes
on ``cvs`` while the list still lacks the users whose first CV came after
Release A; this revision adds them.

upgrade(), in this order:

1. Drops ``trg_timeline_events_legacy_event_type`` and its function
   ``timeline_events_legacy_event_type()`` (``IF EXISTS``). The image that
   wrote ``note`` and ``feedback`` is gone; from here
   ``ck_timeline_events_event_type`` refuses both.
2. Top-up (ADR-0021, the second of the only two migrations that write the
   ``cvs`` list): one ``feature_beta_users`` row, ``added_by`` NULL, for
   every user whose earliest ``created_at`` over ``base_cvs`` and
   ``tailored_cvs`` is later than the ``cvs`` row's ``created_at`` - the
   users who got their first master CV or CV copy after Release A seeded
   the list. ``ON CONFLICT (feature_id, user_id) DO NOTHING``. A missing
   ``cvs`` row raises: Release A always leaves one.

The limit (owner accepted it): a removal from the list leaves no trace, so
this revision cannot see one. It keeps off a removed user whose earliest CV
predates the ``cvs`` row; it adds back a user whose first CV came after
Release A and whom an admin added and removed in between, and a pre-A
owner who deleted every pre-A CV and made a new one. An admin removes them
again at ``/admin/features``.

downgrade():

* recreates the function and the trigger from a byte-for-byte copy of the
  Release A revision's ``_LEGACY_FUNCTION_SQL`` and
  ``_CREATE_LEGACY_TRIGGER_SQL`` (a revision never imports another; a test
  pins the copy against ``f28e3d9705dd``), so the Release A image can run
  again;
* keeps the top-up rows: the Release A image gates nothing on ``cvs``.

## Rules

non-destructive-migrations.md rule 1: ``downgrade()`` is real. Rule 2:
``upgrade()`` drops no column and no table (only a trigger and a function).
Rule 5: ``downgrade()`` restores the trigger; ``event_type_old`` was never
touched here. Rule 7: no app code reads ``event_type_old``.
prod-release-runbook.md rule 4: the code that gates on ``cvs`` ships in
this release, after Release A's ``alembic upgrade head`` was confirmed.
ADR-0005 (non-destructive migrations), ADR-0020, ADR-0021.
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

from app.lib.types import generate_snowflake_id

revision: str = '647a047921ec'
down_revision: Union[str, Sequence[str], None] = 'f28e3d9705dd'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# --- byte-for-byte copy of f28e3d9705dd (pinned by a test) ----------------

FEATURE_KEY = 'cvs'

LEGACY_TYPES: tuple[str, ...] = ('note', 'feedback')
CONVERTED_TYPE = 'interview'
CONVERTED_INTERVIEW_TYPE = 'unknown'

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

# --- end of the copy -------------------------------------------------------

_LATE_CV_OWNERS_SQL = (
    'SELECT user_id FROM ('
    'SELECT user_id, created_at FROM base_cvs '
    'UNION ALL SELECT user_id, created_at FROM tailored_cvs'
    ') AS cv '
    'GROUP BY user_id '
    'HAVING min(created_at) > :seeded_at '
    'ORDER BY user_id'
)


def _cvs_feature(bind: sa.engine.Connection) -> tuple[int, datetime]:
    row = bind.execute(
        sa.text('SELECT id, created_at FROM features WHERE key = :key'),
        {'key': FEATURE_KEY},
    ).first()
    if row is None:
        raise RuntimeError(
            "the 'cvs' features row is missing; revision f28e3d9705dd "
            'seeds it and its downgrade keeps it'
        )
    return row.id, row.created_at


def _top_up(bind: sa.engine.Connection) -> None:
    feature_id, seeded_at = _cvs_feature(bind)
    owners = bind.execute(
        sa.text(_LATE_CV_OWNERS_SQL), {'seeded_at': seeded_at}
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


def upgrade() -> None:
    bind = op.get_bind()

    op.execute(_DROP_LEGACY_TRIGGER_SQL)
    op.execute(_DROP_LEGACY_FUNCTION_SQL)

    _top_up(bind)


def downgrade() -> None:
    op.execute(_LEGACY_FUNCTION_SQL)
    op.execute(_DROP_LEGACY_TRIGGER_SQL)
    op.execute(_CREATE_LEGACY_TRIGGER_SQL)

    # Kept: the top-up rows on the cvs beta list.
