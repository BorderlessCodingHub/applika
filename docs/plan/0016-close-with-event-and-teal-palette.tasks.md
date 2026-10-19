# Tasks 0016 — Close an application with an event, and the original teal palette

PRD: docs/prd/0016-close-with-event-and-teal-palette.md   Plan: docs/plan/0016-close-with-event-and-teal-palette.md
ADRs bound: 0022 (drafted by this feature, Accepted 2026-10-19, amends 0006); 0004, 0006 (Amended by 0022), 0009, 0012 (Amended by 0020), 0020. All read Accepted (checked 2026-10-19).

## Order
K1 web: flag opens the event dialog → K2 web: Add event box → K3 applika-cli --keep-open → K4 teal palette → K5 closing

- **Slices (set 2026-10-19).** K1..K5, built in that order, one after another.
- **Cap.** Owner precedent (0013..0015): 5 slices, closing included. Set is 5. No foundation ticket: plan `## Data` is none. No backend ticket: plan `## Backend` is "No code change".
- **Stories.** One story per slice where the cap allows: K1 [US1]; K2 [US2, US3] (the ticked and unticked halves of one box); K3 [US4, US6]; K4 [US5]. US6 (P3) has no code: K3 runs the 0.1.4 tests, K5 walks 0.1.4. Priority order kept (P1 → P2 → P3); no bend.
- **deps (code):** K1 none; K2 = K1 (close mode, `toFinalizeOutcomePayload`, `close_application`); K3 = K1 and K4 = K1 (branch only, no code dependency); K5 = K2 + K3 + K4.
- **Branch (owner's standing order, 0014/0015: "One branch, tag each release").** One branch, `integration/0016-close-with-event-and-teal-palette`, cut from local `develop` by K1 T001. Every ticket starts with `--no-branch`. K1..K5 land on it one after another.
- **AC.** PRD requirement sentence verbatim, `R-nnn` prefix dropped (house precedent). Rule ACs carry their rule path. A slice carrying one half of a requirement says so on its covers line.
- **No beta gate.** Both changes alter existing screens and an existing command (`.claude/rules/beta-features.md` 7; PRD non-goal "A beta flag for either change"). No `FeatureKey`, no seed row.

### Release (one; no Release A/B)
- **One release, every ticket.** No migration, no backend change, nothing run by hand (no Alembic step; `.claude/rules/prod-release-runbook.md` 4 has nothing to split). Tag `0016-release` (annotated, local) on the K5 tip (Plan corrections 14). K1..K4 tips are not merge points.
- **Owner before merge:** reviews K4's screenshots of both themes and confirms "as was originally" (PRD success signal; plan `## Risks`).
- **Owner:** merges the branch into `develop` (`--no-ff`); `develop` → `main` is the owner's release. CD deploys the new frontend image. CLI: a push to `main` touching `cli/**` publishes `cli/pyproject.toml`'s version (1.1.0, never published; the owner numbers it, Plan corrections 15).
- **Rollback.** Swarm back to the previous frontend image. Nothing in the database to undo. CLI users keep their installed version.
- Build never waits for prod. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`, and never pushes.

### Plan corrections (checked against the code, 2026-10-19)
1. **Plan header stale.** l.8 reads "0022 (Proposed)" and `## Open` (l.149) says the orchestrator adds "Amended by" after acceptance. ADR-0022 reads Accepted 2026-10-19; ADR-0006 l.3 already carries "Amended by: ADR-0022 (original teal palette)". K5 fixes those two plan lines, nothing else.
2. **Uncommitted docs on `develop`.** PRD 0016, plan 0016, ADR-0022, ADR-0006's status line, this tasks file, and `.claude/agent-memory/` (never `.claude/agent-memory-local/`). K1 T001 commits them alone, first, on the integration branch.
3. **Mount lines.** `applications-page.tsx` import l.43, mount l.564-570 (plan says "l.565"). The `"finalize"` action (l.62) and `handleFinalizeClick` (l.210-212) stay. The flag is `application-item.tsx` l.206-214.
4. **None shows no other fields.** `TimelineEventFormFields` always renders the date slot (l.116) and the notes slot (l.162). Close + None → the form passes `null` for both. `timeline-event-form-fields.tsx` stays unchanged (pinned by `timeline-port.test.ts`). The `none` branch validates nothing. Why: `finalize-dialog.tsx` l.94-98, a stale value in an unmounted field never blocks the close.
5. **What the plan leaves out of the port source.** frontend/CLAUDE.md "### Application Timeline" says to port a named source whole. The plan's Frontend list skips these parts of `finalize-dialog.tsx` / `finalize-outcome-fields.tsx`:
   - the line under the chips that explains the picked outcome (`FINALIZE_OUTCOME_COPY[value].description`, wired as the group's description, finalize-outcome-fields.tsx l.72-75, l.126-128). Close mode only;
   - the `RotateCcw` icon beside the reversible sentence (finalize-dialog.tsx l.281-287);
   - the invalid toast "Please fix the highlighted fields before closing" (l.254);
   - the error fallback "Could not close it" (l.267);
   - the None chip look `OUTCOME_LOOK.none` (finalize-outcome-fields.tsx l.32-36).
6. **`close_application` order.** The plan puts the field on create values. K1 adds it to every branch: `true` in close defaults (never shown), `false` for create and edit. The closing-date rule then has one condition: offer/denied + `close_application`. K2 sets create to `true` and shows the box. Edit stays `false` (R-009).
7. **Existing unit tests that save Offer/Denied from Add event.** `timeline-event-form.test.tsx` l.278-323, l.510-542, l.544-578 and l.580-620 (its Offer case) expect `services.timeline.create`. Once the box is ticked on open (K2), these saves would call finalize instead, so these tests untick the box first. The services mock (l.27-36) gains `applications.finalize` (K1).
8. **E2E Add event Offer/Denied.** The plan names only the close flows in `e2e/timeline.spec.ts`. Four more tests save an Offer or Denied event from Add event (K2):
   - l.186-210: flow 1 adds a Denied event, then closes with None from the flag. With the box ticked, the Denied save closes the application and the flag is gone;
   - l.333-372, l.374-403 and l.535-571.

   Each of the four unticks "Close the application" before saving. The new test covers the ticked case.
9. **Checkbox contrast.** Stock new-york `checkbox.tsx` draws the unchecked border with `border-input`. `ui/radio-group.tsx` swapped that token for `border-muted-foreground` to reach 3:1 against the card (frontend/CLAUDE.md "### UI Components"). K2 makes the same applika-only change and notes it there.
10. **CLI docs the plan omits.** `cli/README.md` timeline section l.232-272 (examples l.246-252, flag table l.261-268). In SKILL.md, l.247-261 says "Add it to the timeline without closing the application": that example now needs `--keep-open`.
11. **frontend/CLAUDE.md lines the plan's three items miss:** l.69, l.927, l.957, l.970-983, l.1008, l.1025, l.1040, l.2137.
12. **Browser theme colour.** `frontend/src/app/layout.tsx` l.83 `themeColor: "#0c0d12"` is today's blue-identity dark background. R-017/R-018 → it becomes the hex of the original dark `--background` (228 22% 8%, about `#101219`; the converter decides). The palette test pins it.
13. **Categorical colours kept (R-020).** Beyond the plan's three: `components/admin/admin-stat-cards.tsx` (sky, violet, cyan), `admin/top-companies-panel.tsx`, `admin/user-growth-chart.tsx`, `admin/seniority-donut.tsx`, and `lib/utils.ts` l.34-39 (agenda urgency hex). None are tokens; none change.
14. **Tag.** One release → one annotated tag, `0016-release`, on the K5 tip. The plan names no tag.
15. **CLI version.** `cli/pyproject.toml` is 1.1.0, never published (PyPI holds 0.1.1..0.1.4). `cli/CHANGELOG.md` `## [Unreleased]` already carries 0015's lines; K3's lines join them. No bump: the owner numbers the version at release.
16. **CLI calls.** The closing path uses `client.post`, as `finalize_application` does (commands.py l.1119-1126). In tests that is `FakeApiClient.post` + `post_error` (cli/tests/conftest.py l.167-176). The `/timeline` path keeps `post_json` + `post_json_error`. Help asserts are colour-proof through the autouse fixture (cli/tests/conftest.py l.48-60).
17. **Backend untouched.** No `backend/` diff, no migration, no backend CHANGELOG line. `ty` stays at its baseline (ceiling 171) and coverage stays ≥ 90%.
18. **Base.** 0016 builds on 0015's three-type form. K1 T001 checks that `0015-release-b` is in `develop`.

## K1 — Web: the flag opens the event dialog (None, Offer, Denied), the close dialog removed   side: frontend (+ E2E)   covers: R-001, R-002, R-003, R-004, R-005, R-006, R-010 (flag half), R-011 (flag half), R-015 (web, flag)   deps: —
Goal: The flag opens `TimelineEventForm purpose="close"` in place of `FinalizeDialog`: None, Offer and Denied, opens on None, no checkbox, closes through `POST /applications/{id}/finalize` (bodyless for None, the outcome body for Offer/Denied), date capped at today; `FinalizeDialog` and `FinalizeOutcomeFields` deleted.
Owner's words: "when i add an event of type offer or denied, the application isn't finalized just as in the close button with a "flag" icon, what i want is, when the user clicks in this close button, i want to display the same dialog used to add a new event to the timeline but displaying only none, offer and denied types and when creating an event with type offer and denied, the application must be finalized (the none type only appear when the user clicks in the flag button sice we dont have an event type for this, it only serves to close the application without an offer and/or a denied)." "there is something i want to add, what i really what is to remove the dialog that opens when i click in the "Close" button and in the same place, display the dialog component when i click to add a new event, BUT, the interview event type only will appear when i click in the button to add a new event, and the "None" option to close an application without offer and denied only appears when i click in the flag button to close." "Just one component for both uses"
Clarified: "None, no checkbox (Recommended)": the dialog opens on None and one submit closes the application, as the flag does today. "Date stops at today (Recommended)": when the box is ticked, and always in the close dialog, the date cannot be later than today. Assumptions: closing with an event uses the close that already exists (PRD 0008 R-032); the dialog is titled "Close application", its button reads "Close application", and it keeps today's reversible sentence; from the flag, None shows no other fields; no beta flag (beta rule point 7).
Covers: R-001, R-002, R-003, R-004, R-005, R-006, R-010 (flag half), R-011 (flag half), R-015 (web, flag)
Release: one (no migration, no backend change, nothing run by hand). Plan: docs/plan/0016-close-with-event-and-teal-palette.md `## Frontend`, `## Contract`, `## Tests`. Tasks: docs/plan/0016-close-with-event-and-teal-palette.tasks.md (Plan corrections 2, 3, 4, 5, 6, 7, 11, 18)
Touch:
- docs/prd/0016-close-with-event-and-teal-palette.md, docs/plan/0016-close-with-event-and-teal-palette.md, docs/plan/0016-close-with-event-and-teal-palette.tasks.md, docs/adr/0022-restore-original-teal-palette.md, docs/adr/0006-frontend-platform-and-visual-identity.md, .claude/agent-memory/ (T001 commit only, content unchanged)
- frontend/src/components/timeline/timeline-options.ts, event-type-selector.tsx, timeline-event-dialog.tsx, timeline-event-schema.ts, timeline-event-form.tsx
- frontend/src/components/timeline/timeline-event-form.test.tsx, timeline-event-schema.test.ts, timeline-event-dialog.test.tsx
- frontend/src/app/(protected)/applications/applications-page.tsx, applications-page.test.tsx
- frontend/src/components/applications/application-close-copy.ts
- removed: frontend/src/components/applications/finalize-dialog.tsx, finalize-dialog.test.tsx, finalize-outcome-fields.tsx
- frontend/e2e/timeline.spec.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/components/timeline/timeline-event-form.tsx (form, `useWatch`, seeding effects, toasts)
- frontend/src/components/applications/finalize-dialog.tsx + finalize-outcome-fields.tsx (port source, whole, then delete)
- frontend/CLAUDE.md "### Forms", "### Application Timeline", "### Date Inputs"
Contract (existing routes, unchanged; ADR-0012):
- `POST /applications/{id}/finalize`, no body → 200 `Application`; already closed → 200 no-op.
- same, `{outcome: "offer", event_date, observation?, salary_amount, salary_currency, salary_period: "monthly"|"annually"}` | `{outcome: "denied", event_date, observation?, denied_reason}` → 200 `Application` (event + `finalized_at` in one commit); 404 not owned; 422 archived; 409 "Reopen the application to edit it (it is currently closed)"; 422 "event_date cannot be in the future (max allowed: …)" past UTC today + 1; 422 bad salary, period or reason.
Steps:
- T001 [US1] Base, branch, docs commit:
  - `git -C applika branch --show-current` → `develop`; `git -C applika merge-base --is-ancestor 0015-release-b develop` → yes (Plan corrections 18). Else stop, ask the owner;
  - `git -C applika status --porcelain` → only the Plan corrections 2 set. Anything else → stop, ask the owner;
  - `git switch -c integration/0016-close-with-event-and-teal-palette develop` (the uncommitted files ride along);
  - commit that set alone: `docs(plan): close with an event and the original teal palette` (conventional, no ticket key).
- T002 [P] [US1] frontend/src/components/timeline/timeline-options.ts:
  - `CLOSE_TYPE_OPTIONS` = None, `EVENT_TYPE_CONFIG.offer`, `EVENT_TYPE_CONFIG.denied`;
  - None: value `"none"`, label `FINALIZE_OUTCOME_COPY.none.label` ("None"), icon `CircleDashed`, hint `FINALIZE_OUTCOME_COPY.none.description`, `tileClass`/`selectedClass` from `OUTCOME_LOOK.none` (Plan corrections 5);
  - a config type whose value is `TimelineEventType | "none"`; `EVENT_TYPE_CONFIG` and `EVENT_TYPE_OPTIONS` unchanged.
- T003 [US1] frontend/src/components/timeline/event-type-selector.tsx:
  - `options?` prop (default `EVENT_TYPE_OPTIONS`); `value` / `onValueChange` typed `TimelineEventType | "none"`;
  - `grid-cols-3` for both option sets;
  - optional `showHint`: the picked option's `hint` under the chips, wired into `aria-describedby`. Close mode only (Plan corrections 5);
  - update the docstring.
- T004 [P] [US1] frontend/src/components/timeline/timeline-event-dialog.tsx:
  - `mode` adds `"close"`: title `FINALIZE_DIALOG_COPY.title`; description = `RotateCcw` (aria-hidden) + `FINALIZE_REVERSIBLE_COPY` (R-006, PRD 0008 R-027);
  - same `max-w-3xl` top-anchored shape; footer `flex-wrap`.
- T005 [US1] frontend/src/components/timeline/timeline-event-schema.ts:
  - a `none` branch that validates nothing (Plan corrections 4);
  - `close_application: z.boolean()` on every branch: `false` in `emptyTimelineEventValues()` and `timelineEventToFormValues()` (Plan corrections 6);
  - `emptyCloseValues()` (new): `event_type: "none"`, today, blanks, `close_application: true`;
  - closing refine: offer/denied + `close_application` → `event_date` ≤ local today, else "Pick today or an earlier date to close the application";
  - `toFinalizeOutcomePayload(values)` (new), a whole port of `toFinalizePayload` (finalize-dialog.tsx l.191-218):
    - none → `undefined`;
    - offer → `outcome`, `event_date`, `observation` (trimmed, or `undefined`), `salary_amount` (trimmed), `salary_currency`, `salary_period`;
    - denied → `outcome`, `event_date`, `observation`, `denied_reason`;
  - limits stay equal to `finalizeSchema`'s: observation ≤ 5000, amount `^\d{1,10}(\.\d{1,2})?$`, period monthly|annually, `DENIED_REASONS`. The schema test asserts them;
  - `"none"` never reaches `toTimelineEventPayload` or `CreateTimelineEventPayload` (tsc guards).
- T006 [US1] frontend/src/components/timeline/timeline-event-form.tsx:
  - prop `purpose?: "event" | "close"` (default `"event"`); mode = close | edit | create;
  - close mode, layout:
    - `CLOSE_TYPE_OPTIONS`, `showHint`; Interview never offered;
    - `form.reset(emptyCloseValues())` on every open, so it opens on None;
    - no checkbox;
    - None → `null` for the date and notes slots (Plan corrections 4);
    - submit `FINALIZE_DIALOG_COPY.submit` ("Close application"), Cancel;
  - close mode, saving:
    - none → `useFinalizeApplication().mutate({applicationId})` (bodyless);
    - offer/denied → `{applicationId, payload: toFinalizeOutcomePayload(values)}`;
    - success → toast "Application closed", dialog closes;
    - error → toast `getApiError` (fallback "Could not close it"); the dialog stays open (the 409 reopen message reaches the user, R-015);
    - invalid → toast "Please fix the highlighted fields before closing";
  - closing (close + offer/denied) → `DatePickerInput maxDate={new Date()}`;
  - create and edit behave as today in K1; `useWatch` only, never `form.watch()`; update the docstring.
- T007 [US1] frontend/src/app/(protected)/applications/applications-page.tsx:
  - drop the `FinalizeDialog` import (l.43);
  - the mount (l.564-570) becomes `<TimelineEventForm purpose="close" applicationId={appAction.data!.id} open onOpenChange={() => setAppAction({ action: "none" })} otherEvents={[]} />`, under the same `"finalize"` action;
  - unchanged: `application-item.tsx` flag l.206-214 and `hooks/use-finalize-application.ts` (Plan corrections 3).
- T008 [US1] Remove the old dialog:
  - delete frontend/src/components/applications/finalize-dialog.tsx, finalize-dialog.test.tsx (cases ported in T009) and finalize-outcome-fields.tsx;
  - application-close-copy.ts: drop every export nothing imports any more (grep). `FINALIZE_REVERSIBLE_COPY`, `FINALIZE_DIALOG_COPY`, `FINALIZE_OUTCOME_COPY` (None chip) and the label constants stay;
  - `grep -rnE "finalize-dialog|finalize-outcome-fields|FinalizeDialog|FinalizeOutcomeFields|FinalizeOutcomePicker" frontend/src` → none.
- T009 [P] [US1] Vitest:
  - timeline-event-form.test.tsx, close mode (`purpose="close"`):
    - radios None, Offer, Denied in that order; no Interview; None checked on open; no checkbox;
    - None shows no date and no notes; None → `services.applications.finalize("app-1", undefined)`, no timeline call;
    - offer → the trio payload; denied untouched → `denied_reason: "unknown"`; a picked reason is sent;
    - the reversible sentence; a date later than today → refused, nothing sent;
    - finalize rejects with 409 → toast shows the detail, `onOpenChange` not called;
    - every describe of finalize-dialog.test.tsx (l.53, l.63, l.135, l.259, l.287) ported as close-mode cases;
  - timeline-event-form.test.tsx, create mode: no None radio. The services mock gains `applications: { finalize: vi.fn() }` (Plan corrections 7);
  - timeline-event-schema.test.ts:
    - `toFinalizeOutcomePayload` per type (the l.208 describe ported, observation trimmed or `undefined`);
    - the closing-date refine;
    - the `none` branch accepts a stale over-limit note;
    - limit parity with `finalizeSchema`'s values;
  - timeline-event-dialog.test.tsx: close mode → `dialog` named "Close application", its description says "reversible";
  - applications-page.test.tsx: the flag ("Close <role> at <company>") opens a `dialog` named "Close application" with None, Offer and Denied radios; no `alertdialog`.
- T010 [US1] E2E frontend/e2e/timeline.spec.ts:
  - close flows l.212-224, l.285-310, l.419-440: `page.getByRole("alertdialog")` → `page.getByRole("dialog", { name: "Close application" })`. The "Close application" button and the `/reversible/` assert stay;
  - flow 1 asserts the close dialog's radios: None, Offer, Denied, with None checked;
  - header comment l.10-32.
- T011 [US1] frontend/CLAUDE.md (Plan corrections 11, the close-mode half): l.69, l.927, l.957, l.970-983 (outcome-picker bullet → `TimelineEventForm purpose="close"`, None bodyless, Offer/Denied outcome body, date ≤ today), l.1008, l.1025, l.1040, l.2137 (key-files row → `timeline-event-form.tsx`). No ticket keys.
- T012 [US1] Gate, close:
  - `cd frontend && pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - `../scripts/e2e.sh e2e/timeline.spec.ts` green; no applika-e2e container, network or volume left;
  - commits conventional, no ticket key (e.g. `feat(timeline): close an application from the event dialog`);
  - not a merge point.
AC:
- The system has one dialog for adding a timeline event and for closing an application. The separate close dialog no longer exists.
- Opened from the flag, the dialog offers None, Offer and Denied, opens on None, and does not offer Interview.
- Opened from Add event, the dialog offers Interview, Offer and Denied, and does not offer None.
- Closing with None closes the application and adds nothing to the timeline.
- Closing with Offer or Denied adds that event and closes the application together: both happen or neither does.
- Opened from the flag, the dialog shows no "close the application" checkbox, always closes, and says that closing is reversible.
- When saving will close the application (the box ticked, or the flag dialog with Offer or Denied), the event date cannot be later than today.
- Offer and Denied ask for the same details, under the same rules, whichever way the dialog was opened: the date, optional notes, the salary amount, currency and period for an offer, and the reason for a denial.
- Adding an event to a closed application, from the web or the command line, keeps being refused with the message that tells the user to reopen it.
- Not gated: changes to existing screens, bug fixes, admin-only screens, and the worker (`app/worker/`, which acts for no user). (.claude/rules/beta-features.md 7)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)
- Commit messages are conventional commits **without** a ticket key: `feat(cv): add base CV table`. The board is local and the repo is moving to a new remote, so nothing in git history points at a ticket. (.claude/rules/branches-and-commits.md 2)

## K2 — Web: Add event closes the application with Offer or Denied unless the box is unticked   side: frontend (+ E2E)   covers: R-007, R-008, R-009, R-010 (box half), R-011 (Add event half), R-015 (web, Add event)   deps: K1
Goal: Add event shows "Close the application" (ticked on open) for Offer and Denied, just before Cancel and the submit button. Ticked → one finalize request with the outcome body, date capped at today. Unticked or Interview → `/timeline` as today. Edit never closes.
Owner's words: "when i add an event of type offer or denied, the application isn't finalized just as in the close button with a "flag" icon, what i want is, when the user clicks in this close button, i want to display the same dialog used to add a new event to the timeline but displaying only none, offer and denied types and when creating an event with type offer and denied, the application must be finalized (the none type only appear when the user clicks in the flag button sice we dont have an event type for this, it only serves to close the application without an offer and/or a denied)."
Clarified: "i want a checkbox - that is checked by default - this checkbox tells that opon creation this this event type, the job application will be closed automatically, the user can uncheck this checkbox to keep the application open (put this checkbox just before the submit button), add a parameter to the cli "--keep-open" when the user creates an event of type offer and denied, if this parameter was used during interview type, just ignore." "Date stops at today (Recommended)": when the box is ticked, and always in the close dialog, the date cannot be later than today. Assumptions: the checkbox reads "Close the application", hint "You can reopen it later."; it sits on the left of the bottom row before Cancel and the submit button, and wraps above them on narrow screens; it keeps the user's choice while the dialog stays open and is ticked again each time the dialog opens; the submit button keeps "Add event", ticked or not.
Covers: R-007, R-008, R-009, R-010 (box half), R-011 (Add event half), R-015 (web, Add event)
Release: one (no migration, no backend change, nothing run by hand). Plan: docs/plan/0016-close-with-event-and-teal-palette.md `## Frontend`, `## Tests`. Tasks: docs/plan/0016-close-with-event-and-teal-palette.tasks.md (Plan corrections 6, 7, 8, 9, 11)
Touch:
- frontend/src/components/ui/checkbox.tsx (new)
- frontend/src/components/timeline/timeline-event-form.tsx, timeline-event-schema.ts
- frontend/src/components/timeline/timeline-event-form.test.tsx, timeline-event-schema.test.ts
- frontend/e2e/timeline.spec.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/components/timeline/timeline-event-form.tsx after K1 (close mode, `toFinalizeOutcomePayload`)
- frontend/src/components/ui/radio-group.tsx (applika-only unchecked border, 3:1)
- frontend/CLAUDE.md "### Forms" (`useWatch`), "### Application Timeline", "### UI Components"
Contract (existing routes, unchanged): ticked → `POST /applications/{id}/finalize` with the outcome body (K1 Contract); unticked or interview → `POST /applications/{id}/timeline` → 201 `TimelineEvent`, 409 reopen message on a closed application; edit → `PUT /applications/{id}/timeline/{event_id}`.
Steps:
- T013 [US2] Build on `integration/0016-close-with-event-and-teal-palette` after the K1 tip.
- T014 [P] [US2] frontend/src/components/ui/checkbox.tsx (new): `pnpm dlx shadcn@latest add checkbox` (new-york; `radix-ui` already a dep). Unchecked border `border-muted-foreground` instead of `border-input`, like `ui/radio-group.tsx` (Plan corrections 9).
- T015 [US2] [US3] frontend/src/components/timeline/timeline-event-schema.ts:
  - `emptyTimelineEventValues()` → `close_application: true`; `timelineEventToFormValues()` stays `false`;
  - K1's closing refine now also fires for create + offer/denied + ticked; unticked → no date cap.
- T016 [US2] [US3] frontend/src/components/timeline/timeline-event-form.tsx:
  - lift `<Form {...form}>` above `TimelineEventDialog`: the footer `FormField` needs the context;
  - create + offer/denied → `FormField name="close_application"` with `Checkbox`:
    - in the footer, before Cancel, `mr-auto`; below `sm` it takes its own row above Cancel and the submit;
    - label "Close the application", `FormDescription` "You can reopen it later.";
    - unmounted for Interview. RHF keeps the value, so Offer → Interview → Offer shows the last choice;
    - `form.reset` on open → ticked again;
  - saving:
    - ticked → `useFinalizeApplication().mutate({applicationId, payload: toFinalizeOutcomePayload(values)})`: one request, never create then finalize; toast "Application closed", close;
    - error → toast `getApiError`, the dialog stays open, nothing written;
    - unticked or interview → `useCreateTimelineEvent` as today;
  - closing → `DatePickerInput maxDate={new Date()}` + the refine's message; unticking lifts it;
  - submit stays "Add event"; `isSaving` covers create, update and finalize;
  - edit: no checkbox, never finalizes (R-009).
- T017 [P] [US2] [US3] Vitest:
  - timeline-event-form.test.tsx, the box:
    - shown only for Offer/Denied in create mode; absent for Interview, in edit, in close mode;
    - ticked on open; label and hint text;
  - timeline-event-form.test.tsx, saving:
    - ticked → `services.applications.finalize("app-1", <trio | denied payload>)`, `services.timeline.create` never called;
    - unticked → create, finalize never called;
    - finalize rejects with 422 → toast shows the detail, dialog open;
    - edit of an Offer/Denied event → `services.timeline.update`, no finalize;
  - timeline-event-form.test.tsx, the date and the choice:
    - a future date picked unticked, then ticked → date error, nothing sent;
    - closed and reopened → ticked again;
    - Offer → untick → Interview → Offer → still unticked;
  - existing create cases l.278-323, l.510-542, l.544-578, l.580-620 untick first (Plan corrections 7);
  - timeline-event-schema.test.ts: create defaults ticked; the closing refine ticked vs unticked.
- T018 [US2] [US3] E2E frontend/e2e/timeline.spec.ts:
  - untick "Close the application" before "Add event" at l.194-208, l.353-362, l.394-396 and l.556-564 (Plan corrections 8);
  - new test, ticked: Add event → Offer (monthly, an amount, a currency), box ticked → "Closed", the offer on the read-only timeline, no "Add event";
  - same test, unticked: Reopen; Add event → Denied, untick → saved; the row stays open ("Active" pill, flag still there);
  - header comment.
- T019 [US2] frontend/CLAUDE.md:
  - "### Application Timeline": the box (create, offer/denied only, ticked on open, one finalize request when ticked, date ≤ today when closing, edit never closes, the lifted `FormProvider`);
  - "### UI Components": `ui/checkbox.tsx`'s applika-only border;
  - no ticket keys.
- T020 [US2] Gate, close:
  - `cd frontend && pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - full `../scripts/e2e.sh` green; no applika-e2e container, network or volume left;
  - not a merge point.
AC:
- Opened from Add event with Offer or Denied selected, the dialog shows a "Close the application" checkbox just before the submit button. The box is ticked when the dialog opens.
- Saving an Offer or Denied event with the box ticked adds the event and closes the application together. With the box unticked, it adds the event and the application stays open.
- The checkbox does not appear for Interview. Editing an existing event never closes the application.
- When saving will close the application (the box ticked, or the flag dialog with Offer or Denied), the event date cannot be later than today.
- Offer and Denied ask for the same details, under the same rules, whichever way the dialog was opened: the date, optional notes, the salary amount, currency and period for an offer, and the reason for a denial.
- Adding an event to a closed application, from the web or the command line, keeps being refused with the message that tells the user to reopen it.
- Not gated: changes to existing screens, bug fixes, admin-only screens, and the worker (`app/worker/`, which acts for no user). (.claude/rules/beta-features.md 7)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K3 — applika-cli: timeline add --type offer|denied closes the application unless --keep-open   side: cli   covers: R-012, R-013, R-014, R-015 (CLI), R-016   deps: K1
Goal: `applications timeline add --type offer|denied` sends the finalize outcome body and prints the closed application. `--keep-open` keeps today's `/timeline` path. `--keep-open` with `--type interview` is ignored silently. 0.1.4 and `applications finalize` are unchanged.
Owner's words: "when i add an event of type offer or denied, the application isn't finalized just as in the close button with a "flag" icon, what i want is, when the user clicks in this close button, i want to display the same dialog used to add a new event to the timeline but displaying only none, offer and denied types and when creating an event with type offer and denied, the application must be finalized (the none type only appear when the user clicks in the flag button sice we dont have an event type for this, it only serves to close the application without an offer and/or a denied)."
Clarified: "...add a parameter to the cli "--keep-open" when the user creates an event of type offer and denied, if this parameter was used during interview type, just ignore." "Date stops at today (Recommended)": the command line shows the server's refusal for a later date without `--keep-open`, and nothing changes on the server. Assumptions: after adding an event that closes the application, applika-cli prints the closed application with its outcome, as `applications finalize --outcome` does; an Offer step added through applika-cli 0.1.4 does not close the application; the change is listed under the next unreleased applika-cli version.
Covers: R-012, R-013, R-014, R-015 (CLI), R-016
Release: one (no migration, no backend change, nothing run by hand; the CLI ships in the next applika-cli publish). Plan: docs/plan/0016-close-with-event-and-teal-palette.md `## Contract` (CLI), `## Tests` (CLI), `## Docs`. Tasks: docs/plan/0016-close-with-event-and-teal-palette.tasks.md (Plan corrections 10, 15, 16, 17)
Touch:
- cli/src/applika/commands/applications/commands.py (`add_timeline_event` l.1240-1376)
- cli/tests/test_timeline_and_finalize.py
- cli/CHANGELOG.md, cli/README.md, cli/src/applika/skills/applika-cli/SKILL.md, cli/CLAUDE.md
Pattern:
- cli/src/applika/commands/applications/commands.py `finalize_application` `--outcome` path l.1108-1145 (`FinalizeOutcomePayload`, `client.post`, `print_finalize_outcome_summary`)
- cli/tests/test_timeline_and_finalize.py `test_finalize_outcome_offer_payload` (l.1644), `test_finalize_409_prints_reopen_hint` (l.1961), `test_timeline_add_409_prints_reopen_hint` (l.631)
- cli/tests/conftest.py `FakeApiClient` (`post` + `post_error`, `post_json` + `post_json_error`, l.152-176)
Contract (existing routes, unchanged):
- `--keep-open` bool flag, default off. Help: "Offer or denied: add the event and keep the application open. Ignored with --type interview."
- offer/denied without `--keep-open` → `POST /applications/{id}/finalize` with `{outcome, event_date, observation, salary_amount, salary_currency, salary_period, denied_reason}` → 200 `Application`; 409 "Reopen the application to edit it (it is currently closed)"; 422 "event_date cannot be in the future (max allowed: …)".
- `--keep-open`, or interview → `POST /applications/{id}/timeline` → 201, as today.
Steps:
- T021 [US4] Build on `integration/0016-close-with-event-and-teal-palette` after the K2 tip.
- T022 [US4] cli/src/applika/commands/applications/commands.py `add_timeline_event`:
  - `keep_open: Annotated[bool, typer.Option('--keep-open', help='Offer or denied: add the event and keep the application open. Ignored with --type interview.')] = False`;
  - validate `TimelineEventCreate` first; its errors and texts stay unchanged;
  - offer/denied without `--keep-open`:
    - `FinalizeOutcomePayload(outcome=FinalizeOutcome(event_type.value), event_date=…, observation=…, salary_amount=…, salary_currency=…, salary_period=…, denied_reason=…)` from the validated payload;
    - `client.post(f'/applications/{id}/finalize', outcome_payload.model_dump(mode='json'))` (Plan corrections 16);
    - `print_finalize_outcome_summary(finalized, 'Added event and closed application', outcome=outcome_payload.outcome.value)`;
  - otherwise (`--keep-open`, or interview with or without it) → `/timeline` + `print_timeline_event_summary(created, 'Added event')`, nothing printed about the flag;
  - `ApiError` → `_echo_api_error(exc, reopen_hint_id=resolved_application_id)` on both paths (409 reopen hint, 422 detail, exit 1);
  - docstring: "Add a timeline event to an application. An offer or denied event closes the application unless --keep-open."
- T023 [P] [US4] [US6] cli/tests/test_timeline_and_finalize.py:
  - add `--keep-open` to l.156, l.493, l.539 and l.565: still `/timeline`, `post_json`, same payloads;
  - offer, no flag → `captured_post_path == '/applications/99/finalize'`; body `{outcome: 'offer', event_date, observation: None, salary_amount, salary_currency, salary_period, denied_reason: None}`; output "Added event and closed application", `status=closed`, `outcome=offer`;
  - denied, no flag → `/finalize` with `denied_reason: 'unknown'`; a picked reason is sent;
  - interview + `--keep-open` → `/timeline`, exit 0, no output about the flag;
  - 409 → reopen hint `applika applications reopen 99`, exit 1: via `post_error` on `/finalize` without the flag, via `post_json_error` with it;
  - `post_error` 422 "event_date cannot be in the future (max allowed: …)" → the detail printed, exit 1;
  - `timeline add --help` lists `--keep-open` (colour-proof through the autouse fixture);
  - 0.1.4 tests in cli/tests/test_commands.py and the `applications finalize` tests (l.1615-2016) untouched and green (R-016).
- T024 [US4] Docs (no ticket keys):
  - cli/CHANGELOG.md `## [Unreleased]`, beside 0015's lines:
    - `### Added` `- applications timeline add --keep-open: with --type offer or denied, adds the event and keeps the application open; ignored with --type interview.`;
    - `### Changed` `- applications timeline add --type offer|denied closes the application with that event (POST /applications/{id}/finalize outcome body); --keep-open keeps it open; ignored with --type interview.`;
    - no version bump (Plan corrections 15); no backend CHANGELOG line (Plan corrections 17);
  - cli/README.md timeline section l.232-272: the offer/denied examples say they close; one `--keep-open` example; a flag-table row (Plan corrections 10);
  - cli/src/applika/skills/applika-cli/SKILL.md l.247-261 (the "without closing" example gains `--keep-open`) and l.296-307;
  - cli/CLAUDE.md commands-table row for `applications timeline`.
- T025 [US4] [US6] Checks, close:
  - `cd cli && make format && make lint && make test`;
  - `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest` → 0 failed; `uv run --python 3.10 pytest` → 0 failed;
  - `cd backend && uv run pytest tests -k "steps or finalize or supports"` green (0.1.4 routes and bodies, R-016);
  - `uv run applika applications timeline add --help` shows `--keep-open`; `applications finalize --help` and `applications steps --help` read as on `develop`;
  - the changelogs verify command;
  - not a merge point.
AC:
- applika-cli `applications timeline add --type offer` or `--type denied` adds the event and closes the application, unless `--keep-open` is given.
- applika-cli accepts `--keep-open` with `--type interview`, ignores it, and shows no error.
- applika-cli shows the server's refusal and changes nothing when an offer or denied event that would close the application has a date later than today.
- Adding an event to a closed application, from the web or the command line, keeps being refused with the message that tells the user to reopen it.
- applika-cli 0.1.4 keeps working unchanged, including its finalize request, and `applications finalize` with or without `--outcome` keeps working.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `applika/cli/CHANGELOG.md` records every CLI change, and every backend change that changes what a CLI version sends or receives (a route, a request field, a response field, an enum value, a deprecation). (.claude/rules/changelogs.md 1)
- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go under `## [Unreleased]` with `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. The CLI's version heading matches `applika/cli/pyproject.toml` when it is released. (.claude/rules/changelogs.md 4)

## K4 — Web: the original teal palette in light and dark, pinned by a parity test   side: frontend   covers: R-017, R-018, R-019, R-020   deps: K1
Goal: Every colour token in `globals.css` takes the value of the `9661a38` palette (light and dark), written as oklch and pinned against the original HSL by a unit test. The dark shadows, the glow, the hero mesh and the browser theme colour go back too. Fonts, radius, shell, dark default, CV preview and categorical colours stay. Screenshots of both themes go to the owner.
Owner's words: "The second thing and no much important is to restore the visual identify from blue to green (as was originally)"
Clarified: "Full original palette"; "New ADR-0022 amends colours (Recommended)". Assumptions: the palette covers colours only, including the original shadows and the hero and glow effects; original colours that nothing on screen uses today are not brought back; dark stays the default theme, as ADR-0006 settled it; the CV preview keeps its blue print colour, and the seniority badges keep theirs.
Covers: R-017, R-018, R-019, R-020
Release: one (no migration, no backend change, nothing run by hand; CD deploys the frontend image). Plan: docs/plan/0016-close-with-event-and-teal-palette.md `## Frontend` (Palette), `## Tests`, `## Risks`. Tasks: docs/plan/0016-close-with-event-and-teal-palette.tasks.md (Plan corrections 12, 13)
Touch:
- frontend/src/app/globals.css
- frontend/src/app/globals-palette.test.ts (new)
- frontend/src/app/layout.tsx (l.83 `themeColor`)
- frontend/CLAUDE.md
Pattern:
- original: `git -C applika show 9661a38:frontend/src/app/globals.css` l.222-264 (mesh, glow) and l.312-415 (tokens, shadows)
- plan `## Frontend` Palette table; ADR-0022 `## Decision` (derived rules)
- frontend/src/components/timeline/timeline-port.test.ts (a vitest that reads a source file with node fs)
Contract: none (no route).
Steps:
- T026 [US5] Build on `integration/0016-close-with-event-and-teal-palette` after the K3 tip. Source: `git -C applika show 9661a38:frontend/src/app/globals.css`.
- T027 [P] [US5] frontend/src/app/globals-palette.test.ts (new), written first (red):
  - reads `src/app/globals.css` and `src/app/layout.tsx`; takes the first `@layer base` `:root {…}` and `.dark {…}` blocks;
  - pins the plan's table, light and dark HSL per token: `--sidebar` = orig `--sidebar-background`, plus the "= x" tokens;
  - converts every `oklch()` and every pinned HSL to sRGB (CSS Color 4: OKLCH → OKLab → LMS → linear sRGB → gamma; HSL → sRGB); |Δ| ≤ 1.5/255 per channel, alpha ignored;
  - asserts ADR-0022's derived rules: `--surface` = `--card`; `--surface-elevated` = `--popover`; `--primary-muted` = `--primary` at `/ 0.12`; `--info` = `--primary`; `--chart-1..5` = primary, success, warning, destructive, muted-foreground; `--border-strong` = 40 12% 82% · 228 14% 24%;
  - pins the dark shadows, `--shadow-glow`, the `gradient-mesh` stops and `themeColor`;
  - asserts no `oklch(` literal with hue `255` is left anywhere in the file.
- T028 [US5] frontend/src/app/globals.css `@layer base` `:root` / `.dark` (l.316-437):
  - every token in the table → oklch: L and C to 3 decimals, H to 1 decimal, achromatic `L 0 0`. Numbers come from the test's converter, never hand arithmetic (plan FLAG);
  - "= x" tokens take x's value; the derived tokens follow T027's rules;
  - `--radius: 0.5rem` stays.
- T029 [US5] Shadows and literals in frontend/src/app/globals.css:
  - light `--shadow-card` / `--shadow-elevated` unchanged: they already equal the original;
  - dark → orig l.409-412 (`oklch(1 0 0 / a)` / `oklch(0 0 0 / a)`);
  - `--shadow-glow` (@theme l.69-71) → `0 0 24px -4px` dark primary `/ 0.25` (orig l.264);
  - `gradient-mesh` (l.168-205) → orig l.222-259, whole: light 168 65% 38% /0.08, 200 60% 50% /0.06, 40 30% 50% /0.03; dark 168 70% 48% /0.08, 200 60% 50% /0.05, 260 40% 50% /0.04;
  - rewrite the palette comments l.317-322 and l.381 (ADR-0022, `9661a38`);
  - not ported: `--success-foreground`, `--warning-foreground`, `--shadow-panel`, radius 0.625rem, fonts, `admin-gradient-line`.
- T030 [P] [US5] frontend/src/app/layout.tsx l.83 `themeColor` → the hex of the original dark `--background` (228 22% 8%) (Plan corrections 12).
- T031 [US5] What stays (R-019, R-020):
  - not touched: `cv-document-blocks.tsx` `blue-700`; seniority `blue-*` in `admin/users/users-page.tsx` l.48 and `admin/user-activity-table.tsx` l.29; the categorical colours of Plan corrections 13; `root-providers.tsx` `defaultTheme="dark"`; the fonts in layout.tsx; every component file;
  - K4's commits touch only globals.css, globals-palette.test.ts, layout.tsx and frontend/CLAUDE.md.
- T032 [US5] Contrast and screenshots (plan `## Risks`):
  - on the e2e stack (`KEEP_STACK=1 ../scripts/e2e.sh e2e/smoke.spec.ts`), screenshot both themes at desktop and 390px: landing (mesh, glow), dashboard, applications with an open and a closed row, the event dialog (chips, checkbox, radio ring, badges), jobs (fit badge, "Beta"), admin features;
  - measure text pairs ≥ 4.5:1 and non-text ≥ 3:1: dark `--primary-foreground` on `--primary`; `--muted-foreground` on `--background` and `--card`; `text-success|destructive|warning|info` on their `/15` tints; the unchecked borders of `ui/radio-group.tsx` and `ui/checkbox.tsx`;
  - screenshots and the contrast list go to the scratchpad, outside the repo, for the owner. No token value changes (R-017): a failure goes to the owner, not into a fix;
  - stack down after: no applika-e2e container, network or volume left.
- T033 [US5] frontend/CLAUDE.md "### UI Components": the tokens are the original palette of `9661a38` written as oklch (ADR-0022, amending ADR-0006); `globals-palette.test.ts` pins them; a token value changes only with the ADR. No ticket keys.
- T034 [US5] Gate, close:
  - `cd frontend && pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - not a merge point.
AC:
- The web uses the palette Applika had before PRD 0006, in light and in dark: every colour that palette defines takes its original value.
- Colours introduced since then that the original palette has no twin for follow the original hues.
- Dark stays the default theme. The theme toggle, the fonts (Inter, JetBrains Mono), the sidebar shell and the component style stay as they are.
- The CV preview keeps its print colours, which match the downloaded PDF. Colours that tell categories apart, such as the seniority badges, stay.
- Not gated: changes to existing screens, bug fixes, admin-only screens, and the worker (`app/worker/`, which acts for no user). (.claude/rules/beta-features.md 7)

## K5 — Closing 0016: full gate, E2E, ADR-0022, walk, one release   side: both   covers: — (closing)   deps: K2, K3, K4
Goal: Prove 0016 whole: the full gate in CLAUDE.md order plus the target gates, the whole E2E suite, ADR-0022 Accepted, no infra left, a walk by hand on a real stack (light and dark, the flag close, Add event ticked and unticked, the CLI with and without `--keep-open`, 0.1.4), and the `0016-release` tag. No new feature work.
Owner's words: "when i add an event of type offer or denied, the application isn't finalized just as in the close button with a "flag" icon, what i want is, when the user clicks in this close button, i want to display the same dialog used to add a new event to the timeline but displaying only none, offer and denied types and when creating an event with type offer and denied, the application must be finalized (the none type only appear when the user clicks in the flag button sice we dont have an event type for this, it only serves to close the application without an offer and/or a denied). The second thing and no much important is to restore the visual identify from blue to green (as was originally)"
Clarified: success signals: closing with an offer from the flag takes no more clicks than today; adding an offer that closes the application takes one dialog instead of two; no application closed through an offer or denied event is ever left without that event; the owner reviews screenshots of both themes and confirms they look "as was originally"; the applika-cli 0.1.4 tests stay green.
Covers: — (closing)
Release: one, tag `0016-release` on this tip. Plan: docs/plan/0016-close-with-event-and-teal-palette.md. Tasks: docs/plan/0016-close-with-event-and-teal-palette.tasks.md (Plan corrections 1, 14, 15, 17)
Touch:
- docs/plan/0016-close-with-event-and-teal-palette.md (l.8 and `## Open`, T039)
- docs/adr/0022-restore-original-teal-palette.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0015-cvs-beta-and-three-event-types.tasks.md K5
Contract: none new.
Steps:
- T035 On `integration/0016-close-with-event-and-teal-palette` after the K4 tip. Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T036 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`; `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest` → 0 failed.
- T037 Full `scripts/e2e.sh`: every spec, including `timeline.spec.ts`'s close flows on the event dialog and the ticked/unticked test. Confirm the `e2e` job in .github/workflows/frontend-ci.yaml runs it. Cheaper layers carry the rest:
  - the atomic close (event + `finalized_at` in one commit, R-005/R-008), the 409 when closed, the future-date 422, the 404 when not owned: `backend/tests/integration/test_finalize.py`, `backend/tests/unit/test_finalize_application.py` (backend unchanged);
  - the dialog modes, the box, the date cap, the payloads, the flag mount: `timeline-event-form.test.tsx`, `timeline-event-schema.test.ts`, `timeline-event-dialog.test.tsx`, `applications-page.test.tsx`;
  - the palette values: `globals-palette.test.ts`;
  - the `--keep-open` paths: `cli/tests/test_timeline_and_finalize.py`;
  - 0.1.4: `cli/tests/test_commands.py` + `cd backend && uv run pytest tests -k "steps or finalize or supports"` + the T040 walk.
- T038 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` → empty;
  - no network or volume from docker-compose.e2e.yml; no testcontainers Postgres or Redis left;
  - the owner's dev containers untouched.
- T039 ADRs, rules, plan:
  - ADR-0022 reads Accepted (2026-10-19). Its Decision matches the build: tokens = the `9661a38` palette in oklch, the derived rules, dark shadows / glow / hero back, fonts, shell, new-york, radius, dark default and toggle unchanged, CV preview and seniority kept. A departure → a dated as-built note under Consequences; the Decision stays untouched;
  - ADR-0006 l.3 carries "Amended by: ADR-0022"; 0004, 0009, 0012 (Amended by 0020) and 0020 read Accepted;
  - plan (Plan corrections 1): l.8 "0022 (Proposed)" → "0022 (Accepted 2026-10-19)"; `## Open` → "None. ADR-0022 Accepted 2026-10-19; ADR-0006 carries Amended by: ADR-0022." Nothing else in the plan;
  - `git diff develop --name-only -- backend/` → empty (Plan corrections 17); `git diff develop -- backend/app/core/features.py` → empty (no `FeatureKey`);
  - the changelogs verify command; cli/CHANGELOG.md carries K3's lines;
  - the commit-format verify on `develop..integration/0016-close-with-event-and-teal-palette` → no output (conventional, no ticket key).
- T040 Walk by hand on a real stack (the dev compose stack, or the e2e stack under `KEEP_STACK=1` with `e2e-user`), light and dark, desktop and 390px:
  - **Flag:**
    - the dialog reads "Close application": None, Offer and Denied, opens on None, no Interview, no checkbox, the reversible sentence; None shows no other fields;
    - None → Closed, nothing on the timeline; Reopen;
    - Offer (the trio) → Closed with the offer; Reopen; Denied + a reason → Closed;
    - a date later than today is refused;
    - after Reopen, the closing offer or denied stays on the timeline;
  - **Add event:**
    - Interview, Offer and Denied; no None;
    - Offer and Denied show "Close the application", ticked, with "You can reopen it later.", before Cancel; it wraps above at 390px;
    - ticked → saved and Closed in one save; unticked → saved, stays open;
    - a future date + tick → refused, nothing sent;
    - Offer → Interview → Offer keeps the choice; reopening the dialog → ticked again;
    - editing an offer never closes;
  - **Two tabs:** close in tab A; in tab B, flag → None succeeds and changes nothing; flag → Offer → the reopen message; Add event → the reopen message;
  - **CLI:**
    - `cd cli && uv run applika applications timeline add <id> --type offer --date <today> --salary 5000 --currency USD --period monthly` → "Added event and closed application … status=closed … outcome=offer"; reopen;
    - `--type denied --keep-open` → stays open;
    - `--type interview --keep-open` → added, no warning;
    - `--type offer` with a later date → the server's 422, nothing changes;
    - on a closed application, with and without `--keep-open` → the reopen hint;
  - **0.1.4:**
    - `uvx applika-cli==0.1.4` against the stack: `applications steps add` an Offer step → the application stays open;
    - its `applications finalize` body works; `applications steps list` ids unchanged;
    - the current CLI's `applications finalize <id>` and `--outcome offer|denied` work;
  - **Palette:** both themes against the K4 screenshots; a fresh browser opens dark; the toggle, the fonts and the sidebar shell unchanged; the CV preview keeps its print blue; the seniority badges keep theirs.
- T041 Record at close:
  - annotated tag `0016-release` on the K5 tip (local; Plan corrections 14);
  - the owner steps of `### Release`: screenshots reviewed and "as was originally" confirmed before the merge; merge `--no-ff` into `develop`; `develop` → `main` is the owner's release; the CLI version number before the publish (Plan corrections 15); rollback = the previous frontend image;
  - the agent never touches prod or `main`, and never pushes.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics beyond 171, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0022, Accepted 2026-10-19; ADR-0006 carries "Amended by: ADR-0022"; bound 0004, 0009, 0012, 0020 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (timeline.spec.ts close flows on the event dialog and the box ticked/unticked test, the whole suite via scripts/e2e.sh) runs inside the gate and is green; the atomic close, the 409, the future-date 422, the palette values, the CLI --keep-open paths and 0.1.4 are carried by the cheaper layers named in T037.
- By-hand walk of the feature on a real stack done in light and dark: the flag close (None, Offer, Denied), Add event with the box ticked and unticked, two tabs, the CLI with and without --keep-open, and applika-cli 0.1.4.
- No new feature work.
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | Web: the flag opens the event dialog (None, Offer, Denied), the close dialog removed | frontend (+ E2E) | R-001, R-002, R-003, R-004, R-005, R-006, R-010, R-011, R-015 | — | one |
| K2 | Web: Add event closes the application with Offer or Denied unless the box is unticked | frontend (+ E2E) | R-007, R-008, R-009, R-010, R-011, R-015 | K1 | one |
| K3 | applika-cli: timeline add --type offer\|denied closes the application unless --keep-open | cli | R-012, R-013, R-014, R-015, R-016 | K1 | one |
| K4 | Web: the original teal palette in light and dark, pinned by a parity test | frontend | R-017, R-018, R-019, R-020 | K1 | one |
| K5 | Closing 0016: full gate, E2E, ADR-0022, walk, one release | both | — | K2, K3, K4 | one, tag `0016-release` |

## Matrix
| R | K |
|---|---|
| R-001 | K1 |
| R-002 | K1 |
| R-003 | K1 (K2 keeps it) |
| R-004 | K1 |
| R-005 | K1 |
| R-006 | K1 |
| R-007 | K2 |
| R-008 | K2 |
| R-009 | K2 |
| R-010 | K1 (flag), K2 (box) |
| R-011 | K1 (flag), K2 (Add event) |
| R-012 | K3 |
| R-013 | K3 |
| R-014 | K3 |
| R-015 | K1 (web, flag), K2 (web, Add event), K3 (CLI) |
| R-016 | K3 (K5 T040 walks 0.1.4) |
| R-017 | K4 |
| R-018 | K4 |
| R-019 | K4 |
| R-020 | K4 |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. Checked clause by clause:
- "when i add an event of type offer or denied, the application isn't finalized": K2 (the box, ticked on open), K3 (CLI closes by default).
- "when the user clicks in this close button, i want to display the same dialog used to add a new event to the timeline but displaying only none, offer and denied types": K1.
- "when creating an event with type offer and denied, the application must be finalized": K2 (web), K3 (CLI).
- "(the none type only appear when the user clicks in the flag button ... it only serves to close the application without an offer and/or a denied)": K1 (None in close mode only, bodyless close, nothing on the timeline).
- "restore the visual identify from blue to green (as was originally)": K4.
- "remove the dialog that opens when i click in the "Close" button and in the same place, display the dialog component when i click to add a new event": K1 (`FinalizeDialog` deleted, `TimelineEventForm purpose="close"` mounted where it was).
- "the interview event type only will appear when i click in the button to add a new event": K1 (`CLOSE_TYPE_OPTIONS` has no Interview), K2 (create keeps it).
- "the "None" option to close an application without offer and denied only appears when i click in the flag button to close": K1.
- "Just one component for both uses": K1 (one `TimelineEventForm`, `purpose` prop).
