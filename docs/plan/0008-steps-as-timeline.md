# Plan 0008 — Application steps as a timeline

PRD: docs/prd/0008-steps-as-timeline.md
ADRs bound: 0001 layer-first (router → use case → repo); 0003 snowflake string ids; 0004 row ownership, `is_admin`; 0005 no drops in upgrade, `_old` rename + copy same revision, downgrade restores, code never reads `_old`; 0007 product and schema convergence; 0009 (Accepted 2026-09-17) compat layer + new CLI; 0012 (Accepted 2026-09-15) reversible finalize, timeline + `interview_type`, transitional sync triggers, `Deprecation` header without removal date. Amends 0009.
PRDs neighbouring: 0002 (as-built steps/finalize, replaced here); 0003 (stats/reports read steps, re-keyed here); 0005 (CLI R-007..R-009 kept via compat); 0007 (CV guard uses `feedback_id` → must follow, see Risks).

## Scope
Ships: `timeline_events` + `interview_type`, reversible finalize/reopen, compat for `/steps`, `/finalize` body, `/supports`, legacy Application fields, stats/reports/agenda/admin-stats on timeline, admin catalog write removal, web timeline UI, applika-cli 0.2.0, contract rename to `_old`. Not: route removal, catalog `_old` rename, `_old` purge, detail page, other convergence.

## Releases (runbook rule 4; `develop`→`main` is the owner's release)
- **Release A — expand.** S1 only. Migration R1 additive + backfill + sync triggers. No ORM change, no code reads new objects. Owner releases, runs `alembic upgrade head`, confirms.
- **Release B — code.** S2, S3, S4, S5, S6 together (S2 unmaps old columns S3–S5 stop using; S6 dashboard needs S4 shape). No migration. B slice PRs merge to `develop` only after owner confirms A migrated in prod, so no `develop`→`main` merge carries A and B together.
- **Release C — contract + CLI.** S7 migration R2 (rename `_old`), S8 applika-cli 0.2.0. C PRs merge to `develop` only after owner confirms B healthy in prod. C code runs on pre- and post-R2 schema (B code reads nothing R2 renames). CLI 0.2.0 only calls routes live since B.
- Rollback C: `alembic downgrade <R1>` + B image. Rollback B: A image; events created in B stay in `timeline_events` but A shows them only after `alembic downgrade <R1 parent>` (copies them back). Rollback A: `alembic downgrade <R1 parent>` + pre-A image.

