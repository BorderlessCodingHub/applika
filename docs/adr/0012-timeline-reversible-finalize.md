# ADR-0012: Timeline events, reversible finalize and the steps switch-over

**Status:** Accepted by LuisMSoares on 2026-09-15 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares · **Amended by:** ADR-0020 (three event types)

## Context

The owner orders a new model for application steps, and: "i
would like to create interviews types, hard coded ones (this only appears when the step is an
interview type) ... and use unknown as default. with this type we can migrate current steps
definitions and still have the statistics per steps".

Applika finalizes irreversibly (`feedback_id` set, 409 on retry) and records steps from the
admin-editable `steps_definition` and `feedbacks_definition` catalogs (PRD 0002). The target model is
one `timeline_events` stream with a hardcoded `event_type` and a reversible `finalized_at`. Without
an interview type, reports would count every interview as an initial screening. `applika-cli` 0.1.4
calls the old routes (ADR-0009). Migrations are manual after an automated image deploy
(`.claude/rules/prod-release-runbook.md`), and upgrades never drop data (ADR-0005).

## Decision

- Applika adopts a reversible finalize and one `timeline_events` stream (five-value `event_type`,
  salary on offer events only), with the deltas below.
- Delta 1: interview events carry a hardcoded `interview_type` (unknown, initial_screening,
  technical, cultural, hiring_manager, take_home, final), default `unknown`, null on other types.
  Per-step statistics are kept per interview type plus offer and denied.
- Delta 2: a closed application refuses writes with 409 and an archived one with 422, keeping
  Applika's codes rather than 409 for both.
- Delta 3: the step and feedback catalogs keep their table names, become read-only, and are read
  only by the compatibility layer. They are renamed `_old` in the change that removes that layer.
- The switch ships in three releases: expand (new objects, backfill, transitional database
  triggers that copy old-code writes into the timeline), code (timeline read and write,
  compatibility layer), contract (triggers dropped, retired columns and `application_steps` renamed
  `_old` with a reconciling copy).
- Amends ADR-0009: deprecated routes send a `Deprecation` header, have no removal date, and
  `applika-cli` 0.2.0 ships in this feature.

## Consequences

- Finalize can be undone; the Offer and Accepted coupling disappears.
- Copied events keep their step ids, so installed CLIs keep editing them.
- The step-to-event mapping lives in `steps_definition` columns, filled in the expand release.
- Database triggers exist only between the expand and contract releases.
- Plan 0007's guard for finalized applications must read `finalized_at`.

## Non-goals

- Removing deprecated routes, catalogs or `_old` objects.
- Other convergence items (ADR-0007).

## Open questions

- Step mapping, legacy offer salary, salary period and currency enums: decided during
  implementation (plan 0008, S1).
