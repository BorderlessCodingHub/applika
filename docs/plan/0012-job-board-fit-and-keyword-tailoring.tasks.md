# Tasks 0012 — Job board from Ían Muliterno's contribution: fit, keyword tailoring, drafts

PRD: docs/prd/0012-job-board-fit-and-keyword-tailoring.md   Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md
ADRs bound: 0016, 0017 (drafted by this feature, both Accepted 2026-10-11); 0001, 0003, 0004, 0005, 0006, 0007 (amended by 0017), 0009, 0010 (amended by 0016), 0014, 0015. All read Accepted (checked 2026-10-11).

## Order
K1 history import (R0) → K2 Release A migration → K3 keyword fit + Tailor by keywords API → K4 worker, scrapers, recompute, admin sources API → K5 jobs API, dismiss, saved searches, job → draft → K6 web job board → K7 web CV-page tailoring + fit, admin Jobs, jobs E2E → K8 closing (Release B)

- **Slices.** K1..K8, set 2026-10-12.
- **Cap.** None given for 0012. Owner capped 0010 at 5 and 0011 at 6. This set is 8:
  - S1 = K1 (own slice, asked). S2 = K2 (Release A). S4 = K3, S3 = K4, S5 = K5. S6 splits: board = K6; CV page + admin + S7 E2E = K7. Closing = K8.
  - Under a cap of 6: fold K3 into K4 and K6 into K7.
  - Stories stay `[USn]` tags. Slice grouping wins over the one-story, one-day rule (owner precedent).
- **Priority bent once.** K3 (US3 fit, US5 tailoring) before K4 (US2 collection): `recompute_fit` in K4 calls `keyword_fit` from K3. US8 (P3) API rides K4 (it reads the run outcome K4 writes); its screen rides K7.
- **deps:** K1 none; K2 none; K3 = K2; K4 = K3; K5 = K3 + K4; K6 = K5; K7 = K4 + K6; K8 = K1 + K7.
- **Branches.**
  - K1: its own slice branch, cut from `develop`. Independent of the rebuild.
  - K2..K8: one branch, `integration/0012-job-board`, cut from `develop` by K2. Later slices build on it.
  - `develop` = `d82ba48` (0011 merge, unpushed) on 2026-10-11.
- **AC.** PRD requirement sentence verbatim, `R-nnn` prefix dropped (house precedent). R-017 and R-023 keep their sub-items inline as ` - `. Rule ACs carry their rule path. A slice carrying one side of a requirement says so on its covers line.
- **Co-author.** Every commit that ports logic from `e670914` carries `Co-authored-by: Ían Muliterno <iannimuliterno@gmail.com>` (R-003, ADR-0017). His files are read with `git show e670914:<path>`, ported, never copied whole.

### Releases (runbook rule 4, expand first, code second)
- **R0 = K1.** Any time, apart from the rebuild (PRD Assumption).
  - Tag `0012-history-import` (local, annotated) on the K1 tip.
  - Owner merges it into `develop` with `git merge --no-ff`. **Never squash, never rebase: his commits vanish.** `develop` → `main` by merge commit (human).
  - Net diff: one `backend/CHANGELOG.md` line. Nothing runs, nothing migrates. His revision `a2b3c4d5e6f7` exists only between the merge and the revert.
- **A = K2.** Commits touch only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`. Tag `0012-release-a` on the K2 tip.
  - Owner: merge `0012-release-a` into `develop` → release → CD deploys → `alembic upgrade head` in the API container → restart → confirm.
  - Old code on the new schema: new tables, one nullable `applications.job_id`; the old ORM maps none.
  - Between A and B, Himalayas and RemoteOK show as public platforms in every picker and in `/supports` (unless a same-name public platform existed; it is reused). PRD Assumption: "Each source maps to a platform visible to everyone, added by the database change."
- **B = K3..K8.** Tag `0012-release-b` on the K8 tip. K3..K7 tips are not merge points.
  - Owner merges B only after confirming A's `alembic upgrade head` ran.
  - Before the B deploy, the owner adds `worker` and `scheduler` to the swarm stack (image `api-latest`, the API's env; commands in ADR-0016; scheduler exactly 1 replica, worker 1 replica per plan Open 2) and sets repo vars `SWARM_WORKER_SERVICE_NAME`, `SWARM_SCHEDULER_SERVICE_NAME`. The CD guard skips missing services; jobs stay empty until both run.
- **Rollback.**
  - B: previous API image; scale `worker` and `scheduler` to 0.
  - A, only after B is rolled back: `alembic downgrade 3b78c3cd2a71` + previous image. Five tables → `*_old`, `applications.job_id` → `job_id_old`; seeded platforms stay.
- Build never waits for prod; merge does. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`.

### Plan corrections (checked against the code, 2026-10-11)
1. **Plan header stale.** It reads PRD "(Draft)", 0016 "(Proposed)", 0017 "(Proposed)". The PRD reads Approved; both ADRs read Accepted 2026-10-11. K8 T109 fixes the header lines.
2. **Head and pin.** Head is `3b78c3cd2a71` (verified). `test_only_one_head` pins it in `backend/tests/integration/test_timeline_contract_migration.py` l.829; K2 moves the pin.
3. **Ían's branch.** `../applika-gh` (beside the repo) holds `job_scrapping` = `e670914131c9b9649647cc2e297feebd33867c93`, pushed to `IanniMuliterno/applika`. Port sources: `backend/app/application/services/{keywords_service,cv_tailor_service}.py`, `backend/app/application/services/job_ingestion/scrapers/{base,himalayas,remoteok,registry}.py`, `backend/tests/unit/test_himalayas_scraper.py`, `backend/app/application/use_cases/jobs/{list_jobs,get_job,create_application_from_job}.py`, `backend/app/presentation/api/admin/jobs.py`, `frontend/src/components/jobs/{job-filters,job-card,job-list,job-detail-sheet}.tsx`, `frontend/src/services/{types/jobs,implementations/job-service}.ts`, `frontend/src/hooks/use-jobs.ts`.
4. **No PR.** Plan S1's "PR body names Ían, links his upstream PR, lists exceptions" becomes the annotated tag message and the backend changelog line. "Merges with a merge commit" becomes the owner's `git merge --no-ff`.
5. **"One transaction" for job → draft.** Every repository commits inside its own method (`ApplicationRepository.create_draft` l.126, `TailoredCVRepository.create` l.92). K5 uses the shared-session, single-commit pattern of `use_cases/compat/legacy_finalize.py`: the draft is added and flushed without a commit, and the copy's create commits both. A private company made by `resolve_company` commits first; on a later failure it stays private and is reused next time.
6. **R-021 "offers to open the one that exists".** The plan's 409 is a fixed string with no id. The web reads the existing application from `JobSummary.application`; on a 409 it refetches `GET /jobs/{id}` and offers "Open draft" / "Open application". No body change.
7. **R-025 "the comparison shows those moves".** `backend/app/application/services/cv_diff.py` and `frontend/src/components/tailored-cvs/cv-diff.ts`, pinned to each other by `fixtures/cv-diff/`, match items by id and keywords as a set. A category or keyword reorder is zero changes; a bullet reorder is one "changed" bullets value. The plan has no step. K7 lists the copy's `adjustments` in the comparison while "Show changes" is on. The diff semantics and fixtures stay untouched. Frontend `CLAUDE.md` says `adjustments` "render NOWHERE"; K7 changes that line for `adjustments` only.
8. **Nav order pinned twice.** Plan: Jobs after Applications. `frontend/src/components/layout/sidebar-nav.test.tsx` l.250-255 pins CVs right after Applications (an earlier choice, no PRD line). `frontend/e2e/shell-responsive.spec.ts` l.42-50 `PRIMARY_LABELS` pins seven entries. Frontend `CLAUDE.md` says "seven" (l.133, l.1552). The plan wins; K6 updates all three.
9. **Compose and CD missing from the plan's S3 list.** ADR-0016 requires guarded updates in `.github/workflows/backend-cd.yaml` and the two services in the dev and e2e compose files. K4 does `backend-cd.yaml` and `docker-compose.yml`; K7 does `docker-compose.e2e.yml`.
10. **Fixture data is not in the image.** `backend/Dockerfile` copies only `app/`, `migrations/`, `alembic.ini`. The fixture JSON lives in `backend/tests/fixtures/jobs/postings.json` (K4). The e2e compose mounts it read-only and points `JOBS_FIXTURE_PATH` at the mount (K7). The plan does not say which source a fixture run fills: with `JOBS_SCRAPERS=fixture`, the fixture scraper serves every enabled source from the file, keyed by source code.
11. **E2E scheduler.** An hourly cron could fire mid-suite. The e2e compose sets `JOBS_INGEST_CRON` to a value that does not fire during a run (e.g. `0 0 1 1 *`). The spec starts the run with `POST /admin/jobs/runs` and polls `GET /admin/jobs/sources`.
12. **API boot without Redis.** The lifespan starts the broker; ADR-0016 says the API keeps serving when Redis is down. K4 proves startup does not fail with Redis unreachable; an enqueue failure is a WARNING (master CV save) or 503 (run now).
13. **A source's platform is deletable.** The admin platform delete is blocked only by applications (`AdminRepository.count_entity_references`, l.603). A deleted platform sets `job_sources.platform_id` NULL and breaks job → draft (R-019). K4 counts `job_sources` too.
14. **Master CV save → jobs cache.** The plan names no web invalidation. A deleted master's fit rows go at once (FK CASCADE), but `["jobs"]` is cached 5 minutes. K6 makes `use-create-base-cv.ts`, `use-update-base-cv.ts`, `use-delete-base-cv.ts` invalidate `["jobs"]` and `["job"]`.
15. **Names the plan omits.**
    - Backend: DTOs `app/application/dto/job.py`, `job_search.py` (ADR-0001: use cases return DTOs); admin use cases `use_cases/admin/jobs/*` (precedent `use_cases/admin/platforms/`).
    - 503 has no domain exception (`app/core/exceptions.py`; `account_link.py` raises `HTTPException` in the route). K4 adds `ServiceUnavailable` → 503 in `app/core/exceptions.py` + `app/presentation/handlers.py`.
    - Web: `hooks/use-jobs.ts`, `hooks/use-job-searches.ts`, `hooks/use-application-cv-fit.ts` (new); `hooks/use-create-tailored-cv.ts` takes `tailoring`. Admin sources go through `admin-service.ts`, `types/admin.ts`, `hooks/use-admin.ts` (no `i-admin-service.ts`, 0010 precedent), key `["admin", "job-sources"]`.
16. **"Not offered", not "off".** Plan: the switch is "off without JD". PRD edge: "the choice is not offered"; R-026: "offered only when". K6 and K7 do not render it without a JD.
17. **Filters in the URL on a static export.** Frontend `CLAUDE.md`: `router.replace()` to the same pathname with only a new query is a no-op. K6 writes filters with `window.history.pushState`/`replaceState` and reads them with `useSearchParams`.
18. **No user-level source list.** The contract has no non-admin route listing sources. The PRD fixes two sources (non-goal "Sources other than Himalayas and RemoteOK"), so K6 keeps a constant `JOB_SOURCES` in `services/types/jobs.ts`.
19. **Small semantics the plan leaves open, decided here.**
    - Tag filter: a job matches when it carries every chosen tag (`tags @> :tags`).
    - `min_fit`: a job with no fit is excluded.
    - Job → draft with no master CV picked: the web still lands on `step=cv` (the draft already has company, role and platform; the CV step shows the picker).
    - `update_draft` (full replace) never clears `job_id`; it is not part of `DraftInput`.
20. **R-018 wording.** "the user's own company with the same name and website is reused". `resolve_company` reuses any visible match, public preferred (PRD 0010 R-021), which R-018 cites. K5 calls `resolve_company` unchanged.
21. **Field limits.** `applications.role` 200, `company_name` 200 (`ApplicationModel` l.500/516, `DraftInput`), `link_to_job` 2083, `job_description` ≤ 50000 (`DraftInput`). Jobs: `title` 500, `company_name` 300. K5 cuts on copy (edge "cut to fit").
22. **Amended ADRs carry no "Amended by" line.** ADR-0007 and ADR-0010 status lines are silent. Precedent ADR-0002 l.3. K3 and K4 append one line each; the Decision text stays.
23. **Admin route lists in E2E.** `e2e/admin-gating.spec.ts` and `e2e/smoke.spec.ts` list admin routes (0009 precedent). K7 adds `/admin/jobs` and `/jobs`.
24. **ty baseline** 171, only ratchets down; every file a slice creates or changes is clean. Coverage ≥ 90%. `cloudscraper` is untyped: it stays behind one typed wrapper.

