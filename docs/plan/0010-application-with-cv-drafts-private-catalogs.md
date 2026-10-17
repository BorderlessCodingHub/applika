# Plan 0010 — New application with CV, drafts, private companies and platforms

PRD: docs/prd/0010-application-with-cv-drafts-private-catalogs.md (Approved; amended 2026-09-26 twice, R-028..R-042)
ADRs bound:
- 0001 layer-first; 0003 snowflake ids via `BaseMixin`; 0004 ownership + `is_admin` (drafts filter `user_id`, foreign 404).
- 0005 non-destructive migrations + round-trip test; 0009 CLI compat (CLI route shapes kept, new fields additive).
- 0014 (Accepted 2026-09-25): catalog rows private until admin publishes; drafts hidden from every read model.
- Amendments force no new ADR: no table, column, dependency or queue; `/supports` untouched; drafts, `/admin/*` not CLI routes.
PRDs neighbouring:
- 0002-applications-steps-finalize.md R-001/2 + 0004-admin-supports-companies.md R-004/8-10 changed; 0007-cv-builder.md R-006..13 reused.

## Scope
Ships: web-only `/applications/new-with-cv` (step 1 data, step 2 master CV pick + copy edit), auto-save draft, Drafts
section, finish; drafts out of every read model; private user platforms (sheet + new page) and companies; admin
publish. Existing rows public. Not: CLI, drafts in sheet, unpublish, merge duplicates, user edit of catalog rows.
S7 (Done): one catalog picker; three-section form; admin Platforms page; `GET /platforms`; paged admin list.
S8: with-CV date field (preset today, saved on draft); date + job link one line; card-free continuous form,
both forms (R-043..R-050, layout only); no `max-w-4xl` on step 1; sheet `4xl`, larger title; tabs Applications | Drafts.

## Releases (expand first, `.claude/rules/prod-release-runbook.md` 4)
- Release A: S1 migration + round-trip test + `backend/CHANGELOG.md`; no ORM, route or frontend change.
  Owner merges to `main`, CD deploys, owner runs `alembic upgrade head`, confirms.
- Release B, only after owner confirms A ran: S2..S5, S7, all Done; S8 (no
  migration, so no expand-first constraint) before S6 closing e2e (depends on S7 and S8).

## Data
S1 (Done): `backend/migrations/versions/3b78c3cd2a71_catalog_visibility_and_drafts.py`, down `583226ca46bc`:
`applications.is_draft`; `companies.is_public`, `platforms.is_public` (default true); `platforms.created_by` (SET NULL);
scoped partial unique indexes; downgrade → added columns `*_old`, `uq_companies_name_url` unique else non-unique + ids
logged (Open 2). Tenancy: `applications.user_id`; catalog `created_by` + `is_public`. S7, S8: no data change; S8
reuses `applications.application_date` (drafts hold server today).

## Backend
Pattern: `app/application/use_cases/applications/create_application.py`, `app/domain/repositories/
application_repository.py`, `app/presentation/api/application.py`, `app/presentation/api/admin/platforms.py`.
S2, S3, S7 (Done; as built `backend/CLAUDE.md` "Companies (`/companies`) and Platforms", "Application
drafts", "Support Data"): `catalog_visibility.visible_to`, `use_cases/catalog/resolve.py`, `NOT_DRAFT` (except
`count_entity_references`, `tailored_cvs/guards`), `use_cases/application_drafts/*`, `GET /platforms`, paged admin list.
S8:
- `app/presentation/schemas/application_draft.py`: `DraftInput.application_date: date | None = None`; `Draft` gains
  `application_date: date`; `DraftFinish.application_date: date | None = None`. DTOs `app/application/dto/
  application_draft.py` (`DraftInputDTO`, `DraftDTO`, `DraftFinishDTO`) likewise. `api/application_draft.py`
  `_to_input_dto` passes it; finish route takes `payload: DraftFinish | None = None` (no body allowed).
- `application_repository.create_draft`: `application_date = data.application_date or date.today()`.
  `use_cases/application_drafts/create_draft.py`, `update_draft.py`: `ensure_not_in_future` when given; update sets it only
  when given (absent keeps stored, like `job_description` on `PUT /applications/{id}`). `to_draft_dto` adds the field.
- `finish_draft.py`: `day = data.application_date or application.application_date`; `ensure_not_in_future(day)`; set; flip.
- `seed_drafts()` sends `application_date`, finishes one draft with no body; `backend/CHANGELOG.md`, `backend/CLAUDE.md`.

