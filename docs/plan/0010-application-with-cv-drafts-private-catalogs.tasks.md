# Tasks 0010 — New application with CV, drafts, private companies and platforms

PRD: docs/prd/0010-application-with-cv-drafts-private-catalogs.md   Plan: docs/plan/0010-application-with-cv-drafts-private-catalogs.md
ADRs bound: 0014 (Accepted 2026-09-25), 0001, 0003, 0004, 0005, 0009; frontend 0006. No ADR to draft. No CV-builder ADR exists (`0007` is product and schema convergence, not bound).

## Order
K1 = S1 migration (Release A) → K2 = S2 backend catalog visibility + publish → K3 = S3 backend drafts + read filters → K4 = S4+S5+S6 frontend + E2E → K6 = S7 company picker = platform picker, three-section form, admin Platforms page, `GET /platforms` → K7 = S8 with-CV date field, Date | Job link, card-free form on both forms, wide sheet + larger title, Applications | Drafts tabs → K5 = closing (Release B)

- **Slices.** K1..K5 set 2026-09-25.
  - K6 was added 2026-09-26 for the first PRD amendment (R-028..R-036).
  - K7 was added 2026-09-26 for the second amendment (R-037..R-050, with R-003, R-011 and R-031 rewritten).
  - K6 and K7 are numbered after K5 but build before it.
- **Cap.** Owner, 2026-09-25: "make up to 5 tickets only with the final gate". 5 in total, closing included.
  - S1 = K1; S2 = K2; S3 = K3; S4 + S5 + S6 = K4; closing = K5.
  - Stories stay as `[USn]` step tags, in priority order inside each slice.
  - Slices run more than a day. The owner's cap wins over the one-story, one-day rule.
  - **2026-09-26:** the owner chose one new slice before K5 for the amendment. S7 = K6, backend and frontend in one slice. That makes 6 slices, one over the cap, owner-approved.
  - **2026-09-26, second amendment:** one new slice (backend + frontend) before K5, which depends on it (PRD Clarifications). S8 = K7. That makes 7 slices, two over the cap, owner-approved.
- **Why the frontend is one slice.** Merging same-side slices keeps "backend slice, then frontend slice depending on it". Step 1 uses S4's platform picker, and the plan's E2E spans both S4 and S5.
- **Priority bent once.** K2 (US4..US7, P2) comes before K3 (US1..US3, P1). The draft use cases call K2's `resolve_company` and `ensure_platform_visible` (plan S2: "Used by ... draft use cases"), and R-022 binds drafts too.
- **deps:** K1 none; K2 = K1; K3 = K1 + K2; K4 = K2 + K3 (contract; K1 transitive); K6 = K4; K7 = K6; K5 = K4 + K6 + K7.
- **Branch.** One branch, `integration/0010-application-with-cv-drafts`, cut off `develop` on 2026-09-25 right after the local merge of integration/0009 (a1e8f3c). K2..K7 build on it, no branch of their own.
- **AC.** Each AC is the PRD requirement sentence, verbatim, with the `R-nnn` prefix dropped (house precedent). Rule ACs carry their rule path. Where a slice carries only one side of a requirement, the covers line says so.

### Releases (runbook rule 4, expand first, code second)
- **A = K1.**
  - K1 commits touch only `backend/migrations/versions/`, `backend/tests/integration/` and `backend/CHANGELOG.md`. The K1 tip is tagged `0010-release-a` (local).
  - Old code runs on the new schema: every new column has a server default, and the old ORM maps none of them.
  - Owner: merge `0010-release-a` into `develop` → release → CD deploys → `alembic upgrade head` in the API container → restart → confirm.
- **B = K2..K4, K6, K7, K5.**
  - K6 (S7) and K7 (S8) ship no migration, so they carry no expand-first constraint. They land in B before the closing slice.
  - The K2..K4, K6 and K7 tips are not merge points. The K5 tip is tagged `0010-release-b`.
  - The owner merges B only after confirming that A's `alembic upgrade head` ran in prod.
- **Between A and B,** companies users add through old code are public (server default `true`). This matches PRD Assumption "Companies users add between the database change and the release that uses it are public, as they are today."
- Build never waits for prod; merge does. Tags stay local. Never rewrite or force-push.
- **Rollback.**
  - B = the previous image. Drafts then show as applications with a placeholder date, and private rows are visible to everyone until the upgrade runs again (plan Risk).
  - A, only after B is rolled back = `alembic downgrade 583226ca46bc` + the previous image. That renames the four columns to `_old` and applies the conditional company index.

### Plan corrections (checked against the code, 2026-09-25)
- **Plan header is stale.** It says ADR-0014 "Proposed"; the ADR reads Accepted (2026-09-25). K5 fixes the header line.
- **Head.** The head is `583226ca46bc` (`retire_users_is_org_member`). `test_only_one_head` pins it in `backend/tests/integration/test_timeline_contract_migration.py` l.827; K1 moves the pin.
  - At K1 start, check that `develop` holds `583226ca46bc`.
  - If it does not (0009 Release C not merged), stop and ask the owner which base to cut from.
- **R-026 vs the plan contract.** The PRD asks for a refusal that "tells the admin which public row it collides with". Edge case: "refused, naming the public one". The plan's 409 details are fixed strings that name nothing. K2's 409 names the public row:
  - `A public company with this name and URL already exists: <name> (<url>, id <id>)`
  - `A public platform with this name already exists: <name> (id <id>)`
- **R-020 "points the user to that platform".**
  - The plan's 409 detail becomes `A platform with this name already exists: <name>`.
  - The picker selects the listed platform on an exact case-insensitive match, before any POST.
  - On a 409 anyway (race or stale list), it refetches and selects the match.
- **`companies.created_by` is already `ON DELETE SET NULL`** (revision `b2c3d4e5f6a1`, `CompanyModel`). `backend/CLAUDE.md` still says "Company → User (… cascade delete)"; K2 fixes that line. K1 gives platforms the same FK rule.
- **The url-less platform 500.** `/supports` `PlatformSchema.url` is `str` (`backend/app/presentation/schemas/support.py`), but `platforms.url` is nullable and the admin create accepts no URL. That is the "admin 500" of plan Open 4. The admin `PlatformSchema.url` is already `str | None`.
- **No `POST /companies` today.** `backend/app/presentation/api/company.py` has GET only. `use_cases/companies/create_company.py` exists but no route uses it; K2 reshapes it.
- **Company reuse is new.** `create_application.py` `_resolve_company` creates without normalising the URL and without reuse, so a duplicate is a 409 today. After K2 it reuses a visible match (R-021). That is CLI-visible, so it goes in both changelogs.
- **Draft DTOs.** The plan names only the schemas, but ADR-0001 says use cases return DTOs. K3 adds `backend/app/application/dto/application_draft.py` (new).
- **Supports query.** It lives in `frontend/src/contexts/supports-context.tsx` (key `["supports"]`), not in a hook.
- **Admin publish (frontend).** It also needs `services/implementations/admin-service.ts`, `services/types/admin.ts` and `hooks/use-admin.ts`; the plan names only the pages. There is no `i-admin-service.ts`.
- **"Only you" on companies too.** `Company` lives in `frontend/src/services/types/applications.ts`. PRD Assumption "Private companies and platforms carry an 'only you' label in the pickers" covers the company picker (`company-select-options.tsx`) as well, not only `platform-select`.
- **No sheet tests exist.** There is no `application-form-sheet.test.tsx`, so the plan Risk "sheet tests gate" has nothing to gate on. K4 writes a characterization test of the sheet before extracting `application-fields.tsx`.
- **`FullWidthContent`** lives in `frontend/src/components/layout/content-width.ts`.
- **E2E seed.** `seed_e2e.py` seeds users only, so the master CV is seeded in-spec through `POST /base-cvs` (as `cv-builder.spec.ts` does). A user cannot delete a platform, so spec cleanup deletes the application as `user`, then the platform as `admin` (`DELETE /admin/platforms/{id}`).
- **ty baseline.** It is 171 and only ratchets down. Every file a slice creates or changes is clean. Coverage ≥ 90%.

### Plan corrections, S7 / K6 (checked against the code, 2026-09-26)
- **`/supports` order.** `PlatformRepository.list_visible` orders by `id` today, and `/supports` reads it. The plan says the widened method orders by name, but R-036 keeps `/supports` "its content and shape". So K6 orders by name for `GET /platforms` only; `/supports` keeps `ORDER BY id`, and `test_supports.py` stays unchanged and green.
- **The E2E company step changes, not only the cleanup.** The plan names only the cleanup of `application-with-cv.spec.ts`. But step 1 (l.143-145) types a company and presses Escape to keep free text, which is the old `CompanySelect`. With the new picker, free text comes only from "Create" with a blank URL (R-029). K6 T121 rewrites that step too.
- **Two more E2E specs name the old page.**
  - `smoke.spec.ts` l.136-138 asserts heading "Supports Data" at `/admin/supports`.
  - `admin-gating.spec.ts` l.21 lists `/admin/supports`.
  K6 T120 moves both to `/admin/platforms` and checks that the old path lands on Platforms.
- **Stale pointers after the move.** `admin/supports/supports-page.tsx` is named as a pattern in `frontend/CLAUDE.md` (the "Admin — private company/platform rows" and "Admin — Discord webhooks" sections) and in comments in `admin/discord-webhooks/discord-webhooks-page.tsx` and its test. K6 T123 repoints them to `admin/platforms/platforms-page.tsx`.
- **Company picker tests.** `company-select-options.test.tsx` exists and goes with `company-select-options.tsx`. There is no `company-select.test.tsx`; K6 creates it. The service method is `services.companies.searchCompanies`; the plan calls it `search`.
- **The 409 path in `use-create-platform.ts`** refetches `["supports"]` to select the colliding row. After S7 the picker reads `["platforms", name]`. The hook invalidates both keys (plan), and the 409 still has to select the colliding row (`use-create-platform.test.tsx`).
- **"(same for get /companies)".** `GET /companies?name=` already exists as its own route (K2). The owner's route answer was "GET /platforms + paginated admin list", so no new companies route is needed. K6's company picker reads `GET /companies`.
- **No migration.** The head stays `3b78c3cd2a71`, and S7 needs no Release A step.

### Plan corrections, S8 / K7 (checked against the code, 2026-09-26)
- **Plan header is stale again.** After the second rewrite, plan l.7 reads "0014 (Proposed, this plan)", but `docs/adr/0014-private-catalog-rows-and-draft-applications.md` reads Accepted (2026-09-25). K5 T095 fixes the header line.
- **Backend docstrings still say a draft never gets a date.** `app/presentation/schemas/application_draft.py` l.5 and `app/application/dto/application_draft.py` l.4 both say it. So does the backend `CLAUDE.md` "Application drafts" table, which still shows finish as `{application_date}` only. K7 T126 and T131 rewrite them.
- **Stale comment in the fields component.** `application-fields.tsx` l.90 says "the draft page passes `max-w-4xl`". It goes with R-038 (K7 T134).
- **The E2E assertion that breaks.** `application-with-cv.spec.ts` l.207 asserts `[data-slot="drafts-section"]` count 0 after finishing. With R-041 the Drafts tab stays visible with its empty state, so that assertion changes (K7 T144).
- **Nothing new needed for narrow/wide or the date limit.**
  - "Narrow" and "wide" already follow the form's own width: `application-fields.tsx` l.181 is `@container/app-form`, and `ROW2`/`ROW3` use `@md/app-form:`. R-047 needs no media query.
  - `DatePickerInput` already takes `maxDate` (`components/ui/date-picker.tsx` l.21).
- **Existing labels.** The empty-state link reuses the existing "New with CV" label (`APPLICATIONS_PAGE_COPY.newWithCv`, `application-card-copy.ts`). The sheet title words stay "New Application" / "Edit Application" (PRD Assumption), which `cv-builder.spec.ts` l.594 relies on.
- **PRD typo.** In the PRD Assumptions (l.195), two items run together on one line ("…same form width.- (2026-09-26) The "Notes" field…"). It is cosmetic; this file does not fix it.
- **No migration.** `applications.application_date` already exists. The head stays `3b78c3cd2a71`.

## K1 — S1 Release A migration: catalog visibility and draft flag columns (migration only)   side: backend   covers: R-025, R-026 (schema level; code K2)   deps: —
Owner's words: "i would like to change how job applications is created, today i have to create an application entry and then attach a cv to this application, i want to add option to the user to create a job application and a cv together (this option will be available only in the web app, no support to the cli), when the user clicks to create an entry with a cv, instead of opening the sheet as is today, open a new page where the user selects a master cv to use as template, let the user edit the cv to the job and then in the next step the user fills the data about the application, like company, role name, platform, etc." "I also want in the same plan to copy the same behavior in company to platform (when creating a new job application) today, all platforms is defined by the admin, and i want to able to the public add new platforms."
Touch:
- backend/migrations/versions/<rev>_catalog_visibility_and_drafts.py (new)
- backend/tests/integration/test_migration_catalog_visibility_drafts.py (new)
- backend/tests/integration/test_timeline_contract_migration.py
- backend/CHANGELOG.md
Pattern:
- backend/migrations/versions/583226ca46bc_retire_users_is_org_member.py (rename, docstring shape)
- backend/tests/integration/test_migration_retire_is_org_member.py (round trip)
- backend/migrations/versions/b2c3d4e5f6a1_company_changes_in_applications.py (company index, FK)
Contract: no route. Release A: the image ships this revision, app code unchanged.
Steps:
- T001 [US7] Branch and head:
  - `git switch -c integration/0010-application-with-cv-drafts develop`.
  - `grep -rn "^down_revision" backend/migrations/versions/` → one head, `583226ca46bc`.
- T002 [US7] Create backend/migrations/versions/<rev>_catalog_visibility_and_drafts.py (new), `down_revision = '583226ca46bc'`. upgrade():
  - `companies.is_public BOOLEAN NOT NULL server_default true`;
  - `platforms.is_public BOOLEAN NOT NULL server_default true`;
  - `platforms.created_by BIGINT NULL`, FK `fk_platforms_created_by` → `users.id ON DELETE SET NULL` (created only when absent), index `ix_platforms_created_by`.
  - Every existing row becomes public through the default (R-025).
  - A column whose `*_old` exists (earlier downgrade) is renamed back, not added.
- T003 [US5] Same revision, company uniqueness:
  - drop whichever of `uq_companies_name_url` / `ix_companies_name_url` exists;
  - create `uq_companies_public_name_url` UNIQUE `(lower(name), url) WHERE is_public`;
  - create `uq_companies_private_owner_name_url` UNIQUE `(created_by, lower(name), url) WHERE NOT is_public`.
  - Builds clean on prod: every row is public, and the old index was already unique.