## K1 — History import: merge and revert Ían Muliterno's job_scrapping (R0)   side: both (git only)   covers: R-001, R-002, R-003 (origin and credit; co-author trailers K3..K6)   deps: —
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: Q4 "Full revert (Recommended)". Assumptions: "The history import ships as its own change, at any time, apart from the rebuild."; "No `.mailmap` entry"; one backend changelog line ("history import, no behaviour change").
Covers: R-001, R-002, R-003 (origin and credit)
Release: R0. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## S1`. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- backend/CHANGELOG.md (one line; every other path nets to zero)
- transient, between merge and revert only: the 7 conflict files of T003
Pattern:
- docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## S1`
- ../applika-gh (branch `job_scrapping`, head `e670914131c9b9649647cc2e297feebd33867c93`, pushed to `IanniMuliterno/applika`)
Contract: none. No route, no schema, no migration runs.
Steps:
- T001 [US1] Base and branch:
  - `git rev-parse --short develop` → `d82ba48` (0011 merge). Otherwise stop and ask the owner which base.
  - cut the slice branch from develop.
- T002 [US1] Fetch and count:
  - `git fetch ../applika-gh job_scrapping`; `git cat-file -t e670914` → `commit`.
  - `git log --format='%h %an %ad %s' --author=Muliterno develop..e670914` → 10 lines. Keep the list for T005, T009.
- T003 [US1] Merge, no fast-forward:
  - `git merge --no-ff e670914 -m "chore(jobs): merge job_scrapping by Ían Muliterno"`.
  - 7 conflicts, keep both sides, mechanical: `backend/app/domain/models.py`, `backend/app/main.py`, `backend/app/presentation/api/admin/__init__.py`, `backend/app/presentation/dependencies.py`, `backend/pyproject.toml`, `backend/uv.lock`, `frontend/src/services/services.ts`. `frontend/src/components/layout/app-layout.tsx` → keep our delete (`git rm`).
  - A different conflict set → stop, report.
  - Never run, test, lock or migrate this state. His revision `a2b3c4d5e6f7` lives only here.
- T004 [US1] Revert the whole merge, same change: `git revert -m 1 --no-commit HEAD && git commit -m "revert(jobs): revert job_scrapping; rebuilt in feature 0012"`.
- T005 [US1] Prove net zero (R-002) and authorship (R-001):
  - `git diff develop HEAD` → empty;
  - `grep -rn a2b3c4d5e6f7 backend/migrations/versions/` → none; `cd backend && uv run alembic heads` → `3b78c3cd2a71` only;
  - `git log --author=Muliterno --format='%h %an %ad %s' develop..HEAD` = the T002 list (author, date and message unchanged);
  - `git rev-parse HEAD~1^2` → `e670914…` (the merge's second parent is his tip).
- T006 [US1] backend/CHANGELOG.md `## [Unreleased]` Added: `- history import of Ían Muliterno's job_scrapping (his upstream pull request, head IanniMuliterno/applika:job_scrapping), no behaviour change.` Commit `docs(backend): changelog entry for the job_scrapping history import`. Then `git diff develop HEAD --name-only` → `backend/CHANGELOG.md` only.
- T007 [US1] Commit-format exception: the `branches-and-commits.md` verify command prints exactly his 10 subjects and nothing else (plan S1 exception). No `.mailmap`.
- T008 [US1] Gate on code equal to develop:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`;
  - `git status --porcelain` empty afterwards.
- T009 [US1] Record and close:
  - annotated tag `0012-history-import` on the K1 tip. The message names Ían Muliterno, his 10 commits (the T002 list), his upstream pull request (head `IanniMuliterno/applika:job_scrapping`) as the origin of feature 0012, the two exceptions (10 subjects outside the commit format; `a2b3c4d5e6f7` only between merge and revert), and "merge with `git merge --no-ff`; never squash, never rebase; develop → main by merge commit (human)";
  - the owner merges at any time, apart from the rebuild; the agent never touches `main`.
AC:
- Applika's main development history contains every commit of Ían Muliterno's `job_scrapping` branch, with its original author, date and message. The commits come in through one merge, followed in the same change by one revert that undoes the whole merge.
- After R-001 the product's code and behaviour equal what they were before it. Nothing from the branch runs, and none of its database changes reaches any database.
- Every later change that ports logic from his branch names him as co-author. This PRD names his pull request as the origin of the feature.
- `backend/CHANGELOG.md` records every backend change. (.claude/rules/changelogs.md 2)
- `develop` to `main` is a human release. An agent never opens, merges or pushes to `main`. (.claude/rules/branches-and-commits.md 4)

## K2 — Release A migration: job board tables, applications.job_id, source platforms   side: backend   covers: R-019 (seeded platforms; delete guard K4), R-036 (Release A)   deps: —
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: Assumptions "Each source maps to a platform visible to everyone, added by the database change. A visible platform with the same name, ignoring case, is reused."; "One application per user per job."
Covers: R-019 (seeded platforms), R-036 (Release A)
Release: A. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## Data`, `## Releases`. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- backend/migrations/versions/<rev>_job_board.py (new)
- backend/tests/integration/test_migration_job_board.py (new)
- backend/tests/integration/test_timeline_contract_migration.py
- backend/CHANGELOG.md
Pattern:
- backend/migrations/versions/3b78c3cd2a71_catalog_visibility_and_drafts.py (`*_old` re-adopt on upgrade, docstring shape)
- backend/tests/integration/test_migration_catalog_visibility_drafts.py (round trip)
- backend/migrations/versions/b2c3d4e5f6a1_company_changes_in_applications.py (`generate_snowflake_id` inside a migration)
Contract: no route. Release A: the image ships this revision, app code unchanged.
Steps:
- T010 [US2] Branch, head:
  - no `integration/0012-job-board` yet → `git switch -c integration/0012-job-board develop`;
  - `grep -rn "^down_revision" backend/migrations/versions/` → one head, `3b78c3cd2a71`.
- T011 [US2] Create backend/migrations/versions/<rev>_job_board.py (new), `down_revision = '3b78c3cd2a71'`. Every table: `id BIGINT` PK (snowflake, no sequence), `created_at`, `updated_at` as the other tables. upgrade(), `job_sources`:
  - `code varchar(50) NOT NULL UNIQUE`, `name varchar(100) NOT NULL`, `base_url varchar(500) NOT NULL`, `platform_id BIGINT NULL` FK `platforms.id` ON DELETE SET NULL, `is_enabled BOOLEAN NOT NULL server_default true`, `last_run_at timestamptz NULL`, `last_run_status varchar(20) NULL` CHECK in (`ok`, `failed`, `blocked`), `last_run_error text NULL`, `last_run_found int NULL`, `last_run_saved int NULL`;
  - seed `himalayas` / "Himalayas" / `https://himalayas.app` and `remoteok` / "RemoteOK" / `https://remoteok.com`, ids from `generate_snowflake_id()`;
  - `platform_id` = the public platform with the same `lower(name)` (lowest id); none → insert a public platform (`id` snowflake, `name`, `url` = `base_url`, `is_public` true, `created_by` NULL) (R-019, edge "that platform is reused").
- T012 [US2] Same revision, `jobs`:
  - `source_id BIGINT NOT NULL` FK `job_sources.id` ON DELETE RESTRICT, `external_id varchar(500) NOT NULL`, `title varchar(500) NOT NULL`, `company_name varchar(300) NOT NULL`, `company_url varchar(2083) NULL`, `location_text varchar(300) NOT NULL server_default 'Remote'`, `job_url varchar(2083) NOT NULL`, `description_text text NOT NULL`, `employment_type varchar(100) NULL`, `salary_text varchar(200) NULL`, `tags text[] NOT NULL server_default '{}'`, `keywords jsonb NOT NULL server_default '[]'`, `content_hash varchar(64) NOT NULL`, `posted_at timestamptz NULL`, `first_seen_at`, `last_seen_at timestamptz NOT NULL`, `is_active BOOLEAN NOT NULL server_default true`;
  - `uq_jobs_source_external (source_id, external_id)`; `ix_jobs_active_posted (is_active, posted_at DESC)`; GIN `ix_jobs_tags (tags)`.
- T013 [US3] Same revision, `job_fit_scores`: `user_id` FK users CASCADE, `job_id` FK jobs CASCADE, `base_cv_id` FK base_cvs CASCADE, `score smallint NOT NULL` CHECK `score BETWEEN 0 AND 100`, `computed_at timestamptz NOT NULL`; `uq_job_fit_scores_cv_job (base_cv_id, job_id)`; `ix_job_fit_scores_user_job (user_id, job_id)`.
- T014 [US6] [US7] Same revision:
  - `job_dismissals`: `user_id`, `job_id` FKs CASCADE; `uq_job_dismissals_user_job (user_id, job_id)`;
  - `saved_job_searches`: `user_id` FK CASCADE, `name varchar(100) NOT NULL`, `filters jsonb NOT NULL`; unique index `uq_saved_job_searches_user_name (user_id, lower(name))`.
- T015 [US4] Same revision: `applications.job_id BIGINT NULL` FK `jobs.id` ON DELETE SET NULL; partial unique `uq_applications_user_job (user_id, job_id) WHERE job_id IS NOT NULL`. Nullable, no default: old code never writes it.
- T016 [US2] Re-upgrade after a downgrade (precedent `3b78c3cd2a71`): an existing `<table>_old` is renamed back, not created; `job_id_old` is renamed back; indexes are created after; the seed is `ON CONFLICT (code) DO NOTHING` and repeats the platform lookup.
- T017 [US2] downgrade():
  - drop the indexes this revision created (they return on re-upgrade); keep PKs, FKs and CHECKs;
  - rename `job_sources`, `jobs`, `job_fit_scores`, `job_dismissals`, `saved_job_searches` → `*_old`; `applications.job_id` → `job_id_old`. Every row stays;
  - the seeded platforms stay (plan Data);
  - the docstring cites non-destructive rules 1, 2, 3, 5, 7; runbook 4; ADR-0005; ADR-0016 (worker code ships in B).
- T018 [P] [US2] Round trip in backend/tests/integration/test_migration_job_board.py (new): testcontainers Postgres, real chain. Seed at `3b78c3cd2a71`: users A and B, a public platform named "himalayas" (lower case), applications, base CVs.
  - **upgrade:**
    - two sources; `himalayas` reuses the existing public platform (case-insensitive); `remoteok` gets a new public platform, `created_by` NULL, url `https://remoteok.com`;
    - an old-shape `INSERT INTO applications` (no `job_id`) works;
    - jobs, fits, dismissals, searches and `applications.job_id` insert;
    - the same `(source_id, external_id)` twice → IntegrityError;
    - a second application of A for the same job → IntegrityError; two with `job_id` NULL → fine; B for the same job → fine;
    - `score` 101 → IntegrityError;
    - a saved search name differing only in case, same user → IntegrityError; another user → fine;
    - deleting a base CV removes its fit rows; deleting a job used by an application sets `job_id` NULL;
    - no table or column is missing.
  - **downgrade:** the five `*_old` tables and `applications.job_id_old` hold every row; the other `applications` columns are intact; the seeded platforms remain; no new index remains.
  - **upgrade again:** names back, rows equal to the first upgrade, indexes equal, no second source or platform.
- T019 [US2] backend/tests/integration/test_timeline_contract_migration.py `test_only_one_head`: pin `3b78c3cd2a71` → `<rev>`; assert `down_revision == '3b78c3cd2a71'`; keep the chain walk.
- T020 [US2] backend/CHANGELOG.md `## [Unreleased]` Added: `- tables job_sources, jobs, job_fit_scores, job_dismissals, saved_job_searches and applications.job_id; Himalayas and RemoteOK sources seeded, each with a public platform (an existing public one with the same name is reused); no code reads them yet (Release A).` No CLI entry: no route or field changes; `/supports` may list two more public platforms.
- T021 [US2] Verify:
  - `grep -nE "op\.drop_(column|table)"` on the revision → no hit in `upgrade()`;
  - `grep -rn "_old" backend/app/` → none;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`;
  - `uv run pytest tests/integration -k migration`.
- T022 [US2] Release A shape:
  - backend/app/domain/models.py maps none of the new objects; backend/tests/conftest.py is unchanged;
  - `git diff develop --name-only` lists only `backend/migrations/versions/`, `backend/tests/integration/` and `backend/CHANGELOG.md`.
- T023 [US2] Gate, record, close:
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171, changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - tag the K2 tip `0012-release-a`; the owner steps of `### Releases`; rollback `alembic downgrade 3b78c3cd2a71` + previous image; the agent never touches prod.
AC:
- Each source appears as a platform that every user sees, named after the source.
- Database changes reach production in a release before the code that uses them. Every flow that works today keeps working between the two releases.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)

