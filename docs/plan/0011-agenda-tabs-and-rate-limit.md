# Plan 0011 — Agenda tabs rework and API rate limiting

PRD: docs/prd/0011-agenda-tabs-and-rate-limit.md
ADRs bound: 0001 layers (middleware `app/config/`, pure logic `app/core/`). 0002 session = `__access` JWT (`sub`),
refresh token in Redis. 0006 tokens, light + dark. 0009 CLI compat, no route/field change. 0010 two images on swarm,
CD without migrations. 0012 agenda = interview events, label via `stageLabel`. 0015 (Accepted, this feature) Redis
fixed-window limiter, per user with IP fallback, fail open, Traefik as trusted proxy.
PRDs neighbouring: 0008-steps-as-timeline.md. R-026 (agenda lists scheduled events), R-039 (readable zone).

## Scope
One release, no migration, four slices.
- S1, frontend only: `/agenda` per `docs/refs/agenda-rework.png` (tabs, split, search, stage filter, read-only timeline, Upcoming
  alert, focused link to `/applications`); `stageLabel` → " - " everywhere (R-027). Same `GET /users/me/agenda`. Independent of S2-S4.
- S2: backend limiter middleware, settings, CORS, compose, seed, changelogs. S3: web treats 429 on `/auth/refresh` as temporary; same release as S2.
- S4: `applika-cli` 1.0.1 keeps the session on a refresh 429 (R-028). Same release as S2.
Not in scope: pagination (dropped), agenda API change. `agenda-dropdown.tsx`, `agenda-notifications-context.tsx`: label text only, via `stageLabel`.

## Data
Nothing in the database. No Alembic revision. Redis keys only: `applika:ratelimit:{bucket}:{subject}:{window}`;
bucket `default` | `auth`, subject `user:<sub>` | `ip:<addr>`, window `floor(now / RATE_LIMIT_WINDOW_SECONDS)`, TTL window + 1 s.

## Backend
- `backend/app/config/settings.py`: `RATE_LIMIT_ENABLED = True`, `RATE_LIMIT_DEFAULT = 120`, `RATE_LIMIT_AUTH = 10`, `RATE_LIMIT_WINDOW_SECONDS = 60`.
- `backend/app/core/rate_limit.py` (new), pure:
  - `bucket_for(route_path)`: `/auth/` prefix → `auth`, else `default`.
  - `subject_for(cookies, client)`: `__access` passes `app/core/tokens.py:decode_token` (signature, `exp`) and
    `kind == 'access'` → `user:<sub>`. Absent, expired, forged or other kind → `ip:<client host>`.
  - `async hit(redis, bucket, subject, limit, window, now) -> Decision | None`. `Decision`: `allowed`, `limit`, `remaining`,
    `reset_after`. One pipeline, `INCR` + `EXPIRE`. `RedisError`/`OSError` → `None` + WARNING `rate_limit_unavailable` (bucket only).
- `backend/app/config/rate_limit.py` (new): `RateLimitMiddleware`, pure ASGI. Copy
  `app/presentation/deprecation.py:DeprecationHeaderMiddleware` (MutableHeaders on `http.response.start`).
  - Pass through: non-http, `OPTIONS`, `envs.RATE_LIMIT_ENABLED` false (read per request). Path = `scope['path']` minus `scope['root_path']` (`/api`).
  - Redis = `scope['app'].dependency_overrides.get(get_redis, get_redis)()`, so `tests/integration/conftest.py:redis_client` injects it.
  - Over the limit: 429 JSONResponse, app not called. Under: add `X-RateLimit-*`. `None`: no headers.
- `backend/app/main.py`: `app.add_middleware(RateLimitMiddleware)` ABOVE the CORS block (CORS wraps it: 429 carries
  `Access-Control-Allow-Origin`; preflight answered first). `expose_headers` += `Retry-After`, `X-RateLimit-Limit|Remaining|Reset`.
- Client IP: `scope['client']`. uvicorn `--proxy-headers` is on by default and trusts env `FORWARDED_ALLOW_IPS`
  (default 127.0.0.1). No Dockerfile change. Never read raw `X-Forwarded-For`. No route, use case, repository or queue.