- T004 [US4] Same revision: `uq_platforms_private_owner_name` UNIQUE `(created_by, lower(name)) WHERE NOT is_public`. No public platform index, because prod may hold duplicate names; the publish check lives in K2.
- T005 [US1] Same revision: `applications.is_draft BOOLEAN NOT NULL server_default false`, and `ix_applications_user_id_drafts (user_id) WHERE is_draft`.
- T006 [US7] downgrade():
  - drop `uq_companies_public_name_url`, `uq_companies_private_owner_name_url`, `uq_platforms_private_owner_name`, `ix_platforms_created_by`, `ix_applications_user_id_drafts`;
  - rename `applications.is_draft`, `companies.is_public`, `platforms.is_public`, `platforms.created_by` → `*_old`. Values stay for the re-upgrade; the FK stays on `created_by_old`; the old ORM maps none of them.
  - Recreate `uq_companies_name_url` UNIQUE `(lower(name), url)` when no duplicate `(lower(name), url)` group exists. Otherwise create a non-unique `ix_companies_name_url` and log the duplicate ids (owner, 2026-09-25).
  - The docstring cites non-destructive rules 1, 2, 7; runbook 4; ADR-0014; ADR-0005.
- T007 [P] [US7] Round-trip test in backend/tests/integration/test_migration_catalog_visibility_drafts.py (new): testcontainers Postgres, real chain. Seed at `583226ca46bc`: users A and B, companies (the Applika.dev placeholder included), platforms (one with NULL url), applications.
  - **upgrade:**
    - every company and platform is `is_public` true; every application is `is_draft` false; `platforms.created_by` is NULL; every value is intact;
    - an old-shape insert (no new columns) → public, not a draft;
    - private company, same `lower(name)`+url, for A and for B → both kept; A twice → IntegrityError; two public ones → IntegrityError;
    - private platform, same `lower(name)`, for A and B → both kept; A twice → IntegrityError; two public platforms with the same name → accepted;
    - deleting user A → `platforms.created_by` becomes NULL;
    - no column or table is missing.
  - **downgrade**, after marking one draft and private rows by SQL:
    - `is_draft_old`, both `is_public_old` and `created_by_old` hold those values;
    - the original columns are intact;
    - `uq_companies_name_url` is unique again.
  - **Duplicate branch:** A and B hold the same private name+url → downgrade → non-unique `ix_companies_name_url`, both rows kept, the ids logged (caplog).
  - **upgrade again:** the `_old` columns are renamed back, draft and private flags restored, indexes equal to the first upgrade, and `ix_companies_name_url` is gone.
