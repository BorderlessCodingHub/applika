"""timeline events contract: retire application_steps and the legacy
applications columns to ``_old``, drop the R1/R3 sync triggers, remap
``ANNUAL`` -> ``ANNUALLY`` (R2)

Revision ID: ad747aba90fc
Revises: c8b3e9f4a1d6
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

**Re-parented by KODI-014 (R3, ``c8b3e9f4a1d6``).** The owner folded R3
("denied_reason on timeline_events") into Release A, so the chain is now
R1 (``afd4074c70c2``) -> R3 (``c8b3e9f4a1d6``) -> R2 (this revision), not
R1 -> R2 directly. R2's own logic (the renames, the row remap, the "no
reconcile" design) is unaffected — R3 only added a column, an enum and a
CHECK to ``timeline_events``, none of which R2 renames or touches. The one
place this re-parenting changes R2's own behaviour is the sync-trigger
recreation in ``downgrade()``: see "R3's trigger bodies, not R1's" below.

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
2. **No reconcile copy** — the plan's ``## Data`` text calls for one
   ("reconcile copy (same insert, no-op normally)"); this revision does not
   ship one. See "Reconcile design (why there is no reconcile)" below for
   why, and the open question it raises for the owner.
3. Drop the two transitional sync triggers and their functions
   (``trg_application_steps_sync``, ``trg_applications_finalize_sync``,
   ``timeline_events_sync_application_step``,
   ``timeline_events_sync_application_finalize`` — R3's versions since the
   re-parenting, denied-reason-aware, but the same names R1 first created
   them with). Nothing after this point writes ``application_steps``
   (Release C never does), so the triggers no longer have a purpose;
   ``downgrade()`` recreates them, because a further downgrade to the R3
   schema needs a working sync while a pre-Release-B image could still be
   running against it (unlikely, but the rollback contract in
   ``prod-release-runbook.md`` promises the previous release's data, not the
   previous release's code path never running again).
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

## R3's trigger bodies, not R1's (KODI-014 re-parenting)

Before the re-parenting, R2's ``downgrade()`` recreated the two sync trigger
functions byte-identical to R1's own bodies, because a downgrade to
``afd4074c70c2`` put the schema back in exactly R1's shape. Now that R3 sits
between R1 and R2, downgrading R2 lands on **R3's** schema
(``timeline_events.denied_reason`` and its CHECK are still there — R3 is
untouched by this revision's downgrade), not R1's. Recreating R1's
plain bodies there would leave a live gap: an old-code step insert/update
the sync turns into a ``denied`` event would ``INSERT`` a row with
``denied_reason`` left at its column default (``NULL``), which violates
``ck_timeline_events_denied_reason`` — caught by the trigger's own
``EXCEPTION WHEN OTHERS THEN RAISE WARNING`` catch-all (the write itself
never fails), but the event would then simply never sync, silently losing
every denied sync for as long as the rollback lasts. ``_STEP_FUNCTION_SQL``
and ``_APP_FUNCTION_SQL`` below are therefore copied from R3
(``c8b3e9f4a1d6``), not from R1 — a revision must not import another
revision, so this is a byte-for-byte duplicate, pinned against R3's own
copies by
``test_duplicated_constants_match_revision_c8b3e9f4a1d6_and_step_
translation`` in the round-trip test (renamed from the R1-pinning test the
re-parenting replaces). Every other constant this revision copies
(``REVERSE_STEP_MAP``, ``STEP_FALLBACK``, the offer-salary helpers, ...)
still comes from R1: R3 never touched any of them, only the trigger bodies
changed.

## Reconcile design (why there is no reconcile)

R1's ``trg_application_steps_sync`` only ever pushed data one way,
``application_steps`` -> ``timeline_events``, and Release B/C never writes
``application_steps`` at all. So between the moment R1's migration ran in
production and the moment this revision runs, two very different things can
put an ``application_steps`` row and a ``timeline_events`` row out of sync,
and they are indistinguishable from the data alone:

* an **old-code write the trigger failed to sync** — a step insert by the
  still-running previous release whose trigger-fired sync fails (its own
  catch-all ``EXCEPTION WHEN OTHERS THEN RAISE WARNING`` — the write itself
  must never fail, so it already logged a ``WARNING`` at the moment it
  happened): the step exists in ``application_steps`` with no matching
  ``timeline_events`` row. A failed *update* sync is a variant of the same
  problem one level down — it leaves a stale, out-of-date
  ``timeline_events`` row rather than a missing one, which this revision
  does not try to fix either, for the identical reason below: it cannot
  tell "the trigger failed to carry this edit forward" from "a Release B/C
  user edited the event on the new code afterwards, correctly, and the step
  row simply never saw it" (``application_steps`` is dead weight for every
  release since Release B; only the timeline is ever edited again).
  ``trg_applications_finalize_sync`` has the same catch-all and the same
  reasoning applies to a failed finalize sync: a legacy finalize whose sync
  failed looks exactly like a Release B/C reopen from the data alone, so it
  is not distinguished either.
* a **Release B/C deletion** — a user on the new code deletes a timeline
  event that happened to have been migrated from, or itself written as, a
  step-shaped id. Release B/C never touches ``application_steps``, so the
  now-orphaned step row sits there, looking exactly like an unsynced
  old-code write: a row in ``application_steps`` with no matching
  ``timeline_events`` row.

An earlier draft of this revision tried to split the two by
``application_steps.created_at``, on the theory that every row R1's backfill
saw got synced unconditionally, so a row created *after* R1's migration ran
could only be an unsynced old-code write. **That theory is wrong, and
QA caught it with a reproduction before this shipped.** The previous
release's code does not stop writing ``application_steps`` the instant R1's
migration commits — it keeps running, and keeps writing steps the trigger
syncs *successfully*, for the whole stretch between the migration and the
owner deploying the next release's image (``prod-release-runbook.md``: image
deploy and migration are two separate, manually-sequenced steps; there is no
fixed window). Any one of those successfully-synced, switch-over-era steps
can then have its migrated event deleted by a Release B/C user, and it is
now indistinguishable — by ``created_at``, by id ordering, or by any other
column ``application_steps`` carries — from a step whose sync genuinely
failed. A reconcile keyed on "created after some cutover" therefore
resurrects exactly the ordinary case of "a user deleted an event", which is
common, and only protects against "the trigger failed", which is rare and
already recoverable (the row is never lost — it stays in
``application_steps_old``, and R1's own ``RAISE WARNING`` already told an
operator it happened, at the time it happened).

**There is no stored marker in the database, at any point in this migration
chain, that separates the two cases**, and adding one now would not help
retroactively: R1 (``afd4074c70c2``) has not run in any environment other
than this branch as of this revision (unlike Release A/B, "R1 has shipped"
is aspirational in this repository's actual history, not a fact this
revision can rely on), so amending R1 to record failed-sync ids *is* still
technically possible without breaking rule 1 of
``non-destructive-migrations.md`` (precedent: ``f2a9c1d4b6e8`` was amended in
place before it ever ran anywhere) — but it changes a different ticket's
migration (KODI-010) and trades one guarantee (R-015, a rare trigger-failure
case) against another (a user's delete staying deleted), which is the
owner's call, not an engineering one to make silently mid-slice.

**Decision shipped here: no reconcile.** ``upgrade()`` does not copy
anything from ``application_steps`` into ``timeline_events``. Every step the
trigger *did* sync (the overwhelming majority of any switch-over write,
successful by design) is already in ``timeline_events`` and this revision
does not touch it. A step whose trigger-fired sync genuinely failed — an
exceptional case R1 already logs synchronously — is not brought into the
timeline by this revision; it is not lost either, it stays fully intact and
queryable in ``application_steps_old`` for a manual, one-off backfill if the
owner ever needs it. ``test_timeline_contract_migration.py``'s
``test_upgrade_never_resurrects_orphaned_application_steps_rows`` pins both
cases side by side: an unsynced old-code row and a step whose migrated event
was deleted are treated identically — neither is copied.

**Open question for the owner** (not blocking this revision, since the
alternative it weighs against — resurrecting deleted data — is strictly
worse): should a follow-up amend R1 to record the ids its trigger fails to
sync, so a future reconcile could safely catch only the genuine-failure case?
Given R1 has not reached production, this is possible without violating the
non-destructive-migrations rule, but it is a decision about R-015's exact
guarantee versus engineering cost for what R1's own design already treats as
an exceptional, logged event — the owner's call.

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
timeline event, exactly the way R1's downgrade recomputes them (that part is
unaffected by the KODI-014 re-parenting: R3 does not touch any of the legacy
``applications`` columns or ``application_steps``), because after this
downgrade the schema **is** R3's schema (``afd4074c70c2`` -> ``c8b3e9f4a1d6``
-> here) and needs to satisfy the same old code, ``denied_reason`` CHECK
included. ``ANNUALLY`` is remapped back to ``ANNUAL`` on ``applications``,
``users`` and ``timeline_events`` — safe unconditionally (not only for the
rows this revision itself remapped): ``SalaryPeriodType`` already reads both
labels as ``annually`` (see ``app/domain/models.py``), so relabelling a
Release-C-native ``ANNUALLY`` row back to ``ANNUAL`` loses no meaning, and it
keeps the round trip exact without needing to tell "remapped by this
revision" apart from "written natively as ANNUALLY by Release C" — an
ambiguity that, unlike the reconcile's, carries no risk because both labels
mean the same thing to every release that will ever read the row. Both
triggers are recreated last, byte-identical to **R3's** definitions (see
"R3's trigger bodies, not R1's" above).

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

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'ad747aba90fc'
down_revision: Union[str, Sequence[str], None] = 'c8b3e9f4a1d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# --------------------------------------------------------------------------
# Constants and SQL fragments duplicated from ``afd4074c70c2`` (R1). A
# revision must not import another revision, so these are copied, not
# shared, and must stay in lockstep with R1's own copies -
# ``test_duplicated_constants_match_revision_afd4074c70c2_and_step_translation``
# in the round-trip test pins the two against each other and against
# ``app/application/use_cases/compat/step_translation.py``.
#
# The two trigger-body constants (``_STEP_FUNCTION_SQL``, ``_APP_FUNCTION_
# SQL`` below) are the one exception since KODI-014's re-parenting: they are
# copied from R3 (``c8b3e9f4a1d6``), not R1, because ``downgrade()`` recreates
# the triggers on R3's schema now - see "R3's trigger bodies, not R1's" in
# the module docstring.
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

# R3's (``c8b3e9f4a1d6``, KODI-014) denied-reason mapping, duplicated so the
# trigger bodies below stay byte-compatible with R3's. Match by feedback
# *name*, never by id; anything unmapped or missing falls back to
# DENIED_REASON_FALLBACK.
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


def _reason_case_sql(name_expr: str) -> str:
    """``feedbacks_definition.name`` (or NULL) -> a ``denied_reason``
    literal. Identical to R3's own ``_reason_case_sql``."""
    branches = ' '.join(
        f'WHEN {_quote(name)} THEN {_quote(reason)}'
        for name, reason in FEEDBACK_TO_DENIED_REASON.items()
    )
    return (
        f'CASE {name_expr} {branches} ELSE {_quote(DENIED_REASON_FALLBACK)} END'
    )


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
# Trigger bodies, byte-identical to R3's (``c8b3e9f4a1d6``) since KODI-014's
# re-parenting (they were R1's, ``afd4074c70c2``, before it) - dropped by
# upgrade(), recreated by downgrade().
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
    # -- 1. No concurrent write to either table races the rename below.
    op.execute(
        'LOCK TABLE application_steps, applications IN SHARE ROW EXCLUSIVE MODE'
    )

    # -- 2. No reconcile copy - see "Reconcile design (why there is no
    #       reconcile)" in the module docstring.

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