## Data
R1 (new) `backend/migrations/versions/<rev>_timeline_events_expand.py`, `down_revision` = head at branch time (today `a1b2c3d4e5f7`; rebase on plan 0007 S1 if merged first). Hand-written.
- PG enum `event_type`: note, interview, feedback, offer, denied. PG enum `interview_type`: unknown, initial_screening, technical, cultural, hiring_manager, take_home, final.
- Table `timeline_events`: `id` BIGINT PK (snowflake; copied rows keep `application_steps.id`), `application_id` FK applications CASCADE, `user_id` FK users CASCADE (tenancy), `event_type` NOT NULL, `interview_type` NULL, `event_date` DATE NOT NULL, `start_time` TIME, `end_time` TIME, `timezone` VARCHAR(100), `observation` TEXT, `salary_amount` NUMERIC(12,2), `salary_currency` `currency`, `salary_period` `salaryperiod`, `created_at`, `updated_at`.
- CHECK `ck_timeline_events_interview_type`: `(event_type='interview' AND interview_type IS NOT NULL) OR (event_type<>'interview' AND interview_type IS NULL)`. No per-type server default → use case, trigger and backfill set `unknown`.
- CHECK `ck_timeline_events_offer_salary`: all three salary fields iff `event_type='offer'`. Shape vs legacy rows = decision (b).
- Indexes: `ix_timeline_events_application_id`, `ix_timeline_events_user_id`, `ix_timeline_events_user_id_start_time` (agenda).
- `applications.finalized_at` TIMESTAMPTZ NULL. Backfill `feedback_date` 00:00 UTC where `feedback_id` set.
- `steps_definition.event_type` NULL, `steps_definition.interview_type` NULL: mapping store, filled by R1 from `STEP_MAPPING` constant in the revision (decision (a)); unmatched rows get the S1 fallback. Reverse map (event_type, interview_type) → one `steps_definition.id` for compat GET; every pair resolves non-null (decision (a) picks row per pair).
- Backfill order: `LOCK TABLE application_steps, applications IN SHARE ROW EXCLUSIVE MODE` → create triggers → `INSERT ... SELECT` from `application_steps` join `steps_definition` `ON CONFLICT (id) DO NOTHING` → offer salary from `applications.salary_offer` (decision (b)) → feedback name appended to terminal event observation.
- Triggers (transitional, dropped by R2): `trg_application_steps_sync` AFTER INSERT/UPDATE/DELETE on `application_steps` → upsert/delete same id in `timeline_events`; `trg_applications_finalize_sync` AFTER UPDATE OF `feedback_id, feedback_date, salary_offer` on `applications` → set `finalized_at`, offer salary. Keep old-code writes during A→B window in the timeline (PRD R-015).
- R1 downgrade: copy `timeline_events` rows missing in `application_steps` back via reverse map; recompute `last_step_id/last_step_date` from latest event; `feedback_id/feedback_date` NULL where `finalized_at` NULL, reverse-mapped feedback where closed without one (decision (a)); then drop triggers, table, columns, enums created here.
- R2 (new) `<rev>_timeline_events_contract.py`: reconcile copy (same insert, no-op normally) → drop triggers → rename `application_steps`→`application_steps_old`; `applications.last_step_id`, `last_step_date`, `feedback_id`, `feedback_date`, `salary_offer` → `*_old` (FKs, indexes renamed too). `steps_definition`, `feedbacks_definition` keep names. Downgrade: rename back, copy events created since R2 into `application_steps` via reverse map, recreate triggers.
- Decided during slice implementation (owner): (a) mapping of every `steps_definition` row incl. admin-created → event_type + interview_type (seeded "Initial Screen" → interview/initial_screening obvious) — S1 fills `STEP_MAPPING` + reverse map. Directly drives callback rate on migrated data: reports count only `initial_screening` (PRD R-024), so a step mapped to `unknown` or another type adds 0 screenings; (b) legacy `salary_offer` without currency/period vs offer CHECK — S1; (c) `annual`→`annually`, 9→20 currencies — S1; if adopted: `ADD VALUE` in R1 (`autocommit_block`), API accepts `annual` forever (0.1.4 sends it), row remap in S7/R2.
- Pre-migration prod queries owner runs before S1 PR: `SELECT d.id, d.name, d.strict, count(s.id) FROM steps_definition d LEFT JOIN application_steps s ON s.step_id=d.id GROUP BY d.id ORDER BY d.name;` · `SELECT count(*) FROM applications WHERE salary_offer IS NOT NULL AND (currency IS NULL OR salary_period IS NULL);` · `SELECT salary_period, currency, count(*) FROM applications GROUP BY 1,2;` · `SELECT count(*) FROM application_steps;` · `SELECT count(*) FROM applications WHERE feedback_id IS NOT NULL;` (last two = success-signal baseline).

## Backend
Module `backend/app`.
- S2 core. `core/enums.py`: `EventType`, `InterviewType`. `domain/models.py`: `TimelineEventModel`; `ApplicationModel.finalized_at`; `StepDefinitionModel.event_type/interview_type`; remove `ApplicationStepModel` and mappings `last_step_id`, `last_step_date`, `feedback_id`, `feedback_date`, `salary_offer`, `last_step_def`, `feedback_def`. `domain/repositories/timeline_event_repository.py` (new, user-scoped). `application/use_cases/timeline_events/{list,create,update,delete}.py` (new). `application/use_cases/applications/guards.py` (new): `ensure_mutable` (archived → `BusinessRuleViolation` 422; closed → `ApplicationFinalized` 409 "Reopen the application to edit it"), `ensure_not_archived`. `use_cases/applications/finalize_application.py` rewritten (close, idempotent), `reopen_application.py` (new). `presentation/api/timeline_event.py` (new), `presentation/schemas/timeline_event.py` (new), `presentation/api/application.py` reopen route, `presentation/dependencies.py` `TimelineEventRepositoryDp`.
- S3 compat. `presentation/api/application_step.py` routes `deprecated=True`; translator `application/use_cases/compat/step_translation.py` (new): `step_id` → `steps_definition.event_type/interview_type`; event → reverse `step_id`, `step_name`. Strict step on POST/PUT `/steps` refused as today. `/finalize` with body → `application/use_cases/compat/legacy_finalize.py` (new): 409 if closed; terminal event from mapped step; feedback name into observation; salary only on mapped offer else 422; set `finalized_at`. `use_cases/get_supports.py` reads catalogs read-only. `presentation/schemas/application.py` `Application`: + `finalized_at`; `finalized` = `finalized_at` set; `last_step` from latest event via reverse map; `feedback` null; `salary_offer` from latest offer event. `Deprecation` header on `/steps*` and body `/finalize`. Delete `use_cases/application_steps/*`, `domain/repositories/application_step_repository.py`, write methods of `step_definition_repository.py`, `feedback_definition_repository.py`. Update `backend/scripts/seed_mock_data.py`, `backend/CLAUDE.md`.
- S4 read models. `domain/repositories/user_statistic_repository.py`, `use_cases/user_stats/*`, `domain/repositories/quinzenal_report_repository.py`, `use_cases/quinzenal_reports/submit_report.py` (drop `INITIAL_SCREEN_STEP_NAME`, `OFFER_STEP_NAME`), `use_cases/get_user_agenda.py` + `AgendaStepSchema` (+ `event_type`, `interview_type`), `domain/repositories/admin_repository.py` (accepted → has offer event, rejected → has denied event, open → `finalized_at` NULL; activity from `timeline_events.created_at`).
- S5 catalog retirement. Remove `presentation/api/admin/step_definitions.py`, `presentation/api/admin/feedback_definitions.py`, `use_cases/admin/step_definitions/*`, `use_cases/admin/feedback_definitions/*`, registrations in `presentation/api/admin/__init__.py`.