## K3 — Keyword fit and Tailor by keywords: /cv tailoring, /cv/fit   side: backend   covers: R-003 (co-author), R-013, R-014, R-023, R-024, R-025 (records the moves; display K7), R-026 (API: default copy, opt-in keywords), R-027, R-028 (API)   deps: K2
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: Q1 "Fit + keyword reorder (Recommended)"; "Amend via ADR 0017 (Recommended)"; "Opt-in action (Recommended)".
Covers: R-003 (co-author), R-013, R-014, R-023, R-024, R-025 (records), R-026 (API), R-027, R-028 (API)
Release: B. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## Backend` S4, `## Contract`. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- backend/app/application/services/keyword_fit.py (new)
- backend/app/application/services/keyword_tailoring.py (new)
- backend/app/application/services/tailoring.py (docstring)
- backend/app/application/services/clone_tailoring.py (docstring)
- backend/app/application/dto/tailored_cv.py
- backend/app/application/use_cases/tailored_cvs/create.py
- backend/app/application/use_cases/tailored_cvs/fit.py (new)
- backend/app/presentation/dependencies.py
- backend/app/presentation/schemas/tailored_cv.py
- backend/app/presentation/api/tailored_cv.py
- backend/tests/unit/test_keyword_fit.py (new)
- backend/tests/unit/test_keyword_tailoring.py (new)
- backend/tests/unit/test_tailored_cvs_uc.py
- backend/tests/integration/test_tailored_cv_api.py
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md
- backend/CHANGELOG.md
- cli/CHANGELOG.md
- docs/adr/0007-product-and-schema-convergence.md (status line only)
Pattern:
- backend/app/application/services/clone_tailoring.py, tailoring.py (the port, a `Protocol`)
- backend/app/application/use_cases/tailored_cvs/create.py (check order, snapshot before the port)
- `git show e670914:backend/app/application/services/keywords_service.py` and `…:backend/app/application/services/cv_tailor_service.py` (Ían; port, never copy whole)
- docs/adr/0017-keyword-tailoring-and-fit-score.md (the rules); docs/adr/0002-github-oauth-sole-login.md l.3 ("Amended by" shape)
Contract (K5, K6, K7 consume):
- `POST /applications/{id}/cv` `{base_cv_id, tailoring?: 'copy' | 'keywords' = 'copy'}` → 201 TailoredCV. `keywords` → reordered content, `adjustments` `[{section, description}]`, `was_ai_generated` false. Existing 404/409/422 unchanged, plus 422 'Add a job description to tailor by keywords'. No `tailoring` = verbatim copy (installed CLIs).
- `GET /applications/{id}/cv/fit` → 200 `{score: int | null, matched_keywords: string[], missing_keywords: string[]}` (`null`, `[]`, `[]` on a blank JD) | 404 not owned or no copy. Drafts allowed (ADR-0014 `cv*`). No finalized or archived guard (a read).
Steps:
- T024 [US3] Build on integration/0012-job-board after the K2 tip.
- T025 [US3] Create backend/app/application/services/keyword_fit.py (new), pure, no I/O (R-013, R-014). Port of Ían's `keywords_service.py`:
  - `job_keywords(text, tags) -> list[str]`: lower-case word tokens, English stop words removed; the 25 most frequent terms and the 25 most frequent word pairs (frequency desc, then alphabetical); plus the tags (trimmed, lower case); de-duplicated, stable order;
  - `cv_text(content) -> str` over headline, summary, skill keywords, experience roles and bullets, project names and descriptions, certifications (ADR-0017 list). Takes a `TailoredCVContent` or a `BaseCVDTO`;
  - `score_fit(keywords, text) -> FitResult(score: int | None, matched: list[str], missing: list[str])`: whole word or whole phrase, case-insensitive; `round(100 × matched ÷ len(keywords))`, 0..100; no keywords → `score=None`;
  - commit with the `Co-authored-by` trailer.
- T026 [P] [US3] backend/tests/unit/test_keyword_fit.py (new):
  - 0 and 100; rounding; the same input twice → the same output;
  - stop words dropped; a word pair counted; a tag counted even when absent from the text;
  - one test per CV field that counts; email, education, languages and links never count;
  - case-insensitive; blank text and no tags → `None`.
- T027 [US5] Create backend/app/application/services/keyword_tailoring.py (new), `KeywordTailoringService` implementing `TailoringService` (port unchanged). Port of Ían's `cv_tailor_service.py`:
  - start from `CloneTailoringService().tailor(request)`; match terms = `job_keywords(request.job_description, [])`;
  - reorder only: keywords inside each skill category (matched first), skill categories (more matches first), bullets inside each experience entry (more matches first); stable sort, ties keep the master's order (R-023);
  - never add, remove or rewrite text; experience entries, education, projects, certifications, languages and links keep their order (R-024);
  - `was_ai_generated=False`; `adjustments` = one `{section, description}` per section actually reordered, e.g. `{section: 'skills', description: 'Skill categories and keywords reordered by job match'}`, `{section: 'experience', description: 'Bullets reordered by job match in 2 entries'}`; none when nothing moved (R-025);
  - a blank JD → exactly the clone's result;
  - commit with the `Co-authored-by` trailer.
- T028 [P] [US5] backend/tests/unit/test_keyword_tailoring.py (new):
  - every section's text multiset equals the master's (`Counter` over every string) (R-024);
  - ties stable; entries of every section in the master's order;
  - blank JD == clone (content and `adjustments == []`); a JD matching nothing → no adjustments;
  - `adjustments` name exactly the sections moved; `was_ai_generated` false;
  - the module imports only stdlib and `app` (no network, no model).
- T029 [US5] Resolver in backend/app/presentation/dependencies.py: `get_tailoring_service()` becomes `get_tailoring_resolver()` → `Callable[[Literal['copy', 'keywords']], TailoringService]` (`copy` → clone, `keywords` → keyword binding); `TailoringResolverDp`. The clone stays the default.
- T030 [US5] Use case:
  - backend/app/application/dto/tailored_cv.py: `TailoredCVCreateDTO.tailoring: Literal['copy', 'keywords'] = 'copy'`; `CVFitDTO`;
  - backend/app/application/use_cases/tailored_cvs/create.py takes the resolver. Order: 404 application → 422/409 editable → `keywords` with a blank `job_description` → `BusinessRuleViolation('Add a job description to tailor by keywords')` → 404 base CV → 409 existing copy → tailor → write. The log adds `tailoring`. A refusal writes nothing.
- T031 [US5] backend/app/presentation/schemas/tailored_cv.py: `TailoredCVCreate.tailoring: Literal['copy', 'keywords'] = 'copy'` (`extra='forbid'` kept). backend/app/presentation/api/tailored_cv.py passes it. A body without `tailoring` → copy (R-027).
- T032 [US5] Fit (R-028):
  - `GetTailoredCVFitUseCase` in backend/app/application/use_cases/tailored_cvs/fit.py (new): `load_owned_application` (drafts included) → the copy, else the same 404 as `GET /cv` → blank JD → `(None, [], [])` → else `score_fit(job_keywords(JD, []), cv_text(copy))`;
  - `CVFit` schema; `GET /{application_id}/cv/fit` in api/tailored_cv.py.
- T033 [P] [US5] Tests:
  - backend/tests/unit/test_tailored_cvs_uc.py: resolver default copy; `keywords` without a JD → 422 and repo `create` never called; `keywords` with a JD → the keyword binding runs, `was_ai_generated` false; `test_clone_copies_every_content_field` still green.
  - backend/tests/integration/test_tailored_cv_api.py:
    - a CLI-shaped body `{base_cv_id}` → content equals the master, `adjustments == []` (R-027);
    - `tailoring: 'keywords'` → reordered, same text, `adjustments` non-empty; `/cv/diff/markdown` still 200;
    - `keywords` without a JD → 422 with the message, no row; `tailoring: 'ai'` → 422;
    - `/cv/fit` on an application and on a draft → 200, 0..100, lists; blank JD → `score` null; no copy → 404; another user's → 404; two calls → the same body.
- T034 [US5] backend/scripts/seed_mock_data.py `seed_application_cv()`: one application with a JD gets `tailoring: 'keywords'`; assert `adjustments` non-empty and `was_ai_generated` false; assert `GET /cv/fit` score in 0..100.
- T035 [US5] Docs:
  - backend/CLAUDE.md: "The Tailoring Port" → two bindings, a per-request resolver, the clone by default, ADR-0017; the TailoredCV note "always `false` / `[]` today" → `adjustments` filled by the keyword binding; the Application CVs table gains `tailoring` and `GET /{id}/cv/fit`; a Seed Script Rule bullet for `keywords` and `/cv/fit`.
  - docs/adr/0007-product-and-schema-convergence.md status line: append ` · Amended by ADR-0017 on 2026-10-11 (tailoring binding line, ATS non-goal)`. The Decision text is untouched.
- T036 [US5] Changelogs:
  - backend/CHANGELOG.md Added: `- keyword tailoring binding (ADR-0017) and GET /applications/{id}/cv/fit.` Changed: `- POST /applications/{id}/cv takes an optional tailoring ("copy" default, "keywords").`
  - cli/CHANGELOG.md `## [Unreleased]` Changed: `- POST /applications/{id}/cv accepts an optional tailoring field; without it the copy stays verbatim, so 0.1.4, 0.2.0, 1.0.0 and 1.0.1 are unaffected. A copy made with "keywords" in the web carries non-empty adjustments (a read-only key). New GET /applications/{id}/cv/fit.`
- T037 [US5] Checks, gate, close:
  - `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli;
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171, new and changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - `git log develop..HEAD --format='%h %(trailers:key=Co-authored-by)' -- backend/app/application/services/keyword_fit.py backend/app/application/services/keyword_tailoring.py` names Ían on every commit;
  - The K3 tip is not a merge point.
AC:
- Every later change that ports logic from his branch names him as co-author. This PRD names his pull request as the origin of the feature.
- The fit of a CV for a job is a whole number from 0 to 100. It is the share of the job's keywords that appear in the CV's text. The job's keywords are its most frequent terms and word pairs, plus its tags. The CV's text is its headline, summary, skill keywords, experience roles and bullets, projects and certifications.
- Fixed rules compute the fit. The same CV and job always give the same score, and no AI or outside service is involved.
- "Tailor by keywords" first makes the same full copy as the verbatim copy. It then reorders three things by how well they match the job description: - keywords within each skill category, matched ones first; - skill categories, the ones with more matches first; - bullets within each experience entry, the ones with more matches first. Ties keep the master CV's order.
- Tailoring by keywords never adds, removes or rewrites any text. It never reorders experience entries or other sections, uses no AI, and marks the copy as not AI-generated.
- The copy records what was reordered in each section. The existing comparison with the master CV (PRD 0007 R-023) shows those moves.
- The verbatim copy stays the default everywhere. "Tailor by keywords" is an opt-in choice, in the job flow and on the application CV page, offered only when the application has a job description.
- Command-line clients that create a CV copy keep getting a verbatim copy, and keep working unchanged.
- The application CV page, for applications and drafts alike, shows the fit of the CV copy against the application's job description, with matched and missing keywords. This holds whether or not the application came from a job. With no job description, the page shows no fit.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K4 — Background collection: taskiq worker, scrapers, fit recompute, admin sources API   side: backend (+ compose, CD)   covers: R-003 (co-author), R-004, R-005, R-006, R-007 (deactivation), R-008, R-009, R-016, R-019 (delete guard), R-033, R-034, R-035 (API halves)   deps: K3
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: Q2 "separate service, taskiq worker using redis as broker scheduled to run hourly"; Q3 "Keep cloudscraper". Plan Open, owner at approval: broker on the same `REDIS_URL`, queue `applika:tasks`; one worker replica.
Covers: R-003 (co-author), R-004, R-005, R-006, R-007 (deactivation), R-008, R-009, R-016, R-019 (delete guard), R-033, R-034, R-035 (API)
Release: B. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## Backend` S3, `## Contract`, `## Risks`. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- backend/pyproject.toml, backend/uv.lock
- backend/app/config/settings.py
- backend/app/core/exceptions.py, backend/app/presentation/handlers.py (`ServiceUnavailable` → 503)
- backend/app/worker/__init__.py, broker.py, tasks.py, queue.py (new)
- backend/app/application/services/job_queue.py (new)
- backend/app/application/services/job_ingestion/__init__.py (new)
- backend/app/application/services/job_ingestion/scrapers/__init__.py, base.py, himalayas.py, remoteok.py, fixture.py, registry.py (new)
- backend/app/application/dto/job.py (new)
- backend/app/application/use_cases/jobs/__init__.py, ingest_jobs.py, recompute_fit.py (new)
- backend/app/application/use_cases/admin/jobs/__init__.py, list_sources.py, update_source.py, start_run.py (new)
- backend/app/domain/models.py
- backend/app/domain/repositories/job_source_repository.py, job_repository.py, job_fit_score_repository.py (new)
- backend/app/domain/repositories/admin_repository.py
- backend/app/presentation/api/admin/jobs.py (new), backend/app/presentation/api/admin/__init__.py
- backend/app/presentation/schemas/admin.py
- backend/app/presentation/api/base_cv.py
- backend/app/presentation/dependencies.py
- backend/app/main.py
- backend/tests/conftest.py
- backend/tests/fixtures/jobs/himalayas_page.json, remoteok_feed.json, postings.json (new)
- backend/tests/unit/test_himalayas_scraper.py (new, ported), test_remoteok_scraper.py (new), test_fixture_scraper.py (new), test_job_settings.py (new), test_ingest_jobs.py (new), test_recompute_fit.py (new)
- backend/tests/integration/test_worker_tasks.py (new), test_admin_jobs.py (new), test_base_cv_api.py, test_admin.py
- docker-compose.yml
- .github/workflows/backend-cd.yaml
- backend/CLAUDE.md, backend/CHANGELOG.md
- docs/adr/0010-deploy-shape.md (status line only)
Pattern:
- `git show e670914:backend/app/application/services/job_ingestion/scrapers/{base,himalayas,remoteok,registry}.py`, `…:backend/tests/unit/test_himalayas_scraper.py`, `…:backend/app/presentation/api/admin/jobs.py` (Ían; port)
- backend/app/presentation/api/admin/platforms.py + backend/app/application/use_cases/admin/platforms/ (admin router and use cases)
- backend/app/domain/repositories/application_repository.py (repository shape)
- backend/app/core/rate_limit.py (Redis call bounded, fail open, WARNING)
- backend/app/config/db.py `AsyncLocalSession` (a session per task)
- backend/tests/integration/conftest.py (`redis_client`)
- docs/adr/0016-taskiq-worker-for-background-jobs.md
Contract (K7 consumes):
- `GET /admin/jobs/sources` → 200 `[{id, code, name, base_url, platform_id, is_enabled, last_run_at, last_run_status | null, last_run_error, last_run_found, last_run_saved, active_jobs}]` | 401 | 403.
- `PATCH /admin/jobs/sources/{id}` `{is_enabled: bool}` → 200 row | 404 | 403 | 422.
- `POST /admin/jobs/runs` → 202 `{queued: true}` | 409 'A run is already in progress' | 503 'Background service unavailable' | 403.
- Worker: task `ingest_jobs` on cron `JOBS_INGEST_CRON`; task `recompute_fit(base_cv_id)`. Queue `applika:tasks`. Lock `applika:jobs:ingest:lock`.
Steps:
- T038 [US2] Build on integration/0012-job-board after the K3 tip.
- T039 [US2] backend/pyproject.toml: direct, pinned `taskiq`, `taskiq-redis`, `httpx`, `cloudscraper`; `uv lock`; `uv sync`.
- T040 [US2] Settings in backend/app/config/settings.py: `TASKIQ_BROKER_URL: str | None = None` (falls back to `REDIS_URL`), `JOBS_INGEST_ENABLED = True`, `JOBS_INGEST_CRON = '0 * * * *'`, `JOBS_LOOKBACK_DAYS = 7`, `JOBS_RETENTION_DAYS = 15`, `JOBS_SCRAPER_TIMEOUT_SECONDS = 30`, `JOBS_INGEST_LOCK_SECONDS = 900`, `JOBS_SCRAPERS = 'himalayas,remoteok'`, `JOBS_FIXTURE_PATH: str | None = None`. A validator refuses `fixture` in `JOBS_SCRAPERS` when `ENVIRONMENT == 'PROD'`. Test in backend/tests/unit/test_job_settings.py (new).
- T041 [US2] backend/app/domain/models.py: `JobSourceModel`, `JobModel` (`tags` `ARRAY(Text)`, `keywords` JSONB), `JobFitScoreModel`. `__table_args__` mirror every K2 name and predicate, so `create_all` builds the K2 schema. No `_old` mapped.
- T042 [US2] Repositories (new):
  - backend/app/domain/repositories/job_source_repository.py: `list_all`, `list_enabled`, `get`, `set_enabled`, `record_run(source_id, status, found, saved, error)`, `active_job_counts()`;
  - backend/app/domain/repositories/job_repository.py: `upsert_many(source_id, postings) -> (new_ids, changed_ids, saved)` on `(source_id, external_id)`, `deactivate_expired(now, retention_days) -> list[id]`;
  - backend/app/domain/repositories/job_fit_score_repository.py: `upsert(user_id, job_id, base_cv_id, score)`, `delete_for_jobs(ids)`, `delete(base_cv_id, job_id)`, `stale_base_cv_ids()` (a CV whose `updated_at` is past its newest `computed_at`, or with no row).
