# Tasks 0011 — Agenda tabs rework and API rate limiting

PRD: docs/prd/0011-agenda-tabs-and-rate-limit.md   Plan: docs/plan/0011-agenda-tabs-and-rate-limit.md
ADRs bound: 0015 (Accepted 2026-09-26, drafted by this feature; amended 2026-09-27 under Consequences for the CLI refresh 429), 0001, 0002, 0006, 0009, 0010, 0012. All read Accepted (checked 2026-09-27).

## Order
K1 = agenda page + stage label → K2 = agenda card links, read-only timeline, agenda E2E → K3 = API rate limiter (backend) → K6 = applika-cli 1.0.1 keeps the session on a refresh 429 → K4 = web 429 handling → K5 = closing

- **Slices.** K1..K6, set 2026-09-27.
  - The owner approved the 5-slice table on 2026-09-26.
  - K6 was added on 2026-09-27 for the PRD amendment (R-028, US8, "Fix in a new CLI version"). K6 is numbered after K5 but builds before it.
- **Cap.** Owner: "create up to 6 tickets", closing included. This set has 6, the cap.
  - Plan S1 (agenda, frontend) is more than a day, so it is split into K1 and K2 on the same stories. K2 depends on K1.
  - S2 (backend limiter) = K3. S3 (web 429) = K4. S4 (CLI 1.0.1) = K6. Closing = K5.
  - Stories stay as `[USn]` tags. The owner's cap wins over the one-story, one-day rule.
- **No foundation slice.** Plan `## Data`: no table, no Alembic revision, Redis keys only. Those keys live in the pure `app/core/rate_limit.py` (K3).
- **Priority.**
  - US1..US3 (P1) and US4 (P2) share K1: the search, the stage filter and the tab counts (R-004) sit on one screen with the tabs.
  - US7 (P2, settings) shares K3 with US5/US6 (P1): the on/off switch lives in the middleware.
  - US8 (P2) is K6, after K3 because it relies on the 429 contract.
