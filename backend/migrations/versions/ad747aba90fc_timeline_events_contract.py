"""timeline events contract: retire application_steps and the legacy
applications columns to ``_old``, drop the R1 sync triggers, remap
``ANNUAL`` -> ``ANNUALLY`` (R2)

Revision ID: ad747aba90fc
Revises: afd4074c70c2
Create Date: 2026-09-18 09:00:00.000000

Plan ``docs/applika/plan/0008-steps-as-timeline.md`` ``## Data``, revision R2,
ticket KODI-013. Release C of the plan: **the contract migration**. Release B
(KODI-011) already reads and writes nothing this revision renames — the ORM
has not mapped ``application_steps`` or the legacy ``applications`` columns
since Release B (see ``afd4074c70c2``'s own test,
``test_release_b_orm_maps_the_new_objects_and_nothing_old``). Nothing under
``app/`` needs to change for this revision (checked: every remaining
reference to ``application_steps``/``last_step_id``/``feedback_id``/
``feedback_date``/``salary_offer`` under ``app/`` is either a docstring, an
unrelated response DTO field computed from the timeline, or the deprecated
compat schema for the 0.1.4 request/response shape — none of it is a SQL
column or table name).

``upgrade()`` drops no column and no table (rule 2). Every retired object is
renamed with the ``_old`` suffix (rule 3): the table ``application_steps``
and its primary key and foreign keys, and the five ``applications`` columns
``last_step_id``, ``last_step_date``, ``feedback_id``, ``feedback_date``,
``salary_offer`` and their two foreign keys. ``steps_definition`` and
``feedbacks_definition`` keep their names: the compat ``/supports`` route
still reads them, frozen, for installed CLIs (R-018/AC4).

## What upgrade() does, in order

1. ``LOCK TABLE application_steps, applications IN SHARE ROW EXCLUSIVE MODE``:
   nothing below races a concurrent write to either table.
2. **Reconcile copy** — see "Reconcile design" below.
3. Drop the two R1 transitional sync triggers and their functions
   (``trg_application_steps_sync``, ``trg_applications_finalize_sync``,
   ``timeline_events_sync_application_step``,
   ``timeline_events_sync_application_finalize``). Nothing after this point
   writes ``application_steps`` (Release C never does), so the triggers no
   longer have a purpose; ``downgrade()`` recreates them byte-identical to
   R1's own definitions, because a further downgrade to R1's schema needs a
   working sync while a pre-Release-B image could still be running against
   it (unlikely, but the rollback contract in ``prod-release-runbook.md``
   promises the previous release's data, not the previous release's code
   path never running again).
4. Rename ``application_steps`` -> ``application_steps_old``, and its primary
   key (``pk_steps`` -> ``pk_steps_old``) and its three foreign keys
   (``fk_application_steps_user_id``, ``fk_steps_application_id``,
   ``fk_steps_step_id``, each with ``_old`` appended). No index besides the
   primary key exists on this table.
5. Rename ``applications.last_step_id``, ``last_step_date``, ``feedback_id``,
   ``feedback_date``, ``salary_offer`` to ``*_old``, and the two foreign keys
   ``fk_applications_last_step_id`` / ``fk_applications_feedback_id`` to
   ``*_old``. No secondary index exists on any of the five columns (checked
   against the live schema: only the primary key and these two foreign keys
   are registered).
6. Remap decision (c): every row whose ``salary_period`` is the legacy
   ``ANNUAL`` label becomes ``ANNUALLY`` on ``applications``, ``users`` and
   ``timeline_events`` — the three tables that carry the column. The PG enum
   itself is untouched (Postgres cannot drop a label); only the rows move.

## Reconcile design (the resurrection risk)

R1's ``trg_application_steps_sync`` only ever pushed data one way,
``application_steps`` -> ``timeline_events``, and Release B never wrote
``application_steps`` at all. So between the moment R1's migration ran in
production and the moment this revision runs, two very different things can
put an ``application_steps`` row and a ``timeline_events`` row out of sync:

* an **old-code write** — the previous release's containers, still running
  during the swarm rolling update, insert (or update) a step; the trigger
  tries to sync it and, rarely, fails (its own catch-all
  ``EXCEPTION WHEN OTHERS THEN RAISE WARNING`` — the write itself must never
  fail). The step exists in ``application_steps`` with no matching
  ``timeline_events`` row. This is what the reconcile step exists to catch
  (R-015 / AC1: whatever the old version wrote during the switch-over stays
  visible).
* a **Release B/C deletion** — a user on the new code deletes a timeline
  event that happened to have been migrated from a step (it kept the step's
  id, per R1's backfill). Release B/C never touches ``application_steps``, so
  the now-orphaned step row is still sitting there, looking exactly like an
  unsynced old-code write: a row in ``application_steps`` with no matching
  ``timeline_events`` row.

A reconcile that is just R1's backfill statement again with
``ON CONFLICT (id) DO NOTHING`` cannot tell these apart — it would resurrect
every event a user ever deleted. Both categories look identical in their
*content*; the only thing that tells them apart is *when the
``application_steps`` row was created*, because of one invariant the
old-code-write case and only that case satisfies: **R1's backfill ran once,
inside its own migration transaction, over every ``application_steps`` row
that existed at that moment.** Every row present in that snapshot got a
``timeline_events`` counterpart, unconditionally (the backfill is one
``INSERT ... SELECT``, not a per-row trigger with a catch-all handler — it
either inserts the whole snapshot or the migration itself fails). So a row
that is part of that original snapshot and has since lost its
``timeline_events`` counterpart can only have lost it to a deletion — the
backfill already proved it could be synced. A row that did **not** exist in
that snapshot — created afterwards, by the switch-over's old code — can only
be missing because its own trigger-fired sync failed.

The dividing line is therefore *"did this ``application_steps`` row exist
when R1's migration ran"*, which is exactly what the brief's own
``created_at``/``updated_at`` hint points at:
``application_steps.created_at`` is set at INSERT time and is never touched
by a Release B/C deletion (Release B/C never writes this table), so it is a
faithful timestamp of *when the step was created*, unaffected by anything
that happened to its ``timeline_events`` counterpart afterwards.

The one thing genuinely missing from the database is a stored marker of *when
R1's migration itself ran* — Alembic does not timestamp individual upgrades,
and nothing in R1 recorded one (it could not have: adding a marker column now
would not help, because Release B has already been running for a possibly
long time before this revision is written, so a marker captured today could
not separate "existed before R1" from "an event a B user deleted last week").
``_R1_MIGRATION_RAN_AT`` below pins the best available anchor instead: R1's
own revision ``Create Date`` (``afd4074c70c2``, 2026-09-17T12:00:00 UTC), on
the same "expand first, code second" premise the runbook already relies on
— the owner runs ``alembic upgrade head`` at release time, close to when the
revision was authored and merged. **This is a deliberate approximation, not
a certainty**, and is the one open point of this migration: if the owner
knows the actual production timestamp of ``alembic upgrade head`` for R1
differed materially from 2026-09-17T12:00:00 UTC (for example, the migration
was deferred by more than a few hours after the image deploy), this constant
should be corrected before R2 ships, or a step written by the old code in
that window will be silently treated as a stale orphan and left out of the
timeline (still safe — nothing is lost, ``application_steps_old`` keeps the
row — but R-015 would not show it). Filed as an open question in the ticket
report; not blocking, because the alternative (skip reconciliation
altogether) trades a rare, recoverable gap for the everyday, common case of
"a user deleted an event" silently un-deleting it, which is strictly worse.

The reconcile statement copies an ``application_steps`` row into
``timeline_events`` only when **both** hold: no ``timeline_events`` row
shares its id, and ``created_at > _R1_MIGRATION_RAN_AT``. It maps the step
exactly as the (still present, not yet dropped) trigger would have for a
brand new row: ``steps_definition`` gives the event/interview type
(``STEP_FALLBACK`` when unmapped), a second ``initial_screening`` on the same
application becomes ``unknown``, and an offer's salary is computed from the
application's current salary triple (decision (b): 0 unless amount, currency
and period are all set). ``test_timeline_contract_migration.py`` pins both
cases: an unsynced old-code row (``created_at`` after the cutover) **is**
copied; a step whose migrated event was deleted in Release B (``created_at``
before the cutover) is **not** resurrected.

## Denied-with-salary (KODI-010 flag)

A legacy finalize with a ``Denied`` step and a ``salary_offer`` kept that
salary only in ``applications.salary_offer`` — the offer CHECK on
``timeline_events`` refuses a non-offer event from carrying a salary, and
R1's backfill never invented an offer event for a denied application. There
is **no home for that value in the timeline model**, before or after this
revision. This migration does not invent one: the value moves, unedited,
into ``applications.salary_offer_old`` along with every other row of that
column, and stays exactly there. ``downgrade()`` never overwrites a non-null
``salary_offer`` it restores (the same guard R1's own downgrade already used
for the symmetric reason), so the value survives upgrade -> downgrade ->
upgrade untouched; pinned by
``test_denied_with_salary_survives_the_round_trip``.

## What downgrade() does

Every rename above, reversed, first — this alone restores every legacy
``applications`` column and every ``application_steps`` row exactly as it was
before this revision ran, byte for byte, for any application Release C never
touched. Then, for the applications Release C *did* touch since this
revision's upgrade (new or edited timeline events, a close or reopen): events
with no ``application_steps`` row (Release C's own writes; R1's synthetic
terminal events, id == application id, are excluded, exactly as R1's own
downgrade excludes them — "it was never a step") are copied into
``application_steps`` through the same reverse map
(``_reverse_step_id_sql``, identical to R1's and to
``app/application/use_cases/compat/step_translation.py``); an event whose id
already matches a step but was edited afterwards updates that step's fields
instead of inserting a second row; ``last_step_id``/``last_step_date``,
``feedback_id``/``feedback_date`` and ``salary_offer`` (only when currently
NULL — see the Denied-with-salary note above) are recomputed from the latest
timeline event, exactly the way R1's downgrade recomputes them, because after
this downgrade the schema **is** R1's schema and needs to satisfy the same
old code. ``ANNUALLY`` is remapped back to ``ANNUAL`` on ``applications``,
``users`` and ``timeline_events`` — safe unconditionally (not only for the
rows this revision itself remapped): ``SalaryPeriodType`` already reads both
labels as ``annually`` (see ``app/domain/models.py``), so relabelling a
Release-C-native ``ANNUALLY`` row back to ``ANNUAL`` loses no meaning, and it
keeps the round trip exact without needing to tell "remapped by this
revision" apart from "written natively as ANNUALLY by Release C" — an
ambiguity that, unlike the reconcile's, carries no risk because both labels
mean the same thing to every release that will ever read the row. Both
triggers are recreated last, byte-identical to R1's definitions.

**An ``application_steps`` row whose event was deleted after this revision's
upgrade**: downgrade never deletes a row (rule: a rollback never destroys
data), so it stays in ``application_steps`` exactly as ``application_steps
_old`` had it before the rename-back — visible again to the old code, the
same choice R1's own downgrade already made for a Release B deletion.

## non-destructive-migrations.md

``upgrade()`` drops nothing (rule 2); every retired object is renamed to
``_old`` (rule 3) and its data moves in this revision (rule 4); ``downgrade()``
works (rule 1), renames every object back and restores the data (rule 5); no
column shrinks (rule 6, nothing here changes a column's width or precision);
``app/`` neither reads nor writes an ``_old`` object and the ORM maps none of
them (rule 7, unchanged since Release B); the enum change only remaps rows,
never deletes one (rule 8).
"""