- T008 [US7] In backend/tests/integration/test_timeline_contract_migration.py, move the `test_only_one_head` pin from `583226ca46bc` to `<rev>`; assert `down_revision == '583226ca46bc'`; keep the chain walk.
- T009 [US7] backend/CHANGELOG.md, `## [Unreleased]` Added: `- companies.is_public, platforms.is_public, platforms.created_by, applications.is_draft; scoped partial unique indexes on companies and platforms; every existing row public; no code reads them yet (Release A).` No CLI entry: no route changes.
- T010 [US7] Verify:
  - `grep -nE "op\.drop_(column|table)"` on the revision → no hit in `upgrade()`;
  - `grep -rn "_old" backend/app/` → none;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`;
  - `uv run pytest tests/integration -k migration`.
- T011 [US7] Release A shape:
  - backend/app/domain/models.py maps none of the new columns;
  - backend/tests/conftest.py is unchanged;
  - `git diff develop --name-only` lists only `backend/migrations/versions/`, `backend/tests/integration/` and `backend/CHANGELOG.md`.
- T012 [US7] Backend gate and close:
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171, changed files clean), `uv run pytest . --cov=app` (≥ 90%).
  - Record: tag the K1 tip `0010-release-a`; the owner steps in Releases above; rollback `alembic downgrade 583226ca46bc` + the previous image; the agent never touches prod.
AC:
- Every company and platform that exists when this feature is released stays public.
- Two users may each hold a private company, or a private platform, with the same name; the system keeps both. The system refuses to publish a row that would duplicate a public one and tells the admin which public row it collides with.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)

## K2 — S2 backend: private companies and platforms, POST /platforms and /companies, admin Approve   side: backend   covers: R-017 (backend half), R-018, R-019, R-020, R-021, R-022, R-023 (API), R-024, R-025, R-026, R-027   deps: K1
Owner's words: "I also want in the same plan to copy the same behavior in company to platform (when creating a new job application) today, all platforms is defined by the admin, and i want to able to the public add new platforms."
Clarified: "privater to the creator, but, i as an admin can approve and make available to everyone (still keeping the reference to who's created), this is what i also would like for companies, same behavior, firstly private to the user and then unlocked to the public."
Touch:
- backend/app/domain/models.py
- backend/app/domain/repositories/catalog_visibility.py (new)
- backend/app/domain/repositories/company_repository.py
- backend/app/domain/repositories/platform_repository.py
- backend/app/domain/repositories/admin_repository.py
- backend/app/application/dto/company.py
- backend/app/application/dto/platform.py
- backend/app/application/use_cases/catalog/__init__.py (new)
- backend/app/application/use_cases/catalog/resolve.py (new)
- backend/app/application/use_cases/applications/create_application.py
- backend/app/application/use_cases/applications/update_application.py
- backend/app/application/use_cases/companies/list_companies.py
- backend/app/application/use_cases/companies/create_company.py
- backend/app/application/use_cases/get_supports.py
- backend/app/application/use_cases/platforms/__init__.py (new)
- backend/app/application/use_cases/platforms/create_platform.py (new)
- backend/app/application/use_cases/admin/companies/create_company.py
- backend/app/application/use_cases/admin/companies/list_companies.py
- backend/app/application/use_cases/admin/companies/publish_company.py (new)
- backend/app/application/use_cases/admin/platforms/create_platform.py
- backend/app/application/use_cases/admin/platforms/list_platforms.py
- backend/app/application/use_cases/admin/platforms/publish_platform.py (new)
- backend/app/presentation/api/company.py
- backend/app/presentation/api/platform.py (new)
- backend/app/presentation/api/support.py
- backend/app/presentation/api/admin/companies.py
- backend/app/presentation/api/admin/platforms.py
- backend/app/presentation/schemas/company.py
- backend/app/presentation/schemas/platform.py (new)
- backend/app/presentation/schemas/support.py
- backend/app/presentation/schemas/admin.py
- backend/app/main.py
- backend/tests/unit/test_create_platform.py (new)
- backend/tests/unit/test_catalog_resolve.py (new)
- backend/tests/unit/test_publish_catalog.py (new)
- backend/tests/unit/test_create_application.py
- backend/tests/unit/test_update_application.py
- backend/tests/integration/test_platforms.py (new)
- backend/tests/integration/test_companies.py
- backend/tests/integration/test_supports.py
- backend/tests/integration/test_applications.py
- backend/tests/integration/test_admin.py
- backend/tests/integration/test_delete_account.py
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md
- backend/CHANGELOG.md
- cli/CHANGELOG.md
Pattern:
- backend/app/application/use_cases/applications/create_application.py
- backend/app/domain/repositories/application_repository.py
- backend/app/presentation/api/admin/platforms.py
- backend/app/lib/urls.py (`normalize_company_url`)
Contract (K4 consumes):
- `GET /companies?name=` → 200 `[{id,name,url,is_public,created_at,updated_at}]`, visible rows only.
- `POST /companies` `{name 1..200, url HttpUrl}` → 201 new | 200 existing visible match | 422.
- `GET /supports` → 200; `platforms[]` visible rows only, `{id, name, url: str|null, is_public}`.
- `POST /platforms` `{name 1..100, url HttpUrl ≤200|null}` → 201 `{id,name,url,is_public}` | 409 `A platform with this name already exists: <name>` | 422.
- `POST /applications`, `PUT /applications/{id}`: shapes unchanged. An invisible company id → 404 'Company not found'; an invisible `platform_id` → 404 'Platform not found'. Nothing is written.
- `GET /admin/companies?visibility=public|private`, `GET /admin/platforms?visibility=`: rows add `is_public` and `created_by {id, username}|null`.
- `POST /admin/companies/{id}/publish`, `POST /admin/platforms/{id}/publish` → 200 row (idempotent) | 404 | 409 naming the public row (Plan corrections).
Steps:
- T013 [US4] Map in backend/app/domain/models.py:
  - `CompanyModel.is_public` and `PlatformModel.is_public` (`server_default=sa.true()`, `default=True`);
  - `PlatformModel.created_by` (FK `users.id` ON DELETE SET NULL) and `created_by_user`;
  - `__table_args__` mirror every K1 index name and predicate; the `uq_companies_name_url` declaration is removed. `create_all` in tests must build the K1 schema.
- T014 [US4] Create `visible_to(model, user_id)` = `is_public OR created_by = user_id` in backend/app/domain/repositories/catalog_visibility.py (new).
- T015 [US4] In backend/app/domain/repositories/platform_repository.py:
  - `get_visible(id, user_id)`, `list_visible(user_id)`;
  - `find_visible_by_name(name, user_id)`: trimmed, case-insensitive;
  - `find_public_by_name(name, exclude_id)`;
  - `get_all(visibility)` with `created_by_user` loaded;
  - `create(..., is_public)`, with `is_public` keyword-required.
- T016 [US4] Create `ensure_platform_visible(repo, platform_id, user_id)` → 404 'Platform not found', in backend/app/application/use_cases/catalog/resolve.py (new) + backend/app/application/use_cases/catalog/__init__.py (new).
- T017 [US4] Create `CreatePlatformUseCase` in backend/app/application/use_cases/platforms/create_platform.py (new) + `__init__.py` (new):
  - trim the name;
  - a visible case-insensitive match → `ResourceConflict('A platform with this name already exists: <name>')`;
  - else create with `is_public=False`, `created_by=user.id`, admins included;
  - an IntegrityError (race) → the same 409.
- T018 [US4] Create the route:
  - `PlatformCreate {name 1..100 stripped, url HttpUrl ≤200 | None}` and `PlatformOut {id, name, url: str|None, is_public}` in backend/app/presentation/schemas/platform.py (new);
  - `POST /platforms` (`CurrentUserDp`) → 201, in backend/app/presentation/api/platform.py (new);
  - `include_router` in backend/app/main.py.
- T019 [US4] `/supports` lists visible rows only:
  - `GetSupportsUseCase.execute(user_id)` → `list_visible`, in backend/app/application/use_cases/get_supports.py;
  - pass `c_user.id` in backend/app/presentation/api/support.py;
  - `PlatformSchema {id, name, url: str | None, is_public}` in backend/app/presentation/schemas/support.py (fixes the url-less 500).
- T020 [US4] In backend/app/application/use_cases/applications/create_application.py and backend/app/application/use_cases/applications/update_application.py, call `ensure_platform_visible` instead of `platform_repo.get_by_id`. The platform check runs before any company write.
- T021 [P] [US4] Unit tests in backend/tests/unit/test_create_platform.py (new):
  - the name is trimmed;
  - a case match on a public row, or on the user's own private row → 409 naming it;
  - another user's private row with the same name → created;
  - an admin → private;
  - IntegrityError → 409.
- T022 [US4] Integration tests in backend/tests/integration/test_platforms.py (new) and backend/tests/integration/test_supports.py:
  - POST → 201, private; `url` null → accepted; `url` > 200 → 422; blank name → 422; a case duplicate → 409; anonymous → 401;
  - `/supports`: the creator sees the row with `is_public` false; another user does not see it;
  - a url-null public platform is listed without error;
  - `POST /applications` with another user's private platform → 404, and no row is written.
- T023 [US5] Companies, data:
  - backend/app/domain/repositories/company_repository.py: `get_visible(id, user_id)`; `list_visible(user_id, name)`; `find_visible_match(name, url, user_id)` (`lower(name)`, normalised URL, public preferred); `create(dto, *, is_public)`; the IntegrityError → `ResourceConflict` mapping is kept.
  - `is_public` on `CompanyCreateDTO` and `CompanyDTO` in backend/app/application/dto/company.py; on the platform DTOs in backend/app/application/dto/platform.py.
- T024 [US5] Create `resolve_company(repo, company, user_id) -> (company_id | None, name)` in backend/app/application/use_cases/catalog/resolve.py:
  - an int id → the visible row, else 404 'Company not found';
  - `{name, url}` → `normalize_company_url`; a visible match is reused; else create with `is_public=False`, `created_by=user_id` (no `is_admin` branch); an IntegrityError race → re-read the match;
  - `{name, url: null}` → `(None, name)`, free text.
- T025 [US5] Replace `_resolve_company` in backend/app/application/use_cases/applications/create_application.py and backend/app/application/use_cases/applications/update_application.py with `resolve_company`. Order: platform, then company. A 404 writes nothing.
- T026 [US5] Company use cases:
  - `ListCompaniesUseCase.execute(user_id, name)` → `list_visible`, in backend/app/application/use_cases/companies/list_companies.py;
  - `CreateCompanyUseCase.execute(data, user_id) -> (CompanyDTO, created)`: normalise the URL; a visible match → the existing row; else a private row. In backend/app/application/use_cases/companies/create_company.py.
- T027 [US5] Routes:
  - `Company` adds `is_public`; add `CompanyCreate {name 1..200, url HttpUrl}`, in backend/app/presentation/schemas/company.py;
  - in backend/app/presentation/api/company.py: `GET /companies` passes `c_user.id`; `POST /companies` → 201 new | 200 existing.
- T028 [P] [US5] Unit tests in backend/tests/unit/test_catalog_resolve.py (new):
  - reuses a visible public row; reuses the user's own private row;
  - another user's private row with the same name+url → a new private row (both kept);
  - an admin → private;
  - free text → no row;
  - an invisible id → 404;
  - a normalised URL matches.
  Update backend/tests/unit/test_create_application.py and backend/tests/unit/test_update_application.py for the new collaborators.
- T029 [US5] Integration tests:
  - backend/tests/integration/test_companies.py:
    - own private rows are listed and another user's are not; `?name=` keeps the rule;
    - `POST /companies` → 201, then 200 with the same id (case and URL normalised);
    - two users with the same private name+url → two rows.
  - backend/tests/integration/test_applications.py:
    - `POST /applications` with the same `{name,url}` twice → the same `company_id`;
    - another user's private company id → 404, no application row; the same on PUT;
    - a name-only company → `company_id` null and absent from `/companies`.
  - backend/tests/integration/test_delete_account.py: a deleted user's companies and platforms stay private, with `created_by` NULL.
- T030 [US6] Only the admin-screen creates set `is_public=True`, `created_by=admin.id`: backend/app/application/use_cases/admin/companies/create_company.py and backend/app/application/use_cases/admin/platforms/create_platform.py.
- T031 [US6] Admin lists:
  - `visibility` filter; rows carry `is_public` and `created_by {id, username} | null`;
  - in backend/app/domain/repositories/admin_repository.py (`get_admin_companies`), backend/app/application/use_cases/admin/companies/list_companies.py, backend/app/application/use_cases/admin/platforms/list_platforms.py, backend/app/presentation/api/admin/companies.py, backend/app/presentation/api/admin/platforms.py;
  - `AdminCompanyRowSchema` and `PlatformSchema` plus a `CreatedBySchema` in backend/app/presentation/schemas/admin.py.
- T032 [US6] Publish use cases.
  - backend/app/application/use_cases/admin/companies/publish_company.py (new):
    - unknown id → 404; already public → 200 unchanged;
    - a public row with the same `lower(name)`+url → `ResourceConflict('A public company with this name and URL already exists: <name> (<url>, id <id>)')`; an IntegrityError on `uq_companies_public_name_url` → the same;
    - else `is_public=True`, `created_by` kept.
  - backend/app/application/use_cases/admin/platforms/publish_platform.py (new): the same, on `lower(name)` among public rows → `'A public platform with this name already exists: <name> (id <id>)'`.
- T033 [US6] Routes `POST /admin/companies/{id}/publish` and `POST /admin/platforms/{id}/publish` (`AdminUserDp`) → 200 row, in backend/app/presentation/api/admin/companies.py and backend/app/presentation/api/admin/platforms.py.
- T034 [P] [US6] Unit tests in backend/tests/unit/test_publish_catalog.py (new):
  - private → public, `created_by` kept;
  - idempotent;
  - a collision → 409 naming the public row;
  - 404.
- T035 [US6] Integration tests in backend/tests/integration/test_admin.py:
  - Lists: private rows show `created_by {id, username}`; the `visibility` filter works.
  - Approve:
    - → 200, and the row shows in every user's `/companies` or `/supports`, with the creator kept;
    - 404; a 409 names the row; a non-admin → 403.
  - Admin creates:
    - on the admin screens → public at once;
    - through `POST /companies`, `POST /platforms` or `POST /applications {name,url}` → private until published.
  - Deleting a private platform that is in use → refused, as today (`count_entity_references` unchanged).
- T036 [US7] Integration tests in backend/tests/integration/test_supports.py and backend/tests/integration/test_companies.py: the `base_data()` rows read `is_public` true for every user.
- T037 [US5] CLI compatibility (R-027):
  - `uv run pytest tests -k "steps or finalize or supports"` in backend;
  - `make test` in cli.
  - The CLI reads `/supports` and `/companies` as dict keys (cli/src/applika/commands/applications/api_resolve.py, cli/src/applika/schemas/supports.py) and never reads the platform `url`, so the additive `is_public` and a null `url` are safe.
- T038 [US4] In backend/scripts/seed_mock_data.py: one private platform (`POST /platforms`) and one private company (`POST /companies`), both used on an application.
- T039 [US4] Changelogs.
  - backend/CHANGELOG.md:
    - Added: `POST /platforms`, `POST /companies`, publish routes, admin `visibility`/`created_by`.
    - Changed: visible-only reads; nullable platform `url`; company reuse.
  - cli/CHANGELOG.md, `[Unreleased]` Changed, `- …`:
    - `/companies` and `/supports` list public rows plus the user's own private ones, and add `is_public`;
    - a platform `url` may be `null`;
    - companies created through the CLI are private until an admin publishes them;
    - `POST /applications` with a known name+URL reuses the company instead of answering 409;
    - 0.1.4, 0.2.0 and 1.0.0 are unaffected.
- T040 [US4] In backend/CLAUDE.md:
  - route tables: Companies (POST), Platforms (new), admin publish;
  - the visibility rule;
  - Company and Platform domain notes;
  - fix "Company → User … cascade delete" → SET NULL; add Platform → User, SET NULL.
- T041 [US4] Backend gate as in T012. `grep -rn "_old" backend/app/` → none. The K2 tip is not a merge point.
AC:
- While creating or editing an application in the web app, in the side sheet and in the new page, the user can add a platform that is not listed, with a name and an optional URL, the way a new company is added today. A platform may have no URL, whoever adds it, and every list shows such a platform without error.
- A company or platform a user adds is private: only that user sees it in lists and can pick it, until an admin publishes it.
- A company typed by name only stays free text on that application, as today, and appears in no list.
- The system refuses a new platform whose name, ignoring case, matches a platform the user already sees, and points the user to that platform.
- Adding a company whose name and URL match a company the user already sees reuses that company instead of making another.
- A user who submits a company or platform they cannot see gets "not found", and nothing is saved.
- The admin companies and platforms screens list private rows with the user who added them and offer Approve; approving publishes the row, which makes it visible to every user and keeps who added it.
- A company or platform added on the admin screens is public at once. One an admin adds while tracking their own applications is private, like any user's, until the admin publishes it on the admin screens.
- Every company and platform that exists when this feature is released stays public.
- Two users may each hold a private company, or a private platform, with the same name; the system keeps both. The system refuses to publish a row that would duplicate a public one and tells the admin which public row it collides with.
- Command-line clients keep listing and picking companies and platforms, and see the public ones plus the user's own private ones.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K3 — S3 backend: draft applications API; drafts out of every read model   side: backend   covers: R-002, R-003, R-004, R-005, R-006, R-007, R-009, R-010, R-011, R-012, R-013 (backend halves), R-014, R-015, R-016, R-019, R-022 (draft routes)   deps: K1, K2
Owner's words: "i would like to change how job applications is created, today i have to create an application entry and then attach a cv to this application, i want to add option to the user to create a job application and a cv together (this option will be available only in the web app, no support to the cli), when the user clicks to create an entry with a cv, instead of opening the sheet as is today, open a new page where the user selects a master cv to use as template, let the user edit the cv to the job and then in the next step the user fills the data about the application, like company, role name, platform, etc."
Clarified: "i would like to create an auto save mechanism and save as a draft, draft applications dont count's to the report and can be resumed at any time." Step order reversed by the owner: "the user first fill the data related to the application and then in the second step select a master cv to edit, this way i can create a draft application entry".
Touch:
- backend/app/domain/models.py
- backend/app/domain/repositories/application_filters.py (new)
- backend/app/domain/repositories/application_repository.py
- backend/app/domain/repositories/user_statistic_repository.py
- backend/app/domain/repositories/quinzenal_report_repository.py
- backend/app/domain/repositories/cycle_repository.py
- backend/app/domain/repositories/timeline_event_repository.py
- backend/app/domain/repositories/admin_repository.py
- backend/app/application/use_cases/tailored_cvs/guards.py
- backend/app/application/dto/application_draft.py (new)
- backend/app/application/use_cases/application_drafts/__init__.py (new)
- backend/app/application/use_cases/application_drafts/create_draft.py (new)
- backend/app/application/use_cases/application_drafts/update_draft.py (new)
- backend/app/application/use_cases/application_drafts/get_draft.py (new)
- backend/app/application/use_cases/application_drafts/list_drafts.py (new)
- backend/app/application/use_cases/application_drafts/delete_draft.py (new)
- backend/app/application/use_cases/application_drafts/finish_draft.py (new)
- backend/app/presentation/schemas/application_draft.py (new)
- backend/app/presentation/api/application_draft.py (new)
- backend/app/main.py
- backend/tests/unit/test_application_drafts.py (new)
- backend/tests/integration/test_application_drafts.py (new)
- backend/tests/integration/test_applications.py
- backend/tests/integration/test_statistics.py
- backend/tests/integration/test_quinzenal_reports.py
- backend/tests/integration/test_cycles.py
- backend/tests/integration/test_agenda.py
- backend/tests/integration/test_admin.py
- backend/tests/integration/test_delete_account.py
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md
- backend/CHANGELOG.md
Pattern:
- backend/app/application/use_cases/applications/create_application.py
- backend/app/presentation/api/application.py
- backend/app/application/use_cases/tailored_cvs/guards.py
- backend/app/application/validators/application_date.py
Contract (K4 consumes):
- `DraftInput`: `{company_id: id|null, company_name 1..200, role 1..200, platform_id, mode='active', link_to_job?, observation?, expected_salary?, salary_range_min?, salary_range_max?, currency?, salary_period?, experience_level?, work_mode?, country?, job_description? ≤50000}`. `company_id` wins; the name comes from the row.
- `Draft` = `DraftInput` + `{id, has_cv, created_at, updated_at}`.
- `DraftSummary`: `{id, company_name, role, platform_id, has_cv, updated_at}`.
- `POST /applications/drafts` → 201 `Draft` | 404 company/platform | 422.
- `GET /applications/drafts` → 200 `[DraftSummary]`, by `updated_at` desc.
- `GET /applications/drafts/{id}` → 200 | 404.
- `PUT /applications/drafts/{id}` → 200 `Draft` | 404 | 422.
- `DELETE /applications/drafts/{id}` → 204 | 404.
- `POST /applications/drafts/{id}/finish` `{application_date}` (browser local day) → 200 `Application` | 404 | 422 'Pick a master CV before finishing' | 422 beyond UTC today + 1.
- `/applications/{id}/cv*` (pdf and markdown included) accept drafts.
- `GET /applications` excludes drafts. On a draft id, `PUT|DELETE /applications/{id}`, `/timeline*`, `/steps*`, `/finalize` and `/reopen` → 404.
Steps:
- T042 [US1] Map in backend/app/domain/models.py:
  - `ApplicationModel.is_draft` (`server_default=sa.false()`, `default=False`);
  - `sa.Index('ix_applications_user_id_drafts', 'user_id', postgresql_where=...)` in `__table_args__`.
- T043 [US1] Create `NOT_DRAFT = ApplicationModel.is_draft.is_(False)` in backend/app/domain/repositories/application_filters.py (new).
- T044 [US1] In backend/app/domain/repositories/application_repository.py:
  - `get_by_id_and_user_id(id, user_id, *, include_drafts=False)` applies `NOT_DRAFT` unless told otherwise;
  - `get_all_by_user_id` applies `NOT_DRAFT`;
  - add `create_draft`, `get_draft(id, user_id)` and `list_drafts(user_id)`: `updated_at` desc, `has_cv` via an EXISTS on `tailored_cvs`.
- T045 [US1] `load_owned_application` passes `include_drafts=True`, in backend/app/application/use_cases/tailored_cvs/guards.py. It is the only caller that does (R-004).
- T046 [US1] Create `DraftInputDTO`, `DraftDTO` and `DraftSummaryDTO` in backend/app/application/dto/application_draft.py (new).
- T047 [US1] Use cases in backend/app/application/use_cases/application_drafts/ (new) + `__init__.py`:
  - `create_draft.py`:
    - `ensure_platform_visible`, then `resolve_company` by id (K2); `company_id` wins, the name comes from the row;
    - `application_date` = server today, a placeholder;
    - `is_draft=True`; mode defaults to active.
  - `get_draft.py`: the owner's draft, else 404 'Draft not found'.
  - `update_draft.py`: get → the same checks → full replace, `job_description` included. The CV copy is untouched (R-005).
  - `finish_draft.py`, in order:
    - get;
    - no CV copy → `BusinessRuleViolation('Pick a master CV before finishing')`;
    - `ensure_not_in_future(application_date, 'application_date')`;
    - write the body date, `is_draft=False`; `cycle_id` stays NULL (joins the current cycle);
    - return the `Application` read model.
- T048 [US1] Schemas in backend/app/presentation/schemas/application_draft.py (new):
  - `DraftInput`: company_name and role stripped, non-empty; `platform_id` required; mode `active` by default; `job_description` ≤ 50000; the other optional fields as `ApplicationCreate`;
  - `Draft`, `DraftSummary`, `DraftFinish {application_date: date}`.
- T049 [US1] Router in backend/app/presentation/api/application_draft.py (new), prefix `/applications/drafts`:
  - `POST` → 201; `GET /{id}`; `PUT /{id}`; `POST /{id}/finish` → 200 `Application`.
  - `include_router` in backend/app/main.py, before `application_router`.
- T050 [P] [US1] Unit tests in backend/tests/unit/test_application_drafts.py (new):
  - finish without a CV copy → 422 with the message; a date beyond UTC today + 1 → 422;
  - finish sets `is_draft` false and the given date;
  - `company_id` wins over the name;
  - `DraftInput` refuses a blank company or role, a missing platform, and `job_description` > 50000;
  - mode defaults to active.
- T051 [US1] Integration tests in backend/tests/integration/test_application_drafts.py (new):
  - create → 201, `has_cv` false;
  - CV copy on the draft:
    - `POST /applications/{id}/cv` from a master CV works;
    - `GET`, `PUT` and `DELETE /cv` work, and so do `/cv/pdf` and `/cv/markdown`;
    - a copy from another master after a delete works;
    - deleting the master keeps the copy.
  - A PUT on the draft keeps the copy.
  - finish → 200: the application shows in `GET /applications` with its copy and the finish date.
  - finish without a copy → 422; a date beyond → 422.
  - Another user's private company id or platform → 404, nothing written.
  - A name-only company → `company_id` null.
- T052 [US2] Use cases in backend/app/application/use_cases/application_drafts/:
  - `list_drafts.py` → `DraftSummary`, by `updated_at` desc;
  - `delete_draft.py` → the owner's draft, else 404 → `delete_by_id`. The `tailored_cvs` cascade removes the copy (R-013).
- T053 [US2] Routes `GET /applications/drafts` → 200 and `DELETE /applications/drafts/{id}` → 204, in backend/app/presentation/api/application_draft.py.
- T054 [US2] Integration tests in backend/tests/integration/test_application_drafts.py and backend/tests/integration/test_delete_account.py:
  - list: company, role, `updated_at`, `has_cv`, newest first; `[]` when there are none;
  - delete → 204, and the copy row is gone;
  - 404s:
    - another user's draft, on get, put, delete, finish and cv;
    - a finished application's id on the draft routes;
    - a draft id on `PUT|DELETE /applications/{id}`, `/timeline`, `/steps`, `/finalize` and `/reopen` (R-016);
  - anonymous → 401;
  - two PUTs → the last one wins;
  - deleting the account removes the user's drafts.
- T055 [US3] Apply `NOT_DRAFT` in:
  - backend/app/domain/repositories/user_statistic_repository.py: `_cycle_filter`;
  - backend/app/domain/repositories/quinzenal_report_repository.py: `_app_cycle_filter`, `_events_in_scope`, `get_user_start_date`;
  - backend/app/domain/repositories/cycle_repository.py: `count_current_applications`, `archive_current_applications`;
  - backend/app/domain/repositories/timeline_event_repository.py: `list_agenda`, joining `applications`;
  - backend/app/domain/repositories/admin_repository.py: every applications query except `count_entity_references`, which keeps counting drafts.
- T056 [US3] Integration tests: seed an open draft with a CV copy; every number must equal the run without it.
  - backend/tests/integration/test_applications.py: `GET /applications` omits it (the CLI list).
  - backend/tests/integration/test_statistics.py: every `/statistics*` route.
  - backend/tests/integration/test_quinzenal_reports.py: the metrics and the start date.
  - backend/tests/integration/test_cycles.py:
    - a new cycle archives no draft, and the count excludes it;
    - a draft finished after the new cycle joins the current cycle.
  - backend/tests/integration/test_agenda.py.
  - backend/tests/integration/test_admin.py:
    - `/admin/stats*`, top platforms, top companies, the heatmap, and the user rows and detail;
    - deleting a platform that a draft uses is still refused.
- T057 [US3] CLI compatibility (R-015): `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli; the `GET /applications` item shape is unchanged.
- T058 [US2] In backend/scripts/seed_mock_data.py: one draft finished with a CV copy, and one open draft; assert that `GET /applications` omits the open one.
- T059 [US2] Docs and changelog.
  - backend/CLAUDE.md:
    - the Application drafts route table;
    - `is_draft` and the `NOT_DRAFT` rule in the domain notes;
    - a Seed Script Rule bullet for drafts.
  - backend/CHANGELOG.md:
    - Added: the draft routes, `is_draft` mapped;
    - Changed: read models exclude drafts; `/applications/{id}/cv*` accept drafts.
  - No CLI entry: the `GET /applications` shape is unchanged, and drafts never reach it.
