# ADR-0009: CLI compatibility layer for the steps API change

**Status:** Accepted by LuisMSoares on 2026-09-17 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

The owner wants application steps to work as a timeline, served by
`/applications/{id}/timeline` with a reversible finalize with no body. `applika-cli` 0.1.4 on PyPI
calls `/applications/{id}/steps`, `/applications/{id}/steps/{sid}` and
`/applications/{id}/finalize` with `step_id`, `feedback_id`, `finalize_date` and `salary_offer`
(`cli/src/applika/schemas/application_step.py`,
`cli/src/applika/commands/applications/commands.py`). Selected: "Compat layer + new CLI".

## Decision

- The old steps and finalize endpoints stay.
- They translate old requests and responses to and from the timeline model. They are marked
  deprecated.
- They stay for a release window.
- A new CLI version adds timeline commands. The old CLI commands keep working against the API.
- Removing the old endpoints is a later, explicit owner decision in its own ADR.
- Enforced by `.claude/rules/cli-compatibility.md`.

## Consequences

- The translation depends on the step-to-event mapping and the finalize semantics, both still open.
- `/supports` keeps returning steps and feedbacks for old CLI versions while they are supported.
- Tests cover old payloads against the new model.

## Non-goals

- Forcing users to upgrade the CLI.
- Defining the length of the release window.

## Open questions

- Step-to-event mapping and feedback catalog fate (PRD 0000, questions 6 and 7).
- Finalize semantics (PRD 0000, question 8).
- How long is the release window?