- T043 [US2] Scrapers in backend/app/application/services/job_ingestion/scrapers/ (new), ports of Ían's files:
  - `base.py`: `BaseScraper` (`code`, `async fetch(since) -> list[ScrapedPosting]`); `ScrapedPosting` with the R-006 fields (title, company_name, company_url?, location_text, employment_type?, salary_text?, tags, posted_at?, job_url, description_text as plain text with HTML stripped, external_id); `SourceBlocked`, `SourceFailed`;
  - `himalayas.py`: through `cloudscraper` behind ONE typed wrapper (sync call in `anyio.to_thread.run_sync`, timeout `JOBS_SCRAPER_TIMEOUT_SECONDS`); a Cloudflare challenge or 403 → `SourceBlocked`;
  - `remoteok.py`: `httpx.AsyncClient`, same timeout;
  - `fixture.py`: reads `JOBS_FIXTURE_PATH`, JSON `{<source_code>: [postings]}`, serves every source code from it (Plan corrections 10);
  - `registry.py`: `dict[str, BaseScraper]` by source code from `JOBS_SCRAPERS`; `fixture` → the fixture scraper for every code;
  - only postings with `posted_at` inside `JOBS_LOOKBACK_DAYS`, or with none, are returned (R-005);
  - commits carry the `Co-authored-by` trailer.
- T044 [P] [US2] Scraper tests, data in backend/tests/fixtures/jobs/ (new):
  - backend/tests/unit/test_himalayas_scraper.py: Ían's test ported to the new interface; blocked → `SourceBlocked`;
  - backend/tests/unit/test_remoteok_scraper.py (new): `httpx.MockTransport` on `remoteok_feed.json`; timeout → `SourceFailed`; HTML → plain text; an 8-day-old posting dropped;
  - backend/tests/unit/test_fixture_scraper.py (new): the file keyed by code (`postings.json`, also used by K7); a missing file → `SourceFailed`.
- T045 [US2] `IngestJobsUseCase` in backend/app/application/use_cases/jobs/ingest_jobs.py (new):
  - `JOBS_INGEST_ENABLED` false → no-op;
  - each enabled source with a registered scraper; a source that is off is skipped (R-034);
  - fetch → `upsert_many`: new → insert, `first_seen_at = last_seen_at = now`; same `content_hash` → only `last_seen_at`; changed hash → update the fields and `keywords = job_keywords(description, tags)` (K3); `keywords` also filled on insert; each field cut to its column length;
  - per source: `last_run_at`, status `ok | failed | blocked`, found, saved, and the error text (fits the column, no stack, no secret). One failing source never stops the other (R-008);
  - expiry: `is_active = false` where `coalesce(posted_at, first_seen_at) + JOBS_RETENTION_DAYS < now`; their fit rows deleted; the job rows kept (R-007);
  - then `RecomputeFitUseCase` for new and changed job ids, and for stale CVs.
- T046 [US3] `RecomputeFitUseCase` in backend/app/application/use_cases/jobs/recompute_fit.py (new):
  - given job ids → every base CV × those jobs; given a base CV id → that CV × every active job; stale CVs → as a base CV id;
  - `score_fit(job.keywords, cv_text(base_cv))`; `None` → no row (delete any); else `upsert` on `(base_cv_id, job_id)`, `user_id` = the CV's owner, `computed_at = now` (R-016).
- T047 [P] [US2] backend/tests/unit/test_ingest_jobs.py and test_recompute_fit.py (new), fakes for repos and scrapers:
  - insert, update, unchanged; a hash change refreshes keywords and triggers a recompute;
  - the same posting twice in one fetch → one row;
  - expiry by `posted_at`, and by `first_seen_at` when `posted_at` is null; expired → fit rows deleted, job kept;
  - one source raising → the other saved, `failed` recorded with its error; blocked → `blocked`;
  - a disabled source skipped; ingest disabled → no-op;
  - recompute: a new CV scores every active job; a CV edit rescored; `None` score → row removed.
- T048 [US2] Worker, ADR-0016:
  - backend/app/worker/broker.py (new): `ListQueueBroker(TASKIQ_BROKER_URL or REDIS_URL, queue_name='applika:tasks')`; `TaskiqScheduler` with `LabelScheduleSource`; no result backend;
  - backend/app/worker/tasks.py (new), thin, calling the use cases:
    - `ingest_jobs`, `schedule=[{'cron': envs.JOBS_INGEST_CRON}]`: take `applika:jobs:ingest:lock` with `SET NX EX JOBS_INGEST_LOCK_SECONDS`; held → log and return (R-009); a session from `AsyncLocalSession`; release in `finally`;
    - `recompute_fit(base_cv_id)`: its own session;
  - backend/app/application/services/job_queue.py (new): `JobQueue` Protocol with `enqueue_ingest()`, `enqueue_recompute_fit(base_cv_id)`, `ingest_running() -> bool`;
  - backend/app/worker/queue.py (new): binds `JobQueue` to taskiq and to the lock key;
  - backend/app/main.py: a lifespan that starts and stops the broker client. Redis unreachable at boot never fails startup (Plan corrections 12);
  - neither `app/worker/` nor these two use cases import an application, tailored CV or saved search repository (PRD Permissions: the background service writes jobs, sources and fit scores only). Check with `grep`.
- T049 [US2] Tests:
  - backend/tests/conftest.py: override the `JobQueue` dependency with an in-memory fake that records calls;
  - backend/tests/integration/test_worker_tasks.py (new), taskiq `InMemoryBroker`, testcontainers DB, the fixture scraper:
    - `ingest_jobs` saves jobs, records both sources, and writes fits for a seeded base CV;
    - the lock key preset on `redis_client` → nothing written;
    - `recompute_fit` upserts a row;
    - the app boots with `TASKIQ_BROKER_URL` on a closed port → `GET /api/openapi.json` 200.
- T050 [US3] Master CV save → recompute, best effort, in backend/app/presentation/api/base_cv.py:
  - POST and PATCH call `job_queue.enqueue_recompute_fit(id)` after the write; a failure logs a WARNING and the answer is unchanged;
  - DELETE: nothing; FK CASCADE removes its fits (R-016);
  - backend/tests/integration/test_base_cv_api.py: enqueue called on POST and PATCH; a raising queue → still 201/200 + WARNING (caplog); delete → fit rows gone.
- T051 [US8] Admin use cases in backend/app/application/use_cases/admin/jobs/ (new):
  - `list_sources.py` → rows + `active_jobs` (R-033);
  - `update_source.py` → `is_enabled`; unknown → 404 (R-034);
  - `start_run.py` → `ingest_running()` → `ResourceConflict('A run is already in progress')`; enqueue or Redis error → `ServiceUnavailable('Background service unavailable')` (R-035);
  - `ServiceUnavailable` in backend/app/core/exceptions.py, mapped to 503 in backend/app/presentation/handlers.py.
- T052 [US8] Routes in backend/app/presentation/api/admin/jobs.py (new), `AdminUserDp`: `GET /admin/jobs/sources`, `PATCH /admin/jobs/sources/{id}`, `POST /admin/jobs/runs` → 202. Schemas in backend/app/presentation/schemas/admin.py (`JobSourceAdminRow`, `JobSourceUpdate {is_enabled: bool}` extra forbidden, `RunQueued`). Add the router to `routers` in backend/app/presentation/api/admin/__init__.py.
- T053 [P] [US8] backend/tests/integration/test_admin_jobs.py (new):
  - non-admin → 403 on all three; anonymous → 401;
  - the list shape, `active_jobs` after a fixture ingest;
  - PATCH off → the next run skips it (`last_run_at` unchanged); unknown id → 404; a bad body → 422;
  - run → 202, the fake queue called; lock held → 409 with the message; a raising queue → 503 with the message.
- T054 [US2] R-019 guard: `AdminRepository.count_entity_references('platform', id)` also counts `job_sources.platform_id` (Plan corrections 13). backend/tests/integration/test_admin.py: deleting a source's platform is refused, as for a platform in use.
- T055 [US2] Compose and CD (ADR-0016, Plan corrections 9):
  - docker-compose.yml: `worker` (`taskiq worker app.worker.broker:broker app.worker.tasks`) and `scheduler` (`taskiq scheduler app.worker.broker:scheduler app.worker.tasks`), built from `./backend`, the API's environment, `depends_on: api: condition: service_healthy` (migrations ran), `restart: unless-stopped`, no ports;
  - .github/workflows/backend-cd.yaml deploy script: after the API update, for each of `vars.SWARM_WORKER_SERVICE_NAME` and `vars.SWARM_SCHEDULER_SERVICE_NAME`: `if [ -n "$NAME" ] && docker service inspect "$NAME" >/dev/null 2>&1; then docker service update --image <the same api-latest image> "$NAME" --force; fi`. A stack without them still deploys;
  - `docker compose config -q` passes; `docker compose up -d --build --wait` → worker and scheduler running; `POST /admin/jobs/runs` → a run in `docker compose logs worker`.