from datetime import datetime, timezone
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'ad747aba90fc'
down_revision: Union[str, Sequence[str], None] = 'afd4074c70c2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# --------------------------------------------------------------------------
# Constants and SQL fragments duplicated from ``afd4074c70c2`` (R1). A
# revision must not import another revision, so these are copied, not
# shared, and must stay in lockstep with R1's own copies -
# ``test_duplicated_constants_match_revision_afd4074c70c2_and_step_translation``
# in the round-trip test pins the two against each other and against
# ``app/application/use_cases/compat/step_translation.py``.
# --------------------------------------------------------------------------

INTERVIEW_TYPES = (
    'unknown',
    'initial_screening',
    'technical',
    'cultural',
    'hiring_manager',
    'take_home',
    'final',
)

OFFER_DEFAULT_CURRENCY = 'USD'
OFFER_DEFAULT_PERIOD = 'MONTHLY'

STEP_FALLBACK: tuple[str, str | None] = ('interview', 'unknown')

REVERSE_STEP_MAP: dict[tuple[str, str | None], str] = {
    ('interview', 'initial_screening'): 'Initial Screen',
    **{
        ('interview', kind): 'Phase 2'
        for kind in INTERVIEW_TYPES
        if kind != 'initial_screening'
    },
    ('offer', None): 'Offer',
    ('denied', None): 'Denied',
    ('note', None): 'Phase 2',
    ('feedback', None): 'Phase 2',
}

