---
PRD: 0008
title: Application steps as a timeline
status: Approved
owner: LuisMSoares
created: 2026-09-15
related-adrs: [0001, 0003, 0004, 0005, 0007, 0009, 0012]
related-prds: [0002-applications-steps-finalize.md, 0003-statistics-reports-cycles.md, 0005-landing-cli.md, 0007-cv-builder.md]
---

# PRD 0008 — Application steps as a timeline

## In the owner's words

Restated, not word for word: application steps change to a timeline model.

Interview types, hard coded (shown only when the step is an interview), so the user can select between initial screening, technical, cultural and some others, with unknown as the default. With this type the current step definitions can be migrated and the statistics per step are kept.

## Clarifications

- Q: Does finalize become reversible or stay like Applika (irreversible)? → A: reversible (Recommended) — finalize sets `finalized_at` with no body; new Reopen clears it; closed = soft lock, archived = hard lock; outcome comes from offer/denied timeline events, so the Offer⇔Accepted rule goes away; old `/finalize` body with step/feedback keeps working via the compatibility layer.
- Q: What happens to the admin-editable step and feedback catalogs? → A: "Retire, keep read-only for compat (Recommended)" — admin step/feedback screens and endpoints removed from UI; `/supports` keeps returning the old lists (frozen) only for installed CLIs; new events use the fixed enum.
- Q: Serving frozen lists would read `_old` tables, which the migration rule forbids. Which gives way? → A: "Don't rename catalogs yet (Recommended)" — `steps_definition` and `feedbacks_definition` keep their names and become read-only; renamed `_old` in the later change that removes the compat layer; the rule stays as written.
- Q: How are dashboard statistics and biweekly reports computed after the switch? → A: event-type metrics, keep past reports (Recommended) — dashboard and new reports use the timeline's event-type rules; already-submitted reports keep stored values, not recomputed; past data shown through the migrated timeline, some charts change shape. Refined by the owner's interview-type addition: per-step statistics stay, computed per interview type plus offer and denied.
- Q: How long do old `/steps` and `/finalize` endpoints stay, and does this feature ship the new CLI? → A: "New CLI in this feature; no removal date (Recommended)" — publish applika-cli 0.2.0 with timeline commands (`applications timeline list/add/edit/delete`, `finalize`, `reopen`); old endpoints stay deprecated with a `Deprecation` header; removal is a separate later decision.
- Q: Which interview types are in the hardcoded list? → A: "7 types (Recommended)" — `unknown` (default), `initial_screening`, `technical`, `cultural`, `hiring_manager`, `take_home` (assessment or case), `final`.
- (2026-09-15) Q: Does an interview of type `unknown` count as an initial screening in biweekly reports? → A: "No, explicit only" — only `initial_screening` counts; strict number; users who never pick a type show 0% callback rate.
- Owner, on data mapping: "to the other 3 is questions to be decided during ticket implementation" — the mapping of every existing step definition, legacy offer salaries without currency or period, and the salary period and currency enum changes are settled during implementation, in the slices named in plan 0008.
- Owner: "_old can be deleted in the future" — deleting `_old` objects is its own later change.
- (2026-09-17) Owner, decision (a): "innitial screen is mapped to initial screening, phase 2, phase 3 and phase 4 is mapped to unknown. one application can only have one interview of type innitial screening, and this is the type counted to the bi-weakly reports." Offer → offer, Denied → denied. Step definitions admins created → interview/unknown ("interview/unknown (Recommended)"). An application migrated with more than one Initial Screen step: "Earliest stays, rest unknown (Recommended)" — the earliest becomes `initial_screening`, later ones `unknown`; from now on a second initial screening on one application is refused.
- (2026-09-17) Owner, decision (b): "the answer to (b) is set to 0" → "Amount becomes 0": a legacy offer salary without currency or period migrates as an offer event with amount 0, missing currency filled with USD and missing period with monthly; the original amount stays in `applications.salary_offer` until R2 renames it `_old`.
- (2026-09-17) Owner, decision (c): currencies grow from applika's 9 to 20. Salary period: "rename to annually and update in cli as well. create a change log file for cli and annotate this change there. Any change in the backend that affects cli must be annotate there, create one changelog for backend too". `annual` becomes `annually`; the API keeps accepting `annual` from `applika-cli` 0.1.4. See `.claude/rules/changelogs.md`.
- (2026-09-18) Q: CLI 0.1.4 `applications edit` sends back the period and currency it read through its strict enum, so it fails on `annually` and on the 11 new currencies. → A: "Bump version to 0.2.0 and change the cli to acomoda-te the new api specs" · "If you already have a ticket to edit the cli, do those changes there, iam asking to bump cli version because I will release the new api version and cli all together". The API returns `annually`; CLI 0.2.0 handles the new specs and ships in the same release as the new API; the 0.1.4 `edit` limitation is recorded in `cli/CHANGELOG.md` (owner-accepted exception to `.claude/rules/cli-compatibility.md` 1).
- (2026-09-18) Q: Old finalize with a salary on a step that is not Offer now gets 422. → A: "Some inputs will only appear if finalization type is offer or denied" → "Finalize picks an outcome": finalize takes an optional outcome (offer, denied or none); the outcome inputs appear only for offer or denied (salary amount, currency and period only for offer); a chosen outcome is recorded as the closing timeline event. The 0.1.4 salary on a non-offer step keeps the 422.