- T056 [US2] Docs:
  - backend/CLAUDE.md: a new "### Background worker (ADR-0016)" section (broker, queue, lock, a session per task, no result backend, a single scheduler, the fixture scraper refused in PROD, Redis down = runs pause while the API serves); Environment Variables: `TASKIQ_BROKER_URL`, the `JOBS_*`; Essential Commands: worker and scheduler locally; the admin jobs route table; Domain: JobSource, Job, JobFitScore and their relationships; Exception Handling: `ServiceUnavailable` → 503; File Organization: `app/worker/`, `use_cases/jobs/`;
  - docs/adr/0010-deploy-shape.md status line: append ` · Amended by ADR-0016 on 2026-10-11 (worker and scheduler services)`.
- T057 [US2] backend/CHANGELOG.md Added: `- taskiq worker and scheduler (ADR-0016): hourly Himalayas and RemoteOK collection, fit recompute, GET/PATCH /admin/jobs/sources and POST /admin/jobs/runs; TASKIQ_BROKER_URL and JOBS_* settings; CD updates the worker and scheduler services when they exist.` No CLI entry: admin routes only.
- T058 [US2] Gate, close:
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; `app/worker/` and the scrapers clean, `cloudscraper` only behind the wrapper), `uv run pytest . --cov=app` (≥ 90%);
  - `grep -rn "_old" backend/app/` → none; `uv run pytest tests -k "steps or finalize or supports"`;
  - every commit porting a scraper carries the `Co-authored-by` trailer;
  - full `scripts/e2e.sh` green (the lifespan on the e2e Redis); `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - The K4 tip is not a merge point.
AC:
- Every later change that ports logic from his branch names him as co-author. This PRD names his pull request as the origin of the feature.
- The system collects remote job postings from Himalayas and RemoteOK once an hour, in a background service apart from the web API. A slow or failing source never slows or fails a user's request.
- A run takes the postings published in the last 7 days. It adds new ones, updates changed ones, and never stores the same posting of a source twice.
- Each posting keeps its title, company, company website when given, location, employment type when given, salary text when given, tags, publication date, a link to the original posting, and its description as plain text.
- A posting leaves the job list 15 days after publication. The system keeps the posting, so applications started from it keep their link.
- A failing source never stops the other source. For each source, a run records when it ran, whether it succeeded or was blocked, how many postings it found and saved, and the error when it failed.
- Two runs never overlap. A run started while another one is in progress does nothing.
- After a user creates or edits a master CV, its fit on every listed job reflects the change, at the latest after the next hourly run. Deleting a master CV removes its fit everywhere.
- Each source appears as a platform that every user sees, named after the source.
- An admin sees, for each source: whether it is on, when it last ran, how that run ended, how many postings it found and saved, its last error, and how many of its jobs are listed.
- An admin turns a source off or on. A run skips a source that is off.
- An admin starts a run at once. The screen says so when a run is already in progress or the background service cannot be reached.
- `backend/CHANGELOG.md` records every backend change. (.claude/rules/changelogs.md 2)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K5 — Jobs API: list, detail, dismiss, saved searches, job to draft   side: backend   covers: R-003 (co-author), R-007 (list and link), R-010, R-011, R-012, R-015, R-017, R-018, R-020, R-021, R-022, R-026 (job flow), R-029, R-030, R-031, R-032 (API halves)   deps: K3, K4
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: Q5 "Fit on applications, Dismiss + applied marks, Saved searches + Discord alert", then "ignore this discord alert". Assumptions: one application per user per job; a draft from a job has work mode "remote", no country, mode "active", today's date; 25 per page; at most 10 saved searches, names unique per user ignoring case.
Covers: R-003 (co-author), R-007 (list and link), R-010, R-011, R-012, R-015, R-017, R-018, R-020, R-021, R-022, R-026 (job flow), R-029, R-030, R-031, R-032 (API)
Release: B. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## Backend` S5, `## Contract`. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- backend/app/domain/models.py
- backend/app/domain/repositories/job_repository.py
- backend/app/domain/repositories/job_dismissal_repository.py (new)
- backend/app/domain/repositories/saved_job_search_repository.py (new)
- backend/app/domain/repositories/application_repository.py
- backend/app/application/dto/job.py, backend/app/application/dto/job_search.py (new), backend/app/application/dto/application_draft.py
- backend/app/application/use_cases/jobs/list_jobs.py, get_job.py, dismiss_job.py, restore_job.py (new)
- backend/app/application/use_cases/job_searches/__init__.py, list_searches.py, create_search.py, update_search.py, delete_search.py (new)
- backend/app/application/use_cases/application_drafts/create_draft_from_job.py (new)
- backend/app/application/use_cases/application_drafts/create_draft.py, update_draft.py
- backend/app/presentation/api/jobs.py, job_searches.py (new), backend/app/presentation/api/application_draft.py
- backend/app/presentation/schemas/jobs.py, job_searches.py (new), backend/app/presentation/schemas/application_draft.py
- backend/app/presentation/dependencies.py, backend/app/main.py
- backend/tests/unit/test_jobs_uc.py, test_create_draft_from_job.py, test_job_searches_uc.py (new)
- backend/tests/integration/test_jobs_api.py, test_jobs_draft.py, test_job_searches.py (new)
- backend/tests/integration/test_application_drafts.py, test_applications.py, test_delete_account.py
- backend/scripts/seed_mock_data.py
- backend/CLAUDE.md, backend/CHANGELOG.md
Pattern:
- backend/app/application/use_cases/application_drafts/create_draft.py (`to_draft_dto`, check order)
- backend/app/application/use_cases/catalog/resolve.py (`resolve_company`, `ensure_platform_visible`)
- backend/app/application/use_cases/compat/legacy_finalize.py (shared session, one commit)
- backend/app/application/use_cases/base_cvs/create.py (cap under `SELECT … FOR UPDATE` on the user row)
- backend/app/presentation/api/admin/companies.py (paged `{items, total, page, per_page, total_pages}`)
- `git show e670914:backend/app/application/use_cases/jobs/{list_jobs,get_job,create_application_from_job}.py` (Ían; port)
Contract (K6 consumes):
- `JobFilters` `{search? ≤200, source?, tags? ≤10, min_fit? 0..100, posted_within_days? 1..15, sort = 'newest' | 'fit', include_dismissed = false}`.
- `JobSummary` `{id, source {code, name}, title, company_name, location_text, employment_type | null, salary_text | null, tags[], posted_at | null, job_url, is_active, best_fit {base_cv_id, score} | null, dismissed, application {id, is_draft} | null}`. `JobDetail` = summary + `{description_text, company_url | null, fits [{base_cv_id, base_cv_name, score, matched_keywords[], missing_keywords[]}]}`.
- `GET /jobs?JobFilters&page≥1&per_page=1..100 (25)` → 200 `{items, total, page, per_page, total_pages}` | 401 | 422.
- `GET /jobs/{id}` → 200 `JobDetail` | 404 (unknown; inactive unless the caller has an application from it).
- `PUT | DELETE /jobs/{id}/dismissal` → 204 | 404.
- `POST /applications/drafts/from-job` `{job_id, base_cv_id?, tailoring? = 'copy'}` → 201 `Draft` (+ `job_id`) | 404 job unknown or inactive, or base CV not own | 409 'You already have an application for this job' | 422.
- `GET /job-searches` → 200 `[{id, name, filters, created_at, updated_at}]` by name. `POST` `{name 1..100, filters}` → 201 | 409 'A saved search with this name already exists' | 409 'Saved search limit reached (max 10)' | 422. `PUT /job-searches/{id}` → 200 | 404 | 409 | 422. `DELETE` → 204 | 404.
- `GET /applications` unchanged (no `job_id`).
Steps:
- T059 [US2] Build on integration/0012-job-board after the K4 tip.
- T060 [US2] backend/app/domain/models.py: `JobDismissalModel`, `SavedJobSearchModel`, `ApplicationModel.job_id` (nullable FK, SET NULL) and `uq_applications_user_job` (`unique=True`, `postgresql_where=job_id IS NOT NULL`), names exactly as K2. The `Application` response schema is unchanged (cli-compatibility).
- T061 [US2] backend/app/presentation/schemas/jobs.py (new): `JobFilters` (search stripped ≤200, source code, tags ≤10, `min_fit` 0..100, `posted_within_days` 1..15, `sort` `newest | fit` default `newest`, `include_dismissed` false), page ≥1, `per_page` 1..100 default 25; `JobSummary`, `JobDetail`, `JobFitOut`, the paged envelope. DTOs in backend/app/application/dto/job.py.
- T062 [US2] [US3] `JobRepository.list_for_user(user_id, filters, page, per_page)`:
  - active jobs only;
  - `best_fit` = the caller's highest fit row and its `base_cv_id`; `dismissed` = the caller's dismissal exists, hidden unless `include_dismissed`;
  - `application` = the caller's application with this `job_id`, any state: draft, open, closed or archived. No `NOT_DRAFT`, no cycle filter ("Applied" covers closed and archived);
  - search `ILIKE` on title, company_name, description_text (R-011); `source` by code; tags: every chosen tag (`tags @> :tags`); `min_fit`: `best_fit ≥ min_fit` (no fit → excluded); `posted_within_days`: `coalesce(posted_at, first_seen_at) ≥ now − N days`;
  - sort `newest` = `coalesce(posted_at, first_seen_at) DESC, id DESC`; `fit` = `best_fit DESC NULLS LAST`, then newest; `total` counted.
- T063 [US2] [US3] Use cases (new):
  - backend/app/application/use_cases/jobs/list_jobs.py → the paged DTO (R-010, R-011);
  - backend/app/application/use_cases/jobs/get_job.py: an active job, or an inactive one the caller has an application from; else 404 'Job not found' (R-007 edge). `fits` = every master CV of the caller, computed live: `score_fit(job.keywords, cv_text(cv))` with matched and missing, plus the CV name (R-012). No master CV → `fits: []`, `best_fit` null (R-015). Plus `application`, `dismissed`;
  - port of Ían's `list_jobs.py` / `get_job.py` where logic is reused; those commits carry the `Co-authored-by` trailer.
- T064 [US6] backend/app/domain/repositories/job_dismissal_repository.py (new) and use cases backend/app/application/use_cases/jobs/dismiss_job.py, restore_job.py (new): unknown job → 404; dismiss and restore are idempotent; only the caller's row (R-029).
- T065 [US2] Routes in backend/app/presentation/api/jobs.py (new), `CurrentUserDp`: `GET /jobs`, `GET /jobs/{id}`, `PUT /jobs/{id}/dismissal`, `DELETE /jobs/{id}/dismissal` → 204. `include_router` in backend/app/main.py.
- T066 [US4] `CreateDraftFromJobUseCase` in backend/app/application/use_cases/application_drafts/create_draft_from_job.py (new):
  - the job must be active, else 404 'Job not found' (edge "cannot start a new application");
  - the caller already has an application with this `job_id` → `ResourceConflict('You already have an application for this job')` (R-021);
  - platform = `job_sources.platform_id` through `ensure_platform_visible` (R-019);
  - company: a valid http(s) `company_url` → `resolve_company(repo, {name, url}, user_id)` (visible match reused, else a new private company, R-018, Plan corrections 20); none or invalid → free text;
  - the draft: role = title, company name, platform, `link_to_job` = `job_url` (when a valid URL ≤ 2083), `job_description` = `description_text`, `work_mode` remote, `mode` active, `application_date` = server today, no country, `job_id`. Each value cut to its limit: role 200, company 200, JD 50000 (R-017, edge "cut to fit", Plan corrections 21);
  - `base_cv_id` given → `CreateTailoredCVUseCase` with `tailoring` (default `copy`) on the same session: `ApplicationRepository.create_draft(..., commit=False)` flushes, the copy's create commits both (Plan corrections 5). A base CV not the caller's → 404 'Base CV not found', nothing written (R-020, R-026);
  - an IntegrityError on `uq_applications_user_job` (double click, two tabs) → the same 409;
  - port of Ían's `create_application_from_job.py` where logic is reused; those commits carry the `Co-authored-by` trailer.
- T067 [US4] Route and draft shape:
  - `POST /applications/drafts/from-job` in backend/app/presentation/api/application_draft.py, declared before the `/{id}` routes; body `DraftFromJob {job_id, base_cv_id?, tailoring?: 'copy' | 'keywords' = 'copy'}` → 201 `Draft`;
  - `Draft` schema, `DraftDTO` and `to_draft_dto` (backend/app/application/use_cases/application_drafts/create_draft.py) gain `job_id: id | null`;
  - backend/app/application/use_cases/application_drafts/update_draft.py never touches `job_id`; finishing keeps it (Plan corrections 19).
- T068 [P] [US4] Tests:
  - backend/tests/unit/test_create_draft_from_job.py (new): the prefill and the cuts; a valid company URL → `resolve_company` called, none or invalid → free text; inactive → 404; existing → 409; another user's base CV → 404 and no write; `keywords` passed through.
  - backend/tests/integration/test_jobs_draft.py (new):
    - the prefill exactly: role, company, platform = the source's platform, link, JD, remote, active, today, no country;
    - a company with a website → a private company; a second job of the same company and website reuses it (R-018);
    - a second start → 409, one row; two concurrent starts (`asyncio.gather`) → one 201, one 409;
    - the draft is absent from `GET /applications` and statistics, and present in `GET /applications/drafts` (R-022);
    - `base_cv_id` + `keywords` → a copy with `adjustments`, `has_cv` true; `copy` → verbatim;
    - deleting the draft → the job's mark clears, and a new start works;
    - finishing → the job shows `application.is_draft` false.
