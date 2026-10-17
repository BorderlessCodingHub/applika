# Plan 0013 — Beta features: jobs behind per-feature allowlist

PRD: docs/prd/0013-beta-features.md (Approved)
ADRs bound:
- 0004 ownership; `is_admin` only role; `/admin/*` → `AdminUserDp`. Extended, not amended, by 0018.
- 0018 (Accepted 2026-10-14): has F = general OR listed OR (admin AND no opt-out); opt-out counts in beta only, list wins;
  `require_feature(key)` → 404 like unknown route; unknown key hidden for all; worker never gated.
- 0003 snowflake ids. 0005 non-destructive migrations. 0016 worker untouched. 0017 keyword binding gated per value. 0014 from-job + `/cv/fit` gated, draft rows untouched.
PRDs neighbouring: 0012 (all user surfaces gated; worker + admin sources not; R-010 narrowed); 0004 (admin area, R-001, `GET /admin/users?search=` reused).

## Scope
Ships: feature registry, per-feature beta allowlist, per-admin opt-out; `jobs` seeded in beta, empty list, admins have
it by default; API gate on every PRD 0012 user route + `tailoring=keywords`; `GET /users/me/features`; admin
`/admin/features` (list, beta users, add/remove, release/revert, own opt-out); web hides Jobs nav, `/jobs*`, "Tailor by
keywords", CV fit panel; "Beta" label; workspace rule so later features start in beta. Not: % rollout, cohorts,
self-enrol, notifications, kill switch, opt-out for others, gating pre-0012 features, CLI, admin create/delete features.

## Releases (expand first, `.claude/rules/prod-release-runbook.md` 4)
State: all 0012 in local `develop` (5a652dd, unpushed); tags `0012-release-a` (dc7c8f1, rev `b28d5134631f`), `0012-release-b`. Prod has neither.
**0012 B code must never reach `main` without 0013 B, or every user sees jobs.**
- Release A (owner 2026-10-14: "Cut 0013-release-a from tag (Recommended)"): S1 only (migration, round-trip test,
  `backend/CHANGELOG.md`). Branch from tag `0012-release-a`; tag `0013-release-a`; also `--no-ff` into `develop`. Owner
  merges it into `main` (0012 A + 0013 A migrations, no code reads either), CD deploys, owner runs `alembic upgrade head`.
- Release B, only after A confirmed: S2 backend gate + admin API; S3 web; S4 e2e + full gate. Owner merges `develop`
  (0012 B + 0013 B) into `main`. After deploy only admins see jobs; owner enrols users at `/admin/features`.

## Data
S1: `backend/migrations/versions/<rev>_feature_flags.py` (new), down `b28d5134631f` (head, verified).
- `features`: `id` snowflake PK, `key` varchar(50) `uq_features_key`, `name` varchar(100), `description` varchar(500) null,
  `stage` varchar(20) default 'beta' `ck_features_stage` IN ('beta','general'), `released_at` null, timestamps.
- `feature_beta_users`: `id` snowflake PK, `feature_id` FK features CASCADE, `user_id` FK users CASCADE, `added_by` FK
  users SET NULL null, timestamps; `uq_feature_beta_users_feature_user`; `ix_feature_beta_users_user_id`.
- `feature_admin_opt_outs`: `id` snowflake PK, `feature_id` FK features CASCADE, `user_id` FK users CASCADE,
  timestamps; `uq_feature_admin_opt_outs_feature_user`; `ix_feature_admin_opt_outs_user_id`. Own table, not a flag on
  `feature_beta_users`, so list counts and membership never mix with opt-outs.
- Seed: `jobs` | `Job board` | `Remote job list, CV fit and keyword tailoring (PRD 0012)` | beta. No list/opt-out rows.
- Downgrade: three tables → `*_old`; upgrade re-adopts `_old` twins when present, else creates (precedent
  `b28d5134631f`, `3b78c3cd2a71`). No drop in upgrade.
