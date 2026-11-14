---
PRD: 0015
title: CVs behind a beta flag, and three timeline event types
status: Approved
owner: LuisMSoares
created: 2026-10-17
related-adrs: [0004, 0009, 0012, 0018, 0020, 0021]
related-prds: [0007-cv-builder.md, 0008-steps-as-timeline.md, 0010-application-with-cv-drafts-private-catalogs.md, 0012-job-board-fit-and-keyword-tailoring.md, 0013-beta-features.md]
---

# PRD 0015 — CVs behind a beta flag, and three timeline event types

## In the owner's words

i would like to lock the cv builder and applications cv's in a feature flag just like jobs, sobre event types, i would like to also remove the types "notes" and "feedback", keeping only "interview", "offer" and "denied"

## Clarifications

- Q: What happens to the note and feedback events users already have? (Keep, block new / Hide them in _old / Convert them) → A: "Convert them"
- Q: Into which type do existing note and feedback events convert? → A: "Both to interview/unknown (Recommended)" — every note and feedback event becomes an interview with interview type 'unknown', keeping its date and text; downgrade restores the original type from an _old column.
- Q: How should the CV lock be keyed, and what about users who already built CVs? → A: "One 'cvs' key, enrol owners (Recommended)" — one new FeatureKey 'cvs' gates the builder (/cvs, base-cvs routes) and the application CV routes together; the Release A migration seeds it as beta and adds every user who already owns a base CV or an application CV to its beta list.
- Q: How do published CLI versions handle the removed types (they send 'note'/'feedback')? → A: "cli version 1.x.x was never released, just remove the options to create note and feedback event's"
- Q: Should former notes and feedback count as interviews of type unknown in the dashboard, new reports and the agenda? → A: "Yes, count them (Recommended)"
- Q: ADR-0012 fixes a five-value event_type; how is it resolved? → A: "New ADR amends 0012 (Recommended)" (ADR-0020)
- Q: ADR-0018 says only admins write the beta list; how are existing CV owners enrolled? → A: "New ADR amends 0018 (Recommended)" (ADR-0021)
- Q: How many releases? → A: "Two releases (Recommended)"
- Q: What does the cvs key gate, given drafts need a CV? → A: "cvs gates drafts too (Recommended)"
- (2026-10-17) Q: ADR-0012 decides a five-value event type. How does it change? → A: "New ADR amends 0012 (Recommended)" (ADR-0020).
- (2026-10-17) Q: ADR-0018 says only admins write a beta list, and the beta rule starts every feature with an empty list. How do current CV users keep access? → A: "New ADR amends 0018 (Recommended)" (ADR-0021: a feature that already shipped may be gated later, and its first release fills the list with its current users).
- (2026-10-17) Q: How many releases? → A: "Two releases (Recommended)".
- (2026-10-17) Q: A draft cannot finish without a CV copy. What does "cvs" cover? → A: "cvs gates drafts too (Recommended)" — the new application with CV flow and the Drafts tab; on the job board, "Start application", the master CV invitation and the fit need both "jobs" and "cvs".
- (2026-10-17) Orchestrator, checked on PyPI: only applika-cli 0.1.1 to 0.1.4 were ever published; 0.2.0 and 1.x never were.

## Supersedes

- PRD 0008 R-001 and US1: five event types become three (R-011 here).
- PRD 0013 Non-goal "Gating features that shipped before the job board": no longer holds for CVs (ADR-0021).
- PRD 0013 R-004 "with an empty beta list": the "cvs" list starts with its current users (R-002). The beta rule `.claude/rules/beta-features.md` point 2 ("no beta list row") gets the same exception when ADR-0021 is accepted.
- PRD 0013 R-022 "For a user without "jobs", everything else in Applika works exactly as it did before PRD 0012: applications, drafts, CV copies, …": drafts and CV copies now also need "cvs".

## Problem

Master CVs, CV copies on applications and the new application with CV flow are open to every user. The owner wants them behind a beta flag, like the job board, so he can choose who uses them and release them from the admin area. People who already use CVs must not lose them. The timeline also has two event types the owner no longer wants, note and feedback. Only interview, offer and denied stay, and the events users already wrote must survive the change.

## Users and stories

- US1 (P1) A user who has "cvs" uses master CVs, CV copies and the new application with CV flow exactly as today.
- US2 (P1) A user who already has a master CV or a CV copy when "cvs" arrives keeps using CVs, and nobody has to do anything for that.
- US3 (P1) A user without "cvs" sees no CVs entry, no CV link on an application, no Drafts tab and no "New with CV". The server answers as if those addresses did not exist.
- US4 (P1) A user adds and edits timeline events of three types only: interview, offer and denied.
- US5 (P1) A user's existing notes and feedback appear as interviews of type unknown, with the same date and text.
- US6 (P2) An admin manages "cvs" at /admin/features like "jobs": the beta list, the release to everyone, the move back to beta, and their own opt-out.
- US7 (P2) A user with "jobs" but without "cvs" browses the job board without fit and without starting an application from a job.
- US8 (P3) A user of applika-cli 0.1.4 notices no change.

## Requirements