- T060 [US3] Backend gate as in T012. `grep -rn "_old" backend/app/` → none. The K3 tip is not a merge point.
AC:
- The "new application with CV" action opens its own page, not the side sheet, with two steps: step 1 the application data (company, role, platform, mode and the other optional fields the side sheet has, job description included), step 2 picking one of the user's master CVs and editing the copy made from it.
- The system does not ask for an application date in this flow; it dates the application with the user's own calendar day on the day they finish the draft, and refuses a date later than that.
- Step 2 behaves as the application CV page does today (PRD 0007): full snapshot copy, one copy per application, job description beside the editor, differences from the master shown, and a new copy from another master after deleting the current one.
- The system lets the user go back from step 2 to step 1, change the application data, and return to step 2 without losing the CV copy.
- The system creates the draft the first time company, role and platform are all set in step 1. Until then, what the user typed lives only in the open page and nothing is written to browser storage; closing or reloading the page first warns that the typing will be lost.
- Once the draft exists, the system saves every change to the application data and to the CV copy about one second after the user stops typing, without a save button, and shows whether the latest change is saved, saving, or failed.
- The system lets the user finish a draft only when company, role and platform are set and the draft has a CV copy, and otherwise says what is missing.
- Finishing turns the draft into a normal application: it appears in the applications list, keeps its CV copy, and counts in reports and statistics from then on.
- The applications page shows a Drafts section listing the user's drafts with company, role and when each was last saved, with Resume and Delete on each; the section is absent when the user has no drafts.
- Resume reopens the draft on step 2 when it already has a CV copy, and on step 1 otherwise.
- Deleting a draft asks for confirmation and deletes its CV copy with it.
- The system excludes drafts from reports, statistics, the dashboard, cycles, the agenda, admin statistics and admin user counts; starting a new cycle never archives a draft.
- The application list read by command-line clients never contains drafts, and installed command-line clients keep working unchanged.
- A draft has no timeline, cannot be closed or reopened, and is changed only through the "new application with CV" page.
- A company typed by name only stays free text on that application, as today, and appears in no list.
- A user who submits a company or platform they cannot see gets "not found", and nothing is saved.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K4 — S4-S6 frontend: platform picker, admin Approve, new application with CV page, auto-save, Drafts, E2E   side: frontend (+ E2E)   covers: R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-009, R-010, R-011, R-012, R-013, R-017, R-018, R-019, R-020, R-021, R-023, R-026 (UI halves)   deps: K2, K3
Owner's words: "i would like to change how job applications is created, today i have to create an application entry and then attach a cv to this application, i want to add option to the user to create a job application and a cv together (this option will be available only in the web app, no support to the cli), when the user clicks to create an entry with a cv, instead of opening the sheet as is today, open a new page where the user selects a master cv to use as template, let the user edit the cv to the job and then in the next step the user fills the data about the application, like company, role name, platform, etc." "I also want in the same plan to copy the same behavior in company to platform (when creating a new job application) today, all platforms is defined by the admin, and i want to able to the public add new platforms."
Clarified: step order reversed by the owner, "the user first fill the data related to the application and then in the second step select a master cv to edit, this way i can create a draft application entry".
Touch:
- frontend/src/components/applications/application-form-sheet.tsx
- frontend/src/components/applications/application-form-sheet.test.tsx (new)
- frontend/src/components/applications/application-fields.tsx (new)
- frontend/src/components/applications/platform-select.tsx (new)
- frontend/src/components/applications/platform-select.test.tsx (new)
- frontend/src/components/applications/company-select.tsx
- frontend/src/components/applications/company-select-options.tsx
- frontend/src/components/application-drafts/draft-stepper.tsx (new)
- frontend/src/components/application-drafts/draft-application-step.tsx (new)
- frontend/src/components/application-drafts/draft-cv-step.tsx (new)
- frontend/src/components/application-drafts/autosave-status.tsx (new)
- frontend/src/components/application-drafts/drafts-section.tsx (new)
- frontend/src/components/application-drafts/drafts-section.test.tsx (new)
- frontend/src/app/(protected)/applications/new-with-cv/page.tsx (new)
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx (new)
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx (new)
- frontend/src/app/(protected)/applications/applications-page.tsx
- frontend/src/app/(protected)/applications/applications-page.test.tsx
- frontend/src/app/(protected)/admin/companies/companies-page.tsx
- frontend/src/app/(protected)/admin/companies/companies-page.test.tsx (new)
- frontend/src/app/(protected)/admin/supports/supports-page.tsx
- frontend/src/app/(protected)/admin/supports/supports-page.test.tsx
- frontend/src/hooks/use-application-drafts.ts (new)
- frontend/src/hooks/use-debounced-autosave.ts (new)
- frontend/src/hooks/use-debounced-autosave.test.ts (new)
- frontend/src/hooks/use-create-platform.ts (new)
- frontend/src/hooks/use-create-company.ts (new)
- frontend/src/hooks/use-admin.ts
- frontend/src/services/types/application-drafts.ts (new)
- frontend/src/services/interfaces/i-application-draft-service.ts (new)
- frontend/src/services/implementations/application-draft-service.ts (new)
- frontend/src/services/types/supports.ts
- frontend/src/services/interfaces/i-platform-service.ts (new)
- frontend/src/services/implementations/platform-service.ts (new)
- frontend/src/services/types/applications.ts
- frontend/src/services/interfaces/i-company-service.ts
- frontend/src/services/implementations/company-service.ts
- frontend/src/services/types/admin.ts
- frontend/src/services/implementations/admin-service.ts
- frontend/src/services/services.ts
- frontend/e2e/application-with-cv.spec.ts (new)
- frontend/CLAUDE.md
Pattern:
- frontend/src/components/applications/company-select.tsx
- frontend/src/components/timeline/timezone-select.tsx
- frontend/src/app/(protected)/applications/cv/application-cv-page.tsx
- frontend/src/app/(protected)/cvs/editor/page.tsx (Suspense + `useSearchParams` under static export)
- frontend/src/components/ui/alert-dialog.tsx
- frontend/e2e/cv-builder.spec.ts
- frontend/CLAUDE.md "### Routing", "### Forms" (`useWatch`, never `form.watch()`), "### Tailored CVs", "### UI Components", "### App shell"; ADR-0006.
Contract: as K2 and K3. Frontend uses:
- `POST /platforms`; `POST|GET /companies`; `GET /supports` (`url: string|null`, `is_public`);
- `/applications/drafts*` and `/finish`; `/applications/{id}/cv*`;
- the admin `?visibility=` filter and `/publish`; the 409 details quoted in K2.
Steps:
- T061 [US1] Characterization test of the side sheet before any extraction, in frontend/src/components/applications/application-form-sheet.test.tsx (new):
  - create and edit send today's payload: a company id, `{name,url}` or a name only; platform, mode, date, salary, `job_description`;
  - the validation messages.
- T062 [US1] Draft service:
  - types `DraftInput`, `Draft`, `DraftSummary`, `DraftFinish` in frontend/src/services/types/application-drafts.ts (new);
  - `IApplicationDraftService` (create, get, update, list, remove, finish) in frontend/src/services/interfaces/i-application-draft-service.ts (new);
  - the implementation on `/applications/drafts*` in frontend/src/services/implementations/application-draft-service.ts (new);
  - register it in frontend/src/services/services.ts.
- T063 [US1] Company create:
  - `create({name,url})` → `POST /companies` in frontend/src/services/interfaces/i-company-service.ts and frontend/src/services/implementations/company-service.ts;
  - `useCreateCompany` in frontend/src/hooks/use-create-company.ts (new).
- T064 [US1] Hooks in frontend/src/hooks/use-application-drafts.ts (new):
  - `useDraft(id)`, `useDrafts()` (key `["application-drafts"]`), `useCreateDraft`, `useUpdateDraft`, `useDeleteDraft`;
  - `useFinishDraft`, which invalidates `["applications"]`, `["statistics"]` and `["application-drafts"]`.
- T065 [US1] Extract the fields from frontend/src/components/applications/application-form-sheet.tsx into frontend/src/components/applications/application-fields.tsx (new):
  - company, role, platform, mode, link, observation, salary, currency, period, experience, work mode, country, job description;
  - a `showDate` prop; `useWatch`.
  - The sheet renders it with the date; its behaviour is unchanged and T061 stays green.
- T066 [US1] Page shell:
  - frontend/src/app/(protected)/applications/new-with-cv/page.tsx (new) wraps `NewWithCvPage` in `<Suspense>`;
  - frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx (new) reads `?id=` and `?step=`;
  - frontend/src/components/application-drafts/draft-stepper.tsx (new): Step 1 "Application", Step 2 "CV".
- T067 [US1] Step 1, in frontend/src/components/application-drafts/draft-application-step.tsx (new):
  - `ApplicationFields` with no date (R-003); mode preset to `active`;
  - a new company with a URL, once confirmed → `useCreateCompany` → its `company_id` is used (a 200 reuses the existing id, R-021);
  - a name-only company → `company_id` null, and the name is kept (R-019).
- T068 [US1] Step 2, in frontend/src/components/application-drafts/draft-cv-step.tsx (new), against the draft id:
  - Reuse:
    - components: `tailored-cvs/base-cv-picker.tsx`, `tailored-cvs/tailored-cv-editor.tsx`, `tailored-cvs/use-cv-diff.tsx`, `tailored-cvs/job-description-panel.tsx`;
    - hooks: `use-create-tailored-cv.ts`, `use-update-tailored-cv.ts`, `use-tailored-cv.ts`, `use-delete-tailored-cv.ts`.
  - Behaviour: full snapshot, one copy, the job description beside the editor, the diff shown, delete then copy from another master (R-004).
  - No master CV → an invitation to `/cvs/new`; the draft stays.
  - `<FullWidthContent />` (frontend/src/components/layout/content-width.ts) once a copy exists.
  - Going back to step 1 and returning keeps the copy (R-005).
- T069 [US1] Finish:
  - disabled until complete, with a message listing what is missing: company, role, platform, CV copy (R-009);
  - sends the browser's local calendar day as `YYYY-MM-DD` built from local getters, never `toISOString()` (R-003);
  - success → `/applications` with a confirmation toast; a 422 detail is shown.
- T070 [US1] In frontend/src/app/(protected)/applications/applications-page.tsx, a "New with CV" action beside "New application" → `/applications/new-with-cv`. The sheet action is unchanged (R-001).
- T071 [P] [US1] Vitest:
  - frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx (new):
    - no date field, mode active, step order;
    - back and forward keep the copy;
    - Finish is disabled with the missing list;
    - Finish sends the local day (fake clock near midnight, UTC offset) and navigates to `/applications`.
  - frontend/src/app/(protected)/applications/applications-page.test.tsx: both actions show, and "New with CV" links to the page.
- T072 [US2] frontend/src/hooks/use-debounced-autosave.ts (new):
  - 1000 ms after the last change; one request in flight; the latest payload wins;
  - state `idle|saving|saved|error`; on error the payload is kept, and the next change or Retry resends it;
  - company, role or platform empty → no request, and the status "Not saved: company, role and platform are required".
- T073 [US2] Wiring, in new-with-cv-page.tsx and draft-application-step.tsx:
  - no draft until company, role and platform are all set;
  - the first save → `POST /applications/drafts` → `router.replace` with `?id=`; every later change → `PUT`;
  - step 2 CV edits auto-save through `PUT /applications/{id}/cv` on the same hook, with no save button;
  - nothing goes to localStorage, sessionStorage or IndexedDB;
  - a `beforeunload` warning while typing is unsaved: before the draft exists, while saving, and on error (R-006).
- T074 [US2] Status, in frontend/src/components/application-drafts/autosave-status.tsx (new):
  - "Saved", "Saving…", "Not saved" with Retry, and the required-fields message;
  - the typing stays on screen (R-008).
- T075 [US2] Drafts section, in frontend/src/components/application-drafts/drafts-section.tsx (new), rendered in applications-page.tsx:
  - rows show company, role and last saved; each has Resume and Delete; the section is absent with no drafts;
  - Resume → `/applications/new-with-cv?id=<id>` (R-012);
  - Delete → `AlertDialog` saying the CV copy goes too → `useDeleteDraft` (R-013).
- T076 [US2] Resume, in new-with-cv-page.tsx:
  - `?id=` loads the draft; a 404 shows a message and a link back;
  - it opens step 2 when `has_cv`, else step 1.
- T077 [P] [US2] Vitest:
  - frontend/src/hooks/use-debounced-autosave.test.ts (new), fake timers:
    - no call before 1000 ms, one call after;
    - a burst → one call with the latest payload;
    - a change while a request is in flight → a second call after the first resolves, with the latest payload;
    - an error keeps the payload and retries on the next change;
    - an empty required field → no call.
  - frontend/src/components/application-drafts/drafts-section.test.tsx (new): absent when empty; the rows; the Resume targets; Delete cancel and confirm.
  - new-with-cv-page.test.tsx:
    - no POST before the three fields;
    - one POST, then PUTs; the URL is replaced;
    - `Storage.prototype.setItem` is never called;
    - `beforeunload` is registered.
