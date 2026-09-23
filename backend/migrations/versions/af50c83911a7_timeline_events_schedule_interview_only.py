"""timeline events schedule interview only: start_time/end_time/timezone
kept on interview events only (R4)

Revision ID: af50c83911a7
Revises: c8b3e9f4a1d6
Create Date: 2026-09-18 16:00:00.000000

Plan ``docs/applika/plan/0008-steps-as-timeline.md``, ticket KODI-016
(R-038, R-039). Owner, verbatim: "clear it on edit, this must be blocked
ever on backend, if event type is different from interview, these
attributes must be blocked, you can remove the value in the database as
well in case of problems when returning all events in an application (the
api must omit the extra attributed to non intervierw type)". "These
attributes" = ``start_time``, ``end_time``, ``timezone``.

Owner's choice folds this revision into Release A too, chained
R1 -> R3 -> **R4** (this revision) -> R2: this side branch (``release-a/
0008-denied-reason``) carries **no** application code
(``.claude/rules/prod-release-runbook.md`` 4). Nothing under ``app/`` reads
or writes this CHECK or the cleared columns differently until KODI-016's
backend part (T078) ships on the integration branch, after the owner
confirms ``alembic upgrade head`` ran. The three columns themselves are not
new — ``afd4074c70c2`` (R1) already created them nullable on every event
type — so this revision does not add a column; it tightens what they may
hold on a non-interview row, exactly as R3 tightened ``denied_reason``
without adding a column-shrinking change (rule 6 is not engaged either:
no column's width, precision or scale changes here).

## What upgrade() does, in order

1. ``LOCK TABLE timeline_events, applications, application_steps IN SHARE
   ROW EXCLUSIVE MODE``: no old-code write races the clear-out or the
   trigger-function swap below (R3's own precedent).
2. Every existing non-interview event has its schedule cleared:
   ``UPDATE timeline_events SET start_time = NULL, end_time = NULL,
   timezone = NULL WHERE event_type <> 'interview'``. The original values
   are not lost — they still live in ``application_steps`` for every event
   that started life as a step (R1's backfill copied ``id``, so
   ``application_steps.id = timeline_events.id`` for those rows), and
   ``downgrade()`` restores from there. A non-interview event with no
   matching ``application_steps`` row is one Release B/C itself created
   directly on the timeline; the owner's own words above ("you can remove
   the value ... in case of problems") is the standing authorization for
   that row's schedule not surviving a downgrade — there is nowhere else
   for it to live, and R3 already established the same "clear now, no
   ``_old`` copy needed" shape for a tightened CHECK on data the previous
   revision itself created (see R3's own ``ck_timeline_events_denied_
   reason``, added after a backfill with no ``_old`` companion either).
3. The CHECK, only once every row already satisfies it:
   ``ck_timeline_events_schedule_interview_only`` — ``event_type =
   'interview' OR (start_time IS NULL AND end_time IS NULL AND timezone IS
   NULL)``.
4. ``timeline_events_sync_application_step`` is replaced (``CREATE OR
   REPLACE``, same name — the trigger itself, ``trg_application_steps_
   sync``, is untouched) so an old-code insert/update of an
   ``application_steps`` row during the whole A -> B window (including
   between this migration and the owner's next manual ``alembic upgrade
   head``, ``prod-release-runbook.md``) keeps satisfying the new CHECK:
   the function now computes ``v_start_time``/``v_end_time``/``v_timezone``
   from ``NEW.start_time``/``NEW.end_time``/``NEW.timezone`` only when the
   resolved ``v_event_type = 'interview'``, else ``NULL`` — same shape as
   the existing ``v_interview_type`` branch two lines above it — and both
   the ``INSERT`` and the ``ON CONFLICT DO UPDATE`` use the resolved
   variables instead of ``NEW.*`` directly. R3's own ``BEGIN ... EXCEPTION
   WHEN OTHERS THEN RAISE WARNING`` catch-all is kept exactly: a trigger
   must never fail the old-code write it is syncing.

   ``timeline_events_sync_application_finalize`` is **not** replaced.
   Checked line by line against R3's current body
   (``_APP_FUNCTION_SQL`` below, R3's, unmodified by this revision): it
   only ever *writes* ``finalized_at``, ``observation`` (the appended
   ``Feedback: <name>`` line), ``denied_reason`` and the offer salary
   triple (``salary_amount``/``salary_currency``/``salary_period``). It
   does *read* ``start_time`` once, inside ``_latest_order()``'s
   ``ORDER BY ... start_time DESC NULLS LAST`` (choosing the latest event
   to update) — a read, never a write, so it cannot put a schedule value
   into a row and cannot violate the new CHECK; recreating this function
   identically would be a no-op. It is left as R3 defined it;
   ``downgrade()`` below restores only the step function, the one this
   revision actually changed.

No temporary table is used anywhere in this revision (R3's own
precedent, sidestepping the KODI-013 temp-table name collision class of
bug entirely).

## What downgrade() does

Reversed, and in the opposite order of upgrade(): the step sync function
is restored to R3's own body first (``_R3_STEP_FUNCTION_SQL`` below,
copied byte-for-byte from ``c8b3e9f4a1d6`` — a revision must not import
another revision, the same rule R2 and R3 already document for their own
copies), then the CHECK is dropped, then every non-interview event's
schedule is restored from ``application_steps`` by id:
``UPDATE timeline_events t SET start_time = s.start_time, end_time =
s.end_time, timezone = s.timezone FROM application_steps s WHERE s.id =
t.id AND t.event_type <> 'interview'``. The ``event_type <> 'interview'``
guard matters: an interview event's schedule was never touched by
``upgrade()`` (only non-interview rows were cleared), so a downgrade must
not touch it either — without the guard, an interview event a Release B/C
user *edited* after this revision's own upgrade (new ``start_time``/
``end_time``/``timezone``, still the same id as its migrated step) would
have that edit silently overwritten by ``application_steps``' stale,
pre-edit values on downgrade, destroying data a rollback must preserve
(``.claude/rules/non-destructive-migrations.md`` 1). Only ``downgrade()``
drops (rule 1/2).

## non-destructive-migrations.md

``upgrade()`` drops nothing (rule 2) and renames nothing (no ``_old``
object — the originals already live in ``application_steps``, untouched
by this revision, so there is nothing to copy into an ``_old`` companion).
``downgrade()`` works (rule 1) and restores the cleared values from
``application_steps`` (rule 5's spirit, applied to a CHECK tightening
rather than a rename). No column shrinks (rule 6). No ORM model or
application code treats this CHECK, or the cleared columns, differently
until KODI-016's backend part ships (rule 7).
"""