- `backend/scripts/seed_mock_data.py`: `httpx.Client` waits `Retry-After`, retries once on 429.
- `docker-compose.yml`, `docker-compose.e2e.yml` api env: `RATE_LIMIT_DEFAULT: "100000"`, `RATE_LIMIT_AUTH: "10000"`.
- `backend/tests/conftest.py`: `envs.RATE_LIMIT_ENABLED = False` for the session. Limiter tests turn it on.
- `backend/CLAUDE.md`: new env vars + "Rate limiting" section (Traefik, `FORWARDED_ALLOW_IPS`).
CLI (S4, `cli`):
- `src/applika/lib/api.py:83` `_refresh`: on 429, keep the store and raise `ApiError(_extract_error_detail(response), 429)`.
  Commands already print an `ApiError` detail and exit 1. Any other non-200 → clear + `AuthError`, unchanged. No wait, no retry.
- `pyproject.toml` `version = "1.0.1"` + `uv lock`. `CHANGELOG.md`: `### Fixed` entry; `[Unreleased]` → `[1.0.1] - <date>`.
  `cli-cd.yaml` publishes to PyPI on push to `main`, so the bump is required. 0.1.4, 0.2.0 and 1.0.0 are untouched and still log out.

## Frontend
Module: `frontend/src/app/(protected)/agenda/` + `frontend/src/components/agenda/` (new).
- `agenda-page.tsx`: rewrite. Keep h1 "Agenda" (`e2e/smoke.spec.ts:83`). Header `IconTile` (`components/applications/icon-tile.tsx`).
- Toolbar (copy `applications-page.tsx:148-188`): `Search` + `Input` "Search applications...", `Select` + `Filter` icon, "All stages" + `INTERVIEW_TYPES`.
- Tabs `defaultValue="upcoming"`, `TabsList variant="line"`, Upcoming then Past; `Badge aria-hidden` count + `aria-label` "Upcoming (n)" (`applications-page.tsx:404-422`).
- `components/agenda/agenda-view.ts` (new, pure): move `parseTime`, `convertToLocalTime`, `getDisplayTime`, `isStepPast`;
  add `splitAgenda(items, now)` → `{upcoming: asc, past: desc}`, `filterAgenda(items, {search, interviewType})`
  (case-insensitive substring on `company_name`/`role`), `groupByDate(items)` on `step_date`.
- `components/agenda/agenda-date-group.tsx` (new): `format(d, "MMM d, yyyy")` + "N application(s)".
- `components/agenda/agenda-item-card.tsx` (new). Card shell from `components/applications/application-item.tsx:105-120`
  (article, `IconTile icon={Building2}`, `Collapsible`, closed by default).
  - Left column: start `font-numeric font-semibold`, end muted, "All day" without a start.
  - Meta row: `CalendarDays` date · `Clock` range (+ "(converted)") · `MapPin` `timeZoneLabel(tz)`.
  - Pill: `Badge` with `EVENT_TYPE_CONFIG`/`INTERVIEW_TYPE_CONFIG` class + dot, text `stageLabel(...)`.
  - Calendar button: square, `CalendarPlus` → `genAgendaStepIcsFile(step)` + toast "Calendar event downloaded".
  - Alert button (R-013): square, `Bell`/`BellRing`, only when `!isPast && step.start_time`. `useAgendaNotifications()`
    `isEnabled(id)`/`toggle(id)`, tooltips kept ("Alert at 30, 15 & 5 min before" / "Disable sound alerts").
  - Nested row: `FileText` + `observation` or muted "No notes" + `Link` `ExternalLink` →
    `/applications?focus=${application_id}`, accessible name `Open ${role} at ${company_name}`.
  - Chevron (R-012): `CollapsibleTrigger` → `CollapsibleContent` with `useTimeline(open ? application_id : null)`,
    `toTimelineEventViews` (`src/lib/timeline-view.ts`), `TimelineEventList` without `renderActions` (read-only). Skeleton while loading.
