# ADR-0020: Three timeline event types: interview, offer and denied (amends ADR-0012)

**Status:** Accepted (LuisMSoares, 2026-10-17) · **Date:** 2026-10-17 · **Deciders:** LuisMSoares

## Context

PRD 0015. The owner: "i would like to also remove the types "notes" and "feedback", keeping only "interview",
"offer" and "denied"". In the grilling he chose "Convert them" and "Both to interview/unknown (Recommended)",
with the original type kept in an `_old` column so a downgrade restores it. He also said "cli version 1.x.x was
never released, just remove the options to create note and feedback event's". PyPI holds only applika-cli 0.1.1
to 0.1.4, and none of them has timeline commands.

The ADR-0012 Decision says: "Applika adopts a reversible finalize and one `timeline_events` stream (five-value
`event_type`, salary on offer events only)". The image running in production writes `note` and `feedback` until
the new code ships. Migrations run by hand after the automated image deploy
(`.claude/rules/prod-release-runbook.md`), and an upgrade never loses data (ADR-0005).

## Decision

- `timeline_events.event_type` holds one of three values: `interview`, `offer` or `denied`. This replaces
  "five-value `event_type`" in the ADR-0012 Decision. The rest of ADR-0012 stands.
- Every `note` and `feedback` event becomes an `interview` with `interview_type` `unknown`. It keeps its id,
  application, user, date, observation and timestamps.
- The migration that converts the events first copies every row's type to a new column,
  `timeline_events.event_type_old`. No ORM model maps it and no application code reads it. A downgrade puts back
  `note` or `feedback` on every converted row that is still an `interview` of type `unknown` with no schedule. A row
  edited since then keeps its edit.
- The Postgres type `event_type` keeps its five labels, because Postgres cannot drop a label (as with `salaryperiod`
  `ANNUAL`). A new CHECK, `ck_timeline_events_event_type`, allows only the three values.
- Between that migration and the code release, a temporary `BEFORE INSERT OR UPDATE` trigger on `timeline_events`
  converts a `note` or `feedback` written by the older image to `interview`/`unknown`, and records the original
  type in `event_type_old`. The code release drops the trigger. ADR-0012's transitional triggers are the
  precedent.
- The API refuses `note` and `feedback` on create and on update with 422. The web and `applika-cli` offer only the
  three types. No compatibility translation exists for them, because no published CLI sends them.
- The 0.1.4 compatibility layer is unchanged in effect. Notes and feedback were already shown as the step
  "Phase 2", the same step as an interview of type unknown, so every step id a 0.1.4 client reads stays the same.
  The frozen `steps_definition` mapping holds no `note` or `feedback` (revision `afd4074c70c2`). The migration
  refuses to run if one ever appears.
- Statistics, newly computed biweekly reports and the agenda read converted rows as interviews of type unknown.
  Submitted reports stay as stored.

## Consequences

- Note and feedback no longer exist as types anywhere a user can see.
- A former note counts as an unknown interview in the "Unknown" stage, in "interviews completed" on new reports,
  and in the agenda. It never counts as an initial screening. The owner confirms this at PRD 0015 sign-off (R-018).
- Two releases: A is the migration only (conversion, CHECK, trigger), and B is the code plus a migration that drops
  the trigger.
- `event_type_old` stays until the owner orders its deletion (`.claude/rules/non-destructive-migrations.md` rule 9).
- Test schemas built with `create_all` get a three-label type. Only the migration round-trip test sees the
  five-label type.

## Non-goals

- Dropping labels from the Postgres type, or deleting `event_type_old`.
- A new type for free-text notes. The observation field already holds free text on every event.
- Changing the 0.1.4 routes, the frozen catalogs or the 0.1.4 finalize body.