from typing import Sequence, Union

from alembic import op

revision: str = 'af50c83911a7'
down_revision: Union[str, Sequence[str], None] = 'c8b3e9f4a1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Contract (pinned in the ticket brief): match by feedback *name*, never by
# id. Kept in lockstep with R3's own map — this revision does not change
# denied-reason behaviour at all, it only copies R3's step function body
# forward so the schedule-nulling addition sits on top of it.
FEEDBACK_TO_DENIED_REASON: dict[str, str] = {
    'Not good enough': 'not_good_enough',
    'Skills': 'skills_mismatch',
    'Assessment failed': 'assessment_failed',
    'Too many candidates': 'too_many_candidates',
    'Position filled': 'position_filled',
    'Role closed': 'role_closed',
    'Ghost': 'ghosted',
}
DENIED_REASON_FALLBACK = 'unknown'

_CHECK_NAME = 'ck_timeline_events_schedule_interview_only'

_STEP_TRIGGER = 'trg_application_steps_sync'
_APP_TRIGGER = 'trg_applications_finalize_sync'
_STEP_FUNCTION = 'timeline_events_sync_application_step'
_APP_FUNCTION = 'timeline_events_sync_application_finalize'

# R1's own fallback/default constants (afd4074c70c2), duplicated so this
# revision's trigger body stays byte-compatible with R1's/R3's outside the
# schedule-nulling addition.
STEP_FALLBACK: tuple[str, str | None] = ('interview', 'unknown')
OFFER_DEFAULT_CURRENCY = 'USD'
OFFER_DEFAULT_PERIOD = 'MONTHLY'


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _offer_amount_sql(amount: str, cur: str, period: str) -> str:
    return (
        f'CASE WHEN {amount} IS NOT NULL AND {cur} IS NOT NULL '
        f'AND {period} IS NOT NULL THEN {amount} ELSE 0 END'
    )


