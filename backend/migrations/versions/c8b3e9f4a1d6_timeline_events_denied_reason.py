"""timeline events denied reason: denied_reason on timeline_events (R3)

Revision ID: c8b3e9f4a1d6
Revises: afd4074c70c2
Create Date: 2026-09-18 15:00:00.000000

Plan ``docs/plan/0008-steps-as-timeline.md``, ticket KODI-014
(R-033..R-036). Owner: "Fold into Release A" -- this revision chains
R1 -> R3 -> R2, so it ships in the same release as R1
(``.claude/rules/prod-release-runbook.md`` 4): **expand only**. Nothing
under ``app/`` reads or writes ``timeline_events.denied_reason`` until
Release B (KODI-014's backend part, T065); the ORM does not map it until
then either.

## What upgrade() does, in order

1. ``LOCK TABLE timeline_events, applications, application_steps IN SHARE
   ROW EXCLUSIVE MODE``: no old-code write races the backfill or the
   trigger-function swap below.
2. ``CREATE TYPE denied_reason`` with the ten lower-case labels the
   Contract pins (owner: "Catalog-based list (Recommended)"; "add some
   options by yourself or based in the oldes feedback definition values").
3. ``timeline_events.denied_reason`` added, nullable.
4. Every existing ``denied`` event is backfilled from its application's
   *current* legacy feedback (``applications.feedback_id ->
   feedbacks_definition.name``, R2 has not renamed these columns yet since
   R3 sits between R1 and R2): matched **by name**, never by id
   (``FEEDBACK_TO_DENIED_REASON``) -- ``Not good enough`` ->
   ``not_good_enough``, ``Skills`` -> ``skills_mismatch``, ``Assessment
   failed`` -> ``assessment_failed``, ``Too many candidates`` ->
   ``too_many_candidates``, ``Position filled`` -> ``position_filled``,
   ``Role closed`` -> ``role_closed``, ``Ghost`` -> ``ghosted``; any other
   name (``On going``, ``Accepted``, ...) or no feedback at all ->
   ``unknown``.
5. ``ck_timeline_events_denied_reason`` added *after* the backfill:
   ``denied_reason IS NOT NULL`` iff ``event_type = 'denied'``.
6. R1's two transitional sync trigger **functions**
   (``timeline_events_sync_application_step``,
   ``timeline_events_sync_application_finalize``) are replaced
   (``CREATE OR REPLACE``, same names -- the triggers themselves are
   untouched, they still point at these functions) so that every write the
   *old* code makes during the Release A image's run (including the whole
   A -> B window between the image deploy and the owner's manual
   ``alembic upgrade head``, ``prod-release-runbook.md``) keeps satisfying
   the new CHECK:

   * ``timeline_events_sync_application_step`` -- a step insert/update that
     the sync turns into a ``denied`` event gets the reason mapped from the
     application's *current* feedback (the same map, by name), or
     ``unknown`` when there is none; an event the sync turns *away* from
     ``denied`` gets ``denied_reason = NULL`` (the ``ON CONFLICT DO UPDATE``
     already recomputes the whole row from ``EXCLUDED``, so this falls out
     of the same recomputation the interview-type/offer-salary fields
     already go through -- no extra branch needed beyond computing
     ``v_denied_reason``).
   * ``timeline_events_sync_application_finalize`` -- when an application
     gets its feedback for the first time (``OLD.feedback_id IS NULL AND
     NEW.feedback_id IS NOT NULL``, the same branch that already appends
     ``Feedback: <name>`` to the terminal event's observation), the mapped
     reason is set on that same terminal event, but only when it actually
     is a ``denied`` event (``WHERE id = v_terminal_id AND event_type =
     'denied'``) -- so the update is a harmless no-op on an offer/note/etc.
     terminal event and the CHECK is never at risk.

   Both bodies keep R1's own ``BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE
   WARNING`` catch-all exactly as is: a trigger must never fail the
   old-code write it is syncing.

No temporary table is used anywhere in this revision (upgrade or
downgrade) -- KODI-013 (R2) hit a temp-table name collision
(``timeline_downgrade_touched``) when a single ``alembic
downgrade``/``upgrade`` command crossed two revisions' bodies inside one
outer transaction (``migrations/env.py``); R3 sidesteps the whole class of
bug by never creating one.

## What downgrade() does

Reversed, and in the opposite order of upgrade(): the two trigger
functions are restored to R1's own bodies first (``_R1_STEP_FUNCTION_SQL``
/ ``_R1_APP_FUNCTION_SQL`` below, copied byte-for-byte from
``afd4074c70c2`` -- a revision must not import another revision, the same
rule R2 documents for its own copies), then the CHECK, the column and the
enum type are dropped, in that order (only ``downgrade()`` may drop,
``.claude/rules/non-destructive-migrations.md`` 1/2). Dropping the whole
``denied_reason`` type is safe and, unlike ``currency``/``salaryperiod``,
fully reversible: this revision is the one that created it from nothing,
so no other object or row (once the column above it is gone) references
it any more.

## non-destructive-migrations.md

``upgrade()`` drops nothing (rule 2) and renames nothing (no ``_old``
object). ``downgrade()`` works (rule 1) and drops only what this revision
itself created (rule 3-5 do not apply, nothing is renamed to ``_old``
here). No column shrinks (rule 6). No ORM model maps ``denied_reason``
until Release B (rule 7). The enum is created fresh by this revision, so
there is nothing "only gains values" about it (rule 8 is not engaged);
Postgres can drop a type nothing yet references, which is exactly what
``downgrade()`` does.
"""

