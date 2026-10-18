# Tasks 0015 — CVs behind a beta flag, and three timeline event types

PRD: docs/prd/0015-cvs-beta-and-three-event-types.md   Plan: docs/plan/0015-cvs-beta-and-three-event-types.md
ADRs bound: 0020, 0021 (drafted by this feature, Accepted 2026-10-17); 0004, 0005, 0009, 0012 (amended by 0020), 0016, 0018 (amended by 0021). All read Accepted (checked 2026-10-17).

## Order
K1 Release A migration → K2 backend → K3 web → K4 applika-cli → K5 closing (Release B)

- **Slices (set 2026-10-17).** K1..K5, built in that order, one after another.
- **Cap.** Owner precedent (0013, 0014): 5 slices, closing included. Set is 5. K2 runs about three days, K3 about two and a half; the one-day sizing yields to the cap. Slices stay vertical and testable alone: one backend, one web, one CLI.
- **Stories.** Slice grouping wins over one-story-one-slice (owner precedent 0012..0014). Stories stay `[USn]` tags: K1 [US2, US5, US8]; K2 [US1..US8]; K3 [US1, US2, US3, US4, US6, US7]; K4 [US4].
- **Priority bent once.** US6 and US7 (P2) ride K2 and K3, ahead of the CLI half of US4 (P1, K4): they live in the same routers and screens the gate already touches. K4 is small and still lands in Release B.
- **deps:** K1 none; K2 = K1; K3 = K2; K4 = K2; K5 = K3 + K4.
- **Branch (owner's standing order, 0014: "One branch, tag each release").** One branch, `integration/0015-cvs-beta-and-three-event-types`, cut from `develop` by K1. K1, K2, K3, K4, K5 on it, one after another. Tickets start with `--no-branch`. Tag `0015-release-a` on the K1 tip, `0015-release-b` on the K5 tip.
- **AC.** PRD requirement sentence verbatim, `R-nnn` prefix dropped (house precedent). Rule ACs carry their rule path. A slice carrying one side of a requirement says so on its covers line.
- **Beta gate.** Key `cvs`, "CV builder", in beta (`.claude/rules/beta-features.md`, ADR-0021 exception in point 2: the list starts with the current CV owners).

### Releases (runbook rule 4, expand first, code second)
- **A = K1.** Commits touch only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`. Base: `develop` (holds the 0014 merge; sole head `ed39a0fad1e5`). Tag `0015-release-a` on the K1 tip.
  - Owner: `0015-release-a` reaches `main` only after 0012..0014 are on `main` (plan `## Releases`) → CD deploys (code unchanged) → `alembic upgrade head` in the API container → restart → confirm.
  - Old code on the new schema: a `cvs` row and its list rows (the old API types `key` as `str` and gates nothing on it); former notes read as interviews of type unknown (the old five-value enum reads them); a note or feedback the old image writes is turned into an interview of type unknown by the trigger (R-014); `event_type_old` is mapped by nothing.
- **B = K2 + K3 + K4, closed by K5.** Tag `0015-release-b` on the K5 tip. K2..K4 tips are not merge points.
  - Owner merges B into `develop`, and `develop` into `main`, only after A's `alembic upgrade head` is confirmed. B before A on `main` = every CV route 404 for everyone, admins too (fail closed).
  - Right after the B deploy: `alembic upgrade head` (R2: drops the trigger, enrols users whose first CV came after A) → restart. Until R2 runs, such a user gets "not found" on CV routes (PRD edge case).
  - CLI: a push to `main` touching `cli/**` publishes whatever `cli/pyproject.toml` says (1.1.0, never published). The owner numbers the version at release (Plan corrections 11).
- **Rollback.** B: `alembic downgrade <R1>` (trigger back, top-up rows kept) + the A image + restart. A, only after B is rolled back: `alembic downgrade ed39a0fad1e5` (every converted event not edited since is a note or feedback again; the `cvs` row, its list rows and `event_type_old` stay) + the previous image + restart. Neither loses a row.
- Build never waits for prod; merge does. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`, and never pushes.

### Plan corrections (checked against the code, 2026-10-17)
1. **Plan header stale.** It reads "0020 (Proposed)" and "0021 (Proposed)"; both ADRs read Accepted 2026-10-17 (the plan's own `## Open` says so). K5 fixes the two header lines.
2. **Base and pin.** Sole head `ed39a0fad1e5` (`ed39a0fad1e5_user_sessions.py` l.64-65). `test_only_one_head` pins it in `backend/tests/integration/test_timeline_contract_migration.py` l.833-837. K1 moves the pin to R1, K2 to R2. New docstring lines carry no ticket key (`.claude/rules/branches-and-commits.md`); old lines stay as they are.
3. **A revision never imports another.** The plan says "SQL in one module constant, reused by R2 downgrade". Precedent `ad747aba90fc` docstring l.98-103: R2 carries a byte-for-byte copy of R1's function and trigger SQL, pinned against R1's module by a test (shape of `test_duplicated_constants_match_revision_af50c83911a7_and_step_translation`, `test_timeline_contract_migration.py` l.858-907).
4. **Two tests pin `REVERSE_STEP_NAMES` to frozen maps that keep note and feedback.** `backend/tests/unit/test_step_translation.py` l.202-213 and `backend/tests/integration/test_timeline_contract_migration.py` l.897-907 (`EventType('note')` raises once the enum has three members). K2 compares against the revision map minus `('note', None)` and `('feedback', None)`, and asserts both of those name the same step as `('interview', 'unknown')` ("Phase 2"): the ADR-0020 reason no step id moves.
5. **App code that writes a note on a schema snapshot or at head.** `test_timeline_expand_migration.py` `_release_b_code_writes` l.1850-1857 (`EventType.NOTE` through the use case at R3) → an interview of type unknown with the same observation (its asserts l.2003-2004 still hold: "Phase 2"). `test_timeline_contract_migration.py` l.1656-1672 (`POST`/`PUT` a note at head) → `interview`. In Release A both still pass (old code + trigger); K1 runs them to prove R-019.
6. **NOTE/FEEDBACK test files the plan does not name (K2).** Unit: `conftest.py` l.63 (`make_event` default), `test_timeline_event_uc.py`, `test_timeline_event_schema.py`, `test_step_translation.py`, `test_legacy_steps_uc.py`, `test_application_read_model.py`, `test_conversion_rate.py` l.43, `test_general_statistics.py` l.23, `test_step_avg_days.py` l.25-39. Integration: `timeline_seed.py` l.110 (default), `test_timeline_api.py`, `test_application_steps.py`, `test_agenda.py` l.181, `test_statistics.py` l.105, `test_finalize.py` l.145, `test_migrated_data_reads.py` l.256, `test_past_cycle_data.py` l.315. Migration tests that insert a note by raw SQL at older revisions stay as they are.
7. **Test modules that call CV or draft routes (plan: "every CV/draft test module").** `test_base_cv_api.py`, `test_tailored_cv_api.py`, `test_cv_pdf_api.py`, `test_cv_export_api.py`, `test_application_drafts.py`, `test_jobs_draft.py`, `test_delete_account.py` (l.261, 307), `test_statistics.py` (l.395-418), `test_cycles.py` (l.152), `test_admin.py` (l.915, 1152), `test_applications.py` (l.771), `test_feature_gating.py` (R-027 cases). `admin_client` has `cvs` once the row exists. Also `tests/unit/test_seed_e2e.py` l.567-595 (`reset_beta_features`).
8. **Web glue the plan omits.** `hooks/use-application-drafts.ts` `useDrafts()` (`applications-page.tsx` l.179) fires `GET /applications/drafts` for everyone: without `cvs` it must not run. "New with CV" lives in `components/applications/new-application-actions.tsx` l.33-36. `components/timeline/event-type-selector.tsx` l.27-57 says "5 types" and lays out `sm:grid-cols-5`. `services/types/timeline.ts` l.44 comment. `job-list-item.tsx` l.38 and `job-detail-view.tsx` l.56 take a required `onStart`. `job-fit-list.tsx` l.84 shows the master CV invitation on the job page. `jobs-page.tsx` l.106-107, l.243 derive `fitAvailable` from `useBaseCvs`.
9. **E2E pins.** `beta-features.spec.ts` `BASE_LINKS = 7` (l.44) serves both `e2e-admin` (has `cvs` as admin) and `e2e-discord` (no `cvs` now): e2e-discord's counts at l.320, 341, 376, 436, 466 drop by one; the admin's stay. The l.318 comment says seven. `shell-responsive.spec.ts` l.465 lets only Jobs carry "Beta" in its text; CVs gets the same regex; l.33-35 docstring. `smoke.spec.ts` length 22 unchanged (no new route; `user` and `admin` both have `cvs`).
10. **CLI names the plan omits.** `cli/src/applika/commands/applications/__init__.py` l.90 (timeline help "notes, interviews, offers"), `commands.py` l.1256 (help), and the `cli/CLAUDE.md` commands table ("notes, typed interviews, offer/denied"). The plan names `README.md` and `SKILL.md` only.
11. **CLI version at release.** `cli/pyproject.toml` is 1.1.0, never published (PyPI holds 0.1.1..0.1.4), and `cli/CHANGELOG.md` already has `## [1.1.0] - 2026-10-15`. PRD assumption: entries go under `## [Unreleased]`, the version is numbered at release. K4 bumps nothing. `.github/workflows/cli-cd.yaml` publishes pyproject's version on a push to `main` touching `cli/**`. **Owner decides the number at release.**
12. **R-003 edge.** A DELETE leaves no trace, so R2 cannot see a removal. It keeps off a removed user whose earliest CV predates the `cvs` row. It adds back a user an admin added after A and removed before R2 whose first CV came after A, and a pre-A owner who deleted every pre-A CV and made a new one. The ACs stay verbatim. **Owner to confirm the limit.**
13. **CLI CI triggers.** `.github/workflows/cli-ci.yaml` runs on pushes to `develop` and `actions/*`, PRs to `develop`/`main`, and `workflow_dispatch`. It does not run on a push of the integration branch. "Green on GitHub for the branch" = the owner pushes it and dispatches "CLI CI" on it (`gh workflow run "CLI CI" --ref integration/0015-cvs-beta-and-three-event-types`), or confirms after the `develop` merge.
14. **CLI CI cause, checked.** `typer/rich_utils.py` l.74-81 sets `FORCE_TERMINAL` at import from `GITHUB_ACTIONS`, `FORCE_COLOR` or `PY_COLORS` (and `_TYPER_FORCE_DISABLE_TERMINAL`, also at import). An env passed to `CliRunner` comes too late. Fix in the tests (K5).
15. **Names the plan omits.** `backend/tests/integration/test_cvs_gating.py` (new: the plan's "Gate" tests); `tests/features_seed.py` `seed_cvs_feature`.
16. **Commit key line.** `frontend/CLAUDE.md` "## Tooling" still says commits carry the ticket key. `.claude/rules/branches-and-commits.md` 2 wins (no key). K3 fixes that one line in the file it edits anyway.
17. **ty baseline.** Rule: 171, ratchets down only, compared against `develop`. Every new or changed file is clean.
18. **Timestamps.** The conversion keeps `created_at` and `updated_at` (PRD assumption): raw SQL, no `updated_at = now()`.
19. **Release A merge into develop.** With one branch, the owner merges tag `0015-release-a` into `develop` (`--no-ff`) when he releases A, then the B tip later. `backend/CHANGELOG.md` may then carry lines from both merges under `## [Unreleased]`: keep both (0013, 0014 precedent).

## K1 — Release A: migration R1, cvs seeded with its CV owners, note and feedback converted, switch-over trigger   side: backend   covers: R-001 (seed; key K2), R-002, R-011 (storage), R-013, R-014 (trigger; drop K2), R-019 (Release A), R-020 (Release A rollback)   deps: —
Goal: Ship R1 as a migration-only Release A on the integration branch: `cvs` in beta with its current CV owners listed, every note and feedback an interview of type unknown with the original in `event_type_old`, a three-value CHECK, and a trigger that converts what the old image still writes.
Owner's words: "i would like to lock the cv builder and applications cv's in a feature flag just like jobs, sobre event types, i would like to also remove the types "notes" and "feedback", keeping only "interview", "offer" and "denied""
Clarified: "Convert them"; "Both to interview/unknown (Recommended)" (keeps date and text; downgrade restores the original type from an _old column); "One 'cvs' key, enrol owners (Recommended)" (Release A seeds it as beta and lists every user who owns a base CV or an application CV); "Two releases (Recommended)"; "New ADR amends 0012 (Recommended)" (ADR-0020); "New ADR amends 0018 (Recommended)" (ADR-0021). Assumptions: "Owns a CV" counts the master CVs and CV copies that exist when the migration runs; the conversion leaves each event's timestamps as they were; description "Master CVs, CV copies on applications and the new application with CV flow."
Covers: R-001 (seed), R-002, R-011 (storage), R-013, R-014 (trigger), R-019 (Release A), R-020 (Release A rollback)
Release: A, tag `0015-release-a`. Plan: docs/plan/0015-cvs-beta-and-three-event-types.md `## Data` (R1), `## Releases`, `## Tests`. Tasks: docs/plan/0015-cvs-beta-and-three-event-types.tasks.md (Plan corrections 2, 5, 17, 18, 19)
Touch:
- backend/migrations/versions/<rev>_cvs_feature_and_event_types.py (new)
- backend/tests/integration/test_migration_cvs_feature_event_types.py (new)
- backend/tests/integration/test_timeline_contract_migration.py (`test_only_one_head` pin)
- backend/CHANGELOG.md
Pattern:
- backend/migrations/versions/641001baff09_feature_flags.py (`_seed_features`, `ON CONFLICT`, `generate_snowflake_id`, docstring)
- backend/migrations/versions/afd4074c70c2_timeline_events_expand.py (`STEP_MAPPING`, `REVERSE_STEP_MAP`, plpgsql trigger SQL as module constants, ADR-0012's transitional triggers)
- backend/tests/integration/test_migration_feature_flags.py, test_migration_user_sessions.py (round trip)
Contract: no route. Release A: the image ships this revision, app code unchanged.
Steps:
- T001 [US2] Base, branch:
  - `git merge-base --is-ancestor 0014-release-b develop` → yes. Else stop, ask the owner;
  - `git switch -c integration/0015-cvs-beta-and-three-event-types develop`;
  - `uv run alembic heads` → `ed39a0fad1e5` only (Plan corrections 2).
- T002 [US8] Create backend/migrations/versions/<rev>_cvs_feature_and_event_types.py (new), `down_revision = 'ed39a0fad1e5'`. Module constants: the seed (`'cvs'`, `'CV builder'`, `'Master CVs, CV copies on applications and the new application with CV flow.'`), `KEPT_TYPES = ('interview', 'offer', 'denied')`, `LEGACY_TYPES = ('note', 'feedback')`, the CHECK, function and trigger names, `_LEGACY_FUNCTION_SQL`, `_CREATE_LEGACY_TRIGGER_SQL` (K2 copies them, Plan corrections 3). upgrade() step 1, guard, before any write: `SELECT count(*) FROM steps_definition WHERE event_type IN ('note','feedback')` > 0 → raise; never true (`afd4074c70c2` `STEP_MAPPING` l.231-238).
- T003 [US2] Same revision, the feature (R-001, R-002):
  - seed `features` (`cvs`, `CV builder`, the description, `beta`, `released_at` NULL, `created_at` now), `ON CONFLICT (key) DO NOTHING`, shape of `641001baff09` `_seed_features` l.213-232;
  - enrol: one `feature_beta_users` row per distinct `user_id` of `base_cvs` ∪ `tailored_cvs` (draft copies included), `added_by` NULL, id `generate_snowflake_id()` in a Python loop, `ON CONFLICT (feature_id, user_id) DO NOTHING`.
- T004 [US5] Same revision, the conversion (R-011, R-013):
  - `ALTER TABLE timeline_events ADD COLUMN IF NOT EXISTS event_type_old event_type NULL`; `UPDATE timeline_events SET event_type_old = event_type`;
  - `UPDATE timeline_events SET event_type = 'interview', interview_type = 'unknown' WHERE event_type IN ('note','feedback')`: id, application, user, date, observation, `created_at`, `updated_at` untouched (Plan corrections 18); the four CHECKs hold (old notes carry no schedule, salary or reason);
  - `ck_timeline_events_event_type` CHECK `event_type IN ('interview','offer','denied')`, created only when missing (re-upgrade).
- T005 [US5] Same revision, the switch-over trigger (R-014): `CREATE OR REPLACE FUNCTION timeline_events_legacy_event_type()` + `trg_timeline_events_legacy_event_type` `BEFORE INSERT OR UPDATE ... FOR EACH ROW`: NEW.event_type in note/feedback → `NEW.event_type_old := NEW.event_type`, `NEW.event_type := 'interview'`, `NEW.interview_type := 'unknown'`; `RETURN NEW`. `DROP TRIGGER IF EXISTS` before `CREATE TRIGGER` (re-upgrade). Created after the conversion UPDATE.
- T006 [US5] downgrade() (R-020):
  - drop the trigger and the function; drop `ck_timeline_events_event_type`;
  - `UPDATE timeline_events SET event_type = event_type_old, interview_type = NULL WHERE event_type_old IN ('note','feedback') AND event_type = 'interview' AND interview_type = 'unknown' AND start_time IS NULL AND end_time IS NULL AND timezone IS NULL` (an edited row keeps its edit, ADR-0020);
  - keep `event_type_old` (the copy) and the `cvs` row and its list rows (the old API types `key` as `str`);
  - docstring cites non-destructive rules 1, 2, 5, 7, 8; runbook 4; ADR-0005, ADR-0020, ADR-0021; "no app code reads any of it; the code ships in Release B". No ticket key.
- T007 [P] [US2] [US5] [US8] Round trip in backend/tests/integration/test_migration_cvs_feature_event_types.py (new): testcontainers Postgres, real chain. Seed at `ed39a0fad1e5`: user A (a master CV), user B (a CV copy on a draft only), user C (no CV), admin D (no CV); on A's applications: a note with an observation, a feedback, a technical interview, an offer with salary, a denied with reason.
  - **upgrade:** `cvs` once, `CV builder`, the description, `beta`, `released_at` NULL; list = {A, B}, `added_by` NULL; C and D not listed; no note or feedback left; the two converted rows are interview/unknown with the same id, application, user, date, observation, `created_at`, `updated_at`; `event_type_old` = the original type on every row; the CHECK exists; a raw `INSERT` of a `note` and a raw `UPDATE` of an interview to `feedback` → interview/unknown with `event_type_old` `note` / `feedback`;
  - **0.1.4 (R-017):** in `afd4074c70c2`'s `REVERSE_STEP_MAP` (loaded from the revision module, not app code), `('note', None)` and `('feedback', None)` name the same `steps_definition` row as `('interview', 'unknown')`: every step id a 0.1.4 client reads stays the same;
  - **downgrade:** unedited converted rows are note / feedback again with `interview_type` NULL; a converted row edited in between (to technical, or given a schedule) stays as edited; trigger, function and CHECK gone; `event_type_old` kept; `cvs` row and list rows kept;
  - **upgrade again:** equal to the first upgrade (types, list, CHECK, trigger); the `cvs` row once;
  - **guard:** a `steps_definition` row mapped to `note` → the upgrade raises, nothing written (no `cvs` row, types unchanged);
  - no column or table missing after upgrade.
- T008 [US2] backend/tests/integration/test_timeline_contract_migration.py `test_only_one_head` (l.833-837): heads `== ['<rev>']`, `<rev>`'s `down_revision == 'ed39a0fad1e5'`, keep the chain walk; one docstring line, no ticket key (Plan corrections 2).
- T009 [US2] backend/CHANGELOG.md `## [Unreleased]`: Added `- feature "cvs" ("CV builder") seeded in beta; every user who owns a master CV or a CV copy is on its beta list, added by no admin (Release A, ADR-0021).` Changed `- timeline events of type note and feedback are now interviews of type unknown; the original type is kept in timeline_events.event_type_old, a CHECK allows only interview, offer and denied, and a temporary trigger converts what the previous release still writes (Release A, ADR-0020).` No ticket key.
- T010 [US2] Verify, gate, record:
  - `grep -nE "op\.drop_(column|table)"` on the revision → none; `grep -rn "_old" backend/app/` → none;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`; `uv run pytest tests/integration -k migration`;
  - `uv run pytest tests/integration/test_timeline_contract_migration.py tests/integration/test_timeline_expand_migration.py` green on the old code (R-019, Plan corrections 5);
  - `git diff develop --name-only` → only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`; backend/app/ untouched;
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - annotated tag `0015-release-a` on the K1 tip (local); the owner steps of `### Releases` (A); rollback `alembic downgrade ed39a0fad1e5` + previous image;
  - the agent never touches prod or `main`, never pushes.
AC:
- The system adds the feature "cvs", named "CV builder", in beta.
- In the release that adds it, the system puts on the "cvs" beta list every user who owns at least one master CV or one CV copy at that moment. These users are recorded as added by no admin.
- The system stores each timeline event as exactly one of three types: interview, offer or denied.
- The system turns every existing note and feedback event into an interview of type unknown. It keeps the event's identifier, application, date and observation.
- The system does the same with any note or feedback the running older version writes during the switch-over.
- Database changes reach production in a release before the code that uses them. Open web pages and installed command-line clients keep working in between.
- The system can be rolled back to the previous release at each of the two releases. A rollback turns every converted event that was not edited since back into the note or feedback it was.
- Exception (ADR-0021): a feature that already shipped and is gated later fills its beta list with its current users in that Release A migration (`added_by` NULL), and tops it up in the release that turns the gate on. Only those two migrations write the list outside `/admin/features`. (.claude/rules/beta-features.md 2)
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- Enum changes add values or swap types with a data remap in both directions. They never delete rows. (.claude/rules/non-destructive-migrations.md 8)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K2 — Backend: cvs gate on master CV, CV copy and draft routes, job board without fit, three event types, R2 top-up   side: backend   covers: R-001 (key), R-003, R-004 (API), R-005, R-008 (API), R-009 (API), R-010, R-011 (API), R-012, R-014 (trigger drop), R-017, R-018, R-020 (Release B rollback)   deps: K1
Goal: Gate the base-CV, application-CV and drafts routers on `cvs` (404 like an unknown route, slash twins), send no fit to a user without `cvs`, make `EventType` three values (422 on note/feedback), and ship R2 (top-up, drop the trigger) with its round trip.
Owner's words: "i would like to lock the cv builder and applications cv's in a feature flag just like jobs, sobre event types, i would like to also remove the types "notes" and "feedback", keeping only "interview", "offer" and "denied""
Clarified: "One 'cvs' key, enrol owners (Recommended)" (one key gates the builder, base-cvs routes and the application CV routes together); "cvs gates drafts too (Recommended)" (the new application with CV flow and the Drafts tab; on the job board, "Start application", the master CV invitation and the fit need both "jobs" and "cvs"); "cli version 1.x.x was never released, just remove the options to create note and feedback event's" (no compatibility translation); "Yes, count them (Recommended)" (former notes count as unknown interviews in the dashboard, new reports and the agenda). Assumptions: a user without "cvs" gets the job board's answers as if they had no fit at all (no fit on the list or on a job, a minimum fit filter matches no job, sorting by fit is sorting by newest); statistics keep their nine stages and their shapes.
Covers: R-001 (key), R-003, R-004 (API), R-005, R-008 (API), R-009 (API), R-010, R-011 (API), R-012, R-014 (trigger drop), R-017, R-018, R-020 (Release B rollback)
Release: B. Plan: docs/plan/0015-cvs-beta-and-three-event-types.md `## Data` (R2, ORM), `## Backend`, `## Contract`, `## Tests`. Tasks: docs/plan/0015-cvs-beta-and-three-event-types.tasks.md (Plan corrections 2, 3, 4, 5, 6, 7, 12, 15, 17)
Touch:
- backend/app/core/features.py, backend/app/core/enums.py
- backend/app/domain/models.py
- backend/app/presentation/api/base_cv.py, tailored_cv.py, application_draft.py, jobs.py
- backend/app/application/use_cases/jobs/list_jobs.py, get_job.py
- backend/app/application/use_cases/compat/step_translation.py
- backend/app/presentation/schemas/timeline_event.py, backend/app/application/use_cases/timeline_events/rules.py, backend/app/application/use_cases/user_stats/stages.py, backend/app/application/use_cases/get_supports.py (follow the enum; docstrings)
- backend/migrations/versions/<rev>_cvs_topup_and_drop_legacy_trigger.py (new)
- backend/tests/integration/test_migration_cvs_topup_and_drop_legacy_trigger.py (new), test_cvs_gating.py (new)
- backend/tests/conftest.py, backend/tests/features_seed.py
- backend/tests (Plan corrections 4..7): unit/conftest.py, test_step_translation.py, test_timeline_event_uc.py, test_timeline_event_schema.py, test_legacy_steps_uc.py, test_application_read_model.py, test_conversion_rate.py, test_general_statistics.py, test_step_avg_days.py, test_seed_e2e.py; integration/timeline_seed.py, test_timeline_api.py, test_application_steps.py, test_agenda.py, test_statistics.py, test_finalize.py, test_migrated_data_reads.py, test_past_cycle_data.py, test_timeline_expand_migration.py, test_timeline_contract_migration.py, test_base_cv_api.py, test_tailored_cv_api.py, test_cv_pdf_api.py, test_cv_export_api.py, test_application_drafts.py, test_jobs_draft.py, test_delete_account.py, test_cycles.py, test_admin.py, test_applications.py, test_feature_gating.py
- backend/app/scripts/seed_e2e.py, backend/scripts/seed_mock_data.py
- backend/CLAUDE.md, backend/CHANGELOG.md, cli/CHANGELOG.md
Pattern:
- backend/app/presentation/api/jobs.py (router `dependencies=[require_feature(...)]` l.32-38, `add_slash_twins(router)` l.104)
- backend/app/presentation/api/tailored_cv.py l.124-130 + l.343, application_draft.py l.115-121 + l.243 (route gate, twins)
- backend/app/presentation/dependencies.py `user_has_feature` l.623-629 (per-request check, as the `keywords` value)
- backend/migrations/versions/<R1> (K1) and `ad747aba90fc` docstring l.98-103 (copied constants, pinned)
- backend/tests/conftest.py `jobs_beta` l.114-121, tests/features_seed.py; backend/tests/integration/test_feature_gating.py
Contract (K3, K4 consume):
- Without `cvs` → 404 `{"detail": "Not Found"}`, byte-equal `GET /no-such-route`'s, slash twins too; anonymous → today's 401 first:
  - `GET`/`POST /base-cvs`; `GET`/`PATCH`/`DELETE /base-cvs/{id}`; `POST /base-cvs/{id}/pdf`; `GET /base-cvs/{id}/markdown`;
  - `POST`/`GET`/`PUT`/`DELETE /applications/{id}/cv`; `POST …/cv/pdf`; `GET …/cv/markdown`, `…/cv/diff/markdown`, `…/cv/diff/pdf`; `GET …/cv/fit` (needs `cvs` and `jobs`);
  - `POST`/`GET /applications/drafts`; `GET`/`PUT`/`DELETE /applications/drafts/{id}`; `POST …/{id}/finish`; `POST /applications/drafts/from-job` (needs `cvs` and `jobs`).
- With `cvs`: every shape and status unchanged.
- `GET /jobs`, `GET /jobs/{id}` without `cvs`: 200, `best_fit: null`, `fits: []`, `min_fit` → `items: []`, `total: 0`, `sort=fit` → newest; `application` mark unchanged.
- `POST /applications/{id}/timeline`, `PUT …/timeline/{event_id}`: `event_type` ∈ `interview` | `offer` | `denied`, else 422 (Pydantic enum error). Responses and OpenAPI: three values.
- `GET /users/me/features` may hold `{key: "cvs", stage}`. `/admin/features` lists `cvs`; enrolled rows `added_by: null`.
- Unchanged: `/steps*` (0.1.4 shapes, ids, `Deprecation`), `/finalize` (every body), `/supports`, statistics (nine stages), agenda shape, `/applications*`.
Steps:
- T011 [US1] Base: on `integration/0015-cvs-beta-and-three-event-types` after the `0015-release-a` tag; `uv run alembic heads` → `<R1>` only.
- T012 [US1] [US3] The gate (R-001, R-004, R-005):
  - backend/app/core/features.py `FeatureKey.CVS = 'cvs'`;
  - backend/app/presentation/api/base_cv.py: `APIRouter(..., dependencies=[require_feature(FeatureKey.CVS)])`; `add_slash_twins(router)` at the end;
  - api/tailored_cv.py: router dependency CVS; `/cv/fit` keeps JOBS (both); `tailoring: 'keywords'` per-value JOBS unchanged; `add_slash_twins(router)` over every route (drop the `include` filter, l.343);
  - api/application_draft.py: router dependency CVS; `/from-job` keeps JOBS (both); twins over every route (l.243);
  - not gated: `app/worker/*`, `use_cases/jobs/`, `/admin/*`, `/applications*`, timeline, `/steps*`, `/finalize`, `/supports`.
- T013 [US7] Job board without fit (R-008):
  - api/jobs.py `list_jobs` and `get_job`: `FeatureRepositoryDp` + `user_has_feature(FeatureKey.CVS, c_user, feature_repo)` → `with_fit`;
  - use_cases/jobs/list_jobs.py, get_job.py take `with_fit: bool`; False → `best_fit` null on every item, `fits` [] without reading master CVs, `min_fit` set → empty page (`total: 0`), `sort=fit` → newest; nothing else changes;
  - no `require_feature` under use_cases/jobs (the grep test).
- T014 [US4] [US5] Three event types (R-011, R-012):
  - backend/app/core/enums.py `EventType` = INTERVIEW, OFFER, DENIED; docstring "three" (ADR-0020);
  - backend/app/domain/models.py `TimelineEventModel.__table_args__` + `ck_timeline_events_event_type` (R1's text); docstring "one of three"; `event_type_old` never mapped: `create_all` builds the R1 schema minus the copy;
  - use_cases/compat/step_translation.py: drop `(EventType.NOTE, None)`, `(EventType.FEEDBACK, None)` from `REVERSE_STEP_NAMES` (l.42-43); step ids unchanged (both named "Phase 2", as interview/unknown);
  - follow the enum in schemas/timeline_event.py, timeline_events/rules.py, user_stats/stages.py (docstring l.4-5), get_supports.py (docstring), repositories; `grep -rnE "EventType\.(NOTE|FEEDBACK)|'note'" backend/app` → none.
- T015 [US2] [US5] Create backend/migrations/versions/<rev>_cvs_topup_and_drop_legacy_trigger.py (new), `down_revision = '<R1>'`:
  - upgrade: `DROP TRIGGER IF EXISTS trg_timeline_events_legacy_event_type ON timeline_events`; `DROP FUNCTION IF EXISTS timeline_events_legacy_event_type()`; top-up (R-003): users whose `min(created_at)` over `base_cvs` ∪ `tailored_cvs` is later than the `cvs` row's `created_at`, `added_by` NULL, `ON CONFLICT (feature_id, user_id) DO NOTHING`;
  - downgrade: recreate function + trigger from a byte-for-byte copy of R1's constants (Plan corrections 3); top-up rows kept;
  - docstring: non-destructive 1, 2, 5, 7; runbook (runs right after the B deploy); ADR-0020, ADR-0021; the R-003 limit (Plan corrections 12). No ticket key.
- T016 [P] [US2] [US5] Round trip in backend/tests/integration/test_migration_cvs_topup_and_drop_legacy_trigger.py (new), real chain. Seed at `<R1>` (via the chain from `ed39a0fad1e5`): pre-A owner P (listed by R1) whom an admin removes; user N whose first master CV is newer than the `cvs` row; user O with no CV.
  - **upgrade:** N listed, `added_by` NULL; P stays off; O off; trigger and function gone; a raw `INSERT` of a `note` → IntegrityError on `ck_timeline_events_event_type`;
  - **downgrade:** trigger back (a raw `note` → interview/unknown); N still listed;
  - **upgrade again:** equal to the first;
  - the copied constants equal R1's module (`test_duplicated_constants_match_revision_<R1>`);
  - backend/tests/integration/test_timeline_contract_migration.py `test_only_one_head`: pin `<R2>`, its `down_revision == '<R1>'`, keep the walk.
- T017 [P] [US1] [US3] [US6] [US7] backend/tests/integration/test_cvs_gating.py (new), `cvs` row seeded as R1 seeds it:
  - unlisted user: every Contract route → 404, body equal to `GET /no-such-route`'s; each slash twin too; a well-formed JSON body with wrong fields → still 404; anonymous → 401;
  - admin by default → 200; opt-out → 404; listed → 200; stage general → unlisted 200; back to beta → 404 (R-004);
  - `/cv/fit` and `/drafts/from-job`: `cvs` only → 404, `jobs` only → 404, both → served;
  - jobs + no `cvs`: `GET /jobs` items `best_fit` null, `min_fit=1` → `items: []`, `sort=fit` = the `newest` order; `GET /jobs/{id}` `fits: []`, `best_fit: null` (R-008);
  - R-009: a user taken off the list keeps master CVs, copies and drafts (rows equal); `GET`/`PUT /applications*` and their timeline work; listed again → every CV and draft read back unchanged;
  - R-010: an unlisted user's master CV row still gets fit scores from `RecomputeFitUseCase` / the `recompute_fit` task;
  - the admin `/admin/features` list shows `cvs` with `beta_user_count` = enrolled rows; `added_by` null.
- T018 [P] [US4] [US5] [US8] Timeline and 0.1.4 tests:
  - `POST` and `PUT` timeline with `note` or `feedback` → 422, nothing written; OpenAPI enum = three values;
  - unit step_translation: interview/unknown → "Phase 2", the same row `afd4074c70c2` names for note and feedback; the two pins (Plan corrections 4);
  - `GET /applications/{id}/steps` shows an interview/unknown event as "Phase 2" with the same id as before; `uv run pytest tests -k "steps or finalize or supports"` green (R-017);
  - R-018: an interview/unknown event counts in the Unknown stage, in `interviews_completed_fortnight` of a newly computed report (never in `initial_screenings_count`) and in the agenda; a submitted report row is unchanged.
- T019 [US1] Existing tests (Plan corrections 5, 6, 7):
  - tests/features_seed.py `seed_cvs_feature` (+ constants, R1's name and description); tests/conftest.py fixture `cvs_beta` (inserts the `cvs` row, enrols the `async_client` user; `jobs_beta` shape); on every module in Plan corrections 7;
  - NOTE/FEEDBACK → interview/unknown, or offer/denied where the test means "a non-interview event" (`make_event` and `timeline_seed` defaults → interview/unknown);
  - test_timeline_expand_migration.py `_release_b_code_writes` l.1850-1857; test_timeline_contract_migration.py l.1656-1672.
- T020 [US1] Seeds:
  - backend/app/scripts/seed_e2e.py `reset_beta_features`, every run: `cvs` back to `beta` (`released_at` NULL); `e2e-user` on its list; `e2e-discord` off it; `e2e-admin`'s opt-outs gone; a missing `cvs` row fails loudly (run `alembic upgrade head`); tests/unit/test_seed_e2e.py l.567-595 for both keys;
  - backend/scripts/seed_mock_data.py: `has_cvs_feature()` beside `has_jobs_feature()` (l.626, read l.1033); without it skip `seed_base_cvs`, `seed_cv_pdfs`, `seed_application_cv`, `seed_keyword_copy`, `seed_drafts`, `seed_draft_from_job` and print why; `seed_timeline()` notes → interviews (l.792, l.877).
- T021 [US1] Docs and changelogs (no ticket keys in new lines):
  - backend/CLAUDE.md: Beta features (`FeatureKey.CVS`, the three gated routers, both-keys routes, `cvs_beta`, the ADR-0021 list); Base CVs, Application CVs, drafts, Jobs (no fit without `cvs`) gate lines; Application Timeline + Enums (three types, `event_type_old` unmapped, the CHECK); Steps reverse map line; Seed Script Rule (`has_cvs_feature`);
  - backend/CHANGELOG.md `## [Unreleased]`: Added (`cvs` gate, R2 top-up), Changed (no fit without `cvs`; drafts and CV routes 404 without `cvs`), Removed (event types note and feedback: 422);
  - cli/CHANGELOG.md `## [Unreleased]` (changelogs rule 3): Changed `- the API refuses event_type note and feedback (422); existing ones read as interview with interview_type unknown. 0.1.4 is unaffected: its steps keep their ids.` and `- cvs *, applications cv * and drafts answer 404 without the "cvs" beta feature.`
- T022 [US1] Checks, gate, close:
  - `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli (CLI unchanged until K4);
  - `grep -rn "require_feature" backend/app/worker backend/app/application/use_cases/jobs` → none; `grep -rn "_old" backend/app/` → none;
  - the beta-features rule Verify → `jobs seeded`, `cvs seeded`;
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - Not a merge point.
AC:
- The system adds the feature "cvs", named "CV builder", in beta.
- When the gate goes live, the system also adds every user whose first master CV or CV copy was created after R-002 ran. A user an admin removed from the list in between is not added back.
- A user has "cvs" by the rule of PRD 0013 R-002: the feature is released, the user is on its list, or the user is an admin who has not turned it off.
- A user without "cvs" who asks the server for master CVs, a master CV's PDF or Markdown, an application's CV copy, its PDF, Markdown, comparison or fit, or any draft route gets "not found", the same answer as an address that does not exist.
- A user with "jobs" but without "cvs" sees the job board without any fit, without "Start application", without "Tailor by keywords" and without the invitation to create a master CV. The server sends them no fit, and starting a draft from a job needs both features.
- A user who loses "cvs" keeps every master CV, CV copy and draft unchanged, and gets them back unchanged with "cvs". Their applications keep working without the CV link.
- The background service keeps computing fit scores for every master CV, whoever owns it.
- The system stores each timeline event as exactly one of three types: interview, offer or denied.
- The system refuses a note or a feedback event, on create and on edit, as an invalid value.
- The system does the same with any note or feedback the running older version writes during the switch-over.
- applika-cli 0.1.4 keeps working unchanged. Its steps list shows every event as the same step, with the same identifier, as before the switch.
- The system counts a former note or feedback as an interview of type unknown in statistics, in reports computed after the switch and in the agenda. Reports already submitted stay as stored.
- The system can be rolled back to the previous release at each of the two releases. A rollback turns every converted event that was not edited since back into the note or feedback it was.
- The feature gets a member in `FeatureKey` (`applika/backend/app/core/features.py`). (.claude/rules/beta-features.md 1)
- Exception (ADR-0021): a feature that already shipped and is gated later fills its beta list with its current users in that Release A migration (`added_by` NULL), and tops it up in the release that turns the gate on. Only those two migrations write the list outside `/admin/features`. (.claude/rules/beta-features.md 2)
- Its routes are gated with `require_feature` (`applika/backend/app/presentation/dependencies.py`) on the router, on the route, or per value for an option on a shared route; a gated router or route also calls `add_slash_twins` (`applika/backend/app/presentation/gated_slash.py`). (.claude/rules/beta-features.md 3)
- Tests enrol their user through a fixture (`jobs_beta` in `applika/backend/tests/conftest.py` is the precedent): `create_all` builds no seed row. (.claude/rules/beta-features.md 4)
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K3 — Web: hide CVs, CV links, drafts and the job board's CV parts without cvs, Beta label, three-type event form, cvs-beta E2E   side: frontend (+ E2E)   covers: R-004 (web), R-006, R-007, R-008 (web), R-009 (web), R-015   deps: K2
Goal: The web hides every CV surface without `cvs` (nav, five pages, CV link, Drafts tab, "New with CV", the job board's fit, start and invitation), labels them "Beta" while in beta, and offers only interview, offer and denied, a new event starting as an interview of type unknown.
Owner's words: "i would like to lock the cv builder and applications cv's in a feature flag just like jobs, sobre event types, i would like to also remove the types "notes" and "feedback", keeping only "interview", "offer" and "denied""
Clarified: "cvs gates drafts too (Recommended)" (the new application with CV flow and the Drafts tab; on the job board, "Start application", the master CV invitation and the fit need both "jobs" and "cvs"); "One 'cvs' key, enrol owners (Recommended)". Assumptions: "just like jobs" means the PRD 0013 mechanism (a beta list, admin access by default with a per-admin opt-out, release from /admin); the "Beta" label shows on CVs the way it shows on Jobs; the CV link, the Drafts tab and "New with CV" are hidden, not disabled; a new web event starts as an interview of type unknown; on the admin list, an enrolled row shows no "added by". Owner's quality-gate order: "the better of two worlds, i also want frontend tests and e2e tests with real application stack".
Covers: R-004 (web), R-006, R-007, R-008 (web), R-009 (web), R-015
Release: B. Plan: docs/plan/0015-cvs-beta-and-three-event-types.md `## Frontend`, `## Tests` (vitest, E2E). Tasks: docs/plan/0015-cvs-beta-and-three-event-types.tasks.md (Plan corrections 8, 9, 16)
Touch:
- frontend/src/services/types/features.ts
- frontend/src/components/layout/nav.ts, sidebar-nav.test.tsx
- frontend/src/app/(protected)/cvs/cvs-page.tsx, cvs-page.test.tsx; cvs/new/new-cv-page.tsx, new-cv-page.test.tsx; cvs/editor/cv-editor-page.tsx, cv-editor-page.test.tsx
- frontend/src/app/(protected)/applications/cv/application-cv-page.tsx, application-cv-page.test.tsx; applications/new-with-cv/new-with-cv-page.tsx, new-with-cv-page.test.tsx; applications/applications-page.tsx, applications-page.test.tsx
- frontend/src/components/applications/application-item.tsx, application-item.test.tsx, new-application-actions.tsx
- frontend/src/hooks/use-application-drafts.ts, use-base-cvs.ts
- frontend/src/app/(protected)/jobs/jobs-page.tsx, jobs-page.test.tsx; jobs/view/job-view-page.tsx, job-view-page.test.tsx
- frontend/src/components/jobs/job-list-item.tsx, job-list-item.test.tsx, job-detail-view.tsx, job-status-badge.tsx
- frontend/src/components/timeline/timeline-types.ts, timeline-options.ts, timeline-event-schema.ts, timeline-event-form.tsx, event-type-selector.tsx; frontend/src/services/types/timeline.ts
- frontend/src/components/timeline/timeline-event-schema.test.ts, timeline-event-form.test.tsx, timeline-section.test.tsx, timeline-event-card.test.tsx; frontend/src/lib/timeline-view.test.ts; frontend/src/hooks/use-timeline.test.tsx; frontend/src/app/(protected)/agenda/agenda-page.test.tsx
- frontend/e2e/cvs-beta.spec.ts (new), e2e/beta-features.spec.ts, e2e/shell-responsive.spec.ts, e2e/timeline.spec.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/jobs/jobs-page.tsx (exported `FeatureGate` over an inner component l.88-96, `BetaBadge` sibling of the h1 l.211-216)
- frontend/src/components/layout/nav.ts (`feature: "jobs"` l.41, `navItemsFor`)
- frontend/src/app/(protected)/applications/applications-page.tsx archived-cycle branch l.487-491 (no Tabs)
- frontend/src/hooks/use-application-cv-fit.ts (`enabled` gate)
- frontend/e2e/beta-features.spec.ts (two contexts, `openAs`, `addByUsername`, `afterAll` cleanup), e2e/support/auth.ts
- frontend/CLAUDE.md "### Beta features", "### Application Timeline"; ui-designer; ADR-0006 tokens
Contract (from K2): `GET /users/me/features` → `{features: [{key: "jobs"|"cvs", stage}]}`; without `cvs` every base-CV, application-CV and draft route → 404 `{"detail": "Not Found"}`; `GET /jobs*` without `cvs` → `best_fit: null`, `fits: []`; timeline `event_type` ∈ `interview|offer|denied`, else 422.
Steps:
- T023 [US1] Build on `integration/0015-cvs-beta-and-three-event-types` after the K2 tip.
- T024 [US1] [US3] services/types/features.ts `FeatureKey = "jobs" | "cvs"`; components/layout/nav.ts CVs (l.42) `feature: "cvs"`: 6 entries with neither key, 7 with one, 8 with both (+ Admin).
- T025 [US1] [US3] [US2] CV pages (R-006, R-007): export a `FeatureGate feature="cvs"` wrapper over an inner component (jobs-page.tsx precedent) and put `BetaBadge` beside the h1 (a sibling, never inside) while `stage === "beta"`: cvs/cvs-page.tsx, cvs/new/new-cv-page.tsx, cvs/editor/cv-editor-page.tsx, applications/cv/application-cv-page.tsx, applications/new-with-cv/new-with-cv-page.tsx. No CV or draft request goes out without `cvs`; the inner `jobs` checks stay.
- T026 [US3] Applications page (R-006, R-009):
  - components/applications/application-item.tsx CV link (l.211) only with `cvs`;
  - components/applications/new-application-actions.tsx: "New with CV" only with `cvs` (a prop from the page); "New Application" always;
  - app/(protected)/applications/applications-page.tsx: without `cvs`, the archived-cycle shape (no Tabs, no Drafts) on the current cycle too;
  - hooks/use-application-drafts.ts `useDrafts(enabled)`: no `GET /applications/drafts` without `cvs` (Plan corrections 8).
- T027 [US7] Job board (R-008):
  - hooks/use-base-cvs.ts: the query runs only with `cvs`;
  - jobs-page.tsx, jobs/view/job-view-page.tsx: without `cvs` no `MasterCvInvitation`, `fitAvailable` false (l.243), `best_fit` stripped, no `StartApplicationFlow`;
  - components/jobs/job-list-item.tsx, job-detail-view.tsx: `onStart` optional; absent → no "Start application"; the detail's fit list (`job-fit-list.tsx` l.84 invitation included) not rendered;
  - components/jobs/job-status-badge.tsx: "Draft" is text, not a link, without `cvs`; "Applied" stays a link.
- T028 [US4] Timeline form (R-015):
  - components/timeline/timeline-types.ts `TIMELINE_EVENT_TYPES` = interview, offer, denied;
  - timeline-options.ts: drop the note and feedback config;
  - timeline-event-schema.ts: drop the note/feedback branch (l.108-117); `emptyTimelineEventValues` (l.177-191) → `event_type: "interview"`, `interview_type: "unknown"`;
  - timeline-event-form.tsx: the `interview_type` seeding still runs on a new event;
  - event-type-selector.tsx: three in a row at every width, docstring "3" (Plan corrections 8); services/types/timeline.ts l.44 comment.
- T029 [P] [US1] [US3] [US4] [US7] Vitest:
  - sidebar-nav.test.tsx (+ `navItemsFor`): neither 6, one 7, both 8, CVs "Beta" in beta, none in general, loading → no CVs;
  - each CV page test: the not-found message without `cvs`, no service call; "Beta" beside the h1 in beta;
  - applications-page.test.tsx: without `cvs` no tabs, no "New with CV", `services.applicationDrafts.list` never called; with it as today; application-item.test.tsx: no CV link without `cvs`;
  - jobs-page.test.tsx, job-view-page.test.tsx, job-list-item.test.tsx: without `cvs` no fit, no Start, no invitation, Draft as text, no base-CV call;
  - timeline tests (Touch list): three radios, new event Interview / Unknown, note/feedback fixtures → interview/offer/denied;
  - tests seeding `["user","features"]` add `cvs` where they need CVs.
- T030 [US1] [US2] [US3] [US6] E2E on the real stack:
  - frontend/e2e/cvs-beta.spec.ts (new), serial: `e2e-discord` (no `cvs`): 6 rail entries, no CVs; `/cvs`, `/cvs/new`, `/cvs/editor`, `/applications/cv`, `/applications/new-with-cv` → "page not found"; no Drafts tab, no "New with CV"; `GET /base-cvs` and `GET /applications/drafts` 404 → admin adds them at `/admin/features/view?key=cvs` (no "added by" on enrolled rows) → reload: CVs + "Beta", `/cvs` opens → admin removes → reload: hidden again; `e2e-user` (enrolled by the seed): CVs + "Beta"; `afterAll`: `cvs` beta, `e2e-discord` off the list, the admin's opt-out gone;
  - e2e/beta-features.spec.ts: e2e-discord's rail counts drop by one (l.318-320, 341, 376, 436, 466), the admin's stay (Plan corrections 9);
  - e2e/shell-responsive.spec.ts: CVs text `/^CVs(?: Beta)?$/` beside Jobs (l.465); docstring l.33-35;
  - e2e/timeline.spec.ts: "Note" radios (l.180, 241, 534) → Offer / Denied / Interview; the API note (l.225) → interview; the dialog shows three radios and opens on Interview / Unknown.
- T031 [US1] frontend/CLAUDE.md: "### Beta features" (`cvs`, what it hides, 6/7/8 entries); Routing (the CV routes are gated); "### Application Timeline" vocabulary (three types, default Interview / Unknown); E2E (`cvs-beta.spec.ts`, the seed resets `cvs`); "## Tooling" commit line without a ticket key (Plan corrections 16). No ticket keys in new lines.
- T032 [US1] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - full `scripts/e2e.sh` green; no applika-e2e container, network or volume left;
  - Not a merge point.
AC:
- A user has "cvs" by the rule of PRD 0013 R-002: the feature is released, the user is on its list, or the user is an admin who has not turned it off.
- A user without "cvs" sees no CVs entry in the navigation, no CV link on an application, no Drafts tab and no "New with CV". Opening /cvs, /cvs/new, /cvs/editor, /applications/cv or /applications/new-with-cv shows the app's "page not found".
- While "cvs" is in beta, a user who has it sees a "Beta" label on the CVs entry and on the CV pages. The label goes away when it is released.
- A user with "jobs" but without "cvs" sees the job board without any fit, without "Start application", without "Tailor by keywords" and without the invitation to create a master CV. The server sends them no fit, and starting a draft from a job needs both features.
- A user who loses "cvs" keeps every master CV, CV copy and draft unchanged, and gets them back unchanged with "cvs". Their applications keep working without the CV link.
- The web event form offers interview, offer and denied, and a new event starts as an interview of type unknown.
- Its routes are gated with `require_feature` (`applika/backend/app/presentation/dependencies.py`) on the router, on the route, or per value for an option on a shared route; a gated router or route also calls `add_slash_twins` (`applika/backend/app/presentation/gated_slash.py`). The web hides it with `useHasFeature`, `FeatureGate` and the nav item's `feature` (`applika/frontend/src/hooks/use-features.ts`, `src/components/features/`, `src/components/layout/nav.ts`). The API is the rule; the web only follows it. (.claude/rules/beta-features.md 3)
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K4 — applika-cli: timeline add and edit offer interview, offer and denied only   side: cli   covers: R-016   deps: K2
Goal: `applications timeline add` and `edit` take `--type interview|offer|denied` only; note and feedback are gone from the enum, the help, the docs and the skill, with a changelog entry under Unreleased.
Owner's words: "i would like to lock the cv builder and applications cv's in a feature flag just like jobs, sobre event types, i would like to also remove the types "notes" and "feedback", keeping only "interview", "offer" and "denied""
Clarified: "cli version 1.x.x was never released, just remove the options to create note and feedback event's"; orchestrator, checked on PyPI: only applika-cli 0.1.1 to 0.1.4 were ever published. Assumption: the command-line version that drops note and feedback is numbered at release; its changelog entries go under "Unreleased".
Covers: R-016
Release: B. Plan: docs/plan/0015-cvs-beta-and-three-event-types.md `## CLI`, `## Tests` (CLI). Tasks: docs/plan/0015-cvs-beta-and-three-event-types.tasks.md (Plan corrections 10, 11, 14)
Touch:
- cli/src/applika/schemas/enums.py
- cli/src/applika/commands/applications/commands.py, cli/src/applika/commands/applications/__init__.py
- cli/tests/test_timeline_and_finalize.py
- cli/README.md, cli/src/applika/skills/applika-cli/SKILL.md, cli/CLAUDE.md, cli/CHANGELOG.md
Pattern:
- cli/src/applika/schemas/enums.py `InterviewType` (Typer choice from an enum)
- cli/tests/test_timeline_and_finalize.py (FakeApiClient, `captured_post_payload`)
- cli/CHANGELOG.md `## [Unreleased]` (Keep a Changelog sections)
Contract (from K2): `POST /applications/{id}/timeline`, `PUT …/timeline/{event_id}`: `event_type` ∈ `interview|offer|denied`, else 422; responses carry only the three.
Steps:
- T033 [US4] Build on `integration/0015-cvs-beta-and-three-event-types` after the K3 tip.
- T034 [US4] cli/src/applika/schemas/enums.py `EventType` = INTERVIEW, OFFER, DENIED (l.65-70); commands.py `--type` help (l.1256) "interview, offer, denied"; applications/__init__.py timeline help (l.90) "interviews, offers and denials"; `timeline edit` reads `EventType(existing['event_type'])` (l.1506): the API sends three now.
- T035 [P] [US4] cli/tests/test_timeline_and_finalize.py: note cases → interview (unknown) / offer / denied; `add --type note`, `add --type feedback`, `edit … --type note` → exit 2, nothing sent; `timeline add --help` lists the three and neither note nor feedback; asserts on Rich-rendered text stay colour-proof (pass under `GITHUB_ACTIONS=true FORCE_COLOR=1`; Plan corrections 14).
- T036 [US4] Docs: cli/README.md timeline section (l.234-262); cli/src/applika/skills/applika-cli/SKILL.md (l.286-323); cli/CLAUDE.md commands table; cli/CHANGELOG.md `## [Unreleased]` `### Removed` `- applications timeline add and edit no longer take --type note or --type feedback; existing ones read as interview with interview_type unknown.` No version bump (Plan corrections 11). The 0.1.4 commands (`applications steps *`, `finalize --step/--feedback/--salary-offer`) untouched.
- T037 [US4] Checks, close:
  - `make format && make lint && make test` in cli; `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest` → only the five known failures K5 fixes;
  - the changelogs verify command; `applika --help` and `applika applications steps --help` unchanged;
  - Not a merge point.
AC:
- applika-cli offers interview, offer and denied on `applications timeline add` and `edit`, and offers note and feedback nowhere.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `applika/cli/CHANGELOG.md` records every CLI change, and every backend change that changes what a CLI version sends or receives (a route, a request field, a response field, an enum value, a deprecation). (.claude/rules/changelogs.md 1)
- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go under `## [Unreleased]` with `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. The CLI's version heading matches `applika/cli/pyproject.toml` when it is released. (.claude/rules/changelogs.md 4)

## K5 — Closing 0015: full gate, CLI CI fix, E2E, ADRs, walk, Release B   side: both   covers: — (closing; T046 guards the release split)   deps: K3, K4
Goal: Prove 0015 whole: full gate in CLAUDE.md order, the CLI CI repair the owner ordered, E2E, ADRs, a by-hand walk on a real stack across both releases and their rollbacks, and tag Release B. No new feature work.
Owner's words: "i would like to lock the cv builder and applications cv's in a feature flag just like jobs, sobre event types, i would like to also remove the types "notes" and "feedback", keeping only "interview", "offer" and "denied"" Owner, 2026-10-17: "create an another ticket or include in the final ticket to fix the cli tests, the github action "CLI CI" is failing with 5 errors of 329 passing"
Clarified: success signals: after the second release every user who had a CV before the first one still opens /cvs and their application CVs, with no admin action; a user with neither "jobs" nor "cvs" sees six navigation entries, one of them seven, both eight; after the first release's migration no note or feedback event exists and `GET /applications/{id}/steps` answers 0.1.4 the same before and after; the owner releases "cvs" from /admin/features in under a minute, without a deploy. CLI CI: failing on develop since the 0014 merge (runs 39044778340, 39050335938), green locally.
Covers: — (closing)
Release: B, tag `0015-release-b`. Plan: docs/plan/0015-cvs-beta-and-three-event-types.md. Tasks: docs/plan/0015-cvs-beta-and-three-event-types.tasks.md (Plan corrections 1, 11, 12, 13, 14)
Touch:
- cli/tests/conftest.py and/or a shared helper in cli/tests/, cli/tests/test_commands.py (T039, tests only)
- docs/plan/0015-cvs-beta-and-three-event-types.md (two header lines, T044)
- docs/adr/0020-three-timeline-event-types.md, docs/adr/0021-gating-a-shipped-feature.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0014-cli-device-sign-in-and-devices.tasks.md K5
Contract: none new.
Steps:
- T038 On `integration/0015-cvs-beta-and-three-event-types`. Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T039 The CLI CI fix (owner order, 2026-10-17):
  - reproduce: `cd cli && GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest` → the 5 failures: `test_login_rejects_a_bad_device_name_before_any_request` ×3 (cli/tests/test_commands.py l.1322-1335), `test_root_help_still_lists_every_1_0_1_command_and_flag` (l.1533-1549), `test_login_help_lists_the_new_flags` (l.1552-1557);
  - cause: `typer/rich_utils.py` l.74-81 forces a terminal at import under `GITHUB_ACTIONS` / `FORCE_COLOR` / `PY_COLORS`; Rich paints help and usage errors, ANSI codes split `--device-name`, `--api-base-url`, `--device`; substring asserts miss (Plan corrections 14);
  - fix in the tests only, `cli/src` untouched: one shared way for every assert on Rich-rendered text — an ANSI-stripping helper (`click.unstyle` or a regex) or an autouse fixture in cli/tests/conftest.py that turns Typer's forced terminal off (`monkeypatch.setattr(typer.rich_utils, "FORCE_TERMINAL", False)`); an env given to `CliRunner` comes too late;
  - green: `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest` and plain `make test`, 0 failed, under Python 3.10 too (`uv run --python 3.10 pytest`, the CI's version);
  - then "CLI CI" green on GitHub for the branch: the owner pushes it and dispatches the workflow (Plan corrections 13); the agent never pushes;
  - commit `test(cli): make help and usage asserts colour-proof` (no ticket key); no changelog line (tests only, the wheel is unchanged).
- T040 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; every file K1, K2 touched clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`.
- T041 Full `scripts/e2e.sh` (`cvs-beta.spec.ts` + every older spec). Confirm the `e2e` job in .github/workflows/frontend-ci.yaml runs it. Cheaper layers carry what the E2E does not:
  - the conversion, the switch-over trigger, the guard and both rollbacks: test_migration_cvs_feature_event_types.py, test_migration_cvs_topup_and_drop_legacy_trigger.py;
  - the top-up and the removed owner who stays off: test_migration_cvs_topup_and_drop_legacy_trigger.py;
  - every gated route, the slash twins, the unknown-route body, both-keys routes, jobs without fit, the worker: test_cvs_gating.py;
  - the 422 on note and feedback, statistics, reports and agenda: timeline unit and integration tests;
  - 0.1.4: `uv run pytest tests -k "steps or finalize or supports"` + the T045 walk;
  - the CLI's three types: cli tests.
- T042 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - no network or volume from docker-compose.e2e.yml; no testcontainers Postgres or Redis left;
  - the owner's dev containers untouched.
- T043 ADRs and rules:
  - ADR-0020 and ADR-0021 read Accepted; their Decisions match the build (three values + CHECK, `event_type_old`, the trigger and its drop, 422, ids unchanged; the list pre-filled with `added_by` NULL, the top-up, the downgrade keeps the rows). A departure → a dated as-built note under Consequences; the Decision untouched;
  - ADR-0012 and ADR-0018 status lines carry "Amended by" ADR-0020 / ADR-0021 (they do today); 0004, 0005, 0009, 0016 read Accepted;
  - `.claude/rules/beta-features.md` point 2 carries the ADR-0021 exception; its Verify → `jobs seeded`, `cvs seeded`;
  - `grep -rn "_old" backend/app/` → none; `op.drop_` only in `downgrade()` of R1 and R2; `uv run pytest tests/integration -k migration`;
  - the changelogs verify command; both changelogs carry the K2 CLI-facing lines; cli/CHANGELOG.md carries K4's;
  - the commit-format verify on `develop..integration/0015-cvs-beta-and-three-event-types` → no output (no ticket key, conventional).
- T044 Plan header (Plan corrections 1): "0020 (Proposed)" → "0020 (Accepted 2026-10-17)", same for 0021. Nothing else in the plan.
- T045 Walk by hand on a real stack (the dev compose stack, or the e2e stack under `KEEP_STACK=1` with `e2e-user`, `e2e-admin`, `e2e-discord`), both themes, desktop and 390px:
  - **Release A:** the stack at tag `0015-release-a`, a DB holding a note, a feedback and a non-admin CV owner, `alembic upgrade head`: the old web shows them as Interview / Unknown after a reload; the old web adds a note → it reads Interview / Unknown after a reload; `/admin/features` lists "CV builder", beta, the owner on its list with no "added by"; `uvx applika-cli==0.1.4 applications steps list <id>` gives the same ids before and after;
  - **Release B:** rebuild at the branch tip, `alembic upgrade head` (R2): the pre-A owner opens /cvs and their application CVs with "Beta", no admin action; a user with neither key: 6 entries, the five CV routes "page not found", no CV link, no Drafts tab, no "New with CV"; jobs only: 7 entries, the job board without fit, "Start application", "Tailor by keywords" or the invitation, a "Draft" mark as text; both: 8; an admin turns `cvs` off for themselves → their CVs and drafts hidden and kept, back on → unchanged; release `cvs` (timed, < 1 minute, no deploy) → everyone sees CVs without "Beta"; move back to beta;
  - **Timeline:** the form offers three types and opens on Interview / Unknown; a former note counts in the Unknown stage, in a new report's interviews and in the agenda, never as an initial screening; a submitted report unchanged; `cd cli && uv run applika applications timeline add <id> --type note` → exit 2;
  - **Rollback:** `alembic downgrade <R1>` → the trigger is back, the top-up rows stay; `alembic downgrade ed39a0fad1e5` → unedited converted events are notes and feedback again, an edited one stays as edited; `alembic upgrade head` again → as before.
- T046 Release guards:
  - `git merge-base --is-ancestor 0015-release-a integration/0015-cvs-beta-and-three-event-types` → yes;
  - `git diff develop...0015-release-a --name-only` → only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`;
  - the agent never touches `main`, never pushes.
- T047 Record at close:
  - tag the K5 tip `0015-release-b` (local);
  - the owner steps of `### Releases`: B only after A's `alembic upgrade head` is confirmed; `alembic upgrade head` right after the B deploy; the CLI version number before `develop` → `main` (Plan corrections 11); the R-003 limit (Plan corrections 12); rollback B, then A;
  - the agent never touches prod.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics and changed files clean, coverage ≥ 90%, prettier, tsc).
- create an another ticket or include in the final ticket to fix the cli tests, the github action "CLI CI" is failing with 5 errors of 329 passing (owner, 2026-10-17): `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest` in cli has 0 failures, and "CLI CI" is green on GitHub for the branch.
- Every ADR the feature drafted reads Accepted (ADR-0020 and ADR-0021, Accepted 2026-10-17; bound 0004, 0005, 0009, 0012, 0016, 0018 Accepted; 0012 and 0018 point at 0020 and 0021).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (cvs-beta.spec.ts, the whole suite green via scripts/e2e.sh) runs inside the gate and is green; the conversion, the switch-over trigger, both rollbacks, the top-up, every gated route, jobs without fit, the worker, the 422, statistics, reports, agenda and 0.1.4 are carried by the cheaper layers named in T041.
- By-hand walk of the feature on a real stack done across Release A, Release B and both rollbacks, including the success signals (pre-A owners keep CVs with no admin action, 6/7/8 entries, no note or feedback after A with 0.1.4 steps unchanged, a release from /admin/features under a minute with no deploy).
- No new feature work.

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | Release A: migration R1, cvs seeded with its CV owners, note and feedback converted, switch-over trigger | backend | R-001, R-002, R-011, R-013, R-014, R-019, R-020 | — | A, tag `0015-release-a` |
| K2 | Backend: cvs gate on master CV, CV copy and draft routes, job board without fit, three event types, R2 top-up | backend | R-001, R-003, R-004, R-005, R-008, R-009, R-010, R-011, R-012, R-014, R-017, R-018, R-020 | K1 | B |
| K3 | Web: hide CVs, CV links, drafts and the job board's CV parts without cvs, Beta label, three-type event form, cvs-beta E2E | frontend (+ E2E) | R-004, R-006, R-007, R-008, R-009, R-015 | K2 | B |
| K4 | applika-cli: timeline add and edit offer interview, offer and denied only | cli | R-016 | K2 | B |
| K5 | Closing 0015: full gate, CLI CI fix, E2E, ADRs, walk, Release B | both | — | K3, K4 | B, tag `0015-release-b` |

## Matrix
| R | K |
|---|---|
| R-001 | K1, K2 |
| R-002 | K1 |
| R-003 | K2 |
| R-004 | K2, K3 |
| R-005 | K2 |
| R-006 | K3 |
| R-007 | K3 |
| R-008 | K2, K3 |
| R-009 | K2, K3 |
| R-010 | K2 |
| R-011 | K1, K2 |
| R-012 | K2 |
| R-013 | K1 |
| R-014 | K1, K2 |
| R-015 | K3 |
| R-016 | K4 |
| R-017 | K2 (K1 T007 pins the step map; K5 T045 walks it) |
| R-018 | K2 |
| R-019 | K1 (K5 T046 guards the B half) |
| R-020 | K1, K2 (K5 T045 walks both) |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. `## In the owner's words` is one sentence. Checked clause by clause:
- "i would like to lock the cv builder ... in a feature flag": K1 (`cvs` seeded in beta, CV owners listed), K2 (base-CV and drafts routers 404 without it), K3 (nav, CV pages, "New with CV", Drafts tab hidden).
- "and applications cv's": K2 (the application-CV router 404, fit needs both), K3 (no CV link, `/applications/cv` and `/applications/new-with-cv` "page not found").
- "just like jobs": K2 (`require_feature` + slash twins, the PRD 0013 rule), K3 (`FeatureGate`, nav `feature`, "Beta"; the admin screen manages `cvs` like `jobs`, cvs-beta E2E).
- "sobre event types, i would like to also remove the types "notes" and "feedback"": K1 (conversion, CHECK, trigger), K2 (enum, 422), K3 (form), K4 (CLI `--type`).
- "keeping only "interview", "offer" and "denied"": K1 (CHECK), K2 (`EventType`), K3 (three radios), K4 (three choices).