def _offer_currency_sql(cur: str) -> str:
    return f"COALESCE({cur}, '{OFFER_DEFAULT_CURRENCY}'::currency)"


def _offer_period_sql(period: str) -> str:
    return f"COALESCE({period}, '{OFFER_DEFAULT_PERIOD}'::salaryperiod)"


def _latest_order(alias: str) -> str:
    return (
        f'{alias}.event_date DESC, {alias}.start_time DESC NULLS LAST, '
        f'{alias}.id DESC'
    )


def _append_feedback_sql(observation: str, name: str) -> str:
    return (
        f"CASE WHEN {observation} IS NULL OR {observation} = '' "
        f"THEN 'Feedback: ' || {name} "
        f"ELSE {observation} || E'\\n\\nFeedback: ' || {name} END"
    )


def _reason_case_sql(name_expr: str) -> str:
    """``feedbacks_definition.name`` (or NULL) -> a ``denied_reason``
    literal, matched by name, never by id. Byte-identical to R3's own
    helper (``c8b3e9f4a1d6``) - this revision does not touch denied-reason
    behaviour, it only carries R3's step function body forward."""
    branches = ' '.join(
        f'WHEN {_quote(name)} THEN {_quote(reason)}'
        for name, reason in FEEDBACK_TO_DENIED_REASON.items()
    )
    return (
        f'CASE {name_expr} {branches} ELSE {_quote(DENIED_REASON_FALLBACK)} END'
    )


# --------------------------------------------------------------------------
# R3's own step-function body, copied byte-for-byte from ``c8b3e9f4a1d6`` -
# restored verbatim by downgrade(). A revision must not import another
# revision (R2's/R3's own precedent).
# --------------------------------------------------------------------------

_R3_STEP_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {_STEP_FUNCTION}() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    v_event_type event_type;
    v_interview_type interview_type;
    v_denied_reason denied_reason;
    v_existing timeline_events%ROWTYPE;
    v_amount numeric(12, 2);
    v_currency currency;
    v_period salaryperiod;