## Frontend
Module `frontend/src`.
- S6. `components/timeline/` (new): `timeline-section.tsx`, `timeline-event-list.tsx`, `timeline-event-card.tsx`, `timeline-event-dialog.tsx`, `timeline-event-form.tsx`, `timeline-event-schema.ts` (zod discriminated union; `interview_type` field only when `event_type==='interview'`, default `unknown`), `timeline-options.ts` (labels 5 types + 7 interview types). Hooks (new) `hooks/use-timeline.ts`, `hooks/use-finalize-application.ts`, `hooks/use-reopen-application.ts`; delete `hooks/use-application-steps.ts`, `components/applications/step-form-dialog.tsx`. `components/applications/application-item.tsx` hosts `TimelineSection`, closed badge, Reopen. `components/applications/finalize-dialog.tsx` → confirm-only, text says reversible. `services/services.ts` timeline + reopen calls. `contexts/supports-context.tsx` drops steps/feedbacks. Dashboard `components/dashboard/step-conversion-chart.tsx`, `avg-days-per-step-chart.tsx`, `stat-cards.tsx`, `hooks/use-statistics.ts` → stage shape. `app/(protected)/admin/supports/supports-page.tsx` drops step/feedback sections. `contexts/agenda-notifications-context.tsx` reads `event_type`.
- i18n: none. Design-system doc: none (plan 0006); look = PRD 0006 tokens.

## CLI
- S8 `cli/src/applika`: `schemas/timeline_event.py` (new, vendored); `schemas/enums.py` + `EventType`, `InterviewType`; `commands/applications/commands.py` + `timeline list|add|edit|delete` (`--type`, `--interview-type`, `--date`, `--start-time`, `--end-time`, `--timezone`, `--observation`, `--salary`, `--currency`, `--period`), `finalize` without `--step/--feedback`, `reopen`; `steps *` kept, help says deprecated. `skills/applika-cli/SKILL.md`, `cli/CLAUDE.md`, `cli/pyproject.toml` → 0.2.0. Publish = `.github/workflows/cli-cd.yaml` on push to `main`.

## Contract
- `GET /applications/{id}/timeline` → 200 `TimelineEvent[]` ordered `event_date, start_time NULLS FIRST, created_at` | 404.
- `POST /applications/{id}/timeline` body `{event_type, interview_type?, event_date, start_time?, end_time?, timezone? ≤100, observation? ≤5000, salary_amount? ≥0, salary_currency?, salary_period?}` → 201 `TimelineEvent` | 404 | 409 closed | 422 archived or invalid. Interview without `interview_type` → `unknown`; `interview_type` on non-interview → 422. Offer: all salary fields, period monthly or annual; other types: none.
- `PUT /applications/{id}/timeline/{event_id}` full body → 200 | 404 | 409 | 422. `DELETE` → 204 | 404 | 409 | 422.
- `TimelineEvent` = `{id, application_id, user_id, event_type, interview_type, event_date, start_time, end_time, timezone, observation, salary_amount (string 2dp), salary_currency, salary_period, created_at, updated_at}`.
- `POST /applications/{id}/finalize` no body → 200 `Application` (idempotent) | 404 | 422 archived. Body `{step_id, feedback_id, finalize_date, salary_offer?, observation?}` → 201 | 404 step/feedback | 409 closed | 422 archived, future date, salary on non-offer; header `Deprecation`.
- `POST /applications/{id}/reopen` → 200 `Application` (idempotent) | 404 | 422 archived.
- `Application` + `finalized_at`; keeps `finalized`, `last_step`, `feedback` (null), `salary_offer`.
- `/applications/{id}/steps[/{sid}]`: 0.1.4 shapes unchanged `{id, step_id, step_name, step_date, start_time, end_time, timezone, observation}`; 409 closed, 422 archived; header `Deprecation`. `GET /supports` unchanged `{steps, feedbacks, platforms}`.
- `GET /applications/statistics` unchanged. `.../statistics/steps/conversion_rate` → `[{event_type, interview_type|null, total_applications, conversion_rate}]`, fixed stage order interview×7, offer, denied. `.../statistics/steps/avarage_days` → `[{event_type, interview_type|null, average_days}]`.
- Reports: `initial_screenings_count` = distinct apps with interview event `interview_type = initial_screening` only (`unknown` and other types excluded); `interviews_completed_fortnight` = interview events; `offers_count` = distinct apps with offer; stored reports untouched.
- Removed: `/admin/step-definitions*`, `/admin/feedback-definitions*` → 404.

