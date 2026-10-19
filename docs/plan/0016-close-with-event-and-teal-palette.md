# Plan 0016 — Close an application with an event, and the original teal palette

PRD: docs/prd/0016-close-with-event-and-teal-palette.md
ADRs bound:
- 0004: rows owned by user; another user's row = 404, admins too. 0009 / 0012: 0.1.4 routes + finalize body keep shapes;
  reversible finalize; closed write = 409, archived = 422. 0020: event types interview|offer|denied. 0018: unused (point 7).
- 0006: platform + identity; colours amended by 0022; Inter/JetBrains Mono, sidebar shell, new-york, light+dark, dark default stay.
- 0022 (Proposed): colours = original palette of `9661a38`, written as oklch; fixed rules for tokens with no twin.
PRDs neighbouring: 0006 (R-011, R-012 superseded), 0008 (R-027 reversible copy kept, R-032 outcome close reused, R-037
reworded), 0015 (R-015/R-016 three types unchanged; CLI changelog precedent).

## Scope
Ships: one dialog component (`TimelineEventForm`) for Add event and the flag close (None/Offer/Denied); create-mode
checkbox "Close the application" for offer/denied; date capped at today whenever saving closes; CLI `timeline add
--keep-open`; original teal palette in `globals.css` + parity test. Removes `FinalizeDialog`.
Not: backend change, migration, edit-closes, 0.1.4 route/body change, fonts/radius/header, CV PDF or preview colours, FeatureKey.

## Releases
One release, no migration, nothing run by hand (runbook: no Alembic step). CD deploys the frontend image; the CLI ships
in the next applika-cli publish. ADR-0022 accepted at sign-off. Rollback: swarm back to the previous frontend image.

## Data
none.

## Backend
No code change. Reused as is: `POST /applications/{id}/finalize` outcome body (R-032; dispatch
`presentation/api/application.py`; `use_cases/applications/finalize_application.py` `FinalizeApplicationWithOutcomeUseCase`,
event + `finalized_at` in one commit l.161-163) whenever saving closes; `POST /applications/{id}/timeline` otherwise.
0.1.4 body on `/finalize` (`use_cases/compat/legacy_finalize.py`) untouched.
Why: same field set as offer/denied create (schedule interview-only, R-038); atomic; same 409 on closed; covered by
`backend/tests/integration/test_finalize.py`, `backend/tests/unit/test_finalize_application.py`. Seed script, backend CHANGELOG: nothing.

## Frontend
Module: `frontend/src/components/timeline/`, `frontend/src/components/applications/`, `frontend/src/app/globals.css`.
- `timeline-options.ts`: add `CLOSE_TYPE_OPTIONS` = None + offer + denied. None chip: "None", `CircleDashed`, copy
  `FINALIZE_OUTCOME_COPY.none` (port from `finalize-outcome-fields.tsx` whole).
- `event-type-selector.tsx`: `options?` prop (default `EVENT_TYPE_OPTIONS`); value `TimelineEventType | "none"` local to
  the selector; `grid-cols-3` both. "none" never reaches `CreateTimelineEventPayload`.
- `timeline-event-dialog.tsx`: `mode` adds `"close"`: title `FINALIZE_DIALOG_COPY.title`, description
  `FINALIZE_REVERSIBLE_COPY` (R-027). Footer `flex-wrap`.
- `timeline-event-form.tsx`: prop `purpose?: "event" | "close"` (default `"event"`); mode = close | edit | create.
  - Close: `CLOSE_TYPE_OPTIONS`, default `"none"`, no checkbox, submit "Close application". none →
    `useFinalizeApplication().mutate({applicationId})` (bodyless); offer/denied → `{applicationId, payload}`.
  - Create: `close_application` field, `true` on every `form.reset` (open), kept while open. Checkbox only for
    offer/denied, footer before Cancel (`mr-auto`), "Close the application" + hint "You can reopen it later." Ticked →
    finalize with payload; unticked or interview → `useCreateTimelineEvent` (today). Submit stays "Add event".
  - Edit: no checkbox, never closes. Lift `<Form {...form}>` above `TimelineEventDialog` (footer `FormField` needs context).
  - `closing` (close + offer/denied, or create + offer/denied + ticked) → `DatePickerInput maxDate={new Date()}` + error
    "Pick today or an earlier date to close the application". Finalize toasts "Application closed" / `getApiError`.
- `timeline-event-schema.ts`: `close_application: z.boolean()` on create values; `none` branch for close; closing date
  refine; `toFinalizeOutcomePayload(values)` (new): offer → outcome, event_date, observation (trimmed or undefined), salary
  trio; denied → outcome, event_date, observation, denied_reason. Port `toFinalizePayload` + `finalizeSchema` limits from
  `finalize-dialog.tsx` whole (observation ≤ 5000, amount `^\d{1,10}(\.\d{1,2})?$`, period monthly|annually, `DENIED_REASONS`).
