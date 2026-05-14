# Job Monitoring + CV Tailoring + ATS Plan

## Goal

Add a new Applika feature set that:

1. Monitors remote job sources.
2. Lets the user inspect and filter jobs quickly.
3. Tailors a CV for a selected job.
4. Runs an ATS-oriented check on the tailored result.

`application_platform` is reference material only. It should not be imported or treated as part of the runtime project.

## Scope Differences From `application_platform`

- Sources: only `Himalayas` and `RemoteOK` in v1.
- UI: use Applika's existing protected layout, service layer, React Query, Tailwind, and shadcn patterns.
- Latency: do not copy the reference app's "load jobs then score/filter in Python per request" path. Filtering and sorting must stay fast as data grows.

## Current Repo Fit

### Backend

- Applika already has a FastAPI backend with clean layering:
  `presentation/api` -> `application/use_cases` -> `domain/repositories` -> `domain/models`.
- Redis already exists and should be used for short-lived caches and background coordination.
- PostgreSQL is the right source of truth for jobs, resume artifacts, and fit snapshots.

### Frontend

- Applika already has a protected shell and a clear nav structure in [frontend/src/components/layout/app-layout.tsx](/Users/ian_muliterno/Documents/GitHub/applika/frontend/src/components/layout/app-layout.tsx:1).
- Data access already goes through typed service classes in [frontend/src/services/services.ts](/Users/ian_muliterno/Documents/GitHub/applika/frontend/src/services/services.ts:1).
- Current applications filtering is client-side in [frontend/src/hooks/use-applications.ts](/Users/ian_muliterno/Documents/GitHub/applika/frontend/src/hooks/use-applications.ts:1). That is acceptable for today's dataset, but the new jobs feature should be designed server-first from day one.

## Reference Pieces To Reuse Conceptually

- Scraper abstraction and normalization:
  `application_platform/src/app/scrapers/base.py`
- Himalayas and RemoteOK parsers:
  `application_platform/src/app/scrapers/himalayas.py`
  `application_platform/src/app/scrapers/remoteok.py`
- Resume parsing:
  `application_platform/src/app/resume/parser.py`
- Heuristic fit scoring:
  `application_platform/src/app/ai/scoring.py`
- ATS checks:
  `application_platform/src/app/ai/ats.py`

Do not reuse the reference HTTP shape directly. In particular, avoid the list endpoint in `application_platform/src/app/http/jobs.py`, which computes fit scores inline while iterating through rows.

## Proposed Product Shape

- New protected area: `Opportunities` or `Jobs`.
- Main flows:
  1. Monitor sources and ingest jobs.
  2. Browse jobs with fast server-side filters and sort.
  3. Save one or more resume versions.
  4. Open a job detail view with fit analysis.
  5. Generate tailored CV output.
  6. Show ATS findings before the user exports or copies the draft.
  7. Optionally convert a selected job into a tracked Applika application.

## Architecture

### 1. Domain Model

Add dedicated job-search models instead of overloading `ApplicationModel`.

Recommended new tables:

- `job_sources`
  - `id`
  - `code` (`himalayas`, `remoteok`)
  - `name`
  - `base_url`
  - `is_enabled`
  - `last_scraped_at`
  - `last_scrape_status`
  - `last_scrape_error`

- `jobs`
  - `id`
  - `source_id`
  - `external_id`
  - `title`
  - `company_name`
  - `company_url` nullable
  - `location_text`
  - `job_url`
  - `description_raw`
  - `description_text`
  - `employment_type` nullable
  - `salary_text` nullable
  - `posted_at`
  - `fetched_at`
  - `is_active`
  - `content_hash`

- `job_tags`
  - `job_id`
  - `tag`

- `user_resumes`
  - `id`
  - `user_id`
  - `filename`
  - `content_type`
  - `storage_path`
  - `parsed_text`
  - `is_default`
  - `byte_size`
  - `created_at`

- `job_fit_snapshots`
  - `id`
  - `user_id`
  - `job_id`
  - `resume_id`
  - `fit_score`
  - `matched_keywords_json`
  - `missing_keywords_json`
  - `computed_at`

- `tailored_documents`
  - `id`
  - `user_id`
  - `job_id`
  - `resume_id`
  - `kind` (`cv`)
  - `provider` (`heuristic`, later LLM provider id)
  - `template_version`
  - `content_json`
  - `plain_text`
  - `created_at`

- `ats_reports`
  - `id`
  - `tailored_document_id`
  - `score` nullable
  - `warnings_json`
  - `missing_keywords_json`
  - `created_at`

Indexes:

- unique `(source_id, external_id)` on `jobs`
- index `(posted_at desc)`
- index `(source_id, posted_at desc)`
- index `(is_active, posted_at desc)`
- index `(user_id, computed_at desc)` on fit snapshots
- unique `(user_id, job_id, resume_id)` on fit snapshots if we want latest overwrite semantics

Optional later optimization:

- PostgreSQL `tsvector` on `title + company_name + description_text + tags`
- trigram index for company/title fuzzy search

### 2. Scraping/Ingestion Layer

Create a new backend package, for example:

