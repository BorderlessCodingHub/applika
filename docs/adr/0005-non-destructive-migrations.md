# ADR-0005: Non-destructive, downgradable migrations with `_old` renames

**Status:** Accepted by LuisMSoares on 2026-09-16 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

Applika is in production. The owner: "create donwgradable migrations, never delete a column in the
database when upgrading, change the column name to an older version and only copy/migrate the
data". Product and schema convergence (ADR-0007) and replacing steps with a timeline change the schema
many times.

Today: 14 revisions in `backend/migrations/versions/`, all with `downgrade()`. Revision
`a33d23ad4276` dropped `applications.last_step` in an upgrade. Renames already happened in
`8ed990326196` (table) and `b2c3d4e5f6a1` (column). Tests build the schema with `create_all`
(`backend/tests/conftest.py`), so no migration is tested.

## Decision

- Every revision has a working `downgrade()`.
- An upgrade never drops a column and never drops a table.
- A retired column or table is renamed with the suffix `_old`, and its data is copied into the new
  structure in the same revision.
- The downgrade renames `_old` back and restores the data from the copy.
- No column shrinks. `applications.link_to_job` stays at 2083.
- Application code never reads an `_old` object.
- Every new revision has an upgrade, downgrade, upgrade test with data assertions.
- Enforced by `.claude/rules/non-destructive-migrations.md` and `.claude/rules/migration-tests.md`.

## Consequences

- The database grows with `_old` columns and tables. Removing them is a later, explicit decision.
- A rollback is `alembic downgrade` plus the previous image (`.claude/rules/prod-release-runbook.md`).
- Constraints added by the new model (for example the offer salary CHECK) must accept or transform
  legacy rows before they apply.
- Test infrastructure must run the real Alembic chain for migration tests.

## Non-goals

- Cleaning up `_old` objects.
- Rewriting historical revisions.

## Settled

- `_old` purge. Owner: "_old can be deleted in the future". Deleting `_old` objects is allowed
  later, as its own explicit change; never as part of the upgrade that creates them.