- T069 [P] [US2] [US3] backend/tests/integration/test_jobs_api.py (new):
  - newest first, 25 per page, `total`; each filter; search on title, company and description; sort by fit; `min_fit`; `posted_within_days`;
  - inactive jobs hidden; the detail of an inactive job → 404, but 200 for a caller with an application from it;
  - fits per master CV with matched and missing; no master CV → `best_fit` null, `fits` [];
  - two users, one job, different scores → each sees only their own; an admin sees only their own;
  - anonymous → 401; `per_page` 101, 11 tags, `min_fit` 101, `posted_within_days` 16 → 422.
- T070 [P] [US6] backend/tests/unit/test_jobs_uc.py (new) and dismissal cases in test_jobs_api.py: PUT → out of the list; `include_dismissed` → listed with `dismissed: true`; DELETE → back; both idempotent; another user unaffected; unknown → 404.
- T071 [US7] Saved searches (new): backend/app/domain/repositories/saved_job_search_repository.py, backend/app/application/dto/job_search.py, use cases in backend/app/application/use_cases/job_searches/:
  - list by name, case-insensitive;
  - create: name 1..100 stripped; `filters` validated as `JobFilters` (an unknown key → 422); the cap under `SELECT … FOR UPDATE` on the user row → `ResourceConflict('Saved search limit reached (max 10)')`; a duplicate `lower(name)` → `ResourceConflict('A saved search with this name already exists')`, and an IntegrityError → the same;
  - update (rename and/or filters) → 200 | 404 | 409 | 422; delete → 204 | 404; another user's → 404;
  - no notification field, route or side effect (R-032);
  - schemas in backend/app/presentation/schemas/job_searches.py (new); routes `/job-searches` in backend/app/presentation/api/job_searches.py (new); `include_router` in main.py.
- T072 [P] [US7] backend/tests/unit/test_job_searches_uc.py and backend/tests/integration/test_job_searches.py (new): the 11th → 409; a concurrent 11th → one 409; a duplicate in any case → 409; a rename to a taken name → 409; another user's → 404; listed by name; `filters` round-trip.
- T073 [US2] Read-model guards:
  - backend/tests/integration/test_applications.py: the `GET /applications` item has no `job_id` key;
  - backend/tests/integration/test_application_drafts.py: an ordinary draft has `job_id` null; a PUT keeps a from-job draft's `job_id`;
  - backend/tests/integration/test_delete_account.py: deleting a user removes their fits, dismissals, searches and drafts; jobs and sources stay.
- T074 [US4] backend/scripts/seed_mock_data.py:
  - `seed_job_searches()`: create, rename, list, delete; when 10 exist, the 11th → 409;
  - when `GET /jobs` has items (dev stack with a worker), start one draft from a job with a master CV and `keywords`; assert `job_id` and `has_cv`; otherwise log the skip.
- T075 [US4] Docs and changelog:
  - backend/CLAUDE.md: route tables Jobs, Job searches, `POST /applications/drafts/from-job`; domain notes JobDismissal, SavedJobSearch, `Application.job_id` (one per user per job; absent from `GET /applications`); per-user fits, dismissals and searches, no admin access; Seed Script Rule bullets.
  - backend/CHANGELOG.md Added: `- GET /jobs, GET /jobs/{id}, PUT|DELETE /jobs/{id}/dismissal, /job-searches (max 10 per user), POST /applications/drafts/from-job; Draft gains job_id.` No CLI entry: jobs and drafts are web only; `GET /applications` is unchanged.
- T076 [US2] Gate, close:
  - `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli;
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171, changed files clean), `uv run pytest . --cov=app` (≥ 90%); `grep -rn "_old" backend/app/` → none;
  - The K5 tip is not a merge point.
AC:
- Every later change that ports logic from his branch names him as co-author. This PRD names his pull request as the origin of the feature.
- A posting leaves the job list 15 days after publication. The system keeps the posting, so applications started from it keep their link.
- Every signed-in user sees the job list, newest first, 25 per page. Each job shows its title, company, source, location, employment type, salary text, tags, publication date, and the user's best fit score among their master CVs.
- The user searches by text (title, company, description), filters by source, tags, minimum fit and "published within the last N days", and sorts by newest or by best fit.
- The user opens a job and sees its full description, a link to the original posting on its source, and the fit of each of their master CVs with the matched and missing keywords.
- A user with no master CV sees no fit on any job, and an invitation to create a master CV.
- From a job, the user starts an application. The system creates a draft (PRD 0010) filled from the job: - role: the job's title; - company: the job's company; - platform: the job's source; - also the link to the posting, the job description, the work mode "remote", and today's date.
- A company with a website follows the company rules of PRD 0010: the user's own company with the same name and website is reused, otherwise a new company is created, private to the user. A company without a website stays free text on that draft.
- In the same step, the user may pick one of their master CVs and choose a verbatim copy, which is preselected, or "Tailor by keywords". The draft then holds that CV copy, and the user lands on the CV step of the "new application with CV" page.
- A user holds at most one application, draft or finished, per job. Starting again offers to open the one that exists.
- The draft follows every rule of PRD 0010: it stays out of reports, statistics and lists, and the user finishes, resumes or deletes it from the Drafts tab.
- The verbatim copy stays the default everywhere. "Tailor by keywords" is an opt-in choice, in the job flow and on the application CV page, offered only when the application has a job description.
- The user dismisses a job. It leaves their list and stays dismissed until they restore it from a "show dismissed" view.
- A job the user started an application from shows "Draft" while the draft is open and "Applied" once it is finished, with a link to that draft or application.
- The user saves the current search, filters and sort under a name. They list their saved searches, apply one to the job list, rename one, and delete one. A user holds at most 10.
- A saved search sends no notification of any kind.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K6 — Web job board: /jobs, detail, start dialog, marks, saved searches   side: frontend   covers: R-003 (co-author), R-010, R-011, R-012, R-015, R-016 (web cache), R-020, R-021 (offer to open), R-026 (job flow), R-029, R-030, R-031, R-032 (UI halves)   deps: K5
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: Q5 "Fit on applications, Dismiss + applied marks, Saved searches + Discord alert", then "ignore this discord alert"; "Opt-in action (Recommended)". Success signal: "After picking a master CV, a user goes from a listed job to a draft holding a CV copy tailored by keywords in three clicks or fewer."
Covers: R-003 (co-author), R-010, R-011, R-012, R-015, R-016 (web cache), R-020, R-021, R-026 (job flow), R-029, R-030, R-031, R-032 (UI)
Release: B. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## Frontend`, `## Contract`. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- frontend/src/app/(protected)/jobs/page.tsx, jobs-page.tsx, jobs-page.test.tsx (new)
- frontend/src/app/(protected)/jobs/view/page.tsx, job-view-page.tsx, job-view-page.test.tsx (new)
- frontend/src/components/jobs/job-filters.tsx, job-filters-url.ts, job-filters-url.test.ts, job-list-item.tsx, job-list-item.test.tsx, fit-badge.tsx, fit-badge.test.tsx, fit-keywords.tsx, job-status-badge.tsx, start-application-dialog.tsx, start-application-dialog.test.tsx, saved-searches-menu.tsx, saved-searches-menu.test.tsx (new)
- frontend/src/services/types/jobs.ts, services/interfaces/i-job-service.ts, services/implementations/job-service.ts (new)
- frontend/src/services/types/job-searches.ts, services/interfaces/i-job-search-service.ts, services/implementations/job-search-service.ts (new)
- frontend/src/services/services.ts
- frontend/src/services/types/application-drafts.ts, services/interfaces/i-application-draft-service.ts, services/implementations/application-draft-service.ts
- frontend/src/hooks/use-jobs.ts, use-job-searches.ts (new)
- frontend/src/hooks/use-create-base-cv.ts, use-update-base-cv.ts, use-delete-base-cv.ts
- frontend/src/components/layout/nav.ts, frontend/src/components/layout/sidebar-nav.test.tsx
- frontend/e2e/shell-responsive.spec.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/applications/cv/page.tsx + application-cv-page.tsx (Suspense shell, `?id=`)
- frontend/src/app/(protected)/applications/applications-page.tsx (toolbar, search, empty states)
- frontend/src/components/tailored-cvs/base-cv-picker.tsx (master CV radios, empty → `/cvs` invitation)
- frontend/src/components/application-drafts/drafts-section.tsx (`draftResumeHref`)
- frontend/src/app/(protected)/profile/profile-page.tsx (History API instead of `router.replace` on this static export)
- frontend/src/hooks/use-application-drafts.ts (query keys, invalidation)
- `git show e670914:frontend/src/components/jobs/{job-filters,job-card,job-list,job-detail-sheet}.tsx`, `…:frontend/src/services/types/jobs.ts`, `…:frontend/src/services/implementations/job-service.ts`, `…:frontend/src/hooks/use-jobs.ts` (Ían; port)
- frontend/CLAUDE.md "### Routing", "### Service Layer & DI", "### State Management", "### Forms", "### Tailored CVs", "### Application drafts", "### UI Components", "### App shell"; ADR-0006 tokens; ui-designer for new components.
Contract (from K5): `JobFilters`, `JobSummary`, `JobDetail`; `GET /jobs`, `GET /jobs/{id}`, `PUT | DELETE /jobs/{id}/dismissal`, `POST /applications/drafts/from-job`, `/job-searches` CRUD; 409 details 'You already have an application for this job', 'A saved search with this name already exists', 'Saved search limit reached (max 10)'.
Steps:
- T077 [US2] Build on integration/0012-job-board after the K5 tip.
- T078 [US2] Types and services:
  - frontend/src/services/types/jobs.ts (new): `JobFilters`, `JobSummary`, `JobDetail`, `JobFit`, the paged envelope, `JOB_SOURCES = [{code: "himalayas", name: "Himalayas"}, {code: "remoteok", name: "RemoteOK"}]` (Plan corrections 18);
  - `IJobService` + `JobService` (new): `list(filters, page)`, `get(id)`, `dismiss(id)`, `restore(id)`;
  - job-search trio (new): `list`, `create`, `update`, `remove`;
  - `ApplicationDraftService.createFromJob({job_id, base_cv_id?, tailoring?})`; `Draft.job_id`;
  - register both in frontend/src/services/services.ts;
  - commits porting Ían's service and types carry the `Co-authored-by` trailer.
- T079 [US2] frontend/src/components/jobs/job-filters-url.ts (new), pure: `filtersFromSearchParams(params)` (invalid → default; clamp to the contract ranges), `filtersToSearchParams(filters)` (defaults omitted).
- T080 [US2] Hooks:
  - frontend/src/hooks/use-jobs.ts (new): `useJobs(filters, page)` key `["jobs", filters, page]`; `useJob(id)` key `["job", id]`; `useDismissJob`, `useRestoreJob` (invalidate `["jobs"]`, `["job", id]`); `useStartApplicationFromJob` (invalidate `["jobs"]`, `["job"]`, `["application-drafts"]`);
  - frontend/src/hooks/use-job-searches.ts (new): key `["job-searches"]`, CRUD;
  - errors → `toast.error(getApiError(error))`, except where a dialog shows the detail inline;
  - frontend/src/hooks/use-create-base-cv.ts, use-update-base-cv.ts, use-delete-base-cv.ts also invalidate `["jobs"]` and `["job"]` (R-016, Plan corrections 14).
- T081 [US2] Route `/jobs`:
  - frontend/src/app/(protected)/jobs/page.tsx (new): Suspense shell (static export rule);
  - frontend/src/app/(protected)/jobs/jobs-page.tsx (new): h1 "Jobs"; `JobFilters` toolbar (search ≤ 200, source from `JOB_SOURCES`, tags ≤ 10, minimum fit, "Published within" 1..15 days, sort "Newest" | "Best fit", a "Show dismissed" switch); `SavedSearchesMenu`;
  - filters live in the URL: read with `useSearchParams`, written with `window.history.pushState` (Plan corrections 17); a reload keeps them;
  - 25 per page with a pager; one `JobListItem` per job;
  - no master CV (`useBaseCvs()` empty) → an invitation "Create a master CV to see how well you fit each job" linking `/cvs/new`, and no fit anywhere (R-015);
  - empty states: no jobs yet ("New jobs arrive every hour"), nothing matches; a load error → `getApiError` in `role="alert"`.
- T082 [US2] [US3] frontend/src/components/jobs/job-list-item.tsx (new), port of Ían's job card:
  - title (link `/jobs/view?id=`), company, source name, location, employment type, salary text, tags, publication date;
  - `FitBadge` with the best fit, absent when null;
  - `JobStatusBadge`: "Draft" → `/applications/new-with-cv?id=<id>`; "Applied" → `/applications?focus=<id>` (R-030);
  - actions: "Start application", "Dismiss" (or "Restore" when dismissed);
  - long text wraps or truncates (`min-w-0`), buttons `shrink-0`; every icon button has an accessible name.