REVERSE_FEEDBACK_MAP: dict[str, str] = {
    'offer': 'Accepted',
    'denied': 'Not good enough',
}
FEEDBACK_FALLBACK = 'On going'

# Largest value NUMERIC(10,2) (applications.salary_offer) can hold.
_LEGACY_SALARY_LIMIT = '100000000'

# The 9 currencies the pre-R1 release knows (decision (c) union's first half).
CURRENCIES_KNOWN = (
    'USD',
    'BRL',
    'EUR',
    'GBP',
    'CAD',
    'AUD',
    'JPY',
    'CHF',
    'INR',
)

SALARY_PERIOD_ADDED = 'ANNUALLY'
SALARY_PERIOD_LEGACY = 'ANNUAL'

_STEP_TRIGGER = 'trg_application_steps_sync'
_APP_TRIGGER = 'trg_applications_finalize_sync'
_STEP_FUNCTION = 'timeline_events_sync_application_step'
_APP_FUNCTION = 'timeline_events_sync_application_finalize'

# R1's own revision ``Create Date`` - see "Reconcile design" in the
# docstring above for why this, and only this, is used as the cutover.
_R1_MIGRATION_RAN_AT = datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc)


def _quote(value: str | None) -> str:
    if value is None:
        return 'NULL'
    return "'" + value.replace("'", "''") + "'"


