---
PRD: 0006
title: New visual identity
status: Approved
owner: LuisMSoares
created: 2026-09-15
related-adrs: [0006, 0007, 0002, 0010]
related-prds: [0000-product-vision.md, 0005-landing-cli.md]
---

# PRD 0006 — New visual identity

## In the owner's words

A new visual identity for Applika.

Selected in discovery: order "Identity → CV → steps → Discord"; "Keep Applika name + logo"; "Keep
light+dark; restyle landing"; "Upgrade in the identity feature". On gates: "the better of two
worlds, i also want frontend tests and e2e tests with real application stack".

## Clarifications

- Q: Do signed-in pages move under `/app/*`? → A: "Keep current URLs (Recommended)" — only the look changes (sidebar shell, tokens, fonts); bookmarks, OAuth redirect setting and nginx config untouched; `/app/*` may come later under convergence.
- Q: What happens to applika-only UI components (calendar, command, date-picker, range-slider, star-rating) and the frontend/CLAUDE.md rule that forms always use `<DatePickerInput>`? → A: "Keep, restyle to new-york (Recommended)" — regenerate/restyle with new tokens, keep using them; DatePickerInput rule stays (timezone-safe parsing); behaviour unchanged.
- Q: Which theme first and how is light palette made? → A: "Dark default, derived light (Recommended)" — dark = the target oklch palette as is, default; light palette reuses same hues (blue primary) with light surfaces; toggle stays; saved choice respected.
- Q: Does this feature also set up the new frontend gates? → A: "Yes, as the first slice (Recommended)" — slice 1 adds tsc, prettier, vitest to CI and a Playwright + docker-compose real-stack E2E with smoke tests (login stub, each page renders), run BEFORE the upgrade, so every later slice is verified against them.
- 2026-09-15 — Q: "How does the E2E suite log in?" → A: "Seeded session cookie (Recommended)" — backend script `seed_e2e.py` creates a regular user and an admin, mints real `__access`/`__refresh` with the app's own token code, refuses to run in PROD, no route added, refresh already skips the GitHub check for users without a GitHub token.

## Problem

Applika looks different from the design the owner settled on: teal HSL palette, DM Sans
and Outfit fonts, shadcn default style, an older header and sidebar layout. The next features (CV
builder, steps as timeline, Discord linking) are designed in the new look and on the new platform
(Tailwind v4, React 19, shadcn new-york). Building them on the old look and platform would mean
restyling each one twice. Applika is in production and its frontend has no tests beyond a sample
and no end-to-end check, so a full visual and platform change today would ship unverified.

## Users and stories

- US1 (P1) As the owner, I get a real-stack end-to-end smoke suite and full frontend gates in CI before any visual change, so every later slice is checked against today's behaviour.
- US2 (P1) As a signed-in job seeker, every page I use today still opens at the same URL and does the same thing after the platform upgrade.
- US3 (P1) As a job seeker, I see the new colours, fonts and component style, with the Applika name and logo.
- US4 (P2) As a job seeker, I navigate signed-in pages from a sidebar shell on desktop and mobile.
- US5 (P2) As a visitor, I see the public landing, login and cookie policy pages in the new look.
- US6 (P3) As a job seeker who prefers light mode, I switch to a light palette in the same hues, and my choice is kept.

## Requirements

Gates (slice 1, before any visual change):
- R-001 CI runs eslint, prettier check, TypeScript type check and the unit test suite on every frontend pull request to `develop`, and fails the PR when any of them fails.
- R-002 An end-to-end suite runs in a browser against the real application stack: the built API, the built frontend, a real Postgres migrated to head and a real Redis, with no mocked API.
- R-003 The end-to-end suite signs in with a seeded regular user and a seeded admin user through real session cookies minted by the application's own token code, without going through GitHub's site; the seeding refuses to run in production, no login route is added, and every request after sign-in hits the real API.
- R-004 A smoke test opens each current page and asserts it renders: `/`, `/cookie-policy`, `/login`, `/dashboard`, `/applications`, `/agenda`, `/cycles`, `/reports`, one `/reports/[day]`, `/profile`, `/admin`, `/admin/companies`, `/admin/supports`, `/admin/users`.
- R-005 A smoke test checks that an unauthenticated visit to a signed-in page lands on `/login`, and that a non-admin user cannot reach admin pages.
- R-006 The smoke tests pass on today's look before the upgrade and keep passing after each later slice; they assert on visible text and roles, not on styling.
- R-007 One command runs the end-to-end suite locally and CI calls the same command.