CVs behind a beta flag
- R-001 The system adds the feature "cvs", named "CV builder", in beta.
- R-002 In the release that adds it, the system puts on the "cvs" beta list every user who owns at least one master CV or one CV copy at that moment. These users are recorded as added by no admin.
- R-003 When the gate goes live, the system also adds every user whose first master CV or CV copy was created after R-002 ran. A user an admin removed from the list in between is not added back.
- R-004 A user has "cvs" by the rule of PRD 0013 R-002: the feature is released, the user is on its list, or the user is an admin who has not turned it off.
- R-005 A user without "cvs" who asks the server for master CVs, a master CV's PDF or Markdown, an application's CV copy, its PDF, Markdown, comparison or fit, or any draft route gets "not found", the same answer as an address that does not exist.
- R-006 A user without "cvs" sees no CVs entry in the navigation, no CV link on an application, no Drafts tab and no "New with CV". Opening /cvs, /cvs/new, /cvs/editor, /applications/cv or /applications/new-with-cv shows the app's "page not found".
- R-007 While "cvs" is in beta, a user who has it sees a "Beta" label on the CVs entry and on the CV pages. The label goes away when it is released.
- R-008 A user with "jobs" but without "cvs" sees the job board without any fit, without "Start application", without "Tailor by keywords" and without the invitation to create a master CV. The server sends them no fit, and starting a draft from a job needs both features.
- R-009 A user who loses "cvs" keeps every master CV, CV copy and draft unchanged, and gets them back unchanged with "cvs". Their applications keep working without the CV link.
- R-010 The background service keeps computing fit scores for every master CV, whoever owns it.

Three event types
- R-011 The system stores each timeline event as exactly one of three types: interview, offer or denied.
- R-012 The system refuses a note or a feedback event, on create and on edit, as an invalid value.
- R-013 The system turns every existing note and feedback event into an interview of type unknown. It keeps the event's identifier, application, date and observation.
- R-014 The system does the same with any note or feedback the running older version writes during the switch-over.
- R-015 The web event form offers interview, offer and denied, and a new event starts as an interview of type unknown.
- R-016 applika-cli offers interview, offer and denied on `applications timeline add` and `edit`, and offers note and feedback nowhere.
- R-017 applika-cli 0.1.4 keeps working unchanged. Its steps list shows every event as the same step, with the same identifier, as before the switch.
- R-018 The system counts a former note or feedback as an interview of type unknown in statistics, in reports computed after the switch and in the agenda. Reports already submitted stay as stored.

Release and rollback
- R-019 Database changes reach production in a release before the code that uses them. Open web pages and installed command-line clients keep working in between.
- R-020 The system can be rolled back to the previous release at each of the two releases. A rollback turns every converted event that was not edited since back into the note or feedback it was.

## Permissions and tenancy

Only an admin can see or change the "cvs" beta list, release "cvs" to everyone or move it back to beta, as for every feature in PRD 0013. The list rows this feature's release adds belong to no admin, and an admin can remove them like any other row. Being on the list opens the user's own master CVs, CV copies and drafts, and nothing more. Every rule about whose CV or draft is whose still holds, for admins too, so an admin sees only their own CVs and drafts. A user who is not an admin learns only whether they have "cvs", never who else is on the list. Converting event types changes only the type of each user's own events, and it never moves an event to another user or application. The background service acts for no user, and it is never gated. An anonymous visitor gets today's answer, which tells them to sign in.

## Edge cases

- A user deleted every CV before the release: they are not enrolled, and an admin can add them.
- A user creates their first CV after the gate goes live but before R-003 runs: they get "not found" until it runs.
- A user loses "cvs" with a CV page open: their next action there fails as "not found", and the CVs entry is gone on their next page load.
- A user loses "cvs" with an open draft: the draft is kept and hidden, and it comes back with "cvs".
- An admin turns "cvs" off for themselves: their own CVs and drafts are hidden and kept.
- A converted event is edited after the switch, and then the release is rolled back: it stays as edited.
- A former note dated inside the agenda window appears in the agenda as an interview of type unknown. It never counts as an initial screening (PRD 0008 R-024).
- An old browser tab sends a note: it is refused, and a reload shows the three types.
- A user without "cvs" has a draft started from a job: the job's "Draft" mark stays as text, not as a link.
- A user with "cvs" but without "jobs" keeps a CV copy tailored by keywords unchanged (PRD 0013 R-027).

## Non-goals

- Gating any other part of Applika that shipped before the job board.
- Separate features for the builder and for application CVs.
- Telling enrolled users they were put on a beta list.
- Removing the note and feedback labels from the database, or deleting the kept original types.
- Any change to the 0.1.4 steps routes, the frozen step and feedback lists or the 0.1.4 finalize.
- A command-line message explaining a missing feature.
- Excluding former notes from statistics, reports or the agenda (see R-018).

## Success signals

- After the second release, every user who had a CV before the first one still opens /cvs and their application CVs, with no admin action.
- A user with neither "jobs" nor "cvs" sees six navigation entries, a user with one of them sees seven, and a user with both sees eight.
- After the first release's migration, no event of type note or feedback exists, and `GET /applications/{id}/steps` answers 0.1.4 the same before and after.
- The owner releases "cvs" to everyone from /admin/features in under a minute, without a deploy.

## Assumptions

- "sobre event types" is Portuguese for "about event types".
- "applications cv's" means the CV copy attached to an application, a draft's copy included.
- "just like jobs" means the PRD 0013 mechanism: a beta list, admin access by default with a per-admin opt-out, and release from /admin.
- The feature's key is "cvs", its name is "CV builder", and its description is "Master CVs, CV copies on applications and the new application with CV flow."
- "Owns a CV" counts the master CVs and CV copies that exist when the migration runs. A CV deleted before then leaves no trace.
- On the admin list, an enrolled row shows no "added by".
- The "Beta" label shows on CVs the way it shows on Jobs (PRD 0013 R-026).
- The CV link, the Drafts tab and "New with CV" are hidden, not disabled.
- A user without "cvs" gets the job board's answers as if they had no fit at all: no fit on the list or on a job, a minimum fit filter matches no job, and sorting by fit is sorting by newest.
- A new web event starts as an interview of type unknown.
- The command-line version that drops note and feedback is numbered at release. Its changelog entries go under "Unreleased".
- The conversion leaves each event's timestamps as they were.
- Statistics keep their nine stages and their shapes.
