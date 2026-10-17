# Plan 0006 — Visual identity

PRD: docs/prd/0006-visual-identity.md
ADRs bound:
- 0006 (Accepted): identity first; slices platform bump → tokens → shell; new look (oklch, Inter + JetBrains Mono, sidebar shell, new-york); derived light palette, light+dark kept; Applika name/logo/favicon/domain kept; landing restyled.
- 0007: product and schema convergence; dark-only theme excluded.
- 0002: GitHub OAuth sole login; `__access` JWT (sub = github_id), `__refresh` UUID in Redis; refresh re-validates GitHub token.
- 0010: two images (API uvicorn, frontend nginx); CD on push to `main`.
PRDs neighbouring:
- 0000-product-vision.md: feature 1 of ordered roadmap.
- 0005-landing-cli.md: R-001..R-005 landing sections, theme toggle, logo, static export; restyle must keep them.

## Scope
Frontend-only look + platform change of `frontend`, preceded by gates. Four slices, one PR each to `develop`, one branch per slice:
S1 gates (CI prettier/tsc/vitest + Playwright real-stack E2E smoke, on current look);
S2 platform (React 19, Tailwind 4 CSS-first, shadcn new-york regen, unified `radix-ui`);
S3 tokens (oklch dark as-is, derived light, Inter + JetBrains Mono, dark default);
S4 shell + pages (sidebar shell, landing/login/cookie-policy restyle).
Not: `/app/*` prefix, nginx/OAuth changes, backend behaviour, migrations, new flows, rebrand.
Only backend touch: E2E-only seed script (S1), not wired into any route.

## Data
none. No migration. E2E DB is throwaway, migrated by `alembic upgrade head` in container entrypoint.

## Backend
S1 only, test tooling:
- `backend/app/scripts/seed_e2e.py` (new): upsert regular user + admin user (`is_admin=true`, `encrypted_github_token=NULL`); mint `__access` via `create_access_token` and refresh via `create_refresh_token_value` from `backend/app/core/tokens.py`; print JSON (see Contract). Refuses to run when `ENVIRONMENT == 'PROD'`.
- Why refresh works: `backend/app/application/use_cases/refresh_token.py` skips GitHub check when `user.encrypted_github_token` is empty. No route added.
- Seed supports rows (platforms, steps_definition, feedbacks_definition) if migrations do not; check head data first.
R-003 settled 2026-09-15: seeded session cookie. No test login route, no ADR.

## Frontend
Module: `frontend`. Routes unchanged (list in PRD R-004).

S1 gates:
- `package.json` scripts: `format:check` = `prettier --check .`, `typecheck` = `tsc --noEmit`, `e2e` = `playwright test`. Add `@playwright/test` dev dep. `.prettierrc` (new), plugin `prettier-plugin-tailwindcss` (already dev dep); fix existing violations.
- `frontend/playwright.config.ts` (new), `baseURL` from `E2E_BASE_URL`.
- `frontend/e2e/support/auth.ts` (new): `loginAs(page, 'user'|'admin')` sets `__access`/`__refresh` cookies for host `127.0.0.1`.
- `frontend/e2e/smoke.spec.ts` (new): each page renders (heading/role assertions only); `auth-guard.spec.ts` (new): anon → `/login`; `admin-gating.spec.ts` (new): non-admin blocked from `/admin*`, Admin nav hidden.
- `docker-compose.e2e.yml` (new): `api` (build `backend/Dockerfile`, entrypoint `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000`, `ENVIRONMENT=DEV`, `CORS_ORIGINS=["http://127.0.0.1:8180"]`, port `127.0.0.1:8100:8000`), `web` (build `frontend/docker/Dockerfile`, build arg `API_BASE_URL=http://127.0.0.1:8100/api`, port `127.0.0.1:8180:80`), `db` postgres:16, `redis` redis:7-alpine, no volumes. Dummy GitHub client + generated Fernet key env.
- `scripts/e2e.sh` (new): down -v → up --build --wait → poll `http://127.0.0.1:8100/api/openapi.json` (non-PROD only) → `exec -T api python -m app.scripts.seed_e2e` → export tokens → `pnpm exec playwright test` → trap teardown.
- Unit: `src/test/example.test.ts` replaced by real tests (date picker parse). Shipped S1 as
  `src/components/ui/date-picker.test.tsx`. The nav-rules test moves to S4: it covers `sidebar-nav`,
  which S4 creates.

S2 platform:
- Bump: `react`/`react-dom` ^19.2, `@types/react(-dom)` ^19, `tailwindcss` ^4.2 + `@tailwindcss/postcss`, `tw-animate-css` replaces `tailwindcss-animate`, `tailwind-merge` ^3, `sonner` ^2, `radix-ui` replaces `@radix-ui/react-*`, `next-themes` to React-19-compatible release. Versions pinned in `frontend/package.json`.
- Delete `frontend/tailwind.config.ts`; move theme into `src/app/globals.css` `@theme`; `postcss.config.js` → `@tailwindcss/postcss`.
- `components.json`: `style: new-york`, `tailwind.config: ""`. Regenerate `src/components/ui/*` (alert-dialog, avatar, badge, button, card, dialog, dropdown-menu, input, label, popover, select, sheet, skeleton, sonner, textarea, tooltip). Keep and restyle by hand: `calendar.tsx`, `command.tsx`, `date-picker.tsx`, `range-slider.tsx`, `star-rating.tsx`. Keep `SheetContent` `hideClose` prop.
- Tokens still teal in S2 (look near-identical); smoke green.