- T078 [US4] Platform service:
  - `Platform.url: string | null` and `is_public` in frontend/src/services/types/supports.ts;
  - `create({name, url?})` → `POST /platforms` in frontend/src/services/interfaces/i-platform-service.ts (new) and frontend/src/services/implementations/platform-service.ts (new);
  - register it in services.ts.
- T079 [US4] `useCreatePlatform` in frontend/src/hooks/use-create-platform.ts (new):
  - it invalidates `["supports"]` (frontend/src/contexts/supports-context.tsx);
  - on a 409 it surfaces the detail.
- T080 [US4] Picker, in frontend/src/components/applications/platform-select.tsx (new), `Popover`+`Command`:
  - an exact case-insensitive name match selects the listed platform, and no Create is offered (R-020);
  - "Create 'X'" → name + optional URL → create → the new id is selected;
  - a 409 → refetch, select the named platform, show the message;
  - an "Only you" badge when `!is_public`; url-null rows render.
- T081 [US4] In frontend/src/components/applications/application-fields.tsx, replace the platform `Select` with `PlatformSelect`. The sheet and step 1 both get it (R-017).
- T082 [P] [US4] Vitest:
  - frontend/src/components/applications/platform-select.test.tsx (new):
    - the list includes url-null rows; the badge shows;
    - a case-different name offers the listed platform and no Create;
    - Create with and without a URL → the service is called and the new platform selected;
    - the 409 path.
  - application-form-sheet.test.tsx: the sheet adds a platform.
- T083 [US5] Companies:
  - `Company.is_public` in frontend/src/services/types/applications.ts;
  - an "Only you" badge in frontend/src/components/applications/company-select-options.tsx;
  - frontend/src/components/applications/company-select.tsx passes it through.
- T084 [P] [US5] Vitest: the company picker shows "Only you" on a private row. Step 1 (new-with-cv-page.test.tsx):
  - a new company with a URL → `POST /companies`; a 200 selects the same id;
  - a name-only company → `company_id` null.
- T085 [US6] Admin service:
  - `AdminCompanyRow` and `AdminPlatform` add `is_public` and `created_by {id, username} | null`; `visibility` params; in frontend/src/services/types/admin.ts;
  - `publishCompany(id)`, `publishPlatform(id)` and `getPlatforms({visibility})` in frontend/src/services/implementations/admin-service.ts;
  - `usePublishCompany` and `usePublishPlatform` in frontend/src/hooks/use-admin.ts; they invalidate the admin lists and `["supports"]`.
- T086 [US6] Admin screens, frontend/src/app/(protected)/admin/companies/companies-page.tsx and frontend/src/app/(protected)/admin/supports/supports-page.tsx (platforms):
  - an All/Public/Private filter;
  - an "Added by" column (the username, or "—");
  - "Approve" on private rows → `AlertDialog` → publish;
  - a 409 shows the detail naming the public row (R-026);
  - url-null platforms render.
- T087 [P] [US6] Vitest in frontend/src/app/(protected)/admin/companies/companies-page.test.tsx (new) and frontend/src/app/(protected)/admin/supports/supports-page.test.tsx:
  - the filter sends `visibility`; Added by shows;
  - Approve shows only on private rows; confirm → publish;
  - the 409 detail shows verbatim;
  - a url-null row renders.
- T088 [US1] E2E on the real stack, in frontend/e2e/application-with-cv.spec.ts (new), pattern `cv-builder.spec.ts`:
  - Setup: seed a master CV through `POST /base-cvs` as `user`.
  - Flow:
    - `/applications` → "New with CV";
    - step 1: company name, role, and a new private platform (Create) with "Only you";
    - "Saved" → reload (the URL has `?id=`) → the draft resumes;
    - step 2: pick the master, edit a field → "Saved";
    - Finish → `/applications` lists it, and the Drafts section is absent.
  - Cleanup in `afterAll`:
    - delete leftover drafts and the application (as `user`);
    - delete the platform (as `admin`, `DELETE /admin/platforms/{id}`);
    - delete the master CV.
- T089 [US1] In frontend/CLAUDE.md:
  - Routing: `/applications/new-with-cv`;
  - a new "### Application drafts" section: the auto-save contract, no browser storage, finish sends the local day;
  - the platform picker; admin Approve; `application-fields.tsx` shared by the sheet and the page.
- T090 [US1] Gate:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - `scripts/e2e.sh e2e/application-with-cv.spec.ts e2e/cv-builder.spec.ts e2e/smoke.spec.ts` green;
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty.
  The K4 tip is not a merge point.
AC:
- The system offers, in the web app only, a "new application with CV" action beside the existing new-application action; the existing side sheet keeps working as today.
- The "new application with CV" action opens its own page, not the side sheet, with two steps: step 1 the application data (company, role, platform, mode and the other optional fields the side sheet has, job description included), step 2 picking one of the user's master CVs and editing the copy made from it.
- The system does not ask for an application date in this flow; it dates the application with the user's own calendar day on the day they finish the draft, and refuses a date later than that.
- Step 2 behaves as the application CV page does today (PRD 0007): full snapshot copy, one copy per application, job description beside the editor, differences from the master shown, and a new copy from another master after deleting the current one.
- The system lets the user go back from step 2 to step 1, change the application data, and return to step 2 without losing the CV copy.
- The system creates the draft the first time company, role and platform are all set in step 1. Until then, what the user typed lives only in the open page and nothing is written to browser storage; closing or reloading the page first warns that the typing will be lost.
- Once the draft exists, the system saves every change to the application data and to the CV copy about one second after the user stops typing, without a save button, and shows whether the latest change is saved, saving, or failed.
- When a save fails, the system keeps what the user typed on screen, says the change is not saved, and saves it with the next attempt.
- The system lets the user finish a draft only when company, role and platform are set and the draft has a CV copy, and otherwise says what is missing.
- Finishing turns the draft into a normal application: it appears in the applications list, keeps its CV copy, and counts in reports and statistics from then on.
- The applications page shows a Drafts section listing the user's drafts with company, role and when each was last saved, with Resume and Delete on each; the section is absent when the user has no drafts.
- Resume reopens the draft on step 2 when it already has a CV copy, and on step 1 otherwise.
- Deleting a draft asks for confirmation and deletes its CV copy with it.
- While creating or editing an application in the web app, in the side sheet and in the new page, the user can add a platform that is not listed, with a name and an optional URL, the way a new company is added today. A platform may have no URL, whoever adds it, and every list shows such a platform without error.
- A company or platform a user adds is private: only that user sees it in lists and can pick it, until an admin publishes it.
- A company typed by name only stays free text on that application, as today, and appears in no list.
- The system refuses a new platform whose name, ignoring case, matches a platform the user already sees, and points the user to that platform.
- Adding a company whose name and URL match a company the user already sees reuses that company instead of making another.
- The admin companies and platforms screens list private rows with the user who added them and offer Approve; approving publishes the row, which makes it visible to every user and keeps who added it.
- Two users may each hold a private company, or a private platform, with the same name; the system keeps both. The system refuses to publish a row that would duplicate a public one and tells the admin which public row it collides with.

## K6 — S7 company picker = platform picker, three-section application form, admin Platforms page, GET /platforms   side: both   covers: R-028, R-029, R-030, R-031, R-032, R-033, R-034, R-035, R-036   deps: K4
Owner's decision (Addendum, 2026-09-26): the company field uses the same select component as the platform field, with the same behavior. In both forms, with and without a CV, the inputs reorder: 1. Role name and Source on one line (as platform and source are placed today); 2. Company and Platform on one line; 3. the job link on the third line. The form gets three sections: first the base every job application must have; second all other optional inputs and selects (work mode, experience level, country, currency, salary period), with work mode, experience level and country on one line; third the job description, then Additional notes.
Owner's words (Addendum, 2026-09-26): "Now to the admin page, instead of supports, change to Platforms and change the table component you did to list all platforms to the component used in companies, also display how mahy applications that platform have, also create a new route to return the plaftorms instead of using the /suports api route (same for get /companies)"
Clarified (2026-09-26):
- One new slice (K6) before K5.
- "GET /platforms + paginated admin list (Recommended)". Option text: new `GET /platforms?name=` returns visible platforms, searched like `GET /companies`, and the web platform select uses it instead of `/supports`; `GET /admin/platforms` becomes paginated with an application count per platform, like `/admin/companies`; `/supports` unchanged for the CLI.
- "Source" is the existing application `mode` field.
Touch:
- backend/app/domain/repositories/platform_repository.py
- backend/app/domain/repositories/admin_repository.py
- backend/app/application/use_cases/platforms/list_platforms.py (new)
- backend/app/application/use_cases/admin/platforms/list_platforms.py
- backend/app/presentation/api/platform.py
- backend/app/presentation/api/admin/platforms.py
- backend/app/presentation/schemas/admin.py
- backend/tests/integration/test_platforms.py
- backend/tests/integration/test_admin.py
- backend/tests/integration/test_supports.py (verify only: unchanged, green)
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md
- backend/CHANGELOG.md
- frontend/src/components/applications/catalog-select.tsx (new)
- frontend/src/components/applications/catalog-select.test.tsx (new)
- frontend/src/components/applications/platform-select.tsx
- frontend/src/components/applications/platform-select.test.tsx
- frontend/src/components/applications/company-select.tsx
- frontend/src/components/applications/company-select.test.tsx (new)
- frontend/src/components/applications/company-select-options.tsx (deleted once unused)
- frontend/src/components/applications/company-select-options.test.tsx (deleted with it)
- frontend/src/components/applications/form-section.tsx (new)
- frontend/src/components/applications/application-fields.tsx
- frontend/src/components/applications/application-form-sheet.tsx
- frontend/src/components/applications/application-form-sheet.test.tsx
- frontend/src/components/application-drafts/draft-application-step.tsx
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx
- frontend/src/hooks/use-platforms.ts (new)
- frontend/src/hooks/use-create-platform.ts
- frontend/src/hooks/use-create-platform.test.tsx
- frontend/src/hooks/use-create-company.ts
- frontend/src/services/interfaces/i-platform-service.ts
- frontend/src/services/implementations/platform-service.ts
- frontend/src/components/admin/catalog-table.tsx (new)
- frontend/src/app/(protected)/admin/companies/companies-page.tsx
- frontend/src/app/(protected)/admin/companies/companies-page.test.tsx
- frontend/src/app/(protected)/admin/platforms/page.tsx (new)
- frontend/src/app/(protected)/admin/platforms/platforms-page.tsx (new, moved from admin/supports/supports-page.tsx)
- frontend/src/app/(protected)/admin/platforms/platforms-page.test.tsx (new, moved from admin/supports/supports-page.test.tsx)
- frontend/src/app/(protected)/admin/supports/page.tsx
- frontend/src/components/admin/admin-nav.tsx
- frontend/src/services/types/admin.ts
- frontend/src/services/implementations/admin-service.ts
- frontend/src/hooks/use-admin.ts
- frontend/src/app/(protected)/admin/discord-webhooks/discord-webhooks-page.tsx (comment only)
- frontend/src/app/(protected)/admin/discord-webhooks/discord-webhooks-page.test.tsx (comment only)
- frontend/e2e/application-with-cv.spec.ts
- frontend/e2e/smoke.spec.ts
- frontend/e2e/admin-gating.spec.ts
- frontend/CLAUDE.md
Pattern:
- backend/app/presentation/api/company.py (`list_companies`)
- backend/app/domain/repositories/admin_repository.py (`get_admin_companies`, `_admin_company_row_query`)
- backend/app/application/use_cases/admin/companies/list_companies.py
- frontend/src/components/applications/platform-select.tsx (the picker to extract whole)
- frontend/src/app/(protected)/admin/companies/companies-page.tsx (the table to extract)
- frontend/CLAUDE.md "### Forms" (`useWatch`, never `form.watch()`), "### Routing", "### UI Components"; ADR-0006
Contract:
- `GET /platforms?name=` (new) → 200 `[{id, name, url: str|null, is_public}]`, visible rows only, case-insensitive substring match, ordered by name | 401. Web only.
- `GET /admin/platforms` (replaces the bare list): `?search=&visibility=public|private&sort_by=name|created_at|applications_count&sort_order=asc|desc&page≥1&per_page=1..100 (25)`.
  - → 200 `{items: [{id, name, url|null, is_public, created_by {id, username}|null, applications_count, created_at}], total, page, per_page, total_pages}` | 403.
  - `applications_count` excludes drafts.
- Unchanged:
  - `GET /supports` (content, shape and `id` order);
  - `GET /companies?name=`, `POST /companies`, `POST /platforms`;
  - the admin platform POST, PATCH, publish and DELETE;
  - the 409 details as built in K2;
  - the `POST /applications`, `PUT /applications/{id}` and `DraftInput` payloads.
Release gate: Release B, and no migration. This tip is not a merge point: Release B is the K5 tip.
Steps:
- T100 [US8] Start on `integration/0010-application-with-cv-drafts`, after the K4 tip. Confirm no migration: `grep -rn "^down_revision" backend/migrations/versions/` → one head, `3b78c3cd2a71`.
- T101 [US8] In backend/app/domain/repositories/platform_repository.py, `list_visible(user_id, name=None, *, order_by_name=False)`:
  - `name` → `PlatformModel.name.ilike(f'%{name}%')`;
  - `GET /platforms` orders by name;
  - `/supports` passes neither and keeps `ORDER BY id` (S7 plan correction).
- T102 [US8] Create `ListPlatformsUseCase.execute(user_id, name) -> list[PlatformDTO]` in backend/app/application/use_cases/platforms/list_platforms.py (new). Pattern: backend/app/application/use_cases/companies/list_companies.py.
- T103 [US8] Route `GET /platforms?name=` (`CurrentUserDp`) → 200 `list[PlatformOut]` in backend/app/presentation/api/platform.py. Pattern: `api/company.py` `list_companies`.
- T104 [P] [US8] Integration tests:
  - backend/tests/integration/test_platforms.py, `GET /platforms`:
    - the user's own private rows are listed; another user's are not;
    - `?name=` is a case-insensitive substring match;
    - ordered by name;
    - a url-null row is listed; anonymous → 401.
  - backend/tests/integration/test_supports.py: untouched and green (content, shape, `id` order).
- T105 [US8] Frontend platform list:
  - `list(name?)` → `GET /platforms?name=` in frontend/src/services/interfaces/i-platform-service.ts and frontend/src/services/implementations/platform-service.ts;
  - `usePlatforms(name)`, key `["platforms", name]`, in frontend/src/hooks/use-platforms.ts (new);
  - frontend/src/hooks/use-create-platform.ts invalidates `["platforms"]` and `["supports"]`; a 409 still selects the colliding row.