- `backend/app/application/services/job_ingestion/`
- `backend/app/domain/repositories/job_repository.py`
- `backend/app/domain/repositories/job_source_repository.py`

Recommended components:

- `scrapers/base.py`
- `scrapers/himalayas.py`
- `scrapers/remoteok.py`
- `scrapers/registry.py`
- `ingestion/run_job_ingestion.py`

Implementation rules:

- Persist normalized text only after stripping HTML.
- Use idempotent upsert by `(source_id, external_id)`.
- If a job payload changes, update the record and replace tags.
- Mark jobs inactive only through explicit retention logic, not by silently disappearing them during one failed scrape.
- Failures must be visible through source status fields and logs.

### 3. Background Execution

Applika should not run job scraping in the request path.

Recommended v1 approach:

- Add an admin-only/manual trigger endpoint.
- Add a scheduled ingestion job using APScheduler or a lightweight async loop on backend startup.
- Guard the scheduler so only one instance executes ingestion at a time.
- Use Redis lock keys to prevent duplicate concurrent scrapes if multiple app instances run.

Recommended v1.1 approach:

- Move ingestion and fit refresh into explicit worker processes if deployment topology becomes multi-instance.

### 4. Resume Parsing

Port the reference parser behavior into the backend stack:

- PDF via `pypdf`
- DOCX via `python-docx`
- TXT/MD as plain text

Rules:

- Never log resume contents.
- Store original bytes on disk or object storage and parsed text in DB.
- Support multiple resume versions per user, with one default resume.
- Keep parsing synchronous at upload time because it is bounded work and gives immediate user feedback.

### 5. Fit Scoring

This is the main latency-sensitive area.

Do not do this:

- Fetch 100 jobs.
- Compute fit for all of them in the list request.
- Filter/sort in Python after loading.

Do this instead:

- Compute fit snapshots asynchronously when:
  - a resume is uploaded or changed
  - a new job is ingested
  - a user explicitly requests refresh
- Store the score and keyword breakdown in `job_fit_snapshots`.
- Join snapshots in list/detail queries.

Benefits:

- list endpoint stays mostly DB-bound
- sorting by fit becomes SQL sort
- filtering by min fit becomes SQL predicate
- pagination remains stable

Initial scoring implementation:

- Port the lexical heuristic from `application_platform/src/app/ai/scoring.py`.
- Keep it deterministic and cheap.
- Store enough metadata to explain the score in UI.

Later upgrade path:

- embeddings or reranking for detail view only, never as a blocking list dependency

### 6. ATS Check

Port the reference ATS normalization/check logic, but treat it as a report on generated output rather than a guarantee.

Recommended behavior:

- Run ATS check immediately after tailoring.
- Return:
  - warnings
  - missing JD keywords
  - normalized plain-text preview
- Keep ATS checks synchronous for the tailor response because the input is already in memory and the rule set is cheap.

### 7. CV Tailoring

Recommended v1:

- Start with heuristic tailoring first.
- Use current user profile plus selected resume as the source profile.
- Reorder skills and bullets by JD relevance.
- Inject missing but verified user context only from explicit user input, never fabricate experience.

Recommended inputs:

- resume parsed text
- job description text
- Applika user profile fields already available today:
  - `current_role`
  - `current_company`
  - `experience_years`
  - `tech_stack`
  - `bio`
  - `linkedin_url` only as metadata, not scraped content

Recommended v1 output:

- structured tailored CV JSON
- plain-text ATS-safe rendering
- warnings explaining what still needs human review

Recommended v1.1:

- optional LLM provider path behind the same schema, with heuristic fallback on errors

### 8. Convert Job To Application

This should be part of the plan even if not in the first slice.

Add a user action on a job:

- `Create Application from Job`

Mapping:

- `role` <- job title
- `company` <- job company
- `platform` <- source platform
- `link_to_job` <- job URL
- `mode` default from source or user choice
- `work_mode` infer from location text when possible

This keeps the new feature integrated with the core tracker instead of becoming a separate mini-app.

## API Plan

### Jobs

- `GET /jobs`
  - query params: `source`, `search`, `min_fit`, `posted_after`, `sort`, `cursor` or `page`
  - default sort: `posted_at desc`
- `GET /jobs/{job_id}`
- `POST /jobs/{job_id}/applications`
  - create tracked application from job

### Resume

- `GET /users/me/resumes`
- `POST /users/me/resumes`
- `PATCH /users/me/resumes/{resume_id}`
  - set default
  - rename if needed
- `DELETE /users/me/resumes/{resume_id}`

### Fit

- `POST /jobs/fit/refresh`
  - optional targeted refresh
- `GET /jobs/{job_id}/fit`

### Tailoring / ATS

- `POST /jobs/{job_id}/tailor-cv`
- `GET /tailored-documents/{document_id}`
- `GET /tailored-documents/{document_id}/ats`

### Admin / Operations

- `POST /admin/jobs/ingestion/run`
- `GET /admin/jobs/ingestion/status`

## Backend Query Strategy

For latency, job listing should be one SQL query with joins, not a Python enrichment loop.

Recommended list query shape:

