"""timeline events expand: timeline_events, finalized_at, step mapping (R1)

Revision ID: afd4074c70c2
Revises: d3f7b1c9e2a4
Create Date: 2026-09-17 12:00:00.000000

Plan ``docs/plan/0008-steps-as-timeline.md`` ``## Data``, revision R1,
ticket KODI-010. Release A of the plan: **expand only**
(``.claude/rules/prod-release-runbook.md`` 4). Nothing under ``app/`` reads or
writes a single object this revision creates; the ORM maps none of them. The
code that uses them ships in Release B, after the owner confirms
``alembic upgrade head`` ran in production.

## Owner decisions, verbatim (PRD 0008 ``## Clarifications``)

- (2026-09-17, KODI-010) Owner, decision (a): "innitial screen is mapped to
  initial screening, phase 2, phase 3 and phase 4 is mapped to unknown. one
  application can only have one interview of type innitial screening, and
  this is the type counted to the bi-weakly reports." Offer → offer, Denied →
  denied. Step definitions admins created → interview/unknown
  ("interview/unknown (Recommended)"). An application migrated with more than
  one Initial Screen step: "Earliest stays, rest unknown (Recommended)" — the
  earliest becomes `initial_screening`, later ones `unknown`; from now on a
  second initial screening on one application is refused.
- (2026-09-17, KODI-010) Owner, decision (b): "the answer to (b) is set to 0"
  → "Amount becomes 0": a legacy offer salary without currency or period
  migrates as an offer event with amount 0, missing currency filled with USD
  and missing period with monthly; the original amount stays in
  `applications.salary_offer` until R2 renames it `_old`.
- (2026-09-17, KODI-010) Owner, decision (c): "(c) is combine from both
  projects" — currencies grow from 9 to 20. Salary
  period: "rename to annually and update in cli as well. create a change log
  file for cli and annotate this change there. Any change in the backend that
  affects cli must be annotate there, create one changelog for backend too".
  `annual` becomes `annually`; the API keeps accepting `annual` from
  `applika-cli` 0.1.4. See `.claude/rules/changelogs.md`.

## What upgrade() does, in order

1. ``currency`` gains the 11 new values (``CURRENCIES_ADDED``) and
   ``salaryperiod`` gains ``ANNUALLY``, with ``ADD VALUE IF NOT EXISTS`` inside
   an autocommit block (``ADD VALUE`` cannot run inside the transaction that
   then uses it, so it goes first). **The labels are upper case** because the
   existing ``salaryperiod`` type stores enum *names* (``HOURLY``,
   ``MONTHLY``, ``ANNUAL``: ``a1b2c3d4e5f6``, and SQLAlchemy's ``sa.Enum``
   writes member names), so ``SalaryPeriod.ANNUALLY = 'annually'`` lands as
   ``ANNUALLY``. No row moves: ``ANNUAL`` rows stay ``ANNUAL`` until R2.
2. ``LOCK TABLE application_steps, applications IN SHARE ROW EXCLUSIVE MODE``:
   the old code cannot write a step or finalize while the copy runs.
3. Types ``event_type`` and ``interview_type``; table ``timeline_events`` with
   both CHECKs, the three plan indexes and the partial unique index
   ``uq_timeline_events_one_initial_screening`` (owner, R-030);
   ``applications.finalized_at``; ``steps_definition.event_type`` and
   ``steps_definition.interview_type``; ``application_steps.timezone`` widened
   from 50 to 100 characters (see "Timezone" below).
4. ``steps_definition`` mapping filled from ``STEP_MAPPING``; every other row
   gets ``STEP_FALLBACK``. Every row resolves non-null.
5. The two transitional sync triggers (below) are created **before** the copy.
6. ``INSERT ... SELECT`` every ``application_steps`` row into
   ``timeline_events`` with its own id, ``ON CONFLICT (id) DO NOTHING``.
   Per application the earliest Initial Screen, ordered by
   ``(step_date, start_time NULLS FIRST, id)``, keeps ``initial_screening``;
   later ones become ``unknown``.
7. A finalized application whose ``last_step_id`` has no step row at all gets
   one **synthetic terminal event** whose id is the application's own id (a
   snowflake the generator never hands to anything else). Without it such an
   application would be closed with no outcome on its timeline (criterion 5).
   The downgrade never copies it back: it was never a step.
8. Offer salary, decision (b), see "Offer salary" below.
9. ``finalized_at = feedback_date 00:00 UTC`` where ``feedback_id`` is set
   (``updated_at``/``created_at`` if a legacy row has no ``feedback_date``).
10. The feedback name is appended to the terminal event's observation as a
    last line ``Feedback: <name>``. The terminal event is the latest event of
    the finalized step (``applications.last_step_id``), else the latest event.

## Offer salary (decision (b) + orchestrator interpretation)

For every offer event: ``salary_currency = COALESCE(applications.currency,
'USD')``, ``salary_period = COALESCE(applications.salary_period, 'MONTHLY')``.
``salary_amount = applications.salary_offer`` only on the **latest** offer
event of the application (``event_date, start_time NULLS FIRST, id``) and
only when ``salary_offer``, ``currency`` and ``salary_period`` are all set;
every other offer event gets 0. So a salary without currency or period is 0
(decision (b)), an Offer step on an application with no ``salary_offer`` at
all is 0 (the offer CHECK needs all three), and a salary is never duplicated
across several Offer steps. The original stays in
``applications.salary_offer``, untouched. Existing ``ANNUAL`` periods are
carried as ``ANNUAL``.

## Transitional sync triggers (dropped by R2, KODI-013)

Release A runs the old code on this schema, and so does the window between
the image deploy and the owner's manual migration. PRD R-015: whatever the old
code writes must stay visible in the timeline. Both trigger bodies run inside
``BEGIN ... EXCEPTION WHEN OTHERS THEN RAISE WARNING`` so **a trigger can
never make an old-code write fail**; worst case the event is missing and a
warning is logged (R2 starts with a reconcile copy).

- ``trg_application_steps_sync`` — AFTER INSERT/UPDATE/DELETE on
  ``application_steps``, per row. Insert/update upserts the same id into
  ``timeline_events`` with the type of ``steps_definition.event_type`` /
  ``interview_type``; a definition created by the old admin code after this
  revision has NULL mapping and falls back to ``STEP_FALLBACK``. A second
  ``initial_screening`` on the application (insert, or an update that changes
  ``step_id``) is written as ``unknown``. An offer event that already existed
  keeps its salary; a new one takes the application's salary per decision
  (b). Delete removes the same id.
- ``trg_applications_finalize_sync`` — BEFORE UPDATE OF ``feedback_id,
  feedback_date, salary_offer, currency, salary_period`` on ``applications``.
  BEFORE rather than the plan's AFTER, so ``finalized_at`` is set on the row
  being written instead of by a second UPDATE of the same row. It sets
  ``finalized_at`` from ``feedback_date`` (NULL if ``feedback_id`` is
  cleared), appends the feedback name to the terminal event when the
  application gets its feedback, and moves the latest offer event's salary
  from the old row's decision-(b) triple to the new row's — only if that event
  still carries the old triple, so an offer event edited elsewhere is never
  overwritten. The old finalize inserts the Offer step first (0 via decision
  (b)), then writes ``salary_offer``, which is what moves the real amount.

## Reverse maps (used by downgrade(), looked up by name, never by id)

``REVERSE_STEP_MAP``: ``interview/initial_screening`` → "Initial Screen";
every other interview type → "Phase 2"; ``offer`` → "Offer"; ``denied`` →
"Denied"; ``note`` and ``feedback`` → "Phase 2" (no seeded row fits better:
the catalog has only Initial Screen, Phase 2-4, Offer and Denied). If a name
is missing, the first row with the same mapping, else the first non-strict
row.

``REVERSE_FEEDBACK_MAP`` for an application closed in Release B without a
feedback: terminal event ``offer`` → "Accepted"; ``denied`` → "Not good
enough" (the only seeded feedback that asserts a rejection without claiming a
specific cause such as "Ghost", "Position filled" or "Role closed");
anything else → "On going". ``feedback_date = finalized_at`` (UTC date).

## What downgrade() does

Triggers and functions go first, so the copy-back does not bounce. Then, for
the events Release B wrote: events with no step row are copied back into
``application_steps`` via ``REVERSE_STEP_MAP`` (the synthetic terminal events
excepted); steps whose event was edited later (``updated_at`` newer) take the
edit, keeping their ``step_id`` when its mapping still matches. For every
application those writes or a close/reopen touched: ``last_step_id`` /
``last_step_date`` from the latest event; ``feedback_id``/``feedback_date``
NULL where ``finalized_at`` is NULL; ``REVERSE_FEEDBACK_MAP`` where closed
without a feedback; ``salary_offer`` (and ``currency``/``salary_period`` when
NULL) from the latest offer event where ``salary_offer`` is NULL, the amount
is positive, fits NUMERIC(10,2) and the currency is one of the 9 the previous
release knows. ``ANNUALLY`` is remapped to ``ANNUAL`` on ``applications`` and
``users``. Events deleted in Release B are **not** deleted from
``application_steps``: a rollback never deletes rows. Application rows the
copy-back did not touch keep every value they had.

What downgrade() leaves behind, on purpose:

- the 11 currencies and ``ANNUALLY``: Postgres cannot remove an enum value;
- ``application_steps.timezone`` stays VARCHAR(100): rule 6, no column
  shrinks, and a B-era event may carry a timezone longer than 50.

## Timezone

``timeline_events.timezone`` is VARCHAR(100) and ``application_steps`` had
VARCHAR(50). Widening the old column here is additive for the old code and is
what lets the downgrade copy any B-era event back.

## non-destructive-migrations.md

``upgrade()`` drops nothing (rule 2) and renames nothing (no ``_old`` object
in R1). ``downgrade()`` works (rule 1), drops only what this revision created
and brings back the data the old release needs (rule 5). No column shrinks
(rule 6). No ORM model maps a new object (rule 7). Enums only gain values
(rule 8).
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'afd4074c70c2'
down_revision: Union[str, Sequence[str], None] = 'd3f7b1c9e2a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

EVENT_TYPES = ('note', 'interview', 'feedback', 'offer', 'denied')
INTERVIEW_TYPES = (
    'unknown',
    'initial_screening',
    'technical',
    'cultural',
    'hiring_manager',
    'take_home',
    'final',
)

# Decision (c). The 9 currencies the previous release knows, and the 11
# added (total = 20).
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
CURRENCIES_ADDED = (
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
)
# ``salaryperiod`` stores member names, upper case (see docstring).
SALARY_PERIOD_ADDED = 'ANNUALLY'
SALARY_PERIOD_LEGACY = 'ANNUAL'

# Decision (b) fill values.
OFFER_DEFAULT_CURRENCY = 'USD'
OFFER_DEFAULT_PERIOD = 'MONTHLY'

# Decision (a): steps_definition.name -> (event_type, interview_type).
STEP_MAPPING: dict[str, tuple[str, str | None]] = {
    'Initial Screen': ('interview', 'initial_screening'),
    'Phase 2': ('interview', 'unknown'),
    'Phase 3': ('interview', 'unknown'),
    'Phase 4': ('interview', 'unknown'),
    'Offer': ('offer', None),
    'Denied': ('denied', None),
}
# Every other (admin-created) definition.
STEP_FALLBACK: tuple[str, str | None] = ('interview', 'unknown')

# (event_type, interview_type) -> steps_definition.name, for the downgrade.
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

# Terminal event_type -> feedbacks_definition.name, for an application closed
# without a feedback (downgrade only).
REVERSE_FEEDBACK_MAP: dict[str, str] = {
    'offer': 'Accepted',
    'denied': 'Not good enough',
}
FEEDBACK_FALLBACK = 'On going'

# Largest value NUMERIC(10,2) (applications.salary_offer) can hold.
_LEGACY_SALARY_LIMIT = '100000000'

_STEP_TRIGGER = 'trg_application_steps_sync'
_APP_TRIGGER = 'trg_applications_finalize_sync'
_STEP_FUNCTION = 'timeline_events_sync_application_step'
_APP_FUNCTION = 'timeline_events_sync_application_finalize'


def _quote(value: str | None) -> str:
    if value is None:
        return 'NULL'
    return "'" + value.replace("'", "''") + "'"


def _in_list(values: Sequence[str]) -> str:
    return ', '.join(_quote(value) for value in values)


# --------------------------------------------------------------------------
# SQL fragments shared by upgrade(), the triggers and downgrade()
# --------------------------------------------------------------------------


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
    """One steps_definition.id per pair, never NULL while the catalog has a
    row: by name, else by mapping, else the first non-strict row."""
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


# --------------------------------------------------------------------------
# upgrade() pieces
# --------------------------------------------------------------------------


def _mapping_update_sql() -> str:
    event_branches = ' '.join(
        f"WHEN {_quote(name)} THEN '{kind}'"
        for name, (kind, _) in STEP_MAPPING.items()
    )
    interview_branches = ' '.join(
        f'WHEN {_quote(name)} THEN {_quote(interview)}'
        for name, (_, interview) in STEP_MAPPING.items()
    )
    fallback_kind, fallback_interview = STEP_FALLBACK
    return f"""
        UPDATE steps_definition SET
            event_type = (CASE name {event_branches}
                          ELSE '{fallback_kind}' END)::event_type,
            interview_type = (CASE name {interview_branches}
                              ELSE {_quote(fallback_interview)}
                              END)::interview_type
    """


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

_BACKFILL_STEPS_SQL = f"""
    WITH mapped AS (
        SELECT
            s.id, s.application_id, s.user_id, s.step_date, s.start_time,
            s.end_time, s.timezone, s.observation, s.created_at,
            s.updated_at,
            COALESCE(d.event_type, '{STEP_FALLBACK[0]}'::event_type)
                AS event_type,
            CASE
                WHEN d.event_type IS NULL
                THEN {_quote(STEP_FALLBACK[1])}::interview_type
                ELSE d.interview_type
            END AS interview_type
        FROM application_steps s
        JOIN steps_definition d ON d.id = s.step_id
    ),
    ranked AS (
        SELECT m.*,
            row_number() OVER (
                PARTITION BY m.application_id,
                    m.interview_type = 'initial_screening'
                ORDER BY m.step_date, m.start_time NULLS FIRST, m.id
            ) AS screening_rank
        FROM mapped m
    )
    INSERT INTO timeline_events (
        id, application_id, user_id, event_type, interview_type,
        event_date, start_time, end_time, timezone, observation,
        salary_amount, salary_currency, salary_period,
        created_at, updated_at
    )
    SELECT
        r.id, r.application_id, r.user_id, r.event_type,
        CASE
            WHEN r.interview_type = 'initial_screening'
             AND r.screening_rank > 1
            THEN 'unknown'::interview_type
            ELSE r.interview_type
        END,
        r.step_date, r.start_time, r.end_time, r.timezone, r.observation,
        CASE WHEN r.event_type = 'offer' THEN 0 END,
        CASE WHEN r.event_type = 'offer'
             THEN {_offer_currency_sql('a.currency')} END,
        CASE WHEN r.event_type = 'offer'
             THEN {_offer_period_sql('a.salary_period')} END,
        r.created_at, r.updated_at
    FROM ranked r
    JOIN applications a ON a.id = r.application_id
    ON CONFLICT (id) DO NOTHING