- T106 [US8] Extract the whole picker from frontend/src/components/applications/platform-select.tsx into frontend/src/components/applications/catalog-select.tsx (new):
  - `Popover` + `Command`, search, the exact-match rule, "Create "X"" → name + URL form, notices, `OnlyYouBadge`;
  - new props `onSearchChange` (debounced server search, `?name=`) and `exactMatchReplacesCreate` (true for platforms, false for companies).
- T107 [US8] frontend/src/components/applications/platform-select.tsx becomes a thin wrapper on `CatalogSelect`:
  - options come from `usePlatforms(name)`, with `exactMatchReplacesCreate`;
  - behaviour is unchanged (R-017, R-020); platform-select.test.tsx stays green.
- T108 [US8] frontend/src/components/applications/company-select.tsx becomes a wrapper on `CatalogSelect` (R-028, R-029):
  - options from `services.companies.searchCompanies` (frontend/src/hooks/use-companies.ts);
  - `exactMatchReplacesCreate=false`: a matching name is listed first and Create is still offered;
  - confirm with a URL → `POST /companies` (frontend/src/hooks/use-create-company.ts) → the returned id is selected, 201 new or 200 reused (R-021);
  - blank URL → free text `{name, url: null}` (R-019);
  - "Only you" on private rows.
  Retire the separate "Company URL" input and `onCompanyUrlBlur`. Delete frontend/src/components/applications/company-select-options.tsx and its test once nothing uses them.
- T109 [US8] Create frontend/src/components/applications/form-section.tsx (new), on applika's `components/ui/card.tsx`: `title`, `description`, `icon`, `footer`, `as` heading level.
- T110 [US8] In frontend/src/components/applications/application-fields.tsx, three `FormSection`s, with the titles and descriptions from the PRD Assumptions (R-030..R-033):
  - "Role & company" ("What every application needs."):
    - Role | Source;
    - Company | Platform;
    - Job link;
    - Application date, on its own line, sheet only (`showDate`).
  - "Details" ("Optional — how you'd work and what it pays."):
    - Work mode | Experience level | Country;
    - Currency | Salary period;
    - Expected | Min | Max.
  - "Posting & notes" ("The job posting and anything you want to remember."):
    - Job description;
    - "Additional notes" (`observation`).
  - `as="h3"` in the sheet; on the page, the level that keeps its outline.
  - `useWatch` only.
- T111 [US8] Drop the URL-blur `POST /companies` path in frontend/src/components/applications/application-form-sheet.tsx, frontend/src/components/application-drafts/draft-application-step.tsx and frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx. The picker confirm now does it in both forms (PRD Assumption 2026-09-26). Payload shapes are unchanged: a company id, `{name, url: null}`, or the draft's `company_id`.
- T112 [P] [US8] Vitest:
  - frontend/src/components/applications/catalog-select.test.tsx (new):
    - a debounced `onSearchChange`;
    - an exact match replaces Create only when `exactMatchReplacesCreate`;
    - the Create form (name + URL), the notices, "Only you".
  - frontend/src/components/applications/company-select.test.tsx (new):
    - URL confirm → POST → the id is selected; a 200 reuse selects the same id;
    - blank URL → free text;
    - a listed match shows first and Create is still offered;
    - "Only you".
  - frontend/src/components/applications/platform-select.test.tsx and frontend/src/hooks/use-create-platform.test.tsx: green on `GET /platforms`.
  - frontend/src/components/applications/application-form-sheet.test.tsx:
    - the three section headings, in order;
    - the fields line by line (R-031..R-033); the date shows only in the sheet;
    - payloads unchanged.
  - frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx:
    - the same three sections, with no date;
    - the draft payload unchanged;
    - the picker mocks `GET /platforms`.
- T113 [US9] In backend/app/domain/repositories/admin_repository.py, `get_admin_platforms(search, visibility, sort_by, sort_order, page, per_page)` plus `_admin_platform_row_query` (new), copied from `get_admin_companies`/`_admin_company_row_query`:
  - `applications_count` counts applications under `NOT_DRAFT` (R-035);
  - an outer join on `users` gives `created_by`;
  - sort by `name|created_at|applications_count`.
- T114 [US9] Paginate `GET /admin/platforms`:
  - rewrite backend/app/application/use_cases/admin/platforms/list_platforms.py on backend/app/application/use_cases/admin/companies/list_companies.py;
  - `AdminPlatformRowSchema` and `PaginatedPlatformsSchema` (new) in backend/app/presentation/schemas/admin.py;
  - the route in backend/app/presentation/api/admin/platforms.py takes `search`, `visibility`, `sort_by`, `sort_order`, `page ≥ 1`, `per_page 1..100 (25)` and answers 200 paginated. The admin platform POST, PATCH, publish and DELETE are unchanged.
- T115 [P] [US9] Integration tests in backend/tests/integration/test_admin.py, `/admin/platforms`:
  - paging (`total`, `total_pages`), search, visibility, each sort;
  - `applications_count` excludes drafts: a platform used only by a draft shows 0, and its delete is still a 409 with its detail;
  - `created_by {id, username}`, and null;
  - non-admin → 403.
- T116 [US9] Frontend admin data:
  - `AdminPlatformRow`, `PaginatedPlatforms` in frontend/src/services/types/admin.ts;
  - a paginated `getPlatforms(params)` in frontend/src/services/implementations/admin-service.ts;
  - a paginated `useAdminPlatforms(params)` in frontend/src/hooks/use-admin.ts.
- T117 [US9] Extract the table from frontend/src/app/(protected)/admin/companies/companies-page.tsx into frontend/src/components/admin/catalog-table.tsx (new):
  - search, `VisibilityFilter`, paging (`PAGE_SIZE` 15), "Added by", Apps, Approve (`ApproveCatalogButton`), edit and delete;
  - the Status column for companies only.
  companies-page.tsx renders it, and companies-page.test.tsx stays green.
- T118 [US9] Platforms page (R-034):
  - move frontend/src/app/(protected)/admin/supports/supports-page.tsx → frontend/src/app/(protected)/admin/platforms/platforms-page.tsx (new), on `CatalogTable`: heading "Platforms", the Apps column, url-null rows, a delete 409 showing its detail;
  - frontend/src/app/(protected)/admin/platforms/page.tsx (new) is the shell;
  - frontend/src/app/(protected)/admin/supports/page.tsx → client `router.replace("/admin/platforms")`, so a saved link still works;
  - frontend/src/components/admin/admin-nav.tsx: "Supports" → "Platforms", `/admin/platforms`.
- T119 [P] [US9] Vitest in frontend/src/app/(protected)/admin/platforms/platforms-page.test.tsx (new, moved from supports-page.test.tsx):
  - the Apps column, search, visibility, paging, Added by;
  - Approve only on private rows; a 409 detail shows verbatim;
  - a url-null row; the delete refusal detail;
  - `/admin/supports` redirects.
  frontend/src/app/(protected)/admin/companies/companies-page.test.tsx stays green on `catalog-table`.
- T120 [US9] E2E:
  - frontend/e2e/smoke.spec.ts: `/admin/supports` → `/admin/platforms`, heading "Platforms", plus a check that `/admin/supports` lands on `/admin/platforms`;
  - frontend/e2e/admin-gating.spec.ts: `/admin/supports` → `/admin/platforms` in the path list.
- T121 [US8] E2E in frontend/e2e/application-with-cv.spec.ts:
  - step 1 goes through the new company picker: "Create "X"" → name, blank URL → confirm → free text; a resume still shows the name;
  - the cleanup reads the paginated `/admin/platforms?search=E2E Private` `.items`.
- T122 [US8] Backend docs:
  - backend/scripts/seed_mock_data.py calls `GET /platforms` beside `/supports` and asserts the same visible set;
  - backend/CLAUDE.md: add `GET /platforms` to the Companies and Platforms route table; `/admin/platforms` is paginated with a drafts-free `applications_count`; `/supports` is unchanged;
  - backend/CHANGELOG.md `[Unreleased]`:
    - Added `- GET /platforms?name=: visible platforms, searchable, ordered by name (web picker).`
    - Changed `- GET /admin/platforms paginated with search, visibility, sort and applications_count (drafts excluded); /supports unchanged.`
  - No CLI entry: no CLI route is touched.
- T123 [US8] frontend/CLAUDE.md:
  - `catalog-select.tsx` (the company picker is the platform picker), `form-section.tsx` and the three sections, `catalog-table.tsx`, `use-platforms.ts`;
  - `/admin/platforms` and the `/admin/supports` redirect;
  - repoint the `admin/supports/supports-page.tsx` pointers, and the comments in the discord-webhooks page and its test, to `admin/platforms/platforms-page.tsx`.
