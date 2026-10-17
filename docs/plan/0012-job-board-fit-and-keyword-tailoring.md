# Plan 0012 — Job board from Ían Muliterno's contribution: fit, keyword tailoring, drafts

PRD: docs/prd/0012-job-board-fit-and-keyword-tailoring.md (Approved)
ADRs bound:
- 0001 layer-first, extended by 0016 (`app/worker/`). 0003 snowflake ids. 0004 ownership; foreign → 404. 0005 migrations.
- 0007, amended by 0017: port binds clone (default) + keyword reorder (opt-in); no AI. 0009: `/cv` body gains optional field only.
- 0010, amended by 0016: images and CD unchanged; 2 new swarm services; migrations manual. 0015 limiter untouched.
- 0014: draft routes + `/cv*` only address drafts; job mark reads caller's own drafts (R-030); no read model changes.
- 0016 (Accepted 2026-10-11): taskiq worker + one scheduler on Redis, hourly, Redis lock, own session. 0017 (Accepted 2026-10-11): keyword binding + fit.
PRDs neighbouring: 0010 (drafts, `resolve_company`, private rows); 0007 (copy, diff R-023; R-016 superseded in part); 0000 (60, 78).

## Scope
Ships: Ían's 10 commits by merge + revert; hourly Himalayas + RemoteOK collection in a taskiq worker; web `/jobs` list +
detail with fit per master CV; job → draft, optional CV copy (copy | keywords); "Tailor by keywords" + copy fit on the
application CV page; dismiss/restore; Draft/Applied marks; saved searches (10/user, no notification); admin sources.
Not: CLI jobs commands, notifications, CV upload, ATS warnings, AI, other sources, job deletion, Ían's unrelated edits.

## Releases (expand first, `.claude/rules/prod-release-runbook.md` 4)
- R0, any time, independent: S1 history import (net diff none). Release A: S2 migration + round-trip test +
  `backend/CHANGELOG.md`; no ORM, route, frontend; owner merges to `main`, CD deploys, owner runs `alembic upgrade head`.
- Release B, only after A confirmed: S3 worker + ingestion + admin; S4 fit + keyword tailoring; S5 jobs API, searches,
  job → draft; S6 frontend; S7 e2e. Before B deploy owner adds `worker` + `scheduler` services (API image, API env) to
  the stack and sets repo vars `SWARM_WORKER_SERVICE_NAME`, `SWARM_SCHEDULER_SERVICE_NAME`.

## S1 history import (one slice)
- `git fetch ../applika-gh job_scrapping`; `git merge --no-ff e670914 -m "chore(jobs): merge job_scrapping by Ían Muliterno"`.
- 7 conflicts, mechanical, keep both sides: `backend/app/domain/models.py`, `backend/app/main.py`,
  `backend/app/presentation/api/admin/__init__.py`, `backend/app/presentation/dependencies.py`, `backend/pyproject.toml`,
  `backend/uv.lock`, `frontend/src/services/services.ts`; `frontend/src/components/layout/app-layout.tsx` → keep our delete.
- `git revert -m 1 HEAD`, message `revert(jobs): revert job_scrapping; rebuilt in feature 0012`.
- `backend/CHANGELOG.md` Added: `history import of Ían Muliterno's job_scrapping, no behaviour change`.
- PR body names Ían, links his upstream PR, lists exceptions. **PR merges with a merge commit, never squash or rebase,
  or his commits vanish.** `develop` → `main` merge commit too (human).
- Exception: `branches-and-commits.md` verify prints his 10 subjects; only merge + revert follow the commit format. His revision
  `a2b3c4d5e6f7` lives only between merge and revert, never at a tip, never runs.
- Verify: `git diff develop HEAD` empty; `--author=Muliterno` = 10; gates green. Later Ían commits: merge + revert alike.

## Data
S2: `backend/migrations/versions/<rev>_job_board.py` (new), down `3b78c3cd2a71` (head, verified). Snowflake ids, timestamps.
- `job_sources`: `code` varchar(50) unique, `name` varchar(100), `base_url` varchar(500), `platform_id` FK platforms SET
  NULL null, `is_enabled` default true, `last_run_at`, `last_run_status` varchar(20) `ok|failed|blocked`, `last_run_error`
  text, `last_run_found`/`last_run_saved` int. Seed `himalayas` Himalayas `https://himalayas.app`, `remoteok` RemoteOK
  `https://remoteok.com`; platform = public one with same `lower(name)`, else new public (`created_by` NULL, `url` = base).