"""

_BACKFILL_SYNTHETIC_SQL = f"""
    INSERT INTO timeline_events (
        id, application_id, user_id, event_type, interview_type,
        event_date, observation,
        salary_amount, salary_currency, salary_period,
        created_at, updated_at
    )
    SELECT
        a.id, a.id, a.user_id,
        COALESCE(d.event_type, '{STEP_FALLBACK[0]}'::event_type),
        CASE
            WHEN COALESCE(d.event_type, '{STEP_FALLBACK[0]}'::event_type)
                 <> 'interview' THEN NULL
            WHEN d.interview_type = 'initial_screening' AND EXISTS (
                SELECT 1 FROM timeline_events t
                 WHERE t.application_id = a.id
                   AND t.interview_type = 'initial_screening'
            ) THEN 'unknown'::interview_type
            ELSE COALESCE(d.interview_type, 'unknown'::interview_type)
        END,
        COALESCE(a.last_step_date, a.feedback_date, a.created_at::date),
        NULL,
        CASE WHEN d.event_type = 'offer' THEN 0 END,
        CASE WHEN d.event_type = 'offer'
             THEN {_offer_currency_sql('a.currency')} END,
        CASE WHEN d.event_type = 'offer'
             THEN {_offer_period_sql('a.salary_period')} END,
        a.created_at, NULL
    FROM applications a
    JOIN steps_definition d ON d.id = a.last_step_id
    WHERE a.feedback_id IS NOT NULL
      AND NOT EXISTS (
          SELECT 1 FROM application_steps s
           WHERE s.application_id = a.id AND s.step_id = a.last_step_id
      )
    ON CONFLICT (id) DO NOTHING