# Scoped to this revision, not R1's identically-shaped
# ``timeline_downgrade_touched``: ``env.py`` wraps every revision a single
# ``alembic downgrade``/``upgrade`` command touches in one outer transaction
# (``context.begin_transaction()`` around the whole ``run_migrations()``
# call, ``transaction_per_migration`` is not set), so ``ON COMMIT DROP``
# only fires once that *outer* transaction commits — not between this
# revision's downgrade and R1's. A single ``downgrade d3f7b1c9e2a4`` from
# head runs this revision's downgrade and then R1's in that same still-open
# transaction; reusing R1's name raised
# ``asyncpg.exceptions.DuplicateTableError`` on R1's own
# ``CREATE TEMPORARY TABLE timeline_downgrade_touched`` because this
# revision's copy was still there, uncommitted. R1 (released as Release A)
# is not touched — only this revision's name changes, plus the explicit
# ``DROP TABLE`` at the end of ``downgrade()`` below, so this revision never
# again depends on an outer-transaction commit boundary it does not control.
_TOUCHED_TABLE = 'timeline_downgrade_touched_ad747aba90fc'

_TOUCHED_SQL = f"""
    CREATE TEMPORARY TABLE {_TOUCHED_TABLE}
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
    FROM {_TOUCHED_TABLE} touched
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
    FROM {_TOUCHED_TABLE} touched,
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

    # -- 5. The triggers, last, byte-identical to R3's.
    op.execute(sa.text(_STEP_FUNCTION_SQL))
    op.execute(sa.text(_APP_FUNCTION_SQL))
    for statement in _CREATE_TRIGGERS_SQL:
        op.execute(sa.text(statement))

    # -- 6. Explicit, rather than relying solely on ON COMMIT DROP: a single
    #       multi-revision ``alembic downgrade``/``upgrade`` command runs
    #       every revision it crosses inside one outer transaction
    #       (``migrations/env.py``), so ON COMMIT DROP only fires once that
    #       whole command commits, not at the end of this revision alone.
    #       Dropping it here — instead of leaving it for a later revision's
    #       downgrade to collide with, as R1's identically-shaped temp table
    #       once did — keeps this revision self-contained regardless of
    #       what runs after it in the same command.
    op.execute(f'DROP TABLE IF EXISTS {_TOUCHED_TABLE}')