def _in_list(values: Sequence[str]) -> str:
    return ', '.join(_quote(value) for value in values)


def _offer_amount_sql(amount: str, cur: str, period: str) -> str:
    """Decision (b): the amount only when all three are there, else 0."""
    return (
        f'CASE WHEN {amount} IS NOT NULL AND {cur} IS NOT NULL '
        f'AND {period} IS NOT NULL THEN {amount} ELSE 0 END'
    )


def _offer_currency_sql(cur: str) -> str:
    return f"COALESCE({cur}, '{OFFER_DEFAULT_CURRENCY}'::currency)"


def _offer_period_sql(period: str) -> str:
    return f"COALESCE({period}, '{OFFER_DEFAULT_PERIOD}'::salaryperiod)"


def _latest_order(alias: str) -> str:
    """Latest first: ``(event_date, start_time NULLS FIRST, id)`` reversed."""
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


def _reverse_step_name_sql(event_type: str, interview_type: str) -> str:
    branches = []
    for (kind, interview), name in REVERSE_STEP_MAP.items():
        interview_test = (
            f'{interview_type} IS NULL'
            if interview is None
            else f"{interview_type} = '{interview}'"
        )
        branches.append(
            f"WHEN {event_type} = '{kind}' AND {interview_test} "
            f'THEN {_quote(name)}'
        )
    return 'CASE ' + ' '.join(branches) + " ELSE 'Phase 2' END"