"""

_BACKFILL_SALARY_SQL = f"""
    UPDATE timeline_events t
       SET salary_amount = a.salary_offer
      FROM applications a
     WHERE a.id = t.application_id
       AND a.salary_offer IS NOT NULL
       AND a.currency IS NOT NULL
       AND a.salary_period IS NOT NULL
       AND t.id = (
           SELECT o.id FROM timeline_events o
            WHERE o.application_id = a.id AND o.event_type = 'offer'
            ORDER BY {_latest_order('o')}
            LIMIT 1
       )
"""

_BACKFILL_FINALIZED_SQL = """
    UPDATE applications
       SET finalized_at = COALESCE(
           feedback_date::timestamp AT TIME ZONE 'UTC',
           updated_at,
           created_at
       )
     WHERE feedback_id IS NOT NULL
"""

_BACKFILL_FEEDBACK_SQL = f"""
    WITH terminal AS (
        SELECT DISTINCT ON (a.id)
            t.id AS event_id, f.name AS feedback_name
        FROM applications a
        JOIN feedbacks_definition f ON f.id = a.feedback_id
        JOIN timeline_events t ON t.application_id = a.id
        LEFT JOIN application_steps s ON s.id = t.id
        ORDER BY a.id,
            (COALESCE(s.step_id, CASE WHEN t.id = a.id
                                      THEN a.last_step_id END)
             IS NOT DISTINCT FROM a.last_step_id) DESC,
            {_latest_order('t')}
    )
    UPDATE timeline_events e
       SET observation = {
    _append_feedback_sql('e.observation', 'terminal.feedback_name')
}
      FROM terminal
     WHERE e.id = terminal.event_id