- T124 [US8] Gates, then close:
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; touched files clean), `uv run pytest . --cov=app` (≥ 90%), `uv run pytest tests -k "steps or finalize or supports"`;
  - CLI: `make test` in cli (untouched, green);
  - frontend: `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - E2E: `scripts/e2e.sh e2e/application-with-cv.spec.ts e2e/smoke.spec.ts e2e/admin-gating.spec.ts` green; no `applika-e2e` container left.
  The tip is not a merge point.
AC:
- In the web app, in the side sheet and in the new page, the company field uses the same picker as the platform field and behaves the same way: it searches the companies the user sees, marks private ones "only you", and offers to add a new one with a name and a URL.
- Adding a company with a URL in the picker saves it, private, as soon as the user confirms it, and selects it; a company the user already sees with the same name and URL is reused instead (R-021). Adding one without a URL keeps the name as free text on that application only (R-019).
- The application form, in the side sheet and in the new page, groups its fields into three titled sections: first what every application needs, then the optional details, then the job posting and notes.
- The first section shows, one line each: role and source; company and platform; job link; and, in the side sheet only, the application date.
- The second section shows, one line each: work mode, experience level and country; currency and salary period; expected, minimum and maximum salary.
- The third section shows the job description first and the additional notes after it.
- The admin "Supports" page becomes "Platforms" and lists platforms with the same table the companies page uses: search, visibility filter, paging, who added each, Approve on private rows, and how many applications use each platform.
- A platform's application count, like a company's, leaves drafts out.
- The system offers the platforms a user sees as a list of their own, searchable by name, the way it offers companies, and the web picker reads that list; the support data that command-line clients read keeps its content and shape.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `backend/CHANGELOG.md` records every backend change. (.claude/rules/changelogs.md 2)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K7 — S8 with-CV date field, Date | Job link, card-free form on both forms, wide sheet + larger title, Applications | Drafts tabs   side: both   covers: R-003 (rewritten), R-011 (rewritten), R-031 (rewritten), R-037, R-038, R-039, R-040, R-041, R-042, R-043, R-044, R-045, R-046, R-047, R-048, R-049, R-050   deps: K6
Owner's words:
- Second addendum, 2026-09-26: "where is application date in the form to create an application with CV, also, you limited the form to max-w-4xl and i need to remove this, put application date and job link in a single line, for application create form with cv and without, also, increace the sheet component max width to 4xl (the sheet used to edit and create an application without a cv). Increace the sheet header front "Edit application" and "New Application". Now in the page where lists all my applications, create a tab to split my normal applications with drafts"
- Change before approval, 2026-09-26: "Redesign the “New application with CV” page to be cleaner, more compact, and card-free. - Remove the three large card containers around “Role & company”, “Details”, and “Posting & notes”. - Keep all existing fields, behavior, validation, state, and functionality unchanged. - Use section titles + muted descriptions for hierarchy, without icons or nested cards. - Separate sections with whitespace and subtle horizontal dividers. - Keep the existing dark theme and shadcn/ui components. - Desktop: - Role/Source → 2 columns - Company/Platform → 2 columns - Application Date/Job link → 2 columns - Work mode/Experience/Country → 3 columns - Currency/Salary period → 2 columns - Expected/Min/Max → 3 columns - Textareas → full width - Mobile: collapse everything to a single column with no horizontal overflow. - Keep Cancel/Continue actions at the bottom. - Reduce unnecessary vertical spacing while maintaining good readability. The final result should feel like one continuous Linear/Vercel-style form rather than three separate cards. Only change the UI/layout. Do not change application logic."
- Correction, 2026-09-26: "apply this to edit and create without a cv"
Clarified (2026-09-26):
- "Add date field, default today (Recommended)". Option text: step 1 shows Application date beside Job link, preset to today and saved with the draft by auto-save; finishing uses that date, still refusing future dates; resuming a draft keeps the date; small backend change: the draft body gains `application_date` (column already exists, no migration).
- "Do not change application logic" binds the redesign only; the draft date change stays.
Touch:
- backend/app/presentation/schemas/application_draft.py
- backend/app/application/dto/application_draft.py
- backend/app/presentation/api/application_draft.py
- backend/app/domain/repositories/application_repository.py
- backend/app/application/use_cases/application_drafts/create_draft.py
- backend/app/application/use_cases/application_drafts/update_draft.py
- backend/app/application/use_cases/application_drafts/finish_draft.py
- backend/tests/unit/test_application_drafts.py
- backend/tests/integration/test_application_drafts.py
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md
- backend/CHANGELOG.md
- frontend/src/components/applications/form-section.tsx
- frontend/src/components/applications/application-fields.tsx
- frontend/src/components/applications/application-fields.test.tsx
- frontend/src/components/applications/application-form-sheet.tsx
- frontend/src/components/applications/application-form-sheet.test.tsx
- frontend/src/components/ui/sheet.tsx
- frontend/src/components/ui/tabs.tsx (new)
- frontend/src/components/application-drafts/draft-application-step.tsx
- frontend/src/components/application-drafts/draft-footer-actions.tsx
- frontend/src/components/application-drafts/draft-page-states.tsx (read: the Cancel reuses its "Back to applications" target and warning)
- frontend/src/components/application-drafts/draft-copy.ts
- frontend/src/components/application-drafts/drafts-section.tsx
- frontend/src/components/application-drafts/drafts-section.test.tsx
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx
- frontend/src/services/types/application-drafts.ts
- frontend/src/app/(protected)/applications/applications-page.tsx
- frontend/src/app/(protected)/applications/applications-page.test.tsx
- frontend/e2e/application-with-cv.spec.ts
- frontend/CLAUDE.md
Pattern:
- backend/app/presentation/api/application.py (`job_description` is sticky on PUT through `model_fields_set`: an absent key keeps the stored value)
- backend/app/application/validators/application_date.py (`ensure_not_in_future`)
- frontend/src/components/applications/application-fields.tsx
- frontend/src/components/ui/date-picker.tsx (`maxDate`)
- frontend/src/components/ui/sheet.tsx (`size` presets)
- shadcn/ui `tabs` (new-york, unified `radix-ui`)
- frontend/CLAUDE.md "### Forms" (`useWatch`), "### Date Inputs", "### UI Components", "### App shell"; ADR-0006
Contract:
- `DraftInput` gains `application_date?: date`:
  - beyond UTC today + 1 → 422 (`ensure_not_in_future`);
  - absent on POST → server today;
  - absent on PUT → the stored date is kept.
- `Draft` gains `application_date: date`. `DraftSummary` is unchanged.
- `POST /applications/drafts/{id}/finish`: no body, `{}` or `{application_date}` → 200 `Application`.
  - Dated with the body date when given (kept for the shipped web), else the draft's stored date.
  - | 404 | 422 'Pick a master CV before finishing' | 422 for a date beyond UTC today + 1.
- Unchanged: `/applications*`, `/supports`, `/platforms`, `/companies`, admin routes. No CLI route is touched.
Release gate: Release B, no migration. This tip is not a merge point: Release B is the K5 tip.
Steps:
- T125 [US10] Start on `integration/0010-application-with-cv-drafts`, after the K6 tip. Confirm no migration: one head, `3b78c3cd2a71`.
- T126 [US10] Schemas and DTOs:
  - in backend/app/presentation/schemas/application_draft.py: `DraftInput.application_date: date | None = None`, `Draft.application_date: date`, `DraftFinish.application_date: date | None = None`;
  - in backend/app/application/dto/application_draft.py: `DraftInputDTO`, `DraftDTO`, `DraftFinishDTO` likewise;
  - rewrite both module docstrings that say a draft is never asked for a date.
- T127 [US10] In backend/app/domain/repositories/application_repository.py, `create_draft` sets `application_date = data.application_date or date.today()`.
- T128 [US10] In backend/app/application/use_cases/application_drafts/create_draft.py and backend/app/application/use_cases/application_drafts/update_draft.py:
  - apply `ensure_not_in_future(application_date, 'application_date')` when the date is given;
  - update sets the date only when given; an absent key keeps the stored date, the way `job_description` works on `PUT /applications/{id}`;
  - `to_draft_dto` (create_draft.py) adds the field.
- T129 [US10] Finish:
  - in backend/app/application/use_cases/application_drafts/finish_draft.py: `day = data.application_date or application.application_date`; `ensure_not_in_future(day)`; set it; flip `is_draft`;
  - in backend/app/presentation/api/application_draft.py: `_to_input_dto` passes `application_date`, and drops the key when it is absent from `model_fields_set` on PUT; the finish route takes `payload: DraftFinish | None = None` (no body, `{}` or `{application_date}`).
- T130 [P] [US10] Tests.
  - backend/tests/unit/test_application_drafts.py:
    - a finish body date wins, else the stored date is used; a future date → 422 either way;
    - `DraftInput` works with or without the date.
  - backend/tests/integration/test_application_drafts.py:
    - create with a date → it is stored; without one → server today;
    - a future date → 422 on POST and on PUT, and nothing is saved;
    - a PUT without the key keeps the stored date; `Draft` returns the date;
    - finish with no body → the stored date; `{}` is accepted; a body date overrides; a future body date → 422;
    - a draft created without a date finishes dated with its creation day (the pre-S8 edge case).
- T131 [US10] Backend docs and changelog:
  - backend/scripts/seed_mock_data.py: `seed_drafts()` sends `application_date` and finishes one draft with no body;
  - backend/CLAUDE.md: in "Application drafts", the date is saved with the draft (POST, or server today; PUT keeps it when absent) and the finish body is optional; update the Seed Script Rule bullet;
  - backend/CHANGELOG.md `[Unreleased]` Changed: `- drafts carry application_date (optional on POST/PUT; absent on POST = server today, absent on PUT = kept; beyond UTC today + 1 = 422); POST /applications/drafts/{id}/finish body optional, the stored date is used when absent.`
  - No CLI entry: drafts are not a CLI route.
- T132 [US8] Flatten frontend/src/components/applications/form-section.tsx for its one caller (R-043..R-045):
  - a `<section>`, no `Card`, no `icon` prop;
  - the heading (`as` h2 on the page, h3 in the sheet) plus a muted `<p>` description;
  - every section after the first gets `border-t border-border/60 pt-5`.
- T133 [US8] Layout in frontend/src/components/applications/application-fields.tsx (R-046, R-047, R-049, R-050):
  - drop the three section icons;
  - sections `space-y-5`, rows `gap-3`;
  - `ROW2`/`ROW3` stay `grid-cols-1` → `@md/app-form:grid-cols-2|3`, with R-046's counts on each line; cells `min-w-0`; textareas full width;
  - no field, default, validation, payload, auto-save or picker change.
- T134 [US8] Step 1 (R-038, R-048):
  - drop `className="max-w-4xl"` in frontend/src/components/application-drafts/draft-application-step.tsx, and the l.90 comment in application-fields.tsx;
  - frontend/src/components/application-drafts/draft-footer-actions.tsx: step 1's bottom row is an outline "Cancel" (add a `cancel` entry to `DRAFT_COPY` in draft-copy.ts; today's `cancel` belongs to `DRAFTS_SECTION_COPY`, the delete dialog), with the same target and unsaved-typing warning as "Back to applications" in draft-page-states.tsx, then "Continue to CV". An existing draft stays.
- T135 [US8] Sheet (R-039, R-040, R-048):
  - add a `size="wide"` preset in frontend/src/components/ui/sheet.tsx: `w-full p-6 sm:max-w-4xl` (presets beat `className`);
  - frontend/src/components/applications/application-form-sheet.tsx uses `size="wide"`; `SheetTitle` adds `font-display text-xl`, with the same words;
  - the footer (Cancel | submit) is unchanged.
- T136 [P] [US8] Vitest (jsdom has no layout, so assert structure and classes; the geometry is checked in the E2E):
  - frontend/src/components/applications/application-fields.test.tsx:
    - the three headings and their descriptions;
    - no `[data-slot="card"]` and no section icon;
    - a divider between sections;
    - the grid class of each line, per R-046.
  - frontend/src/components/applications/application-form-sheet.test.tsx:
    - the `wide` preset and the title class;
    - payloads unchanged; the date is required.
- T137 [US10] Date line (R-037, R-031):
  - in frontend/src/components/applications/application-fields.tsx, line 3 of "Role & company" is Application date | Job link (`DatePickerInput`, `maxDate` today), in both forms;
  - retire the `showDate` prop; draft-application-step.tsx stops passing `showDate={false}`.
- T138 [US10] Draft page date (R-003):
  - frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx: the draft schema and defaults gain `application_date`:
    - a new draft is preset to `localCalendarDay()` (draft-copy.ts);
    - a resumed draft shows its stored date; a pre-S8 draft shows its start day;
    - every auto-save POST and PUT sends it, and finish sends the same value;
    - a future date is not offered (`maxDate`); a 422 from the API shows "Not saved" and saves nothing until it is fixed.
  - `DraftInput` and `Draft` gain `application_date` in frontend/src/services/types/application-drafts.ts.
- T139 [P] [US10] Vitest in frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx:
  - the date is preset to the local day (fake clock near midnight, with a UTC offset);
  - a resume keeps the stored date;
  - POST, PUT and finish carry the date;
  - the date shows before the job link;
  - Cancel and Continue to CV sit at the bottom;
  - step 1 has no width class.
- T140 [US10] Add frontend/src/components/ui/tabs.tsx (new) with `pnpm dlx shadcn@latest add tabs` (new-york, unified `radix-ui`).
- T141 [US10] Tabs in frontend/src/app/(protected)/applications/applications-page.tsx:
  - current cycle → `Tabs` "Applications" | "Drafts (n)" (R-041). "Applications" is selected on every open, and holds the list, filters and empty state as today. The tab is not remembered.
  - past cycle → no `Tabs` and no drafts; the list only (R-042).
- T142 [US10] frontend/src/components/application-drafts/drafts-section.tsx becomes the Drafts tab body:
  - no heading of its own;
  - rows keep company, role, last saved, Resume, Delete (R-011);
  - with no drafts: "No drafts yet." plus a "New with CV" link (draft-copy.ts), instead of `null`;
  - deleting the last draft leaves the tab on its empty state.
- T143 [P] [US10] Vitest:
  - frontend/src/app/(protected)/applications/applications-page.test.tsx: the tabs and the count in the current cycle; Applications selected on open; Drafts lists the drafts; no tabs on a past cycle;
  - frontend/src/components/application-drafts/drafts-section.test.tsx: the empty-state text and link; the rows; Resume and Delete; deleting the last draft keeps the empty state.
- T144 [US10] E2E in frontend/e2e/application-with-cv.spec.ts:
  - go through the Drafts tab, replacing the `[data-slot="drafts-section"]` checks (l.207);
  - set a past date in step 1; the finished application shows that date;
  - at 390px width, step 1 and the side sheet both have `scrollWidth <= clientWidth` (R-047).
  Every other spec that opens the sheet stays green in the T146 full run (`cv-builder.spec.ts` "Edit Application").
- T145 [US8] frontend/CLAUDE.md:
  - "Application drafts": the tabs, the date field, step 1's Cancel;
  - "Company picker = platform picker…": the flat `FormSection`, no card, container columns;
  - "UI Components": `SheetContent` `size="wide"`.
- T146 [US8] Gates, then close:
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; touched files clean), `uv run pytest . --cov=app` (≥ 90%), `uv run pytest tests -k "steps or finalize or supports"`;
  - CLI: `make test` in cli;
  - frontend: `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - E2E: the full `scripts/e2e.sh` green; no `applika-e2e` container left.
  The tip is not a merge point.
AC:
- (rewritten 2026-09-26) Step 1 of this flow asks for the application date, preset to the user's own calendar day; the date is saved with the draft like every other field and kept when the draft is resumed, and finishing dates the application with it. The system refuses an application date later than the user's today.
- (rewritten 2026-09-26) The Drafts tab of the applications page (R-041) lists the user's drafts with company, role and when each was last saved, with Resume and Delete on each.
- (rewritten 2026-09-26) The first section shows, one line each: role and source; company and platform; then the application date and the job link (R-037).
- In both forms, the side sheet and step 1 of the new page, the application date and then the job link share the third line of the first section.
- Step 1 of the new page puts no width limit of its own on the form; the form fills the page's content column.
- The side sheet that creates and edits an application without a CV opens wider, up to the 4xl width the owner named.
- The side sheet's title, "New Application" or "Edit Application", is shown in larger type than today.
- While the user views the current cycle, the applications page shows two tabs, "Applications" and "Drafts", the Drafts tab carrying the number of drafts. "Applications" is selected when the page opens and holds the list, its filters and its empty state as today. The Drafts tab replaces the former Drafts section; with no drafts it stays visible and says there are none, with a way to start a new application with CV.
- While the user views an archived cycle, the applications page shows no tabs and no drafts, only that cycle's applications, as today.
- The three sections read as one continuous form: no card or box around any section, and no card inside a section.
- Each section shows its title and a muted description above its fields, with no icon.
- Whitespace and a subtle horizontal divider line separate one section from the next.
- On a wide form the lines lay out in columns: role and source, two; company and platform, two; application date and job link, two; work mode, experience level and country, three; currency and salary period, two; expected, minimum and maximum salary, three. The job description and the additional notes span the full width.
- On a narrow form every line collapses to a single column, and nothing on the form scrolls sideways.
- The actions stay at the bottom of the form: Cancel and the create or save action in the side sheet; Cancel and Continue to CV on step 1 of the new page.
- The form leaves less vertical space than today between sections, lines and fields, while labels, values, hints and error messages stay easy to read.
- The redesign changes only look and layout: every field, default, validation message, auto-save, draft creation, picker behavior and submitted value stays as it is, and the form keeps the app's dark theme and its existing interface components.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `backend/CHANGELOG.md` records every backend change. (.claude/rules/changelogs.md 2)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K5 — Closing 0010 Release B: full gate, E2E, ADRs, as-built notes, by-hand walk   side: both   covers: —   deps: K4, K6, K7
Owner's words: "i would like to change how job applications is created, today i have to create an application entry and then attach a cv to this application, i want to add option to the user to create a job application and a cv together (this option will be available only in the web app, no support to the cli), when the user clicks to create an entry with a cv, instead of opening the sheet as is today, open a new page where the user selects a master cv to use as template, let the user edit the cv to the job and then in the next step the user fills the data about the application, like company, role name, platform, etc." "I also want in the same plan to copy the same behavior in company to platform (when creating a new job application) today, all platforms is defined by the admin, and i want to able to the public add new platforms."
Touch:
- docs/plan/0010-application-with-cv-drafts-private-catalogs.md (header line only: l.7 reads "0014 (Proposed, this plan)" again after the second rewrite; the ADR is Accepted)
- docs/prd/0002-applications-steps-finalize.md (as-built notes)
- docs/prd/0004-admin-supports-companies.md (as-built notes)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0009-discord-account-link.tasks.md K10
Release gate: the K5 tip is Release B, tagged `0010-release-b`. The owner merges it only after confirming that A's `alembic upgrade head` ran in prod.
Steps:
- T091 Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T092 Target gates from .claude/rules/quality-gates.md:
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; every file K1..K4, K6 and K7 touched is clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`.
- T093 Run the full scripts/e2e.sh on a stack migrated through the K1 revision. Confirm that the `e2e` job in .github/workflows/frontend-ci.yaml runs it. It must include:
  - `application-with-cv.spec.ts`:
    - its step 1 goes through the new company picker (K6 T121);
    - it uses the Drafts tab, sets a past date in step 1 and sees it on the finished application (K7 T144);
    - at 390px width, step 1 and the side sheet have `scrollWidth <= clientWidth` (R-047, K7 T144);
  - `smoke.spec.ts` and `admin-gating.spec.ts` on `/admin/platforms`, with the old `/admin/supports` path landing on Platforms (K6 T120);
  - every spec that opens the side sheet (`cv-builder.spec.ts` "Edit Application"), green on the wide, card-free sheet.
  Cheaper layers carry what the E2E does not:
  - admin Approve and catalog visibility: backend/tests/integration/test_admin.py, test_companies.py, test_supports.py, test_platforms.py; companies-page.test.tsx, platforms-page.test.tsx;
  - drafts kept out of read models: test_statistics.py, test_quinzenal_reports.py, test_cycles.py, test_agenda.py, test_admin.py, test_applications.py;
  - a failed save: use-debounced-autosave.test.ts;
  - draft delete and the generic-route 404s: drafts-section.test.tsx, test_application_drafts.py;
  - S7 (K6):
    - company picker = platform picker (R-028, R-029): catalog-select.test.tsx, company-select.test.tsx, platform-select.test.tsx;
    - the three form sections and the line order (R-030..R-033): application-form-sheet.test.tsx, new-with-cv-page.test.tsx;
    - the Platforms page and a drafts-free count (R-034, R-035): platforms-page.test.tsx, test_admin.py `/admin/platforms`;
    - `GET /platforms` with `/supports` unchanged (R-036): test_platforms.py, test_supports.py.
  - S8 (K7):
    - the with-CV date (R-003 rewritten), saved, resumed, and used at finish with an optional body: test_application_drafts.py (unit and integration), new-with-cv-page.test.tsx;
    - Date | Job link and the line order (R-031 rewritten, R-037): application-fields.test.tsx, application-form-sheet.test.tsx;
    - the card-free form, titles and descriptions, dividers, column classes and actions at the bottom (R-043..R-046, R-048, R-050): application-fields.test.tsx, application-form-sheet.test.tsx, new-with-cv-page.test.tsx. The single column with no sideways scroll (R-047) is checked in the E2E above.
    - no width limit on step 1, the wide sheet and its larger title (R-038..R-040): new-with-cv-page.test.tsx, application-form-sheet.test.tsx;
    - the Applications | Drafts tabs, the empty state and no tabs on a past cycle (R-011 rewritten, R-041, R-042): applications-page.test.tsx, drafts-section.test.tsx;
    - the reduced spacing (R-049) is visual and is checked in the T098 walk.
- T094 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` is empty;
  - no network or volume from docker-compose.e2e.yml;
  - no testcontainers;
  - the owner's dev containers are untouched.
