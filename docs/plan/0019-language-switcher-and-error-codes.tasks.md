# Tasks 0019 — English and Portuguese, a language switcher, and numbered API error codes

PRD: docs/prd/0019-language-switcher-and-error-codes.md   Plan: docs/plan/0019-language-switcher-and-error-codes.md
ADRs bound: 0025 (drafted by this feature, Accepted by LuisMSoares 2026-10-31); 0024 (amended by 0025: the six named codes renumbered), 0018 (0025 "Beta exception": no `FeatureKey`; gated 404 carries GEN-1001), 0015 (429 `code` + `params`), 0019 (503 `code`, OAuth `error` kept), 0009 (CLI payloads, `detail` untouched), 0006 (URLs, new-york, tokens). The dated notes on 0015, 0018, 0019 and 0024 are already written (checked 2026-10-31).

## Order
K1 (KODI-082) backend codes + catalog → K2 (KODI-083) web i18n core + switcher (unmounted) + error lookup → K3 (KODI-084) screens part 1 → K4 (KODI-085) screens part 2 + admin + switcher mounted + language E2E → K5 (KODI-086) closing (tag `0019-release`)

- **Cap.** Owner, 2026-10-14: "too many tickets, up to 5 only"; PRD D6: "One feature, 5 tickets, one release". Set is 5, closing included. Plan Scope T1..T5 + closing = 6, so: T1 → K1, T2 → K2, T3 → K3, **T4 + T5 → K4**, closing → K5. Fold reason: admin is P2 (US5) and lands last, which keeps story priority, and its catalog and job screens reuse T4's pieces (`OnlyYouBadge`, the job vocabulary); the cost is K4 being the longest ticket. The one-day rule yields: K1 about three days, K2 two, K3 three, K4 four, K5 one.
- **Stories.** Slice grouping wins over one-story-one-ticket (owner precedent, 0010..0018). Stories stay `[USn]` tags: K1 [US4, US6, US7]; K2 [US1..US4]; K3 [US1, US4]; K4 [US1..US5]. Bend: K1 carries US6 (P2) and US7 (P3) because the catalog and the CLI proof ride on the same backend change; no P1 work waits on them.
- **Sides.** Backend, then frontend: the web's error lookup keys on K1's codes and K2's `messages.test.ts` reads K1's `docs/error-codes.md`. No `## Data` (plan: none), so no foundation ticket.
- **Switcher.** Ported and tested in K2, mounted nowhere; mounted in K4, the last story slice (plan Scope). No beta gate, so nothing half-translated may reach `main`: no ticket tip is a merge point, only the K5 tag.
- **deps:** K1 none; K2 = K1; K3 = K2; K4 = K3; K5 = K4.
- **Branch (owner, via the orchestrator 2026-10-31).** One integration branch, `labs01-145`, the branch checked out in `applika/`. Every ticket is built on it, one after another, `--no-branch`. K1 T001 commits the planning docs first.
- **AC.** PRD requirement text verbatim, `R-nnn` prefix dropped. PRD 0019 ends each requirement with a source in parentheses (owner quote or clarification); the AC is the requirement sentence(s) without that trailing source, which stays traceable through the `R-nnn` on the covers line (0018 precedent). Edge-case ACs carry `(PRD 0019 edge case)`; rule ACs `(.claude/rules/<file> <n>)`. A ticket carrying one half of a requirement says so on its covers line.
- **No beta gate (ADR-0025 "Beta exception", owner "No gate, everyone at once").** No `FeatureKey`, no seed row, no `require_feature`, no `add_slash_twins`, no `useHasFeature`/`FeatureGate`. Not a `.claude/rules/beta-features.md` breach.
- **No ticket keys** in code, docs, commits or changelogs (`.claude/rules/branches-and-commits.md` 2, `.claude/rules/changelogs.md` 5). This file carries K-labels only.
- **Agent memory** stays in the workspace (`.claude/agent-memory/`), never under `applika/`; `git add <explicit paths>` only (`.claude/rules/no-agent-memory-in-repo.md`).

### Release (one, no migration)
- Code only. Annotated local tag `0019-release` on the K5 tip. `git diff 418aab2f..0019-release -- backend/migrations` is empty.
- Base: `labs01-145` = `labs01-147` = `418aab2f`, the 0018 tip (tags `0018-release-a/b/c` local). `develop` = `abf984f2` holds no 0018. So 0019 merges into `develop` (`--no-ff`) only after the owner has merged `0018-release-c`; 0018's own order stands (A; B after A's prod migration; C after B runs in prod). Build never waits for prod; merge does.
- Deploy: CD updates the API and the web separately (runbook 1). No `alembic upgrade` step. Either order is harmless: an old bundle shows `detail` for a renumbered code; a new bundle on the old API sees the old string codes as unknown and shows `detail` (R-018).
- Rollback: the previous image tags. Nothing in the database to undo.
- Everyone at once at deploy (R-024). An agent never touches prod or `main`; tags stay local.