- Tenancy: `features` shared, admin-managed; `feature_beta_users` admin-written; opt-out rows written by that admin for
  themselves only. ORM (S2): `FeatureModel`, `FeatureBetaUserModel`, `FeatureAdminOptOutModel` in
  `app/domain/models.py`, `__table_args__` mirror indexes (tests use `create_all`).

## Backend
Patterns: `app/presentation/api/admin/jobs.py`, `api/admin/discord_webhooks.py`, `app/domain/repositories/job_source_repository.py`, `dependencies.py` `get_admin_user`.
S2:
- `app/core/features.py` (new): `FeatureKey(StrEnum)` `JOBS='jobs'`; `FeatureStage` `beta|general`; `AccessVia` `general|list|admin`.
- `app/domain/repositories/feature_repository.py` (new): `list_with_counts`, `get_by_key`, `features_for_user(user_id,
  is_admin)` (one query: general OR list row OR (is_admin AND no opt-out row)), `has_feature`, `list_users`,
  `add_user` / `opt_out` (`ON CONFLICT DO NOTHING`), `remove_user` / `opt_in`, `set_stage`.
- Use cases (new): `use_cases/features/list_my_features.py`; `use_cases/admin/features/{list_features,
  list_feature_users,add_feature_user,remove_feature_user,set_feature_stage,opt_out,opt_in}.py`. → general sets
  `released_at=now()`, → beta clears it, same stage no-op 200. Opt-out/in touch the caller's own row only.
- `dependencies.py`: `FeatureRepositoryDp`; `require_feature(key: FeatureKey)` → dependency on `CurrentUserDp` (has
  `is_admin`); lacks key → `ResourceNotFound('Not Found')` (`handlers.py` → `{"detail": "Not Found"}`). Runs before body
  validation, so bad body still 404. No cache.
- Gate, `require_feature(FeatureKey.JOBS)`:
  - `api/jobs.py` router `dependencies=[...]` → all `/jobs*`. `api/job_searches.py` router → all `/job-searches*`.
  - Route-level: `api/application_draft.py` `POST /applications/drafts/from-job`; `api/tailored_cv.py` `GET /applications/{id}/cv/fit`.
  - `api/tailored_cv.py` `POST /applications/{id}/cv`: `tailoring == 'keywords'` without feature → `BusinessRuleViolation`
    422 before use case. Absent/`copy` untouched (CLI path).
  - Not gated: `api/admin/jobs.py`, `app/worker/*`, `api/base_cv.py` fit enqueue, `Draft.job_id`, `TailoredCVOut.adjustments`.
- `api/user.py`: `GET /users/me/features`. `api/admin/features.py` (new) → `api/admin/__init__.py` `admin_routers`.
  `schemas/features.py` (new), strict bodies (`extra=forbid`).
- `app/scripts/seed_e2e.py`, each run: enrol `e2e` in `jobs`, delete `e2e-admin` opt-outs; `e2e-discord` never enrolled.
- `scripts/seed_mock_data.py`: no `jobs` in `/users/me/features` → skip keyword copy, searches, draft-from-job; log.
- `backend/CLAUDE.md`: "Beta features (ADR-0018)" section, endpoint tables, domain models.

## Frontend
Module `frontend/src`, no i18n lib. Patterns: `app/(protected)/admin/jobs/jobs-page.tsx`, `admin/discord-webhooks/discord-webhooks-page.tsx`, `admin/users/users-page.tsx`, `components/layout/nav.ts`.
S3:
- `services/types/features.ts` (new): `FeatureKey = "jobs"`, `MyFeature {key, stage}`, `AdminFeature`, `AdminFeatureUser`.
  `services/{interfaces/i-feature-service,implementations/feature-service}.ts` (new), in `services/services.ts`;
  `implementations/admin-service.ts` + feature calls.