Platform (slice 2):
- R-008 The frontend runs on React 19, Tailwind v4 with CSS-first configuration, and shadcn new-york components on the unified Radix package.
- R-009 Every page keeps its current URL, data, forms, validation, toasts and behaviour after the upgrade.
- R-010 The applika-only components (calendar, command, date picker, range slider, star rating) are kept and restyled; forms still use the timezone-safe date picker.

Tokens (slice 3):
- R-011 The dark theme uses the target oklch colour tokens (ADR 0006) unchanged.
- R-012 The light theme uses the same hues as the dark theme, with a blue primary and light surfaces.
- R-013 Dark is the default for a visitor who has never chosen a theme; a saved choice is respected.
- R-014 The theme toggle stays and switches between light and dark.
- R-015 Text uses Inter and code or numeric text uses JetBrains Mono.
- R-016 The Applika name, logo, favicon and domain stay; no other product name or logo appears.

Shell and pages (slice 4):
- R-017 Signed-in pages render inside a sidebar shell: sidebar navigation, header, user menu.
- R-018 The shell keeps every applika control it has today: cycle selector, agenda notifications, theme toggle, feedback dialog, profile and logout, CLI promo banner, and the Admin entry for admins only.
- R-019 On narrow screens the sidebar collapses into a menu the user can open and close.
- R-020 The landing sections, login page and cookie policy page stay and are restyled to the new tokens.

## Permissions and tenancy

Nothing changes in who may do what. A signed-in user sees and edits only their own applications,
cycles, reports and profile, as today. Only a user whose `is_admin` is true sees the Admin
navigation entry and may open the admin pages; a non-admin who types an admin URL is kept out as
today. The E2E seeded users exist only in the throwaway E2E database and never in production, and
no sign-in shortcut used by the E2E suite is reachable in a production deployment.

## Edge cases

- A user with a saved light theme from before the change keeps light after the change.
- A user whose saved value is "system" (today's default) gets dark, the new default.
- A long username or email in the user menu truncates instead of breaking the shell.
- Admin link and admin pages for a non-admin: hidden and blocked, in both themes and on mobile.
- `/reports/[day]` for each static report day still exists in the static export.
- Charts (dashboard, statistics) stay readable in both palettes.
- The cookie consent banner and CLI promo banner do not cover the sidebar on mobile.
- A slice that breaks a smoke test does not merge.

## Non-goals

- The `/app/*` URL prefix; OAuth redirect and nginx config are untouched.
- Any product name or logo other than Applika's; a dark-only theme.
- Any backend behaviour change, schema change or migration for users.
- New pages or flows (CV builder, timeline, Discord linking): later features.
- Full E2E coverage of every flow; this feature ships smoke tests only.
- Single-origin serving (ADR 0010).
- Coverage floor value for existing code.

## Success signals

- The smoke suite is green on `develop` before slice 2 starts, and green after each slice.
- Frontend CI shows lint, prettier, types, unit tests and E2E as separate required checks.
- A signed-in page matches the target design (tokens, fonts, shell, components) apart from name and logo.
- No production user reports a lost bookmark, lost theme choice or broken form after release.

## Assumptions

- Slices ship in order: gates, platform, tokens, shell and pages; each is its own PR to `develop`.
- Pre-existing prettier and type errors are fixed in slice 1 rather than excluded.
- The E2E stack runs the same two production images (API and nginx frontend), not dev servers.
- Light palette: where a target dark token has no obvious light twin, the light value keeps the hue and inverts lightness; the owner reviews screenshots of both themes on the slice 3 PR.
- Landing copy, section order and images stay; only styling changes.
- Framer-motion animations stay where they are today.
- Unit tests added in this feature cover the shell navigation rules (active item, admin-only item) and the date picker parsing.