- T083 [US3] frontend/src/components/jobs/fit-badge.tsx (new): "Fit 72%", words and colour, never colour alone. frontend/src/components/jobs/fit-keywords.tsx (new): labelled "Matched" and "Missing" keyword lists.
- T084 [US2] [US3] Route `/jobs/view?id=`:
  - frontend/src/app/(protected)/jobs/view/page.tsx (new): Suspense shell;
  - frontend/src/app/(protected)/jobs/view/job-view-page.tsx (new): title, company (+ website link), source, meta, tags, full description (`whitespace-pre-line`), "View on <source name>" → `job_url` (`target="_blank" rel="noopener noreferrer"`, R-012);
  - one row per master CV: name, `FitBadge`, `FitKeywords` (R-012); none → the invitation (R-015);
  - status badge, Start, Dismiss / Restore; a 404 → "This job is no longer listed" + a link back to `/jobs`.
- T085 [US4] frontend/src/components/jobs/start-application-dialog.tsx (new):
  - master CV radios from `useBaseCvs()`, optional (no CV is a valid choice);
  - "Verbatim copy" (preselected) | "Tailor by keywords", shown only when a CV is picked and the job's description is not blank (R-020, R-026, Plan corrections 16);
  - submit → `createFromJob` → `router.push("/applications/new-with-cv?id=<draft id>&step=cv")` (Plan corrections 19); disabled while pending;
  - 409 → refetch `GET /jobs/{id}` → "You already have an application for this job" + "Open draft" or "Open application" (R-021, Plan corrections 6);
  - after picking a CV: Start → "Tailor by keywords" → "Create draft" = 3 clicks (success signal).
- T086 [US6] Dismiss and restore on the list item and the detail page: a dismissed job leaves the list at once; "Show dismissed" (`include_dismissed`) lists it with "Restore" (R-029).
- T087 [US7] frontend/src/components/jobs/saved-searches-menu.tsx (new):
  - a "Saved searches" menu listing names; picking one pushes its filters and sort into the URL;
  - "Save current search" → a name dialog (1..100); rename; delete with a confirm;
  - at 10, save is disabled with "You can keep up to 10 saved searches";
  - a 409 detail shows inline in the dialog;
  - no notification control anywhere (R-032).
- T088 [US2] Nav (Plan corrections 8):
  - frontend/src/components/layout/nav.ts: `{ href: "/jobs", label: "Jobs", icon: <lucide icon> }` right after Applications;
  - frontend/src/components/layout/sidebar-nav.test.tsx: "CVs right after Applications" → Jobs right after Applications, CVs right after Jobs;
  - frontend/e2e/shell-responsive.spec.ts `PRIMARY_LABELS`: "Jobs" after "Applications" (eight entries).
- T089 [P] [US2] Vitest:
  - job-filters-url.test.ts (new): round trip, defaults omitted, clamping, garbage;
  - jobs-page.test.tsx (new), services mocked: filters read from the URL and written on change; pager; the invitation without a master CV; empty and error states; dismissed hidden, then shown with the switch;
  - job-list-item.test.tsx (new): every field; no badge when `best_fit` is null; the Draft and Applied links;
  - fit-badge.test.tsx (new): the number in the words; 0 and 100;
  - start-application-dialog.test.tsx (new): copy preselected; "Tailor by keywords" hidden with no CV or a blank description; the payload with and without a CV; a 409 → the open link from the refetched job; submit disabled while pending; navigation to `step=cv`;
  - saved-searches-menu.test.tsx (new): apply pushes filters; save; rename; delete confirm; the cap text; a 409 inline;
  - job-view-page.test.tsx (new): fits per CV with matched and missing; the external link; the 404 text;
  - sidebar-nav.test.tsx.
- T090 [US2] frontend/CLAUDE.md:
  - a new "### Job board (`src/components/jobs/`, PRD 0012)" section: the routes (`/jobs`, `/jobs/view?id=`), filters in the URL through the History API, query keys, the fit badge words, the Draft/Applied links, the start dialog flow, the saved-search cap, `JOB_SOURCES`;
  - Routing: `PRIMARY_NAV` is eight entries now (the "seven" lines at l.133 and l.1552).
- T091 [US2] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - `scripts/e2e.sh e2e/shell-responsive.spec.ts e2e/smoke.spec.ts` green; `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - commits porting Ían's components carry the `Co-authored-by` trailer;
  - The K6 tip is not a merge point.
AC:
- Every later change that ports logic from his branch names him as co-author. This PRD names his pull request as the origin of the feature.
- Every signed-in user sees the job list, newest first, 25 per page. Each job shows its title, company, source, location, employment type, salary text, tags, publication date, and the user's best fit score among their master CVs.
- The user searches by text (title, company, description), filters by source, tags, minimum fit and "published within the last N days", and sorts by newest or by best fit.
- The user opens a job and sees its full description, a link to the original posting on its source, and the fit of each of their master CVs with the matched and missing keywords.
- A user with no master CV sees no fit on any job, and an invitation to create a master CV.
- After a user creates or edits a master CV, its fit on every listed job reflects the change, at the latest after the next hourly run. Deleting a master CV removes its fit everywhere.
- In the same step, the user may pick one of their master CVs and choose a verbatim copy, which is preselected, or "Tailor by keywords". The draft then holds that CV copy, and the user lands on the CV step of the "new application with CV" page.
- A user holds at most one application, draft or finished, per job. Starting again offers to open the one that exists.
- The verbatim copy stays the default everywhere. "Tailor by keywords" is an opt-in choice, in the job flow and on the application CV page, offered only when the application has a job description.
- The user dismisses a job. It leaves their list and stays dismissed until they restore it from a "show dismissed" view.
- A job the user started an application from shows "Draft" while the draft is open and "Applied" once it is finished, with a link to that draft or application.
- The user saves the current search, filters and sort under a name. They list their saved searches, apply one to the job list, rename one, and delete one. A user holds at most 10.
- A saved search sends no notification of any kind.

## K7 — Web CV-page tailoring and fit, admin Jobs, jobs E2E   side: frontend (+ E2E, compose)   covers: R-025 (display), R-026 (CV page), R-028 (UI), R-033, R-034, R-035 (UI halves)   deps: K4, K6
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: "Opt-in action (Recommended)" ('Tailor by keywords' action in the job → draft flow and on the application CV page; verbatim copy stays default). Owner's quality-gate order: "the better of two worlds, i also want frontend tests and e2e tests with real application stack".
Covers: R-025 (display), R-026 (CV page), R-028 (UI), R-033, R-034, R-035 (UI)
Release: B. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md `## Frontend`, `## Tests` (E2E). Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- frontend/src/app/(protected)/applications/cv/application-cv-page.tsx, application-cv-page.test.tsx
- frontend/src/components/tailored-cvs/base-cv-picker.tsx, frontend/src/components/tailored-cvs/tailored-cvs-ui.test.tsx
- frontend/src/components/application-drafts/draft-cv-step.tsx
- frontend/src/app/(protected)/applications/new-with-cv/new-with-cv-page.test.tsx
- frontend/src/components/tailored-cvs/tailor-by-keywords-switch.tsx (new)
- frontend/src/components/tailored-cvs/cv-fit-panel.tsx (new)
- frontend/src/components/tailored-cvs/cv-diff-summary-bar.tsx, use-cv-diff.tsx, cv-diff-ui.test.tsx
- frontend/src/components/tailored-cvs/types.ts
- frontend/src/services/types/tailored-cv.ts, services/interfaces/i-tailored-cv-service.ts, services/implementations/tailored-cv-service.ts
- frontend/src/hooks/use-create-tailored-cv.ts, use-update-tailored-cv.ts, use-delete-tailored-cv.ts, use-application-cv-fit.ts (new)
- frontend/src/app/(protected)/admin/jobs/page.tsx, jobs-page.tsx, jobs-page.test.tsx (new)
- frontend/src/components/admin/admin-nav.tsx
- frontend/src/services/implementations/admin-service.ts, services/types/admin.ts, hooks/use-admin.ts
- frontend/e2e/jobs.spec.ts (new), frontend/e2e/admin-gating.spec.ts, frontend/e2e/smoke.spec.ts
- docker-compose.e2e.yml
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/admin/platforms/page.tsx + platforms-page.tsx (admin shell)
- frontend/src/app/(protected)/admin/discord-webhooks/discord-webhooks-page.tsx (list states; `admin-service.ts` + `use-admin.ts` shape)
- frontend/src/components/tailored-cvs/cv-diff-summary-bar.tsx, use-cv-diff.tsx, job-description-panel.tsx
- frontend/src/components/jobs/fit-badge.tsx, fit-keywords.tsx (K6)
- frontend/e2e/application-with-cv.spec.ts (draft flow, master CV seeded through `POST /base-cvs`, cleanup); frontend/e2e/admin-discord-webhooks.spec.ts (admin role)
- docker-compose.e2e.yml `api` service (env, image reuse)
Contract (from K3, K4): `POST /applications/{id}/cv` `{base_cv_id, tailoring?}`; `GET /applications/{id}/cv/fit` → `{score | null, matched_keywords, missing_keywords}` | 404; `GET /admin/jobs/sources`; `PATCH /admin/jobs/sources/{id}` `{is_enabled}`; `POST /admin/jobs/runs` → 202 | 409 'A run is already in progress' | 503 'Background service unavailable'.
Steps:
- T092 [US5] Build on integration/0012-job-board after the K6 tip.
- T093 [US5] Services and hooks:
  - `ITailoredCvService.create(applicationId, baseCvId, tailoring = "copy")`, `getFit(applicationId)` → `CvFit` (frontend/src/services/types/tailored-cv.ts);
  - frontend/src/hooks/use-create-tailored-cv.ts passes `tailoring`;
  - frontend/src/hooks/use-application-cv-fit.ts (new): `useApplicationCvFit(applicationId, enabled)`, key `["application-cv-fit", applicationId]`; a 404 → no panel;
  - create, update and delete of the copy, and every JD save (draft step 1 autosave, the application edit), invalidate it.
- T094 [US5] frontend/src/components/tailored-cvs/tailor-by-keywords-switch.tsx (new):
  - label "Tailor by keywords", description "Reorders skills and bullets by how well they match the job description. No text is added or changed.";
  - off by default; not rendered when the application's JD is blank (R-026, Plan corrections 16);
  - wired into `base-cv-picker.tsx`, so both `application-cv-page.tsx` and `draft-cv-step.tsx` get it; on → the create sends `tailoring: "keywords"`.
- T095 [US5] frontend/src/components/tailored-cvs/cv-fit-panel.tsx (new): `FitBadge` + `FitKeywords` (K6) for the copy against the JD, next to `JobDescriptionPanel`; on the application CV page and the draft CV step, editable and read-only alike; only when a copy exists and `score` is not null (R-028).
- T096 [US5] Moves in the comparison (R-025, Plan corrections 7):
  - `CvDiffSummaryBar` lists the copy's `adjustments` under "Reordered by job match" while "Show changes" is on; the matching section's header count says "reordered";
  - `cv-diff.ts`, `fixtures/cv-diff/` and the server diff stay unchanged; `was_ai_generated` still renders nowhere;
  - `TailoredCvAdjustment` in frontend/src/components/tailored-cvs/types.ts.
- T097 [P] [US5] Vitest:
  - application-cv-page.test.tsx: the switch absent with a blank JD and present with one; the create payload carries `tailoring`; the fit panel shows the score and both lists; absent with a blank JD or no copy;
  - tailored-cvs-ui.test.tsx: the switch is off by default;
  - new-with-cv-page.test.tsx: draft step 2 has the same switch and panel;
  - cv-diff-ui.test.tsx: `adjustments` listed only with the toggle on; a copy with `adjustments: []` renders as before.
- T098 [US8] Admin Jobs:
  - `admin-service.ts`: `getJobSources()`, `updateJobSource(id, {is_enabled})`, `startJobRun()`; `AdminJobSource` in `types/admin.ts`; hooks in `use-admin.ts`, key `["admin", "job-sources"]`;
  - frontend/src/app/(protected)/admin/jobs/page.tsx + jobs-page.tsx (new): one row per source: name, an on/off switch (R-034), last run time, outcome in words ("OK", "Failed", "Blocked"), found, saved, the last error (wrapped), listed jobs (R-033);
  - "Run now" → 202 → toast "Run started", the list refetches; 409 and 503 → the server's `detail` on screen (R-035);
  - a "Jobs" tab in frontend/src/components/admin/admin-nav.tsx.
- T099 [P] [US8] frontend/src/app/(protected)/admin/jobs/jobs-page.test.tsx (new): loading, error, empty, ready; the switch calls PATCH; Run now 202, 409 and 503 texts; a long error wraps.
- T100 [US2] docker-compose.e2e.yml (Plan corrections 10, 11):
  - `worker` and `scheduler` from the `applika-e2e-api` image with the API's env, commands as ADR-0016, `depends_on: api: condition: service_healthy`;
  - `JOBS_SCRAPERS: fixture`, `JOBS_FIXTURE_PATH: /fixtures/postings.json`, volume `./backend/tests/fixtures/jobs:/fixtures:ro`;
  - `JOBS_INGEST_CRON` that does not fire during a run (e.g. `0 0 1 1 *`);
  - no named volumes; `applika-e2e-*` container names.