def _reverse_step_id_sql(event_type: str, interview_type: str) -> str:
    """One steps_definition.id per pair, never NULL while the catalog has
    a row: by name, else by mapping, else the first non-strict row."""
    name = _reverse_step_name_sql(event_type, interview_type)
    return f"""COALESCE(
        (SELECT d.id FROM steps_definition d
          WHERE d.name = {name} ORDER BY d.id LIMIT 1),
        (SELECT d.id FROM steps_definition d
          WHERE d.event_type = {event_type}
            AND d.interview_type IS NOT DISTINCT FROM {interview_type}
          ORDER BY d.id LIMIT 1),
        (SELECT d.id FROM steps_definition d
          ORDER BY d.strict, d.id LIMIT 1)
    )"""


def _feedback_id_sql(event_type: str) -> str:
    branches = ' '.join(
        f"WHEN {event_type} = '{kind}' THEN {_quote(name)}"
        for kind, name in REVERSE_FEEDBACK_MAP.items()
    )
    name = f'CASE {branches} ELSE {_quote(FEEDBACK_FALLBACK)} END'
    return f"""COALESCE(
        (SELECT f.id FROM feedbacks_definition f
          WHERE f.name = {name} ORDER BY f.id LIMIT 1),
        (SELECT f.id FROM feedbacks_definition f
          WHERE f.name = {_quote(FEEDBACK_FALLBACK)} ORDER BY f.id LIMIT 1),
        (SELECT f.id FROM feedbacks_definition f ORDER BY f.id LIMIT 1)
    )"""


# --------------------------------------------------------------------------
# Trigger bodies, byte-identical to ``afd4074c70c2`` - dropped by upgrade(),
# recreated by downgrade().
# --------------------------------------------------------------------------

_STEP_FUNCTION_SQL = f"""
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

_APP_FUNCTION_SQL = f"""
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

_CREATE_TRIGGERS_SQL = (
    f'CREATE TRIGGER {_STEP_TRIGGER} '
    'AFTER INSERT OR UPDATE OR DELETE ON application_steps '
    f'FOR EACH ROW EXECUTE FUNCTION {_STEP_FUNCTION}()',
    f'CREATE TRIGGER {_APP_TRIGGER} '
    'BEFORE UPDATE OF feedback_id, feedback_date, salary_offer, currency, '
    'salary_period ON applications '
    f'FOR EACH ROW EXECUTE FUNCTION {_APP_FUNCTION}()',
)


# --------------------------------------------------------------------------
# upgrade() pieces
# --------------------------------------------------------------------------

_RECONCILE_SQL = f"""
    WITH candidates AS (
        SELECT
            s.id, s.application_id, s.user_id, s.step_date, s.start_time,
            s.end_time, s.timezone, s.observation, s.created_at, s.updated_at,
            COALESCE(d.event_type, '{STEP_FALLBACK[0]}'::event_type)
                AS event_type,
            CASE
                WHEN d.event_type IS NULL
                THEN {_quote(STEP_FALLBACK[1])}::interview_type
                ELSE d.interview_type
            END AS interview_type
        FROM application_steps s
        JOIN steps_definition d ON d.id = s.step_id
        WHERE NOT EXISTS (
            SELECT 1 FROM timeline_events t WHERE t.id = s.id
        )
        AND s.created_at > TIMESTAMPTZ '{_R1_MIGRATION_RAN_AT.isoformat()}'
    )
    INSERT INTO timeline_events (
        id, application_id, user_id, event_type, interview_type,
        event_date, start_time, end_time, timezone, observation,
        salary_amount, salary_currency, salary_period, created_at, updated_at
    )
    SELECT
        c.id, c.application_id, c.user_id, c.event_type,
        CASE
            WHEN c.event_type <> 'interview' THEN NULL
            WHEN c.interview_type = 'initial_screening' AND EXISTS (
                SELECT 1 FROM timeline_events t2
                 WHERE t2.application_id = c.application_id
                   AND t2.interview_type = 'initial_screening'
            ) THEN 'unknown'::interview_type
            ELSE COALESCE(c.interview_type, 'unknown'::interview_type)
        END,
        c.step_date, c.start_time, c.end_time, c.timezone, c.observation,
        CASE WHEN c.event_type = 'offer' THEN
            {_offer_amount_sql('a.salary_offer', 'a.currency', 'a.salary_period')}
        END,
        CASE WHEN c.event_type = 'offer'
             THEN {_offer_currency_sql('a.currency')} END,
        CASE WHEN c.event_type = 'offer'
             THEN {_offer_period_sql('a.salary_period')} END,
        COALESCE(c.created_at, now()), c.updated_at
    FROM candidates c
    JOIN applications a ON a.id = c.application_id
    ON CONFLICT (id) DO NOTHING
"""