- `src/app/(protected)/applications/page.tsx`: wrap in `<Suspense>` (static export rule; precedent `(protected)/cvs/editor/page.tsx`).
- `src/app/(protected)/applications/applications-page.tsx`: read `focus` (`useSearchParams`). Once loaded:
  - in the list → expanded + `scrollIntoView`; else notice "This application is not in the cycle you are viewing.";
  - then `window.history.replaceState(null, "", "/applications")` (precedent `profile-page.tsx`).
- `src/components/applications/application-item.tsx`: optional `defaultExpanded?: boolean` prop → initial `isExpanded`. Absent = today.
- Stage label (R-027): `src/components/timeline/timeline-options.ts:326` `${base} · ${...}` → `${base} - ${...}`, and
  docstrings :317, :331. Also `timeline-event-actions-menu.tsx:18` docstring.
  - `src/lib/calendar.ts:91`: UID keeps the old text via a local helper (`EVENT_TYPE_CONFIG` label + " · " + `INTERVIEW_TYPE_LABELS`,
    as `stageLabel` was; R-008). SUMMARY and filename take `stageLabel` (hyphen).
  - Callers, no code change: `contexts/agenda-notifications-context.tsx:118`, `components/layout/agenda-dropdown.tsx:186`,
    `components/dashboard/step-conversion-chart.tsx:86`, `avg-days-per-step-chart.tsx:63`, `components/timeline/timeline-section.tsx:189`.
  - Untouched: the zone "·" in `timeline-format.ts` and the CV keyword separator (pinned with the server).
- `src/contexts/auth-context.tsx` (S3): refresh `queryFn` catches axios 429 → returns cached `["applika-auth"]` data when
  present (query stays success); no cache → rethrow. Other errors unchanged.
- i18n none. Design system: no separate document; frontend `CLAUDE.md` "### UI Components" (tabs `variant="line"`,
  `font-numeric`, `font-display`), "### Application Timeline" (`stageLabel`, `timeZoneLabel`), ADR 0006 tokens `src/app/globals.css`.
  Pattern files: `applications-page.tsx`, `application-item.tsx`, `timeline-panel.tsx` (read-only list).

## Contract
No route change. `GET /users/me/agenda` stays `list[AgendaStepSchema]`, ±30 days.
Every route, every method except `OPTIONS`, with the limiter enabled:
- under the limit: normal answer + `X-RateLimit-Limit: <int>`, `X-RateLimit-Remaining: <int>`, `X-RateLimit-Reset: <int s>`.
- over the limit: `429` `{"detail": "Too many requests. Try again in <n> seconds."}` + `Retry-After: <n>` + `X-RateLimit-*`
  (Remaining `0`). The handler does not run.
- Redis error: normal answer, no `X-RateLimit-*`, WARNING. Buckets: `/auth/*` → `RATE_LIMIT_AUTH`, rest → `RATE_LIMIT_DEFAULT`.
Web route `/applications?focus=<application_id>`, new, optional. Error codes: 429 new everywhere.

## Tests
Unit backend `backend/tests/unit/test_rate_limit.py` (new): `bucket_for` (`/auth/refresh` auth; `/authors`
default); `subject_for` (valid → user; expired, bad signature, kind≠access, absent → ip); `hit` math; raising Redis → `None` + WARNING.
Integration `backend/tests/integration/test_rate_limit.py` (new; `redis_client`, low limits via `envs`):
- N+1 → 429 + body + four headers. A 429 `POST /applications` writes no row.
- user B on the same IP unaffected by user A. Anonymous per IP. `/auth/*` separate.
- 429 with `Origin` carries `access-control-allow-origin`. `OPTIONS` not counted. Disabled → no headers.
  Redis closed → 200 + WARNING. `/api` root_path matched.
Unit frontend (vitest):
- `src/components/agenda/agenda-view.test.ts` (new): split boundary (timed today before and after now, untimed, other zone),
  sort orders, search, stage filter, grouping, counts.
- `src/app/(protected)/agenda/agenda-page.test.tsx` (new): Upcoming first + selected; counts follow filters; calendar button
  calls mocked `genAgendaStepIcsFile`; alert button on Upcoming only; link href `?focus=`; chevron fetches timeline only on open.