"""


def upgrade() -> None:
    # -- 1. Decision (c). ADD VALUE cannot share a transaction with its use,
    #       so it runs first, on its own, in autocommit. Values only added.
    with op.get_context().autocommit_block():
        for value in CURRENCIES_ADDED:
            op.execute(f"ALTER TYPE currency ADD VALUE IF NOT EXISTS '{value}'")
        op.execute(
            'ALTER TYPE salaryperiod ADD VALUE IF NOT EXISTS '
            f"'{SALARY_PERIOD_ADDED}'"
        )

    # -- 2. No old-code write lands while the copy runs.
    op.execute(
        'LOCK TABLE application_steps, applications IN SHARE ROW EXCLUSIVE MODE'
    )

    # -- 3. Schema, additive only.
    op.execute(f'CREATE TYPE event_type AS ENUM ({_in_list(EVENT_TYPES)})')
    op.execute(
        f'CREATE TYPE interview_type AS ENUM ({_in_list(INTERVIEW_TYPES)})'
    )
    event_type = postgresql.ENUM(name='event_type', create_type=False)
    interview_type = postgresql.ENUM(name='interview_type', create_type=False)
    op.create_table(
        'timeline_events',
        sa.Column('id', sa.BigInteger(), nullable=False, autoincrement=False),
        sa.Column('application_id', sa.BigInteger(), nullable=False),
        sa.Column('user_id', sa.BigInteger(), nullable=False),
        sa.Column('event_type', event_type, nullable=False),
        sa.Column('interview_type', interview_type, nullable=True),
        sa.Column('event_date', sa.Date(), nullable=False),
        sa.Column('start_time', sa.Time(), nullable=True),
        sa.Column('end_time', sa.Time(), nullable=True),
        sa.Column('timezone', sa.String(100), nullable=True),
        sa.Column('observation', sa.Text(), nullable=True),
        sa.Column('salary_amount', sa.Numeric(12, 2), nullable=True),
        sa.Column(
            'salary_currency',
            postgresql.ENUM(name='currency', create_type=False),
            nullable=True,
        ),
        sa.Column(
            'salary_period',
            postgresql.ENUM(name='salaryperiod', create_type=False),
            nullable=True,
        ),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id', name='pk_timeline_events'),
        sa.ForeignKeyConstraint(
            ['application_id'],
            ['applications.id'],
            name='fk_timeline_events_application_id',
            ondelete='CASCADE',
        ),
        sa.ForeignKeyConstraint(
            ['user_id'],
            ['users.id'],
            name='fk_timeline_events_user_id',
            ondelete='CASCADE',
        ),
        sa.CheckConstraint(
            "(event_type = 'interview' AND interview_type IS NOT NULL) "
            "OR (event_type <> 'interview' AND interview_type IS NULL)",
            name='ck_timeline_events_interview_type',
        ),
        sa.CheckConstraint(
            "(event_type = 'offer' AND salary_amount IS NOT NULL "
            'AND salary_currency IS NOT NULL AND salary_period IS NOT NULL) '
            "OR (event_type <> 'offer' AND salary_amount IS NULL "
            'AND salary_currency IS NULL AND salary_period IS NULL)',
            name='ck_timeline_events_offer_salary',
        ),
    )
    op.create_index(
        'ix_timeline_events_application_id',
        'timeline_events',
        ['application_id'],
    )
    op.create_index(
        'ix_timeline_events_user_id', 'timeline_events', ['user_id']
    )
    op.create_index(
        'ix_timeline_events_user_id_start_time',
        'timeline_events',
        ['user_id', 'start_time'],
    )
    op.create_index(
        'uq_timeline_events_one_initial_screening',
        'timeline_events',
        ['application_id'],
        unique=True,
        postgresql_where=sa.text("interview_type = 'initial_screening'"),
    )
    op.add_column(
        'applications',
        sa.Column('finalized_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        'steps_definition',
        sa.Column('event_type', event_type, nullable=True),
    )
    op.add_column(
        'steps_definition',
        sa.Column('interview_type', interview_type, nullable=True),
    )
    # Widening only (rule 6 forbids the other direction).
    op.alter_column(
        'application_steps',
        'timezone',
        existing_type=sa.String(50),
        type_=sa.String(100),
        existing_nullable=True,
    )

    # -- 4. Decision (a) into the mapping store.
    op.execute(sa.text(_mapping_update_sql()))

    # -- 5. Sync triggers, before the copy.
    op.execute(sa.text(_STEP_FUNCTION_SQL))
    op.execute(sa.text(_APP_FUNCTION_SQL))
    for statement in _CREATE_TRIGGERS_SQL:
        op.execute(sa.text(statement))

    # -- 6-10. Backfill.
    op.execute(sa.text(_BACKFILL_STEPS_SQL))
    op.execute(sa.text(_BACKFILL_SYNTHETIC_SQL))
    op.execute(sa.text(_BACKFILL_SALARY_SQL))
    op.execute(sa.text(_BACKFILL_FINALIZED_SQL))
    op.execute(sa.text(_BACKFILL_FEEDBACK_SQL))


# --------------------------------------------------------------------------
# downgrade() pieces
# --------------------------------------------------------------------------

# Events that are not steps and were not the upgrade's synthetic terminal
# event (id = application id): written by Release B.
_B_EVENT_FILTER = """
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
    SELECT e.application_id FROM timeline_events e WHERE {_B_EVENT_FILTER}
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
    WHERE {_B_EVENT_FILTER}