_RENAME_LEGACY_COLUMNS = (
    ('last_step_id', 'last_step_id_old'),
    ('last_step_date', 'last_step_date_old'),
    ('feedback_id', 'feedback_id_old'),
    ('feedback_date', 'feedback_date_old'),
    ('salary_offer', 'salary_offer_old'),
)

_LEGACY_FK_RENAMES = (
    ('fk_applications_last_step_id', 'fk_applications_last_step_id_old'),
    ('fk_applications_feedback_id', 'fk_applications_feedback_id_old'),
)

_STEP_TABLE_CONSTRAINT_RENAMES = (
    ('pk_steps', 'pk_steps_old'),
    ('fk_application_steps_user_id', 'fk_application_steps_user_id_old'),
    ('fk_steps_application_id', 'fk_steps_application_id_old'),
    ('fk_steps_step_id', 'fk_steps_step_id_old'),
)

_SALARY_PERIOD_TABLES = ('applications', 'users', 'timeline_events')


def upgrade() -> None:
    # -- 1. No concurrent write to either table races the copy/rename below.
    op.execute(
        'LOCK TABLE application_steps, applications IN SHARE ROW EXCLUSIVE MODE'
    )

    # -- 2. Reconcile: old-code writes the trigger failed to sync. See the
    #       "Reconcile design" section of the module docstring.
    op.execute(sa.text(_RECONCILE_SQL))

    # -- 3. The transitional triggers have no purpose once nothing writes
    #       application_steps any more.
    op.execute(f'DROP TRIGGER IF EXISTS {_APP_TRIGGER} ON applications')
    op.execute(f'DROP TRIGGER IF EXISTS {_STEP_TRIGGER} ON application_steps')
    op.execute(f'DROP FUNCTION IF EXISTS {_APP_FUNCTION}()')
    op.execute(f'DROP FUNCTION IF EXISTS {_STEP_FUNCTION}()')

    # -- 4. application_steps -> application_steps_old, PK/FKs renamed too.
    op.rename_table('application_steps', 'application_steps_old')
    for old_name, new_name in _STEP_TABLE_CONSTRAINT_RENAMES:
        op.execute(
            f'ALTER TABLE application_steps_old '
            f'RENAME CONSTRAINT {old_name} TO {new_name}'
        )

    # -- 5. The five applications columns -> *_old, FKs renamed too.
    for old_name, new_name in _LEGACY_FK_RENAMES:
        op.execute(
            f'ALTER TABLE applications RENAME CONSTRAINT {old_name} '
            f'TO {new_name}'
        )
    for old_name, new_name in _RENAME_LEGACY_COLUMNS:
        op.alter_column('applications', old_name, new_column_name=new_name)

    # -- 6. Decision (c): ANNUAL -> ANNUALLY, rows only, on every table that
    #       carries the column.
    for table in _SALARY_PERIOD_TABLES:
        op.execute(
            f"UPDATE {table} SET salary_period = '{SALARY_PERIOD_ADDED}' "
            f"WHERE salary_period = '{SALARY_PERIOD_LEGACY}'"
        )


# --------------------------------------------------------------------------
# downgrade() pieces - once the renames are reversed, these are R1's own
# downgrade pieces (``afd4074c70c2``), duplicated verbatim: after the rename
# the schema names are R1's again, and R1's recompute logic already does
# exactly what a downgrade to R1's schema needs.
# --------------------------------------------------------------------------