- `components/ui/checkbox.tsx` (new): `pnpm dlx shadcn@latest add checkbox` (new-york; `radix-ui` already a dep).
- `app/(protected)/applications/applications-page.tsx`: l.43 import + l.565 mount → `<TimelineEventForm purpose="close"
  applicationId=… open=… onOpenChange=… otherEvents={[]} />`, same state `onFinalizeClick` sets. Flag in
  `application-item.tsx` l.206-212 unchanged. `hooks/use-finalize-application.ts` unchanged.
- Removed: `components/applications/finalize-dialog.tsx`, `finalize-dialog.test.tsx` (cases ported, see Tests),
  `finalize-outcome-fields.tsx` (only importer: finalize-dialog). `application-close-copy.ts` kept; drop exports left
  unused (`FINALIZE_FIELDS_COPY`; `FINALIZE_OUTCOME_COPY` unless the None chip reads it).
Palette: `app/globals.css` `@layer base` `:root` / `.dark`. Source `git -C applika show 9661a38:frontend/src/app/globals.css`
l.312-415. Token: light · dark (HSL); "= x" = same original HSL as x, both themes.
  `--background` 40 18% 96% · 228 22% 8%            `--foreground` 225 25% 12% · 40 12% 90%
  `--card` 40 20% 99% · 228 20% 11%                  `--primary` 168 65% 38% · 168 70% 48%
  `--primary-foreground` 0 0% 100% · 228 22% 8%      `--secondary` 40 12% 93% · 228 16% 15%
  `--secondary-foreground` 225 20% 18% · 40 10% 82%  `--muted` 40 10% 91% · 228 16% 15%
  `--muted-foreground` 225 10% 45% · 228 10% 50%     `--accent` 168 45% 94% · 228 18% 17%
  `--accent-foreground` 168 65% 28% · 40 12% 90%     `--destructive` 0 65% 48% · 0 55% 45%
  `--destructive-foreground` 0 0% 100% · 0 0% 100%   `--success` 160 60% 40% · 168 60% 42%
  `--warning` 38 90% 50% · 38 90% 50%                `--border` 40 12% 88% · 228 14% 18%
  `--sidebar` (orig `--sidebar-background`) 40 18% 98% · 228 22% 9%   `--sidebar-accent` 168 45% 94% · 228 18% 15%
  `--sidebar-border` 40 12% 90% · 228 14% 16%. `--card-foreground`, `--popover-foreground` = foreground; `--popover` = card;
  `--input` = border; `--ring`, `--sidebar-primary`, `--sidebar-ring` = primary; `--sidebar-foreground` = muted-foreground;
  `--sidebar-primary-foreground` = primary-foreground; `--sidebar-accent-foreground` = accent-foreground.
  Derived (ADR-0022): `--surface` = card; `--surface-elevated` = popover; `--primary-muted` = primary `/ 0.12`; `--info` =
  primary; `--chart-1..5` = primary, success, warning, destructive, muted-foreground; `--border-strong` = 40 12% 82% · 228 14% 24%.
  Shadows: light already equal the original. Dark → orig l.409-412: card `0 0 0 1px` white/0.04 + `0 2px 8px -1px`
  black/0.4; elevated `0 8px 32px -4px` black/0.5 + `0 0 0 1px` white/0.05 (as `oklch(1 0 0 / a)` / `oklch(0 0 0 / a)`).
  Literals: `--shadow-glow` (@theme l.69-71) → `0 0 24px -4px` dark primary /0.25 (orig l.264). `gradient-mesh`
  (l.168-205) → orig l.222-259: light 168 65% 38% /0.08, 200 60% 50% /0.06, 40 30% 50% /0.03; dark 168 70% 48% /0.08,
  200 60% 50% /0.05, 260 40% 50% /0.04. Rewrite palette comments l.316-322, l.381.
  Not ported: `--success-foreground`, `--warning-foreground`, `--shadow-panel` (nothing maps or uses them today), radius
  0.625rem, fonts, `admin-gradient-line`. Kept: `cv-document-blocks.tsx` `blue-700`; seniority `blue-*` in
  `admin/users/users-page.tsx`, `admin/user-activity-table.tsx`.
  FLAG: oklch numbers NOT computed here. Engineer converts each HSL per CSS Color 4 (HSL → sRGB → linear sRGB → OKLab,
  Ottosson M1/M2 → OKLCH), L and C to 3 decimals, H to 1 decimal, achromatic `L 0 0`, with the parity test's converter.
  The test is the proof, not hand arithmetic.
Design system: none named. `frontend/CLAUDE.md` binds: "### Forms" (`useWatch`, never `form.watch()`), "### Application
Timeline" (type groups unmounted, dialog shape), "### Date Inputs" (`DatePickerInput`), "### UI Components" (tokens only in
`globals.css`). i18n: none. Pattern files: `timeline-event-form.tsx`; `finalize-dialog.tsx` (port source, then delete).