- `jobs`: `source_id` FK RESTRICT, `external_id` varchar(500), `title` varchar(500), `company_name` varchar(300),
  `company_url` varchar(2083) null, `location_text` varchar(300) default 'Remote', `job_url` varchar(2083),
  `description_text` text, `employment_type` varchar(100) null, `salary_text` varchar(200) null, `tags` text[] '{}',
  `keywords` jsonb '[]', `content_hash` varchar(64), `posted_at` null, `first_seen_at`, `last_seen_at`, `is_active`
  default true. `uq_jobs_source_external`; `ix_jobs_active_posted` (is_active, posted_at DESC); GIN `ix_jobs_tags`.
- `job_fit_scores`: `user_id` FK users CASCADE, `job_id` FK jobs CASCADE, `base_cv_id` FK base_cvs CASCADE, `score`
  smallint CHECK 0..100, `computed_at`; `uq_job_fit_scores_cv_job` (base_cv_id, job_id); `ix_job_fit_scores_user_job`.
- `job_dismissals`: `user_id`, `job_id` FKs CASCADE, unique pair. `saved_job_searches`: `user_id` FK CASCADE, `name`
  varchar(100), `filters` jsonb, unique (user_id, lower(name)).
- `applications.job_id` null FK jobs SET NULL; partial unique `uq_applications_user_job` (user_id, job_id) WHERE not null.
- Downgrade: 5 tables → `*_old`, `job_id` → `job_id_old`, new indexes dropped, seeded platforms kept. Upgrade re-adopts
  `*_old` twins (precedent `3b78c3cd2a71`).
- Tenancy: `user_id` on fit, dismissal, search. Jobs + sources: shared, no owner. Fit rows: cache, gone with inactive job.

## Backend
Patterns: `app/application/use_cases/application_drafts/create_draft.py`, `app/domain/repositories/application_repository.py`,
`app/presentation/api/admin/platforms.py`, `app/application/services/clone_tailoring.py`. Ían's code read via
`git show <S1 merge>^2:backend/...`, ported, never copied whole; commits carry
`Co-authored-by: Ían Muliterno <iannimuliterno@gmail.com>`.
- S3 (ADR 0016): `pyproject.toml` + taskiq, taskiq-redis, httpx, cloudscraper. `app/config/settings.py`: `TASKIQ_BROKER_URL`,
  `JOBS_INGEST_ENABLED`, `JOBS_INGEST_CRON` '0 * * * *', `JOBS_LOOKBACK_DAYS` 7, `JOBS_RETENTION_DAYS` 15,
  `JOBS_SCRAPER_TIMEOUT_SECONDS` 30, `JOBS_INGEST_LOCK_SECONDS` 900, `JOBS_SCRAPERS` (`himalayas,remoteok`; `fixture`
  refused in PROD), `JOBS_FIXTURE_PATH`. `app/worker/{broker,tasks,queue}.py`, port `app/application/services/job_queue.py`
  (new); `app/main.py` lifespan starts/stops broker. `app/application/services/job_ingestion/scrapers/{base,himalayas,
  remoteok,registry,fixture}.py` (new), registry `dict[str, BaseScraper]`, cloudscraper behind one typed wrapper.
  `use_cases/jobs/ingest_jobs.py` (new): per enabled source fetch → upsert (source_id, external_id), `keywords` on hash
  change, `last_seen_at`, `last_run_*`; deactivate past `posted_at` (else `first_seen_at`) + 15 d, delete their fit rows;
  `recompute_fit.py` (new): new/changed jobs × every base CV + stale CVs (`updated_at > max(computed_at)`). Repos (new)
  `job_source_repository.py`, `job_repository.py`, `job_fit_score_repository.py`. `api/admin/jobs.py` (new) → `routers`.
