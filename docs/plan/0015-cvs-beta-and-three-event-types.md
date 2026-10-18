# Plan 0015 — CVs behind a beta flag, and three timeline event types

PRD: docs/prd/0015-cvs-beta-and-three-event-types.md
ADRs bound:
- 0004: rows owned by user; another user's row = 404, admins too; only role `is_admin`.
- 0005: non-destructive migrations, `_old` copies, working downgrade.
- 0009: CLI compat layer; 0.1.4 routes keep shapes.
- 0012: timeline + reversible finalize; "five-value `event_type`" amended by 0020.
- 0016: worker never gated.
- 0018: beta registry + allowlist + `require_feature`; "Only admins write it" amended by 0021.
- 0020 (Proposed): `event_type` interview|offer|denied; note/feedback → interview/unknown; `event_type_old` copy; temp trigger A→B.
- 0021 (Proposed): shipped feature gated later; Release A migration pre-fills list (`added_by` NULL); top-up at B.
PRDs neighbouring: 0007 (CV builder, now gated), 0008 (R-001 five types, superseded), 0010 (drafts, now gated),
0012 (start-from-job + fit now also need `cvs`), 0013 (gate mechanism; non-goal + R-004 superseded for `cvs`).

## Scope
Ships: feature `cvs` (seed, list pre-filled with CV owners, top-up), `require_feature(CVS)` on base-CV, application-CV
and drafts routers, slash twins, web gates, job board without fit/start for no-`cvs` users; `EventType` three values
in API/web/CLI; conversion of note/feedback with `event_type_old`; temp trigger between releases.
Not: other gates, CLI feature messages, dropping PG enum labels, deleting `_old`, any 0.1.4 route change, rule edit
(orchestrator does it at ADR-0021 acceptance).

## Releases
- Release A, tag `0015-release-a`: R1 + `test_migration_cvs_feature_event_types.py` only. No app code. Chains after
  0014 head `ed39a0fad1e5`; reaches `main` only after 0012–0014 do. The owner runs `alembic upgrade head` in the API
  container and confirms before B merges to `main`.
- Release B, tag `0015-release-b`: all Backend/Frontend/CLI work + R2 + its test. CD deploys image; the owner runs
  `alembic upgrade head` right after (R2 drops the trigger and enrols late CV owners).
- Rollback B: `alembic downgrade <R1>`, swarm back to A image, restart. Rollback A: `alembic downgrade ed39a0fad1e5`,
  previous image, restart. Neither loses rows.

## Data
R1 `backend/migrations/versions/<rev>_cvs_feature_and_event_types.py` (new), down_revision `ed39a0fad1e5`:
1. Guard: `steps_definition.event_type IN ('note','feedback')` count > 0 → `RAISE` (never true, `afd4074c70c2` STEP_MAPPING).
2. Seed `features` (`cvs`, `CV builder`, PRD description, `beta`, `released_at` NULL), `ON CONFLICT (key) DO NOTHING`
   (`641001baff09` `_seed_features` shape, `generate_snowflake_id`).
3. Enrol: one `feature_beta_users` row per user with ≥1 `base_cvs` or `tailored_cvs` row; `added_by` NULL;
   `ON CONFLICT (feature_id, user_id) DO NOTHING`; ids from `generate_snowflake_id` in a Python loop.
4. `timeline_events.event_type_old` `event_type` NULL (`ADD COLUMN IF NOT EXISTS`); `UPDATE SET event_type_old = event_type`.
5. `UPDATE SET event_type='interview', interview_type='unknown' WHERE event_type IN ('note','feedback')`.
   Existing four CHECKs hold (no schedule, salary or reason on old notes).
6. `ck_timeline_events_event_type` CHECK `event_type IN ('interview','offer','denied')`.
7. Function `timeline_events_legacy_event_type()` + trigger `trg_timeline_events_legacy_event_type` BEFORE INSERT OR
   UPDATE FOR EACH ROW: NEW note/feedback → `event_type_old := NEW.event_type`, `event_type := 'interview'`,
   `interview_type := 'unknown'`. SQL in one module constant, reused by R2 downgrade.
- downgrade: drop trigger + function; drop CHECK; `UPDATE SET event_type = event_type_old, interview_type = NULL
  WHERE event_type_old IN ('note','feedback') AND event_type='interview' AND interview_type='unknown' AND start_time,
  end_time, timezone IS NULL`; keep `event_type_old` column; keep `cvs` row + list rows (old image: `key` is `str`).
