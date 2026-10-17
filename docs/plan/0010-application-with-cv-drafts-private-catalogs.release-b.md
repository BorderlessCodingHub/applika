# Plan 0010 — Release B record and owner by-hand walk (K5, T098/T099)

Plan: docs/plan/0010-application-with-cv-drafts-private-catalogs.md · Tasks: docs/plan/0010-application-with-cv-drafts-private-catalogs.tasks.md (K5)
PRD: docs/prd/0010-application-with-cv-drafts-private-catalogs.md · ADR: docs/adr/0014-private-catalog-rows-and-draft-applications.md
Recorded: 2026-09-26 by the build orchestrator for K5.

## Release B

- Branch `integration/0010-application-with-cv-drafts`. The K5 tip is Release B, tagged
  `0010-release-b` (local annotated tag; the owner pushes it).
- Release B ships code only. It has no Alembic revision: `git diff 0010-release-a..0010-release-b -- backend/migrations`
  is empty, and the head stays `3b78c3cd2a71`.
- It holds K2, K3, K4, K6, K7 and K5 (the T147 sheet date fix and the
  T148 offline autosave fix).
- No environment variable changes.
- The owner merges `0010-release-b` into `develop` only after confirming that Release A
  (`0010-release-a`, revision `3b78c3cd2a71`, down `583226ca46bc`) ran `alembic upgrade head` in prod.
  If B is deployed before A's migration, the ORM maps `is_public`, `platforms.created_by` and
  `applications.is_draft`, which do not exist yet, and the applications, companies, platforms and
  supports routes return 500.

## Owner steps

1. Merge `0010-release-a` into `develop`, release to `main`. The CD deploys the image.
2. Inside the API container, run `alembic upgrade head`, then restart the API container.
3. Confirm: `alembic current` prints `3b78c3cd2a71 (head)`, and in the database
   `companies.is_public`, `platforms.is_public`, `platforms.created_by` and `applications.is_draft` exist.
   Every existing company and platform reads `is_public = true`.
4. Only then merge `0010-release-b` into `develop` and release to `main`. The CD deploys the images.
   There is no migration to run for B.

## Rollback order

- Rollback B = point the swarm stack back to the previous image tag (the Release A image) and
  restart. B has no revision, so there is no `alembic downgrade` for B.
  While B is rolled back, drafts show as ordinary applications with a placeholder date, and
  private companies and platforms are visible to every user, until B is deployed again (plan Risk).
- Rollback A, only after B is rolled back: inside the API container,
  `alembic downgrade 583226ca46bc`, then the previous image, then restart. The four new columns
  become `_old` columns, and the company unique index returns to its previous form. No data is lost.
- Verified locally on the E2E stack with data present (2026-09-26): `alembic downgrade -1`
  (`3b78c3cd2a71 → 583226ca46bc`), then `alembic upgrade head` (back to `3b78c3cd2a71`); the API
  stayed healthy.

## Success signals

1. `SELECT count(*) FROM applications WHERE is_draft` grows only through the web "New with CV"
   flow. No draft shows in `GET /applications`, statistics, reports, cycles, the agenda or admin
   stats.
2. `SELECT count(*) FROM companies WHERE NOT is_public` and the same query on `platforms` grow as
   users add rows. The admin Companies and Platforms pages list them under the Private filter
   with "Added by".
3. No two public companies share `(lower(name), url)`, and no two public platforms share a name
   through Approve (Approve of a duplicate returns 409 naming the public row).
4. `applika-cli` 0.1.4 (PyPI), 0.2.0 and 1.0.0: `applications list` and `applications new` stay
   green.
5. No 500 in the API logs on `/applications`, `/applications/drafts`, `/companies`, `/platforms`,
   `/supports`, `/admin/platforms`.

## Walk results on the local real stack (2026-09-26, by the orchestrator)

Real stack: `scripts/e2e.sh` with `KEEP_STACK=1` (the built API and frontend images, Postgres
migrated by `alembic upgrade head`, Redis). Users: A = `e2e-user`, B = `e2e-discord`, admin =
`e2e-admin`. Driven by HTTP calls and Playwright (Chromium) scripts, not by a human.

Verified:

- Full E2E suite: 110/110 (run on the T147 tip, then again on the final T148 tip), including `application-with-cv.spec.ts`, `smoke.spec.ts`,
  `admin-gating.spec.ts` and `cv-builder.spec.ts`.
- Unsaved typing before a draft exists → leaving warns (beforeunload), and no draft is created.
  Cancel on step 1 with unsaved typing warns, and the page stays.
- Draft with three fields → Saved; resume keeps the fields and the past date; B gets 404 on A's draft.
- API unreachable while the browser is online → "Not saved", typed text kept → Retry → Saved,
  and the server holds the new value.
- Finish without a CV copy refused ("Pick a master CV before finishing"). Finish with no body
  carries the draft's date; the CV copy is kept.
- Statistics (all four), agenda, cycles, `GET /applications`, admin stats and admin user counts:
  unchanged by a draft. Starting a cycle counts 0 drafts toward its minimum.
- New cycle keeps drafts; a later finish joins the current cycle.
- A adds a platform → private, url null. B sees it in neither `GET /platforms` nor `/supports`;
  B's same-name private platform is kept; B posting an application with A's platform id → 404.
- Company with URL → private (201); same name and URL, different case and trailing slash → reused (200).
  B cannot see A's private company.