- (2026-09-18) R2 reconcile copy → "Accept, no reconcile (Recommended)": R2 copies nothing; a step whose trigger sync failed stays in `application_steps_old` (logged as a WARNING at write time). CLI 0.2.0 keeps `annual` as an input alias → "Keep annual as an input alias (Recommended)". From the web timeline review: tailored-CV banner reworded to say the application is closed and can be reopened; currencies shown as ISO codes everywhere; the Active stat card counts applications not closed.

- (2026-09-18) Owner: "some things to change, increace the max width of create/edit event to "max-w-3xl", do not display the schedule inputs if i select an event type different from interview, change the timezone from an input to a select and pre filled with the current active timezone in browser, to event type denied, add a select input to select a reason with unknown pre -filled (add some options by yourself or based in the oldes feedback definition values)." Reasons → "Catalog-based list (Recommended)": unknown (default), not_good_enough, skills_mismatch, assessment_failed, too_many_candidates, position_filled, role_closed, ghosted, salary_mismatch, other; migrated denied events take the reason from the application's old feedback. Release → "Fold into Release A (Recommended)": new revision R3 chained R1 → R3 → R2, shipped in Release A. CLI → "Yes, --reason on denied (Recommended)".

- (2026-09-18) Owner: "create an anothet ticket to redesign the /applications page using the reference image @applications.png do as is in the image but keeping the current visual identity in terms of colors". Reference image: `docs/diagrams/0008-applications-page-reference.png`.

- (2026-09-18) Q: A migrated non-interview event with a stored time, edited in the web? → A: "clear it on edit, this must be blocked ever on backend, if event type is different from interview, these attributes must be blocked, you can remove the value in the database as well in case of problems when returning all events in an application (the api must omit the extra attributed to non intervierw type)". Start time, end time and timezone exist only on interview events: the API refuses them on other types, the database forbids them, existing non-interview events lose them in the timeline (the migrated originals stay in `application_steps`, later `application_steps_old`), and responses omit the three fields on non-interview events. Q: Timezone label → "Readable everywhere (Recommended)": cards show `America/Sao Paulo`, the raw IANA id is stored.

## Problem

Applika records progress as steps picked from an admin-edited catalog and closes an application forever with a strict step and a feedback. A wrong finalize cannot be undone, the catalog drifts with admin-created names, and statistics depend on hardcoded names such as "Initial Screen" and "Offer". The owner's design replaces this with one timeline of typed events and a reversible close. Applika is in production and `applika-cli` 0.1.4 users do not upgrade in lockstep, so the change must keep old data, old CLI commands and a working rollback.

## Users and stories