"""


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
    # -- Triggers first, so nothing below bounces into timeline_events.
    op.execute(f'DROP TRIGGER IF EXISTS {_APP_TRIGGER} ON applications')
    op.execute(f'DROP TRIGGER IF EXISTS {_STEP_TRIGGER} ON application_steps')
    op.execute(f'DROP FUNCTION IF EXISTS {_APP_FUNCTION}()')
    op.execute(f'DROP FUNCTION IF EXISTS {_STEP_FUNCTION}()')

    # -- Which applications Release B changed: only those are recomputed.
    op.execute(sa.text(_TOUCHED_SQL))

    # -- Events back into steps: edits onto their step, new events as new
    #    steps (reverse map). Nothing is deleted from application_steps.
    op.execute(sa.text(_SYNC_EDITS_SQL))
    op.execute(sa.text(_COPY_BACK_SQL))

    # -- Closure: feedback from the terminal event, or cleared if reopened.
    op.execute(sa.text(_CLOSED_WITHOUT_FEEDBACK_SQL))
    op.execute(sa.text(_CLOSED_WITHOUT_EVENT_SQL))
    op.execute(sa.text(_REOPENED_SQL))
    op.execute(sa.text(_LAST_STEP_SQL))
    op.execute(sa.text(_RESTORE_SALARY_SQL))

    # -- The previous release knows ANNUAL, not ANNUALLY: remap the rows.
    #    The label itself stays; Postgres cannot drop an enum value.
    for table in ('applications', 'users'):
        op.execute(
            f"UPDATE {table} SET salary_period = '{SALARY_PERIOD_LEGACY}' "
            f"WHERE salary_period = '{SALARY_PERIOD_ADDED}'"
        )

    # -- Drop only what upgrade() created. Left in place on purpose:
    #    * the 11 currencies and ANNUALLY - Postgres cannot remove an enum
    #      value; the previous release simply never writes them;
    #    * application_steps.timezone VARCHAR(100) - rule 6, no column
    #      shrinks, and copied-back events may need the width.
    op.drop_column('steps_definition', 'interview_type')
    op.drop_column('steps_definition', 'event_type')
    op.drop_column('applications', 'finalized_at')
    op.drop_table('timeline_events')
    op.execute('DROP TYPE IF EXISTS interview_type')
    op.execute('DROP TYPE IF EXISTS event_type')