- S4 (ADR 0017): `app/application/services/keyword_fit.py`, `keyword_tailoring.py` (new). `dependencies.py`
  `get_tailoring_service` → resolver `{'copy', 'keywords'}`. `use_cases/tailored_cvs/create.py` takes `tailoring`
  (`keywords` without `job_description` → 422); `tailored_cvs/fit.py` (new). `schemas/tailored_cv.py`
  `TailoredCVCreate.tailoring: Literal['copy','keywords'] = 'copy'`; `api/tailored_cv.py` + `/cv/fit`. `api/base_cv.py`
  POST/PATCH → `job_queue.recompute_fit(base_cv_id)`, best-effort.
- S5: `use_cases/jobs/{list_jobs,get_job,dismiss_job,restore_job}.py`, `use_cases/application_drafts/create_draft_from_job.py`
  (new), route in `api/application_draft.py`; reuses `resolve_company` (`use_cases/catalog/resolve.py`),
  `CreateDraftUseCase`, `CreateTailoredCVUseCase`, one transaction; `create_draft` + `job_id`; cut to field limits.
  `use_cases/job_searches/*`, `job_dismissal_repository.py`, `saved_job_search_repository.py`, `api/jobs.py`,
  `api/job_searches.py`, `schemas/jobs.py`, `schemas/job_searches.py` (new); `main.py` routers; `Draft` + `job_id`.
  `scripts/seed_mock_data.py`: searches, `tailoring: keywords`, `/cv/fit`. `backend/CLAUDE.md`: worker, jobs, bindings.

## Frontend
Module `frontend/src`, no i18n lib. Patterns: `app/(protected)/applications/cv/application-cv-page.tsx`,
`app/(protected)/admin/platforms/page.tsx`, `components/tailored-cvs/base-cv-picker.tsx`, `components/application-drafts/draft-cv-step.tsx`.
- Routes (new): `app/(protected)/jobs/{page,jobs-page}.tsx`; `jobs/view/{page,job-view-page}.tsx` (`?id=`, Suspense);
  `admin/jobs/page.tsx`. Filters in URL query; saved search applies by pushing its filters.
- `components/jobs/` (new): `job-filters`, `job-list-item`, `fit-badge`, `fit-keywords`, `job-status-badge`,
  `start-application-dialog` (master CV radio + copy | keywords), `saved-searches-menu`.
- Nav: `components/layout/nav.ts` `PRIMARY_NAV` Jobs after Applications; `components/admin/admin-nav.tsx` Jobs.
- `application-cv-page.tsx`, `base-cv-picker.tsx`, `draft-cv-step.tsx`: "Tailor by keywords" switch (off without JD) + fit panel.
- Services (new) `services/{interfaces/i-job-service,implementations/job-service,types/jobs}.ts` + job-search trio, in
  `services/services.ts`; `tailored-cv-service.ts` `create(…, tailoring)`, `getFit`.
- Query keys `jobs`, `job`, `job-searches`, `application-cv-fit`, `admin-job-sources`; start invalidates `jobs`, `application-drafts`.
- Design system (none named): `frontend/CLAUDE.md` "### Routing", "### Service Layer & DI", "### State Management",
  "### Forms", "### Tailored CVs", "### Application drafts", "### UI Components", "### App shell"; ADR-0006 tokens. ui-designer.

## Contract
- `JobFilters` `{search? ≤200, source?, tags? ≤10, min_fit? 0..100, posted_within_days? 1..15, sort='newest'|'fit', include_dismissed=false}`.
- `JobSummary` `{id, source{code,name}, title, company_name, location_text, employment_type|null, salary_text|null, tags[],
  posted_at|null, job_url, is_active, best_fit{base_cv_id,score}|null, dismissed, application{id,is_draft}|null}`.
  `JobDetail` = summary + `{description_text, company_url|null, fits[{base_cv_id, base_cv_name, score, matched_keywords[], missing_keywords[]}]}`.
- `GET /jobs?JobFilters&page≥1&per_page=1..100(25)` → 200 `{items, total, page, per_page, total_pages}` | 401 | 422.
- `GET /jobs/{id}` → 200 `JobDetail` | 404 (unknown; inactive unless own application). `PUT|DELETE /jobs/{id}/dismissal` → 204 | 404.
- `POST /applications/drafts/from-job` (draft route, ADR-0014) `{job_id, base_cv_id?, tailoring?='copy'}` → 201 `Draft`
  (+`job_id`) | 404 job unknown/inactive or base CV not own | 409 'You already have an application for this job' | 422.
