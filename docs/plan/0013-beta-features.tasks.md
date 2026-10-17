# Tasks 0013 — Beta features: jobs behind a per-feature allowlist

PRD: docs/prd/0013-beta-features.md   Plan: docs/plan/0013-beta-features.md
ADRs bound: 0018 (drafted by this feature, Accepted 2026-10-14); 0003, 0004, 0005, 0014, 0016, 0017. All read Accepted (checked 2026-10-14).

## Order
K1 Release A migration → K2 backend: access rule, jobs gate, /users/me/features, /admin/features → K3 web: hide the job board, Beta label, workspace rule → K4 admin Features screens, release/move back, own access, beta-features E2E → K5 closing (Release B)

- **Slices.** K1..K5, set 2026-10-14.
- **Cap.** Owner, 2026-10-14: "too many tickets, up to 5 only". Set is 5. K2, K3, K4 run about two days each; the one-day sizing yields to the cap. Slices stay vertical: one backend slice, two web slices, each testable alone.
- **Stories.** Slice grouping wins over one-story-one-slice (owner precedent, 0012; cap 2026-10-14). Stories stay `[USn]` tags: K2 [US1..US5], K3 [US1, US2, US6, US7], K4 [US3, US4, US5].
- **Priority bent once.** US6 (P2, Beta label) and US7 (P2, workspace rule) ride K3, ahead of the admin web (US3..US5, P1, K4): the badge sits on the nav entry K3 filters, and the rule names the seams K2 and K3 build.
- **deps:** K1 none; K2 = K1; K3 = K2; K4 = K2 + K3; K5 = K4.
- **Branches.**
  - K1: the slice branch, cut from TAG `0012-release-a` by hand (not from develop).
  - K2..K5: one branch, `integration/0013-beta-features`, cut from `develop` by K2, only once `develop` holds `0013-release-a`. Later slices build on it.
- **AC.** PRD requirement sentence verbatim, `R-nnn` prefix dropped (house precedent). Rule ACs carry their rule path. A slice carrying one side of a requirement says so on its covers line.

### Releases (runbook rule 4, expand first, code second)
- **A = K1.** Commits touch only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`. Base: tag `0012-release-a` (dc7c8f1, rev `b28d5134631f`). Tag `0013-release-a` on the K1 tip.
  - Owner: merge `0013-release-a` into `main` (0012 A + 0013 A migrations; no code reads either) → CD deploys → `alembic upgrade head` in the API container → restart → confirm.
  - Owner's order: `git merge --no-ff` of K1 into `develop` (B is cut after it).
  - Old code on the new schema: three new tables, one seed row; the old ORM maps none.
- **B = K2..K5.** Tag `0013-release-b` on the K5 tip. K2..K4 tips are not merge points.
  - `develop` holds 0012 B + 0013 B. **0012 B never reaches `main` without 0013 B, or every user sees jobs.**
  - Owner merges `develop` into `main` only after A's `alembic upgrade head` is confirmed. 0012 B prerequisites still stand (worker + scheduler swarm services, `SWARM_WORKER_SERVICE_NAME` / `SWARM_SCHEDULER_SERVICE_NAME`).
  - After deploy: only admins see Jobs. The owner enrols users at `/admin/features`.
- **Rollback.** B: previous API + web image. A, only after B is rolled back: `alembic downgrade b28d5134631f` + previous image; three tables → `*_old`, rows kept.
- Build never waits for prod; merge does. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`.