- base `jobs`
- left join latest fit snapshot for current user and selected resume
- filters applied in SQL
- sort applied in SQL
- pagination applied in SQL

Prefer cursor pagination over offset pagination if the list is expected to grow quickly.

Recommended sort options:

- `newest`
- `oldest`
- `best_fit`

For `best_fit`, sort by:

- `fit_score desc nulls last`
- `posted_at desc`

## Frontend Plan

### New Route

Add a new protected route:

- `frontend/src/app/(protected)/jobs/`

Add a sidebar item in [frontend/src/components/layout/app-layout.tsx](/Users/ian_muliterno/Documents/GitHub/applika/frontend/src/components/layout/app-layout.tsx:1).

### Page Structure

- `jobs/page.tsx`
- `jobs/jobs-page.tsx`
- `components/jobs/job-filters.tsx`
- `components/jobs/job-list.tsx`
- `components/jobs/job-card.tsx`
- `components/jobs/job-detail-sheet.tsx` or route-based detail page
- `components/jobs/resume-upload-dialog.tsx`
- `components/jobs/tailor-cv-dialog.tsx`
- `components/jobs/ats-report.tsx`

### UI Guidance

- Follow Applika's existing shell and spacing scale.
- Reuse existing filter control patterns from the applications page.
- Prefer detail side-sheet or split-view over a separate visual system.
- Keep the list responsive and usable on mobile.

### Frontend Data Flow

Create:

- `services/interfaces/i-job-service.ts`
- `services/implementations/job-service.ts`
- `services/types/jobs.ts`
- `hooks/use-jobs.ts`
- `hooks/use-resumes.ts`
- `hooks/use-tailored-documents.ts`

Rules:

- filters and sort live in URL search params or a single page state object
- query keys include filter inputs
- server performs filtering and sorting
- client only handles lightweight view transforms

## Latency Strategy

This is the most important design constraint.

### Must-Haves

- precompute fit snapshots
- store normalized job text
- SQL-side filter/sort
- paginated list responses
- avoid N+1 queries
- avoid per-row ATS or tailoring work in list APIs

### Good v1 Additions

- Redis cache for repeated list queries for a short TTL
- background refresh of fit snapshots after scrape/upload
- `content_hash` to skip unnecessary recomputation when job text did not change

### Explicitly Avoid In v1

- scraping during page load
- synchronous fit recomputation during list requests
- LLM calls during list/detail load
- client-side filtering over a large downloaded dataset

## Testing Plan

Follow TDD for each slice.

### Backend Unit Tests

- Himalayas parser normalization
- RemoteOK parser normalization
- HTML stripping and tag persistence
- fit scoring output
- ATS warnings
- resume parsing for supported formats
- tailoring heuristics

### Backend Integration Tests

- ingestion upsert behavior
- duplicate job protection
- jobs list filtering and sorting
- fit snapshot refresh flows
- resume upload and default resume behavior
- tailor endpoint persistence
- create-application-from-job flow

### Frontend Tests

- jobs page filters call the API correctly
- sort changes update the query
- detail view renders fit/ATS states
- resume upload flow
- tailor action success and partial failure states

### Performance Tests

- seeded dataset with at least 10k jobs
- verify list latency for:
  - newest sort
  - best fit sort
  - search + source + min_fit combined

## Delivery Phases

### Phase 1. Data + Ingestion

- add tables, repositories, migrations
- port Himalayas and RemoteOK scrapers
- add admin/manual ingestion endpoint
- add ingestion tests

### Phase 2. Resume + Fit Infrastructure

- add resume upload/storage/parsing
- add fit snapshot computation and refresh path
- add list/detail APIs with SQL-side fit join
- add tests for list filtering/sorting

### Phase 3. UI Browsing

- add jobs nav item and protected route
- build jobs list and detail view
- wire filters/sort to backend
- reuse Applika visual language

### Phase 4. Tailoring + ATS

- add heuristic tailor CV use case
- add ATS report generation
- build tailor/ATS UI
- persist tailored outputs

### Phase 5. Tracker Integration

- add create-application-from-job
- connect source platforms to existing application creation flow

### Phase 6. Optimization Pass

- benchmark query plans
- add indexes missed in real data
- add Redis caching where useful
- evaluate async worker separation if ingestion/fit refresh becomes heavy

## Open Questions

- Should jobs be global across all users, or user-scoped by preferences such as role/seniority/location?
  Answer: global
- Should tailoring support only one default resume in v1, or multiple selectable resumes immediately?
  Answer: one default resume
- Should the first release include document export formats, or only on-screen/plain-text output?
  Answer: include export
- Do we want admin-only ingestion controls, or user-visible refresh for personal job feeds?
  Answer: admin-only
## Recommended First Cut

If we want the smallest production-worthy slice:

1. Implement global jobs ingestion for Himalayas and RemoteOK.
2. Add resume upload and one default resume per user.
3. Precompute fit snapshots.
4. Ship a fast jobs list/detail UI in Applika style.
5. Add heuristic CV tailoring plus ATS warnings.
6. Add create-application-from-job.

That delivers user value without inheriting the slowest parts of `application_platform`.