- `GET /job-searches` → 200 `[{id, name, filters, created_at, updated_at}]` by name. `POST` `{name 1..100, filters}` → 201 |
  409 'A saved search with this name already exists' | 409 'Saved search limit reached (max 10)' | 422.
  `PUT /job-searches/{id}` → 200 | 404 | 409 | 422. `DELETE` → 204 | 404.
- `POST /applications/{id}/cv` `{base_cv_id, tailoring?='copy'}` → 201, `keywords` fills `adjustments` | existing
  404/409/422 | 422 'Add a job description to tailor by keywords'.
- `GET /applications/{id}/cv/fit` → 200 `{score: int|null, matched_keywords[], missing_keywords[]}` (null on blank JD) |
  404 not owned or no copy. Drafts allowed (ADR-0014 `cv*`).
- `GET /admin/jobs/sources` → 200 `[{id, code, name, base_url, platform_id, is_enabled, last_run_at, last_run_status|null,
  last_run_error, last_run_found, last_run_saved, active_jobs}]` | 403. `PATCH /admin/jobs/sources/{id}` `{is_enabled}` →
  200 | 404 | 403 | 422. `POST /admin/jobs/runs` → 202 `{queued: true}` | 409 'A run is already in progress' | 503
  'Background service unavailable' | 403.

## Tests
Unit: Ían's `test_himalayas_scraper.py` ported; RemoteOK fixtures; blocked → `blocked`. `keyword_fit` bounds, determinism,
tags. `keyword_tailoring`: same text multiset per section, stable ties, blank JD = clone, entries never moved,
adjustments. Ingest upsert, hash change, expiry + fit delete, one source failing; lock skip; resolver default.
Integration: `test_migration_job_board.py` (up/down/up, `_old`, seed reuses public platform); `test_jobs_api.py` (filters,
fit sort, foreign fits/dismissals hidden, inactive 404); `test_jobs_draft.py` (prefill, private company, platform, second
start 409, absent from `GET /applications`, keyword copy); `test_job_searches.py` (cap, duplicate, foreign 404);
`test_tailored_cv_api.py` (CLI body unchanged, keywords 422 without JD, `/cv/fit` on draft); `test_admin_jobs.py` (403,
202, 409 lock, 503); `test_worker_tasks.py` (`InMemoryBroker`).
Vitest: `jobs-page`, `job-list-item`, `fit-badge`, `start-application-dialog`, `saved-searches-menu`, `application-cv-page`, `nav`.
E2E: `frontend/e2e/jobs.spec.ts` (new), `docker-compose.e2e.yml` + `worker`, `scheduler`, `JOBS_SCRAPERS=fixture`: run now →
filter + save search → fits → start with master CV + keywords → reordered copy + diff → finish → Applied → dismiss/restore.

## Rules that bind
- `non-destructive-migrations.md`: no drop in upgrade; downgrade → `_old`; `app/` never maps `_old`. `migration-tests.md`:
  round-trip. `prod-release-runbook.md`: A, then B after owner confirms.
- `cli-compatibility.md`: `/cv` gains optional `tailoring` only; `GET /applications` unchanged (no `job_id`).
  `changelogs.md`: backend every slice; `cli/CHANGELOG.md`: optional `tailoring`, `adjustments` may be non-empty.
- `quality-gates.md`: ty clean on touched files (171 baseline), coverage ≥ 90, e2e real stack. `branches-and-commits.md`
  (S1 exception).

## Risks
- Squash-merging S1 erases Ían's authorship: merge commit only, stated in the PR.
- Cloudflare blocks cloudscraper: Himalayas `blocked`, RemoteOK goes on; ToS risk accepted by owner (Q3).
- Fit rows = active jobs × base CVs, deleted on expiry; revisit past ~1M rows. Two more VPS processes: owner checks memory.
- B deployed before the services exist: CD guard skips them; jobs stay empty until the stack has them.

## Open
None from the PRD. Technical, decided by the owner at approval 2026-10-11: 1. Broker on the same `REDIS_URL`, queue `applika:tasks`. 2. One worker replica.