- `hooks/use-features.ts` (new): `useMyFeatures()` key `["user","features"]`, `refetchOnWindowFocus: true`, error →
  empty list; `useHasFeature(key)` → `{has, stage, isLoading}`; loading counts as absent (no flash of Jobs).
- `components/layout/nav.ts`: `NavItem.feature?: FeatureKey`; Jobs `feature: "jobs"`; `navItemsFor(isAdmin, features)`
  drops items whose key missing; `app/(protected)/layout.tsx` passes features. `sidebar-nav.tsx`: badge while beta.
- `components/features/feature-gate.tsx` (new): children with feature, `app/not-found.tsx` content without, spinner
  loading; wraps `jobs/jobs-page.tsx`, `jobs/view/job-view-page.tsx`. `components/features/beta-badge.tsx` (new):
  "Beta" on nav entry + jobs h1s while beta.
- `applications/cv/application-cv-page.tsx`, `applications/new-with-cv/new-with-cv-page.tsx`,
  `components/application-drafts/draft-cv-step.tsx`: `onTailorByKeywordsChange`, `CvFitPanel`, `useApplicationCvFit`
  `enabled` only with `jobs`.
- Admin (new): `app/(protected)/admin/features/{page,features-page}.tsx` table key | name | stage | beta users |
  released | You. `admin/features/view/{page,feature-view-page}.tsx` (`?key=`, Suspense): "Your access" switch "Use
  this feature myself" + reason from `me.via`, disabled in general ("Released to everyone. Your choice applies again if
  it moves back to beta.") and when listed ("You're on the beta list, so you keep access. Remove yourself from the
  list to hide it."); beta list (search, paging), "Add user" dialog over `GET /admin/users?search=`, remove (confirm);
  "Release to everyone" / "Move back to beta" AlertDialog (move-back: "Users who are neither on this list nor admins
  lose access."). `admin-nav.tsx` tab "Features" (lucide `FlaskConical`). `hooks/use-admin.ts` keys
  `["admin","features"]`, `["admin","feature-users",key,params]`; mutations invalidate both + `["user","features"]`.
- Design system (none named): `frontend/CLAUDE.md` "### App shell", "### Routing", "### Service Layer & DI", "### State
  Management", "### Admin — Jobs", "### UI Components"; ADR-0006 tokens; ui-designer. Add "Beta features" section (nav 8/7).

## Contract
- `GET /users/me/features` → 200 `{features: [{key, stage: 'beta'|'general'}]}` caller's own, by key | 401.
- `GET /admin/features` → 200 `[{key, name, description|null, stage, beta_user_count, released_at|null, updated_at,
  me {has, via: 'general'|'list'|'admin'|null, opted_out}}]` by key; `beta_user_count` = list rows only | 403.
- `PATCH /admin/features/{key}` `{stage: 'beta'|'general'}` → 200 row | 404 'Feature not found' | 403 | 422.
- `GET /admin/features/{key}/users?search≤100&page≥1&per_page=1..100(25)` → 200 `{items: [{user_id, username, email,
  added_at, added_by {id, username}|null}], total, page, per_page, total_pages}` newest first | 404 | 403.
- `PUT /admin/features/{key}/users/{user_id}` → 204 idempotent | 404 'Feature not found' | 404 'User not found' | 403.
  `DELETE` same path → 204 idempotent | 404 'Feature not found' | 403.
- `PUT /admin/features/{key}/opt-out` (caller only, no body) → 204 idempotent, stored in either stage | 404 | 403.
  `DELETE /admin/features/{key}/opt-out` → 204 idempotent | 404 | 403.
- Caller lacks `jobs`: `/jobs*`, `/job-searches*`, `POST /applications/drafts/from-job`, `GET /applications/{id}/cv/fit`
  → 404 `{"detail": "Not Found"}`. `POST /applications/{id}/cv` `{tailoring: 'keywords'}` → 422 `'Unknown tailoring
  option'`. Anonymous: today's auth error, unchanged. Ids snowflake strings.

## Tests
Unit: `has_feature` truth table (general → all; beta → listed; admin → yes; opted-out admin → no, yes in general or listed;
ex-admin → list only; unknown → no, admins too); `released_at` set/clear; `require_feature` 404 body.
Integration: `test_migration_feature_flags.py` (new; up/down/up, three tables, seed `jobs` beta, list + opt-out rows kept
via `_old`, no table missing); `test_features_api.py` (new; `/users/me/features` none → listed → general;
`/admin/features*` 403 non-admin; double add one row; unknown user 404; remove idempotent; release keeps list; revert
hides unlisted; opt-out/in idempotent, `me` reflects it, second admin unaffected, opt-out survives release + revert;
user delete cascades); `test_feature_gating.py` (new; unlisted user: gated routes 404 with unknown-route body, bad body
still 404, `keywords` 422, `copy` 201; admin default 200; opted-out admin 404, back in 200; `/admin/jobs/sources` 200 for
opted-out admin; release → other user 200).
Existing: `tests/conftest.py` fixture `jobs_beta` (seed `jobs` + enrol test user) for `test_jobs_api.py`,
`test_jobs_draft.py`, `test_job_searches.py`, `test_tailored_cv_api.py`; `admin_client` gets jobs once the row exists.
Vitest: `nav` (with/without `jobs`, badge), `feature-gate`, jobs pages not-found without feature, `application-cv-page`
+ `new-with-cv-page` no switch/fit without feature, `features-page`, `feature-view-page` (own switch, reasons, confirms).
E2E: `frontend/e2e/beta-features.spec.ts` (new, serial). Admin: sees Jobs + Beta by default → opts out on
`/admin/features/view?key=jobs` → no Jobs entry, `/jobs` not found → opts in → Jobs back. User: admin adds
`e2e-discord` → Jobs → admin removes → hidden, `GET /jobs` 404 → release → Jobs, no Beta → back to beta → hidden.
`afterAll`: stage beta, discord user off list, admin opt-out deleted. Seed impact: `e2e-admin` sees 8 + Admin, as on
`develop` today, so `admin-gating.spec.ts` / `smoke.spec.ts` only add `/admin/features`; `jobs.spec.ts`,
`shell-responsive.spec.ts` (8) unchanged since `e2e` is enrolled.

## Rules that bind
- `non-destructive-migrations.md`: no drop in upgrade; downgrade → `_old`; `app/` never maps `_old`.
  `migration-tests.md`: round-trip test. `prod-release-runbook.md`: A, then B after owner confirms.
- `cli-compatibility.md`: no CLI route changes; `/users/me` untouched (sibling route). `changelogs.md`: backend every
  slice; `cli/CHANGELOG.md`: `tailoring: "keywords"` needs `jobs` beta (CLI never sends it).
- `quality-gates.md`: ty clean on touched files, coverage ≥ 90, e2e real stack. `branches-and-commits.md`.
- New, workspace: `.claude/rules/beta-features.md` (new) + line in workspace `CLAUDE.md` `## Rules`: every new
  user-facing feature adds a `FeatureKey` member and a stage-`beta` seed row in its own Release A migration, gates
  routes with `require_feature` and UI with `useHasFeature`; release is an admin action; removing a gate is an owner order.

## Risks
- B deployed before A migrated: gated routes and `/users/me/features` → 500. Release split; web treats a features error as none.
- 0012 B merged to `main` without 0013 B: jobs open to all. Both sit in `develop` before `develop` → `main`.
- Admins see unfinished features in prod by default (intended). Forgotten opt-out: feature page shows the reason.
- Removed user keeps Jobs entry until refetch; API 404 is the rule. `create_all` has no seed row: gated tests need `jobs_beta`.

## Open
None. Resolved 2026-10-14: owner chose "Cut 0013-release-a from tag (Recommended)"; moved into `## Releases`.