### Plan corrections (checked against the code, 2026-10-14)
1. **Plan header stale.** It reads PRD "(Draft)"; the PRD reads Approved. K5 fixes the header line.
2. **E2E username.** Plan: "enrol `e2e`". The seeded user is `e2e-user` (`backend/app/scripts/seed_e2e.py` l.82); others `e2e-admin`, `e2e-discord`. K2 enrols `e2e-user`.
3. **Two more tests call gated routes.** Plan lists 4 files for `jobs_beta`. Also `tests/integration/test_delete_account.py` l.294-301 (dismissal, `/job-searches`, `from-job`) and `tests/integration/test_application_drafts.py` l.687 (`from-job`). K2 adds them.
4. **Head and pin.** Head `b28d5134631f` (`b28d5134631f_job_board.py` l.71-72), sole head. `test_only_one_head` pins it in `tests/integration/test_timeline_contract_migration.py` l.831. K1 moves the pin (the tag's copy of the file).
5. **"Bad body still 404".** FastAPI decodes JSON before any dependency runs: a body that is not JSON answers 422 `json_invalid` on a gated route, while an unknown route answers 404. Same for an undefined method (405, Starlette). Field validation runs after dependencies, so a well-formed body with wrong fields IS 404. K2 tests that case and records the other two in backend `CLAUDE.md`. **Owner approved 2026-10-14.**
6. **Names the plan omits.** `app/application/dto/feature.py` (new, ADR-0001: use cases return DTOs); `tests/unit/test_feature_access.py` (new; the plan's "Unit: truth table"), on a pure `access_via(...)` in `app/core/features.py` the repository query mirrors; `hooks/use-features.test.tsx`, `components/features/feature-gate.test.tsx` (new); admin calls in `admin-service.ts` + `use-admin.ts` (no `i-admin-service.ts`, 0010/0012 precedent).
7. **Not-found inside the shell.** `app/not-found.tsx` is full-viewport (`min-h-viewport`, `bg-muted`). The gate renders the same words inside the shell: K3 moves the words into one shared component used by both.
8. **E2E determinism.** Plan seed: enrol user, delete admin opt-outs. K2 also puts `jobs` back to `beta` (`released_at` NULL) and takes `e2e-discord` off the list on every seed run, so a crashed `beta-features.spec.ts` cannot leak into the next run (`afterAll` covers a clean run). Precedent: the seed already undoes the Discord disconnect each run. **Owner approved 2026-10-14.**
9. **R-017 vs the disabled switch.** Plan disables "Use this feature myself" while the admin is listed. The switch still shows the stored choice; the API (K2) stores an opt-out in either case. An admin who turned it off and then got listed sees it off, with the listed reason. R-017 holds through the API and the words. **Owner approved 2026-10-14.**
10. **Workspace rule outside git.** `.claude/rules/beta-features.md` and the workspace `CLAUDE.md` sit at the workspace root, which is not a repo. K3 writes them in place; K3's applika commit carries the two `CLAUDE.md` pointer lines.
11. **Release A merge into develop.** `backend/CHANGELOG.md` gets lines on both sides under `## [Unreleased]`; `test_timeline_contract_migration.py` may differ. Keep both sides.
12. **ty baseline.** Rule: 171, ratchets down only. K1 compares against `0012-release-a`, K2..K5 against `develop`. Every new or changed file clean.
13. **Smoke count.** `e2e/smoke.spec.ts` pins `toHaveLength(19)`; K4 adds `/admin/features` → 20. `e2e/shell-responsive.spec.ts` logs in as `user` (`e2e-user`, enrolled): 8 entries, unchanged.

## K1 — Release A: feature registry tables and the "jobs" seed   side: backend   covers: R-001 (schema), R-004 (jobs instance; rule K3), R-005 (seed; access K2), R-029 (Release A)   deps: —
Owner's words: "with the jobs featurw implemented i would like to block this feature under beta features and release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and then release to everyone"
Clarified: "Per-feature allowlist" (registry table plus a user×feature table); "Reversible, list kept (Recommended)" (features registered by a migration seed row, new features start in beta); "Each admin opts out per feature (Recommended)" (one per-admin opt-out row per feature); "Cut 0013-release-a from tag (Recommended)".
Covers: R-001 (schema), R-004 (jobs instance), R-005 (seed), R-029 (Release A)
Release: A. Plan: docs/plan/0013-beta-features.md `## Data`, `## Releases`. Tasks: docs/plan/0013-beta-features.tasks.md
Touch:
- backend/migrations/versions/<rev>_feature_flags.py (new)
- backend/tests/integration/test_migration_feature_flags.py (new)
- backend/tests/integration/test_timeline_contract_migration.py (`test_only_one_head` pin)
- backend/CHANGELOG.md
Pattern:
- backend/migrations/versions/b28d5134631f_job_board.py (`*_old` re-adopt, `ON CONFLICT` seed, `generate_snowflake_id`, downgrade index handling, docstring)
- backend/tests/integration/test_migration_job_board.py (round trip)
Contract: no route. Release A: the image ships this revision, app code unchanged.
Steps:
- T001 [US1] Base, branch:
  - `git rev-parse --short '0012-release-a^{commit}'` → `dc7c8f1`. Else stop, ask the owner;
  - cut the slice branch from `0012-release-a` (`git switch -c <slice branch> 0012-release-a`);
  - one head: `grep -rn "^down_revision" backend/migrations/versions/` → `b28d5134631f` is nobody's parent.
- T002 [US1] Create backend/migrations/versions/<rev>_feature_flags.py (new), `down_revision = 'b28d5134631f'`. Every table: `id BIGINT` PK (snowflake, no sequence), `created_at`, `updated_at` as the other tables. upgrade(), `features`:
  - `key varchar(50) NOT NULL`, `uq_features_key`; `name varchar(100) NOT NULL`; `description varchar(500) NULL`;
  - `stage varchar(20) NOT NULL server_default 'beta'`, `ck_features_stage` (`stage IN ('beta','general')`); `released_at timestamptz NULL`.
- T003 [US3] Same revision, `feature_beta_users`: `feature_id` FK `features.id` ON DELETE CASCADE; `user_id` FK `users.id` ON DELETE CASCADE; `added_by BIGINT NULL` FK `users.id` ON DELETE SET NULL; `uq_feature_beta_users_feature_user (feature_id, user_id)`; `ix_feature_beta_users_user_id (user_id)`.
- T004 [US5] Same revision, `feature_admin_opt_outs`: `feature_id` FK CASCADE, `user_id` FK CASCADE; `uq_feature_admin_opt_outs_feature_user (feature_id, user_id)`; `ix_feature_admin_opt_outs_user_id (user_id)`. Own table, never a flag on `feature_beta_users`: list counts never mix with opt-outs.
- T005 [US1] Same revision, seed (R-005): `jobs` | `Job board` | `Remote job list, CV fit and keyword tailoring (PRD 0012)` | `beta`, `released_at` NULL, id `generate_snowflake_id()`, `ON CONFLICT (key) DO NOTHING`. No list row, no opt-out row.
- T006 [US1] Re-upgrade and downgrade, shape of `b28d5134631f`:
  - upgrade: an existing `<table>_old` is renamed back, not created (`features` first, then the two children); indexes after; the seed repeats `ON CONFLICT`;
  - downgrade: index handling as `b28d5134631f`; the three tables → `*_old`; every row stays; no drop;
  - docstring cites non-destructive rules 1, 2, 3, 5, 7; runbook 4; ADR-0005; ADR-0018 (code ships in B).
- T007 [P] [US1] Round trip in backend/tests/integration/test_migration_feature_flags.py (new): testcontainers Postgres, real chain. Seed at `b28d5134631f`: admin A, users B and C.
  - **upgrade:** three tables with every T002..T004 name; `jobs` once, `beta`, `released_at` NULL, zero list and opt-out rows; insert list rows for B and C (`added_by` A) and A's opt-out; the same `(feature_id, user_id)` twice on either table → IntegrityError; `stage 'alpha'` → IntegrityError; a second `jobs` key → IntegrityError; delete B → B's list row gone; delete A → C's row stays with `added_by` NULL, A's opt-out gone;
  - **downgrade:** `features_old`, `feature_beta_users_old`, `feature_admin_opt_outs_old` hold every row; the original names are gone; no index of this revision left (pattern);
  - **upgrade again:** names back, rows equal to the first upgrade, `jobs` once, indexes equal;
  - no table or column missing after upgrade, only renamed to `_old`.
- T008 [US1] backend/tests/integration/test_timeline_contract_migration.py `test_only_one_head`: pin `b28d5134631f` → `<rev>`; assert `down_revision == 'b28d5134631f'`; keep the chain walk; one docstring line for K1.
- T009 [US1] backend/CHANGELOG.md `## [Unreleased]` Added: `- tables features, feature_beta_users and feature_admin_opt_outs; feature "jobs" ("Job board") seeded in beta with an empty beta list; no code reads them yet (Release A, ADR-0018).` No CLI entry: no route, field or enum change.
- T010 [US1] Verify and Release A shape:
  - `grep -nE "op\.drop_(column|table)"` on the revision → none in `upgrade()`; `grep -rn "_old" backend/app/` → none;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`; `uv run pytest tests/integration -k migration`;
  - backend/app/domain/models.py maps none of the three; backend/tests/conftest.py unchanged;
  - `git diff 0012-release-a --name-only` → only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`.
- T011 [US1] Gate, record, close:
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `0012-release-a`, ceiling 171; changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - annotated tag `0013-release-a` on the K1 tip (local);
  - the owner steps of `### Releases` (A), including the `--no-ff` merge into `develop` on his order (Plan corrections 11); rollback `alembic downgrade b28d5134631f` + previous image;
  - The agent never touches prod or `main`.
AC:
- The system keeps a list of features. Each feature has a key, a name, a short description and a stage, "beta" or "general".
- Every new feature that users who are not admins can see joins the list in beta, with an empty beta list, in the same release that adds it.
- The job board joins the list as the feature "jobs", named "Job board", in beta and with an empty beta list. From then on every admin has it, and no other user does until an admin adds them.
- Database changes reach production in a release before the code that uses them. The job board never reaches production users without this gate.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K2 — Backend: access rule, jobs gate, GET /users/me/features, /admin/features   side: backend   covers: R-001 (admin list), R-002, R-003, R-005 (access), R-006..R-011 (API), R-012 (API), R-013, R-014 (API), R-015 (API), R-016, R-017 (API), R-020, R-021, R-022 (API), R-023, R-024 (API), R-025 (API), R-027 (API), R-028 (API)   deps: K1
Owner's words: "with the jobs featurw implemented i would like to block this feature under beta features and release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and then release to everyone"
Clarified: "Fully hidden, API enforced (Recommended)" (backend answers 404 on gated routes as if they didn't exist); "Everything from PRD 0012 (Recommended)" (hourly scraper keeps running for everyone; admin job-source page stays admin-only, not gated); "Admin UI under /admin (Recommended)" (AdminUserDp; /admin/features routes; no deploy needed); "Reversible, list kept (Recommended)" (beta ↔ general; releasing keeps the allowlist); owner 2026-10-14: "features is granted to admins automatically, but it can also be disabled by them in the admin panel."; "Each admin opts out per feature (Recommended)" (other admins unaffected).
Covers: R-001 (admin list), R-002, R-003, R-005 (access), R-006, R-007, R-008, R-009, R-010, R-011 (API), R-012 (API), R-013, R-014 (API), R-015 (API), R-016, R-017 (API), R-020, R-021, R-022 (API), R-023, R-024 (API), R-025 (API), R-027 (API), R-028 (API)
Release: B. Plan: docs/plan/0013-beta-features.md `## Backend` S2, `## Contract`, `## Tests`. Tasks: docs/plan/0013-beta-features.tasks.md
Touch:
- backend/app/domain/models.py
- backend/app/core/features.py (new)
- backend/app/domain/repositories/feature_repository.py (new)
- backend/app/application/dto/feature.py (new)
- backend/app/application/use_cases/features/__init__.py, list_my_features.py (new)
- backend/app/application/use_cases/admin/features/__init__.py, list_features.py, list_feature_users.py, add_feature_user.py, remove_feature_user.py, set_feature_stage.py, opt_out.py, opt_in.py (new)
- backend/app/presentation/dependencies.py
- backend/app/presentation/schemas/features.py (new)
- backend/app/presentation/api/user.py, jobs.py, job_searches.py, application_draft.py, tailored_cv.py
- backend/app/presentation/api/admin/features.py (new), backend/app/presentation/api/admin/__init__.py
- backend/tests/conftest.py
- backend/tests/unit/test_feature_access.py (new)
- backend/tests/integration/test_feature_gating.py (new), test_features_api.py (new)
- backend/tests/integration/test_jobs_api.py, test_jobs_draft.py, test_job_searches.py, test_tailored_cv_api.py, test_delete_account.py, test_application_drafts.py
- backend/app/scripts/seed_e2e.py
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md, backend/CHANGELOG.md, cli/CHANGELOG.md
Pattern:
- backend/app/domain/repositories/job_source_repository.py (repository shape)
- backend/app/presentation/dependencies.py `get_admin_user` / `AdminUserDp` (a dependency built on `CurrentUserDp`)
- backend/app/presentation/handlers.py (`ResourceNotFound` → `{"detail": msg}`)
- backend/app/presentation/api/admin/jobs.py, api/admin/discord_webhooks.py (admin router, strict bodies); backend/app/application/use_cases/admin/jobs/ (admin use cases, logging)
- backend/app/presentation/api/admin/users.py `GET /admin/users` (`search`, `page`, `per_page`, `{items, total, page, per_page, total_pages}`)
- backend/tests/integration/jobs_seed.py (rows `create_all` lacks)
- docs/adr/0018-beta-features-registry-and-allowlist.md
Contract (K3, K4 consume):
- `GET /users/me/features` → 200 `{features: [{key, stage: 'beta'|'general'}]}` caller's own, by key | 401.
- Caller lacks `jobs`: `/jobs*`, `/job-searches*`, `POST /applications/drafts/from-job`, `GET /applications/{id}/cv/fit` → 404 `{"detail": "Not Found"}`. `POST /applications/{id}/cv` `{tailoring: 'keywords'}` → 422 `'Unknown tailoring option'`. Anonymous: today's auth error.
- `GET /admin/features` → 200 `[{key, name, description|null, stage, beta_user_count, released_at|null, updated_at, me {has, via: 'general'|'list'|'admin'|null, opted_out}}]` by key; `beta_user_count` = list rows only | 403.
- `PATCH /admin/features/{key}` `{stage: 'beta'|'general'}` → 200 row | 404 'Feature not found' | 403 | 422.
- `GET /admin/features/{key}/users?search≤100&page≥1&per_page=1..100(25)` → 200 `{items: [{user_id, username, email, added_at, added_by {id, username}|null}], total, page, per_page, total_pages}` newest first | 404 | 403.
- `PUT /admin/features/{key}/users/{user_id}` → 204 idempotent | 404 'Feature not found' | 404 'User not found' | 403. `DELETE` same path → 204 idempotent | 404 'Feature not found' | 403.
- `PUT /admin/features/{key}/opt-out` (caller only, no body) → 204 idempotent, stored in either stage | 404 | 403. `DELETE /admin/features/{key}/opt-out` → 204 idempotent | 404 | 403.
- Ids snowflake strings.
Steps:
- T012 [US1] Base and branch:
  - `git merge-base --is-ancestor 0013-release-a develop` → yes. Else stop: the owner orders the `--no-ff` merge of K1 first;
  - no `integration/0013-beta-features` yet → `git switch -c integration/0013-beta-features develop`;
  - `uv run alembic heads` → `<rev>` only.
- T013 [US1] backend/app/domain/models.py: `FeatureModel`, `FeatureBetaUserModel`, `FeatureAdminOptOutModel`. `__table_args__` mirror every K1 name (unique, check, indexes), every FK `ondelete`, `stage` `server_default 'beta'`: `create_all` builds the K1 schema. No `_old` mapped.
- T014 [P] [US1] backend/app/core/features.py (new): `FeatureKey(StrEnum)` `JOBS = 'jobs'`; `FeatureStage` `beta | general`; `AccessVia` `general | list | admin`; pure `access_via(stage, listed, is_admin, opted_out) -> AccessVia | None` (general → general; listed → list; admin, beta, no opt-out → admin; else None). The query in T015 mirrors it.
- T015 [US1] [US3] backend/app/domain/repositories/feature_repository.py (new):
  - `get_by_key(key)`;
  - `features_for_user(user_id, is_admin) -> list[(key, stage, via)]`, ONE query: `stage = 'general'` OR a list row OR (`is_admin` AND no opt-out row); `has_feature(key, user_id, is_admin) -> bool`, same predicate; no row for the key → False, admins too (R-003);
  - `list_with_counts(caller_id, caller_is_admin)`: every feature by key; `beta_user_count` = list rows only (R-006); the caller's `me {has, via, opted_out}`;
  - `list_users(feature_id, search, page, per_page)`: newest first; `{user_id, username, email, added_at, added_by {id, username} | null}`; `total`;
  - `add_user(feature_id, user_id, added_by)`, `opt_out(feature_id, user_id)`: `ON CONFLICT DO NOTHING`; `remove_user`, `opt_in`: delete, no error when absent;
  - `set_stage(feature_id, stage)`: → general sets `released_at = now()`, → beta clears it; list and opt-outs untouched (R-011, R-016).
- T016 [US1] [US3] [US4] [US5] DTOs in backend/app/application/dto/feature.py (new); use cases (new):
  - backend/app/application/use_cases/features/list_my_features.py → the caller's own, by key;
  - backend/app/application/use_cases/admin/features/: `list_features`, `list_feature_users`, `add_feature_user`, `remove_feature_user`, `set_feature_stage`, `opt_out`, `opt_in`;
  - unknown key → `ResourceNotFound('Feature not found')`; unknown user on add → `ResourceNotFound('User not found')`; same stage → no-op, 200 with the row; opt-out / opt-in touch the caller's own row only (R-014); logs name the admin id and the key; add / remove also log the target `user_id` (snowflake), never a username or email (owner 2026-10-14: "Accept user_id in logs (Recommended)").
- T017 [US1] backend/app/presentation/dependencies.py:
  - `get_feature_repository`, `FeatureRepositoryDp`;
  - `require_feature(key: FeatureKey)` → a dependency on `CurrentUserDp` (carries `is_admin`) and `FeatureRepositoryDp`; lacks it → `ResourceNotFound('Not Found')` → `{"detail": "Not Found"}` (handlers.py unchanged);
  - no cache: one indexed query per gated request (R-012); anonymous → `CurrentUserDp`'s auth error first.
- T018 [US1] Gate (R-020), `require_feature(FeatureKey.JOBS)`:
  - router `dependencies=[...]`: backend/app/presentation/api/jobs.py (all `/jobs*`), api/job_searches.py (all `/job-searches*`);
  - route: api/application_draft.py `POST /applications/drafts/from-job`; api/tailored_cv.py `GET /applications/{id}/cv/fit`;
  - not gated: api/admin/jobs.py, app/worker/*, api/base_cv.py fit enqueue, `Draft.job_id`, `TailoredCVOut.adjustments`, every other drafts and CV route.
- T019 [US1] Per value (R-021), api/tailored_cv.py `POST /applications/{id}/cv`: `tailoring == 'keywords'` and caller lacks `jobs` → `BusinessRuleViolation('Unknown tailoring option')` (422) before the use case, nothing written. Absent or `copy`: untouched (CLI path).
- T020 [US1] `GET /users/me/features` in api/user.py → 200 `{features: [{key, stage}]}` | 401. Schemas `MyFeature`, `MyFeatures` in backend/app/presentation/schemas/features.py (new). `/users/me` untouched (CLI route).
- T021 [US3] [US4] [US5] Admin routes in backend/app/presentation/api/admin/features.py (new), `AdminUserDp`, every `/admin/features*` Contract route; added to `admin_routers` in api/admin/__init__.py. Admin schemas in presentation/schemas/features.py, bodies `extra=forbid`.
- T022 [P] [US1] backend/tests/unit/test_feature_access.py (new):
  - `access_via` truth table: general → everyone; beta → listed only; admin → yes; opted-out admin → no, yes in general, yes when listed; ex-admin with an old opt-out → list only;
  - unknown key → no, admins too (repository fake);
  - `require_feature` without the feature → 404, body `{"detail": "Not Found"}`.
- T023 [P] [US1] [US2] backend/tests/integration/test_feature_gating.py (new), `jobs` row seeded as K1 seeds it:
  - unlisted user: `GET /jobs`, `GET /jobs/{id}`, `PUT`/`DELETE /jobs/{id}/dismissal`, `GET`/`POST /job-searches`, `PUT`/`DELETE /job-searches/{id}`, `POST /applications/drafts/from-job`, `GET /applications/{id}/cv/fit` → 404, body equal to `GET /no-such-route`'s; well-formed JSON with wrong fields → still 404 (Plan corrections 5);
  - `tailoring: 'keywords'` → 422 'Unknown tailoring option', no row; `copy` and no `tailoring` → 201;
  - admin by default → 200; opt-out row → 404; row gone → 200; listed + opt-out → 200; `GET /admin/jobs/sources` → 200 with the opt-out (R-024);
  - stage general → unlisted 200, opted-out admin 200; back to beta → both 404 again (R-016);
  - ex-admin with an opt-out row, unlisted → 404; listed → 200; user made admin → 200 on the next request;
  - anonymous `GET /jobs` → today's 401;
  - worker never gated: an unlisted user's master CV POST still enqueues `recompute_fit` (`job_queue` fake) (R-023);
  - R-027: an unlisted user's draft from a job (`job_id` set) lists, reads, updates and finishes; its keyword copy reads; saved search and dismissal rows stay; listed again → `GET /job-searches` and `dismissed` marks unchanged.
- T024 [P] [US1] [US3] [US4] [US5] backend/tests/integration/test_features_api.py (new):
  - `/users/me/features`: none → listed → general; admin by default `[{jobs, beta}]`; opted-out admin `[]`; listed + opted-out admin `[{jobs, beta}]`; only the caller's own keys;
  - every `/admin/features*` route → 403 non-admin, 401 anonymous;
  - list: every Contract field; an admin with access only as admin not counted;
  - users: search by username, paging, newest first; `added_by` null once the adder is deleted;
  - add twice → one row; two adds at once (`asyncio.gather`) → one row; unknown user → 404 'User not found'; unknown key → 404 'Feature not found'; remove twice → 204 both;
  - release: `released_at` set, list unchanged; revert: `released_at` null, list unchanged, unlisted user `GET /jobs` 404; add and remove work in general (R-011);
  - opt-out / opt-in idempotent; `me` follows; a second admin unaffected; stored in general with no effect; survives release + revert and counts again (R-016); listed admin keeps it, `me.via == 'list'` (R-017);
  - `DELETE /users/me` of a listed user → their list and opt-out rows gone;
  - R-027: remove a user with saved searches and dismissals → rows remain; add back → `GET /job-searches` and `dismissed` unchanged; same for an admin opt-out then opt-in;
  - `{stage: 'alpha'}` → 422; an extra key → 422.
- T025 [US2] Existing tests:
  - backend/tests/conftest.py fixture `jobs_beta`: inserts the `jobs` row as K1 seeds it, enrols the `async_client` user. `admin_client` has `jobs` once the row exists;
  - used by test_jobs_api.py, test_jobs_draft.py, test_job_searches.py, test_tailored_cv_api.py (fit, keywords), test_delete_account.py, test_application_drafts.py (Plan corrections 3).
- T026 [US2] Seeds:
  - backend/app/scripts/seed_e2e.py, every run: enrol `e2e-user` in `jobs`; delete `e2e-admin`'s opt-out rows; delete `e2e-discord`'s list row; `jobs` back to `beta`, `released_at` NULL (Plan corrections 2, 8);
  - backend/scripts/seed_mock_data.py: read `GET /users/me/features`; no `jobs` → skip `seed_keyword_copy`, `seed_job_searches`, `seed_draft_from_job`, log the skip.
- T027 [US1] backend/CLAUDE.md:
  - new "### Beta features (ADR-0018)": the rule, `FeatureKey`, `require_feature` on router / route / value, the 404 body, no cache, unknown key hidden, worker and admin routes never gated, `jobs_beta` (no seed row under `create_all`), Plan corrections 5;
  - Users table + `GET /users/me/features`; Jobs, Job searches, drafts `from-job`, Application CVs: one gate line each;
  - new "### Admin features (`/admin/features`, ADR-0018)" table: counts, idempotent writes, own opt-out only, `released_at`;
  - Domain: Feature, FeatureBetaUser, FeatureAdminOptOut and their FKs; Seed Script Rule: the features check.
- T028 [US1] Changelogs:
  - backend/CHANGELOG.md Added `- GET /users/me/features and the feature gate require_feature (ADR-0018).` and `- /admin/features: list, beta list (list, add, remove), release and move back to beta, the admin's own opt-out (ADR-0018).` Changed `- without the "jobs" feature, /jobs*, /job-searches*, POST /applications/drafts/from-job and GET /applications/{id}/cv/fit answer 404, and POST /applications/{id}/cv with tailoring "keywords" answers 422 "Unknown tailoring option".`
  - cli/CHANGELOG.md `## [Unreleased]` Changed `- POST /applications/{id}/cv with tailoring "keywords" needs the "jobs" beta feature, else 422 "Unknown tailoring option". No CLI version sends it; 0.1.4, 0.2.0, 1.0.0 and 1.0.1 are unaffected.` No entry for `/admin/features` (not a CLI route).
- T029 [US1] Checks, gate, close:
  - `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli;
  - `grep -rn "require_feature" backend/app/worker backend/app/application/use_cases/jobs` → none;
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics, ceiling 171; changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - Not a merge point.
AC:
- The system keeps a list of features. Each feature has a key, a name, a short description and a stage, "beta" or "general".
- A user has a feature when the feature is general, or when the user is on its beta list, or when the user is an admin who has not turned the feature off for themselves. Nothing else gives a user a feature.
- The system treats a feature it does not know as hidden from every user, admins included.
- The job board joins the list as the feature "jobs", named "Job board", in beta and with an empty beta list. From then on every admin has it, and no other user does until an admin adds them.
- An admin sees every feature with its key, name, description and stage, how many users are on its beta list, when it was released, and whether they themselves have it. Admins who have a feature only because they are admins are not counted on its beta list.
- An admin opens a feature and sees its beta list. For each user it shows the username, when they were added and who added them. The list can be searched by username and is split into pages.
- An admin adds a user to a feature's beta list by searching for their username. Adding a user who is already on the list changes nothing.
- An admin removes a user from a feature's beta list. Removing a user who is not on the list changes nothing.
- An admin releases a beta feature to everyone after confirming. An admin moves a general feature back to beta after confirming, and the confirmation says that users who are neither on the list nor admins lose access.
- Releasing a feature, or moving it back to beta, leaves its beta list unchanged. The list can be edited in either stage. Moving a feature back to beta hides it again from every user who is not on the list, except admins who have not turned it off.
- A change made on the admin screen applies from the user's next request to the server, with no deploy and no restart. The user's screens catch up on their next page load at the latest.
- Every admin has every beta feature without being on its list, unless they turned that feature off for themselves.
- On a feature's admin page, an admin turns the feature off for themselves, and back on. This changes only what that admin sees. Other admins and other users are not affected, and no admin can turn a feature off for anyone else.
- That page tells the admin whether they have the feature right now, and why: it is released to everyone, they are on the beta list, they are an admin, or they turned it off.
- An admin's choice to turn a feature off counts only while the feature is in beta. A general feature is on for everyone, admins included. The choice is kept through a release and counts again if the feature moves back to beta.
- An admin who is on the beta list keeps the feature after turning it off for themselves, because turning it off removes only the access they have as an admin. The page says so, and tells them to leave the list to hide the feature.
- A user without "jobs" who asks the server for the job list, a job, a dismissal, saved searches, a draft started from a job, or an application's CV fit gets "not found". It is the same answer the server gives for an address that does not exist.
- A user without "jobs" who asks for a CV copy "tailored by keywords" is refused, as if that choice did not exist. A verbatim copy works as it does today.
- For a user without "jobs", everything else in Applika works exactly as it did before PRD 0012: applications, drafts, CV copies, statistics, reports, agenda and command-line clients.
- Job collection keeps running every hour for everyone, as PRD 0012 R-004 says. The system keeps computing fit scores for every master CV.
- The admin job sources screen stays open to every admin, including an admin who turned "jobs" off for themselves.
- A user with "jobs" gets all of PRD 0012: the job list and job pages, starting a draft from a job, dismissals and marks, saved searches, the CV fit on applications and "Tailor by keywords".
- A user who loses "jobs" keeps everything they made with it: drafts and applications started from jobs, CV copies tailored by keywords, saved searches and dismissals. Their drafts and applications keep working, with no job control shown. If they get "jobs" back, their saved searches, dismissals and marks come back unchanged. This applies just as much to an admin who turns "jobs" off and back on.
- This PRD narrows PRD 0012 R-010 and its assumption "Every signed-in user sees jobs". Only users who have "jobs" see the job list.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K3 — Web: hide the job board without "jobs", Beta label; workspace rule beta-features.md   side: frontend (+ workspace rule)   covers: R-004 (rule), R-012 (web), R-018, R-019, R-022 (web), R-024 (web), R-025 (web), R-026, R-027 (web), R-028 (web)   deps: K2
Owner's words: "with the jobs featurw implemented i would like to block this feature under beta features and release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and then release to everyone"
Clarified: "Fully hidden, API enforced (Recommended)" (jobs nav, /jobs pages and every job-related control — start-from-job, fit on applications, tailor by keywords, saved searches — not rendered); "Reversible, list kept (Recommended)" (new features add their key in their own migration starting in beta; unknown key = treated as hidden). Assumptions: users who have a beta feature, admins included, see a "Beta" label (R-026); "all mew features in the feature" means all new features in the future; a "new feature" is a new capability users who are not admins can see; changes to existing screens, bug fixes and admin-only screens are not gated.
Covers: R-004 (rule), R-012 (web), R-018, R-019, R-022 (web), R-024 (web), R-025 (web), R-026, R-027 (web), R-028 (web)
Release: B. Plan: docs/plan/0013-beta-features.md `## Frontend` S3, `## Tests` (Vitest), `## Rules that bind`. Tasks: docs/plan/0013-beta-features.tasks.md
Touch:
- frontend/src/services/types/features.ts (new)
- frontend/src/services/interfaces/i-feature-service.ts (new), services/implementations/feature-service.ts (new), services/services.ts
- frontend/src/hooks/use-features.ts (new), use-features.test.tsx (new)
- frontend/src/components/layout/nav.ts, sidebar-nav.tsx, sidebar-nav.test.tsx
- frontend/src/app/(protected)/layout.tsx
- frontend/src/components/features/feature-gate.tsx (new), feature-gate.test.tsx (new), beta-badge.tsx (new)
- frontend/src/components/layout/not-found-message.tsx (new), frontend/src/app/not-found.tsx
- frontend/src/app/(protected)/jobs/jobs-page.tsx, jobs-page.test.tsx, jobs/view/job-view-page.tsx, job-view-page.test.tsx
- frontend/src/app/(protected)/applications/cv/application-cv-page.tsx, application-cv-page.test.tsx
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.tsx, new-with-cv-page.test.tsx
- frontend/src/components/application-drafts/draft-cv-step.tsx
- frontend/CLAUDE.md, backend/CLAUDE.md (rule pointer line)
- .claude/rules/beta-features.md (new; workspace root, outside applika's git); CLAUDE.md (workspace root, `## Rules`)
Pattern:
- frontend/src/components/layout/nav.ts `navItemsFor` (the admin filter)
- frontend/src/hooks/use-application-cv-fit.ts (`enabled` gate)
- frontend/src/app/not-found.tsx (the words)
- frontend/CLAUDE.md "### App shell", "### Routing", "### Service Layer & DI", "### State Management", "### UI Components"; ADR-0006 tokens; ui-designer
- .claude/rules/migration-tests.md, .claude/rules/non-destructive-migrations.md (rule shape: Applies, numbered list, Why, Verify); docs/adr/0018-beta-features-registry-and-allowlist.md `## Consequences`
Contract (from K2): `GET /users/me/features` → `{features: [{key: "jobs", stage: "beta"|"general"}]}`; gated routes 404 `{"detail": "Not Found"}`; `tailoring: "keywords"` → 422 'Unknown tailoring option'.
Steps:
- T030 [US1] Build on integration/0013-beta-features after the K2 tip.
- T031 [US1] Types and service:
  - frontend/src/services/types/features.ts (new): `FeatureKey = "jobs"`, `FeatureStage = "beta" | "general"`, `MyFeature {key, stage}`;
  - services/interfaces/i-feature-service.ts, services/implementations/feature-service.ts (new): `getMine()` → `GET /users/me/features`; registered in services/services.ts.
- T032 [US1] frontend/src/hooks/use-features.ts (new): `useMyFeatures()` key `["user","features"]`, `refetchOnWindowFocus: true`, an error → empty list (Risk: B before A); `useHasFeature(key)` → `{has, stage, isLoading}`; loading counts as absent (no flash of Jobs).
- T033 [US1] Nav (R-018):
  - components/layout/nav.ts: `NavItem.feature?: FeatureKey`; Jobs `feature: "jobs"`; `navItemsFor(isAdmin, features)` drops an item whose key is missing;
  - app/(protected)/layout.tsx passes `useMyFeatures()`;
  - components/layout/sidebar-nav.tsx: `BetaBadge` on an item whose feature is in beta.
- T034 [US1] Page gate (R-018):
  - the words of app/not-found.tsx move to components/layout/not-found-message.tsx (new), used by app/not-found.tsx and the gate, sized for the shell (Plan corrections 7);
  - components/features/feature-gate.tsx (new): children with the feature; spinner while loading; else the not-found message;
  - wraps app/(protected)/jobs/jobs-page.tsx and jobs/view/job-view-page.tsx; no job request goes out without the feature.
- T035 [US6] components/features/beta-badge.tsx (new), ui-designer, ADR-0006 tokens: the word "Beta", never colour alone; on the Jobs nav entry and next to the h1 of both jobs pages while `stage === "beta"`; gone in general (R-026).
- T036 [US1] CV page and draft step (R-019):
  - app/(protected)/applications/cv/application-cv-page.tsx, applications/new-with-cv/new-with-cv-page.tsx, components/application-drafts/draft-cv-step.tsx: pass `onTailorByKeywordsChange` and render `CvFitPanel` only with `jobs`;
  - `useApplicationCvFit(id, enabled && has)`: no `/cv/fit` request without it;
  - untouched: "Reordered by job match" on an existing keyword copy, the Drafts tab, Finish (R-027); `/admin/jobs` and the admin-nav "Jobs" tab (R-024).
- T037 [P] [US1] [US2] [US6] Vitest:
  - sidebar-nav.test.tsx (+ `navItemsFor`): with `jobs` 8 entries + Beta; general → no badge; without → 7, no Jobs; loading → no Jobs; admin → + Admin;
  - use-features.test.tsx (new): error → empty; `useHasFeature` while loading → `has: false`;
  - feature-gate.test.tsx (new): children / not-found words / spinner;
  - jobs-page.test.tsx, job-view-page.test.tsx: not-found without the feature, no job service call; Beta by the h1 in beta;
  - application-cv-page.test.tsx, new-with-cv-page.test.tsx: no switch, no fit panel, no fit call without `jobs`; both with it (existing cases run with `jobs`).
- T038 [US1] frontend/CLAUDE.md: new "### Beta features" (hooks, gate, badge, `navItemsFor(isAdmin, features)`, 8 entries with `jobs` / 7 without, the API is the rule); the "eight entries" lines under Routing and App shell → eight with `jobs`.
- T039 [US7] Write .claude/rules/beta-features.md (new; Plan corrections 10), shape of its siblings:
  - Applies to every plan and slice that adds a capability users who are not admins can see;
  - 1 a `FeatureKey` member in backend/app/core/features.py;
  - 2 a seed row (`key`, `name`, `description`, stage `beta`; no list row, no opt-out row) in the feature's own Release A migration (.claude/rules/prod-release-runbook.md 4);
  - 3 routes gated with `require_feature` (router, route, or per value); the web with `useHasFeature`, `FeatureGate`, nav `feature`;
  - 4 tests enrol through a fixture (`create_all` has no seed row);
  - 5 release is an admin action at `/admin/features`, never a deploy; the list is kept both ways;
  - 6 removing a gate from code is a later change the owner orders explicitly (ADR-0018);
  - 7 not gated: changes to existing screens, bug fixes, admin-only screens, the worker;
  - Why: the owner's words, ADR-0018. Verify: each `FeatureKey` value has a seed in backend/migrations/versions/; `require_feature` sits on its routes.
- T040 [US7] Workspace CLAUDE.md `## Rules`: `- .claude/rules/beta-features.md`. The "Beta features" sections of backend/CLAUDE.md and frontend/CLAUDE.md point at the rule; commit `docs(features): point to the beta-features rule`.
- T041 [US1] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - `scripts/e2e.sh e2e/shell-responsive.spec.ts e2e/smoke.spec.ts e2e/jobs.spec.ts` green (`e2e-user` enrolled by K2's seed); `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - the rule's Verify passes (`jobs` ↔ `<rev>_feature_flags.py`);
  - Not a merge point.
AC:
- Every new feature that users who are not admins can see joins the list in beta, with an empty beta list, in the same release that adds it.
- A change made on the admin screen applies from the user's next request to the server, with no deploy and no restart. The user's screens catch up on their next page load at the latest.
- A user without "jobs" sees no Jobs entry in the navigation. If they open the job list or a job's page, they see the app's "page not found".
- On an application's CV page and on a draft's CV step, a user without "jobs" sees no "Tailor by keywords" choice and no CV fit panel.
- For a user without "jobs", everything else in Applika works exactly as it did before PRD 0012: applications, drafts, CV copies, statistics, reports, agenda and command-line clients.
- The admin job sources screen stays open to every admin, including an admin who turned "jobs" off for themselves.
- A user with "jobs" gets all of PRD 0012: the job list and job pages, starting a draft from a job, dismissals and marks, saved searches, the CV fit on applications and "Tailor by keywords".
- While "jobs" is in beta, a user who has it sees a "Beta" label on the Jobs entry and on the job pages. The label goes away when the feature is released.
- A user who loses "jobs" keeps everything they made with it: drafts and applications started from jobs, CV copies tailored by keywords, saved searches and dismissals. Their drafts and applications keep working, with no job control shown. If they get "jobs" back, their saved searches, dismissals and marks come back unchanged. This applies just as much to an admin who turns "jobs" off and back on.
- This PRD narrows PRD 0012 R-010 and its assumption "Every signed-in user sees jobs". Only users who have "jobs" see the job list.

## K4 — Admin Features screens: list, beta list, release and move back, own access; beta-features E2E   side: frontend (+ E2E)   covers: R-006..R-011 (UI), R-012 (UI), R-014..R-017 (UI)   deps: K2, K3
Owner's words: "with the jobs featurw implemented i would like to block this feature under beta features and release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and then release to everyone"
Clarified: "Admin UI under /admin (Recommended)" (new admin page: list features with stage, add/remove users to a feature's beta list searching by username, 'Release to everyone' action); "Reversible, list kept (Recommended)" (moving back to beta re-hides for everyone not on the list); "Each admin opts out per feature (Recommended)" (on the feature's admin page an admin can turn it off for themselves only, e.g. to see the app as a normal user, and back on). Assumptions: "The admin screen is a "Features" tab in the admin area."; "Adding a user searches all users by username or email, the same search as the admin users screen." Owner's quality-gate order: "the better of two worlds, i also want frontend tests and e2e tests with real application stack".
Covers: R-006, R-007, R-008, R-009, R-010, R-011 (UI), R-012 (UI), R-014, R-015, R-016 (UI), R-017 (UI)
Release: B. Plan: docs/plan/0013-beta-features.md `## Frontend` S3 (Admin), `## Tests` (Vitest, E2E). Tasks: docs/plan/0013-beta-features.tasks.md
Touch:
- frontend/src/services/types/features.ts
- frontend/src/services/implementations/admin-service.ts
- frontend/src/hooks/use-admin.ts
- frontend/src/app/(protected)/admin/features/page.tsx, features-page.tsx, features-page.test.tsx (new)
- frontend/src/app/(protected)/admin/features/view/page.tsx, feature-view-page.tsx, feature-view-page.test.tsx (new)
- frontend/src/components/admin/feature-*.tsx (new, ui-designer: table, beta list, add dialog, stage dialog, own access)
- frontend/src/components/admin/admin-nav.tsx
- frontend/e2e/beta-features.spec.ts (new), frontend/e2e/admin-gating.spec.ts, frontend/e2e/smoke.spec.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/admin/jobs/jobs-page.tsx, admin/discord-webhooks/discord-webhooks-page.tsx (admin shell, list states, `admin-service.ts` + `use-admin.ts` shape, switch pending)
- frontend/src/app/(protected)/admin/users/users-page.tsx (search + paging over `GET /admin/users`)
- frontend/src/app/(protected)/cvs/editor/page.tsx (Suspense shell for `?query=`)
- frontend/src/components/admin/approve-catalog-button.tsx (AlertDialog confirm)
- frontend/e2e/admin-discord-webhooks.spec.ts, e2e/jobs.spec.ts (serial, own cleanup), e2e/support/auth.ts (`loginAs`, `authCookieHeader`)
Contract (from K2): `GET /admin/features`; `PATCH /admin/features/{key}` `{stage}` → 200 row; `GET /admin/features/{key}/users?search&page&per_page` → `{items: [{user_id, username, email, added_at, added_by {id, username}|null}], total, page, per_page, total_pages}`; `PUT`/`DELETE /admin/features/{key}/users/{user_id}` → 204 | 404 'Feature not found' | 404 'User not found'; `PUT`/`DELETE /admin/features/{key}/opt-out` → 204; `me {has, via: 'general'|'list'|'admin'|null, opted_out}`; `GET /admin/users?search=` (existing).
Steps:
- T042 [US3] Build on integration/0013-beta-features after the K3 tip.
- T043 [US3] [US4] [US5] Types, service, hooks:
  - services/types/features.ts + `AdminFeature`, `AdminFeatureMe`, `AdminFeatureUser`, `AdminFeatureUsersPage`;
  - services/implementations/admin-service.ts: `getFeatures()`, `getFeatureUsers(key, {search, page, per_page})`, `addFeatureUser(key, userId)`, `removeFeatureUser(key, userId)`, `setFeatureStage(key, stage)`, `optOutFeature(key)`, `optInFeature(key)`;
  - hooks/use-admin.ts: keys `["admin","features"]`, `["admin","feature-users",key,params]`; every mutation invalidates both + `["user","features"]`: the admin's own nav catches up (R-012).
- T044 [US3] List page app/(protected)/admin/features/page.tsx + features-page.tsx (new):
  - table key | name | stage | beta users | released | You (`me.has` + reason in words);
  - loading / error / empty / ready; a row links `/admin/features/view?key=<key>`;
  - components/admin/admin-nav.tsx tab "Features" (lucide `FlaskConical`).
- T045 [US3] Feature page app/(protected)/admin/features/view/page.tsx (Suspense) + feature-view-page.tsx (new), `?key=`:
  - header: name, key, description, stage, released date; unknown key → the not-found message (K3);
  - beta list: username, added (date), added by (or a dash); search by username; pager (25);
  - "Add user": dialog searching `GET /admin/users?search=` (username or email); an already-listed user marked; add → list and counts refetch;
  - remove behind an AlertDialog; a 404 `detail` shown as the server's words.
- T046 [US4] Stage on feature-view-page.tsx:
  - beta → "Release to everyone"; general → "Move back to beta"; each behind an AlertDialog;
  - the move-back dialog says: "Users who are neither on this list nor admins lose access.";
  - the beta list stays editable in both stages (R-011).
- T047 [US5] "Your access" section:
  - switch "Use this feature myself" (on = no opt-out) → `DELETE` / `PUT .../opt-out`;
  - why, in words, from `me`: released to everyone / on the beta list / admin / turned off (R-015);
  - general: disabled, "Released to everyone. Your choice applies again if it moves back to beta." (R-016);
  - listed: disabled, "You're on the beta list, so you keep access. Remove yourself from the list to hide it." (R-017, Plan corrections 9);
  - pending: `aria-disabled` + `aria-busy`, focus stays.
- T048 [P] [US3] [US4] [US5] Vitest:
  - features-page.test.tsx (new): four states; columns; counts; the link;
  - feature-view-page.test.tsx (new): list, search, pager; add (search → PUT; a duplicate is harmless); remove confirm; each reason; both disabled states with their words; the switch calls PUT / DELETE; release and move-back confirms with the words; Cancel sends nothing; unknown key.
- T049 [US3] E2E route lists (Plan corrections 13): e2e/admin-gating.spec.ts `ADMIN_PATHS` + `/admin/features`; e2e/smoke.spec.ts row `/admin/features` (admin, h1), `toHaveLength(19)` → 20.
- T050 [US1] [US2] [US3] [US4] [US5] [US6] E2E frontend/e2e/beta-features.spec.ts (new), serial, real stack:
  - admin: Jobs + Beta by default (8 + Admin) → `/admin/features/view?key=jobs` → turn off → reload: 7 entries, `/jobs` "page not found", `/admin/jobs` opens (R-024) → turn on → reload: Jobs back;
  - `e2e-discord`: 7 entries, `GET /jobs` 404 → admin adds them by username (timed, < 1 minute) → reload: Jobs + Beta → admin removes → reload: hidden, `GET /jobs` 404 → admin releases (confirm) → Jobs, no Beta → back to beta (confirm) → hidden, list unchanged;
  - `afterAll`: stage beta, `e2e-discord` off the list, admin opt-out deleted (K2's seed resets too).
- T051 [US3] frontend/CLAUDE.md: new "### Admin — Features" (routes, query keys, the add dialog over the users search, stage dialogs, own access, invalidations); "### E2E": beta-features.spec.ts and the seed resets.
- T052 [US3] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - full `scripts/e2e.sh` (every spec) green; no applika-e2e container, network or volume left;
  - Not a merge point.
AC:
- An admin sees every feature with its key, name, description and stage, how many users are on its beta list, when it was released, and whether they themselves have it. Admins who have a feature only because they are admins are not counted on its beta list.
- An admin opens a feature and sees its beta list. For each user it shows the username, when they were added and who added them. The list can be searched by username and is split into pages.
- An admin adds a user to a feature's beta list by searching for their username. Adding a user who is already on the list changes nothing.
- An admin removes a user from a feature's beta list. Removing a user who is not on the list changes nothing.
- An admin releases a beta feature to everyone after confirming. An admin moves a general feature back to beta after confirming, and the confirmation says that users who are neither on the list nor admins lose access.
- Releasing a feature, or moving it back to beta, leaves its beta list unchanged. The list can be edited in either stage. Moving a feature back to beta hides it again from every user who is not on the list, except admins who have not turned it off.
- A change made on the admin screen applies from the user's next request to the server, with no deploy and no restart. The user's screens catch up on their next page load at the latest.
- On a feature's admin page, an admin turns the feature off for themselves, and back on. This changes only what that admin sees. Other admins and other users are not affected, and no admin can turn a feature off for anyone else.
- That page tells the admin whether they have the feature right now, and why: it is released to everyone, they are on the beta list, they are an admin, or they turned it off.
- An admin's choice to turn a feature off counts only while the feature is in beta. A general feature is on for everyone, admins included. The choice is kept through a release and counts again if the feature moves back to beta.
- An admin who is on the beta list keeps the feature after turning it off for themselves, because turning it off removes only the access they have as an admin. The page says so, and tells them to leave the list to hide the feature.
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K5 — Closing 0013: full gate, E2E, ADRs, walk, Release B   side: both   covers: — (closing; T058 checks R-029's B half)   deps: K4
Owner's words: "with the jobs featurw implemented i would like to block this feature under beta features and release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and then release to everyone"
Clarified: success signals: a user neither admin nor listed sees seven entries and no job control, every job route "not found"; an admin sees Jobs without the list, seven after turning it off, eight after turning it on; the owner adds a user in under a minute without a deploy; after a release every user sees Jobs, after moving back it is hidden and the list unchanged; installed command-line clients notice no change.
Covers: — (closing)
Release: B, tag `0013-release-b`. Plan: docs/plan/0013-beta-features.md. Tasks: docs/plan/0013-beta-features.tasks.md
Touch:
- docs/plan/0013-beta-features.md (header line only, T057)
- docs/adr/0018-beta-features-registry-and-allowlist.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md K8
Contract: none new.
Steps:
- T053 Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T054 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; every file K2 touched clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`.
- T055 Full `scripts/e2e.sh` (`beta-features.spec.ts` + every older spec). Confirm the `e2e` job in .github/workflows/frontend-ci.yaml runs it. Cheaper layers carry what the E2E does not:
  - the access truth table, ex-admin, unknown key: test_feature_access.py;
  - every gated route, the unknown-route body, well-formed bad body, `keywords` 422, worker never gated, R-027 data kept: test_feature_gating.py;
  - concurrent add, idempotent writes, counts, cascade on user delete, opt-out through release and revert: test_features_api.py;
  - the migration round trip: test_migration_feature_flags.py;
  - the CLI path: `uv run pytest tests -k "steps or finalize or supports"` + `make test` in cli + the T059 walk.
- T056 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - no network or volume from docker-compose.e2e.yml; no testcontainers Postgres or Redis left;
  - the owner's dev containers untouched.
- T057 ADRs, plan header, rules:
  - ADR-0018 reads Accepted; its Decision matches the build (three tables, the rule, `require_feature` 404 body, `keywords` 422, `/users/me/features`, `/admin/features*` incl. own opt-out). A departure → a dated as-built note under Consequences; the Decision untouched;
  - 0003, 0004, 0005, 0014, 0016, 0017 read Accepted; ADR-0004 untouched (extended, not amended);
  - plan header: PRD "(Draft)" → "(Approved)" (Plan corrections 1);
  - `grep -rn "_old" backend/app/` → none; `op.drop_` only in `downgrade()` of `<rev>`; `uv run pytest tests/integration -k migration`;
  - the changelogs verify command; both changelogs carry the K2 `keywords` entry;
  - the commit-format verify on `develop..integration/0013-beta-features` → no output;
  - `.claude/rules/beta-features.md` exists and is listed in workspace CLAUDE.md `## Rules`.
- T058 Release B guard (R-029):
  - `git merge-base --is-ancestor 0013-release-a integration/0013-beta-features` → yes;
  - `git merge-base --is-ancestor 0012-release-b integration/0013-beta-features` → yes: 0012 B and 0013 B travel together;
  - the agent never touches `main`.
- T059 Walk by hand on a real stack (dev compose with the owner's admin account and a second, non-admin account; or the e2e stack under `KEEP_STACK=1` with the seeded `e2e-user`, `e2e-admin`, `e2e-discord`), both themes, desktop and 390px:
  - unlisted non-admin: 7 entries; `/jobs` and a saved `/jobs/view?id=` link → "page not found"; application CV page and draft CV step: no "Tailor by keywords", no fit panel; an old tab sending `keywords` → 422 "Unknown tailoring option", the verbatim copy still offered; a draft from a job finishes from the Drafts tab; statistics, reports, agenda unchanged;
  - admin: Jobs + Beta without the list; turn off → 7 entries, `/admin/jobs` opens; turn on → 8; list yourself + turn off → still has it, the listed words;
  - add a user: time it (< 1 minute, no deploy) → their reload shows Jobs + Beta; remove → their open job page fails "not found" on the next action, Jobs gone on reload; re-add → saved searches and dismissals back;
  - release → every user sees Jobs, no Beta; move back → hidden, list unchanged; an opted-out admin loses it again;
  - make the second user admin → Jobs on the next request; take admin away → list access only; delete a listed user → gone from the list;
  - CLI: `uvx applika-cli==1.0.1 applications cv create <id> --from <cv-id>` → verbatim copy; `uvx applika-cli==0.1.4 applications list` → unchanged.
- T060 Record at close:
  - tag the K5 tip `0013-release-b` (local);
  - the owner steps of `### Releases` (B): merge only after A's `alembic upgrade head` is confirmed; 0012 B prerequisites; after deploy only admins see Jobs; enrol users at `/admin/features`; rollback B, then A;
  - the agent never touches prod.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics and changed files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0018, Accepted 2026-10-14; bound 0003, 0004, 0005, 0014, 0016, 0017 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (beta-features.spec.ts, the whole suite green via scripts/e2e.sh) runs inside the gate and is green; the access truth table, the unknown-route 404 body, the keyword 422, concurrent adds, cascades, the migration round trip and the CLI path are carried by the cheaper layers named in T055.
- By-hand walk of the feature on a real stack done, including the success signals (7 and 8 entries, an add under a minute with no deploy, release and move back with the list unchanged) and installed CLI versions.
- No new feature work.

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | Release A: feature registry tables and the "jobs" seed | backend | R-001, R-004, R-005, R-029 | — | A, tag `0013-release-a` |
| K2 | Backend: access rule, jobs gate, GET /users/me/features, /admin/features | backend | R-001, R-002, R-003, R-005, R-006, R-007, R-008, R-009, R-010, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-020, R-021, R-022, R-023, R-024, R-025, R-027, R-028 | K1 | B |
| K3 | Web: hide the job board without "jobs", Beta label; workspace rule beta-features.md | frontend (+ workspace rule) | R-004, R-012, R-018, R-019, R-022, R-024, R-025, R-026, R-027, R-028 | K2 | B |
| K4 | Admin Features screens: list, beta list, release and move back, own access; beta-features E2E | frontend (+ E2E) | R-006, R-007, R-008, R-009, R-010, R-011, R-012, R-014, R-015, R-016, R-017 | K2, K3 | B |
| K5 | Closing 0013: full gate, E2E, ADRs, walk, Release B | both | — | K4 | B, tag `0013-release-b` |

## Matrix
| R | K |
|---|---|
| R-001 | K1, K2 |
| R-002 | K2 |
| R-003 | K2 |
| R-004 | K1, K3 |
| R-005 | K1, K2 |
| R-006 | K2, K4 |
| R-007 | K2, K4 |
| R-008 | K2, K4 |
| R-009 | K2, K4 |
| R-010 | K2, K4 |
| R-011 | K2, K4 |
| R-012 | K2, K3, K4 |
| R-013 | K2 |
| R-014 | K2, K4 |
| R-015 | K2, K4 |
| R-016 | K2, K4 |
| R-017 | K2, K4 |
| R-018 | K3 |
| R-019 | K3 |
| R-020 | K2 |
| R-021 | K2 |
| R-022 | K2, K3 |
| R-023 | K2 |
| R-024 | K2, K3 |
| R-025 | K2, K3 |
| R-026 | K3 |
| R-027 | K2, K3 |
| R-028 | K2, K3 |
| R-029 | K1 (K5 T058 checks the B half) |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. `## In the owner's words` is one sentence. Checked clause by clause:
- "with the jobs featurw implemented i would like to block this feature under beta features": K1 (`jobs` seeded in beta, empty list), K2 (API 404 / 422), K3 (nav, pages, CV controls hidden).
- "and release only to selected beta users": K2 (beta list API), K4 (add by username search, remove; E2E: a listed user sees Jobs).
- "all mew features in the feature will follow the same pattern": K3 (workspace rule + CLAUDE.md line), on the K2 `FeatureKey` / `require_feature` and K3 `useHasFeature` / `FeatureGate` seams.
- "start as beta and then release to everyone": K1 (seed in beta), K2 + K4 (release, move back, list kept).
- Clarification 2026-10-14, "features is granted to admins automatically, but it can also be disabled by them in the admin panel": K2 (admin default, opt-out in the rule and the API), K4 ("Your access" switch, reasons).