BEGIN
    BEGIN
        IF TG_OP = 'DELETE' THEN
            DELETE FROM timeline_events WHERE id = OLD.id;
            RETURN NULL;
        END IF;

        SELECT d.event_type, d.interview_type
          INTO v_event_type, v_interview_type
          FROM steps_definition d WHERE d.id = NEW.step_id;
        IF v_event_type IS NULL THEN
            v_event_type := '{STEP_FALLBACK[0]}';
            v_interview_type := {_quote(STEP_FALLBACK[1])};
        END IF;
        IF v_event_type = 'interview' THEN
            v_interview_type := COALESCE(v_interview_type, 'unknown');
        ELSE
            v_interview_type := NULL;
        END IF;
        IF v_interview_type = 'initial_screening' AND EXISTS (
            SELECT 1 FROM timeline_events t
             WHERE t.application_id = NEW.application_id
               AND t.interview_type = 'initial_screening'
               AND t.id <> NEW.id
        ) THEN
            v_interview_type := 'unknown';
        END IF;

        IF v_event_type = 'denied' THEN
            SELECT ({_reason_case_sql('f.name')})::denied_reason
              INTO v_denied_reason
              FROM applications a
              LEFT JOIN feedbacks_definition f ON f.id = a.feedback_id
             WHERE a.id = NEW.application_id;
            v_denied_reason := COALESCE(
                v_denied_reason, '{DENIED_REASON_FALLBACK}'::denied_reason
            );
        ELSE
            v_denied_reason := NULL;
        END IF;

        IF v_event_type = 'offer' THEN
            SELECT t.* INTO v_existing
              FROM timeline_events t WHERE t.id = NEW.id;
            IF FOUND AND v_existing.event_type = 'offer' THEN
                v_amount := v_existing.salary_amount;
                v_currency := v_existing.salary_currency;
                v_period := v_existing.salary_period;
            ELSE
                SELECT {
    _offer_amount_sql('a.salary_offer', 'a.currency', 'a.salary_period')
},
                       {_offer_currency_sql('a.currency')},
                       {_offer_period_sql('a.salary_period')}
                  INTO v_amount, v_currency, v_period
                  FROM applications a WHERE a.id = NEW.application_id;
                v_amount := COALESCE(v_amount, 0);
                v_currency := {_offer_currency_sql('v_currency')};
                v_period := {_offer_period_sql('v_period')};
            END IF;
        END IF;

        INSERT INTO timeline_events (
            id, application_id, user_id, event_type, interview_type,
            denied_reason,
            event_date, start_time, end_time, timezone, observation,
            salary_amount, salary_currency, salary_period,
            created_at, updated_at
        ) VALUES (
            NEW.id, NEW.application_id, NEW.user_id, v_event_type,
            v_interview_type, v_denied_reason,
            NEW.step_date, NEW.start_time, NEW.end_time,
            NEW.timezone, NEW.observation, v_amount, v_currency, v_period,
            COALESCE(NEW.created_at, now()), NEW.updated_at
        )
        ON CONFLICT (id) DO UPDATE SET
            application_id = EXCLUDED.application_id,
            user_id = EXCLUDED.user_id,
            event_type = EXCLUDED.event_type,
            interview_type = EXCLUDED.interview_type,
            denied_reason = EXCLUDED.denied_reason,
            event_date = EXCLUDED.event_date,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            timezone = EXCLUDED.timezone,
            observation = EXCLUDED.observation,
            salary_amount = EXCLUDED.salary_amount,
            salary_currency = EXCLUDED.salary_currency,
            salary_period = EXCLUDED.salary_period,
            updated_at = EXCLUDED.updated_at;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '{_STEP_TRIGGER}: step % not synced: % (%)',
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            SQLERRM, SQLSTATE;
    END;
    RETURN NULL;
END;
$fn$
"""

# R3's finalize-sync body, unmodified and not replaced by this revision
# (see the module docstring: no statement in it reads or writes
# start_time/end_time/timezone). Kept here, unused by upgrade()/
# downgrade(), purely so a reader - and the round-trip test - can diff it
# against R3's own copy and confirm this revision truly left it alone.
_APP_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {_APP_FUNCTION}() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    v_terminal_id bigint;
    v_feedback_name text;
    v_offer_id bigint;
    v_denied_reason denied_reason;
BEGIN
    BEGIN
        IF NEW.feedback_id IS NULL THEN
            IF OLD.feedback_id IS NOT NULL THEN
                NEW.finalized_at := NULL;
            END IF;
        ELSIF OLD.feedback_id IS DISTINCT FROM NEW.feedback_id
           OR OLD.feedback_date IS DISTINCT FROM NEW.feedback_date THEN
            NEW.finalized_at := COALESCE(
                NEW.feedback_date::timestamp AT TIME ZONE 'UTC', now()
            );
        END IF;

        IF OLD.feedback_id IS NULL AND NEW.feedback_id IS NOT NULL THEN
            SELECT f.name INTO v_feedback_name
              FROM feedbacks_definition f WHERE f.id = NEW.feedback_id;
            SELECT t.id INTO v_terminal_id
              FROM timeline_events t
              LEFT JOIN application_steps s ON s.id = t.id
             WHERE t.application_id = NEW.id
             ORDER BY (s.step_id IS NOT DISTINCT FROM NEW.last_step_id) DESC,
                      {_latest_order('t')}
             LIMIT 1;
            IF v_terminal_id IS NOT NULL AND v_feedback_name IS NOT NULL THEN
                UPDATE timeline_events
                   SET observation = {
    _append_feedback_sql('observation', 'v_feedback_name')
}
                 WHERE id = v_terminal_id;
            END IF;
            IF v_terminal_id IS NOT NULL THEN
                v_denied_reason := ({_reason_case_sql('v_feedback_name')})
                    ::denied_reason;
                UPDATE timeline_events
                   SET denied_reason = v_denied_reason
                 WHERE id = v_terminal_id AND event_type = 'denied';
            END IF;
        END IF;

        IF (OLD.salary_offer, OLD.currency, OLD.salary_period)
           IS DISTINCT FROM (NEW.salary_offer, NEW.currency, NEW.salary_period)
        THEN
            SELECT t.id INTO v_offer_id
              FROM timeline_events t
             WHERE t.application_id = NEW.id AND t.event_type = 'offer'
             ORDER BY {_latest_order('t')}
             LIMIT 1;
            IF v_offer_id IS NOT NULL THEN
                UPDATE timeline_events t SET
                    salary_amount = {
    _offer_amount_sql('NEW.salary_offer', 'NEW.currency', 'NEW.salary_period')
},
                    salary_currency = {_offer_currency_sql('NEW.currency')},
                    salary_period = {_offer_period_sql('NEW.salary_period')}
                 WHERE t.id = v_offer_id
                   AND (t.salary_amount, t.salary_currency, t.salary_period)
                       IS NOT DISTINCT FROM (
                           {
    _offer_amount_sql('OLD.salary_offer', 'OLD.currency', 'OLD.salary_period')
},
                           {_offer_currency_sql('OLD.currency')},
                           {_offer_period_sql('OLD.salary_period')}
                       );
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '{_APP_TRIGGER}: application % not synced: % (%)',
            NEW.id, SQLERRM, SQLSTATE;
    END;
    RETURN NEW;
END;
$fn$
"""