- T101 [US2] [US3] [US4] [US5] [US6] [US7] [US8] E2E frontend/e2e/jobs.spec.ts (new), serial, real stack:
  - admin: `/admin/jobs` → Run now → poll until both sources read "OK" and listed jobs > 0 (R-033, R-035); turn RemoteOK off and back on (R-034);
  - user: seed one master CV through `POST /base-cvs`;
  - `/jobs`: fixture jobs listed with a fit; search and a source filter; the URL holds them; save "E2E search", clear, apply it → the same filters (R-031);
  - open a job: its fit with matched and missing (R-012);
  - Start application → pick the CV → "Tailor by keywords" → "Create draft" → `/applications/new-with-cv?…step=cv` with the copy; "Show changes" lists the reorder; the fit panel shows (R-020, R-025, R-028);
  - finish the draft → back on `/jobs` the job reads "Applied" and links `/applications?focus=` (R-030);
  - start again → "Open application" (R-021);
  - dismiss another job → gone; "Show dismissed" → Restore → back (R-029);
  - `afterAll`: delete the application, the saved search and the master CV.
- T102 [US8] frontend/e2e/admin-gating.spec.ts and frontend/e2e/smoke.spec.ts: add `/admin/jobs` to the admin routes and the `/jobs` heading (Plan corrections 23).
- T103 [US5] frontend/CLAUDE.md:
  - "### Tailored CVs": the switch, the fit panel, and `adjustments` now render in the comparison (replace "render NOWHERE" for `adjustments`; `was_ai_generated` still nowhere);
  - a new "### Admin — Jobs" section;
  - "### E2E": `jobs.spec.ts`, the worker and scheduler services, the fixture scraper and the cron set not to fire.
- T104 [US5] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - full `scripts/e2e.sh` green (every spec); no applika-e2e container, network or volume left;
  - The K7 tip is not a merge point.
AC:
- The copy records what was reordered in each section. The existing comparison with the master CV (PRD 0007 R-023) shows those moves.
- The verbatim copy stays the default everywhere. "Tailor by keywords" is an opt-in choice, in the job flow and on the application CV page, offered only when the application has a job description.
- The application CV page, for applications and drafts alike, shows the fit of the CV copy against the application's job description, with matched and missing keywords. This holds whether or not the application came from a job. With no job description, the page shows no fit.
- An admin sees, for each source: whether it is on, when it last ran, how that run ended, how many postings it found and saved, its last error, and how many of its jobs are listed.
- An admin turns a source off or on. A run skips a source that is off.
- An admin starts a run at once. The screen says so when a run is already in progress or the background service cannot be reached.
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K8 — Closing 0012: full gate, E2E, ADRs, history check, walk, Release B   side: both   covers: —   deps: K1, K7
Owner's words: "As the Applika owner, I want to bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it, and then rebuild and enhance that feature on top of what applika is today: tailoring from our base CVs instead of uploaded CVs, jobs becoming draft applications, and scraping that runs safely in production, so that users find remote jobs, see how well their CV fits, and apply with a tailored CV in a few clicks, while Ían keeps the credit for his contribution."
Clarified: success signals: `git log --author=Muliterno` lists Ían's ten commits; three clicks or fewer from a listed job to a keyword-tailored draft; new postings within about an hour; a source outage shows on the admin screen and never slows or fails a user's request; installed command-line clients notice no change.
Covers: — (closing)
Release: B, tag `0012-release-b`. Plan: docs/plan/0012-job-board-fit-and-keyword-tailoring.md. Tasks: docs/plan/0012-job-board-fit-and-keyword-tailoring.tasks.md
Touch:
- docs/plan/0012-job-board-fit-and-keyword-tailoring.md (header lines only, T109)
- docs/adr/0016-taskiq-worker-for-background-jobs.md, docs/adr/0017-keyword-tailoring-and-fit-score.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0011-agenda-tabs-and-rate-limit.tasks.md K5
Contract: none new.
Steps:
- T105 Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T106 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; every file K2..K5 touched is clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`.
- T107 Full `scripts/e2e.sh` (`jobs.spec.ts` + every older spec, worker + scheduler + fixture scraper). Confirm the `e2e` job in .github/workflows/frontend-ci.yaml runs it (its paths include `backend/**`, so the fixture under `backend/tests/fixtures/jobs/` triggers it). Cheaper layers carry what the E2E does not:
  - real Himalayas and RemoteOK HTTP, blocked and failing sources: test_himalayas_scraper.py, test_remoteok_scraper.py, test_ingest_jobs.py (K4);
  - the run lock and overlap, Redis down at boot: test_worker_tasks.py; run now 409/503: test_admin_jobs.py;
  - expiry and fit deletion: test_ingest_jobs.py; recompute on CV save: test_recompute_fit.py, test_base_cv_api.py;
  - fit determinism: test_keyword_fit.py; reorder invariants: test_keyword_tailoring.py;
  - the CLI verbatim copy (R-027): test_tailored_cv_api.py + the T111 walk;
  - the migration round trip: test_migration_job_board.py;
  - foreign fits, dismissals and searches hidden: test_jobs_api.py, test_job_searches.py; concurrent start: test_jobs_draft.py.
- T108 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - no network or volume from docker-compose.e2e.yml;
  - no testcontainers, Postgres or Redis left;
  - the owner's dev containers untouched.
- T109 ADRs, plan header, rules:
  - ADR-0016 and ADR-0017 read Accepted. Their Decisions match the build (queue name, lock key, cron default, a session per task, the CD guard; the three reorders, the `adjustments` shape, the fit formula). A departure → a dated as-built note under Consequences; the Decision is untouched;
  - ADR-0007 and ADR-0010 status lines carry "Amended by ADR-0017" / "Amended by ADR-0016" (K3 T035, K4 T056); 0001, 0003, 0004, 0005, 0006, 0009, 0014, 0015 read Accepted;
  - the plan header: PRD "(Draft)" → "(Approved)"; "0016 (Proposed)" and "0017 (Proposed)" → "Accepted 2026-10-11" (Plan corrections 1);
  - `grep -rn "_old" backend/app/` → none; `op.drop_` only in `downgrade()` of the new revision; `uv run pytest tests/integration -k migration`;
  - `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli;
  - the changelogs verify command; both changelogs carry the K3 `tailoring` and `/cv/fit` entry;
  - the commit-format verify on `develop..integration/0012-job-board` → no output (K1's 10 subjects outside the commit format live only on the K1 branch).
- T110 History and credit (R-001..R-003):
  - on `0012-history-import` (or `develop` once merged): `git log --author=Muliterno --format='%an %ad %s'` → his 10 commits with original dates and messages; the merge and the revert are the two commits in the commit format; `git diff 0012-history-import~3 0012-history-import -- . ':!backend/CHANGELOG.md'` → empty (`~3` = the T001 base, before merge, revert and changelog commit);
  - every commit on integration/0012-job-board that ports his logic carries the trailer: `git log develop..integration/0012-job-board --format='%h %s%n%(trailers:key=Co-authored-by)' -- backend/app/application/services/keyword_fit.py backend/app/application/services/keyword_tailoring.py backend/app/application/services/job_ingestion frontend/src/components/jobs frontend/src/services/implementations/job-service.ts` names Ían on each.
- T111 Walk through by hand on the dev compose stack (api, web, worker, scheduler, real scrapers), both themes, desktop and 390px:
  - Admin → Jobs: Run now → both sources run; Himalayas "OK" or "Blocked" on the live site (record which, plan Risk); RemoteOK "OK"; Run now during a run → "A run is already in progress"; stop `redis` → Run now → "Background service unavailable", and `/jobs` still lists the last collected jobs; start `redis`; turn RemoteOK off → the next run skips it; back on.
  - `/jobs`: newest first, 25 per page, every field; search, each filter, both sorts; a reload keeps the filters; with no master CV, no fit and the invitation; create a master CV → its fit after the recompute; edit it → the fit moves; delete it → its fit is gone.
  - Success signal: after picking a master CV, count the clicks from a listed job to a draft holding a keyword-tailored copy: ≤ 3.
  - The copy: "Show changes" lists the moves; its text equals the master's; the fit panel. An application not from a job with a JD → the switch and the fit; with no JD → neither.
  - Finish → "Applied"; close the application → still "Applied"; start a new cycle (archived) → still "Applied"; delete a draft from a job → the mark clears and a new start works; two tabs → one draft, the other offers to open it.
  - Dismiss and restore; saved searches: the 10 cap, rename, a duplicate name, apply.
  - Another user sees none of the first user's fits, dismissals, searches or marks; an admin sees only their own.
  - CLI (R-027): `uvx applika-cli==1.0.0 applications cv create <id> --from <cv-id>`, then 1.0.1 → a verbatim copy (`adjustments: []`); `uvx applika-cli==0.1.4 applications list` → unchanged.
  - Leave the stack across a full hour → a run at minute 0 UTC in `last_run_at`.
- T112 Record at close:
  - tag the K8 tip `0012-release-b` (local);
  - the owner steps of `### Releases` (B): worker + scheduler services and repo vars before the deploy; merge only after A's `alembic upgrade head` is confirmed; rollback B, then A;
  - the agent never touches prod.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty ≤ 171 with changed files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0016 and ADR-0017, Accepted 2026-10-11; bound 0001, 0003, 0004, 0005, 0006, 0007, 0009, 0010, 0014, 0015 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (jobs.spec.ts with the worker, the scheduler and the fixture scraper, the whole suite green via scripts/e2e.sh) runs inside the gate and is green; real Himalayas and RemoteOK HTTP, the run lock, expiry, fit determinism, the reorder invariants, the CLI verbatim copy and the migration round trip are carried by the cheaper layers named in T107.
- By-hand walk of the feature on a real stack done, including the three-click success signal, the live Himalayas outcome, Ían's ten commits in the history, and installed CLI versions.
- No new feature work.

## Matrix
| R | K |
|---|---|
| R-001 | K1 |
| R-002 | K1 |
| R-003 | K1, K3, K4, K5, K6 |
| R-004 | K4 |
| R-005 | K4 |
| R-006 | K4 |
| R-007 | K4, K5 |
| R-008 | K4 |
| R-009 | K4 |
| R-010 | K5, K6 |
| R-011 | K5, K6 |
| R-012 | K5, K6 |
| R-013 | K3 |
| R-014 | K3 |
| R-015 | K5, K6 |
| R-016 | K4, K6 |
| R-017 | K5 |
| R-018 | K5 |
| R-019 | K2, K4 |
| R-020 | K5, K6 |
| R-021 | K5, K6 |
| R-022 | K5 |
| R-023 | K3 |
| R-024 | K3 |
| R-025 | K3, K7 |
| R-026 | K3, K5, K6, K7 |
| R-027 | K3 |
| R-028 | K3, K7 |
| R-029 | K5, K6 |
| R-030 | K5, K6 |
| R-031 | K5, K6 |
| R-032 | K5, K6 |
| R-033 | K4, K7 |
| R-034 | K4, K7 |
| R-035 | K4, K7 |
| R-036 | K2 |

Uncovered: none. Orphan: K8 (closing, by design).

## Owner's words not served
None. `## In the owner's words` is one sentence. Checked clause by clause:
- "bring Ían Muliterno's job_scrapping PR (Himalayas and RemoteOK scraping, CV tailoring prototype, add application from a job) into applika's git history without losing his authorship, by merging his branch and reverting it": K1 (merge `--no-ff` + full revert, authors and dates kept), verified in K8 T110.
- "then rebuild and enhance that feature on top of what applika is today":
  - "tailoring from our base CVs instead of uploaded CVs": K3 (keyword binding on master CVs, through the existing port), K5 (job → draft with a copy), K7 (the switch on the CV page). Uploads stay out (PRD non-goal).
  - "jobs becoming draft applications": K5 T066-T067, K6 T085.
  - "scraping that runs safely in production": K4 (a separate worker and scheduler, lock, timeouts, a failing source isolated, fixture refused in PROD, guarded CD), K2 (expand first).
  - enhancements the owner chose (Q5): fit on applications (K3, K7), dismiss and marks (K5, K6), saved searches (K5, K6); the Discord alert was dropped by the owner ("ignore this discord alert").
- "so that users find remote jobs": K4 collection, K5 + K6 list, search, filters.
- "see how well their CV fits": K3 fit, K4 recompute, K5 + K6 best fit and per-CV fits, K7 fit on the CV page.
- "and apply with a tailored CV in a few clicks": K6 T085 (3 clicks after picking a CV), counted in K8 T111.
- "while Ían keeps the credit for his contribution": K1 (his commits, the tag message, the changelog line), the `Co-authored-by` trailer on every port (K3..K6), checked in K8 T110.