R2 `<rev>_cvs_topup_and_drop_legacy_trigger.py` (new), down_revision R1:
- upgrade: `DROP TRIGGER/FUNCTION IF EXISTS`; enrol users whose `min(created_at)` over `base_cvs` ∪ `tailored_cvs` >
  `features.created_at` of `cvs`, `added_by` NULL, `ON CONFLICT DO NOTHING`.
- downgrade: recreate function + trigger; top-up rows kept.
PG type `event_type` keeps five labels. Tenancy: `feature_beta_users.user_id`, `timeline_events.user_id`. No new index.
ORM (B): `EventType` three members; `TimelineEventModel.__table_args__` mirrors `ck_timeline_events_event_type`;
`event_type_old` never mapped.

## Backend
- `app/core/features.py`: `CVS = 'cvs'`. `app/core/enums.py`: `EventType` = INTERVIEW, OFFER, DENIED.
- `app/presentation/api/base_cv.py`: `APIRouter(..., dependencies=[require_feature(FeatureKey.CVS)])`; end
  `add_slash_twins(router)`.
- `app/presentation/api/tailored_cv.py`: router dep CVS; `/cv/fit` keeps JOBS; `tailoring: keywords` per-value JOBS
  unchanged; `add_slash_twins(router)` over every route (was `/cv/fit` only).
- `app/presentation/api/application_draft.py`: router dep CVS; `/from-job` keeps JOBS; twins over every route.
- `app/presentation/api/jobs.py`: `user_has_feature(FeatureKey.CVS, …)` → `with_fit`; `use_cases/jobs/list_jobs.py`,
  `get_job.py` take `with_fit`; False → `best_fit` null, `fits` [], `min_fit` → no items, `sort=fit` = newest.
- `use_cases/compat/step_translation.py`: drop `(NOTE, None)`, `(FEEDBACK, None)` from `REVERSE_STEP_NAMES`; ids unchanged.
- Follow the enum in `schemas/timeline_event.py`, `timeline_events/rules.py`, `user_stats/stages.py`,
  `get_supports.py`, repositories: no `EventType.NOTE|FEEDBACK` left.
- `scripts/seed_mock_data.py`: `has_cvs_feature()` beside `has_jobs_feature()`; without it skip CV, PDF, copy,
  keyword, drafts, from-job seeds; `seed_timeline()` notes → interviews.
- `app/scripts/seed_e2e.py` `reset_beta_features`: `cvs` beta, `released_at` NULL, `e2e-user` listed, `e2e-discord`
  off, no `e2e-admin` opt-out; missing row fails loudly.
- `backend/CHANGELOG.md`, `backend/CLAUDE.md` (Beta features, Timeline, Enums). Pattern: `api/jobs.py` router gate.

## Frontend
- `src/services/types/features.ts`: `FeatureKey` = `"jobs" | "cvs"`. `src/components/layout/nav.ts:42` CVs `feature: "cvs"`.
- `FeatureGate` wrapper + `BetaBadge` beside h1 (pattern `app/(protected)/jobs/jobs-page.tsx`): `cvs/cvs-page.tsx`,
  `cvs/new/new-cv-page.tsx`, `cvs/editor/cv-editor-page.tsx`, `applications/cv/application-cv-page.tsx`,
  `applications/new-with-cv/new-with-cv-page.tsx`.
- `components/applications/application-item.tsx`: CV link only with `cvs`. `app/(protected)/applications/applications-page.tsx`:
  no `cvs` → no Tabs, no Drafts, no "New with CV" (archived-cycle branch shape).
- Jobs: `components/jobs/start-application-flow.tsx` + Start button, `master-cv-invitation.tsx`, fit UI only with
  `cvs`; `job-status-badge.tsx` "Draft" = text without `cvs`; `hooks/use-base-cvs.ts` queries enabled only with `cvs`.
- Timeline: `timeline-types.ts` three types; `timeline-options.ts` drop note/feedback config;
  `timeline-event-schema.ts` drop note/feedback branch, default `interview` + `unknown`; `timeline-event-form.tsx`.
- i18n: none (copy constants in modules). Design system: none named; reuse `FeatureGate`, `BetaBadge`, `NotFoundMessage`.
- `frontend/CLAUDE.md` (Beta features, Timeline, nav counts).

## CLI
`cli/src/applika/schemas/enums.py` `EventType` three; `commands/applications/commands.py` help; `skills/applika-cli/SKILL.md`,
`README.md`, `tests/test_timeline_and_finalize.py`; `cli/CHANGELOG.md` Unreleased: Removed `--type note|feedback`,
Changed `cvs *`/`applications cv *` 404 without `cvs`.