## Contract
No new route, no new field. Pinned as used:
- `POST /applications/{id}/finalize`, no body → 200 `Application` (already closed: no-op 200).
- same, `{outcome:"offer", event_date?, observation?, salary_amount, salary_currency, salary_period:"monthly"|"annually"}`
  | `{outcome:"denied", event_date?, observation?, denied_reason?}` → 200 `Application`; 404 not owned; 422 archived; 409
  "Reopen the application to edit it" when closed; 422 `event_date` past UTC today + 1; 422 bad salary/period/reason.
- `POST /applications/{id}/timeline` → 201 `TimelineEvent`, unchanged.
CLI `applications timeline add` (`cli/src/applika/commands/applications/commands.py` l.1240-1376):
- `--keep-open` bool flag, default off. Help: "Offer or denied: add the event and keep the application open. Ignored
  with --type interview."
- Validate `TimelineEventCreate` first (errors and texts unchanged). Offer/denied without `--keep-open` →
  `FinalizeOutcomePayload` (`schemas/application.py` l.119) from the same values → `client.post('/applications/{id}/finalize',
  payload)` → `print_finalize_outcome_summary(app, 'Added event and closed application', outcome=…)`. Else `/timeline` +
  `print_timeline_event_summary` (today); interview + `--keep-open` → today's path, no message.
- `ApiError` → `_echo_api_error(exc, reopen_hint_id=…)` on both paths (409 reopen hint, 422 detail, exit 1).

## Tests
Unit (vitest):
- `timeline-event-form.test.tsx`: close (None/Offer/Denied, no Interview, opens on None, no checkbox, None → finalize
  without payload, offer → trio payload, denied → reason `unknown`, reversible copy, date max today); create (no None;
  checkbox only offer/denied, ticked on open, ticked → finalize not create, unticked → create not finalize, future date +
  ticked → error, nothing sent, reopen → ticked again, choice kept Offer→Interview→Offer); edit (no checkbox). Port every
  describe of `finalize-dialog.test.tsx` (reversible copy, outcome-gated fields R-032, server-limit parity, outcome date,
  denied reason) into close-mode cases.
- `timeline-event-schema.test.ts`: `toFinalizeOutcomePayload` per type; closing date refine.
- `timeline-event-dialog.test.tsx`: close-mode title + reversible description.
- `src/app/globals-palette.test.ts` (new): reads `globals.css`, pins the table above (light + dark), converts each
  `oklch()` and each HSL to sRGB, |Δ| ≤ 1.5/255 per channel (alpha ignored); asserts the derived rules; asserts no
  `oklch(… 255` hue left.
CLI (`cli/tests/test_timeline_and_finalize.py`): offer/denied add tests at l.156, 493, 539, 565 gain `--keep-open`, still
`/timeline`; new: offer default → `/finalize` body = outcome payload; denied default → reason unknown on `/finalize`;
interview + `--keep-open` → `/timeline`, exit 0, no warning; 409 on `/finalize` → reopen hint; 422 future date → detail,
exit 1. Integration (backend): none new.
E2E: `frontend/e2e/timeline.spec.ts`: close flows l.212-224, l.285-310, l.419-440 switch `getByRole("alertdialog")` →
`getByRole("dialog")` ("Close application" + `/reversible/` stay). New test: Add event → Offer, box ticked → "Closed",
offer on timeline; Reopen; Add event → Denied unticked → stays open.

## Docs
- `cli/CHANGELOG.md` `[Unreleased]`: Added `--keep-open`; Changed "applications timeline add --type offer|denied closes the
  application with that event (POST /applications/{id}/finalize outcome body); --keep-open keeps it open; ignored with
  --type interview." `cli/src/applika/skills/applika-cli/SKILL.md` (l.253, l.296-306), `cli/CLAUDE.md` command table.
- `frontend/CLAUDE.md`: outcome-picker bullet → close mode + checkbox; key-files row → `timeline-event-form.tsx`; palette note.

## Rules that bind
- cli-compatibility: 0.1.4 routes + finalize body untouched; `timeline` is in no published CLI. changelogs: CLI entry
  only (no backend change). beta-features point 7: existing screens/command, no FeatureKey.
- quality-gates: frontend lint, prettier, tsc, vitest, build; CLI lint + test; e2e real stack. prod-release-runbook: no
  migration, no Release A/B. branches-and-commits: from `develop`, conventional commits, no ticket key.

## Risks
- Contrast: components styled on blue (badges, fit badge, beta badge, radio ring); dark `--primary-foreground` is dark
  on teal. Owner reviews screenshots of both themes before merge.
- Dark elevation flattens: original card = popover, so `surface` = `surface-elevated`; borders carry it. develop users
  of `timeline add --type offer` now close by default (no published version has the command).
- Footer checkbox outside `<form>` needs the lifted `FormProvider`. "none" stays in selector/close schema only; tsc guards.

## Open
- ADR-0022 Proposed: owner accepts at sign-off; orchestrator then adds "Amended by: ADR-0022" to ADR-0006. No markers.