S3 tokens:
- `src/app/globals.css`: dark block = oklch dark palette (neutral surfaces); `:root` light = same hues, blue primary, light surfaces.
- `src/app/layout.tsx`: `next/font` Inter (sans) + JetBrains Mono (mono) as CSS font variables; drop DM Sans/Outfit.
- `src/components/layout/root-providers.tsx`: `ThemeProvider defaultTheme="dark"`, drop `enableSystem`. `src/components/theme-toggle.tsx` logic unchanged.
- Charts: recharts colours read CSS vars.

S4 shell + pages:
- New `src/components/layout/{app-shell,sidebar,sidebar-nav,header,user-menu}.tsx` + `nav.ts` (new): sidebar app shell with applika hrefs (`/dashboard`, `/applications`, `/agenda`, `/reports`, `/cycles`, `/profile`, `/admin` admin-only), `AppLogo` from `src/components/app-logo.tsx` (not `brand.tsx`).
- Move into shell: `cycle-selector.tsx`, `agenda-dropdown.tsx`, `ThemeToggle`, `FeedbackDialog`, `CliPromoBanner`, profile/logout menu.
- Replace `src/components/layout/app-layout.tsx`, `app-header.tsx` (remove after shell wired); `src/app/(protected)/layout.tsx` uses `AppShell`.
- Restyle `src/components/landing/*` (10 files), `src/app/login/page.tsx`, `src/app/(public)/cookie-policy/page.tsx`, `src/components/cookie-consent.tsx`, `src/components/auth-buttons.tsx`.
- Update `frontend/CLAUDE.md` (UI Components, Key Files, commands).
i18n: none (no i18n in applika). Design-system doc: none; source of truth = `src/app/globals.css` tokens + `src/components/layout/*` files named above.

## Contract
No API change. E2E seed output (stdout JSON):
`{"user_id": str, "access_token": str, "refresh_token": str, "admin_user_id": str, "admin_access_token": str, "admin_refresh_token": str}`
Exit non-zero + no output when `ENVIRONMENT=PROD`.

## Tests
Unit (vitest): `sidebar-nav` active-item + admin-only filtering (`src/components/layout/sidebar-nav.test.tsx`); `date-picker` local-date parsing (no off-by-one); theme default = dark.
Backend: `backend/tests/unit/test_seed_e2e.py` (new, shipped S1): refuses in PROD; minted token decodes, sub = github_id.
Integration: none: no route changes.
E2E: `smoke.spec.ts` (all 14 pages render as user/admin), `auth-guard.spec.ts`, `admin-gating.spec.ts`. Same specs every slice.
CI: `.github/workflows/frontend-ci.yaml` jobs `lint` (`pnpm lint`), `format` (`pnpm prettier --check .`), `types` (`pnpm tsc --noEmit`), `unit` (`pnpm test`), `build` (`pnpm build`), `e2e` (`scripts/e2e.sh`, working dir repo root; paths trigger adds `backend/**`, `docker-compose.e2e.yml`, `scripts/e2e.sh`).

## Rules that bind
- `.claude/rules/quality-gates.md`: frontend lint, prettier, tsc, vitest pass; E2E real stack, no mocked API.
- `.claude/rules/branches-and-commits.md`: slice branch from `develop`; conventional commits `feat(frontend): …`; PR to `develop`; agent never touches `main`.<DEL>

- `.claude/rules/prod-release-runbook.md`: frontend image deploys on `main` push; no migration here.
- `frontend/CLAUDE.md`: forms keep `<DatePickerInput>`; RHF + Zod; services container.

## Risks
- React 19 peer breaks: `next-themes` 0.3, `recharts` 2.15 (needs `react-is` 19), `cmdk`, `react-day-picker`, `framer-motion`. S2 PR resolves peers before any restyle.
- Tailwind v4 class renames (`shadow-sm`→`shadow-xs`, `ring` default width, `border` default colour) silently shift look. Run upgrade codemod, screenshot compare.
- Cookie origin in E2E: frontend `127.0.0.1:8180`, API `127.0.0.1:8100`; same-site by host, CORS must allow credentials.
  SETTLED in S1: cookies ignore the port, so a `__access` cookie scoped to host `127.0.0.1` is sent to both
  origins; `GET /api/users/me` returns 200 with `access-control-allow-credentials: true`. `CORS_HEADERS` had to be
  widened in `docker-compose.e2e.yml` (the default is only `X-Request-ID` + `Content-Type`); `settings.py` unchanged.
- `root_path=/api` in `backend/app/main.py`: CONFIRMED in S1 — `/api/...` resolves against uvicorn directly,
  no proxy. `http://127.0.0.1:8100/api/openapi.json` returns 200 and is the E2E readiness probe (non-PROD only;
  applika has no `/health` route).
- Users on "system" theme flip to dark on release: intended (PRD edge case).
- Prettier on whole tree = large diff in S1; keep it a separate commit.
- E2E in CI adds docker build time for both images.

## Open
- ADR 0006 Accepted 2026-09-15; its open questions are settled in the ADR.
- Readiness probe: `/api/openapi.json` exists only when `ENVIRONMENT != PROD`; E2E runs DEV. Add `/health` later only if owner wants.
- ANSWERED in S1: head DOES seed the supports data — `backend/migrations/versions/e3abe9dc93d4_init_db.py`
  bulk-inserts 16 platforms, 6 steps_definition and 9 feedbacks_definition. `seed_e2e.py` seeds only the two users.