from typing import Sequence, Union

from alembic import op

revision: str = 'c8b3e9f4a1d6'
down_revision: Union[str, Sequence[str], None] = 'afd4074c70c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DENIED_REASONS = (
    'unknown',
    'not_good_enough',
    'skills_mismatch',
    'assessment_failed',
    'too_many_candidates',
    'position_filled',
    'role_closed',
    'ghosted',
    'salary_mismatch',
    'other',
)

# Contract (pinned in the ticket brief): match by feedback *name*, never by
# id. Anything not in this map, or no feedback at all, falls back to
# DENIED_REASON_FALLBACK. Kept in lockstep with the app-side
# ``LEGACY_FEEDBACK_TO_DENIED_REASON`` (``use_cases/compat/
# legacy_finalize.py``) -- a unit test in the T065 slice pins the two equal.
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

_CHECK_NAME = 'ck_timeline_events_denied_reason'
_ENUM_NAME = 'denied_reason'

_STEP_TRIGGER = 'trg_application_steps_sync'
_APP_TRIGGER = 'trg_applications_finalize_sync'
_STEP_FUNCTION = 'timeline_events_sync_application_step'
_APP_FUNCTION = 'timeline_events_sync_application_finalize'

# R1's own fallback/default constants (afd4074c70c2), duplicated so this
# revision's trigger bodies stay byte-compatible with R1's outside the
# denied_reason addition.
STEP_FALLBACK: tuple[str, str | None] = ('interview', 'unknown')
OFFER_DEFAULT_CURRENCY = 'USD'
OFFER_DEFAULT_PERIOD = 'MONTHLY'