## Tests
Unit: guards 409/422; interview_type default and refusal; offer salary invariant; schedule pair; finalize/reopen idempotent; step translation both ways, reverse non-null; legacy finalize 409/422; stage metrics; report screenings count only `initial_screening`, `unknown` → 0.
Integration (`backend/tests/integration/`): `test_timeline_api.py` (new; CRUD, other user 404, closed 409 → reopen → 201, archived 422); `test_finalize.py` rewritten (both bodies); `test_application_steps.py`, `test_supports.py` stay green on 0.1.4 payloads, assert `Deprecation`; `test_statistics.py`, `test_quinzenal_reports.py`, agenda, admin stats updated; `test_timeline_expand_migration.py` (new; R1: seed steps, finalized, salary rows → upgrade asserts copied ids, types, `finalized_at`; old-schema insert/update/delete after upgrade reach timeline via triggers; downgrade restores; re-upgrade equal); `test_timeline_contract_migration.py` (new; R2 round-trip, `_old` present, nothing missing). CLI: 0.1.4 command tests against compat fixtures + 0.2.0 commands, `make test`.
E2E: one spec `frontend/e2e/timeline.spec.ts` (new; infra from plan 0006): add interview (selector shown, default unknown) → add note (selector hidden) → close (reversible text) → add refused → reopen → add ok.

## Rules that bind
- `.claude/rules/non-destructive-migrations.md`: no drops in upgrade; `_old` rename in R2 with reconcile copy; downgrade restores; `timezone` 50→100 widen only.
- `.claude/rules/migration-tests.md`: R1 and R2 round-trip with data assertions on real Alembic chain.
- `.claude/rules/prod-release-runbook.md`: A → B → C, each after owner confirmation; agent never touches prod.
- `.claude/rules/cli-compatibility.md`: 0.1.4 routes and fields `step_id`, `feedback_id`, `finalize_date`, `salary_offer` preserved; removal = later ADR.
- `.claude/rules/quality-gates.md`: backend, frontend, CLI gates + e2e.
- `.claude/rules/branches-and-commits.md`: slice branch from `develop`, PR to `develop`, agent never touches `main`.

## Risks
- R1 lock + backfill stalls writes briefly; owner runs off-peak.
- Frontend and backend CD not atomic: old frontend on B backend breaks stats charts and admin catalog page for minutes.
- Plan 0007 guard (`feedback_id` → 409) breaks once S2 unmaps `feedback_id`: plan 0007 S3 must switch to `finalized_at` (if merged first, S2 updates it). PRD 0007 R-013 codes unchanged (409 closed, 422 archived); only the meaning of finalized becomes reversible.
- `ALTER TYPE ADD VALUE` not usable in same transaction (only if (c) adopted).
- Migration test infra may not exist yet (plan 0007 S1 adds it); S1 depends on it.
- CLI 0.1.4 `steps edit` without `--step` resends reverse `step_id`; reverse map must be stable across releases.
- Triggers hold business mapping in SQL during A→B only; R2 must drop them.
- Strict screening count: users who never pick a type (and migrated steps mapped away from `initial_screening`) report 0% callback rate in new reports.

## Open
- Decided during slice implementation: (a) step mapping + reverse map — S1 (drives migrated callback rate); (b) legacy offer salary vs CHECK — S1; (c) salary period / currency enums — S1 (remap in S7 if adopted).
- Technical: `Deprecation` value RFC 9745 `@epoch` vs `true` — S3.