- US1 (P1) A user adds, edits and deletes timeline events (note, interview, feedback, offer, denied) on an open application.
- US2 (P1) A user picks an interview type when the event is an interview, and gets `unknown` when they do not pick.
- US3 (P1) A user closes an application and later reopens it to edit again.
- US4 (P1) A user sees every existing step of every existing application in the timeline after the switch.
- US5 (P1) A user on `applika-cli` 0.1.4 keeps listing, adding, editing and deleting steps and finalizing applications.
- US6 (P2) A user sees dashboard statistics per interview type, offer and denied, and submits biweekly reports computed from the timeline.
- US7 (P2) A user on `applika-cli` 0.2.0 manages the timeline, finalizes and reopens from the terminal.
- US8 (P3) An admin no longer sees step or feedback catalog management.

## Requirements

- R-001 The system stores each application's progress as timeline events of exactly one type: note, interview, feedback, offer or denied.
- R-002 The system stores an interview type on interview events only, from the fixed list unknown, initial screening, technical, cultural, hiring manager, take-home and final, defaulting to unknown.
- R-003 The system refuses an interview type on any event that is not an interview.
- R-004 The system stores an event date, an optional start and end time given together with the end after the start, an optional timezone and an optional observation on every event.
- R-005 The system requires salary amount, currency and period on offer events and refuses them on every other event.
- R-006 The system lets a user list, add, replace and delete the events of their own application.
- R-007 The system closes an application on finalize without asking for a step, feedback or salary, and records when it was closed.
- R-008 The system reopens a closed application on request and makes it editable again.
- R-009 The system treats finalizing a closed application and reopening an open one as no-ops, not errors.
- R-010 The system refuses event changes on a closed application as a conflict that tells the user to reopen it.
- R-011 The system refuses event changes, finalize and reopen on an application archived in a cycle as a business-rule violation, as it does today.
- R-012 The system no longer couples an Offer step to an Accepted feedback.
- R-013 The system shows every step that existed before the switch as a timeline event with its date, times, timezone and observation, and keeps its identifier.
- R-014 The system shows every application finalized before the switch as closed, with its outcome and any offered salary carried on a timeline event.
- R-015 The system keeps steps written by the running old version during the switch-over visible in the timeline.
- R-016 The system keeps the old steps routes working for installed CLIs by translating each old step to an event type and interview type and back, and marks them deprecated.
- R-017 The system keeps the old finalize request with step, feedback, date, salary and observation working for installed CLIs.
- R-018 The system keeps returning the step and feedback lists on the supports route, frozen, for installed CLIs.
- R-019 The system keeps the application fields installed CLIs read: finalized, last step, feedback and salary offer.
- R-020 The system sends a deprecation header on every deprecated route and sets no removal date.
- R-021 The system no longer lets admins create, edit or delete step or feedback definitions.
- R-022 The system computes offers and denials as applications with at least one offer or denied event.
- R-023 The system computes conversion rate and average days per stage, where a stage is each interview type, offer and denied.
- R-024 The system computes new biweekly reports from timeline events, counting initial screenings as applications with at least one interview event of type initial screening only; interviews of type unknown or any other type do not count as initial screenings.
- R-025 The system keeps already submitted biweekly reports exactly as stored.
- R-026 The system lists scheduled timeline events in the user's agenda, as it lists scheduled steps today.
- R-027 The web app shows the timeline, the interview type selector only for interviews, and close and reopen actions with a confirmation that says closing is reversible.
- R-028 `applika-cli` 0.2.0 offers `applications timeline list`, `add` (with `--interview-type`), `edit` and `delete`, `applications finalize` without step or feedback, and `applications reopen`.
- R-029 The system can be rolled back to the previous release with its data at every release of this feature.
- R-030 The system allows at most one interview of type initial screening per application and refuses a second one.
- R-031 The system offers 20 salary currencies (applika's 9 plus 11 more) and the salary periods hourly, monthly and annually, and keeps accepting `annual` from installed CLIs.
- R-032 The system lets the user pick an optional outcome when finalizing (offer, denied or none), shows the outcome inputs only for offer or denied, asks for salary amount, currency and period only for offer, and records the chosen outcome as the closing timeline event.
- R-033 The web create and edit event dialog is `max-w-3xl` wide.
- R-034 The web event form shows the schedule inputs (start time, end time, timezone) only when the event type is interview.
- R-035 The web event form picks the timezone from a select of IANA time zones, pre-filled with the browser's current time zone.
- R-036 The system stores a reason on denied events only, from a fixed list (unknown, not good enough, skills mismatch, assessment failed, too many candidates, position filled, role closed, ghosted, salary mismatch, other), defaulting to unknown; the web shows a reason select pre-filled with unknown and `applika-cli` 0.2.0 offers `--reason` on denied events and denied finalize.
- R-037 The web `/applications` page follows the layout of `docs/diagrams/0008-applications-page-reference.png` element by element, in the current visual identity colors (PRD 0006 / ADR 0006 tokens).
- R-038 The system keeps start time, end time and timezone on interview events only: it refuses them on every other event type, stores none on non-interview events, and omits the three fields from non-interview events in its responses.
- R-039 The web shows time zones in readable form (underscores as spaces) on the timeline cards, as in the timezone select.

## Permissions and tenancy

A user may read, add, replace and delete timeline events only on applications that the user owns, and may finalize and reopen only those applications. An event or application that belongs to another user returns not found, and it is never revealed. The deprecated steps and finalize routes apply exactly the same ownership rules as the timeline routes. Admins may no longer change the step or feedback catalogs; nobody may. Admin statistics that read across users stay admin-only and are computed from timeline events and the closed state.

## Edge cases

- An installed CLI edits a step whose identifier was kept by the migration: it resolves.
- An installed CLI lists steps of an application whose events were created in the web app: every event returns a step name and step identifier.
- An installed CLI finalizes an application that is already closed: refused as a conflict, as today.
- An installed CLI sends a salary offer on a finalize whose step is not an offer: refused.
- A user adds an event on a closed application, reopens it, and adds it again: the second attempt succeeds.
- A closed application is swept into a cycle: it stays closed and becomes read-only forever.
- An offer event is changed to an interview: the salary must be removed in the same change.
- An admin-created step definition name exists in production: it is mapped in the migration, never dropped.
- The old version writes a step after the migration runs and before the new version deploys: it reaches the timeline.
- The new version is rolled back: the old version shows events created by the new version as steps.
- A user never picks an interview type: new reports show 0 initial screenings and a 0% callback rate for that user.
- Migrated steps mapped to interview type unknown do not count as initial screenings in new reports.

## Non-goals

- Removing the deprecated routes, the frozen catalogs, or any `_old` object.
- Other convergence items (ADR-0007): company and platform three-way, cycle metadata, the `/app/*` prefix, an application detail page.
- Forcing CLI users to upgrade.
- Recomputing submitted reports.
- Changing the agenda, cycle archival or report uniqueness rules.

## Success signals

- Every production step and finalized application appears in the timeline after the switch, with counts that match the pre-migration query.
- `applika-cli` 0.1.4 test suite passes against the new API.
- No user reports a lost step or outcome.
- Users reopen closed applications instead of asking for data fixes.

## Assumptions

- Timeline events drop Applika's rule that a step date is not earlier than the application date or the previous step.
- A closed application refuses edits with 409 and an archived one with 422, keeping Applika's codes rather than 409 for both, so installed CLIs and PRD 0007 see no change.
- A new finalize without body answers 200; the old finalize with body keeps 201.
- The feedback name of an old finalize is kept in the observation of the outcome event, since feedbacks no longer exist as data.
- The `feedback` field returned to installed CLIs is empty for applications closed after the switch.
- Interview types are a fixed list owned by code, like event types; this is an Applika addition.
- Users who never pick an interview type see 0 initial screenings in new reports; the web app and CLI do not warn about it.
- The applications list page keeps its layout and hosts the timeline inline; no detail page is added.
- The web app has no translations, so labels are English only.
- CLI 0.2.0 ships after the backend timeline routes are live in production.