def _quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _in_list(values: Sequence[str]) -> str:
    return ', '.join(_quote(value) for value in values)


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
    literal, matched by name, never by id (the CHECK's fallback is the same
    for "no match" and "no feedback at all": both land on ELSE)."""
    branches = ' '.join(
        f'WHEN {_quote(name)} THEN {_quote(reason)}'
        for name, reason in FEEDBACK_TO_DENIED_REASON.items()
    )
    return (
        f'CASE {name_expr} {branches} ELSE {_quote(DENIED_REASON_FALLBACK)} END'
    )


# --------------------------------------------------------------------------
# R1's own trigger bodies, copied byte-for-byte from ``afd4074c70c2`` -
# restored verbatim by downgrade(). A revision must not import another
# revision (R2's own precedent, ``ad747aba90fc``).
# --------------------------------------------------------------------------

_R1_STEP_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {_STEP_FUNCTION}() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    v_event_type event_type;
    v_interview_type interview_type;
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
            event_date, start_time, end_time, timezone, observation,
            salary_amount, salary_currency, salary_period,
            created_at, updated_at
        ) VALUES (
            NEW.id, NEW.application_id, NEW.user_id, v_event_type,
            v_interview_type, NEW.step_date, NEW.start_time, NEW.end_time,
            NEW.timezone, NEW.observation, v_amount, v_currency, v_period,
            COALESCE(NEW.created_at, now()), NEW.updated_at
        )
        ON CONFLICT (id) DO UPDATE SET
            application_id = EXCLUDED.application_id,
            user_id = EXCLUDED.user_id,
            event_type = EXCLUDED.event_type,
            interview_type = EXCLUDED.interview_type,
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

_R1_APP_FUNCTION_SQL = f"""
CREATE OR REPLACE FUNCTION {_APP_FUNCTION}() RETURNS trigger
LANGUAGE plpgsql AS $fn$
DECLARE
    v_terminal_id bigint;
    v_feedback_name text;
    v_offer_id bigint;
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
# R3's replacement bodies: R1's own bodies above, plus denied_reason.
# --------------------------------------------------------------------------

_STEP_FUNCTION_SQL = f"""
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

_BACKFILL_SQL = f"""
    UPDATE timeline_events e
       SET denied_reason = ({_reason_case_sql('f.name')})::denied_reason
      FROM applications a
      LEFT JOIN feedbacks_definition f ON f.id = a.feedback_id
     WHERE a.id = e.application_id AND e.event_type = 'denied'
"""

_ADD_CHECK_SQL = (
    f'ALTER TABLE timeline_events ADD CONSTRAINT {_CHECK_NAME} CHECK ('
    "(event_type = 'denied' AND denied_reason IS NOT NULL) "
    "OR (event_type <> 'denied' AND denied_reason IS NULL))"
)


def upgrade() -> None:
    # -- 1. No old-code write races the backfill or the trigger-function
    #       swap below.
    op.execute(
        'LOCK TABLE timeline_events, applications, application_steps '
        'IN SHARE ROW EXCLUSIVE MODE'
    )

    # -- 2. The new enum, additive: this revision creates it, nothing else
    #       exists yet that could depend on it.
    op.execute(f'CREATE TYPE {_ENUM_NAME} AS ENUM ({_in_list(DENIED_REASONS)})')

    # -- 3. The new column, nullable.
    op.execute(
        f'ALTER TABLE timeline_events ADD COLUMN denied_reason {_ENUM_NAME}'
    )

    # -- 4. Backfill every existing denied event from its application's
    #       current legacy feedback, matched by name.
    op.execute(_BACKFILL_SQL)

    # -- 5. The CHECK, only once every denied row already satisfies it.
    op.execute(_ADD_CHECK_SQL)

    # -- 6. R1's sync trigger functions, replaced so an old-code write
    #       during the A -> B window keeps satisfying the CHECK above.
    op.execute(_STEP_FUNCTION_SQL)
    op.execute(_APP_FUNCTION_SQL)


def downgrade() -> None:
    # -- Trigger functions restored first, byte-identical to R1's, so
    #    nothing below outlives a function that still references
    #    denied_reason.
    op.execute(_R1_STEP_FUNCTION_SQL)
    op.execute(_R1_APP_FUNCTION_SQL)

    # -- Only downgrade() drops: the CHECK, then the column, then the type.
    op.execute(f'ALTER TABLE timeline_events DROP CONSTRAINT {_CHECK_NAME}')
    op.execute('ALTER TABLE timeline_events DROP COLUMN denied_reason')
    op.execute(f'DROP TYPE {_ENUM_NAME}')
