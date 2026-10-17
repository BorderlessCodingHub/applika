# Tasks 0006 — Visual identity

PRD: docs/prd/0006-visual-identity.md   Plan: docs/plan/0006-visual-identity.md
ADRs bound: 0006, 0007, 0002, 0010 (all Accepted)

## Order
K1 S1 gates (US1) → K2 S2 platform (US2) → K3 S3 tokens (US3, US6) → K4 S4 shell + pages (US4, US5) → K5 closing

No foundation slice: plan `## Data` = none.
Owner's order: "Merge to one ticket per slice". One slice = one branch = one PR to `develop`. Slices run more than a day; owner accepted.

Slice order kept over story priority: US6 (P3) sits in S3, before US4/US5 (P2).
Owner's words "Identity → CV → steps → Discord": roadmap order across features, served by the feature set (this feature first; CV/timeline/Discord are non-goals, later features). No slice needed.

## K1 — S1 gates: frontend CI gates + real-stack E2E smoke   side: both   covers: R-001, R-002, R-003, R-004, R-005, R-006, R-007   deps: —
Owner's words: "the better of two worlds, i also want frontend tests and e2e tests with real application stack"
Touch: frontend/package.json, frontend/.prettierrc (new), frontend/src/**, frontend/src/test/example.test.ts, .github/workflows/frontend-ci.yaml, backend/app/scripts/seed_e2e.py (new), backend/tests/unit/test_seed_e2e.py (new), backend/app/core/tokens.py (read), docker-compose.e2e.yml (new), scripts/e2e.sh (new), frontend/playwright.config.ts (new), frontend/e2e/support/auth.ts (new), frontend/e2e/smoke.spec.ts (new), frontend/e2e/auth-guard.spec.ts (new), frontend/e2e/admin-gating.spec.ts (new)
Contract: seed stdout JSON `{"user_id": str, "access_token": str, "refresh_token": str, "admin_user_id": str, "admin_access_token": str, "admin_refresh_token": str}`; exit non-zero + no output when `ENVIRONMENT=PROD`; no route. Cookies `__access`/`__refresh` on host `127.0.0.1`; web `127.0.0.1:8180`, api `127.0.0.1:8100` (`/api` root path), `CORS_ORIGINS=["http://127.0.0.1:8180"]` with credentials.
Steps:
- T001 [US1] Add scripts `format:check` = `prettier --check .`, `typecheck` = `tsc --noEmit` in frontend/package.json
- T002 [P] [US1] Create prettier config with `prettier-plugin-tailwindcss` in frontend/.prettierrc (new)
- T003 [US1] Fix existing prettier violations, separate commit, across frontend
- T004 [US1] Fix existing type errors until `pnpm tsc --noEmit` passes in frontend/src
- T005 [P] [US1] Replace sample with date-picker local-date parse test (no off-by-one) for frontend/src/components/ui/date-picker.tsx, removing frontend/src/test/example.test.ts
- T006 [US1] Add jobs `lint` (`pnpm lint`), `format` (`pnpm prettier --check .`), `types` (`pnpm tsc --noEmit`), `unit` (`pnpm test`), `build` (`pnpm build`) in .github/workflows/frontend-ci.yaml
- T007 [US1] Check whether head migrations seed supports rows (platforms, steps_definition, feedbacks_definition) for backend/app/scripts/seed_e2e.py (new)
- T008 [US1] Create upsert of regular user + admin user (`is_admin=true`, `encrypted_github_token=NULL`), plus supports rows if head lacks them, in backend/app/scripts/seed_e2e.py (new)
- T009 [US1] Mint `__access` via `create_access_token` and refresh via `create_refresh_token_value` from backend/app/core/tokens.py, print Contract JSON, in backend/app/scripts/seed_e2e.py (new)
- T010 [US1] Refuse to run when `ENVIRONMENT == 'PROD'` (non-zero exit, no output) in backend/app/scripts/seed_e2e.py (new)
- T011 [US1] Test refuses in PROD; minted token decodes, sub = github_id in backend/tests/unit/test_seed_e2e.py (new)
- T012 [US1] Add script `e2e` = `playwright test` and dev dep `@playwright/test` in frontend/package.json
- T013 [P] [US1] Create stack `api` (backend/Dockerfile, `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`, `ENVIRONMENT=DEV`, CORS, `127.0.0.1:8100:8000`), `web` (frontend/docker/Dockerfile, `API_BASE_URL=http://127.0.0.1:8100/api`, `127.0.0.1:8180:80`), `db` postgres:16, `redis` redis:7-alpine, no volumes, dummy GitHub client + generated Fernet key in docker-compose.e2e.yml (new)
- T014 [P] [US1] Create config, `baseURL` from `E2E_BASE_URL`, in frontend/playwright.config.ts (new)
- T015 [P] [US1] Create `loginAs(page, 'user'|'admin')` setting `__access`/`__refresh` cookies for host `127.0.0.1` in frontend/e2e/support/auth.ts (new)
- T016 [US1] Create runner: down -v → up --build --wait → poll `http://127.0.0.1:8100/api/openapi.json` → `exec -T api python -m app.scripts.seed_e2e` → export tokens → `pnpm exec playwright test` → trap teardown, in scripts/e2e.sh (new)
- T017 [US1] Verify cookie origin, CORS credentials and `/api` root_path on direct uvicorn against backend/app/main.py via docker-compose.e2e.yml (new)
- T018 [P] [US1] Test each of 14 pages renders as user/admin, heading/role assertions only, in frontend/e2e/smoke.spec.ts (new)
- T019 [P] [US1] Test anon visit to signed-in page lands on `/login` in frontend/e2e/auth-guard.spec.ts (new)
- T020 [P] [US1] Test non-admin blocked from `/admin*` and Admin nav hidden in frontend/e2e/admin-gating.spec.ts (new)
- T021 [US1] Add job `e2e` (`scripts/e2e.sh`, working dir repo root, paths trigger adds `backend/**`, `docker-compose.e2e.yml`, `scripts/e2e.sh`) in .github/workflows/frontend-ci.yaml
AC:
- CI runs eslint, prettier check, TypeScript type check and the unit test suite on every frontend pull request to `develop`, and fails the PR when any of them fails.
- An end-to-end suite runs in a browser against the real application stack: the built API, the built frontend, a real Postgres migrated to head and a real Redis, with no mocked API.
- The end-to-end suite signs in with a seeded regular user and a seeded admin user through real session cookies minted by the application's own token code, without going through GitHub's site; the seeding refuses to run in production, no login route is added, and every request after sign-in hits the real API.
- A smoke test opens each current page and asserts it renders: `/`, `/cookie-policy`, `/login`, `/dashboard`, `/applications`, `/agenda`, `/cycles`, `/reports`, one `/reports/[day]`, `/profile`, `/admin`, `/admin/companies`, `/admin/supports`, `/admin/users`.
- A smoke test checks that an unauthenticated visit to a signed-in page lands on `/login`, and that a non-admin user cannot reach admin pages.
- The smoke tests pass on today's look before the upgrade and keep passing after each later slice; they assert on visible text and roles, not on styling.
- One command runs the end-to-end suite locally and CI calls the same command.

## K2 — S2 platform: React 19, Tailwind 4 CSS-first, shadcn new-york, unified radix-ui   side: frontend   covers: R-006, R-008, R-009, R-010   deps: K1
Owner's words: "Upgrade in the identity feature"
Touch: frontend/package.json, frontend/pnpm-lock.yaml, frontend/src/**, frontend/postcss.config.js, frontend/tailwind.config.ts (delete), frontend/src/app/globals.css, frontend/components.json, frontend/src/components/ui/*
Steps:
- T022 [US2] Bump `react`/`react-dom` ^19.2, `@types/react(-dom)` ^19, `sonner` ^2, `next-themes` to React-19-compatible release, in frontend/package.json
- T023 [US2] Resolve React 19 peers `recharts` 2.15 (`react-is` 19), `cmdk`, `react-day-picker`, `framer-motion` in frontend/package.json
- T024 [US2] Fix React 19 type and runtime breaks in frontend/src
- T025 [US2] Run lint, prettier, tsc, vitest, build in frontend and smoke suite via scripts/e2e.sh, green
- T026 [US2] Bump `tailwindcss` ^4.2 + `@tailwindcss/postcss`, `tw-animate-css` replaces `tailwindcss-animate`, `tailwind-merge` ^3, `radix-ui` replaces `@radix-ui/react-*` in frontend/package.json
- T027 [P] [US2] Switch to `@tailwindcss/postcss` in frontend/postcss.config.js
- T028 [US2] Move theme into `@theme` (tokens still teal) in frontend/src/app/globals.css; delete frontend/tailwind.config.ts
- T029 [US2] Run Tailwind upgrade codemod, fix class renames (`shadow-sm`→`shadow-xs`, `ring` default width, `border` default colour) in frontend/src
- T030 [P] [US2] Set `style: new-york`, `tailwind.config: ""` in frontend/components.json
- T031 [US2] Regenerate alert-dialog, avatar, badge, button, card, dialog, dropdown-menu, input, label, popover, select, sheet, skeleton, sonner, textarea, tooltip in frontend/src/components/ui/; keep `SheetContent` `hideClose` in frontend/src/components/ui/sheet.tsx
- T032 [P] [US2] Restyle by hand, behaviour unchanged, frontend/src/components/ui/calendar.tsx, command.tsx, date-picker.tsx, range-slider.tsx, star-rating.tsx
- T033 [US2] Screenshot compare against the T025 (React 19, pre-Tailwind 4) look; run gates in frontend and smoke via scripts/e2e.sh, green
AC:
- The smoke tests pass on today's look before the upgrade and keep passing after each later slice; they assert on visible text and roles, not on styling.
- The frontend runs on React 19, Tailwind v4 with CSS-first configuration, and shadcn new-york components on the unified Radix package.
- Every page keeps its current URL, data, forms, validation, toasts and behaviour after the upgrade.
- The applika-only components (calendar, command, date picker, range slider, star rating) are kept and restyled; forms still use the timezone-safe date picker.

## K3 — S3 tokens: dark oklch, derived light, Inter + JetBrains Mono, dark default   side: frontend   covers: R-006, R-011, R-012, R-013, R-014, R-015, R-016   deps: K2
Owner's words: "Keep Applika name + logo" "Keep light+dark; restyle landing"
Touch: frontend/src/app/globals.css, frontend/src/app/layout.tsx, chart components in frontend/src, frontend/src/components/layout/root-providers.tsx, frontend/src/components/theme-toggle.tsx
Steps:
- T034 [US3] Replace dark block with oklch dark palette (neutral surfaces) in frontend/src/app/globals.css
- T035 [P] [US3] Load Inter + JetBrains Mono via `next/font`, drop DM Sans/Outfit, in frontend/src/app/layout.tsx
- T036 [P] [US3] Make recharts colours read CSS vars in dashboard/statistics charts under frontend/src
- T037 [US3] Check Applika name, logo, favicon, domain kept and no other product name or Compass logo in frontend
- T038 [US3] Run gates in frontend and smoke via scripts/e2e.sh, green
- T039 [US6] Write `:root` light palette: same hues as dark, blue primary, light surfaces; no twin → keep hue, invert lightness; in frontend/src/app/globals.css
- T040 [P] [US6] Set `ThemeProvider defaultTheme="dark"`, drop `enableSystem`, in frontend/src/components/layout/root-providers.tsx
- T041 [P] [US6] Keep toggle logic unchanged in frontend/src/components/theme-toggle.tsx
- T042 [US6] Unit test theme default = dark (saved "light" kept, saved "system" → dark) for frontend/src/components/layout/root-providers.tsx
- T043 [US6] Attach both-theme screenshots (charts readable) to PR; run gates in frontend and smoke via scripts/e2e.sh, green
AC:
- The smoke tests pass on today's look before the upgrade and keep passing after each later slice; they assert on visible text and roles, not on styling.
- The dark theme uses oklch colour tokens.
- The light theme uses the same hues as the dark theme, with a blue primary and light surfaces.
- Dark is the default for a visitor who has never chosen a theme; a saved choice is respected.
- The theme toggle stays and switches between light and dark.
- Text uses Inter and code or numeric text uses JetBrains Mono.
- The Applika name, logo, favicon and domain stay; no other product name or Compass logo appears.

## K4 — S4 shell + pages: sidebar shell, landing/login/cookie-policy restyle   side: frontend   covers: R-006, R-016, R-017, R-018, R-019, R-020   deps: K3
Owner's words: "Keep Applika name + logo" "Keep light+dark; restyle landing"
Touch: frontend/src/components/layout/nav.ts (new), frontend/src/components/layout/{app-shell,sidebar,sidebar-nav,header,user-menu}.tsx (new), frontend/src/components/layout/sidebar-nav.test.tsx (new), frontend/src/app/(protected)/layout.tsx, frontend/src/components/layout/app-layout.tsx (remove), frontend/src/components/layout/app-header.tsx (remove), frontend/src/components/app-logo.tsx, frontend/src/components/landing/* (10 files), frontend/src/app/login/page.tsx, frontend/src/app/(public)/cookie-policy/page.tsx, frontend/src/components/cookie-consent.tsx, frontend/src/components/auth-buttons.tsx, frontend/CLAUDE.md
Steps:
- T044 [US4] Create nav items `/dashboard`, `/applications`, `/agenda`, `/reports`, `/cycles`, `/profile`, `/admin` admin-only in frontend/src/components/layout/nav.ts (new)
- T045 [US4] Build shell with `AppLogo` from frontend/src/components/app-logo.tsx (not `brand.tsx`), user menu truncates long username/email, in frontend/src/components/layout/{app-shell,sidebar,sidebar-nav,header,user-menu}.tsx (new)
- T046 [US4] Move `cycle-selector.tsx`, `agenda-dropdown.tsx`, `ThemeToggle`, `FeedbackDialog`, `CliPromoBanner`, profile/logout menu into shell in frontend/src/components/layout/{header,user-menu}.tsx (new)
- T047 [US4] Collapse sidebar into open/close menu on narrow screens; cookie consent and CLI promo banner do not cover it, in frontend/src/components/layout/sidebar.tsx (new)
- T048 [US4] Use `AppShell` in frontend/src/app/(protected)/layout.tsx
- T049 [US4] Remove frontend/src/components/layout/app-layout.tsx and frontend/src/components/layout/app-header.tsx after shell wired
- T050 [P] [US4] Unit test active item + admin-only filtering in frontend/src/components/layout/sidebar-nav.test.tsx (new)
- T051 [US4] Run gates in frontend and smoke via scripts/e2e.sh, green
- T052 [P] [US5] Restyle to new tokens, copy/order/images/framer-motion kept, frontend/src/components/landing/* (hero, features, how-it-works, stats, testimonials, open-source, cta, dashboard-mockup, landing-header, landing-footer)
- T053 [P] [US5] Restyle frontend/src/app/login/page.tsx
- T054 [P] [US5] Restyle frontend/src/app/(public)/cookie-policy/page.tsx
- T055 [P] [US5] Restyle frontend/src/components/cookie-consent.tsx and frontend/src/components/auth-buttons.tsx
- T056 [US5] Update UI Components, Key Files, commands in frontend/CLAUDE.md
- T057 [US5] Run gates in frontend and smoke via scripts/e2e.sh, green
AC:
- The smoke tests pass on today's look before the upgrade and keep passing after each later slice; they assert on visible text and roles, not on styling.
- The Applika name, logo, favicon and domain stay; no other product name or Compass logo appears.
- Signed-in pages render inside a sidebar shell: sidebar
 navigation, header, user menu.
- The shell keeps every applika control it has today: cycle selector, agenda notifications, theme toggle, feedback dialog, profile and logout, CLI promo banner, and the Admin entry for admins only.
- On narrow screens the sidebar collapses into a menu the user can open and close.
- The landing sections, login page and cookie policy page stay and are restyled to the new tokens.

## K5 — Closing: full gate, ADRs, cleanup, by-hand walk   side: both   covers: —   deps: K4
Owner's words: "the better of two worlds, i also want frontend tests and e2e tests with real application stack"
Touch: none (verify only)   Pattern: .claude/rules/quality-gates.md
Steps:
- T058 Run gate in CLAUDE.md order: `cd backend && make format && make lint && make test`; `cd frontend && pnpm lint && pnpm test && pnpm build`; `cd cli && make format && make lint && make test`
- T059 Run target frontend gate from .claude/rules/quality-gates.md: `pnpm lint`, `pnpm prettier --check .`, `pnpm tsc --noEmit`, `pnpm test` in frontend
- T060 Run `scripts/e2e.sh` locally and confirm CI `e2e` job green in .github/workflows/frontend-ci.yaml
- T061 Confirm no container, network, volume or temp DB of docker-compose.e2e.yml left
- T062 Confirm docs/adr/0006, 0007, 0002, 0010 read `Accepted`
- T063 Walk by hand on real stack: 14 pages, both themes, desktop + mobile, user + admin, saved light kept, "system" → dark, long username truncates, banners do not cover sidebar, `/reports/[day]` in static export, charts readable
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus frontend `pnpm prettier --check .` and `pnpm tsc --noEmit` per .claude/rules/quality-gates.md.
- Every ADR the feature drafted reads Accepted (0006; bound 0007, 0002, 0010 also Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks or temp databases.
- The E2E the feature earned (smoke.spec.ts, auth-guard.spec.ts, admin-gating.spec.ts via scripts/e2e.sh) runs inside the gate and is green.
- By-hand walk of the feature on a real stack done.
- No new feature work.