- `src/app/(protected)/applications/applications-page.test.tsx` (extend): `?focus=` present → expanded; absent → notice.
- `src/components/timeline/timeline-options.test.ts` (extend): `stageLabel("interview","initial_screening")` === "Interview - Initial screening".
- `src/lib/calendar.test.ts` (new): UID line equals the pre-release format `UID:<application_id>-<yyyymmdd>-Interview · Technical@applika`;
  SUMMARY and download filename carry "Interview - Technical".
- update `src/components/layout/agenda-dropdown.test.tsx:43` → "Interview - Technical"; `src/components/dashboard/chart-styles.test.tsx:12,18` fixture.
- `src/contexts/auth-context.test.tsx` (new): refresh 429 → still authenticated; 401 → not.
CLI `cli/tests/test_api.py` (extend, `httpx.MockTransport`): 401 → refresh 429 → `ApiError` (not `AuthError`) 429 + server
detail, session file unchanged, one refresh call; 401 → refresh 401 → store cleared + `AuthError` (pins the unchanged path).
E2E `frontend/e2e/agenda.spec.ts` (new; seeding/cleanup from `e2e/timeline.spec.ts`): one application with a future and a
past interview. Upcoming (1) selected, Past lists the past one, `.ics` download, chevron shows the timeline, link lands
expanded on `/applications`. Limiter e2e: none (integration on real Redis).

## Release
One release (`develop` → `main` by the owner). No migration. Deploy steps, owner only:
1. Before or with the deploy, set `RATE_LIMIT_AUTH=600` in the swarm stack env of the API service.
2. Find the network Traefik uses to reach the API. Read its subnet:
   `docker network inspect <traefik-network> --format '{{(index .IPAM.Config 0).Subnet}}'`.
3. Set `FORWARDED_ALLOW_IPS=<subnet>` on the API service, then run `docker service update`.
4. Check that the request log `client_ip` shows real, varying visitor addresses and no longer overlay addresses.
5. Then remove `RATE_LIMIT_AUTH=600`, so the default of 10 applies.
Rollback: point the stack at the previous image. No data to restore; the Redis keys expire within 61 s.

## Rules that bind
- quality-gates.md: ruff, `ty` 0 new, coverage ≥ 90; lint, prettier, tsc, vitest, build; CLI `make lint && make test`; e2e.
- changelogs.md: 429 → `backend/CHANGELOG.md` `Added` + `cli/CHANGELOG.md` note + S4 `Fixed`; heading `[1.0.1]` = `pyproject.toml`.
- cli-compatibility.md: no route or field removed; 429 owner-accepted. Rule 4: 1.0.1 adds no command and changes no flag; old versions keep working.
- branches-and-commits.md: slice branch from `develop`, conventional commits, PR to `develop`.
- prod-release-runbook.md: no migration, so one release. An agent never touches production. The deploy steps above are the owner's.
- non-destructive-migrations.md, migration-tests.md: no revision.

## Risks
- Traefik's ports published through swarm ingress (not `mode: host`): Traefik forwards ingress addresses. Release step 4
  catches this. Fix: publish Traefik's ports in `mode: host`; until then, keep `RATE_LIMIT_AUTH` raised.
- Shared NAT: users without a session share `/auth/*`; tuned through env. If the limiter wraps CORS, the browser sees a 429 as a network error. The integration test pins the order.
- A web bundle cached from before S3 still signs the user out on a 429 refresh, until reload. Fixed window allows 2× the limit (ADR 0015).
- Installed CLIs 0.1.4, 0.2.0 and 1.0.0 still log out on a refresh 429 until users upgrade to 1.0.1 (owner-accepted, 2026-09-27).
- ICS UID frozen to the old "·" text (owner, 2026-09-26). A later `stageLabel` change must not reach it; `calendar.test.ts` pins it.
- If `root_path` is ignored, `/api/auth/*` falls into the default bucket (pinned by test). The limiter on in tests → flaky 429s (default off).

## Open
None. R-011, R-012, R-013 and the proxy question were closed on 2026-09-26. The CLI refresh 429 was settled on 2026-09-27 (S4, R-028).