## Frontend
Module `frontend/src`, no i18n lib. Pattern: `components/applications/application-fields.tsx`, `components/timeline/
timezone-select.tsx`, `app/(protected)/applications/cv/application-cv-page.tsx`, `app/(protected)/cvs/editor/` (Suspense).
S4, S5, S7 (Done; as built `frontend/CLAUDE.md` "Application drafts", "Admin — private company/
platform rows", "Company picker = platform picker…"): `application-fields.tsx` (sheet + draft page), `application-drafts/*`,
`use-debounced-autosave.ts`, `catalog-select.tsx`, `form-section.tsx`, `admin/catalog-table.tsx`, `/admin/platforms`.
S8:
- `components/applications/application-fields.tsx`: "Role & company" line 3 = Application date | Job link
  (`DatePickerInput`, `maxDate` today) in both forms; `showDate` prop retired (date always shown).
- Card-free form, both forms (R-043..R-050, layout only): `components/applications/form-section.tsx` goes flat for its
  one caller (`application-fields.tsx`): `<section>`, no `Card`, no `icon` prop; heading (`as` h2 page / h3 sheet) +
  muted `<p>`; each section after the first `border-t border-border/60 pt-5`. `application-fields.tsx`: drop the three
  section icons; sections `space-y-5`, rows `gap-3`; `ROW2`/`ROW3` stay `grid-cols-1` → `@md/app-form:grid-cols-2|3`
  (R-046 counts), cells `min-w-0`, textareas full width. No schema, payload, autosave or picker change.
- `components/application-drafts/draft-footer-actions.tsx`: step 1 bottom row = outline "Cancel" (same target and warning
  as `draft-page-states.tsx` "Back to applications") + "Continue to CV". Sheet footer (Cancel | submit) unchanged.
- `components/application-drafts/draft-application-step.tsx`: drop `className="max-w-4xl"`.
- `app/(protected)/applications/new-with-cv/new-with-cv-page.tsx`: draft schema + defaults gain `application_date`, new
  draft = `localCalendarDay()` (`draft-copy.ts`), resume = stored value; every autosave `POST`/`PUT` sends it; finish
  sends the same value (works on old and new API). `services/types/application-drafts.ts`: `DraftInput`, `Draft` gain it.
- `components/ui/sheet.tsx`: `size="wide"` preset `w-full p-6 sm:max-w-4xl` (presets beat `className`);
  `components/applications/application-form-sheet.tsx`: `size="wide"`, `SheetTitle` adds `font-display text-xl`.
- `components/ui/tabs.tsx` (new, `pnpm dlx shadcn@latest add tabs`). `app/(protected)/applications/applications-page.tsx`:
  current cycle → `Tabs` "Applications" (default, list + filters + empty state as today) | "Drafts (n)"; past cycle →
  no `Tabs`, list only. `components/application-drafts/drafts-section.tsx` becomes the Drafts tab body: no own heading,
  empty state "No drafts yet." + "New with CV" link (`draft-copy.ts`) instead of rendering `null`.
- `frontend/CLAUDE.md`: "Application drafts" (tabs, date), "Company picker…" (flat `FormSection`), "UI Components" (`wide`).
Design-system (none named): `frontend/CLAUDE.md` "### Routing", "### Forms" (`useWatch`), "### Date Inputs", "### UI
Components", "### App shell"; tokens `src/app/globals.css`; ADR-0006.

## Contract
- `GET /companies?name=` → 200 `[{id,name,url,is_public,created_at,updated_at}]`, visible only.
- `POST /companies` `{name 1..200, url HttpUrl}` → 201 new | 200 existing visible match | 422.
- `GET /supports` → 200; `platforms[]` visible only, `{id, name, url: str|null, is_public}`. Unchanged by S7, S8.
- `GET /platforms?name=` → 200 `[{id, name, url: str|null, is_public}]`, visible only, substring, by name | 401. Web only.
- `POST /platforms` `{name 1..100, url HttpUrl ≤200|null}` → 201 `{id,name,url,is_public}` | 409 'A platform with this name already exists' | 422.
- `POST /applications`, `PUT /applications/{id}`: shapes unchanged; invisible company id or `platform_id` → 404;
  PUT on draft id → 404. `GET /applications` excludes drafts.
- `DraftInput` `{company_id: id|null, company_name 1..200, role 1..200, platform_id, mode='active', application_date?
  (S8), link_to_job?, observation?, expected_salary?, salary_range_min?, salary_range_max?, currency?, salary_period?,
  experience_level?, work_mode?, country?, job_description? ≤50000}`; `company_id` wins, name from row. S8
  `application_date`: > UTC today + 1 → 422 (`ensure_not_in_future`); absent on POST → server today; absent on PUT →
  stored kept. `Draft` = `DraftInput` + `{id, has_cv, application_date, created_at, updated_at}`.
  `DraftSummary` `{id, company_name, role, platform_id, has_cv, updated_at}`.
- `POST /applications/drafts` → 201 `Draft` | 404 company/platform | 422. `GET /applications/drafts` → 200
  `[DraftSummary]` by `updated_at` desc. `GET /applications/drafts/{id}` → 200 | 404.
  `PUT /applications/drafts/{id}` → 200 `Draft` | 404 | 422. `DELETE /applications/drafts/{id}` → 204 | 404.
- `POST /applications/drafts/{id}/finish` (S8) no body, `{}` or `{application_date}` → 200 `Application`, dated with
  the body date when given (kept for the shipped web), else the draft's stored date | 404 | 422 'Pick a master CV before
  finishing' | 422 date beyond UTC today + 1.
- `/applications/{id}/cv*` (pdf, markdown included) accept drafts. Timeline, steps, finalize, reopen on draft → 404.
- `GET /admin/companies`, `GET /admin/platforms` `?search=&visibility=public|private&sort_by=name|created_at|
  applications_count&sort_order&page≥1&per_page=1..100 (25)` → 200 `{items, total, page, per_page, total_pages}`, rows
  `is_public`, `created_by {id, username}|null`, `applications_count` (no drafts) | 403.
- `POST /admin/companies/{id}/publish`, `POST /admin/platforms/{id}/publish` → 200 row, idempotent | 404 | 409 'A public
  company with this name and URL already exists' / 'A public platform with this name already exists'.

## Tests
Unit: `resolve_company` (reuse, private, admin private too, free text), platform name rule, finish rules, `DraftInput`.
Integration: `test_migration_catalog_visibility_drafts.py` (up/down/up, `_old`, duplicates); `test_application_drafts.py`;
`test_platforms.py`; `test_companies.py`, `test_supports.py` (own private in, foreign out, null url); `test_applications.py`,
`test_statistics.py`, `test_quinzenal_reports.py`, `test_cycles.py`, `test_agenda.py`, `test_admin.py` (a draft changes no number).
S8 `test_application_drafts.py`: create with/without date (server today), future 422 on POST/PUT, PUT without date keeps
stored, `Draft` returns it; finish no body → stored date, body date overrides, future body 422, `{}` accepted.
Frontend vitest: `platform-select`, `catalog-select`, `drafts-section`, `new-with-cv-page`, `use-debounced-autosave`.
S8: `application-fields.test.tsx` (three headings + descriptions, no `[data-slot="card"]`/icon, date before job link);
`application-form-sheet.test.tsx` (payloads unchanged, date required); `new-with-cv-page.test.tsx` (preset today,
resume keeps stored, autosave and finish carry it, Cancel present); `drafts-section.test.tsx` (empty state);
`applications-page.test.tsx` (tabs + count in current cycle, Applications on open, Drafts lists drafts, none on past cycle).
E2E: `frontend/e2e/application-with-cv.spec.ts` (pattern `cv-builder.spec.ts`): step 1 + new private platform →
"Saved" → reload resumes → step 2 pick seeded master CV, edit → finish → in list, Drafts empty; cleanup app + platform.
S8: that spec uses the Drafts tab, sets a past date in step 1, asserts the finished application shows it; at 390px
width step 1 and the sheet have `scrollWidth <= clientWidth` (R-047; jsdom has no layout).

## Rules that bind
- `non-destructive-migrations.md`: no drop in upgrade; downgrade renames added columns `_old`; `app/` never reads `_old`.
- `migration-tests.md`: round-trip, data assertions. `prod-release-runbook.md`: A migration, B after owner confirms.
- `cli-compatibility.md`: CLI route shapes kept; drafts never in `GET /applications`; platform `url` null (fixes url-less
  admin platform 500), CLI never reads it; S7, S8 touch no CLI route. `changelogs.md`: backend each slice (S7: Added
  `GET /platforms`, Changed `GET /admin/platforms` paginated; S8: Changed drafts `application_date`, finish body
  optional); `cli/CHANGELOG.md`: private rows in `/companies` + `/supports`, `is_public`, nullable platform `url`,
  CLI-created companies now private. S7, S8: no CLI entry.
- `quality-gates.md`: ty clean on touched files, coverage ≥ 90, e2e real stack. `branches-and-commits.md`.

## Risks
- Missed read path → draft counted or private row leaked. One predicate each; every read route test seeds both.
- Rollback to pre-B code shows drafts as applications (placeholder date) and private rows to all until re-upgrade.
- Out-of-order auto-save PUTs (hook serializes). S7: sheet saves a new company at picker confirm (abandoned → private row).
- S8: drafts created before S8 carry their creation day (server UTC) as date; finishing now uses it, not the finish day.
  Few open drafts; the date shows in step 1, editable. Web still sends the date on finish, so image skew is harmless.

## Open
1. Closed 2026-09-25: PRD R-006 typing before draft exists → page memory + leave warning, no browser storage.
2. Closed 2026-09-25: downgrade with duplicate private companies → conditional index (unique, else non-unique + ids logged).
3. Closed 2026-09-25 (superseded 2026-09-26 by 7): finish date → browser local day in body.
4. Closed 2026-09-25: platform `url` optional, null in `/supports`, users and admins; entry in both changelogs.
5. Closed 2026-09-25: admin adding through user flows gets a private row, publishes on admin screen; user edit/delete no.
6. Closed 2026-09-26: amendment → one slice S7 before S6; `GET /platforms` + paginated admin list.
7. Closed 2026-09-26: date field in with-CV step 1, preset today, saved with the draft; finish uses it (body date optional).