- **deps:**
  - K1 none; K2 = K1; K3 none (the limiter does not touch the agenda);
  - K6 = K3 (the refresh 429 contract, and the `[Unreleased]` CLI entry K3 writes);
  - K4 = K3 (it reads K3's headers and 429 body);
  - K5 = K2 + K4 + K6.
- **One branch.** `integration/0011-agenda-tabs-and-rate-limit`, cut from local `develop`. Local develop holds the 0010 merge `f90eb79` (unpushed, 2026-09-26).
  - The first slice started cuts the branch. Every later one builds on it.
  - Build in `## Order`. K3 is ready at the same time as K1 by deps only.
- **AC.** Each AC is the PRD requirement sentence, verbatim, with the `R-nnn` prefix dropped (house precedent). Rule ACs carry their rule path.

### Release (runbook: no migration, one release)
- One release. No Alembic revision, so there is no expand-first split (`.claude/rules/prod-release-runbook.md` 4 does not bind).
- K1..K4 tips are not merge points. The K5 tip is tagged `0011-release` (local). The owner merges it into `develop` and releases.
- Owner deploy steps (plan `## Release`), owner only:
  1. set `RATE_LIMIT_AUTH=600` on the API service;
  2. read the Traefik overlay subnet with `docker network inspect <traefik-network> --format '{{(index .IPAM.Config 0).Subnet}}'`;
  3. set `FORWARDED_ALLOW_IPS=<subnet>`, then run `docker service update`;
  4. check that the request log `client_ip` shows real, varying addresses (this check only works after K3 T031, see Plan corrections 1);
  5. remove `RATE_LIMIT_AUTH=600`.
- The same merge to `main` publishes `applika-cli` 1.0.1 to PyPI (`.github/workflows/cli-cd.yaml` runs on a push to `main` touching `cli/**`). 0.1.4, 0.2.0 and 1.0.0 stay as they are and still log out on a refresh 429 (PRD non-goal, owner-accepted 2026-09-27).
- Rollback: point the stack at the previous image. No data to restore; the Redis keys expire at the end of their window + 1 s. PyPI has no rollback: 1.0.1 stays published, and a fix goes in 1.0.2.
- An agent never touches prod.

### Plan corrections (checked against the code, 2026-09-26)
1. **The request log reads the raw header.**
   - `backend/app/config/middleware.py` l.24-29 sets `client_ip` from the leftmost `X-Forwarded-For` value, and falls back to `request.client.host` only when the header is absent.
   - So release step 4 and ADR-0015 Consequences step 3 would check a value the client can forge. It does not change with `FORWARDED_ALLOW_IPS`.
   - The plan also says "Never read raw `X-Forwarded-For`".
   - K3 T031: `client_ip = request.client.host`. That is the address uvicorn resolves, trusting only `FORWARDED_ALLOW_IPS`, and the same address the limiter counts (R-022).
2. **The Redis call has no time bound.**
   - `backend/app/config/redis.py` builds the client with no socket timeouts.
   - The limiter runs on every route. A Redis that hangs, for example a swarm VIP with no task that drops packets, would hold every request. That breaks R-021 and the success signal "A Redis outage does not take the API down".
   - K3 T027 bounds the limiter's pipeline with `asyncio.timeout(0.5)`, a module constant, not a new setting. A timeout fails open with a WARNING.
3. **Key expiry.**
   - The plan says "TTL window + 1 s" on every hit. That stretches a key hit late in its window to almost two windows.
   - ADR-0015 says "A key expires one second after its window ends". PRD Permissions says counters "expire when their window ends".
   - K3 uses `EXPIREAT (window_index + 1) * window + 1`.
4. **R-024 "tries again after the wait", and a cold load.**
   - The plan's "return cached data" waits for the next 10-minute poll (`auth-context.tsx` `CONNECTED_INTERVAL`).
   - The plan's "no cache → rethrow" sends a signed-in user to `/login` (`(protected)/layout.tsx` l.22-26), against "keeps the user signed in".
   - K4 T040: the refresh query retries on 429 only, with `retryDelay` = `Retry-After`. A 429 never makes the query an error: with cached data it stays success; on a cold load it stays loading.
5. **A 429 on `/users/me` also signs the user out.**
   - `auth-context.tsx` l.65: `isAuthenticated = !!user && !isUserError && !isAuthError`. A 429 on a `/users/me` refetch (window focus, invalidation) redirects to `/login`.
   - That is against the success signal "no signed-in web user is signed out by one".
   - K4 T041 gives `useUserProfile` the same 429 retry.
6. **R-025 has no plan step.**
   - Six error toasts show fixed text and would hide the server's retry message:
     - `hooks/use-applications.ts` l.191 "Failed to delete";
     - `hooks/use-cycles.ts` l.31 and l.50;
     - `hooks/use-user.ts` l.28 "Failed to update profile";
     - `hooks/use-repports.ts` l.88;
     - `components/applications/feedback-dialog.tsx` l.65.
   - Every other toast already shows `getApiError(error)` = `detail`, so it shows the 429 message unchanged.
   - K4 T042 fixes the six. Query error states and the draft autosave status ("Not saved" + Retry) keep their own words: they are not the app's usual error notice (the sonner toast, frontend `CLAUDE.md`).
   - The new agenda page shows `detail` when its load fails (K1 T010). Today it shows the empty state on an error.
7. **Installed CLIs drop their session on a 429 refresh. Settled by the owner on 2026-09-27: "Fix in a new CLI version".**
   - `cli/src/applika/lib/api.py` l.83-87: `_refresh()` clears the stored session on any non-200 from `/auth/refresh`.
   - The CLI refreshes with an expired `__access`, so the refresh counts per IP in the `/auth/*` bucket. A 429 there prints "Please run `applika login` again." and the stored session is gone.
   - The PRD now carries R-028, US8, two edge cases and two non-goals: "Waiting or retrying on its own in `applika-cli` after a 429, …" and "Changing installed `applika-cli` versions. …".
   - The plan now has S4, and ADR-0015 has a dated amendment under Consequences.
   - K6 ships `applika-cli` 1.0.1: a refresh 429 keeps the session and raises `ApiError(detail, 429)`, with no wait and no retry. 0.1.4, 0.2.0 and 1.0.0 still log out.
   - K3 T036 records the old versions' behaviour in the CLI CHANGELOG; K6 T059 records the fix.
8. **Test clients send no session cookie.**
   - `tests/conftest.py` `async_client` overrides `get_current_user` and sends no `__access`. Every limiter test request is therefore `ip:127.0.0.1` unless the test sets a real cookie minted with `app/core/tokens.py:create_access_token(sub)`.
   - A second IP needs `ASGITransport(app=main_app, client=("10.0.0.2", 123))`.
9. **Root path, both shapes.**
   - `FastAPI(root_path=envs.API_PREFIX)` puts `/api` in `scope['root_path']`.
   - `scope['path']` holds `/api/...` when the proxy keeps the prefix (and in tests, `base_url=http://test/api`), and `/...` when the proxy strips it.
   - Strip `root_path` only when `path` starts with it.
10. **The `get_redis` override is async.** `redis = await scope['app'].dependency_overrides.get(get_redis, get_redis)()`.
11. **Frontend `CLAUDE.md` is not named by the plan.** It asks to be updated on a new UI pattern, a new routing shape and a token-refresh change. K1, K2 and K4 update it.
12. **Tests that already exist.**
    - `components/applications/application-item.test.tsx` exists; K2 extends it for `defaultExpanded`.
    - `timeline-options.test.ts` has no `stageLabel` assertion today; K1 adds one.
    - `dashboard-stage-rows.test.ts` builds its labels with `stageLabel`, so it needs no change.
    - No e2e spec asserts the "·" stage text.
13. **No PRD as-built notes.** No earlier PRD in `docs/prd/` names the "·" stage text (grep), and the agenda API is unchanged.
14. **Image tab order.** `docs/refs/agenda-rework.png` shows Past before Upcoming. R-003 (Upcoming first, selected) wins.

### Plan corrections, S4 / K6 (checked against the code, 2026-09-27)
15. **Not every command prints just the `ApiError` detail.**
    - The plan says "Commands already print an `ApiError` detail and exit 1". Most commands do (`cv_shared.api_error`, `_echo_api_error`).
    - `applications list` (`commands/applications/commands.py` l.128-153) catches only `ValueError`. So do the deprecated `steps` commands. There an `ApiError` reaches Typer's own exception output, whose last line is the detail, and the exit code is 1.
    - That is how 1.0.0 already shows any API error there. R-028 says "No command, flag or output of earlier versions changes", so K6 does not add a global handler.
    - The refresh 429 still "fails with the server's retry message". K5 T053 looks at both kinds of output.
16. **Version.** `pyproject.toml` is `1.0.0`. The installed version is read from package metadata (`commands/version.py`, `importlib.metadata`), so no source file pins it. No test asserts "1.0.0" (grep).
17. **Docs.** `cli/CLAUDE.md` does not describe the refresh, so it needs no change. `cli/README.md` l.52 does ("The session refreshes automatically on expiry"), so K6 adds one sentence there. The bundled `SKILL.md` does not mention the refresh.
18. **The 1.0.1 heading takes everything under `[Unreleased]`.** Today that is the earlier API notes from features 0009 and 0010, plus K3's 429 entry. The plan says `[Unreleased]` → `[1.0.1] - <date>`. K6 leaves a new empty `## [Unreleased]` above it (Keep a Changelog).

## K1 — Agenda page: Upcoming | Past tabs, date groups, rich cards, search and stage filter; hyphen stage label with the old calendar UID   side: frontend   covers: R-001 (every element; the chevron's content and the link's landing in K2), R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-009, R-010, R-013, R-014, R-015, R-027   deps: —
Owner's words: "i want to remake the agenda page using this image as reference @docs/refs/agenda-rework.png two tabs - upcoming and past - upcomming first and active by default, the tab content, make as is in the image, that calendar button keep the current behavior that creates a calendar file."
Clarified: "Keep window, client-side (Recommended)"; "Button on Upcoming cards (Recommended)"; "Hyphen everywhere"; "Keep old UID (Recommended)".
Touch:
- frontend/src/app/(protected)/agenda/agenda-page.tsx
- frontend/src/app/(protected)/agenda/agenda-page.test.tsx (new)
- frontend/src/components/agenda/agenda-view.ts (new)
- frontend/src/components/agenda/agenda-view.test.ts (new)
- frontend/src/components/agenda/agenda-date-group.tsx (new)
- frontend/src/components/agenda/agenda-item-card.tsx (new)
- frontend/src/components/timeline/timeline-options.ts
- frontend/src/components/timeline/timeline-options.test.ts
- frontend/src/components/timeline/timeline-event-actions-menu.tsx (docstring only)
- frontend/src/lib/calendar.ts
- frontend/src/lib/calendar.test.ts (new)
- frontend/src/components/layout/agenda-dropdown.test.tsx
- frontend/src/components/dashboard/chart-styles.test.tsx
- frontend/CLAUDE.md
Pattern:
- docs/refs/agenda-rework.png (element list R-002, R-006, R-007; tab order per R-003)
- frontend/src/app/(protected)/applications/applications-page.tsx (toolbar l.148-188; Tabs l.395-425)
- frontend/src/components/applications/application-item.tsx (card shell l.83-120, `Collapsible`)
- frontend/src/components/applications/icon-tile.tsx
- frontend/CLAUDE.md "### UI Components" (tabs `variant="line"`, `font-numeric`, `font-display`), "### Application Timeline" (`stageLabel`, `timeZoneLabel`); ADR-0006 tokens in src/app/globals.css
Steps:
- T001 [US1] Branch and start:
  - check that `git log --oneline develop` holds `f90eb79` (the 0010 merge); if it does not, stop and ask the owner which base to cut from;
  - if `integration/0011-agenda-tabs-and-rate-limit` does not exist, `git switch -c integration/0011-agenda-tabs-and-rate-limit develop`; otherwise switch to it;
- T002 [US1] Create frontend/src/components/agenda/agenda-view.ts (new), pure:
  - move `parseTime`, `convertToLocalTime`, `getDisplayTime` and `isStepPast` out of agenda-page.tsx, with `now` and the viewer's zone injectable for tests;
  - `splitAgenda(items, now)` → `{upcoming, past}`: upcoming soonest first, past most recent first, by local start (R-005). An untimed interview stays upcoming until its day is over;
  - `groupByDate(items)` on `step_date`, keeping the tab's order (R-006).
- T003 [US4] In agenda-view.ts, `filterAgenda(items, {search, interviewType})`:
  - case-insensitive substring on `company_name` or `role` (R-009);
  - `interviewType` "all" or an exact `interview_type` match (R-010).
- T004 [P] [US1] Vitest frontend/src/components/agenda/agenda-view.test.ts (new):
  - the split boundary: timed today before and after now, untimed today, another zone;
  - both sort orders;
  - search on company and on role, any case; the stage filter;
  - grouping, including two interviews of one application on one date;
  - counts after filtering.
- T005 [US3] Stage label (R-027):
  - frontend/src/components/timeline/timeline-options.ts l.326 `${base} · …` → `${base} - …`; docstrings l.317 and l.331;
  - frontend/src/components/timeline/timeline-event-actions-menu.tsx l.18 docstring.
  - Callers, no code change: `contexts/agenda-notifications-context.tsx` l.118, `components/layout/agenda-dropdown.tsx`, `components/dashboard/step-conversion-chart.tsx`, `avg-days-per-step-chart.tsx`, `components/timeline/timeline-section.tsx` l.189.
  - Untouched: the zone "·" in `timeline-format.ts` and the CV keyword separator (pinned with the server).
- T006 [US3] Calendar file (R-008), in frontend/src/lib/calendar.ts:
  - add a local `legacyStageLabel(eventType, interviewType)` = `EVENT_TYPE_CONFIG[t].label` + " · " + `INTERVIEW_TYPE_LABELS[it ?? DEFAULT_INTERVIEW_TYPE]` for interviews, the label alone otherwise — `stageLabel` as it was;
  - use it ONLY in the `UID:` line (l.91);
  - SUMMARY (l.37, l.92) and `a.download` (l.102) keep `stageLabel`, so they take the hyphen;
  - the docstring says why: re-importing a pre-release file updates the same entry (owner, 2026-09-26).
- T007 [P] [US3] Vitest:
  - frontend/src/lib/calendar.test.ts (new): capture the Blob text (mock `URL.createObjectURL` and the anchor click):
    - the UID line equals `UID:<application_id>-<yyyymmdd>-Interview · Technical@applika`;
    - SUMMARY and the download filename carry "Interview - Technical";
    - an untimed interview gives `VALUE=DATE`;
    - the test fails on a revert of either the UID freeze or the label change;
  - frontend/src/components/timeline/timeline-options.test.ts: `stageLabel("interview", "initial_screening")` === "Interview - Initial screening"; `stageLabel("offer")` === "Offer";
  - frontend/src/components/layout/agenda-dropdown.test.tsx l.43 → "Interview - Technical";
  - frontend/src/components/dashboard/chart-styles.test.tsx l.12 and l.18 fixture → "Interview - Initial screening".
- T008 [US1] Create frontend/src/components/agenda/agenda-date-group.tsx (new):
  - a header bar: `format(d, "MMM d, yyyy")` in `font-display`, and "1 application" / "N applications";
  - then its cards (R-006).
- T009 [US1] Create frontend/src/components/agenda/agenda-item-card.tsx (new). Shell as application-item.tsx: `article`, `IconTile icon={Building2}`, `Collapsible` closed by default.
  - Left column: start in `font-numeric font-semibold`, end muted. No end → start only. No start → "All day".
  - Body: company name, role. Meta row: `CalendarDays` date · `Clock` range, plus "(converted)" when the zone differs · `MapPin` `timeZoneLabel(tz)` (R-007).
  - Right:
    - the stage pill: a `Badge` with the `EVENT_TYPE_CONFIG`/`INTERVIEW_TYPE_CONFIG` class and dot, text `stageLabel(...)`;
    - a square calendar button, `CalendarPlus` → `genAgendaStepIcsFile(step)` + toast "Calendar event downloaded" (R-008, US3);
    - the alert button (R-013): square, `Bell`/`BellRing`, beside the calendar button, only when `!isPast && step.start_time`. It uses `useAgendaNotifications()` `isEnabled(id)`/`toggle(id)` and keeps the tooltips "Alert at 30, 15 & 5 min before" / "Disable sound alerts";
    - the chevron: a `CollapsibleTrigger`. Its content comes in K2.
  - Nested row: `FileText` + `observation`, or "No notes" muted; a `Link` with `ExternalLink` → `/applications?focus=${application_id}`, accessible name `Open ${role} at ${company_name}`. The landing comes in K2.
  - Every icon button has an accessible name. Long company, role or note text wraps or truncates (`min-w-0`, buttons `shrink-0`). No urgency dot (PRD Assumption).
- T010 [US1] Rewrite frontend/src/app/(protected)/agenda/agenda-page.tsx:
  - Header (R-002): `IconTile` with the calendar icon, h1 "Agenda" (kept for `e2e/smoke.spec.ts` l.83-85), subtitle "Your application steps organized by date".
  - `useAgenda()` unchanged (R-014).
  - Tabs (R-003, R-004): copy applications-page.tsx l.404-422.
    - `Tabs defaultValue="upcoming"`, `TabsList variant="line"`, Upcoming then Past;
    - a count `Badge aria-hidden`, and a trigger `aria-label` "Upcoming (n)" / "Past (n)", counted after the filter.
    - Tab, search and filter live in component state only, never in the URL (PRD Assumption).
  - Empty state per tab (R-015):
    - "No upcoming interviews" / "No past interviews in the last 30 days", with the link to Applications;
    - "No interviews match your search" when the search or the filter emptied the tab.
  - A load error shows the server's `detail` (`getApiError`) instead of an empty state.
  - Only ADR-0006 tokens, light and dark (R-001).
- T011 [US4] Toolbar on the right of the header, copied from applications-page.tsx l.148-188 (R-002, R-009, R-010):
  - `Search` + `Input`, placeholder "Search applications...";
  - a `Select` with the `Filter` icon: "All stages" + `INTERVIEW_TYPES`, labels from `INTERVIEW_TYPE_CONFIG`;
  - it feeds `filterAgenda` before `splitAgenda`, so both counts follow (R-004).
- T012 [P] [US1] Vitest frontend/src/app/(protected)/agenda/agenda-page.test.tsx (new), with the services mocked:
  - Upcoming is first and selected on open; the tab names carry the counts;
  - the counts follow search and filter, and the other tab's count still shows its matches;
  - group headers read "1 application" / "2 applications";
  - card: the time column, "All day", the readable zone, the pill "Interview - Technical", "No notes";
  - the calendar button calls the mocked `genAgendaStepIcsFile` with the item;
  - the alert button shows on timed Upcoming cards only, never on Past;
  - the link href is `/applications?focus=<application_id>`;
  - the three empty-state texts; the error shows `detail`.
- T013 [US1] frontend/CLAUDE.md:
  - a new "### Agenda (`src/components/agenda/`, PRD 0011)" section:
    - `agenda-view.ts` is the pure split/filter/group over the same ±30-day window;
    - the card's anatomy; the alert button on Upcoming only;
    - the stage label uses " - " everywhere, but the calendar UID is frozen on the old "·" text (`calendar.test.ts` pins it; a later `stageLabel` change must not reach it);
  - in the "Dashboard + agenda read from `TIMELINE_STAGES`/`stageLabel`" bullet, note the UID exception.
- T014 [US1] Gate:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - `scripts/e2e.sh e2e/smoke.spec.ts e2e/auth-guard.spec.ts` green;
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - The K1 tip is not a merge point.
AC:
- The web agenda page follows `docs/refs/agenda-rework.png` element by element, in the current visual identity, in light and dark themes.
- The page header shows a calendar icon tile, the title "Agenda" and the subtitle "Your application steps organized by date", with a search field ("Search applications...") and a stage filter ("All stages") on the right.
- The page shows two tabs, Upcoming then Past. Upcoming is selected every time the page opens.
- Each tab shows how many interviews it lists after the search and the stage filter.
- The system lists under Upcoming the agenda interviews that have not started yet, soonest first. It lists under Past those that have started, most recent first. An interview with no start time stays upcoming until its day is over.
- Each tab groups its interviews by date. Each group has a header bar with the date and the number of interviews on that date.
- Each interview card shows the start time in bold and the end time muted in a left column. It also shows a company tile, the company name, the role, and a line with the date, the time range and the readable time zone. On the right it shows a stage pill, a square calendar button and a chevron. Inside the card, a nested row shows a document icon, the interview's note and an external-link icon.
- The calendar file for an interview is built as the agenda builds it today. Only the stage text in the file's title and file name follows R-027. The event's identity inside the file stays exactly as it is today, so importing it again updates the same calendar entry.
- The search keeps the interviews whose company name or role contains the typed text, ignoring case.
- The stage filter offers "All stages" and each interview type, and keeps only the interviews of the chosen type.
- The per-interview sound alert (30, 15 and 5 minutes before) stays. A square button beside the calendar button turns it on and off, on Upcoming cards of interviews that have a start time. Past cards show no alert button.
- The agenda reads the same interviews, over the same window of 30 days before and after today, as it does today.
- Each tab shows an empty state when it has nothing to list. The message says whether the tab is empty or the search and filter left nothing.
- The web app names every stage with a spaced hyphen between the event type and the interview type, for example "Interview - Initial screening". This applies everywhere the shared stage label appears: the agenda pill, the header agenda dropdown, agenda alerts, dashboard chart tooltips, timeline event action names, and the calendar file's title and file name. The calendar event's identity keeps the old "·" stage text (R-008). Other separators stay as they are, such as the dot between a time range and its zone and between CV keywords.

## K2 — Agenda card links: focused applications list, read-only timeline under the chevron, agenda E2E   side: frontend (+ E2E)   covers: R-001 (completed), R-011, R-012   deps: K1
Owner's words: "i want to remake the agenda page using this image as reference @docs/refs/agenda-rework.png two tabs - upcoming and past - upcomming first and active by default, the tab content, make as is in the image, that calendar button keep the current behavior that creates a calendar file."
Clarified: "Applications, focused (Recommended)"; "Read-only timeline (Recommended)".
Touch:
- frontend/src/components/agenda/agenda-item-card.tsx
- frontend/src/app/(protected)/agenda/agenda-page.test.tsx
- frontend/src/app/(protected)/applications/page.tsx
- frontend/src/app/(protected)/applications/applications-page.tsx
- frontend/src/app/(protected)/applications/applications-page.test.tsx
- frontend/src/components/applications/application-item.tsx
- frontend/src/components/applications/application-item.test.tsx
- frontend/e2e/agenda.spec.ts (new)
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/cvs/editor/page.tsx (Suspense + `useSearchParams` under static export)
- frontend/src/app/(protected)/profile/profile-page.tsx (lazy `useState` from search params, one-shot `useRef`, `window.history.replaceState`)
- frontend/src/components/timeline/timeline-panel.tsx, timeline-event-list.tsx (read-only list: no `renderActions`)
- frontend/src/lib/timeline-view.ts (`toTimelineEventViews`), src/hooks/use-timeline.ts (`useTimeline(id | null)`, `enabled: Boolean(id)`)
- frontend/e2e/timeline.spec.ts (API seeding and cleanup)
Steps:
- T015 [US1] Build on integration/0011-agenda-tabs-and-rate-limit, after the K1 tip.
- T016 [US1] Chevron (R-012), in frontend/src/components/agenda/agenda-item-card.tsx, inside `CollapsibleContent`:
  - `useTimeline(open ? application_id : null)`: nothing loads until the card opens. Cards start closed;
  - `toTimelineEventViews` → `TimelineEventList` without `renderActions`, so it is read-only;
  - a Skeleton while loading; an error shows `detail`;
  - an application with only this interview → the list shows it alone.
- T017 [US1] frontend/src/components/applications/application-item.tsx: an optional `defaultExpanded?: boolean` sets the initial `isExpanded` (l.83). Absent = today's behaviour.
- T018 [US1] frontend/src/app/(protected)/applications/page.tsx wraps `ApplicationsPage` in `<Suspense>` (static export rule).
- T019 [US1] Focus (R-011), in frontend/src/app/(protected)/applications/applications-page.tsx:
  - read `focus` once through `useSearchParams`, in a lazy `useState`;
  - once the list has loaded:
    - the id is in the shown list → that row gets `defaultExpanded` and `scrollIntoView` (on the default "Applications" tab);
    - the id is not in the list (archived cycle, deleted since, filtered) → one notice, "This application is not in the cycle you are viewing.", through the app's usual toast;
  - then `window.history.replaceState(null, "", "/applications")`. `router.replace` is a no-op on this static export (frontend CLAUDE.md).
- T020 [P] [US1] Vitest:
  - frontend/src/app/(protected)/applications/applications-page.test.tsx:
    - `?focus=<listed id>` → that row is expanded, `scrollIntoView` is called, and the URL goes back to `/applications`;
    - `?focus=<unknown id>` → the notice text shows once, and the URL is replaced;
    - no `focus` → nothing, and no `replaceState`.
  - frontend/src/components/applications/application-item.test.tsx: `defaultExpanded` → expanded; absent → collapsed.
  - frontend/src/app/(protected)/agenda/agenda-page.test.tsx: the chevron fetches the timeline only on open (the mocked `services.timeline.list` is not called before); no event actions menu; a card starts closed.
- T021 [US1] [US2] [US3] E2E on the real stack, frontend/e2e/agenda.spec.ts (new). Seeding and cleanup follow e2e/timeline.spec.ts.
  - Setup: one application with a future interview (tomorrow, timed, a named zone) and a past interview.
  - Flow on `/agenda`:
    - Upcoming is selected with count 1, and the pill reads "Interview - …";
    - Past lists the past one; typing in the search changes the counts;
    - the calendar button downloads an `.ics` whose filename carries the hyphen label;
    - the chevron shows the timeline with both events and no actions;
    - the external link lands on `/applications` with that row expanded, and the URL is `/applications`.
  - `afterAll` deletes the application.
- T022 [US1] frontend/CLAUDE.md: add `/applications?focus=` to Routing (the Suspense shell, the one-shot read, `replaceState`, the notice); in the Agenda section, the card's read-only timeline loads on open.
- T023 [US1] Gate:
  - the frontend chain as in T014;
  - `scripts/e2e.sh e2e/agenda.spec.ts e2e/smoke.spec.ts e2e/timeline.spec.ts` green, with no applika-e2e container left;
  - The K2 tip is not a merge point.
AC:
- The web agenda page follows `docs/refs/agenda-rework.png` element by element, in the current visual identity, in light and dark themes.
- The external-link icon in the nested row opens the applications list with that interview's application expanded and scrolled into view. When the list being shown does not hold that application (for example, it belongs to an archived cycle), the list opens as usual and a notice says the application is not in the current cycle.
- The chevron opens and closes, under the card, that application's timeline in read-only form. The timeline loads only when the card is opened. Cards start closed.
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K3 — API rate limiter: per user with IP fallback, fixed window in Redis, 429 with Retry-After and X-RateLimit-*, config switch, fail open   side: backend   covers: R-016, R-017, R-018, R-019 (API half: headers, CORS exposure), R-020, R-021, R-022, R-023, R-026   deps: —
Owner's words: "I also want to implement pagination to agenda and applications list in this plan, by default the first page fetches the first 20, implement infinite scroll"
Clarified (replaces that sentence): "drop pagination change for agenda and applications, instead, let's implement a rate limiter to the api using redis, currently we dont have any." Then "Per user, per IP fallback (Recommended)", "Config defaults + 429 (Recommended)", "this app runs in a vps with traefik".
Touch:
- backend/app/config/settings.py
- backend/app/core/rate_limit.py (new)
- backend/app/config/rate_limit.py (new)
- backend/app/config/middleware.py
- backend/app/main.py
- backend/tests/conftest.py
- backend/tests/unit/test_rate_limit.py (new)
- backend/tests/integration/test_rate_limit.py (new)
- backend/scripts/seed_mock_data.py
- docker-compose.yml
- docker-compose.e2e.yml
- backend/CLAUDE.md
- backend/CHANGELOG.md
- cli/CHANGELOG.md
Pattern:
- backend/app/presentation/deprecation.py (`DeprecationHeaderMiddleware`: pure ASGI, `MutableHeaders` on `http.response.start`)
- backend/app/core/tokens.py (`decode_token`, `create_access_token`)
- backend/app/config/redis.py (`get_redis`)
- backend/tests/integration/conftest.py (`redis_client`, `RedisContainer`)
- docs/adr/0015-redis-api-rate-limiter.md
Contract (K4 consumes):
- Every route and every method except `OPTIONS`, with the limiter on:
  - under the limit: the normal answer + `X-RateLimit-Limit: <int>`, `X-RateLimit-Remaining: <int>`, `X-RateLimit-Reset: <int s>`;
  - over the limit: `429` `{"detail": "Too many requests. Try again in <n> seconds."}` + `Retry-After: <n>` + `X-RateLimit-*` (Remaining `0`). The handler does not run;
  - Redis error or timeout: the normal answer, no `X-RateLimit-*`, and a WARNING.
- Buckets: `/auth/*` → `RATE_LIMIT_AUTH` (10); the rest → `RATE_LIMIT_DEFAULT` (120). Window `RATE_LIMIT_WINDOW_SECONDS` (60); switch `RATE_LIMIT_ENABLED` (true).
- CORS `expose_headers` += `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`.
- No route, request field or response field changes.
Steps:
- T024 [US5] Branch and start:
  - if `integration/0011-agenda-tabs-and-rate-limit` exists, switch to it;
  - otherwise cut it as in K1 T001 first;
  - confirm no migration: `grep -rn "^down_revision" backend/migrations/versions/` → one head, unchanged.
- T025 [US7] Settings in backend/app/config/settings.py (R-017, R-020):
  - `RATE_LIMIT_ENABLED: bool = True`, `RATE_LIMIT_DEFAULT: int = 120`, `RATE_LIMIT_AUTH: int = 10`, `RATE_LIMIT_WINDOW_SECONDS: int = 60`.
- T026 [US5] Create backend/app/core/rate_limit.py (new), pure:
  - `bucket_for(route_path)`: an `/auth/` prefix → `auth`, else `default` (`/authors` → default);
  - `subject_for(cookies, client_host)`: an `__access` that passes `decode_token` (signature, `exp`) with `kind == 'access'` → `user:<sub>`. Absent, expired, forged, garbage or another kind → `ip:<client_host>` (R-016).
- T027 [US5] In the same module, `Decision(allowed, limit, remaining, reset_after)` and `async hit(redis, bucket, subject, limit, window, now) -> Decision | None`:
  - key `applika:ratelimit:{bucket}:{subject}:{floor(now / window)}`;
  - one pipeline: `INCR` + `EXPIREAT (window_index + 1) * window + 1` (Plan corrections 3). A refused request never moves the window end;
  - `reset_after` = the seconds left in the window, ceil, at least 1;
  - bounded by `asyncio.timeout(0.5)` (Plan corrections 2);
  - `RedisError`, `OSError` or `TimeoutError` → `None` + WARNING `rate_limit_unavailable`, naming the bucket only, never the subject (R-021).
- T028 [P] [US5] Unit tests in backend/tests/unit/test_rate_limit.py (new):
  - `bucket_for`: `/auth/refresh` → auth, `/authors` → default;
  - `subject_for`: valid → user; expired, bad signature, `kind != access`, absent, garbage → ip;
  - `hit` on a stub pipeline: 1..N allowed with remaining counting down; N+1 refused with remaining 0; `reset_after`; the key name; the `EXPIREAT` value;
  - raising `RedisError` / `OSError` and a slow stub → `None` + WARNING (caplog), with no subject in the message.
- T029 [US5] Create `RateLimitMiddleware`, pure ASGI, in backend/app/config/rate_limit.py (new). Copy the shape of `DeprecationHeaderMiddleware`.
  - Pass through: non-http, `OPTIONS` (R-023), and `envs.RATE_LIMIT_ENABLED` false. Settings are read on every request (R-020).
  - Route path = `scope['path']` minus `scope['root_path']`, only when it is a prefix (Plan corrections 9).
  - `redis = await scope['app'].dependency_overrides.get(get_redis, get_redis)()` (Plan corrections 10).
  - Subject from the request cookies and `scope['client']` host (R-022).
  - Over the limit → a 429 `JSONResponse` with the body and headers of the Contract; the app is not called (R-018).
  - Under the limit → add the three `X-RateLimit-*` headers on `http.response.start` (R-019).
  - `None` → pass, no headers (R-021).
- T030 [US5] In backend/app/main.py:
  - `app.add_middleware(RateLimitMiddleware)` placed ABOVE the CORS block, so CORS wraps it: a 429 carries `Access-Control-Allow-Origin`, and a preflight is answered before counting;
  - `expose_headers` += `Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` (R-019);
  - the Deprecation and logging middlewares stay as they are.
- T031 [US5] In backend/app/config/middleware.py `HTTPLifecycleMiddleware`, `client_ip = request.client.host` (Plan corrections 1, R-022):
  - that is the address uvicorn resolved, trusting `X-Forwarded-For` only from `FORWARDED_ALLOW_IPS`;
  - drop the raw `X-Forwarded-For` read;
  - `grep -rn "X-Forwarded-For" backend/app/` → none.
- T032 [US6] backend/tests/conftest.py: an autouse session fixture sets `envs.RATE_LIMIT_ENABLED = False` and restores it after. Limiter tests turn it on with `monkeypatch`.
- T033 [US5] Integration tests in backend/tests/integration/test_rate_limit.py (new). They use `redis_client` and low limits through `monkeypatch` on `envs`.
  - Refusal:
    - N+1 → 429 with the body, `Retry-After` and the three headers; `Retry-After` ≤ window;
    - repeated 429s do not push the window end;
    - after the limit, a `POST /applications` → 429 and no application row is written.
  - Headers: under the limit, the three headers on the answer.
  - Subjects:
    - user A (a real `__access` from `create_access_token`) at the limit; user B on the same IP → 200;
    - anonymous requests count per IP; a second IP (`ASGITransport(client=("10.0.0.2", 123))`) is unaffected;
    - an expired token counts against the IP.
  - Buckets: `/auth/*` and the default bucket count separately; both `/api/auth/refresh` and `/auth/refresh` path shapes land in `auth`.
  - CORS: a 429 with `Origin` carries `access-control-allow-origin` and `access-control-expose-headers` naming the four headers. A preflight `OPTIONS` is not counted.
  - Switch and failure:
    - `RATE_LIMIT_ENABLED` false → no headers, never a 429;
    - Redis closed or unreachable → 200 + WARNING;
    - the key TTL is ≤ the window end + 1.
- T034 [US6] Stacks and seed:
  - backend/scripts/seed_mock_data.py: the `httpx.Client` waits `Retry-After` and retries once on a 429, in one place (a small transport wrapper);
  - docker-compose.yml and docker-compose.e2e.yml, api env: `RATE_LIMIT_DEFAULT: "100000"`, `RATE_LIMIT_AUTH: "10000"`.
- T035 [US7] backend/CLAUDE.md:
  - Environment Variables: the four settings and `FORWARDED_ALLOW_IPS` (uvicorn);
  - a new "### Rate limiting (ADR-0015)" section: buckets, subject, the fixed window and `EXPIREAT`, fail open with the 0.5 s bound, CORS order, Traefik + `FORWARDED_ALLOW_IPS`, the deploy order, tests off by default, the compose stacks raised;
  - Request ID Logging: `client_ip` is the resolved address;
  - Seed Script Rule: a 429 is waited out.
- T036 [US6] Changelogs (R-026):
  - backend/CHANGELOG.md `[Unreleased]`:
    - Added: `- API rate limiter (ADR-0015): per user, IP without a session; 120/min, 10/min on /auth/*; 429 {"detail": "Too many requests. Try again in <n> seconds."} + Retry-After + X-RateLimit-*; RATE_LIMIT_* settings; fail open.`
    - Changed: `- request log client_ip is the uvicorn-resolved address (FORWARDED_ALLOW_IPS), no longer the raw X-Forwarded-For.`
  - cli/CHANGELOG.md `[Unreleased]` Changed: `- every route may answer 429 …`:
    - no route or field changes;
    - 0.1.4, 0.2.0 and 1.0.0 print the `detail`, fail, and work again after the wait;
    - a 429 on the automatic session refresh clears the stored session in these versions (`lib/api.py` `_refresh`), so run `applika login` again;
    - settled by the owner on 2026-09-27: fixed in 1.0.1 (K6), which keeps the session.
- T037 [US6] Checks and gate:
  - CLI compatibility: `uv run pytest tests -k "steps or finalize or supports"` in backend; `make test` in cli;
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171, new and changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - full `scripts/e2e.sh` green (the limiter wraps every route; the compose limits are raised), with no applika-e2e container left;
  - The K3 tip is not a merge point.
AC:
- The system counts every API request against the signed-in user when the request carries a valid session, and against the client's IP address otherwise.
- The system allows, by default, 120 requests per minute per user or IP address on every route outside sign-in and session routes (/auth/*), and 10 per minute on /auth/*. The two are counted separately.
- The system refuses a request over the limit with 429, without doing anything the request asked. The answer carries a message that says when to retry, a Retry-After header with the seconds left in the window, and X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset headers.
- The system sends the X-RateLimit-* headers on every counted answer, and the web app can read them and Retry-After across origins.
- The system reads both limits, the window and an on/off switch from its configuration, so the owner changes them with a restart and no release.
- The system lets requests through and logs a warning when Redis is unreachable.
- The system takes the client's address from the forwarded header only when the request comes through a proxy the owner configured as trusted (in production, the owner's Traefik). Otherwise it uses the direct connection address.
- The system does not count browser preflight requests.
- No route, request field or response field changes. The backend and CLI changelogs record 429 as a new possible answer on every route.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K4 — Web 429 handling: session refresh keeps the user signed in and retries after the wait; retry message in the usual notice   side: frontend   covers: R-019 (web half), R-024, R-025   deps: K3
Owner's words: "I also want to implement pagination to agenda and applications list in this plan, by default the first page fetches the first 20, implement infinite scroll"
Clarified (replaces that sentence): "drop pagination change for agenda and applications, instead, let's implement a rate limiter to the api using redis, currently we dont have any." Then "Config defaults + 429 (Recommended)".
Touch:
- frontend/src/lib/rate-limit.ts (new)
- frontend/src/lib/rate-limit.test.ts (new)
- frontend/src/contexts/auth-context.tsx
- frontend/src/contexts/auth-context.test.tsx (new)
- frontend/src/hooks/use-user.ts
- frontend/src/hooks/use-applications.ts
- frontend/src/hooks/use-cycles.ts
- frontend/src/hooks/use-repports.ts
- frontend/src/components/applications/feedback-dialog.tsx
- frontend/CLAUDE.md
Pattern:
- frontend/src/lib/blob-error.ts (a helper kept outside api-client.ts, which imports the service container)
- frontend/src/lib/api-client.ts (`getApiError`, the 401 interceptor: it leaves the auth query alone)
Contract: as K3. Every route may answer 429 `{"detail": "Too many requests. Try again in <n> seconds."}` + `Retry-After: <n>` + `X-RateLimit-*`. CORS exposes all four.
Steps:
- T038 [US6] Build on the branch, after the K3 tip.
- T039 [US6] Create frontend/src/lib/rate-limit.ts (new), pure:
  - `isRateLimited(error)`: an axios error with status 429;
  - `retryAfterMs(error)`: the `retry-after` response header × 1000, clamped to ≥ 1000, fallback 60 000 (R-019);
  - `rateLimitNotice(error)`: the 429 `detail` string, or `null`.
- T040 [US6] In frontend/src/contexts/auth-context.tsx, the refresh query (R-024, Plan corrections 4):
  - `retry: (n, e) => isRateLimited(e)`, `retryDelay: (n, e) => retryAfterMs(e)`;
  - a 429 never sets `isAuthError`: with cached data the query stays success; on a cold load it stays loading until the retry passes;
  - other errors are unchanged (no retry → error → `/login`, as today).
- T041 [US6] In frontend/src/hooks/use-user.ts, `useUserProfile` gets the same 429 retry, so `isUserError` never flips on a 429 (Plan corrections 5).
- T042 [US5] Fixed-text toasts become `rateLimitNotice(err) ?? "<same text>"` (R-025, Plan corrections 6):
  - use-applications.ts l.191;
  - use-cycles.ts l.31, l.50;
  - use-user.ts l.28;
  - use-repports.ts l.88;
  - feedback-dialog.tsx l.65 (`catch (error)`).
  Toasts that already show `getApiError` stay unchanged; they already show the detail.
- T043 [P] [US6] Vitest:
  - frontend/src/lib/rate-limit.test.ts (new): 429 / other statuses; header present / absent / garbage; the detail or `null`;
  - frontend/src/contexts/auth-context.test.tsx (new), fake timers:
    - a refresh 429 with `Retry-After: 30` → still authenticated, no redirect; refresh is called again at 30 s;
    - a cold-load 429 → loading, then authenticated once the retry passes;
    - a 401 → not authenticated;
    - a `/users/me` 429 → still authenticated;
  - one fixed-text site (use-cycles): a 429 shows the server's detail; a 500 still shows "Failed to create cycle".
- T044 [US6] frontend/CLAUDE.md, "### Auth & Token Refresh": a 429 on refresh or on `/users/me` retries after `Retry-After` and never signs out; `rate-limit.ts`; fixed-text toasts go through `rateLimitNotice`.
- T045 [US6] Gate:
  - the frontend chain as in K1 T014;
  - `scripts/e2e.sh e2e/smoke.spec.ts e2e/auth-guard.spec.ts` green, with no container left;
  - The K4 tip is not a merge point.
AC:
- The system sends the X-RateLimit-* headers on every counted answer, and the web app can read them and Retry-After across origins.
- The web app treats a 429 on session refresh as temporary, keeps the user signed in and tries again after the wait.
- The web app shows the server's retry message in its usual error notice when any other request is refused.

## K6 — applika-cli 1.0.1: a session refresh refused with 429 keeps the stored session   side: cli   covers: R-028   deps: K3
Owner's words: "I also want to implement pagination to agenda and applications list in this plan, by default the first page fetches the first 20, implement infinite scroll"
Clarified (replaces that sentence): "drop pagination change for agenda and applications, instead, let's implement a rate limiter to the api using redis, currently we dont have any." Then, 2026-09-27: "Fix in a new CLI version".
Touch:
- cli/src/applika/lib/api.py
- cli/tests/test_api.py
- cli/pyproject.toml
- cli/uv.lock
- cli/CHANGELOG.md
- cli/README.md (l.52, one sentence)
Pattern:
- cli/tests/test_api.py (`test_api_client_refreshes_and_retries`, `httpx.MockTransport`, `SessionStore(tmp_path / 'session.json')`)
- cli/src/applika/lib/api.py (`_extract_error_detail` l.192-198; `request()` l.91-124)
- cli/CHANGELOG.md (`## [1.0.0] - 2026-09-23` heading shape)
- docs/adr/0015-redis-api-rate-limiter.md (the 2026-09-27 amendment under Consequences)
Contract (from K3): `GET /auth/refresh` may answer 429 `{"detail": "Too many requests. Try again in <n> seconds."}` + `Retry-After: <n>`. No route or field change.
Steps:
- T055 [US8] Build on the branch, after the K3 tip.
- T056 [US8] cli/src/applika/lib/api.py `_refresh` (l.83-89), R-028:
  - a 429 → keep the store and `raise ApiError(_extract_error_detail(response), 429)`. It is not an `AuthError`, so the caller does not log out;
  - any other non-200 → `store.clear()` + `False` → `AuthError` ("Please run applika login again."), unchanged;
  - no wait on `Retry-After`, no retry (PRD non-goal);
  - `request()` (l.106-124) is unchanged: the `ApiError` goes to the command's own error path (Plan corrections 15).
- T057 [P] [US8] cli/tests/test_api.py (extend, `httpx.MockTransport`):
  - 401 on `/applications` → refresh 429 with a `detail`:
    - `ApiError`, not `AuthError`, with `status_code == 429` and `detail` == the server message;
    - the session file is byte-identical;
    - exactly one refresh call and one `/applications` call;
  - 401 → refresh 401 → the store is cleared and `AuthError` is raised (pins the unchanged path);
  - `test_api_client_refreshes_and_retries` stays green.
- T058 [US8] Version:
  - cli/pyproject.toml `version = "1.0.1"`;
  - `uv lock` in cli, so uv.lock records 1.0.1;
  - `uv sync && uv run applika --version` → `1.0.1`.
- T059 [US8] cli/CHANGELOG.md (changelogs rule 4):
  - under the current `## [Unreleased]`, add `### Fixed`: `- a session refresh refused with 429 keeps the stored session; the command fails with the server's retry message (no wait, no retry). Every other refresh failure still ends the session. 0.1.4, 0.2.0 and 1.0.0 are unchanged and still log out.`;
  - rename that section to `## [1.0.1] - <date of this commit>`. It takes K3's 429 entry and the earlier API notes with it (Plan corrections 18);
  - put a new empty `## [Unreleased]` above it;
  - the heading must match `pyproject.toml`.
- T060 [US8] cli/README.md l.52: add one sentence — a refresh refused with 429 keeps the session; run the command again after the wait. cli/CLAUDE.md is unchanged: it does not describe the refresh (Plan corrections 17).
- T061 [US8] Checks and gate:
  - cli-compatibility rule 4, no command or flag changes: `git diff develop -- cli/src/applika/commands cli/src/applika/app.py` is empty;
  - `make format && make lint && make test` in cli;
  - the changelogs verify command;
  - The K6 tip is not a merge point: 1.0.1 publishes only when the owner merges the K5 tip to `main`.
AC:
- A new `applika-cli` version keeps the stored session when its automatic session refresh is refused with 429, and the command fails with the server's retry message. Every other refresh failure still ends the session, as today. No command, flag or output of earlier versions changes.
- New capabilities ship in a new CLI version with new commands. The old commands keep working. (.claude/rules/cli-compatibility.md 4)
- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go under `## [Unreleased]` with `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. The CLI's version heading matches `cli/pyproject.toml` when it is released. (.claude/rules/changelogs.md 4)

## K5 — Closing 0011: full gate, E2E, ADR-0015, by-hand walk, release tag   side: both   covers: —   deps: K2, K4, K6
Owner's words: "i want to remake the agenda page using this image as reference @docs/refs/agenda-rework.png two tabs - upcoming and past - upcomming first and active by default, the tab content, make as is in the image, that calendar button keep the current behavior that creates a calendar file." "I also want to implement pagination to agenda and applications list in this plan, by default the first page fetches the first 20, implement infinite scroll" (replaced by the owner with the rate limiter, PRD Clarifications; CLI refresh 429: "Fix in a new CLI version", 2026-09-27).
Touch:
- docs/adr/0015-redis-api-rate-limiter.md (a dated as-built note only, T052; the 2026-09-27 CLI amendment is already there)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0010-application-with-cv-drafts-private-catalogs.tasks.md K5
Steps:
- T046 Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T047 Target gates from .claude/rules/quality-gates.md:
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; every file K3 touched is clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test` (K6's `tests/test_api.py` included).
- T048 Run the full scripts/e2e.sh on the compose stack with the raised limits. Confirm that the `e2e` job in .github/workflows/frontend-ci.yaml runs it.
  - It must include `agenda.spec.ts` (K2 T021) and every older spec, green with the limiter on.
  - Cheaper layers carry what the E2E does not:
    - the limiter (plan: "Limiter e2e: none"): tests/unit/test_rate_limit.py and tests/integration/test_rate_limit.py, on a real Redis;
    - the web 429 handling: auth-context.test.tsx, rate-limit.test.ts;
    - the CLI 1.0.1 refresh 429 (R-028): cli/tests/test_api.py (K6 T057), plus the T053 walk;
    - the stage label and the frozen UID: timeline-options.test.ts, calendar.test.ts, agenda-dropdown.test.tsx, chart-styles.test.tsx;
    - search, filter and counts: agenda-view.test.ts, agenda-page.test.tsx;
    - the focus notice: applications-page.test.tsx.
- T049 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` is empty;
  - no network or volume from docker-compose.e2e.yml;
  - no testcontainers, Postgres or Redis;
  - the owner's dev containers are untouched.
- T050 ADRs:
  - docs/adr/0015-redis-api-rate-limiter.md reads Accepted. Its Decision matches the build: cookie subject, two buckets, `EXPIREAT`, fail open, CORS order, exposed headers;
  - 0001, 0002, 0006, 0009, 0010, 0012 read Accepted.
- T051 Rule checks:
  - no migration: `git diff develop --name-only -- backend/migrations` is empty;
  - `grep -rn "X-Forwarded-For" backend/app/` → none;
  - `uv run pytest tests -k "steps or finalize or supports"`;
  - the changelogs verify command and the commit-format verify command;
  - both changelogs carry the K3 429 entry;
  - CLI 1.0.1 (K6):
    - `cli/pyproject.toml` reads `1.0.1`, and `cli/CHANGELOG.md` has `## [1.0.1] - <date>` with the K6 `### Fixed` entry and an empty `## [Unreleased]` above it (changelogs rule 4);
    - uv.lock records 1.0.1;
    - no command or flag changed: `git diff develop -- cli/src/applika/commands cli/src/applika/app.py` is empty (cli-compatibility rule 4).
- T052 ADR-0015 as-built note, dated, under Consequences. Do not rewrite the Decision. The note records:
  - the request log `client_ip` is now the resolved address (Plan corrections 1);
  - the 0.5 s bound on the limiter's Redis call (Plan corrections 2);
  - the owner's ruling on the CLI refresh 429 is already recorded there (amendment 2026-09-27, "Fix in a new CLI version"). The note only confirms 1.0.1 was built as amended (K6), and names the commands that show Typer's exception output (Plan corrections 15).
- T053 Walk through by hand on a real stack (dev compose), both themes, desktop and 390px:
  - Agenda vs `docs/refs/agenda-rework.png`, element by element:
    - the header tile, title, subtitle, search, "All stages";
    - Upcoming selected on open, with counts;
    - date headers with "N application(s)";
    - cards: bold start, muted end, "All day", the readable zone, "(converted)" for another zone;
    - the pill "Interview - …"; the calendar and alert buttons (alert on Upcoming timed cards only); "No notes";
    - long names wrap without pushing buttons off.
  - Search and filter: the counts follow, including the other tab's count; the three empty states.
  - Calendar: diff the `UID:` line of a file downloaded on `develop` against one from the K5 tip → identical. Import both into a calendar app → one entry, updated to the hyphen title.
  - Chevron: the timeline loads on open and is read-only. Link: `/applications` with the row expanded and scrolled into view. An archived-cycle application shows the notice once, and the URL loses `?focus=`.
  - Stage label: the dashboard tooltips, the header agenda dropdown, an alert, and the timeline action names read " - ".
  - Limiter, with `RATE_LIMIT_DEFAULT=5` and `RATE_LIMIT_AUTH=3` in the dev env, then a restart:
    - the web shows the retry message in a toast;
    - a refresh 429 keeps the user signed in and retries after the wait;
    - two users on one IP keep their own quotas;
    - `uvx applika-cli==0.1.4 applications list`, then 0.2.0 and 1.0.0, over the limit → the detail and a failure; after the wait it works;
    - stop Redis → the API answers, with a WARNING;
    - `RATE_LIMIT_ENABLED=false` → no headers.
  - CLI refresh 429 (R-028). Set `ACCESS_TOKEN_EXPIRE_MINUTES=1` in the dev env and restart. Log in, wait for the access token to expire, then exhaust the `/auth/*` bucket from the same IP (`curl` `GET /api/auth/refresh` × `RATE_LIMIT_AUTH`). Then:
    - `uvx applika-cli==0.1.4 applications list`, then 0.2.0 and 1.0.0 → each asks to log in again, and its session file is gone (the old behaviour, PRD non-goal);
    - 1.0.1 from the branch (`uv tool install --force cli`, and `applika --version` → 1.0.1) → it fails with the server's retry message, and `~/.config/applika/session.json` is unchanged;
    - after the wait, the same command refreshes and succeeds;
    - a 1.0.1 refresh 401 (revoked token) still ends the session;
    - note the output shape of `applications list` (Plan corrections 15).
- T054 Record at close:
  - tag the K5 tip `0011-release` (local);
  - the owner deploy steps 1-5 of `### Release` above; rollback = the previous image;
  - the owner's merge to `main` also publishes `applika-cli` 1.0.1 to PyPI (cli-cd.yaml). PyPI has no rollback: a fix goes in 1.0.2;
  - the agent never touches prod.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty ≤ 171 with changed files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0015, Accepted 2026-09-26; bound 0001, 0002, 0006, 0009, 0010, 0012 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (agenda.spec.ts, with the whole suite green under the limiter via scripts/e2e.sh) runs inside the gate and is green; the limiter is carried by tests/unit/test_rate_limit.py and tests/integration/test_rate_limit.py on a real Redis, the web 429 handling by auth-context.test.tsx and rate-limit.test.ts, and the CLI 1.0.1 refresh 429 by cli/tests/test_api.py, as named in T048.
- By-hand walk of the feature on a real stack done, including the CLI refresh 429 on 1.0.1 (session kept) and on 0.1.4, 0.2.0 and 1.0.0 (session ended).
- No new feature work.

## Matrix
| R | K |
|---|---|
| R-001 | K1, K2 |
| R-002 | K1 |
| R-003 | K1 |
| R-004 | K1 |
| R-005 | K1 |
| R-006 | K1 |
| R-007 | K1 |
| R-008 | K1 |
| R-009 | K1 |
| R-010 | K1 |
| R-011 | K2 |
| R-012 | K2 |
| R-013 | K1 |
| R-014 | K1 |
| R-015 | K1 |
| R-016 | K3 |
| R-017 | K3 |
| R-018 | K3 |
| R-019 | K3, K4 |
| R-020 | K3 |
| R-021 | K3 |
| R-022 | K3 |
| R-023 | K3 |
| R-024 | K4 |
| R-025 | K4 |
| R-026 | K3 |
| R-027 | K1 |
| R-028 | K6 (added 2026-09-27) |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. Checked sentence by sentence:
- "i want to remake the agenda page using this image as reference @docs/refs/agenda-rework.png two tabs - upcoming and past - upcomming first and active by default, the tab content, make as is in the image, that calendar button keep the current behavior that creates a calendar file."
  - Remake after the image: K1 T008-T011 (every element), K2 T016 and T019 (the chevron's content and the link's landing), and the K5 T053 comparison.
  - "two tabs - upcoming and past - upcomming first and active by default": K1 T010 (`defaultValue="upcoming"`).
  - "the tab content, make as is in the image": the date groups and cards, K1 T008, T009.
  - "that calendar button keep the current behavior that creates a calendar file": K1 T006, T009, with the UID kept (owner, "Keep old UID").
- "I also want to implement pagination to agenda and applications list in this plan, by default the first page fetches the first 20, implement infinite scroll"
  - Withdrawn by the owner (PRD Clarifications): "drop pagination change for agenda and applications, instead, let's implement a rate limiter to the api using redis". Pagination is a PRD non-goal.
  - The replacement is built: K3 (API) and K4 (web).
  - The owner's 2026-09-27 answer on the CLI refresh 429, "Fix in a new CLI version", is served by K6 (applika-cli 1.0.1, R-028).