# --------------------------------------------------------------------------
# R4's replacement step-function body: R3's own body above, plus schedule
# nulling on every non-interview event.
# --------------------------------------------------------------------------

_STEP_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {_STEP_FUNCTION}() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    v_event_type event_type;
    v_interview_type interview_type;
    v_denied_reason denied_reason;
    v_start_time time;
    v_end_time time;
    v_timezone varchar(100);
    v_existing timeline_events%ROWTYPE;
    v_amount numeric(12, 2);
    v_currency currency;
    v_period salaryperiod;
BEGIN
    BEGIN
        IF TG_OP = 'DELETE' THEN
            DELETE FROM timeline_events WHERE id = OLD.id;
            RETURN NULL;
        END IF;

        SELECT d.event_type, d.interview_type
          INTO v_event_type, v_interview_type
          FROM steps_definition d WHERE d.id = NEW.step_id;
        IF v_event_type IS NULL THEN
            v_event_type := '{STEP_FALLBACK[0]}';
            v_interview_type := {_quote(STEP_FALLBACK[1])};
        END IF;
        IF v_event_type = 'interview' THEN
            v_interview_type := COALESCE(v_interview_type, 'unknown');
        ELSE
            v_interview_type := NULL;
        END IF;
        IF v_interview_type = 'initial_screening' AND EXISTS (
            SELECT 1 FROM timeline_events t
             WHERE t.application_id = NEW.application_id
               AND t.interview_type = 'initial_screening'
               AND t.id <> NEW.id
        ) THEN
            v_interview_type := 'unknown';
        END IF;

        IF v_event_type = 'interview' THEN
            v_start_time := NEW.start_time;
            v_end_time := NEW.end_time;
            v_timezone := NEW.timezone;
        ELSE
            v_start_time := NULL;
            v_end_time := NULL;
            v_timezone := NULL;
        END IF;

        IF v_event_type = 'denied' THEN
            SELECT ({_reason_case_sql('f.name')})::denied_reason
              INTO v_denied_reason
              FROM applications a
              LEFT JOIN feedbacks_definition f ON f.id = a.feedback_id
             WHERE a.id = NEW.application_id;
            v_denied_reason := COALESCE(
                v_denied_reason, '{DENIED_REASON_FALLBACK}'::denied_reason
            );
        ELSE
            v_denied_reason := NULL;
        END IF;

        IF v_event_type = 'offer' THEN
            SELECT t.* INTO v_existing
              FROM timeline_events t WHERE t.id = NEW.id;
            IF FOUND AND v_existing.event_type = 'offer' THEN
                v_amount := v_existing.salary_amount;
                v_currency := v_existing.salary_currency;
                v_period := v_existing.salary_period;
            ELSE
                SELECT {
    _offer_amount_sql('a.salary_offer', 'a.currency', 'a.salary_period')
},
                       {_offer_currency_sql('a.currency')},
                       {_offer_period_sql('a.salary_period')}
                  INTO v_amount, v_currency, v_period
                  FROM applications a WHERE a.id = NEW.application_id;
                v_amount := COALESCE(v_amount, 0);
                v_currency := {_offer_currency_sql('v_currency')};
                v_period := {_offer_period_sql('v_period')};
            END IF;
        END IF;

        INSERT INTO timeline_events (
            id, application_id, user_id, event_type, interview_type,
            denied_reason,
            event_date, start_time, end_time, timezone, observation,
            salary_amount, salary_currency, salary_period,
            created_at, updated_at
        ) VALUES (
            NEW.id, NEW.application_id, NEW.user_id, v_event_type,
            v_interview_type, v_denied_reason,
            NEW.step_date, v_start_time, v_end_time,
            v_timezone, NEW.observation, v_amount, v_currency, v_period,
            COALESCE(NEW.created_at, now()), NEW.updated_at
        )
        ON CONFLICT (id) DO UPDATE SET
            application_id = EXCLUDED.application_id,
            user_id = EXCLUDED.user_id,
            event_type = EXCLUDED.event_type,
            interview_type = EXCLUDED.interview_type,
            denied_reason = EXCLUDED.denied_reason,
            event_date = EXCLUDED.event_date,
            start_time = EXCLUDED.start_time,
            end_time = EXCLUDED.end_time,
            timezone = EXCLUDED.timezone,
            observation = EXCLUDED.observation,
            salary_amount = EXCLUDED.salary_amount,
            salary_currency = EXCLUDED.salary_currency,
            salary_period = EXCLUDED.salary_period,
            updated_at = EXCLUDED.updated_at;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '{_STEP_TRIGGER}: step % not synced: % (%)',
            CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
            SQLERRM, SQLSTATE;
    END;
    RETURN NULL;