## Contract
No `cvs` → 404 `{"detail":"Not Found"}`, byte-equal unknown route, slash twins too; anonymous → 401 first:
- `GET/POST /base-cvs`; `GET/PATCH/DELETE /base-cvs/{id}`; `POST /base-cvs/{id}/pdf`; `GET /base-cvs/{id}/markdown`.
- `POST/GET/PUT/DELETE /applications/{id}/cv`; `POST …/cv/pdf`; `GET …/cv/markdown`, `…/cv/diff/markdown`,
  `…/cv/diff/pdf`; `GET …/cv/fit` (needs `cvs` and `jobs`).
- `POST/GET /applications/drafts`; `GET/PUT/DELETE /applications/drafts/{id}`; `POST …/{id}/finish`;
  `POST /applications/drafts/from-job` (needs `cvs` and `jobs`).
- With `cvs`: every shape and status unchanged.
- `GET /jobs`, `GET /jobs/{id}` without `cvs`: 200, `best_fit: null`, `fits: []`, `min_fit` → `items: []`, `sort=fit` → newest.
- `POST /applications/{id}/timeline`, `PUT …/timeline/{event_id}`: `event_type` ∈ `interview|offer|denied`, else
  422 (Pydantic enum error). Responses and OpenAPI: three values.
- Unchanged: `/steps*` (0.1.4 shapes, ids, `Deprecation`), `/finalize` (all bodies), `/supports`, statistics (nine
  stages), agenda shape. `GET /users/me/features` adds `{key: "cvs", stage}`. `/admin/features` lists `cvs`; enrolled
  rows `added_by: null`.

## Tests
- Unit: `step_translation` reverse (interview/unknown → "Phase 2"); timeline schema refuses note/feedback; stages.
- Integration `tests/integration/test_migration_cvs_feature_event_types.py` (new): seed users with/without CVs,
  notes, feedback, interviews; upgrade → `cvs` row, list = CV owners with `added_by` NULL, no note/feedback,
  `event_type_old` = originals, raw INSERT of `note` → interview/unknown + `event_type_old` `note`; downgrade →
  originals back, edited rows kept, trigger and CHECK gone, column kept; re-upgrade = first. Guard raises.
- `test_migration_cvs_topup_and_drop_legacy_trigger.py` (new): top-up enrols first-CV-after-seed users only; an
  admin-removed pre-A owner stays off; trigger gone; round trip.
- Gate: every route above 404 without `cvs`, slash twins, 401 anonymous, admin access, opt-out; `cvs_beta` fixture in
  `tests/conftest.py` (`jobs_beta` pattern, `tests/features_seed.py`) on every CV/draft test module; jobs without
  `cvs` → no fit; `GET /steps` for 0.1.4 identical before/after.
- CLI `make test`: `--type note` → exit 2. Frontend vitest: nav 6/7/8; `FeatureGate` on CV pages; schema three types;
  tests seeding `["user","features"]` add `cvs`.
- E2E: `frontend/e2e/cvs-beta.spec.ts` (new): `e2e-discord` (no `cvs`) rail without CVs, `/cvs` "page not found",
  `GET /base-cvs` 404; admin adds them → reload shows CVs + "Beta"; `afterAll` removes. Update
  `shell-responsive.spec.ts`, `beta-features.spec.ts:318` (seven → six), `timeline.spec.ts` (notes → interviews).

## Rules that bind
- `beta-features.md`: `FeatureKey` + seed + `require_feature` + twins + web hooks; point 2 exception via ADR-0021.
- `non-destructive-migrations.md`: no drop in upgrade; `event_type_old` copy, downgrade restores; no app code reads `_old`.
- `migration-tests.md`: one round-trip test per revision (R1, R2).
- `prod-release-runbook.md`: A migration only; B after the owner confirms A.
- `cli-compatibility.md`: 0.1.4 routes and step ids untouched.
- `changelogs.md`: backend + CLI under Unreleased, no ticket keys. `branches-and-commits.md`: conventional, no keys.
- `quality-gates.md`: touched files `ty`-clean, coverage ≥ 90.

## Risks
- Between the B deploy and R2, a user whose first CV came after A gets 404. The owner runs R2 at once.
- Window A→B: an old-image POST of a note answers `note`; the next read says interview/unknown.
- Many CV and draft tests use `async_client` with no feature; each module needs `cvs_beta`.
- `create_all` builds a three-label type; only the R1 test sees the five-label one.
- B must not reach `main` before A's migration ran: every CV route would 404 for everyone (fail closed).

## Open
- None. R-018 answered by the owner 2026-10-17: "Yes, count them (Recommended)". ADR-0020 and ADR-0021
  Accepted 2026-10-17; `beta-features.md` point 2 carries the ADR-0021 exception.