- Admin: Private filter shows A's row with "Added by"; Apps count 0 for a drafts-only platform;
  deleting it refused ("Cannot delete: 1 application(s) reference this platform"); Approve → B
  sees it; Approve of B's same-name row → 409 naming the public row and its id; an admin-screen
  create is public; `/admin/supports` lands on `/admin/platforms`.
- Delete A's account → A's platform and company stay, "Added by" empty.
- Form label order is the same in the sheet and in step 1: Role, Source, Company, Platform,
  Application date, Job link, Work mode, Experience level, Country, Currency, Salary period,
  Expected, Min, Max, Job description, Additional notes.
  Step 1 ends with Cancel + Continue to CV. The sheet is 896 px wide (`max-w-4xl`) at 1280 px.
- Applications | Drafts (n) tabs, with Applications selected on open.
- T147 in a real browser: time zone `Asia/Tokyo`, clock pinned at 2026-09-26T17:00Z (local
  2026-09-27 02:00). The sheet accepts 2026-09-27 (no "Date cannot be in the future"), and the
  picker does not offer 2026-09-28.
- CLI 0.1.4 (PyPI), 0.2.0 (built from `dd6e9e8`) and 1.0.0 (this tip), run as B: `applications list`
  shows no draft; `applications new` with a new company on B's url-null private platform works in
  all three, and the new companies are private. `/supports` keys unchanged.
- Local `alembic downgrade -1` / `upgrade head` round trip (see Rollback).

- Offline autosave (T148, owner order 2026-09-26: fix it in K5, then tag). The walk first found
  that with the browser offline the status stayed "Saving..." (TanStack Query 5 mutations default to
  `networkMode: "online"` and pause). After commit `6e399df` (`networkMode: "always"` on the draft
  create/update and CV-copy autosave mutations), re-checked on the real stack with Playwright
  `setOffline`: offline → "Not saved", typed text kept → online → Retry → Saved (server holds the
  new value); offline → Not saved → online → the next change saves; offline before the draft exists
  → Not saved → online → Retry creates the draft. The vitest in `new-with-cv-page.test.tsx` fails
  when the fix is reverted.

Notes:

- The API dates a draft POSTed without `application_date` with the server's day (UTC). The web
  always sends the user's local day, so this only affects direct API callers. This is documented
  in the draft schema.
- Finish, delete draft, create or delete a CV copy, and company create are user-initiated and still use
  the default `networkMode: "online"`: offline they wait and run on reconnect rather than fail.
  Finish first saves the draft, which now fails into its error message offline.

## Owner by-hand walk (what still needs your eyes)

Tick each step; the expected result is after the arrow.

1. Light and dark theme, desktop and 390 px mobile. Look at: step 1, step 2, the side sheet
   (create and edit), the applications page with its tabs, the Drafts tab (list and empty state),
   and the admin Platforms page → card-free sections, each with a title and a muted description
   without an icon; a thin divider and whitespace between sections; the spacing is tighter but readable;
   nothing scrolls sideways at 390 px; the dark theme is kept.
2. Side sheet → New Application / Edit Application titles are larger. The sheet opens up to 4xl,
   with Cancel and submit at the bottom.
3. Step 2 → with no master CV, the invite shows. Pick a master, edit it, view the diff, delete the
   copy, pick another master. Go back to step 1, then return → the copy is kept.
4. Step 1 with an S8 date: the preset is today; set a past date → Saved; resume keeps it; a future
   date is not offered; finish carries it. A draft created before S8 shows its start day.
5. Near local midnight, in a time zone ahead of UTC (or with the OS clock set that way), create
   from the sheet and from step 1 with today's date → accepted.
6. Deleting the last draft → "No drafts yet." with the "+ New with CV" link. An archived cycle
   shows no tabs and no drafts.
7. The company picker in the sheet and on the page: "Only you" badge; Create with a URL → private
   and selected; Create with a blank URL → free text; a listed match comes first and Create is still offered.
8. Admin Platforms page: nav label "Platforms"; search, filter, paging and "Added by" all work.

## What the automated layers already prove

- E2E (`scripts/e2e.sh`, real stack, no mocked API): `frontend/e2e/application-with-cv.spec.ts`
  (Drafts tab, past date on the finished application, 390 px no sideways scroll for step 1 and
  the sheet), `smoke.spec.ts` and `admin-gating.spec.ts` (`/admin/platforms`, `/admin/supports`
  lands there), `cv-builder.spec.ts` ("Edit Application" on the wide sheet), and the rest of the suite.
- Backend: `test_admin.py`, `test_companies.py`, `test_supports.py`, `test_platforms.py`,
  `test_statistics.py`, `test_quinzenal_reports.py`, `test_cycles.py`, `test_agenda.py`,
  `test_applications.py`, `test_application_drafts.py`, `test_migration_catalog_visibility_drafts.py`.
- Frontend vitest: `companies-page.test.tsx`, `platforms-page.test.tsx`, `use-debounced-autosave.test.ts`,
  `drafts-section.test.tsx`, `catalog-select.test.tsx`, `company-select.test.tsx`,
  `platform-select.test.tsx`, `application-form-sheet.test.tsx` (including the T147 Tokyo test that
  fails when the fix is reverted), `new-with-cv-page.test.tsx` (including the T148 offline test), `application-fields.test.tsx`,
  `applications-page.test.tsx`.

## Owner walk

Done by the owner, 2026-09-26: "already checked by hand" (items 1-9 above).