END;
$fn$
"""

_CLEAR_SCHEDULE_SQL = (
    'UPDATE timeline_events SET start_time = NULL, end_time = NULL, '
    "timezone = NULL WHERE event_type <> 'interview'"
)

_ADD_CHECK_SQL = (
    f'ALTER TABLE timeline_events ADD CONSTRAINT {_CHECK_NAME} CHECK ('
    "event_type = 'interview' "
    'OR (start_time IS NULL AND end_time IS NULL AND timezone IS NULL))'
)

_RESTORE_SCHEDULE_SQL = """
    UPDATE timeline_events t SET
        start_time = s.start_time,
        end_time = s.end_time,
        timezone = s.timezone
    FROM application_steps s
    WHERE s.id = t.id AND t.event_type <> 'interview'
"""


def upgrade() -> None:
    # -- 1. No old-code write races the clear-out or the trigger-function
    #       swap below.
    op.execute(
        'LOCK TABLE timeline_events, applications, application_steps '
        'IN SHARE ROW EXCLUSIVE MODE'
    )

    # -- 2. Every existing non-interview event loses its schedule. The
    #       originals stay in application_steps for every migrated row;
    #       downgrade() restores from there.
    op.execute(_CLEAR_SCHEDULE_SQL)

    # -- 3. The CHECK, only once every row already satisfies it.
    op.execute(_ADD_CHECK_SQL)

    # -- 4. The step sync function, replaced so an old-code write during
    #       the A -> B window keeps satisfying the CHECK above. The
    #       finalize sync function is left untouched (see the module
    #       docstring): it never writes a schedule.
    op.execute(_STEP_FUNCTION_SQL)


def downgrade() -> None:
    # -- Step function restored first, byte-identical to R3's, so nothing
    #    below outlives a function whose INSERT/ON CONFLICT still refers
    #    to the schedule-nulling variables.
    op.execute(_R3_STEP_FUNCTION_SQL)

    # -- Only downgrade() drops: the CHECK, then the schedule is restored.
    op.execute(f'ALTER TABLE timeline_events DROP CONSTRAINT {_CHECK_NAME}')
    op.execute(_RESTORE_SCHEDULE_SQL)