- T095 ADRs:
  - docs/adr/0014-private-catalog-rows-and-draft-applications.md reads Accepted, and its Decision matches the build: the 409 names the row; `created_by` is kept; drafts are out of every read model; reference counts still count drafts.
  - 0001, 0003, 0004, 0005, 0006 and 0009 read Accepted.
  - Fix the plan header line: l.7 reads "0014 (Proposed, this plan)" again after the second 2026-09-26 rewrite; set it to Accepted 2026-09-25.
  - Neither amendment drafted an ADR (plan: "Amendments force no new ADR").
- T096 Rule checks:
  - `grep -nE "op\.drop_(column|table)"` on the K1 revision → no hit in `upgrade()`;
  - `grep -rn "_old" backend/app/` → none;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`;
  - `uv run pytest tests/integration -k migration`;
  - `uv run pytest tests -k "steps or finalize or supports"`;
  - the changelogs verify command and the commit-format verify command;
  - backend/CHANGELOG.md carries the K6 Added and Changed lines and the K7 Changed line; cli/CHANGELOG.md has no K6 or K7 entry (no CLI route touched);
  - the `/supports` answer has the same content, shape and `id` order as before K6 (test_supports.py).
- T097 PRD as-built notes:
  - docs/prd/0002-applications-steps-finalize.md:
    - R-001: the company and platform must be visible; `{name,url}` reuses a visible match, else creates a private row;
    - R-002: drafts are never listed (the web shows them only in the Drafts tab of the applications page, K7).
  - docs/prd/0004-admin-supports-companies.md:
    - R-004: admin-screen rows are public; Approve; the admin "Supports" page is now "Platforms" (`/admin/platforms`, paginated, with application counts that leave drafts out; `/admin/supports` redirects);
    - R-008: `/supports` lists visible platforms, with a nullable `url` and `is_public`; its content and shape are otherwise unchanged; the web reads `GET /platforms?name=`;
    - R-009: `/companies` lists visible rows, plus the new POST;
    - R-010: uniqueness is scoped per ADR-0014.
- T098 Walk through by hand on a real stack (dev compose, migrated), with users A and B and an admin:
  - Before the draft exists:
    - A types a company only → reload → a warning;
    - leaving anyway → no draft.
  - Draft and auto-save:
    - company + role + a new private platform → "Saved" within about 1 s;
    - close the tab → the Drafts tab of the applications page shows the draft → Resume → step 1.
  - Step 2:
    - no master CV → the invitation;
    - create a master → pick it → edit → the diff shows → delete the copy → pick another master;
    - back to step 1, change the role → step 2 still has the copy.
  - Save failure:
    - devtools offline → type → "Not saved" → back online → Retry → "Saved";
    - clearing the platform → "Not saved: company, role and platform are required".
  - Finish:
    - before the CV copy → the missing list;
    - Finish → `/applications` with a confirmation; the application is listed with its copy, dated with the step 1 date (preset to the local day: check near midnight with a browser timezone ahead of UTC).
  - Read models:
    - statistics, dashboard, reports, agenda, cycles, admin stats and user counts are unchanged by the drafts;
    - a new cycle keeps the drafts; a draft finished later joins the current cycle.
  - User B:
    - does not see A's private rows;
    - B's own same-name private row → both kept;
    - curl with A's platform id → 404.
  - Admin:
    - adding through the user flow → "Only you";
    - on the admin screen: filter Private → Added by A → Approve → B sees it;
    - Approve on a public duplicate → refused, naming the row;
    - admin-screen create → public at once;
    - deleting a private platform that a draft uses → refused.
  - Delete A's account → A's private rows stay, with Added by empty.
  - S7, company picker, in the side sheet and on the new page:
    - search shows "Only you" on A's private companies;
    - Create with a URL → saved private and selected; the same name and URL again → the existing row is reused;
    - a blank URL → free text, in no list;
    - a name matching a listed company → the match is listed first and Create is still offered.
  - S7 + S8, form layout, in both forms (the side sheet for create and edit, and step 1): the three titled sections, one line each:
    - Role | Source; Company | Platform; Application date | Job link;
    - Work mode | Experience level | Country; Currency | Salary period; Expected | Min | Max;
    - Job description, then Additional notes.
  - S8, card-free form (R-043..R-050), in both forms:
    - no cards or boxes; each section shows a title and a muted description, with no icon; a thin divider and whitespace between sections;
    - on a wide form, columns as above; at a phone width (390px), a single column and no sideways scroll;
    - visibly tighter vertical spacing that still reads easily;
    - dark theme kept;
    - every field, default, validation message, picker and auto-save behaves as before.
  - S8, with-CV date (R-003):
    - step 1 shows Application date preset to today; set it to a past date → "Saved";
    - reload/resume keeps the date; a future date is not offered;
    - finish → the application carries that date;
    - a draft made before S8 shows the day it was started.
  - S8, step 1 layout: no width limit, and the form fills the content column; Cancel and Continue to CV at the bottom; Cancel with unsaved typing warns, and an existing draft stays.
  - S8, side sheet: it opens up to 4xl wide; the "New Application" and "Edit Application" titles are larger; Cancel and the submit button are at the bottom.
  - S8, applications page tabs:
    - "Applications" is selected on open, with the list, filters and empty state as before;
    - "Drafts (n)" lists the drafts with Resume and Delete; deleting the last draft shows "No drafts yet." with a "New with CV" link;
    - an archived cycle shows no tabs and no drafts.
  - S7, admin Platforms page:
    - the nav reads "Platforms"; a saved `/admin/supports` link lands there;
    - search, the visibility filter, paging, Added by;
    - the Apps count leaves drafts out: a platform only drafts use shows 0, and its delete is refused with the reason shown;
    - Approve on a private row.
  - CLI: `uvx applika-cli==0.1.4 applications list`, then 0.2.0 and 1.0.0:
    - no drafts listed;
    - `applications new` with a new company works;
    - the platform list works with a url-null platform and is unchanged by K6 (`/supports`).
  - Both themes, desktop and mobile.
- T147 Fix (owner order 2026-09-26: amend K5 to fix this bug; found in K7): `frontend/src/components/applications/application-form-sheet.tsx:48` refuses the user's own today as "in the future" when their local day is ahead of UTC. Use `isNotFutureCalendarDay()` (`components/application-drafts/draft-copy.ts`, or a shared lib), same message; vitest at a UTC+ offset (today passes, tomorrow fails, fails on revert). New AC 6.
- T148 Fix (owner order 2026-09-26: fix it in K5, then tag; found in the K5 walk): offline draft autosave stays 'Saving...' (TanStack mutations pause offline). `networkMode: "always"` on the draft autosave mutations; vitest offline test that fails on revert; re-check with setOffline; tag on the tip after it. New AC 7.
- T099 Record at close:
  - Tag the K5 tip `0010-release-b`. The owner merges it only after confirming A ran in prod. No env change.
  - Rollback B = the previous image. Drafts then show as applications with a placeholder date, and private rows show to all until the upgrade runs again.
  - Rollback A, after B = `alembic downgrade 583226ca46bc`.
  - The agent never touches prod.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty ≤ 171 with changed files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0014, Accepted 2026-09-25; bound 0001, 0003, 0004, 0005, 0006, 0009 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (application-with-cv.spec.ts with the S8 Drafts tab, past-date and 390px no-overflow checks, plus the S7 changes to smoke.spec.ts and admin-gating.spec.ts, via scripts/e2e.sh) runs inside the gate and is green; admin Approve, catalog visibility, drafts out of read models, the failed-save path, the company picker, the three form sections, the admin Platforms page, the with-CV date, the card-free layout, the wide sheet and the Applications | Drafts tabs are carried by the unit, integration and vitest layers named in T093.
- By-hand walk of the feature on a real stack done.
- No new feature work.

## Matrix
| R | K |
|---|---|
| R-001 | K4 |
| R-002 | K3, K4 |
| R-003 | K3, K4 (original text); K7 (rewritten 2026-09-26) |
| R-004 | K3, K4 |
| R-005 | K3, K4 |
| R-006 | K3, K4 |
| R-007 | K3, K4 |
| R-008 | K4 |
| R-009 | K3, K4 |
| R-010 | K3, K4 |
| R-011 | K3, K4 (original text); K7 (rewritten 2026-09-26) |
| R-012 | K3, K4 |
| R-013 | K3, K4 |
| R-014 | K3 |
| R-015 | K3 |
| R-016 | K3 |
| R-017 | K2, K4 |
| R-018 | K2, K4 |
| R-019 | K2, K3, K4 |
| R-020 | K2, K4 |
| R-021 | K2, K4 |
| R-022 | K2, K3 |
| R-023 | K2, K4 |
| R-024 | K2 |
| R-025 | K1, K2 |
| R-026 | K1, K2, K4 |
| R-027 | K2 |
| R-028 | K6 |
| R-029 | K6 |
| R-030 | K6 |
| R-031 | K6 (original text); K7 (rewritten 2026-09-26) |
| R-032 | K6 |
| R-033 | K6 |
| R-034 | K6 |
| R-035 | K6 |
| R-036 | K6 |
| R-037 | K7 |
| R-038 | K7 |
| R-039 | K7 |
| R-040 | K7 |
| R-041 | K7 |
| R-042 | K7 |
| R-043 | K7 |
| R-044 | K7 |
| R-045 | K7 |
| R-046 | K7 |
| R-047 | K7 |
| R-048 | K7 |
| R-049 | K7 |
| R-050 | K7 |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. Checked sentence by sentence:
- "i would like to change how job applications is created, … like company, role name, platform, etc."
  - The flow creates the application and CV together: K3 (API) and K4 (page).
  - "only in the web app, no support to the cli": K4 is web only; K3 R-015 leaves the CLI unchanged; the CLI is a PRD non-goal.
  - "instead of opening the sheet … open a new page": K4 T066, T070.
  - "selects a master cv … edit the cv to the job": K4 T068.
  - "in the next step the user fills the data": K4 T067. The order was reversed by the owner's own 2026-09-25 clarification (data first, CV second), and it is built in the clarified order.
- "I also want in the same plan to copy the same behavior in company to platform … i want to able to the public add new platforms."
  - Schema: K1.
  - `POST /platforms` and private rows: K2.
  - The picker in the sheet and in step 1: K4.
  - Admin Approve, from the clarification: K2 (API) and K4 (screens).
- Addendum, 2026-09-26 (all K6):
  - "i liked how you did the select input for platform, do the same for company as well, same select component with same behavior." → R-028, R-029: T106 (`catalog-select.tsx`), T107, T108.
  - "Change the order of the inputs when creating an application with and without a CV." → R-030, R-031, in both forms: T110, T111.
    - "1. Role name and Source in a single line …" → the first line of "Role & company" (T110).
    - "2. Company and Platform in a single line as well" → its second line (T110).
    - "3. job link moved to the third line in the form" → its third line (T110).
  - Three form categories (sections), the first the base every application needs → R-030, R-032:
    - `form-section.tsx`: T109;
    - the "Details" section, with work mode, experience level and country on one line: T110.
  - "As third section the user first can paste the job description and then Additional notes." → R-033: T110.
  - "Now to the admin page, instead of supports, change to Platforms and change the table component … to the component used in companies, also display how mahy applications that platform have" → R-034, R-035: T113..T119.
  - "also create a new route to return the plaftorms instead of using the /suports api route (same for get /companies)" → R-036: T101..T105.
    - "(same for get /companies)": `GET /companies?name=` already exists (K2), and the company picker reads it (T108). The owner's route answer ("GET /platforms + paginated admin list") asks for no new companies route.
- Second addendum, 2026-09-26 (all K7):
  - "where is application date in the form to create an application with CV" → R-003 rewritten: T126..T131 (API), T137, T138.
  - "you limited the form to max-w-4xl and i need to remove this" → R-038: T134.
  - "put application date and job link in a single line, for application create form with cv and without" → R-037, R-031 rewritten: T137, in both forms.
  - "increace the sheet component max width to 4xl (the sheet used to edit and create an application without a cv)" → R-039: T135.
  - "Increace the sheet header front "Edit application" and "New Application"." → R-040: T135.
  - "create a tab to split my normal applications with drafts" → R-041, R-042, R-011 rewritten: T140..T143.
- Change before approval, 2026-09-26 (all K7):
  - remove the three cards → R-043: T132;
  - titles and muted descriptions, no icons → R-044: T132, T133;
  - whitespace and dividers → R-045: T132;
  - the desktop column counts, and full-width textareas → R-046: T133;
  - mobile single column, no horizontal overflow → R-047: T133, T144 (390px);
  - Cancel/Continue at the bottom → R-048: T134, T135;
  - less vertical spacing, still readable → R-049: T133;
  - keep fields, behavior, validation, state, the dark theme and shadcn/ui, and "Only change the UI/layout. Do not change application logic." → R-050: T133. Per the clarification, the draft date change (R-003) stays.
- Correction, 2026-09-26: "apply this to edit and create without a cv" → both forms share `application-fields.tsx` and `form-section.tsx` (T132, T133), and the sheet is covered by T135, T136 and T144.