# Events that are not steps and were not R1's synthetic terminal event
# (id = application id): written by Release C since this revision's upgrade.
_C_EVENT_FILTER = """
    NOT EXISTS (SELECT 1 FROM application_steps s WHERE s.id = e.id)
    AND e.id <> e.application_id
"""

_EDITED_FILTER = """
    e.updated_at IS NOT NULL
    AND (s.updated_at IS NULL OR e.updated_at > s.updated_at)
"""

_TOUCHED_SQL = f"""
    CREATE TEMPORARY TABLE timeline_downgrade_touched
    ON COMMIT DROP AS
    SELECT e.application_id FROM timeline_events e WHERE {_C_EVENT_FILTER}
    UNION
    SELECT e.application_id FROM timeline_events e
      JOIN application_steps s ON s.id = e.id
     WHERE {_EDITED_FILTER}
    UNION
    SELECT a.id FROM applications a
     WHERE (a.finalized_at IS NULL) <> (a.feedback_id IS NULL)
"""

_SYNC_EDITS_SQL = f"""
    UPDATE application_steps s SET
        step_id = CASE
            WHEN d.event_type = e.event_type
             AND d.interview_type IS NOT DISTINCT FROM e.interview_type
            THEN s.step_id
            ELSE {_reverse_step_id_sql('e.event_type', 'e.interview_type')}
        END,
        step_date = e.event_date,
        start_time = e.start_time,
        end_time = e.end_time,
        timezone = e.timezone,
        observation = e.observation,
        updated_at = e.updated_at
    FROM timeline_events e, steps_definition d
    WHERE e.id = s.id AND d.id = s.step_id AND {_EDITED_FILTER}
"""

_COPY_BACK_SQL = f"""
    INSERT INTO application_steps (
        id, application_id, step_id, step_date, start_time, end_time,
        timezone, observation, user_id, created_at, updated_at
    )
    SELECT
        e.id, e.application_id,
        {_reverse_step_id_sql('e.event_type', 'e.interview_type')},
        e.event_date, e.start_time, e.end_time, e.timezone, e.observation,
        e.user_id, e.created_at, e.updated_at
    FROM timeline_events e
    WHERE {_C_EVENT_FILTER}
"""

_LATEST_EVENT_SQL = f"""
    SELECT DISTINCT ON (e.application_id)
        e.application_id, e.id, e.event_type, e.interview_type,
        e.event_date
    FROM timeline_events e
    ORDER BY e.application_id, {_latest_order('e')}
"""

_CLOSED_WITHOUT_FEEDBACK_SQL = f"""
    UPDATE applications a SET
        feedback_id = {_feedback_id_sql('latest.event_type')},
        feedback_date = (a.finalized_at AT TIME ZONE 'UTC')::date
    FROM ({_LATEST_EVENT_SQL}) latest
    WHERE latest.application_id = a.id
      AND a.finalized_at IS NOT NULL
      AND a.feedback_id IS NULL
"""

_CLOSED_WITHOUT_EVENT_SQL = f"""
    UPDATE applications a SET
        feedback_id = {_feedback_id_sql('NULL')},
        feedback_date = (a.finalized_at AT TIME ZONE 'UTC')::date
    WHERE a.finalized_at IS NOT NULL
      AND a.feedback_id IS NULL
"""

_REOPENED_SQL = """
    UPDATE applications
       SET feedback_id = NULL, feedback_date = NULL
     WHERE finalized_at IS NULL AND feedback_id IS NOT NULL
"""

_LAST_STEP_SQL = f"""
    UPDATE applications a SET
        last_step_id = latest.step_id,
        last_step_date = latest.event_date
    FROM timeline_downgrade_touched touched
    LEFT JOIN (
        SELECT l.application_id, l.event_date,
            COALESCE(
                (SELECT s.step_id FROM application_steps s
                  WHERE s.id = l.id),
                {_reverse_step_id_sql('l.event_type', 'l.interview_type')}
            ) AS step_id
        FROM ({_LATEST_EVENT_SQL}) l
    ) latest ON latest.application_id = touched.application_id
    WHERE a.id = touched.application_id
"""