### Plan corrections (checked against the code, 2026-10-31)
1. **Branch and base.** The plan's `integration/0019-language-switcher` from `develop` is replaced by the owner's `labs01-145` (`.git/HEAD`), which sits on `418aab2f` (`labs01-147`, 0018 tip), not on `develop` (`abf984f2`). 0019 needs 0018's code (the six codes, Borderless sign-in). Every "vs develop" check in this file compares with `418aab2f`: `ty` baseline, changelog verify, ticket-key grep, commit-format verify. K1 T001 re-checks.
2. **Docs not yet in git.** PRD 0019, plan 0019, this file, ADR-0025 (new) and the dated notes on ADR-0015, 0018, 0019, 0024 commit first and alone (K1 T001).
3. **Inline refusals the plan omits.** `presentation/api/borderless_auth.py` l.76 builds a 400 `{"detail": "CLI login expired"}` by hand (the plan says the web's `cliLoginExpired` keys on its code, so it needs one); `presentation/api/oauth.py` l.332 builds the refused-refresh 401 by hand. Both get their code (K1 T006). `config/rate_limit.py` l.83-92 is in the plan.
4. **The restore callback catches `HTTPException`.** `presentation/api/oauth.py` l.237 `except HTTPException, SessionServiceUnavailable` around `GetCurrentUserUseCase`. Once `get_current_user.py` raises a domain exception, that clause must catch it, or the GitHub restore callback 500s instead of 307 `status=error` (K1 T005).
5. **HTTPException counts.** 18 raises in 5 files: `oauth.py` l.181, l.287; `auth_handoff.py` l.13-28 (4); `dependencies.py` l.506; `use_cases/get_current_user.py` (6); `quinzenal_reports/submit_report.py` l.153-183 (5). `borderless_auth.py`, which the plan names, has none. `dependencies.py` reads both schemes with `auto_error=False` (l.493-494), so no framework 401/403 appears. `ty` is the arbiter for the 189 domain raise sites (a plain grep finds 269 `raise X(` in 104 files, ValueErrors and scraper errors included).
6. **Exact-body tests the plan omits.** 62 asserts of `json() == {'detail': …}` in 18 backend test files (`test_session_lifecycle.py` 15, `test_jobs_draft.py` 6, `test_admin_jobs.py` 5, `test_cli_pkce.py` 4, `test_job_searches.py` 4, `test_admin_report_webhooks.py` 4, `test_oauth_cli.py` 3, `test_device_flow.py` 3, `test_sessions_api.py` 3, `test_borderless_signin.py` 3, `test_feature_access.py` 2, `test_cvs_gating.py` 2, `test_cv_export_api.py` 2, `test_github_restore_flow.py` 2, `test_borderless_confirm.py`, `test_feature_gating.py`, `test_features_api.py`, `test_tailored_cv_api.py`) break once `code` is added. K1 adds the code to each expected body, keeping them strict. Tests that build exceptions (`tests/conftest.py`, `unit/test_catalog_resolve.py`, `integration/test_cv_export_api.py`, `integration/test_cv_pdf_api.py`, `unit/test_get_current_user.py`) pass a code; `test_get_current_user.py` expects the domain exception, not `HTTPException` (K1 T010).
7. **E2E pins old codes.** `frontend/e2e/borderless-signin.spec.ts` l.182 `badge_required`, l.361 `membership_unconfirmed`: K1 moves them to RPT-1001 / RPT-1002, or K1's E2E run is red. The web never branched on the values (`lib/borderless-error.ts` keys `cliLoginExpired` on status 400 + `detail`, l.47); its vitest fixtures (`app/login/login-page.test.tsx` l.159-206, `components/badges/confirm-membership-form.test.tsx` l.114-118) and `services/types/auth.ts` l.19-22 move in K2.
8. **Other framework statuses.** The new Starlette `HTTPException` handler maps 404 → GEN-1001 and 405 → GEN-1002; any other status Starlette raises gets a GEN code allocated in the build and listed in the catalog, headers kept (K1 T007).
9. **The 500 change is visible in the CLI.** `cli/src/applika/lib/api.py` l.264-270 prints `API request failed with status 500` on today's plain-text 500; on the JSON body it prints `Internal Server Error`. **Decided by the owner, 2026-10-31:** "Accept the new CLI text (Recommended)". The unhandled 500 stays `{"detail": "Internal Server Error", "code": "GEN-1005"}`, and the CLI prints `Internal Server Error`. PRD clarification 13 rewrote R-011, R-022 and US7 to match. K1 records the change under `Changed` in `cli/CHANGELOG.md`.
10. **`ty` on 84+ touched files.** Every file a slice changes must be clean, so K1 fixes any of the 171 baseline diagnostics that sit in the files it touches (the ceiling only goes down).
11. **Formatting calls.** 38 display calls in 18 files by grep (plan: 41 in 20). Four `Intl.DateTimeFormat("en-US")` calls compute zone parts, not text, and stay `en-US`: `components/agenda/agenda-view.ts` l.27, l.85, l.134; `components/timeline/timezone-options.ts` l.63. The `app/(public)/page.tsx` match is JSON-LD, which stays English (non-goal).
12. **Toasts outside `.tsx`.** 55 `toast.*(` calls in 19 files under `src/hooks/` (the plan counts `.tsx` only, but toasts are R-009). Each area ticket owns its hooks.
13. **Playwright has no `locale`** (`frontend/playwright.config.ts`), so Chromium takes the host's. On a pt-BR host every English-asserting spec flips once K2 detects the browser language. K2 pins `use.locale: "en-US"`; `language.spec.ts` sets `pt-BR` per context.
14. **No glossary in the plan.** PRD Assumptions: "The agents write the Portuguese (Brazil) text from a glossary kept in the plan"; plan `## Open` only names the terms. K2 adds `## Glossary` to plan 0019; the owner reviews it before K3 starts.
15. **One more server component.** `components/layout/not-found-message.tsx` has no `"use client"` and renders the 404 words for `app/not-found.tsx` and `FeatureGate`. It becomes client with `app/not-found.tsx` (K3). `app/(public)/layout.tsx` and `page.tsx` stay server (metadata and JSON-LD only).
16. **`.detail` readers.** 31 reads in 15 files, plan names 10. Full list: `lib/api-client.ts`, `lib/borderless-error.ts`, `lib/blob-error.ts`, `lib/rate-limit.ts`, `app/(protected)/device/device-page.tsx`, `app/(protected)/admin/jobs/jobs-page.tsx`, `components/tailored-cvs/cv-removed-row.tsx`, `hooks/use-jobs.ts`, `app/(protected)/admin/report-webhooks/report-webhooks-page.tsx`, `services/implementations/auth-service.ts`, `app/(protected)/admin/features/view/feature-view-page.tsx`, `components/jobs/job-test-fixtures.ts` (fixture), `components/application-drafts/draft-page-states.tsx`, `services/interfaces/i-auth-service.ts`, `components/application-drafts/draft-copy.ts`. K2 moves all of them through `lib/api-error-message.ts`, so one ticket owns R-017 and R-018.
17. **Shared text outside the plan's areas.** `src/components/ui/*` (accessible names such as the sr-only "Close"), `src/components/common/*`, `src/components/cookie-consent.tsx` → K2. `components/applications/feedback-dialog.tsx` (hoisted by `AppShell`), `cli-promo-banner.tsx`, `theme-toggle.tsx`, `app-logo.tsx`, `components/features/*`, `src/options.ts` and `components/timeline/timeline-options.ts` (read first by profile, dashboard and agenda) → K3.
18. **Mount points** (verified): `components/layout/header.tsx` l.80 and `components/landing/landing-header.tsx` l.26 are the `<ThemeToggle />` lines; `app/login/login-page.tsx` and `app/cli/code/cli-code-page.tsx` exist and have no header. All four mount in K4.
19. **CLAUDE.md lines naming old codes.** `backend/CLAUDE.md` names the six strings in Authentication, Reports and Exception Handling, the 429 body in Rate limiting, the gate's `{"detail": "Not Found"}` in Beta features and the 503 body in Authentication (plan names only Exception Handling) → K1. `frontend/CLAUDE.md` l.189, l.193, l.1485-1496, l.1541 → K2.
20. **Changelogs.** Both files already open `## [Unreleased]` at l.7: append.

## K1 — Backend: numbered `code` on every error answer, `params`, the error catalog, changelogs   side: backend   covers: R-011, R-012, R-013, R-014 (API), R-015, R-016, R-019 (API, catalog), R-020 (API), R-021 (API), R-022   deps: —
Goal: Every non-2xx JSON answer carries `code` (`AREA-NNNN`) beside its unchanged `detail`, status and headers; value-naming codes add `params`; every validation 422 is GEN-1003; the six ADR-0024 codes renumbered; `docs/error-codes.md` lists every code; installed CLIs unchanged.
Owner's words: "Today Applika is available in just one language - english - and I want to expand to english and portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app."
Clarified: "The api, for each error, return an error code with the message in english, each code translates to a specific error, create a document in the docs listing every error in the application with code and description of this error … the api only returns the error code"; "Numbered code"; "Renumber them, amend ADR-0024 (Recommended)"; "Add codes, note it in ADR-0025 (Recommended)"; "Optional params on those codes (Recommended)"; "One code for all validation (Recommended)"; data text "Stays English (Recommended)".
Covers: as the header.
Release: `0019-release`. Plan: `## Backend`, `## Contract`, `## Tests` (backend), `## Rules that bind`. Tasks: Plan corrections 1-10, 19, 20.
Touch:
- docs/prd/0019-language-switcher-and-error-codes.md, docs/plan/0019-language-switcher-and-error-codes.md, docs/plan/0019-language-switcher-and-error-codes.tasks.md, docs/adr/0025-two-languages-and-numbered-error-codes.md (new), docs/adr/0015-redis-api-rate-limiter.md, docs/adr/0018-beta-features-registry-and-allowlist.md, docs/adr/0019-device-sessions-and-cli-oauth.md, docs/adr/0024-borderless-sole-login-and-membership-badges.md (T001 commit only, content unchanged)
- backend/app/core/error_codes.py (new), backend/app/core/exceptions.py
- backend/app/presentation/handlers.py, no_input_echo.py, dependencies.py; backend/app/config/rate_limit.py
- backend/app/presentation/api/oauth.py, auth_handoff.py, borderless_auth.py, cli_auth.py, and every router that raises
- backend/app/application/use_cases/** (the raise sites), get_current_user.py, quinzenal_reports/submit_report.py, cycles/create_cycle.py, platforms/create_platform.py, admin/companies/publish_company.py, admin/platforms/publish_platform.py; backend/app/application/validators/*; backend/app/domain/repositories/* that raise
- docs/error-codes.md (new)
- backend/tests/unit/test_error_codes.py (new), backend/tests/integration/test_error_codes.py (new); integration/test_feature_gating.py, test_rate_limit.py, test_borderless_signin.py, test_borderless_confirm.py, test_quinzenal_reports.py; unit/test_borderless_sign_in.py, unit/test_get_current_user.py; the 18 files of Plan corrections 6; tests/conftest.py
- frontend/e2e/borderless-signin.spec.ts (l.182, l.361)
- backend/CHANGELOG.md, cli/CHANGELOG.md, backend/CLAUDE.md
Pattern:
- backend/app/presentation/handlers.py `_coded_refusal_handler` (already emits `{detail, code}`)
- backend/tests/integration/test_feature_gating.py (404 byte-equal to the unknown route)
- backend/tests/integration/test_rate_limit.py (429 with the limiter turned on)
Contract (K2 consumes; full text plan `## Contract`):
- Every non-2xx JSON: `{"detail": <unchanged>, "code": "<AREA>-<NNNN>"}`, key order `detail`, `code`, `params`. Statuses and headers unchanged.
- Value-naming codes add `"params": {<name>: <string|int>}`; no other code sends a `params` key.
- OAuth 400: `{"error": <unchanged>, "detail", "code"}`. Every request-validation 422 (global and `NoInputEchoRoute`): `{"detail": [<unchanged>], "code": "GEN-1003"}`.
- Pinned: GEN-1001 404 `Not Found` (unknown route and gated feature, byte-equal); GEN-1002 405; GEN-1003 422; GEN-1004 429 + `params.seconds`; GEN-1005 500 `Internal Server Error` (JSON, was text); GEN-1006 501; AUTH-1001 401 `Not authenticated`; AUTH-1002 401 `Session expired`; AUTH-1003 503 + `Retry-After: 5`; AUTH-1004 401; AUTH-1005 403 (was `email_unverified`); AUTH-1006 409 (`binding_conflict`); AUTH-1007 409 (`email_ambiguous`); AUTH-1008 422 (`email_unusable`); AUTH-1009 429 + `params.seconds`; RPT-1001 403 (`badge_required`); RPT-1002 403 (`membership_unconfirmed`). Every other code is allocated in the build, per area from 1001, and listed in the catalog.
- `docs/error-codes.md`: an area table, then one row per code: `code | status | detail (English) | params (or —) | description | raised by`. K2's `messages.test.ts` parses it.
Steps:
- T001 [US4] Base and docs commit:
  - `git -C applika branch --show-current` → `labs01-145`; `git -C applika rev-parse labs01-145 labs01-147` → both `418aab2f…`; `git -C applika merge-base --is-ancestor 0018-release-c labs01-145` → yes. Else stop, ask the owner (Plan corrections 1);
  - `git -C applika status --porcelain` → only the Touch docs set. Any other path, or any `agent-memory` path → stop (empty `agent-memory` dirs: `rmdir`);
  - `git add <those explicit paths>`; commit alone: `docs(i18n): plan languages and numbered error codes`.
- T002 [US4] [US6] Create backend/app/core/error_codes.py (new): `ErrorCode(StrEnum)`, value `AREA-NNNN`, areas GEN AUTH USR APP EVT CAT CV JOB CYC RPT FDB ADM (plan `## Backend`), per area from 1001 up by one; the pinned codes exactly; one member per error, the same error at two sites shares one member (R-013); docstring: a shipped code is never reused, renumbered or redefined (R-012).
- T003 [US4] backend/app/core/exceptions.py:
  - `UnicornException.__init__(message, code: ErrorCode, params: dict[str, str | int] | None = None)`: code required;
  - `CodedRefusal.code: ErrorCode`, no longer optional; `EmailUnverified` AUTH-1005, `BindingConflict` AUTH-1006, `EmailAmbiguous` AUTH-1007, `EmailUnusable` AUTH-1008, `BadgeRequired` RPT-1001, `MembershipUnconfirmed` RPT-1002, messages unchanged (R-014); `InvalidCredentials` AUTH-1004; `SignInRateLimited` AUTH-1009 with `params={'seconds': retry_after}` (l.149-155); `SessionServiceUnavailable` default AUTH-1003; `OAuthError(error, message, code)`;
  - a 401 domain exception for the `get_current_user` refusals (AUTH-1001, AUTH-1002), or `InvalidSession` with those codes.
- T004 [US4] Pass a code at every domain raise site under backend/app (`ty` flags a missing one, Plan corrections 5): use_cases, routers, repositories (`ResourceConflict` from an IntegrityError), validators. `params` only where `detail` names a value:
  - `use_cases/cycles/create_cycle.py` l.18-21: `min`, `current`;
  - `use_cases/quinzenal_reports/submit_report.py` l.139: `day`;
  - `use_cases/platforms/create_platform.py`: `name`; `use_cases/admin/companies/publish_company.py`, `use_cases/admin/platforms/publish_platform.py`: `name`;
  - any other value-naming `detail` the build finds (the catalog lists it).
  The worker (`app/worker/`) is untouched; scraper `SourceFailed` text and `adjustments` descriptions are data, never coded (R-021).
- T005 [US4] HTTPException → domain exceptions, same status, same `detail` (Plan corrections 5):
  - `presentation/api/oauth.py` l.181 (404 "CLI login not found"), l.287 (401 "Invalid or expired CLI exchange code"); `presentation/api/auth_handoff.py` l.13-28; `presentation/dependencies.py` l.506 → AUTH-1001; `application/use_cases/get_current_user.py` (6); `application/use_cases/quinzenal_reports/submit_report.py` l.153-183 (5);
  - `presentation/api/oauth.py` l.237: the `except` catches the new exception (Plan corrections 4);
  - `require_feature` (`presentation/dependencies.py`) raises `ResourceNotFound('Not Found', ErrorCode.GEN_1001)` (or the enum's member name), identical to the unknown-route 404 (R-015).
- T006 [US4] Inline refusals (Plan corrections 3):
  - `presentation/api/borderless_auth.py` l.76-81: `{"detail": "CLI login expired", "code": <its AUTH code>}`, cookie still cleared;
  - `presentation/api/oauth.py` l.332-338: the refused refresh adds the `InvalidSession` code, cookies still cleared;
  - `config/rate_limit.py` l.83-92: + `"code": "GEN-1004"`, `"params": {"seconds": <reset_after>}`, every header unchanged;
  - `presentation/no_input_echo.py` l.46: + `"code": "GEN-1003"`; still never echoes `input`.
- T007 [US4] backend/app/presentation/handlers.py:
  - every handler adds `code`, and `params` only when the exception carries it (R-019);
  - new: Starlette `HTTPException` (404 GEN-1001, 405 GEN-1002, other statuses a GEN code of their own, headers kept; Plan corrections 8); `RequestValidationError` (FastAPI's default body + GEN-1003, R-020); `Exception` → 500 `{"detail": "Internal Server Error", "code": "GEN-1005"}`; `_not_implemented_handler` + GEN-1006; `_oauth_error_handler` keeps `error`;
  - file stays `ty`-clean (the `assert isinstance` pattern, l.8-17).
- T008 [US6] Create docs/error-codes.md (new): the area table, then one row per `ErrorCode` member in enum order: code | status | `detail` in English (a value shown as `<seconds>`, `<name>`, …) | params (`seconds`, … or —) | description of the error | raised by (route or use case). The pinned rows as plan `## Contract`, the six with their old names in the description (R-016).
- T009 [P] [US4] [US6] Unit backend/tests/unit/test_error_codes.py (new): every value matches `^[A-Z]+-\d{4}$`, values unique; the enum set equals the catalog's code column (parses `docs/error-codes.md` from the repo root) and each row's params column equals what its raise sites send; the six renumbered; every handler body carries `params` exactly when the exception sets it; `detail` texts unchanged for a sample per area.
- T010 [P] [US4] [US7] Integration backend/tests/integration/test_error_codes.py (new) and updates (Plan corrections 6, 7):
  - 404 unknown route == gated route, bytes and code (extend test_feature_gating.py); 405; 422 global and on a `NoInputEchoRoute` (no `input`); 429 (test_rate_limit.py, `params.seconds` == `Retry-After`); 503 + `Retry-After: 5`; 401 AUTH-1001 and AUTH-1002; 500 JSON GEN-1005; OAuth 400 keeps `error` and adds `code`; one sample per area; each params code sends its params; a code without params sends no `params` key;
  - test_borderless_signin.py, test_borderless_confirm.py, test_quinzenal_reports.py, unit/test_borderless_sign_in.py: numbered codes;
  - the 62 exact-body asserts in 18 files: expected bodies gain their code; exception-building tests pass a code; test_get_current_user.py expects the domain exception.
- T011 [US7] frontend/e2e/borderless-signin.spec.ts l.182 → `"RPT-1001"`, l.361 → `"RPT-1002"` (Plan corrections 7). Nothing else in the web moves in K1.
- T012 [US6] [US7] Docs and changelogs (no ticket keys; changelogs rule 3):
  - backend/CHANGELOG.md `## [Unreleased]`: Added (`code` on every error answer, `params` on value-naming codes, `docs/error-codes.md`); Changed (`badge_required`, `membership_unconfirmed`, `email_unverified`, `binding_conflict`, `email_ambiguous`, `email_unusable` renumbered RPT-1001, RPT-1002, AUTH-1005..AUTH-1008, messages unchanged; an unhandled 500 answers JSON; every validation 422 adds `code` GEN-1003);
  - cli/CHANGELOG.md `## [Unreleased]`: Added (`code` on every API error, `detail` unchanged, statuses and headers unchanged); Changed (on a 500 the CLI prints "Internal Server Error" where it printed "API request failed with status 500", Plan corrections 9);
  - backend/CLAUDE.md: Exception Handling (every domain exception takes an `ErrorCode`; a new error adds the member, a catalog row and an `en` and a `pt-BR` web message in the same change, ADR-0025 Consequences); the bodies in Authentication, Reports, Rate limiting and Beta features carry their codes (Plan corrections 19).
- T013 [US7] Checks, gate:
  - `uv run pytest tests -k "steps or finalize or supports"`; `cd cli && make lint && make test`, unchanged CLI source;
  - `grep -rn "HTTPException(" backend/app` → none; `grep -rnE "'(badge_required|membership_unconfirmed|email_unverified|binding_conflict|email_ambiguous|email_unusable)'" backend/app` → none;
  - `git -C applika diff 418aab2f -- backend/migrations backend/app/worker backend/app/core/features.py` → empty;
  - `make format && make lint && make test`; `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `418aab2f`, ceiling 171; every touched file clean, Plan corrections 10), `uv run pytest . --cov=app` (≥ 90%);
  - full `frontend/scripts/e2e.sh` green (today's web on the new API); no applika-e2e container, network or volume left;
  - the changelogs verify command (against `418aab2f`); commits conventional, no ticket key (e.g. `feat(api): add numbered error codes`); not a merge point.
AC:
- Every error answer from the API carries a code next to its English message. The English message, the status and the headers stay exactly as they are today. The one exception is an unhandled server error: today it answers plain text, and it now answers in the same shape as every other error, with the same words.
- A code is an area prefix and a four-digit number, for example APP-1004. Codes are grouped by area and numbered per area. Once shipped, a code is never reused, renumbered or given another meaning.
- Each code stands for exactly one error, and each error has exactly one code.
- The six named codes from ADR-0024 (the sign-in and report refusals) become numbered codes like every other error, and their English messages stay.
- The unknown-route 404, the hidden-feature 404, the too-many-requests 429 and the session-service 503 carry a code too, with their English messages unchanged. The hidden-feature 404 stays identical to the unknown-route 404, code included.
- A document in the product docs lists every error code with its HTTP status, its English message and a description of the error.
- Some of today's messages name a value: a wait in seconds, a count, a report day, or the name of a conflicting platform or public row. Only these codes also send the named values as params next to the code. The web writes the whole sentence in either language with those values, so the value still shows. The error document lists the params of each such code.
- Every request the API refuses for invalid input (a validation error) carries the same single code, GEN-1003, and keeps today's list of field errors unchanged. The web shows one translated line for it.
- Text the API produces as data, rather than as an error message, stays English in both languages and is shown as the API sends it. This covers the keyword reorder descriptions, device names such as "Chrome on macOS", a job source's last error, and the CV preview with its PDF and Markdown exports. The preview stays a twin of the English PDF.
- Every published version of the command-line tool keeps working, and every route, status, field and message it reads today stays, with one exception. On an unhandled server error, the tool now shows "Internal Server Error" where it used to show "API request failed with status 500".
- A browser still running the previous web release while the API is already updated: renumbered codes are unknown to it, so it shows the English message, as it does today. (PRD 0019 edge case)
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in **both** files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)
- Commit messages are conventional commits **without** a ticket key: `feat(cv): add base CV table`. The board is local and the repo is moving to a new remote, so nothing in git history points at a ticket. (.claude/rules/branches-and-commits.md 2)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K2 — Web i18n core: next-intl provider, locale resolution and cookie, the ported switcher (unmounted), errors by code, shared UI text, cookie notice and policy   side: frontend   covers: R-001, R-002, R-003, R-005 (mechanism), R-006, R-007, R-008, R-009 (shared UI, cookie notice and policy), R-010 (date pickers), R-014 (web), R-017, R-018, R-019 (web), R-020 (web), R-023, R-024 (ungated provider)   deps: K1
Goal: The web resolves `en` | `pt-BR` in the browser (cookie, then `navigator.languages`, then `en`), swaps messages in place with no navigation, sets `<html lang>`, writes `NEXT_LOCALE` on pick only; the reference `LanguageToggle` ships ported whole and tested, mounted nowhere yet; every error shows by code in the active language (code → `detail` → generic); shared primitives, the cookie notice and the cookie policy are translated; the glossary is fixed for K3 and K4.
Owner's words: "Today Applika is available in just one language - english - and I want to expand to english and portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app."
Clarified: "The frontend will use this error and determine which languague preference the user is using to display the message in english or portuguese, the translations will be located in frontend only"; "Browser cookie, like the site (Recommended)" ("NEXT_LOCALE cookie (1 year, path /) … works signed out on landing and login; no migration, no new API"); "Detect the browser language (Recommended)" ("a browser set to pt-* gets pt-BR, anything else en; once the user picks, the cookie wins"); "No gate, everyone at once"; "Port both, use default (Recommended)"; "One code for all validation (Recommended)".
Covers: as the header.
Release: `0019-release`. Plan: `## Frontend` (dep, i18n, provider, translator, messages, root providers, toggle, errors), `## Contract` (switcher), `## Tests` (unit, frontend). Tasks: Plan corrections 7, 13, 14, 16, 17, 19.
Touch:
- frontend/package.json, frontend/pnpm-lock.yaml (`next-intl`)
- frontend/src/i18n/config.ts, resolve-locale.ts, locale-provider.tsx, translator.ts, messages/en.json, messages/pt-BR.json (new)
- frontend/src/components/layout/root-providers.tsx
- frontend/src/components/language-toggle.tsx, frontend/src/components/icons/flag-us.tsx, flag-br.tsx (new)
- frontend/src/lib/api-client.ts, blob-error.ts, rate-limit.ts, borderless-error.ts, api-error-message.ts (new); frontend/src/services/types/auth.ts, services/implementations/auth-service.ts, services/interfaces/i-auth-service.ts; the other `.detail` readers of Plan corrections 16
- frontend/src/components/ui/* (accessible names), ui/date-picker.tsx, ui/calendar.tsx; frontend/src/components/common/*
- frontend/src/app/(public)/cookie-policy/cookie-policy-page.tsx; frontend/src/components/cookie-consent.tsx
- frontend/src/test/setup.ts; frontend/playwright.config.ts; frontend/eslint.config.mjs (only if `react/jsx-no-literals` is adopted)
- frontend/src/i18n/resolve-locale.test.ts, messages.test.ts, frontend/src/components/language-toggle.test.tsx, frontend/src/lib/api-client.test.ts (new); app/login/login-page.test.tsx, components/badges/confirm-membership-form.test.tsx
- frontend/CLAUDE.md; docs/plan/0019-language-switcher-and-error-codes.md (`## Glossary`)
Pattern:
- frontend/src/hooks/use-features.ts (provider-fed hook)
- frontend/src/components/theme-toggle.tsx (header control)
- frontend/src/components/tailored-cvs/cv-diff.fixtures.test.ts (a web test reading a file outside `frontend/`)
- the reference `LanguageToggle` as transcribed in plan `## Contract`
Contract: K1's (above). Cookie `NEXT_LOCALE=<en|pt-BR>; Path=/; Max-Age=31536000; SameSite=Lax`, not HttpOnly, written by the browser on pick only. Switcher: plan `## Contract`, every class verbatim.
Steps:
- T014 [US1] Build on `labs01-145` after the K1 tip. `pnpm add next-intl` at a version that supports Next 16.2 static export and React 19.2 (plan `## Open`); no routing, no middleware (`output: "export"`). If none does, `use-intl` (same API, no Next coupling); record which in frontend/CLAUDE.md.
- T015 [P] [US2] [US3] Create frontend/src/i18n/config.ts (new): `LOCALES = ["en","pt-BR"]`, `DEFAULT_LOCALE = "en"`, `LOCALE_COOKIE = "NEXT_LOCALE"`, max age 31536000.
- T016 [P] [US2] Create frontend/src/i18n/resolve-locale.ts (new), pure: a cookie of exactly `en` or `pt-BR` wins; any other value is ignored; else any `navigator.languages` entry starting `pt` (`pt`, `pt-PT`, `pt-BR`) → `pt-BR`; else `en`.
- T017 [US1] [US3] Create frontend/src/i18n/locale-provider.tsx (new): resolves after mount; `en` imported statically, `pt-BR` by dynamic import; `NextIntlClientProvider locale messages timeZone={browserTimeZone()}`; sets `document.documentElement.lang` on resolve and on every switch; `useLocaleSwitch()` = `{locale, setLocale, toggleLocale, isPending}` with `useTransition`, writes the cookie on pick only; no navigation, the tree stays mounted, so typed values stay; cookies blocked → the switch holds for this page view.
- T018 [US4] Create frontend/src/i18n/translator.ts (new): a module store of the active locale and messages through `createTranslator`, for code outside React; `getApiError` and the other helpers keep their signatures (56 call sites in 35 files unchanged).
- T019 [US1] Messages and glossary:
  - frontend/src/i18n/messages/en.json, pt-BR.json (new): the plan's namespaces; reference keys `header.toggleLanguage`, `header.switchToEnglish`, `header.switchToPortuguese`, `icons.flagUs`, `icons.flagBr`; `errors.<CODE>` for every row of docs/error-codes.md plus `errors.unknown`; a params code writes the whole sentence with ICU args (`{seconds}`, `{name}`, …) in both languages; GEN-1003 one line; `en` values = today's exact words;
  - docs/plan/0019-language-switcher-and-error-codes.md `## Glossary` (application, draft, master CV, CV copy, timeline, cycle, fit, interview stages, report; brand names never translated); the owner reviews it before K3 starts (Plan corrections 14).
- T020 [US1] frontend/src/components/layout/root-providers.tsx: `LocaleProvider` inside `QueryClientProvider`, above Sonner, so toasts translate.
- T021 [US1] Create frontend/src/components/language-toggle.tsx (new) `LanguageToggle({ variant: "default" | "landing" })`: raw `RadioGroup` from `radix-ui` (not `ui/radio-group.tsx`: no indicator dot); options `en`/`EN`/`English`/US flag, then `pt-BR`/`BR`/`Português`/Brazil flag; root `aria-label` = `t("header.toggleLanguage")`, disabled while pending; item `aria-label` = endonym; every class of plan `## Contract` verbatim, both variants. frontend/src/components/icons/flag-us.tsx, flag-br.tsx (new, `aria-hidden`). Mounted nowhere in K2.
- T022 [US4] Errors by code (Plan corrections 7, 16):
  - frontend/src/lib/api-client.ts l.10-15 `getApiError`: `errors.<code>` with `params` → else the string `detail` → else `errors.unknown`; GEN-1003 shows its one line, never the `detail` array;
  - the same chain in frontend/src/lib/blob-error.ts and frontend/src/lib/rate-limit.ts (`rateLimitNotice`: GEN-1004 with `params.seconds`, else `Retry-After`);
  - frontend/src/lib/borderless-error.ts: messages by code, `cliLoginExpired` keyed on K1's code; frontend/src/services/types/auth.ts l.19-22 → AUTH-1005..AUTH-1008;
  - frontend/src/lib/api-error-message.ts (new); the 31 `.detail` reads in 15 files go through it.
- T023 [US1] Shared text: frontend/src/components/ui/* accessible names (sr-only "Close" and the like); ui/date-picker.tsx date-fns `ptBR` under `pt-BR`; ui/calendar.tsx react-day-picker `locale` and its month labels (l.40); frontend/src/components/common/* (empty state, confirm dialog).
- T024 [US3] Cookies: frontend/src/app/(public)/cookie-policy/cookie-policy-page.tsx becomes a client component, translated, plus a `NEXT_LOCALE` row (a preference cookie the user sets by choosing a language; holds `en` or `pt-BR`; one year); `cookie-policy/page.tsx` metadata stays English; frontend/src/components/cookie-consent.tsx translated.
- T025 [US1] Harness: frontend/src/test/setup.ts supplies `en` messages, so existing word assertions hold; frontend/playwright.config.ts `use.locale: "en-US"` (Plan corrections 13); try `react/jsx-no-literals` in frontend/eslint.config.mjs: adopt it (warn) if the noise is reasonable, else record the decision in frontend/CLAUDE.md (plan `## Open`).
- T026 [P] [US1] [US2] [US3] [US4] Vitest:
  - frontend/src/i18n/resolve-locale.test.ts: valid cookie wins; garbage cookie ignored; `pt`, `pt-PT`, `pt-BR` → `pt-BR`; `fr` → `en`; no cookie, no languages → `en`;
  - frontend/src/components/language-toggle.test.tsx: order, names, every class of both variants, disabled + `opacity-70` while pending, cookie attributes on pick, none before, `html[lang]`, a typed input keeps its value across a switch, text swaps with no navigation;
  - frontend/src/i18n/messages.test.ts: `en` and `pt-BR` have the same keys, no empty value, the same ICU args per key; `errors.*` == the catalog's codes and each message's ICU args == that code's params, reading `../docs/error-codes.md`, failing (never skipping) when the file is missing;
  - frontend/src/lib/api-client.test.ts: known code → pt-BR text with its params, unknown code → `detail`, no body → generic line in the active language, GEN-1003 → one line;
  - app/login/login-page.test.tsx l.159-206 and components/badges/confirm-membership-form.test.tsx l.114-118: numbered codes.
- T027 [US1] frontend/CLAUDE.md: an i18n section (provider, messages, translator, errors by code, `en` = today's words, a new error = enum member + catalog row + two messages, server components cannot translate, the switcher and its hooks); old code strings at l.189, l.193, l.1485-1496, l.1541 → numbered (Plan corrections 19).
- T028 [US1] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - full `frontend/scripts/e2e.sh` green; no applika-e2e container, network or volume left;
  - `grep -rn "FeatureKey\|useHasFeature\|FeatureGate" frontend/src/i18n frontend/src/components/language-toggle.tsx` → none (R-024);
  - commits conventional, no ticket key (e.g. `feat(web): add the language core`); not a merge point.
AC:
- The system offers two languages, English and Portuguese (Brazil). English is the default.
- The system shows the Borderless platform's language switcher, ported whole: one pill-shaped single-choice group named "Toggle language", with two options in this order: "EN" with the United States flag, named "English", and "BR" with the Brazil flag, named "Português". The group is disabled while a change is in progress.
- The switcher keeps both looks the reference has, the default look and the landing look, each with the reference's exact styling.
- Choosing a language changes every text on the current screen at once. The user stays on the page, and what they typed stays.
- The system saves the choice in a browser cookie named NEXT_LOCALE, for one year, valid for every path, signed in or not. Nothing is stored on the account.
- With no saved choice, a browser whose preferred languages include any Portuguese variant gets Portuguese (Brazil), and every other browser gets English. A saved choice always wins over the browser setting.
- The page declares its language (`en` or `pt-BR`) to the browser and to assistive technology, and updates it when the user switches.
- Every text on every screen is translated, admin screens included: headings, labels, buttons, menus, hints, empty and error states, toasts, dialog text, and accessible names and descriptions.
- Dates, times and numbers on screens are written the way the chosen language writes them.
- The six named codes from ADR-0024 (the sign-in and report refusals) become numbered codes like every other error, and their English messages stay.
- The web shows each error in the user's language by looking up its code. The translations live in the web only.
- When the web meets a code it does not know, it shows the API's English message. When there is no message either, it shows a generic line in the user's language.
- Some of today's messages name a value: a wait in seconds, a count, a report day, or the name of a conflicting platform or public row. Only these codes also send the named values as params next to the code. The web writes the whole sentence in either language with those values, so the value still shows. The error document lists the params of each such code.
- Every request the API refuses for invalid input (a validation error) carries the same single code, GEN-1003, and keeps today's list of field errors unchanged. The web shows one translated line for it.
- The cookie policy page lists the language cookie, what it holds and how long it lasts.
- Everyone gets the switcher and both languages at once on release, with no beta stage and no allowlist.
- Cookies blocked: the switch applies to the current page view only, and the next load falls back to browser detection. (PRD 0019 edge case)
- A cookie holding any value other than `en` or `pt-BR`: ignored, and browser detection decides. (PRD 0019 edge case)
- A browser set to `pt`, `pt-PT` or `pt-BR`: Portuguese (Brazil). (PRD 0019 edge case)
- A switch while a form is half filled or a request is in flight: the typed values stay, and the request's answer shows in the new language. (PRD 0019 edge case)
- Two open tabs: the other tab follows on its next page load. (PRD 0019 edge case)
- `pnpm lint`, `pnpm prettier --check .`, `pnpm tsc --noEmit` and `pnpm test` (vitest) pass. (.claude/rules/quality-gates.md)

## K3 — Screens part 1: landing, sign-in, terminal code, welcome, device approval, signed-in shell, profile and devices, dashboard, agenda and calendar file, reports, cycles   side: frontend   covers: R-009 (screens part 1), R-010 (screens part 1), R-021 (device names), R-025   deps: K2
Goal: Every text on the public, auth and shell screens and on profile, devices, dashboard, agenda, reports and cycles reads from the messages in both languages, `en` unchanged; their dates and numbers follow the locale; the shared vocabularies (`src/options.ts`, `stageLabel()`) translate; the calendar file's SUMMARY follows the language while its UID stays.
Owner's words: "Today Applika is available in just one language - english - and I want to expand to english and portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app."
Clarified: "screens only, admin included"; PRD Assumptions: "In the calendar file, the event title (SUMMARY) follows the language, and the event identity (UID) keeps its legacy label"; "Dates and numbers follow the chosen language. The places that force English formatting today stop doing so"; "Product and brand names stay as they are: Applika, Borderless, BASE, PSP, GitHub, Discord"; data text "Stays English (Recommended)".
Covers: as the header.
Release: `0019-release`. Plan: `## Frontend` (copy, formatting, timeline options, calendar, notifications, server components). Tasks: Plan corrections 11, 12, 14, 15, 17.
Touch:
- frontend/src/options.ts; frontend/src/components/timeline/timeline-options.ts
- frontend/src/app/(public)/home-page.tsx, frontend/src/components/landing/*; frontend/src/app/login/login-page.tsx, frontend/src/components/auth/*, frontend/src/components/auth-buttons.tsx; frontend/src/app/cli/code/cli-code-page.tsx, frontend/src/components/cli-code/*
- frontend/src/app/(protected)/welcome/welcome-page.tsx; frontend/src/app/(protected)/device/device-page.tsx, frontend/src/components/device/*, device-sign-in-copy.ts
- frontend/src/components/layout/* (header, sidebar, sidebar-nav, nav.ts, user-menu, app-shell, cycle-selector, agenda-dropdown, not-found-message.tsx); frontend/src/app/not-found.tsx; frontend/src/components/cli-promo-banner.tsx, theme-toggle.tsx, app-logo.tsx, components/features/*, components/applications/feedback-dialog.tsx
- frontend/src/app/(protected)/profile/*, frontend/src/components/profile/* (devices-copy.ts, github-restore-copy.ts), frontend/src/components/badges/*
- frontend/src/app/(protected)/dashboard/*, frontend/src/components/dashboard/*; frontend/src/app/(protected)/reports/**, frontend/src/components/reports/*; frontend/src/app/(protected)/cycles/cycles-page.tsx
- frontend/src/app/(protected)/agenda/*, frontend/src/components/agenda/* (agenda-copy.ts); frontend/src/contexts/agenda-notifications-context.tsx; frontend/src/lib/calendar.ts
- frontend/src/hooks/use-user.ts, use-sessions.ts, use-github-restore.ts, use-repports.ts, use-cycles.ts
- tests beside them (calendar.test.ts and the touched screens)
Pattern:
- K2's `en.json` / `pt-BR.json` namespaces and the plan glossary
- frontend/src/components/agenda/agenda-copy.ts (copy module shape: one key per constant, `en` = the constant's words)
Contract: none new (K1's error body, K2's messages).
Steps:
- T029 [US1] Build on `labs01-145` after the K2 tip. The owner has reviewed the glossary in plan 0019 (Plan corrections 14); if not, stop and ask.
- T030 [US1] Shared vocabularies: frontend/src/options.ts labels; frontend/src/components/timeline/timeline-options.ts `stageLabel()` / `stageShortLabel()` and the `EVENT_TYPE_CONFIG` / `INTERVIEW_TYPE_CONFIG` labels read the translator; the `" - "` joiner and the `en` words unchanged.
- T031 [US1] Public and auth screens: frontend/src/app/(public)/home-page.tsx, frontend/src/components/landing/*, frontend/src/app/login/login-page.tsx, frontend/src/components/auth/*, frontend/src/components/auth-buttons.tsx, frontend/src/app/cli/code/cli-code-page.tsx, frontend/src/components/cli-code/*, frontend/src/app/(protected)/welcome/welcome-page.tsx, frontend/src/app/(protected)/device/device-page.tsx, frontend/src/components/device/*, device-sign-in-copy.ts. Metadata, JSON-LD and page titles stay English.
- T032 [US1] Shell (Plan corrections 15, 17): frontend/src/components/layout/* (nav labels, header, user menu both variants, cycle selector, agenda dropdown with its five format calls, app shell names such as "Open navigation menu"), frontend/src/components/layout/not-found-message.tsx and frontend/src/app/not-found.tsx become client; frontend/src/components/cli-promo-banner.tsx, theme-toggle.tsx, app-logo.tsx, components/features/beta-badge.tsx and feature-gate.tsx, components/applications/feedback-dialog.tsx.
- T033 [US1] [US4] Profile and devices: frontend/src/app/(protected)/profile/*, frontend/src/components/profile/* (profile-view.tsx date, edit-form.tsx, devices tab, device-row, devices-copy.ts date, github restore card and notice), frontend/src/components/badges/* (accessible names translated, "BASE" / "PSP" kept), hooks use-user.ts, use-sessions.ts, use-github-restore.ts toasts. A device's `client_label` ("Chrome on macOS") shows as the API sends it (R-021).
- T034 [US1] Dashboard, reports, cycles: frontend/src/app/(protected)/dashboard/*, frontend/src/components/dashboard/* (chart labels and tooltips through `stageLabel`, numbers by locale), frontend/src/app/(protected)/reports/**, frontend/src/components/reports/*, hooks/use-repports.ts; frontend/src/app/(protected)/cycles/cycles-page.tsx (date), hooks/use-cycles.ts toasts.
- T035 [US1] Agenda and calendar file: frontend/src/app/(protected)/agenda/agenda-page.tsx, frontend/src/components/agenda/* (agenda-copy.ts; display dates and times by locale; `agenda-view.ts` l.27, l.85, l.134 keep `en-US`, Plan corrections 11); frontend/src/contexts/agenda-notifications-context.tsx (notification text, three format calls); frontend/src/lib/calendar.ts SUMMARY and file name from the translated `stageLabel()`, the `legacyStageLabel()` UID byte-for-byte unchanged (R-025).
- T036 [P] [US1] Vitest: lib/calendar.test.ts (SUMMARY in pt-BR; UID identical under both locales); the shell's names in pt-BR (header, nav, user menu); not-found in pt-BR; a profile date and a dashboard number in pt-BR; every existing word test green on `en`.
- T037 [US1] Check by hand on `pnpm dev` with a pt-BR browser, both themes, desktop and 320px: every K3 screen in Portuguese except user content, product names and endonyms; no sideways scroll; the header leaves room for the K4 switcher next to the theme toggle; the `w-60` rail, tabs and table headers hold the longer labels.
- T038 [US1] Gate, close: `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`; full `frontend/scripts/e2e.sh` green; no applika-e2e container left; commits conventional, no ticket key (e.g. `feat(web): translate the shell, profile, agenda and reports`); not a merge point.
AC:
- Every text on every screen is translated, admin screens included: headings, labels, buttons, menus, hints, empty and error states, toasts, dialog text, and accessible names and descriptions.
- Dates, times and numbers on screens are written the way the chosen language writes them.
- Text the API produces as data, rather than as an error message, stays English in both languages and is shown as the API sends it. This covers the keyword reorder descriptions, device names such as "Chrome on macOS", a job source's last error, and the CV preview with its PDF and Markdown exports. The preview stays a twin of the English PDF.
- The calendar file's event title follows the chosen language. The event's identity inside the file does not change, so a re-import still updates the same calendar entry.
- Longer Portuguese labels at narrow widths (320px): no sideways scroll, and the header still fits the switcher. (PRD 0019 edge case)
- User content (names, notes, CV text, company names, emails) is never translated. (PRD 0019 edge case)
- `pnpm lint`, `pnpm prettier --check .`, `pnpm tsc --noEmit` and `pnpm test` (vitest) pass. (.claude/rules/quality-gates.md)

## K4 — Screens part 2 and admin: applications, timeline, drafts, CVs, job board, admin area; the switcher mounted everywhere; the language E2E   side: frontend (+ E2E)   covers: R-004, R-005 (whole screen, E2E), R-009 (screens part 2, admin), R-010 (screens part 2, admin), R-021 (adjustments, last run error, CV preview), R-024 (ungated mounts)   deps: K3
Goal: The remaining screens translate (applications, timeline, drafts, master CVs and copies, job board, every admin screen), their dates and numbers follow the locale, data text stays as sent, the CV preview stays the English twin; then the switcher mounts in the signed-in header, the landing header (also the cookie policy), the sign-in page and the terminal code page, `default` look everywhere; `language.spec.ts` proves it on the real stack, with a pt-BR sweep of every route.
Owner's words: "Today Applika is available in just one language - english - and I want to expand to english and portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app."
Clarified: "screens only, admin included"; "Port both, use default (Recommended)" ("both variants ported exactly, and the landing header mounts default"); "No gate, everyone at once"; data text "Stays English (Recommended)". PRD Assumptions: placement "in the signed-in header next to the theme toggle on every protected page, at every width … in the landing header, which the cookie policy page shares; and in a slot of their own on the sign-in page and the terminal code page … Visible at every width, with no sideways scroll at 320px".
Covers: as the header.
Release: `0019-release`. Plan: `## Frontend` (copy, formatting, mounts), `## Tests` (E2E). Tasks: Plan corrections 11, 12, 13, 18.
Touch:
- frontend/src/app/(protected)/applications/** (incl. new-with-cv/, cv/), frontend/src/components/applications/* (not feedback-dialog.tsx), application-card-copy.ts, application-close-copy.ts, application-format.ts
- frontend/src/components/timeline/* (not timeline-options.ts), timeline-copy.ts, timezone-options.ts
- frontend/src/components/application-drafts/*, draft-copy.ts
- frontend/src/app/(protected)/cvs/**, frontend/src/components/base-cvs/* (not cv-document-blocks.tsx), base-cvs/types.ts; frontend/src/components/tailored-cvs/*, tailored-cvs/types.ts
- frontend/src/app/(protected)/jobs/**, frontend/src/components/jobs/*, job-copy.ts
- frontend/src/app/(protected)/admin/**, frontend/src/components/admin/*, feature-copy.ts, job-sources-copy.ts
- frontend/src/hooks/use-applications.ts, use-timeline.ts, use-create-base-cv.ts, use-update-base-cv.ts, use-delete-base-cv.ts, use-create-tailored-cv.ts, use-update-tailored-cv.ts, use-delete-tailored-cv.ts, use-export-base-cv-pdf.ts, use-export-base-cv-markdown.ts, use-export-tailored-cv-pdf.ts, use-export-tailored-cv-markdown.ts, use-export-cv-diff.ts, use-jobs.ts, use-job-searches.ts, use-admin.ts
- mounts: frontend/src/components/layout/header.tsx (l.80), frontend/src/components/landing/landing-header.tsx (l.26), frontend/src/app/login/login-page.tsx, frontend/src/app/cli/code/cli-code-page.tsx
- frontend/e2e/language.spec.ts (new); e2e specs that pin header content, if any
- tests beside the touched screens; frontend/CLAUDE.md
Pattern:
- frontend/src/components/theme-toggle.tsx and its two mounts (header control placement)
- frontend/e2e/devices.spec.ts (serial spec that cleans up after itself); frontend/e2e/shell-responsive.spec.ts (320px geometry)
- ui-designer; ADR-0022 tokens (`src/app/globals.css`)
Contract: none new.
Steps:
- T039 [US1] Build on `labs01-145` after the K3 tip.
- T040 [US1] Applications and timeline: frontend/src/app/(protected)/applications/*, frontend/src/components/applications/* (not feedback-dialog.tsx, K3), application-card-copy.ts, application-close-copy.ts, application-format.ts (three format calls), frontend/src/components/timeline/* and timeline-copy.ts, timezone-options.ts display labels (l.63 keeps `en-US`, Plan corrections 11), hooks use-applications.ts, use-timeline.ts toasts.
- T041 [US1] Drafts: frontend/src/app/(protected)/applications/new-with-cv/*, frontend/src/components/application-drafts/*, draft-copy.ts (its format call; `localCalendarDay()` untouched).
- T042 [US1] CVs: frontend/src/app/(protected)/cvs/**, frontend/src/app/(protected)/applications/cv/*, frontend/src/components/base-cvs/* except cv-document-blocks.tsx (the preview stays the English twin of the PDF, R-021; its chrome, the page indicator, the overflow note and `CV_PDF_LAYOUT_NOTICE`, is app text and translates with `en` unchanged), cv-card.tsx date, base-cvs/types.ts and tailored-cvs/types.ts copy constants, frontend/src/components/tailored-cvs/* (`adjustments.description` as sent), the CV hooks' toasts.
- T043 [US1] Job board: frontend/src/app/(protected)/jobs/**, frontend/src/components/jobs/*, job-copy.ts (two format calls), hooks use-jobs.ts, use-job-searches.ts. `JOB_SOURCES` names stay.
- T044 [US5] Admin: frontend/src/app/(protected)/admin/**, frontend/src/components/admin/* (catalog-table, feature-table, job-sources-table formats; charts), feature-copy.ts and job-sources-copy.ts (formats), hooks/use-admin.ts (20 toasts). A job source's `last_run_error` shows as sent (R-021).
- T045 [US1] Mount the switcher, `default` look everywhere, no gate (R-004, R-024; Plan corrections 18):
  - frontend/src/components/layout/header.tsx l.80, before `<ThemeToggle />`, every protected page at every width (welcome and device included);
  - frontend/src/components/landing/landing-header.tsx l.26 (also `/cookie-policy` through `(public)/layout.tsx`);
  - a top-right slot of its own in frontend/src/app/login/login-page.tsx and frontend/src/app/cli/code/cli-code-page.tsx;
  - the `landing` variant mounted nowhere; inside the `z-30` header and the `z-40` landing header, no portal (frontend/CLAUDE.md "Stacking contract").
- T046 [US1] [US5] ui-designer pass: the toggle in its four places, both themes, desktop and 320px (no sideways scroll, header still fits); pt-BR on the rail, tabs, table headers, dialogs of K4's screens.
- T047 [P] [US1] [US5] Vitest: header and landing header render `LanguageToggle` `default`; login and terminal code slots; an admin screen and a jobs screen in pt-BR; the CV preview text stays English under pt-BR; every existing word test green on `en`.
- T048 [US1] [US2] [US3] [US4] [US5] E2E frontend/e2e/language.spec.ts (new, serial), real stack:
  - context `locale: "pt-BR"`: landing in Portuguese, `html[lang="pt-BR"]`; the toggle on landing, `/cookie-policy` (NEXT_LOCALE row), `/login`, `/cli/code`;
  - EN click: cookie `NEXT_LOCALE=en`, about one year, `Path=/`; reload stays English;
  - `loginAs` → dashboard in English; BR in the header → Portuguese with no navigation, a half-typed field keeps its value;
  - one API 409 shown in Portuguese (e.g. a saved search name taken), and one params code with its value in Portuguese;
  - an admin page in Portuguese;
  - pt-BR sweep: every route of e2e/smoke.spec.ts's list in a pt-BR context: `html[lang="pt-BR"]` and no visible text equal to an `en` message whose `pt-BR` value differs (user content, product names and endonyms excluded);
  - a garbage cookie value → browser detection decides;
  - 320px: no sideways scroll on landing, login and a signed-in page;
  - cleans up its cookies and any data it made.
- T049 [US1] frontend/CLAUDE.md: where the switcher mounts, the language E2E and its sweep, name clashes for locators ("English" / "Português" are item names, "EN" / "BR" their text).
- T050 [US1] Gate, close: `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`; full `frontend/scripts/e2e.sh` green, language.spec.ts included; no applika-e2e container, network or volume left; `git -C applika diff 418aab2f -- frontend/src/services/types/features.ts backend/app/core/features.py` → empty; commits conventional, no ticket key (e.g. `feat(web): mount the language switcher`); not a merge point.
AC:
- The switcher sits in the signed-in header on every protected page and in the header of the landing and cookie policy pages. It also sits on the sign-in page and the terminal code page. It uses the default look everywhere, the landing page header included, in both themes. The landing look is ported but not mounted.
- Choosing a language changes every text on the current screen at once. The user stays on the page, and what they typed stays.
- Every text on every screen is translated, admin screens included: headings, labels, buttons, menus, hints, empty and error states, toasts, dialog text, and accessible names and descriptions.
- Dates, times and numbers on screens are written the way the chosen language writes them.
- Text the API produces as data, rather than as an error message, stays English in both languages and is shown as the API sends it. This covers the keyword reorder descriptions, device names such as "Chrome on macOS", a job source's last error, and the CV preview with its PDF and Markdown exports. The preview stays a twin of the English PDF.
- Everyone gets the switcher and both languages at once on release, with no beta stage and no allowlist.
- Longer Portuguese labels at narrow widths (320px): no sideways scroll, and the header still fits the switcher. (PRD 0019 edge case)
- User content (names, notes, CV text, company names, emails) is never translated. (PRD 0019 edge case)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K5 — Closing 0019: full gate, E2E with the pt-BR sweep, ADR-0025, walk in both languages and themes, tag `0019-release`   side: both (backend, frontend, cli)   covers: — (closing)   deps: K4
Goal: Prove the release whole: the full gate in CLAUDE.md order plus the target gates, the whole E2E suite with language.spec.ts and its pt-BR sweep, ADR-0025 Accepted and matching the build, no test infrastructure left, a walk by hand in both languages and both themes, the `0019-release` tag. No new feature work.
Owner's words: "Today Applika is available in just one language - english - and I want to expand to english and portuguese, access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app."
Clarified: success signals: in Portuguese no screen shows English text other than user content, product names, the endonyms and the Assumptions' exceptions; every error code the API can return is in the catalog and has a message in both languages, a check fails the build otherwise; switching takes effect with no reload on the landing page, the sign-in page and a signed-in page; the CLI's own test suite passes with no change.
Covers: — (closing)
Release: `0019-release`, tag on this tip. Plan: `## Rules that bind`, `## Risks`. Tasks: Plan corrections 1, 9, 10.
Touch:
- docs/adr/0025-two-languages-and-numbered-error-codes.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0018-borderless-sign-in-and-membership-badges.tasks.md K4
Contract: none new.
Steps:
- T051 On `labs01-145` after the K4 tip. Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T052 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `418aab2f`, ceiling 171; every file K1 touched clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test` with no CLI source change since `418aab2f` (`git -C applika diff 418aab2f -- cli/src` → empty); `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest`.
- T053 E2E: the whole suite through `frontend/scripts/e2e.sh` green, language.spec.ts with its pt-BR sweep and the updated borderless-signin.spec.ts included; the `e2e` job of `.github/workflows/frontend-ci.yaml` runs it. Cheaper layers carry what the E2E does not:
  - codes, params, catalog parity, byte-equal 404, 422 without `input`, 429/503 headers, OAuth `error`: backend/tests/unit/test_error_codes.py, backend/tests/integration/test_error_codes.py, test_feature_gating.py, test_rate_limit.py;
  - message parity, ICU args against the catalog: frontend/src/i18n/messages.test.ts;
  - locale resolution edge cases (garbage cookie, `pt`, `pt-PT`, no languages): frontend/src/i18n/resolve-locale.test.ts;
  - the switcher's classes, pending state, cookie attributes: frontend/src/components/language-toggle.test.tsx;
  - error fallback chain: frontend/src/lib/api-client.test.ts; calendar UID: frontend/src/lib/calendar.test.ts;
  - installed CLIs: `cd cli && make test`, `uv run pytest tests -k "steps or finalize or supports"`, the T056 walk.
- T054 No test infrastructure left: `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` → empty; no network or volume from docker-compose.e2e.yml, the Borderless stub included; no testcontainers Postgres or Redis left; the owner's dev containers untouched.
- T055 ADRs, rules, repo:
  - ADR-0025 reads Accepted (2026-10-31); its Decision matches the build (next-intl or `use-intl` client provider only, browser resolution, cookie on pick, the switcher whole, `code` on every error, GEN-1003, `params`, scheme, catalog, the six renumbered, additive notes, beta exception); a departure → a dated as-built note under Consequences, the Decision untouched;
  - ADR-0024 carries "Amended by ADR-0025" on §6 and As-built §1; ADR-0018 the 0025 exception and the shared GEN-1001; ADR-0015 and ADR-0019 their dated notes; ADR-0006 and ADR-0009 Accepted;
  - `git -C applika diff 418aab2f -- backend/migrations` → empty (no migration); `git -C applika diff 418aab2f -- backend/app/core/features.py frontend/src/services/types/features.ts` → empty (no gate);
  - the changelogs verify command; both changelogs carry K1's lines under `## [Unreleased]`;
  - commit-format verify on `418aab2f..labs01-145` → no output; no ticket key added outside this tasks file (`git -C applika diff 418aab2f -U0 -- . ':!docs/plan/0019-language-switcher-and-error-codes.tasks.md' | grep '^+' | grep -E 'KODI-[0-9]+'` → empty); `git -C applika log --all --oneline -- '*agent-memory*'` → empty.
- T056 Walk by hand on a real stack: `KEEP_STACK=1 frontend/scripts/e2e.sh e2e/smoke.spec.ts` (web :8180, API :8100, the stub), both languages × both themes, desktop and 320px:
  - first visit with a pt-BR browser (brief English flash accepted), a pt-PT browser, an `fr` browser; a garbage `NEXT_LOCALE`; cookies blocked; two tabs;
  - landing, cookie policy (NEXT_LOCALE row), `/login`, `/cli/code`, `/welcome`, `/device`: the toggle, `default` look, no reload on switch;
  - signed in: dashboard, applications with a half-filled sheet then a switch (values stay), a timeline 409 in Portuguese, a GEN-1003 line, the sign-in 429 with its seconds in Portuguese, drafts, CVs (preview, PDF and Markdown stay English), jobs, reports, cycles, agenda (`.ics` SUMMARY in Portuguese, re-import updates the same entry), profile and devices (device names as sent), every admin screen (a source's last error as sent);
  - CLI: `uvx applika-cli==0.1.4`, `uvx applika-cli==1.0.1` and the branch's 1.1.0 (`cd cli && uv run applika`) against the stack: `login`, `whoami`; every version keeps working and one refused command prints the same `detail` as before; an unhandled 500 prints `Internal Server Error`;
  - no new feature work.
- T057 Record at close:
  - annotated local tag `0019-release` on the K5 tip;
  - owner steps (`### Release`): merge into `develop` only after `0018-release-c` is merged; no `alembic` step; CD deploys API and web; rollback = previous image tags;
  - the agent never touches prod or `main`.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics beyond 171 and touched files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0025, Accepted 2026-10-31; ADR-0024 amended by it; ADR-0015, ADR-0018 and ADR-0019 carry its dated notes; ADR-0018 carries its beta exception; bound ADR-0006 and ADR-0009 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases, testcontainers or Borderless stub left running.
- The E2E the feature earned (language.spec.ts with its pt-BR sweep, and the updated borderless-signin.spec.ts; the whole suite green via frontend/scripts/e2e.sh on the real stack) runs inside the gate and is green; codes, params, catalog parity, locale edge cases, message parity, the calendar UID and installed CLIs are carried by the cheaper layers named in T053.
- By-hand walk of the feature on a real stack done in both languages and both themes, desktop and 320px, including the success signals (no English outside user content, product names and endonyms; switching with no reload on the landing page, the sign-in page and a signed-in page; errors in Portuguese by code; applika-cli 0.1.4, 1.0.1 and 1.1.0 keep working, and an unhandled 500 prints "Internal Server Error").
- No new feature work.
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | Backend: numbered `code` on every error answer, `params`, the error catalog, changelogs | backend | R-011..R-013, R-014 (API), R-015, R-016, R-019 (API), R-020 (API), R-021 (API), R-022 | — | `0019-release` |
| K2 | Web i18n core: provider, locale and cookie, ported switcher (unmounted), errors by code, shared UI text, cookie notice and policy | frontend | R-001..R-003, R-005 (mechanism), R-006..R-008, R-009 (shared), R-010 (pickers), R-014 (web), R-017, R-018, R-019 (web), R-020 (web), R-023, R-024 | K1 | `0019-release` |
| K3 | Screens part 1: landing, sign-in, terminal code, welcome, device, shell, profile and devices, dashboard, agenda and calendar file, reports, cycles | frontend | R-009, R-010, R-021 (device names), R-025 | K2 | `0019-release` |
| K4 | Screens part 2 and admin: applications, timeline, drafts, CVs, job board, admin; switcher mounted; language E2E | frontend (+ E2E) | R-004, R-005, R-009, R-010, R-021, R-024 | K3 | `0019-release` |
| K5 | Closing 0019: full gate, E2E with pt-BR sweep, ADR-0025, walk, tag | both | — (closing) | K4 | tag `0019-release` |

## Matrix
| R | K |
|---|---|
| R-001 | K2 |
| R-002 | K2 |
| R-003 | K2 |
| R-004 | K4 |
| R-005 | K2 (mechanism, vitest), K4 (whole screen, E2E) |
| R-006 | K2 |
| R-007 | K2 |
| R-008 | K2 |
| R-009 | K2 (shared UI, cookie notice and policy), K3 (screens part 1), K4 (screens part 2, admin) |
| R-010 | K2 (date pickers), K3, K4 |
| R-011 | K1 |
| R-012 | K1 |
| R-013 | K1 |
| R-014 | K1 (API), K2 (web types and tests) |
| R-015 | K1 |
| R-016 | K1 |
| R-017 | K2 |
| R-018 | K2 |
| R-019 | K1 (API, catalog), K2 (web sentences) |
| R-020 | K1 (API), K2 (web line) |
| R-021 | K1 (API never codes data), K3 (device names), K4 (adjustments, last run error, CV preview and exports) |
| R-022 | K1 (K5 T056 walks it) |
| R-023 | K2 |
| R-024 | K2 (ungated provider), K4 (ungated mounts) |
| R-025 | K3 |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. `## In the owner's words` is one sentence; checked clause by clause:
- "Today Applika is available in just one language - english - and I want to expand to english and portuguese": K2 (two languages, provider, detection, cookie), K3 and K4 (every screen), K1 (errors carry codes so a Portuguese screen shows Portuguese errors, clarification 1).
- "access this website and implement the same language switcher https://platform.borderlesscoding.com/ to this app": K2 (the reference `LanguageToggle` ported whole, both looks), K4 (mounted on every page the PRD places it).