# The Denied-with-salary guard: only fills salary_offer when it is currently
# NULL, so a legacy value the timeline cannot reproduce is never overwritten
# (module docstring, "Denied-with-salary").
_RESTORE_SALARY_SQL = f"""
    UPDATE applications a SET
        salary_offer = offer.salary_amount,
        currency = COALESCE(a.currency, offer.salary_currency),
        salary_period = COALESCE(a.salary_period, offer.salary_period)
    FROM timeline_downgrade_touched touched,
    (
        SELECT DISTINCT ON (e.application_id)
            e.application_id, e.salary_amount, e.salary_currency,
            e.salary_period
        FROM timeline_events e
        WHERE e.event_type = 'offer'
        ORDER BY e.application_id, {_latest_order('e')}
    ) offer
    WHERE a.id = touched.application_id
      AND offer.application_id = a.id
      AND a.salary_offer IS NULL
      AND offer.salary_amount > 0
      AND offer.salary_amount < {_LEGACY_SALARY_LIMIT}
      AND offer.salary_currency::text IN ({_in_list(CURRENCIES_KNOWN)})
      AND (a.currency IS NULL OR a.currency = offer.salary_currency)
      AND (a.salary_period IS NULL
           OR a.salary_period = offer.salary_period
           OR (a.salary_period::text IN ('{SALARY_PERIOD_LEGACY}',
                                         '{SALARY_PERIOD_ADDED}')
               AND offer.salary_period::text IN ('{SALARY_PERIOD_LEGACY}',
                                                 '{SALARY_PERIOD_ADDED}')))
"""


def downgrade() -> None:
    # -- 1. Renames, reversed - application_steps and its constraints first.
    for old_name, new_name in _STEP_TABLE_CONSTRAINT_RENAMES:
        op.execute(
            f'ALTER TABLE application_steps_old '
            f'RENAME CONSTRAINT {new_name} TO {old_name}'
        )
    op.rename_table('application_steps_old', 'application_steps')

    # -- 2. The five applications columns, and their FKs.
    for old_name, new_name in _RENAME_LEGACY_COLUMNS:
        op.alter_column('applications', new_name, new_column_name=old_name)
    for old_name, new_name in _LEGACY_FK_RENAMES:
        op.execute(
            f'ALTER TABLE applications RENAME CONSTRAINT {new_name} '
            f'TO {old_name}'
        )

    # -- 3. Every application/event Release C touched since the upgrade,
    #       recomputed exactly as R1's own downgrade recomputes it.
    op.execute(sa.text(_TOUCHED_SQL))
    op.execute(sa.text(_SYNC_EDITS_SQL))
    op.execute(sa.text(_COPY_BACK_SQL))
    op.execute(sa.text(_CLOSED_WITHOUT_FEEDBACK_SQL))
    op.execute(sa.text(_CLOSED_WITHOUT_EVENT_SQL))
    op.execute(sa.text(_REOPENED_SQL))
    op.execute(sa.text(_LAST_STEP_SQL))
    op.execute(sa.text(_RESTORE_SALARY_SQL))

    # -- 4. ANNUALLY -> ANNUAL, rows only, safe unconditionally (see the
    #       module docstring).
    for table in _SALARY_PERIOD_TABLES:
        op.execute(
            f"UPDATE {table} SET salary_period = '{SALARY_PERIOD_LEGACY}' "
            f"WHERE salary_period = '{SALARY_PERIOD_ADDED}'"
        )

    # -- 5. The triggers, last, byte-identical to R1's.
    op.execute(sa.text(_STEP_FUNCTION_SQL))
    op.execute(sa.text(_APP_FUNCTION_SQL))
    for statement in _CREATE_TRIGGERS_SQL:
        op.execute(sa.text(statement))
