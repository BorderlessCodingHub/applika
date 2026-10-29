# Tasks 0018 — Borderless sign-in, membership badges and badge-routed reports

PRD: docs/prd/0018-borderless-sign-in-and-membership-badges.md   Plan: docs/plan/0018-borderless-sign-in-and-membership-badges.md
ADRs bound: 0024 (drafted by this feature, Accepted by LuisMSoares 2026-10-29); 0019 (amended by 0024), 0005 (migrations, K1 and K5), 0009 (CLI compatibility), 0018 (0024 §9 is its exception: no `FeatureKey`). Status lines of 0002, 0004, 0013, 0018, 0019 already carry the 0024 pointers (checked 2026-10-29).

## Order
K1 (KODI-077) Release A migration → K2 (KODI-078) backend → K3 (KODI-079) web → K4 (KODI-080) closing (Release B) → K5 (KODI-081) Release C migration

- **Cap.** Owner, 2026-10-14: "too many tickets, up to 5 only". Set is 5, closing included. The plan's nine slices fold in: A1 → K1; B1, B2, B3, B4 and the backend half of B6 (stub, compose, seed, CLI help text) → K2; B5 and the E2E half of B6 → K3; closing → K4; C1 → K5. The one-day rule yields to the cap: K1 about one day, K2 about five, K3 about three, K4 about one, K5 under one.
- **Shape (0014 precedent, owner-accepted).** K4 closes Release B and carries its tag. K5 is Release C, built last on the same branch after the `0018-release-b` tag, because C merges only after B runs in prod (runbook 4). This bends "closing ticket last": K5 carries its own full gate and a whole E2E run on C's head (B's code on C's schema).
- **Foundation.** Plan `## Data` is not none, so K1 comes first. It is migration only: Release A ships no model, repository or route (runbook 4, "no code reads or writes the new objects yet"). Models and repositories ride K2 (Plan corrections 2).
- **Stories.** Slice grouping wins over one-story-one-ticket (owner precedent, 0010..0017). Stories stay `[USn]` tags: K1 [US2, US5, US7, US8]; K2 [US1..US11]; K3 [US1, US3, US5..US9, US11]; K5 [US8]. P2 stories (US7..US11) share K2 and K3 with the P1 stories; no P1 work waits on a P2 ticket.
- **Sides.** Backend, then frontend (K2 then K3): the web can be tested against the K2 API on the real stack. K2 also carries the CLI help text: the CLI's sign-in behaviour comes from K2's redirects, and both changelogs are written there.
- **deps:** K1 none; K2 = K1; K3 = K2; K4 = K3; K5 = K4.
- **Branch (owner, 2026-10-29).** "the branch labs01-147 is where i will implement the the features and changes of this plan". Every ticket is built on `labs01-147`, one after another, `--no-branch`. K1 T001 commits the planning docs first. No ticket tip is a merge point except the three tagged ones.
- **AC.** PRD requirement text verbatim, `R-nnn` prefix dropped. PRD 0018 ends each requirement with a source in parentheses (owner quote or ADR section); the AC is the requirement sentence(s) without that trailing source, which stays traceable through the `R-nnn` on the covers line. Rule ACs carry `(.claude/rules/<file> <n>)`. A ticket carrying one half of a requirement says so on its covers line.
- **No beta gate (ADR-0024 §9, owner "Gate nothing, exception").** No `FeatureKey`, no seed row, no `require_feature`, no `add_slash_twins`, no `useHasFeature`/`FeatureGate`. Not a `.claude/rules/beta-features.md` breach.
- **No ticket keys** in code, docs, commits or changelogs (`.claude/rules/branches-and-commits.md` 2, `.claude/rules/changelogs.md` 5). This file carries K-labels only.
- **Agent memory** stays in the workspace (`.claude/agent-memory/`), never under `applika/`; `git add <explicit paths>` only (`.claude/rules/no-agent-memory-in-repo.md`).

### Releases (runbook rule 4, expand first, code second)
- **A = K1.** Commits touch only `docs/` (T001), `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`. Base: `labs01-147` = `develop` = `abf984f2`, head `647a047921ec`. Annotated local tag `0018-release-a` on the K1 tip.
  - Owner: merge the tag into `develop` (`--no-ff`), `develop` → `main` → CD deploys unchanged code → `alembic upgrade head` in the API container → restart → confirm.
  - Old code on the new schema: four new tables, one new nullable column, `users.github_id` nullable, a wider CHECK. The old ORM maps none of them.
- **B = K2 + K3, closed by K4.** Tag `0018-release-b` on the K4 tip. `git diff 0018-release-a..0018-release-b -- backend/migrations` is empty.
  - Merged only after the owner confirms A ran. Before the deploy, on the swarm API service (worker and scheduler share env): `BORDERLESS_API_URL=https://api.borderlesscoding.com`; `BORDERLESS_TOKEN_ENCRYPTION_KEY` = a new Fernet key, distinct from the GitHub and Discord keys, backed up with the stack secrets; `WEB_SIGNIN_URI=https://applika.dev/login`. Keep `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `GITHUB_REDIRECT_URI` (the restore reuses that callback; no GitHub app change), `ACCOUNT_LINK_REDIRECT_URI`, `DISCORD_FEEDBACK_WEBHOOK`. Keep the Discord OAuth keys and `GITHUB_TOKEN_ENCRYPTION_KEY` set but unused until C is proven (a rollback to the pre-B image needs them; `extra='ignore'`, `config/settings.py` l.33).
  - Deploy while Borderless is up: B signs everyone out. After the deploy an admin assigns BASE or PSP to each carried-over webhook (posts go nowhere until then), and the admin needs a badge to test reports.
  - Owner's live checks before the merge (Plan corrections 21): one real Borderless sign-in on the dev stack, one real GitHub restore.
- **C = K5.** Tag `0018-release-c` on the K5 tip. Merged only after the owner confirms B runs in prod. `alembic upgrade head` → restart → confirm. After C the owner may unset the Discord OAuth keys and `GITHUB_TOKEN_ENCRYPTION_KEY`.
- **Rollback C → B → A.** C: `alembic downgrade <K1 rev>`. B: previous image tag (everyone signs out again, GitHub sign-in is back). A: `alembic downgrade 647a047921ec`, refused by its guard once any Borderless-only user or `borderless` session exists (A is forward-only from then).
- Build never waits for prod; merge does. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`.

### Plan corrections (checked against the code, 2026-10-29)
1. **Branch, head, no pin.** `labs01-147` and `develop` both point at `abf984f2` (`.git/refs/heads`). Sole head `647a047921ec` (nobody's `down_revision`). No head pin moves: `tests/integration/test_migration_single_head.py` names no revision, and `test_timeline_contract_migration.py::test_the_revision_chain_above_r3_resolves` (l.805-839) walks down from `647a047921ec`, which a child leaves intact. K1 and K5 re-check at start.
2. **Foundation is migration only.** The foundation rule puts models and repositories in the first ticket; runbook 4 forbids any code reading the new objects in Release A. K1 ships the revision and its test; K2 maps the models.
3. **`github_id` readers the plan does not name.** `application/dto/user.py` l.13, l.19 (`UserDTO`); `application/dto/admin.py` l.52, l.89; `presentation/api/cli_auth.py` l.176, l.191 (device approve and deny pass `c_user.github_id`); `presentation/api/oauth.py` l.126 (`set_session_cookies`); `domain/repositories/user_repository.py` l.12-14 (`get_by_github_id`). K2 T020, T025.
4. **Where `/users/me` `github_id` comes from.** The contract keeps `github_id: int | null`, but `UserModel` unmaps the column. The value is the caller's `github_connections.github_id`. `UserProfile.from_user(user, badges, binding, github)` takes that row (or `None`), not a bool. The plan defines neither flag: `github_restore.available` = no row; `github_restore.prompt` = `available` and `github_restore_prompt_seen_at` is NULL. K2 T025.
5. **The feedback mention lives in the use case.** `use_cases/user_feedbacks/submit_feedback.py` l.31-72 builds ` <@{discord_id}>` and passes `mention_user_id`. The plan names only `api/user_feedback.py`. K2 T022 (R-033).
6. **Router registration.** `app/main.py` l.9 and l.96 include `account_link_router`; the two new routers (`borderless_auth`, `github_restore`) need including. K2 T024.
7. **The admin webhook router keeps its 422 guard.** `api/admin/discord_webhooks.py` l.37, l.80 `_NoInputEchoRoute`, and every schema field optional, so a 422 never echoes the URL. The new router keeps both (R-032). K2 T023.
8. **Test fixtures that set `github_id`.** `tests/conftest.py` l.156-158, l.192-194 build `UserDTO(github_id=…)`; `tests/base_db_setup.py`, `tests/sessions_seed.py`, `tests/integration/conftest.py` and every test that builds a `UserModel` with it break once `create_all` has no such column. Migration tests write raw SQL at old revisions and stay. K2 T029: `grep -rn "github_id=" backend/tests`, each one moved (a `github_connections` row where the test needs an identity).
9. **The report gate breaks today's report tests.** `test_quinzenal_reports.py` (31 calls) and `test_past_cycle_data.py` (2) call `/reports` as the `async_client` user. K2 adds a `reports_badge` fixture in `tests/conftest.py` (pattern `jobs_beta`, l.114): an active binding with a future expiry and a live `borderless_psp` row. K2 T029.
10. **Lost or replaced key.** PRD edge case: "The Borderless encryption secret is lost or replaced: every binding is marked as needing a fresh sign-in". The plan's `RefreshBadgesUseCase` branches omit it: `decrypt_borderless_token` → `None` sets `needs_reconnect`, with no call to Borderless. K2 T017.
11. **One transaction in the restore.** Repositories commit per method. The move (binding, badges) and the caller's delete must share one session and one commit (pattern `use_cases/compat/legacy_finalize.py`). K2 T021.
12. **Tests the plan omits.** `tests/integration/test_cli_pkce.py` (GitHub callback, `GITHUB_TOKEN_ENCRYPTION_KEY`); `tests/unit/test_oauth_cli.py` l.6 and `tests/integration/test_session_lifecycle.py` l.22 import `fastapi_sso` (they must change before `uv remove fastapi-sso`); `tests/unit/test_feature_access.py`, `tests/integration/test_features_api.py`, `tests/unit/test_rate_limit.py`, `tests/integration/test_rate_limit.py` (fixtures, Plan corrections 8). K2 T028, T029.
13. **E2E seed identity.** `app/scripts/seed_e2e.py` l.159-176 upserts by `get_by_github_id`, which K2 removes, and links Discord (l.82-93, l.185-212). K2 finds each seeded user by its stub Borderless id, else by email. The contract keys and the `discord` role name stay (`e2e-discord` is the beta specs' third user, `SeededRole` in `frontend/e2e/support/auth.ts` l.19), so `frontend/scripts/e2e.sh` l.71-80 is unchanged apart from waiting for the stub. K2 T027.
14. **Env files carrying retired keys.** `.env.example`, `docker-compose.yml`, `backend/docker-compose.yml`, `docker-compose.e2e.yml` l.40-62, `README.md`, `backend/README.md` (l.60 also names fastapi-sso). The e2e compose keeps the GitHub client id and secret: the restore answers 503 without them. K2 T027, T030.
15. **The login page has no Suspense shell.** `app/login/page.tsx` renders `<LoginPage />` directly; reading `?cli=1` there fails the static export build. K3 T034 adds the shell (precedent `(protected)/cvs/editor/page.tsx`).
16. **E2E pins.** `e2e/smoke.spec.ts` l.53 and `e2e/auth-guard.spec.ts` l.44 assert the "Login with GitHub" link; `smoke.spec.ts` l.154 lists `/admin/discord-webhooks` and l.229 pins `toHaveLength(22)` (K3: `/admin/report-webhooks` replaces it, `/welcome` added → 23, and a redirect test like l.210 for `/admin/discord-webhooks`); `auth-guard.spec.ts` `PROTECTED_PATHS` l.20-31 gains `/welcome`; `admin-gating.spec.ts` l.23. K3 T043.
17. **Web fixtures and dead code.** The new `User` type breaks `contexts/auth-context.test.tsx` l.100-102, `components/layout/user-menu.test.tsx` l.24-26, `app/(protected)/profile/profile-page.test.tsx` l.30. `admin/jobs/jobs-page.tsx` l.36 names the Discord page in a comment. `components/brand-icons.tsx` `DiscordIcon` (l.44) has no caller once `connected-accounts.tsx` goes. K3 T037, T039, T042.
18. **Sign-in method history.** Ended `github_web` rows stay listed for `SESSION_HISTORY_DAYS`. `services/types/sessions.ts`, `components/profile/devices-copy.ts` l.55 and `presentation/schemas/user_sessions.py` keep `github_web` beside the new `borderless`; the CHECK keeps `github_revoked` as an end reason. K2 T025, K3 T040.
19. **CLI docs.** `cli/README.md` l.56 also says "signs in with GitHub" (the plan names `auth.py`, `SKILL.md`, `cli/CLAUDE.md`). No version bump: `cli/pyproject.toml` is 1.1.0 and `cli/CHANGELOG.md` already has `## [Unreleased]` (l.7). K2 T030.
20. **E2E between K2 and K3.** After K2 the old web runs on the new API through the seeded cookies; `e2e/profile-discord.spec.ts` and `e2e/admin-discord-webhooks.spec.ts` call removed routes. K2 runs the suite without those two; K3 deletes and replaces them and runs it whole.
21. **Real Borderless and real GitHub.** An agent never holds the owner's Borderless or GitHub credentials. The stub carries every walk; the GitHub restore is walked up to the consent URL and its callback is carried by `test_github_restore_flow.py`. One real Borderless sign-in and one real GitHub restore on the dev stack are owner steps before the B merge. K4 T050.
22. **ty baseline.** 171, ratchets down only, compared with `develop`; every file a ticket creates or changes is clean.

## K1 — Release A: Borderless, GitHub-identity, badge and report-webhook tables, expand migration and its round trip   side: backend   covers: R-026 (seed), R-031 (carry-over), R-035 (A half); schema for R-007, R-011, R-015, R-019, R-029   deps: —
Goal: Ship the expand migration as Release A, alone: `borderless_accounts`, `github_connections` (seeded from `users.github_id`), `user_badges`, `report_webhooks` (seeded from `discord_report_webhooks`, badge unset), `users.github_id` nullable, `users.github_restore_prompt_seen_at`, `borderless` in the sign-in method CHECK. Downgrade renames to `_old`, guarded. No code reads any of it.
Owner's words: "If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't. As an admin, I want to assign each report webhook to a badge (BASE or PSP), so that a member's report goes to the webhooks of their community. Build it as decided in docs/adr/0024-borderless-sole-login-and-membership-badges.md, in the three releases that ADR describes (migration A, code B, migration C), and settle its open questions before the plan is final."
Clarified: "Revoke, keep history (Recommended)"; "Prompt on first sign-in (Recommended)" ("a 'prompt seen' flag on the user, added in Release A"); the probe: "Refresh token in body: False" (no refresh-token column).
Covers: R-026 (seed), R-031 (carry-over), R-035 (A half)
Release: A, tag `0018-release-a`. Plan: `## Data` (A1), `## Scope` (Releases), `## Tests` (integration). Tasks: Plan corrections 1, 2, 22.
Touch:
- docs/prd/0018-borderless-sign-in-and-membership-badges.md, docs/plan/0018-borderless-sign-in-and-membership-badges.md, docs/plan/0018-borderless-sign-in-and-membership-badges.tasks.md, docs/adr/0024-borderless-sole-login-and-membership-badges.md (new), docs/adr/0002-…, 0004-…, 0013-…, 0018-…, 0019-… (status lines) (T001 commit only, content unchanged)
- backend/migrations/versions/<rev>_borderless_badges_expand.py (new)
- backend/tests/integration/test_migration_borderless_expand.py (new)
- backend/CHANGELOG.md
Pattern:
- backend/migrations/versions/641001baff09_feature_flags.py (`generate_snowflake_id` seeds, `*_old` re-adoption, docstring)
- backend/migrations/versions/ed39a0fad1e5_user_sessions.py (`create_index` only when missing, downgrade index handling, CHECK names)
- backend/tests/integration/test_migration_user_sessions.py, test_migration_feature_flags.py (round trip)
Contract: no route. Release A: the image ships this revision, app code unchanged.
Steps:
- T001 [US2] Base and docs commit:
  - `git -C applika branch --show-current` → `labs01-147`; `git -C applika rev-parse labs01-147 develop` → both `abf984f2…`. Else stop, ask the owner;
  - `git -C applika status --porcelain` → only the Touch docs set. Any other path, or any `agent-memory` path → stop (empty `agent-memory` dirs: `rmdir`);
  - `git add <those explicit paths>`; commit alone: `docs(auth): plan borderless sign-in and membership badges`.
- T002 [US2] Head: `grep -rn "^down_revision" backend/migrations/versions/` → `647a047921ec` is nobody's parent; `uv run alembic heads` → `647a047921ec` (Plan corrections 1).
- T003 [US1] [US3] [US5] [US8] Create backend/migrations/versions/<rev>_borderless_badges_expand.py (new), `down_revision = '647a047921ec'`. Four tables, each `id BIGINT` PK snowflake (no sequence), `created_at TIMESTAMPTZ NOT NULL`, `updated_at` NULL, as `ed39a0fad1e5`:
  - `borderless_accounts`: `user_id BIGINT NOT NULL` FK `users.id` ON DELETE CASCADE, `uq_borderless_accounts_user_id`; `borderless_user_id VARCHAR(64) NOT NULL` `uq_borderless_accounts_borderless_user_id`; `email VARCHAR(320) NOT NULL`; `encrypted_access_token TEXT NOT NULL`; `access_token_expires_at TIMESTAMPTZ NOT NULL`; `status VARCHAR(20) NOT NULL DEFAULT 'active'` `ck_borderless_accounts_status` IN ('active','needs_reconnect'); `linked_at TIMESTAMPTZ NOT NULL DEFAULT now()`; `profile_read_at`, `profile_read_failed_at TIMESTAMPTZ NULL`. No refresh-token column;
  - `github_connections`: `user_id` NOT NULL FK CASCADE `uq_github_connections_user_id`; `github_id BIGINT NOT NULL` `uq_github_connections_github_id`; `username VARCHAR(100) NOT NULL`; `linked_at TIMESTAMPTZ NOT NULL`;
  - `user_badges`: `user_id` NOT NULL FK CASCADE, `ix_user_badges_user_id`; `badge VARCHAR(40) NOT NULL` `ck_user_badges_badge` IN ('borderless_base','borderless_psp'); `source VARCHAR(40) NOT NULL` `ck_user_badges_source` IN ('borderless'); `granted_at TIMESTAMPTZ NOT NULL DEFAULT now()`; `revoked_at TIMESTAMPTZ NULL`; partial unique `uq_user_badges_live (user_id, badge) WHERE revoked_at IS NULL`;
  - `report_webhooks` (platform catalog, no `user_id`): `url VARCHAR(500) NOT NULL` `uq_report_webhooks_url`; `badge VARCHAR(40) NULL` `ck_report_webhooks_badge` same set; `label VARCHAR(100) NULL` (500 and 100 equal the source columns, `ba44f9cfd3c1` l.148, l.155: nothing shrinks).
- T004 [US2] [US8] [US5] Same revision, seeds (ids from `generate_snowflake_id` per row, pattern `641001baff09`):
  - `github_connections`: one row per `users` row: `github_id`, `username`, `linked_at = users.created_at`;
  - `report_webhooks`: one row per `discord_report_webhooks` row: `url = webhook_url`, `label`, `created_at`, `badge` NULL;
  - both `ON CONFLICT DO NOTHING`, so a re-upgrade tops up instead of failing.
- T005 [US7] [US1] Same revision, existing objects:
  - `users.github_id` DROP NOT NULL (unique index kept);
  - `users.github_restore_prompt_seen_at TIMESTAMPTZ NULL` (new; on re-upgrade `github_restore_prompt_seen_at_old` is renamed back);
  - `ck_user_sessions_sign_in_method` dropped and re-created IN ('github_web','cli_browser','cli_device','cli_legacy','borderless').
- T006 [US2] Re-upgrade and downgrade (non-destructive rules 1, 2, 3, 5):
  - upgrade: each `*_old` table left by this revision's downgrade is renamed back, not created; own indexes created only when missing; seeds topped up;
  - downgrade, guard first: `RuntimeError` naming the counts when any `users.github_id IS NULL` or any `user_sessions.sign_in_method = 'borderless'`; then the CHECK narrowed; the prompt column → `github_restore_prompt_seen_at_old`; this revision's own `create_index` indexes dropped; the four tables → `*_old` (rows, PK, FKs, CHECKs travel); `users.github_id` SET NOT NULL. Never `drop_table`, never `drop_column`;
  - docstring: Release A, nothing in `app/` maps these objects, code ships in B; cites non-destructive rules 1, 2, 3, 5, 6, 7, runbook 4, ADR-0005, ADR-0024 §8. No ticket key.
- T007 [P] [US2] Round trip in backend/tests/integration/test_migration_borderless_expand.py (new), testcontainers Postgres, real chain. Seed at `647a047921ec`: two users (one email in mixed case), an open `github_web` session, two Discord report webhooks with labels.
  - **upgrade:** every column with type, length, nullability and default; every unique, CHECK and FK name; `uq_user_badges_live` with its WHERE (two live rows for one badge → IntegrityError; a revoked row plus a live one → fine); bad status, badge, source → IntegrityError each; a `borderless` session row accepted; deleting a user removes its binding, badges and GitHub row; `github_connections` holds one row per user with `github_id`, `username`, `linked_at = created_at`; `report_webhooks` holds both URLs and labels, `badge` NULL; a user with NULL `github_id` can be inserted; the prompt column exists;
  - **guard:** with a NULL-`github_id` user, downgrade raises and changes nothing; same with a `borderless` session;
  - **downgrade (guard clear):** the four `*_old` tables hold their rows; `github_restore_prompt_seen_at_old` holds its values; `borderless` refused again; `github_id` NOT NULL;
  - **upgrade again:** names back, rows equal to the first upgrade, no duplicate seed; a user inserted while downgraded gets its `github_connections` row (top-up);
  - no table or column missing after upgrade, only renamed to `_old`.
- T008 [US2] backend/CHANGELOG.md `## [Unreleased]` `### Added`: `- tables borderless_accounts, github_connections (one row per existing user, from users.github_id), user_badges and report_webhooks (the Discord report webhooks copied, badge unset); users.github_restore_prompt_seen_at; users.github_id nullable; sign-in method borderless allowed. No code reads them yet (Release A, ADR-0024).` No CLI entry (no route, field or enum the CLI sees).
- T009 [US2] Release A shape:
  - `grep -nE "op\.drop_(column|table)"` on the revision → none; `grep -rn "_old" backend/app/` → none; `backend/app/domain/models.py` unchanged;
  - `git -C applika diff develop --name-only` → only `docs/`, `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`; `uv run pytest tests/integration -k migration`;
  - old code on the new schema: full `frontend/scripts/e2e.sh` green (the stack runs `alembic upgrade head`, A included); no applika-e2e container, network or volume left.
- T010 [US2] Gate, tag, record:
  - `cd backend && make format && make lint && make test`; `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; new files clean), `uv run pytest . --cov=app` (≥ 90%);
  - commits conventional, no ticket key (e.g. `feat(db): add borderless, badge and report webhook tables`);
  - annotated local tag `0018-release-a` on the K1 tip;
  - the owner steps of `### Releases` (A); rollback `alembic downgrade 647a047921ec` + previous image. The agent never touches prod or `main`.
AC:
- Every account that signed in with GitHub before this release keeps its GitHub identity on record, so a restore can find it.
- The report webhooks configured before this release are carried over without a badge and receive nothing until an administrator assigns one.
- The retired GitHub and Discord data is set aside, never deleted, by this change.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- No column shrinks. A length, precision or scale never decreases (for example `applications.link_to_job` stays at 2083 and does not become 500). (.claude/rules/non-destructive-migrations.md 6)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)
- Commit messages are conventional commits **without** a ticket key: `feat(cv): add base CV table`. The board is local and the repo is moving to a new remote, so nothing in git history points at a ticket. (.claude/rules/branches-and-commits.md 2)

## K2 — Backend: Borderless sign-in, user-id sessions, badges and confirmation, GitHub restore, badge-gated reports and report webhooks; Discord and GitHub sign-in removed; Borderless stub and E2E seed   side: backend (+ CLI help text)   covers: R-001 (API), R-002, R-003 (API), R-004 (API), R-005 (API), R-006 (API), R-007, R-008, R-009, R-010 (API), R-011, R-012, R-013, R-014, R-015, R-018, R-019 (API), R-020 (API), R-021, R-022 (API), R-023 (API), R-024 (API), R-025 (API), R-026 (lookup), R-027 (API), R-036 (API), R-037 (API), R-038, R-028, R-029 (API), R-030, R-031 (routing), R-032 (API), R-033, R-034, R-035 (B half)   deps: K1
Goal: The API signs users in only with Borderless (server-side credential proxy), opens sessions with `sub` = `users.id`, reads the membership at every sign-in, confirmation and refresh while the 7-day token lives, keeps badges (held only while the token lives), confirms a membership without a new session, restores GitHub-era data one-shot, gates and routes reports by badge, lets admins manage report webhooks. Discord linking and GitHub sign-in are gone. A Borderless stub, the e2e compose service and the seed let the whole stack run without Borderless.
Owner's words: "As an applika user who belongs to the Borderless community, I want to sign in to applika with my Borderless email and password instead of GitHub, so that my BASE or PSP membership shows up as a badge on my account and gives me access to the biweekly reports. If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't. As an admin, I want to assign each report webhook to a badge (BASE or PSP), so that a member's report goes to the webhooks of their community. Discord linking goes away."
Clarified: "replace github login, and replace discord link to github link, this is necessary to restore all user data from old github login"; "Revoke, keep history (Recommended)"; "Email match, else Link GitHub (Recommended)"; "remove discord integration, the reports feature will be available only to users with "psp" or "base" badges, the webhook will use those roles to determine which webhook to report the status"; "Gate nothing, exception (Recommended)"; "Badge holders only (Recommended)"; "the github link only exists to fetch old user data, after this step the link have no pourposes"; "every sign-in and token refresh"; "Lock reports until re-sign-in (Recommended)"; probe: "Refresh token in body: False", "data.token.expiresIn: int = 604800", "membership at data.user.membership: 'PSP'".
Covers: as the header.
Release: B. Plan: `## Data` (models), `## Backend`, `## Contract`, `## Tests` (unit, integration, stub), `## Rules that bind`. Tasks: Plan corrections 3-14, 18-20, 22.
Touch:
- backend/app/domain/models.py, backend/app/core/enums.py, backend/app/config/settings.py, backend/app/core/crypto.py, backend/app/core/tokens.py, backend/app/core/exceptions.py
- backend/app/application/services/borderless_client.py (new), github_service.py (rewritten), session_store.py, discord_service.py
- backend/app/domain/repositories/borderless_account_repository.py, user_badge_repository.py, github_connection_repository.py, report_webhook_repository.py (new); user_repository.py, admin_repository.py (l.178, l.416)
- backend/app/application/use_cases/borderless/{sign_in,confirm_membership,refresh_badges,badge_access}.py (new); github_restore/{begin,complete}.py (new); admin/report_webhooks/{list,create,update,delete}_report_webhook.py (new)
- backend/app/application/use_cases/sessions/{open_session,refresh_session}.py, get_current_user.py, auth_handoff_state.py, account_link_state.py, cli_auth/{token,device_code}.py, quinzenal_reports/{resolve_report_webhooks,submit_report}.py, user_feedbacks/submit_feedback.py
- backend/app/application/dto/user.py, user_session.py, admin.py; backend/app/application/validators/report_webhook.py (new)
- backend/app/presentation/api/borderless_auth.py, github_restore.py, admin/report_webhooks.py (new); oauth.py, cli_auth.py, user.py, reports.py, user_feedback.py, admin/__init__.py; backend/app/main.py
- backend/app/presentation/schemas/borderless_auth.py, report_webhook.py (new); user.py, user_sessions.py, admin.py, account_link.py; backend/app/presentation/handlers.py, dependencies.py
- deleted: presentation/api/account_link.py, presentation/api/admin/discord_webhooks.py, use_cases/account_links/, use_cases/admin/discord_webhooks/, use_cases/user_registration.py, dto/discord.py, services/discord_oauth_service.py, repositories/discord_connection_repository.py, repositories/discord_report_webhook_repository.py, schemas/discord_webhook.py, validators/discord_webhook.py
- backend/pyproject.toml, backend/uv.lock (fastapi-sso out)
- backend/tests/fixtures/borderless/stub.py, accounts.json (new); docker-compose.e2e.yml; frontend/scripts/e2e.sh; docker-compose.yml, backend/docker-compose.yml, .env.example
- backend/app/scripts/seed_e2e.py, backend/scripts/seed_mock_data.py (header)
- backend/tests/conftest.py, base_db_setup.py, sessions_seed.py, integration/conftest.py; backend/tests/unit/…, backend/tests/integration/… (T028, T029)
- backend/CLAUDE.md, backend/README.md, README.md, backend/CHANGELOG.md, cli/CHANGELOG.md
- cli/src/applika/commands/auth.py (l.66 docstring), cli/src/applika/skills/applika-cli/SKILL.md (l.14, l.33), cli/CLAUDE.md (l.200), cli/README.md (l.56)
Pattern:
- backend/app/application/services/discord_oauth_service.py (httpx client, `repr=False` token fields; deleted after)
- backend/app/presentation/api/account_link.py + use_cases/account_link_state.py (one-shot OAuth nonce, callback resolving the caller's own `__access`; deleted after)
- backend/app/presentation/api/admin/discord_webhooks.py + use_cases/admin/discord_webhooks/ (admin CRUD, `_NoInputEchoRoute`, mask; deleted after)
- backend/app/application/use_cases/compat/legacy_finalize.py (shared session, one commit)
- backend/app/core/rate_limit.py `hit` (Redis counter under `asyncio.timeout`)
- backend/tests/conftest.py `jobs_beta` l.114 (fixture that enrols the test user)
- docs/adr/0024-borderless-sole-login-and-membership-badges.md
Contract (K3 consumes; full text plan `## Contract`):
- `POST /auth/borderless/signin` `{email ≤100, password 1..200}` → 200 `{redirect_to: str|null, new_account: bool}` (+ `__access`, `__refresh` on the web branch only) | 401 "Invalid email or password" | 403 `{detail, code: "email_unverified"}` | 409 `{detail, code: "binding_conflict"|"email_ambiguous"}` | 422 | 429 `{detail: "Too many sign-in attempts. Try again in <n> seconds."}` + `Retry-After` | 503 "Borderless is unavailable, try again later" or "Borderless sign-in is not configured".
- `POST /auth/borderless/confirm` (signed in) same body → 204, session and cookies untouched | 401 | 403 | 409 "This is not the Borderless account linked to your applika account" `binding_conflict` | 422 | 429 | 503.
- `GET|PATCH /users/me` + `badges: [{badge, granted_at}]` (live rows, held or not), `borderless: {status: active|expired|needs_reconnect, expires_at, email}|null`, `github_restore: {available, prompt}`; `github_id` int|null; `discord`, `discord_linked` gone.
- `POST /users/me/github-restore/dismiss` → 204 idempotent. `POST /auth/github/restore` → 200 `{authorize_url}` (scope `read:user`, `state`) | 401 | 409 "This account already has its GitHub data" | 503 "GitHub restore is not configured". `GET /auth/github/callback` → always 307 `ACCOUNT_LINK_REDIRECT_URI?account=github&status=restored|not_found|has_data|already_bound|error`; `restored` sets the old account's session cookies.
- `GET /auth/github/login` → 307 `WEB_SIGNIN_URI`; `/auth/cli/authorize`, `/auth/cli/login/{id}` → 307 `WEB_SIGNIN_URI?cli=1` + `__cli_login`. Other `/auth/*` shapes unchanged; refresh of an unbound user → 401 "Sign in again with Borderless", cookies cleared.
- `/reports*`: no live badge → 403 `{detail: "Reports are for Borderless BASE and PSP members", code: "badge_required"}`; live, not held → 403 `{detail: "Sign in again to confirm your membership", code: "membership_unconfirmed"}`; submit 201 shape unchanged.
- `/admin/report-webhooks` GET list `[{id, label, badge|null, webhook_url_masked, created_at, updated_at}]`; POST `{webhook_url, badge, label?}` 201|409|422; PATCH `/{id}` (badge BASE or PSP only) 200|404|409|422; DELETE 204|404; all 401|403 "Admin access required". Gone (404): `/auth/link/discord*`, `/admin/discord-webhooks*`.
Steps:
- T011 [US1] Build on `labs01-147` after the K1 tip: `git merge-base --is-ancestor 0018-release-a HEAD` → yes; `uv run alembic heads` → the K1 revision only. Build never waits for prod.
- T012 [US1] [US3] [US5] [US8] Models and enums:
  - backend/app/domain/models.py: `BorderlessAccountModel`, `GithubConnectionModel`, `UserBadgeModel`, `ReportWebhookModel` (BaseMixin); `__table_args__` mirror every K1 name (uniques, CHECKs, `uq_user_badges_live` with `postgresql_where`, `ix_user_badges_user_id`, FKs `ondelete='CASCADE'`), so `create_all` builds K1's schema;
  - `UserModel` unmaps `github_id` and `encrypted_github_token`, maps `github_restore_prompt_seen_at`; `DiscordConnectionModel`, `DiscordReportWebhookModel` removed; `UserSessionModel` CHECK + `borderless`; no `_old` mapped;
  - backend/app/core/enums.py: drop `DiscordConnectionStatus`; add `BorderlessAccountStatus`, `BadgeKey`, `BadgeSource`.
- T013 [P] [US1] Settings and crypto:
  - backend/app/config/settings.py: add `BORDERLESS_API_URL` (PROD refuses a non-https value), `BORDERLESS_TOKEN_ENCRYPTION_KEY`, `BORDERLESS_TIMEOUT_SECONDS = 5.0`, `BORDERLESS_REFRESH_TIMEOUT_SECONDS = 3.0`, `BORDERLESS_SIGNIN_EMAIL_LIMIT = 5`, `BORDERLESS_SIGNIN_EMAIL_WINDOW_SECONDS = 900`, `WEB_SIGNIN_URI = 'http://127.0.0.1:8080/login'`; remove `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_LINK_REDIRECT_URI`, `DISCORD_TOKEN_ENCRYPTION_KEY`, `GITHUB_TOKEN_ENCRYPTION_KEY`, `GITHUB_CACHE_TTL_SECONDS`;
  - backend/app/core/crypto.py: `encrypt_borderless_token`, `decrypt_borderless_token -> str | None` (InvalidToken or key unset → None); the GitHub and Discord token functions removed.
- T014 [P] [US1] [US10] backend/app/application/services/borderless_client.py (new, httpx): `sign_in(email, password) -> BorderlessSignIn(user_id, email_verified, name, username, access_token, expires_in)` from `data.user.*`, `data.token.accessToken`, `data.token.expiresIn` on `POST {URL}/api/auth/signin` (401 → `BorderlessInvalidCredentials`; 429 → `BorderlessRateLimited(retry_after)`; 5xx or timeout → one retry → `BorderlessUnavailable`); `read_membership(access)` on `GET {URL}/api/users/profile` Bearer (401/403 → `BorderlessAccessRefused`; 5xx, 429, timeout → `BorderlessUnavailable`); `parse_membership(body)` reads `data.user.membership` only, case-insensitive; `data.user.github` never read; no `refresh()`; token fields `repr=False`; never logs a password or token.
- T015 [P] [US8] backend/app/application/services/github_service.py rewritten as httpx `GitHubOAuthService`: `authorize_url(state)` (scope `read:user`, `redirect_uri = GITHUB_REDIRECT_URI`), `exchange_code`, `fetch_identity -> (id, login)`, `revoke(token)` best-effort (`DELETE /applications/{client_id}/token`). `uv remove fastapi-sso` once no import is left, tests included (Plan corrections 12).
- T016 [US1] [US3] [US5] [US8] Repositories in backend/app/domain/repositories/:
  - borderless_account_repository.py (new): `get_by_borderless_id`, `get_by_user_id`, `get_by_user_id_for_update`, `bind`, `store_tokens`, `mark_read_ok`, `mark_read_failed`, `mark_needs_reconnect`, `move_to_user`;
  - user_badge_repository.py (new): `live_for_user`, `apply(user_id, BadgeKey | None)` (revokes other live rows, inserts if missing), `move_all`;
  - github_connection_repository.py (new): `get_by_github_id`, `get_by_user_id`;
  - report_webhook_repository.py (new, replaces discord_report_webhook_repository.py): CRUD + `list_by_badges`; URL IntegrityError → fixed `ResourceConflict('This webhook is already configured')`;
  - user_repository.py: drop `get_by_github_id` and GitHub writes; add `find_by_email_ci` (exact spelling first), `holds_data(user_id)` (EXISTS on applications incl. drafts, cycles, quinzenal_reports, base_cvs, tailored_cvs, timeline_events), `mark_restore_prompt_seen`.
- T017 [US3] [US9] [US10] [US11] Badge rules:
  - use_cases/borderless/badge_access.py (new): `badge_access(binding, live_badges, now) -> BadgeAccess(status: active|expired|needs_reconnect|None, badges, held)`; held = live row AND binding `active` AND `access_token_expires_at > now`. The one rule for the gate, routing, `/users/me` and the chip;
  - use_cases/borderless/refresh_badges.py (new) `RefreshBadgesUseCase.execute(user_id, timeout)`, never raises: lock the row; `needs_reconnect` or expired → no call, nothing written; token decrypts to `None` → `needs_reconnect`, no call (Plan corrections 10); 200 → BASE → `borderless_base`, PSP → `borderless_psp`, else none, + `profile_read_at`; 401/403 → `needs_reconnect`, rows kept; unavailable → `profile_read_failed_at`, rows kept. Only a 200 with another membership revokes.
- T018 [US1] [US2] use_cases/borderless/sign_in.py (new) `BorderlessSignInUseCase.execute(email, password) -> SignInResult(user_id, new_account)`: per-email Redis counter `applika:borderless:signin:<sha256(lower email)>` checked before the call → 429; client; unverified → 403; resolve (1) binding by Borderless id; (2) `find_by_email_ci`: unbound → bind; bound to another id → 409 `binding_conflict`; more than one case-insensitive match and none exact → 409 `email_ambiguous`; (3) create (`username` = name else username, cut to 100), refused 409 before the INSERT when the email is held ignoring case; store the encrypted token, `access_token_expires_at = now + expires_in`, `status = active`; `RefreshBadgesUseCase`. use_cases/user_registration.py deleted.
- T019 [US11] use_cases/borderless/confirm_membership.py (new) `ConfirmMembershipUseCase.execute(user_id, email, password)`: same per-email limit, client, unverified 403; Borderless id ≠ the caller's binding → 409 `binding_conflict`, nothing changes; new token + expiry, `status = active`; `RefreshBadgesUseCase`. No `user_sessions` row, no Redis write, no cookie.
- T020 [US1] [US10] `sub` cutover and refresh (Plan corrections 3):
  - backend/app/core/tokens.py: `sub = str(user.id)` (docstring l.3);
  - services/session_store.py: the hash drops `github_id` (l.8, l.123-138); `touch` answers `user_id` (Lua l.43-49);
  - use_cases/get_current_user.py: `get_by_id`; session `user_id` ≠ `sub` → 401 `Session expired`;
  - sessions/open_session.py, dto/user_session.py, auth_handoff_state.py, cli_auth/token.py, cli_auth/device_code.py (Lua l.67, l.92; `approve`/`deny` signatures), presentation/api/cli_auth.py l.176, l.191, presentation/api/oauth.py l.126: `github_id` out; dto/user.py `UserDTO` drops `github_id`;
  - sessions/refresh_session.py: drop `GitHubService`, `decrypt_token`, `GITHUB_REVOKED`; no binding → `end_row(row, 'expired')` + `InvalidSession('Sign in again with Borderless')`; else `RefreshBadgesUseCase(…, BORDERLESS_REFRESH_TIMEOUT_SECONDS)`, then slide. Serves `GET /auth/refresh` and the `refresh_token` grant.
- T021 [US8] [US7] GitHub restore:
  - use_cases/account_link_state.py: provider argument, key `applika:account_link:github_restore:{nonce}`; the Discord prefix gone;
  - use_cases/github_restore/begin.py (new): the caller has a `github_connections` row → 409; mark the prompt seen; nonce; `authorize_url`;
  - use_cases/github_restore/complete.py (new) `(caller_id, github_id)`: no row → `not_found` (nothing stored); the row's user has a binding → `already_bound`; `holds_data(caller)` → `has_data`; else one session, one commit (Plan corrections 11): `move_to_user` + badges `move_all` → DEL the caller's session keys → delete the caller → commit → `restored(old_user_id)`. No GitHub token stored.
- T022 [US3] [US4] [US9] Reports and feedback:
  - quinzenal_reports/resolve_report_webhooks.py rewritten: held badges (`badge_access`) → `list_by_badges` → distinct URLs by `created_at`; none held, or the hook has no badge → empty;
  - quinzenal_reports/submit_report.py: no mention; services/discord_service.py: `mention_user_id` removed, payload `{"content": "<header> - @<username>\n…", "allowed_mentions": {"parse": []}}`;
  - user_feedbacks/submit_feedback.py l.31-72: `discord_id` and the `<@…>` mention removed (Plan corrections 5); presentation/api/user_feedback.py: no connection read; feedback still posts to `DISCORD_FEEDBACK_WEBHOOK`;
  - core/exceptions.py `BadgeRequired`, `MembershipUnconfirmed`; presentation/api/reports.py router dependency `RequireReportsBadgeDp` on all three routes; reports are never deleted.
- T023 [US5] Admin report webhooks:
  - use_cases/admin/report_webhooks/{list,create,update,delete}_report_webhook.py (new); validators/report_webhook.py (new, from discord_webhook.py: URL regex + `mask`; guild and role checks gone; badge required on create; PATCH `badge` BASE or PSP only, never null);
  - presentation/api/admin/report_webhooks.py (new, `prefix='/admin'`, `AdminUserDp`, `_NoInputEchoRoute`, every schema field optional, Plan corrections 7) + presentation/schemas/report_webhook.py (new); admin/__init__.py `routers`;
  - logs name the webhook id, never the URL.
- T024 [US1] [US6] [US8] [US11] Routes:
  - presentation/api/borderless_auth.py (new): `POST /auth/borderless/signin` (web branch: end the browser's session `replaced`, open a `borderless` session, set both cookies; `__cli_login` present → the `_build_auth_handoff_response` logic returning JSON `redirect_to`, no cookies, the browser's own session untouched); `POST /auth/borderless/confirm` (`CurrentUserDp`) → 204;
  - presentation/api/oauth.py: `GithubSSO` gone; `/github/login` → 307 `WEB_SIGNIN_URI`; `redirect_to_github_for_cli` → `__cli_login` + 307 `WEB_SIGNIN_URI?cli=1` (serves `/cli/login/{id}` and `cli_auth.py` `/cli/authorize`; their 400/404 unchanged); `/github/callback` = the restore callback (nonce, caller through `GetCurrentUserUseCase` on `__access`, exchange, identity, revoke, complete; `restored` opens a `borderless` session for the old account + cookies; every outcome a 307);
  - presentation/api/github_restore.py (new): `POST /auth/github/restore`;
  - backend/app/main.py: include both new routers, drop `account_link_router` (l.9, l.96; Plan corrections 6).
- T025 [US3] [US7] [US8] Users, schemas, DI:
  - presentation/api/user.py: `UserProfile.from_user(user, badges, binding, github)` on GET and PATCH (Plan corrections 4); `POST /users/me/github-restore/dismiss`; `delete_me` loses the Discord unlink (sessions ended first; CASCADE takes binding, badges, GitHub row);
  - presentation/schemas/user.py per the Contract; schemas/borderless_auth.py (new); schemas/user_sessions.py + `borderless` (`github_web` kept, Plan corrections 18); schemas/admin.py l.28, l.83 and dto/admin.py l.52, l.89 `int | None`; domain/repositories/admin_repository.py l.178, l.416 `github_id` through an outer join on `github_connections`; schemas/account_link.py keeps `AccountLinkStart` only;
  - presentation/handlers.py: `BadgeRequired` → 403 `{detail, code: "badge_required"}`, `MembershipUnconfirmed` → 403 `{detail, code: "membership_unconfirmed"}`, sign-in refusals carry `code`, 429 carries `Retry-After`;
  - presentation/dependencies.py: `BorderlessClientDp`, `GitHubOAuthServiceDp`, the new repositories and use cases, `RequireReportsBadgeDp`; the Discord Dps out.
- T026 [US1] Remove the retired code (Touch "deleted"); then `grep -rniE "discord_connection|DiscordOAuth|account_links|encrypted_github_token|get_by_github_id|fastapi_sso|GithubSSO" backend/app` → none; `grep -rn "_old" backend/app/` → none.
- T027 [US1] [US6] [US11] Stub, stacks, seed (Plan corrections 13, 14):
  - backend/tests/fixtures/borderless/stub.py + accounts.json (new, stdlib `http.server`, port 8081): per account id, email, password, `emailVerified`, membership, a fixed seed token, `expiresIn` as an int or a list consumed one per sign-in; issued tokens expire on the stub too; synthetic credentials only; no password in its log. Accounts: `e2e-user` PSP, `e2e-admin` BASE, `e2e-discord` BASE (ids and tokens the seed uses), a FREE account, a PSP account with `expiresIn` `[3, 604800]`, an unverified account;
  - docker-compose.e2e.yml: service `borderless-stub` (python image, fixture folder read-only); `x-api-environment`: `BORDERLESS_API_URL: http://borderless-stub:8081`, a fixed throwaway `BORDERLESS_TOKEN_ENCRYPTION_KEY`, `WEB_SIGNIN_URI: http://127.0.0.1:8180/login`; Discord OAuth keys and `GITHUB_TOKEN_ENCRYPTION_KEY` out; GitHub client id and secret kept; `api` depends on the stub; frontend/scripts/e2e.sh waits for it;
  - backend/app/scripts/seed_e2e.py: each seeded user found by its stub Borderless id, else by email; a binding matching the stub (encrypted fixed token, `access_token_expires_at` = now + 7 days, `active`, re-set every run); badges `e2e-user` PSP, `e2e-admin` BASE, `e2e-discord` BASE; `e2e-user` a `github_connections` row; sessions `borderless`; no Discord row; contract keys unchanged; docstring;
  - backend/scripts/seed_mock_data.py header: the pasted `__access` comes from a Borderless sign-in;
  - .env.example, docker-compose.yml, backend/docker-compose.yml: the Borderless pair and `WEB_SIGNIN_URI` in; the Discord OAuth keys and `GITHUB_TOKEN_ENCRYPTION_KEY` out.
- T028 [P] [US1] [US3] [US8] [US10] [US11] Unit tests (backend/tests/unit/):
  - new: test_borderless_client.py (parse incl. `expiresIn`; 401; 429 `Retry-After`; 5xx one retry; timeout; membership only at `data.user.membership`, case-insensitive; `data.membership`, top-level and `data.user.github` ignored; no password or token in logs or `repr`), test_badge_access.py, test_confirm_membership.py, test_borderless_sign_in.py (steps 1-3, exact case wins, ambiguous 409, bound-other 409, held email 409 with no INSERT, unverified 403, per-email 429 on the 6th, username fallback and cut), test_refresh_badges.py (every branch incl. a token that no longer decrypts; expired → no call and nothing written; history kept; regain = new row), test_github_restore.py (four outcomes, each data table, badges moved, keys DEL'd, no token stored, revoke tried), test_borderless_crypto.py (from test_discord_crypto.py), test_report_webhook_validation.py (from test_discord_webhook_validation.py);
  - updated: test_resolve_report_webhooks.py, test_submit_report.py, test_get_current_user.py (a GitHub-id `sub` → 401), test_account_link_state.py, test_oauth_cli.py (no fastapi_sso), test_seed_e2e.py, test_rate_limit.py, test_feature_access.py;
  - deleted: test_discord_oauth_service.py, test_link_discord.py, test_unlink_discord.py, test_discord_mentions.py, test_user_registration.py, test_discord_crypto.py, test_discord_webhook_validation.py;
  - fakes for `BorderlessClientDp`, `GitHubOAuthServiceDp` in tests/conftest.py.
- T029 [P] [US1]..[US11] Integration tests (backend/tests/integration/, `redis_client` where sessions or limits are involved):
  - new: test_borderless_signin.py (cookies, `borderless` row + keys; every refusal; CLI PKCE and legacy `redirect_to` with no cookies and the browser session kept; caplog holds no password); test_borderless_confirm.py (204, `user_sessions` rows and Redis keys unchanged, no Set-Cookie, refusals); test_github_restore_flow.py (each status, the old account's cookies, caller deleted); test_admin_report_webhooks.py (replaces test_admin_discord_webhooks.py; masked only; 422 never echoes the URL; badge null refused);
  - test_quinzenal_reports.py: 403 `badge_required` on list, read, submit, admin included; expired token or `needs_reconnect` → 403 `membership_unconfirmed`; confirm then 200; PSP → PSP hooks only; unassigned → none; webhook failure → 201; reports stored before a loss come back on regain;
  - test_session_lifecycle.py, test_oauth_cli.py, test_device_flow.py, test_sessions_api.py, test_cli_pkce.py: `sub` = id; refresh reads; Borderless 5xx never fails a refresh; unbound → 401; test_users.py, test_user_feedback.py (no mention), test_delete_account.py (binding, badges, GitHub row gone), test_past_cycle_data.py;
  - fixtures: tests/conftest.py (`UserDTO` without `github_id`; `reports_badge` fixture, Plan corrections 9), base_db_setup.py, sessions_seed.py (the hash), integration/conftest.py, every `github_id=` in a fixture (Plan corrections 8);
  - deleted: test_account_link_discord.py, test_admin_discord_webhooks.py.
- T030 [US1] [US6] Docs and changelogs (no ticket keys):
  - backend/CLAUDE.md: Authentication, GitHub restore (replaces Account links), Users, Reports (gate, routing), Admin report webhooks, Exception Handling, Environment Variables, Domain Model; backend/README.md l.60; README.md env;
  - backend/CHANGELOG.md `## [Unreleased]`: Added (signin, confirm, restore, badges, report webhooks, settings, the stub); Changed (`sub`, refresh, `/admin/users` `github_id`, posts carry no mention); Removed (Discord link, its routes and settings, GitHub sign-in, fastapi-sso);
  - cli/CHANGELOG.md `## [Unreleased]` (changelogs rule 3): `/users/me` adds `badges`, `borderless`, `github_restore`, drops `discord` and `discord_linked`, `github_id` nullable; every user signs in again at the release; `applika login` completes on applika's Borderless sign-in page (every version); the help text;
  - CLI help text: cli/src/applika/commands/auth.py l.66 docstring, SKILL.md l.14, l.33, cli/CLAUDE.md l.200, cli/README.md l.56 → Borderless (Plan corrections 19). No version bump.
- T031 [US1] Checks, gate, close:
  - `uv run pytest tests -k "steps or finalize or supports"`; `cd cli && make lint && make test`;
  - `grep -rn "require_feature\|FeatureKey" backend/app/presentation/api/borderless_auth.py backend/app/presentation/api/github_restore.py backend/app/presentation/api/admin/report_webhooks.py backend/app/presentation/api/reports.py` → none; `git -C applika diff develop -- backend/app/core/features.py` → empty;
  - `git -C applika diff 0018-release-a -- backend/migrations` → empty;
  - `make format && make lint && make test`; `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; touched files clean), `uv run pytest . --cov=app` (≥ 90%);
  - `frontend/scripts/e2e.sh` with every spec except `e2e/profile-discord.spec.ts` and `e2e/admin-discord-webhooks.spec.ts` (Plan corrections 20) → green; no applika-e2e container left;
  - the changelogs verify command; commits conventional, no ticket key (e.g. `feat(auth): sign in with borderless`); not a merge point.
AC:
- The system signs users in only with a Borderless email and password. GitHub sign-in and Discord linking no longer exist.
- The system checks the credentials with Borderless from its own server, never stores or logs the Borderless password, and never hands a Borderless token to the browser or the command-line tool.
- A wrong email or password answers "Invalid email or password", whatever the cause.
- An email that Borderless has not verified is refused with a message asking the user to verify it on Borderless.
- When Borderless is unreachable or failing, sign-in fails with a "try again later" message and sessions already open keep working.
- When Borderless rate-limits a sign-in, or one email fails too often, sign-in is refused with the time to wait.
- A sign-in opens the applika account bound to that Borderless account. With none, it binds and opens the account whose email equals the Borderless email, ignoring case. With none, it creates a new account.
- A binding never moves on sign-in. A sign-in whose email belongs to an applika account bound to another Borderless account is refused, and no second account is created with that email.
- Every session open before this release ends, and every user signs in again with Borderless.
- Installed command-line tools keep working; their sign-in completes on applika's Borderless sign-in page.
- The system turns the membership in Borderless's profile answer into a badge: BASE gives the BASE badge, PSP gives the PSP badge, compared ignoring case, and anything else, or no value, gives none. A user holds at most one.
- The system reads the membership at every Borderless sign-in and at every session refresh, on the web and on every command-line version, for as long as the Borderless access from the last password sign-in is alive. That access lives 7 days and cannot be renewed without the password.
- A membership read that fails because Borderless is slow, failing or rate-limiting never blocks the sign-in or the refresh, and the user keeps their badge while the Borderless access is alive.
- A badge counts as held only while the Borderless access is alive and Borderless has not refused it. When the access expires, or Borderless refuses it, the badge stays recorded but stops counting until the user signs in again with their Borderless password; nothing is revoked by that alone.
- A membership read that answers another membership revokes the badge and keeps its history; regaining it grants the badge again.
- The profile data the API returns lists the user's recorded badges and whether they count, with the state and expiry of the Borderless access.
- When Borderless sign-in creates a new account, the web first shows a one-time screen offering "restore your data from GitHub" or "start fresh". Either choice is remembered, and the screen never shows again.
- The profile offers "Restore data from GitHub" only to an account that has no GitHub identity on record.
- A restore asks GitHub only for the user's public identity, uses GitHub's answer once to find the old account, and keeps no GitHub token.
- When the GitHub identity belongs to an old account with no Borderless binding and the current account holds no data, the system moves the Borderless binding and badges to the old account, keeps the user signed in as the old account and deletes the empty new account.
- When the current account already holds data (applications, drafts, cycles, reports, CVs or timeline events), the restore is refused and the profile explains that two accounts that both hold data are not merged.
- When the old account already has a Borderless binding, the restore is refused with an explanation.
- When the GitHub identity belongs to no applika account, nothing is stored and the user is told no old account was found.
- Every account that signed in with GitHub before this release keeps its GitHub identity on record, so a restore can find it.
- Only a user who holds BASE or PSP can list, read or submit biweekly reports. A user with no recorded badge, administrators included, is refused, and the web hides the report section.
- A user whose recorded badge does not count (R-014) keeps the Reports entry; the Reports page shows "sign in again to confirm your membership" and the Borderless password form instead of reports, and the API refuses the report routes with a reason distinct from "no badge".
- Confirming the membership with the Borderless password, from the Reports page or the profile, renews the Borderless access, reads the membership and keeps the user's current applika session; it must be the Borderless account already bound to the user.
- The system never uses the GitHub account named in the user's Borderless profile to find or restore an applika account.
- Reports stored before a user lost their badge are kept and come back when the badge is regained.
- An administrator can list, add, change and remove report webhooks. Each holds a webhook address, a badge (BASE or PSP) and an optional label.
- A submitted report is saved first, then posted to every webhook whose badge the user holds. The submission succeeds whatever the webhooks answer.
- The report webhooks configured before this release are carried over without a badge and receive nothing until an administrator assigns one.
- After a webhook is saved, the system shows only a masked form of its address.
- Report and feedback posts carry the applika username and mention nobody.
- Feedback keeps going to its one configured feedback webhook.
- The retired GitHub and Discord data is set aside, never deleted, by this change.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- A backend change that affects the CLI goes in **both** files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K3 — Web: Borderless sign-in page, welcome screen, membership badge, confirm form, report gate, GitHub restore, report-webhook admin; Discord UI removed; E2E   side: frontend (+ E2E)   covers: R-001 (web), R-003 (web), R-004 (web), R-005 (web), R-006 (web), R-010 (web), R-016, R-017, R-019 (screen), R-020 (card), R-022 (web), R-023 (web), R-024 (web), R-025 (web), R-027 (web), R-036 (page), R-037 (form), R-029 (screen), R-032 (screen)   deps: K2
Goal: `/login` is an email + password form (CLI-aware), a new account sees `/welcome` once, the user menu and profile header show the held badge, an unconfirmed badge asks for the password from the menu, profile and Reports, the Reports section follows the badge, the profile restores GitHub data, admins manage report webhooks by badge; every Discord and GitHub sign-in surface is gone; the E2E suite runs whole on the real stack with the Borderless stub.
Owner's words: "As an applika user who belongs to the Borderless community, I want to sign in to applika with my Borderless email and password instead of GitHub, so that my BASE or PSP membership shows up as a badge on my account and gives me access to the biweekly reports. If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't. As an admin, I want to assign each report webhook to a badge (BASE or PSP), so that a member's report goes to the webhooks of their community. Discord linking goes away."
Clarified: "Profile and user menu (Recommended)" ("A BASE/PSP chip next to your name in the user menu and on the profile header, read from /users/me, visible only to you"); "Prompt on first sign-in (Recommended)" ("'Used applika with GitHub before? Link GitHub to restore your data' or 'Start fresh'"); "Badge holders only (Recommended)" ("the web hides the section"); "Lock reports until re-sign-in (Recommended)" ("the Reports page shows that prompt plus the password form instead of reports"). Assumptions: the badge reads "BASE" or "PSP", its accessible name "Borderless BASE member" / "Borderless PSP member"; the menu asks to confirm only with a recorded badge, the profile whenever the access expired or was refused; an unconfirmed badge keeps the Reports entry, no recorded badge has none; the sign-in page links to Borderless and hints that a passwordless Borderless account must set a password there first; visiting Reports without a badge explains why.
Covers: as the header.
Release: B. Plan: `## Frontend`, `## Contract`, `## Tests` (vitest, E2E). Tasks: Plan corrections 15-18, 20.
Touch:
- frontend/src/services/types/{users,auth,sessions,admin}.ts, services/implementations/{auth-service,admin-service}.ts, services/interfaces/i-auth-service.ts, src/config.ts
- frontend/src/app/login/page.tsx, login-page.tsx, login-page.test.tsx (new); components/auth-buttons.tsx; components/landing/{features,how-it-works}-section.tsx; app/(public)/page.tsx; lib/return-to.ts
- frontend/src/app/(protected)/welcome/page.tsx, welcome-page.tsx, welcome-page.test.tsx (new); app/(protected)/layout.tsx, layout.test.tsx
- frontend/src/components/badges/membership-badge.tsx, confirm-membership-form.tsx, badge-gate.tsx (+ tests) (new); components/layout/user-menu.tsx, nav.ts, sidebar-nav.test.tsx; components/profile/profile-view.tsx, sub-components.tsx
- frontend/src/components/profile/github-restore-card.tsx, github-restore-notice.tsx, confirm-membership-notice.tsx (new); app/(protected)/profile/profile-page.tsx; hooks/use-github-restore.ts (new)
- frontend/src/app/(protected)/reports/page.tsx, reports/[day]/page.tsx; hooks/use-repports.ts
- frontend/src/app/(protected)/admin/report-webhooks/page.tsx, report-webhooks-page.tsx (+ test) (new); components/admin/report-webhook-list.tsx, report-webhook-form-dialog.tsx (new); admin/discord-webhooks/page.tsx; components/admin/admin-nav.tsx; hooks/use-admin.ts; admin/users/users-page.tsx; admin/jobs/jobs-page.tsx (comment)
- frontend/src/components/profile/devices-copy.ts; components/brand-icons.tsx
- deleted: components/profile/connected-accounts.tsx (+ test), discord-link-notice.tsx, hooks/use-account-links.ts (+ test), admin/discord-webhooks/discord-webhooks-page.tsx (+ test), components/admin/discord-webhook-list.tsx, discord-webhook-form-dialog.tsx, e2e/profile-discord.spec.ts, e2e/admin-discord-webhooks.spec.ts
- frontend/e2e/borderless-signin.spec.ts, admin-report-webhooks.spec.ts (new); e2e/smoke.spec.ts, auth-guard.spec.ts, admin-gating.spec.ts, support/auth.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/cvs/editor/page.tsx (Suspense shell for `?query=`)
- frontend/src/app/(protected)/profile/profile-page.tsx (lazy `useState` from the outcome query, `replaceState`, one-shot `useRef`)
- frontend/src/components/profile/connected-accounts.tsx + hooks/use-account-links.ts (top-level OAuth navigation; deleted after)
- frontend/src/app/(protected)/admin/discord-webhooks/ (admin CRUD page, inline 409/422, masked URL; deleted after); admin/supports/page.tsx (client redirect)
- frontend/src/components/features/feature-gate.tsx (gate above the hooks)
- frontend/e2e/profile-discord.spec.ts (OAuth navigation aborted, authorize URL asserted); e2e/devices.spec.ts (serial, cleanup)
- ui-designer; ADR-0022 tokens (`src/app/globals.css`)
Contract: K2's, as written there.
Steps:
- T032 [US1] Build on `labs01-147` after the K2 tip.
- T033 [US1] [US5] [US8] Types and services:
  - services/types/users.ts: `badges`, `borderless`, `github_restore`, `github_id: string | null`, no `discord*`; services/types/auth.ts: sign-in, confirm and restore shapes, Discord shapes out; services/types/sessions.ts + `"borderless"` (`github_web` kept, Plan corrections 18); services/types/admin.ts `AdminReportWebhook` + create/update shapes, `github_id: string | null`, Discord types out;
  - auth-service.ts + i-auth-service.ts: `borderlessSignIn`, `confirmMembership`, `startGithubRestore`, `dismissGithubRestore`; Discord calls out; admin-service.ts report-webhook CRUD; hooks/use-admin.ts key `["admin","report-webhooks"]`;
  - src/config.ts: "Create a Borderless account" URL `https://borderlesscoding.com` (plan `## Open`).
- T034 [US1] [US6] Sign-in page:
  - app/login/page.tsx: Suspense shell (Plan corrections 15);
  - login-page.tsx: RHF + zod (email ≤ 100, password required) → `services.auth.borderlessSignIn`; the server's words per status and code (401, 403 `email_unverified`, 409 `binding_conflict` / `email_ambiguous`, 429 with the wait, 503); hint under the form: a Borderless account signed up through another provider must set a password on Borderless first; link "Create a Borderless account";
  - `?cli=1`: no auto-redirect while signed in, the password is always asked, follow `redirect_to` with `window.location.assign`; web: invalidate auth and user, then `consumeReturnTo() ?? "/dashboard"` (the layout sends a new account to `/welcome`);
  - components/auth-buttons.tsx `SignInLink` → `/login` (no GitHub icon); copy in components/landing/{features,how-it-works}-section.tsx, app/(public)/page.tsx; lib/return-to.ts comment.
- T035 [US7] Welcome:
  - app/(protected)/welcome/page.tsx + welcome-page.tsx (new): "Used applika with GitHub before? Restore your data from GitHub" → `POST /auth/github/restore` → `window.location.assign(authorize_url)`; "Start fresh" → dismiss → `consumeReturnTo() ?? "/dashboard"`;
  - app/(protected)/layout.tsx: sends to `/welcome` while `github_restore.prompt` (never from `/welcome` itself).
- T036 [US3] [US11] Badge and confirmation:
  - components/badges/membership-badge.tsx (new): "BASE" / "PSP", accessible name "Borderless BASE member" / "Borderless PSP member", never colour alone; in components/layout/user-menu.tsx (both variants) and the components/profile/profile-view.tsx header, only while `borderless.status === "active"` and a badge exists;
  - user menu: a recorded badge with any other status → "sign in again to confirm your membership", a link to `/reports`;
  - components/badges/confirm-membership-form.tsx (new): that sentence + email (prefilled `borderless.email`) + password → `POST /auth/borderless/confirm` → invalidate user and reports queries; the server's words per code;
  - components/profile/confirm-membership-notice.tsx (new): the form, on the profile whenever `borderless.status` is not `active`;
  - components/profile/sub-components.tsx l.23: the GitHub avatar only with a `github_id`, else initials.
- T037 [US8] Restore on the profile (Plan corrections 17):
  - components/profile/github-restore-card.tsx (new): "Restore data from GitHub", only while `github_restore.available`; hooks/use-github-restore.ts (new, top-level navigation; 409 and 503 toasts);
  - components/profile/github-restore-notice.tsx (new): `restored` (role status), `not_found`, `has_data` (two accounts that both hold data are not merged), `already_bound`, `error` (role alert), each with its words;
  - app/(protected)/profile/profile-page.tsx: reads `?account=github&status=` once, invalidates the user, clears the query with `replaceState`;
  - deleted: connected-accounts.tsx (+ test), discord-link-notice.tsx, hooks/use-account-links.ts (+ test); brand-icons.tsx `DiscordIcon`.
- T038 [US3] [US9] [US11] Report gate:
  - components/layout/nav.ts: `navItemsFor` gains `hasReportsBadge` (`badges.length > 0`, held or not); the Reports entry needs it; app/(protected)/layout.tsx passes it;
  - components/badges/badge-gate.tsx (new) wraps app/(protected)/reports/page.tsx and reports/[day]/page.tsx: no badge → "Reports are for Borderless BASE and PSP members" with why; a recorded badge not `active` → `ConfirmMembershipForm` instead of reports; held → the reports;
  - hooks/use-repports.ts: queries enabled only while held.
- T039 [US5] Report webhooks admin:
  - app/(protected)/admin/report-webhooks/page.tsx + report-webhooks-page.tsx (new), components/admin/report-webhook-list.tsx + report-webhook-form-dialog.tsx (new, from the Discord ones): URL, badge select (BASE / PSP, required on create; a carried-over row reads "No badge, receives nothing" and Edit assigns one; never cleared), optional label; the URL reopens blank on edit and blank keeps the stored one; masked address only; 409 and 422 inline;
  - admin/discord-webhooks/page.tsx → `router.replace("/admin/report-webhooks")`; components/admin/admin-nav.tsx tab "Report webhooks"; admin/users/users-page.tsx l.392 "—" when `github_id` is null; admin/jobs/jobs-page.tsx l.36 comment;
  - deleted: discord-webhooks-page.tsx (+ test), discord-webhook-list.tsx, discord-webhook-form-dialog.tsx.
- T040 [P] [US1] components/profile/devices-copy.ts: `borderless` → "Borderless in the browser", `github_web` kept; frontend/CLAUDE.md: Routing (`/welcome`, `/login?cli=1`), Auth (Borderless form, no GitHub), Profile (badge, confirm, restore; Discord section gone), Reports gate, Admin report webhooks, E2E (stub accounts), Backend Context.
- T041 [US1] [US3] [US7] [US8] [US11] ui-designer pass: sign-in form, welcome screen, badge chip, confirm-membership form, restore card and notices; ADR-0022 tokens; both themes; desktop and 390px.
- T042 [P] [US1] [US3] [US5] [US7] [US8] [US9] [US11] Vitest:
  - new: login-page.test.tsx (each status word, the hint, `?cli=1` follows `redirect_to` and never auto-redirects), welcome-page.test.tsx, membership-badge.test.tsx, badge-gate.test.tsx (three states), confirm-membership-form.test.tsx, github-restore-card.test.tsx, report-webhooks-page.test.tsx;
  - updated: user-menu.test.tsx (chip, confirm link; l.24-26 fixture), profile-page.test.tsx (outcome notices; l.30), sidebar-nav.test.tsx (Reports with and without a recorded badge), devices-tab.test.tsx, contexts/auth-context.test.tsx (l.100-102), app/(protected)/layout.test.tsx (`/welcome`), hooks/use-repports.test.tsx (off unless held).
- T043 [US1] [US3] [US5] [US6] [US7] [US8] [US9] [US11] E2E on the real stack with the stub (Plan corrections 16, 20):
  - frontend/e2e/borderless-signin.spec.ts (new, serial): wrong password → "Invalid email or password"; the FREE stub account → new account → `/welcome` → Start fresh → no chip, no Reports entry, `GET /reports` 403 `badge_required`; the restore leaves for `github.com`, the navigation aborted, the URL asserted (`scope=read:user`, a `state`); that account deleted in `beforeAll` and `afterAll` (an API sign-in, then `DELETE /users/me`); seeded `e2e-user` shows "PSP" in the menu and the profile header; `/auth/cli/authorize` → `/login?cli=1` → sign in → lands on the loopback URL with `code` and `state` (intercepted); the PSP account with `expiresIn` `[3, 604800]`: sign in, wait out 3 s, reload → the Reports entry stays, the page shows "sign in again to confirm your membership" and the form, `GET /reports` 403 `membership_unconfirmed`, no chip → confirm with the password → reports load, the chip is back, the Devices list unchanged;
  - e2e/admin-report-webhooks.spec.ts (replaces admin-discord-webhooks.spec.ts): add with a badge, masked row, the token never in `page.content()`, change the badge without resending the URL, delete as its own cleanup;
  - deleted: e2e/profile-discord.spec.ts, e2e/admin-discord-webhooks.spec.ts;
  - e2e/smoke.spec.ts: `/login` shows the sign-in form (l.53), `/admin/report-webhooks` (l.154), `/welcome`, `toHaveLength(23)` (l.229), `/admin/discord-webhooks` redirects (like l.210); e2e/auth-guard.spec.ts: the form (l.44), `PROTECTED_PATHS` + `/welcome`; e2e/admin-gating.spec.ts l.23; e2e/support/auth.ts: the stub accounts (synthetic, mirrored from accounts.json), Discord-link comments gone, role `discord` kept.
- T044 [US1] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - full `frontend/scripts/e2e.sh` green, every spec; no applika-e2e container, network or volume left;
  - `grep -rni "discord" frontend/src` → only the report wire fields `discord_posted` / `discord_error` and saved-searches-menu.test.tsx's negative assertion; `grep -rn "auth/github/login" frontend/src` → none;
  - commits conventional, no ticket key (e.g. `feat(web): sign in with borderless`); not a merge point.
AC:
- The system signs users in only with a Borderless email and password. GitHub sign-in and Discord linking no longer exist.
- A wrong email or password answers "Invalid email or password", whatever the cause.
- An email that Borderless has not verified is refused with a message asking the user to verify it on Borderless.
- When Borderless is unreachable or failing, sign-in fails with a "try again later" message and sessions already open keep working.
- When Borderless rate-limits a sign-in, or one email fails too often, sign-in is refused with the time to wait.
- Installed command-line tools keep working; their sign-in completes on applika's Borderless sign-in page.
- The signed-in user sees their own badge next to their name in the user menu and on the profile header while it counts as held. No other user's view shows a badge.
- While a recorded badge does not count because the Borderless access expired or was refused, the user menu and the profile show "sign in again to confirm your membership".
- When Borderless sign-in creates a new account, the web first shows a one-time screen offering "restore your data from GitHub" or "start fresh". Either choice is remembered, and the screen never shows again.
- The profile offers "Restore data from GitHub" only to an account that has no GitHub identity on record.
- When the GitHub identity belongs to an old account with no Borderless binding and the current account holds no data, the system moves the Borderless binding and badges to the old account, keeps the user signed in as the old account and deletes the empty new account.
- When the current account already holds data (applications, drafts, cycles, reports, CVs or timeline events), the restore is refused and the profile explains that two accounts that both hold data are not merged.
- When the old account already has a Borderless binding, the restore is refused with an explanation.
- When the GitHub identity belongs to no applika account, nothing is stored and the user is told no old account was found.
- Only a user who holds BASE or PSP can list, read or submit biweekly reports. A user with no recorded badge, administrators included, is refused, and the web hides the report section.
- A user whose recorded badge does not count (R-014) keeps the Reports entry; the Reports page shows "sign in again to confirm your membership" and the Borderless password form instead of reports, and the API refuses the report routes with a reason distinct from "no badge".
- Confirming the membership with the Borderless password, from the Reports page or the profile, renews the Borderless access, reads the membership and keeps the user's current applika session; it must be the Borderless account already bound to the user.
- An administrator can list, add, change and remove report webhooks. Each holds a webhook address, a badge (BASE or PSP) and an optional label.
- After a webhook is saved, the system shows only a masked form of its address.
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K4 — Closing 0018: full gate, E2E, ADR-0024, walk, Release B   side: both (backend, frontend, cli)   covers: — (closing)   deps: K3
Goal: Prove Release B whole: the full gate in CLAUDE.md order plus the target gates, the whole E2E suite with the stub, ADR-0024 Accepted and matching the build, no test infrastructure left, a walk by hand on a real stack, both changelogs, the `0018-release-b` tag. No new feature work.
Owner's words: "As an applika user who belongs to the Borderless community, I want to sign in to applika with my Borderless email and password instead of GitHub, so that my BASE or PSP membership shows up as a badge on my account and gives me access to the biweekly reports. If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't. As an admin, I want to assign each report webhook to a badge (BASE or PSP), so that a member's report goes to the webhooks of their community. Discord linking goes away. Build it as decided in docs/adr/0024-borderless-sole-login-and-membership-badges.md, in the three releases that ADR describes (migration A, code B, migration C), and settle its open questions before the plan is final."
Clarified: success signals: a GitHub-era user whose email matches sees their old applications on their first Borderless sign-in, with no extra step; no Borderless password, Borderless token or GitHub token appears in a log, a response or the database unencrypted; a PSP member's report reaches the PSP webhooks and no BASE webhook; a membership change shows within one session refresh while the access is alive, else at the next confirmation; a member confirms in under 30 seconds from the Reports page without losing their session; `applika whoami` from 0.1.4, 1.0.1 and 1.1.0 works after signing in again; no report submission fails because a webhook failed; no restore leaves a user with two accounts that both hold data.
Covers: — (closing)
Release: B, tag `0018-release-b` on this tip. Plan: docs/plan/0018-borderless-sign-in-and-membership-badges.md (`## Open` closing notes). Tasks: Plan corrections 20, 21.
Touch:
- docs/adr/0024-borderless-sole-login-and-membership-badges.md (a dated as-built note under Consequences, only where the build departs)
- docs/prd/0001-auth-users-profile.md (as-built: R-001..R-005, R-013 superseded), docs/prd/0009-discord-account-link.md (retired; R-039 replaced by PRD 0018 R-030), docs/prd/0003-statistics-reports-cycles.md (report gate)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0014-cli-device-sign-in-and-devices.tasks.md K5
Contract: none new.
Steps:
- T045 On `labs01-147` after the K3 tip. Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T046 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; every file K2 touched clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`; `GITHUB_ACTIONS=true FORCE_COLOR=1 uv run pytest`.
- T047 E2E: the whole suite through `frontend/scripts/e2e.sh` (borderless-signin.spec.ts, admin-report-webhooks.spec.ts and every older spec) green; `.github/workflows/frontend-ci.yaml` `e2e` job runs it, and the stub ships in `docker-compose.e2e.yml`. Cheaper layers carry what the E2E does not:
  - sign-in refusals, resolution, per-email limit, no password in logs: test_borderless_signin.py, test_borderless_sign_in.py, test_borderless_client.py;
  - membership reads, held rule, expiry, key lost, revoke history: test_refresh_badges.py, test_badge_access.py, test_session_lifecycle.py;
  - restore outcomes and the one-transaction move: test_github_restore.py, test_github_restore_flow.py;
  - gate and routing (PSP → PSP only, unassigned → none, webhook failure → 201): test_quinzenal_reports.py, test_resolve_report_webhooks.py;
  - installed CLIs: test_oauth_cli.py, test_cli_pkce.py, test_device_flow.py, `uv run pytest tests -k "steps or finalize or supports"`, the T050 walk;
  - migration A: test_migration_borderless_expand.py.
- T048 No test infrastructure left: `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` → empty; no network or volume from docker-compose.e2e.yml, the stub included; no testcontainers Postgres or Redis left; the owner's dev containers untouched.
- T049 ADRs, PRDs, rules, repo:
  - ADR-0024 reads Accepted (2026-10-29), open questions 1-5 struck; its Decision matches the build (credential proxy, `sub` = id, one-shot restore without a token, 7-day token, held rule, confirm keeps the session, gate and routing, no gate). A departure → a dated as-built note under Consequences; the Decision untouched;
  - ADR-0002 and ADR-0013 read Superseded by ADR-0024; ADR-0004 and ADR-0019 Amended by ADR-0024; ADR-0018 carries the ADR-0024 exception; ADR-0005 and ADR-0009 Accepted;
  - as-built notes, dated, in PRD 0001 (R-001..R-005, R-013), PRD 0009 (retired; R-039 replaced by PRD 0018 R-030), PRD 0003 (report gate) (plan `## Open`);
  - `git -C applika diff 0018-release-a..HEAD -- backend/migrations` → empty (Release B is code only); `git -C applika diff develop -- backend/app/core/features.py` → empty (no gate); `grep -rn "_old" backend/app/` → none;
  - the changelogs verify command; both changelogs carry K2's CLI-facing lines;
  - commit-format verify on `develop..labs01-147` → no output; no ticket key added outside this tasks file (`git -C applika diff develop -U0 -- . ':!docs/plan/0018-borderless-sign-in-and-membership-badges.tasks.md' | grep '^+' | grep -E 'KODI-[0-9]+'` → empty); `git -C applika log --all --oneline -- '*agent-memory*'` → empty.
- T050 Walk by hand on a real stack: `KEEP_STACK=1 frontend/scripts/e2e.sh e2e/smoke.spec.ts` (web :8180, API :8100, the stub), both themes, desktop and 390px. Never real credentials (Plan corrections 21):
  - cutover: a stack from tag `0018-release-a` kept up with its seeded web cookies → API and web rebuilt at this tip on the same volumes → the old cookies get 401, the web lands on `/login`;
  - sign-in: wrong password; the unverified account; six wrong passwords for one email → the wait; the stub stopped → "try again later" while a signed-in tab keeps working and refreshing; the stub started again;
  - new account (FREE) → `/welcome` → Start fresh → never again; no chip, no Reports; restore from the profile leaves for `github.com` with `scope=read:user`;
  - email match: a GitHub-era user inserted with the email of a stub PSP account and an application → first sign-in shows that application with no extra step, the PSP chip in the menu and the profile header;
  - reports: PSP user submits → 201 with the webhook error recorded (fake Discord-format URLs), never a failure; admin assigns BASE and PSP to carried-over and new hooks, a duplicate URL → 409, a non-Discord URL → 422, the masked form only;
  - expiry: the `expiresIn` `[3, 604800]` account → Reports lock, menu and profile prompt → confirm from Reports in under 30 s → reports back, Devices unchanged;
  - CLI: `uvx applika-cli==0.1.4`, `uvx applika-cli==1.0.1` and the branch's 1.1.0 (`cd cli && uv run applika`) against the stack: `login` completes on `/login?cli=1`, `whoami` prints the user; a browser already signed in keeps its own session;
  - delete a throwaway account → its binding, badges and GitHub row gone;
  - `docker logs` of the API and the stub, the responses seen and the `borderless_accounts` rows hold no stub password and no plain token;
  - owner steps, before the B merge: one real Borderless sign-in and one real GitHub restore on the dev stack.
- T051 Record at close:
  - annotated local tag `0018-release-b` on the K4 tip;
  - the owner steps of `### Releases` (B only after A's `alembic upgrade head` is confirmed; the env vars; deploy while Borderless is up; assign the carried-over webhooks; an admin needs a badge to test reports); C only after B runs in prod; rollback C, B, then A;
  - the agent never touches prod or `main`.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics beyond 171 and touched files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0024, Accepted 2026-10-29; ADR-0002 and ADR-0013 Superseded by it, ADR-0004 and ADR-0019 Amended, ADR-0018 carries its exception; bound ADR-0005 and ADR-0009 Accepted).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases, testcontainers or Borderless stub left running.
- The E2E the feature earned (borderless-signin.spec.ts and admin-report-webhooks.spec.ts, the whole suite green via frontend/scripts/e2e.sh with the Borderless stub) runs inside the gate and is green; refusals, membership reads, restore outcomes, routing, installed CLIs and the Release A round trip are carried by the cheaper layers named in T047.
- By-hand walk of the feature on a real stack done, including the cutover and the success signals (email match with no extra step, no secret in logs or responses, PSP report to PSP hooks only, confirmation under 30 seconds without losing the session, applika whoami from 0.1.4, 1.0.1 and 1.1.0, no submission failing on a webhook); a real Borderless sign-in and a real GitHub restore left to the owner.
- No new feature work.
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K5 — Release C: retire GitHub and Discord objects to _old, top up the A-to-B gap   side: backend   covers: R-026 (top-up), R-031 (top-up), R-035 (C half)   deps: K4
Goal: Ship the contract migration as Release C, after the `0018-release-b` tag: top up `github_connections` and `report_webhooks` with the rows created between A and B, then rename `discord_connections`, `discord_report_webhooks`, `users.github_id` and `users.encrypted_github_token` to `_old`, data kept. Prove B's code on C's schema with the full gate and the whole E2E.
Owner's words: "If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't. Discord linking goes away. Build it as decided in docs/adr/0024-borderless-sole-login-and-membership-badges.md, in the three releases that ADR describes (migration A, code B, migration C), and settle its open questions before the plan is final."
Clarified: owner's migration order: "never delete a column in the database when upgrading, change the column name to an older version and only copy/migrate the data".
Covers: R-026 (top-up), R-031 (top-up), R-035 (C half)
Release: C, tag `0018-release-c`. Plan: `## Data` (C1), `## Scope` (Releases), `## Tests` (integration). Tasks: Plan corrections 1, 22.
Touch:
- backend/migrations/versions/<rev>_retire_github_discord_objects.py (new)
- backend/tests/integration/test_migration_retire_github_discord.py (new)
- backend/CHANGELOG.md, backend/CLAUDE.md (Domain Model: the four `_old` objects)
Pattern:
- backend/migrations/versions/583226ca46bc_retire_users_is_org_member.py (a Release C rename to `_old`)
- backend/tests/integration/test_migration_retire_is_org_member.py (its round trip)
- the K1 revision (seed top-up `ON CONFLICT DO NOTHING`)
Contract: no route, no API change.
Steps:
- T052 [US8] Base: on `labs01-147` after the `0018-release-b` tag: `git merge-base --is-ancestor 0018-release-b HEAD` → yes; `uv run alembic heads` → the K1 revision only.
- T053 [US8] [US5] Create backend/migrations/versions/<rev>_retire_github_discord_objects.py (new), `down_revision` = the K1 revision:
  - upgrade, top-up first: a `github_connections` row for every user with a `github_id` and none yet (`linked_at = created_at`); a `report_webhooks` row (badge NULL, label kept) for every `discord_report_webhooks` URL missing; both `ON CONFLICT DO NOTHING`;
  - then rename `discord_connections` → `discord_connections_old`, `discord_report_webhooks` → `discord_report_webhooks_old`, `users.github_id` → `github_id_old`, `users.encrypted_github_token` → `encrypted_github_token_old`; data kept;
  - downgrade renames all four back; topped-up rows stay (consistent copies). No `drop_*`;
  - docstring: Release C, B maps none of these objects; non-destructive rules 1, 2, 3, 4, 5, 9, runbook 4, ADR-0005, ADR-0024 §8. No ticket key.
- T054 [P] [US8] Round trip in backend/tests/integration/test_migration_retire_github_discord.py (new), testcontainers Postgres, real chain. Seed at the K1 revision: a gap user with `github_id` and an encrypted token but no `github_connections` row, a covered user, a `discord_connections` row, a gap Discord webhook absent from `report_webhooks`:
  - **upgrade:** the gap user has its row, the gap webhook its row (badge NULL); the four `_old` objects hold their data; the original names are gone; nothing else missing;
  - **downgrade:** the four names back with their data; topped-up rows still present;
  - **upgrade again:** equal to the first upgrade, no duplicate;
  - no table or column missing after upgrade, only renamed to `_old`.
- T055 [US8] B's code on C's schema:
  - `grep -nE "op\.drop_(column|table)"` on the revision → none; `grep -rn "_old" backend/app/` → none; `UserModel` maps neither `github_id` nor `encrypted_github_token`; no model maps `discord_*`;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`; `uv run pytest tests/integration -k migration`;
  - full `frontend/scripts/e2e.sh` green (the stack migrates to head, C included); no applika-e2e container, network or volume left.
- T056 [US8] backend/CHANGELOG.md `## [Unreleased]` `### Changed`: `- discord_connections, discord_report_webhooks, users.github_id and users.encrypted_github_token renamed to *_old, data kept; github_connections and report_webhooks topped up with the rows created between the two migrations (Release C, ADR-0024).` No CLI entry. backend/CLAUDE.md Domain Model names the four `_old` objects (no code reads them; removal only on an explicit owner order).
- T057 [US8] Gate, tag, record:
  - gate in CLAUDE.md order (backend, frontend, cli) and the target gates as K4 T045, T046;
  - `git -C applika diff 0018-release-b --name-only` → only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`, `backend/CLAUDE.md`;
  - commits conventional, no ticket key (e.g. `feat(db): retire github and discord objects`);
  - annotated local tag `0018-release-c` on the K5 tip;
  - owner steps: merge only after B runs in prod; `alembic upgrade head` → restart → confirm; after C, unset the Discord OAuth keys and `GITHUB_TOKEN_ENCRYPTION_KEY` if wanted; rollback `alembic downgrade <K1 rev>` before any image rollback past B. The agent never touches prod or `main`.
AC:
- Every account that signed in with GitHub before this release keeps its GitHub identity on record, so a restore can find it.
- The report webhooks configured before this release are carried over without a badge and receive nothing until an administrator assigns one.
- The retired GitHub and Discord data is set aside, never deleted, by this change.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- A retired column or table is renamed with the suffix `_old` (`feedback_id` becomes `feedback_id_old`, `steps_definition` becomes `steps_definition_old`). (.claude/rules/non-destructive-migrations.md 3)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | Release A: Borderless, GitHub-identity, badge and report-webhook tables, expand migration and its round trip | backend | R-026, R-031, R-035 | — | A, tag `0018-release-a` |
| K2 | Backend: Borderless sign-in, user-id sessions, badges and confirmation, GitHub restore, badge-gated reports and report webhooks; Discord and GitHub sign-in removed; Borderless stub and E2E seed | backend (+ CLI help text) | R-001..R-015, R-018..R-038 (API halves where split) | K1 | B |
| K3 | Web: Borderless sign-in page, welcome screen, membership badge, confirm form, report gate, GitHub restore, report-webhook admin; Discord UI removed; E2E | frontend (+ E2E) | R-001, R-003..R-006, R-010, R-016, R-017, R-019, R-020, R-022..R-025, R-027, R-029, R-032, R-036, R-037 | K2 | B |
| K4 | Closing 0018: full gate, E2E, ADR-0024, walk, Release B | both | — (closing) | K3 | B, tag `0018-release-b` |
| K5 | Release C: retire GitHub and Discord objects to _old, top up the A-to-B gap | backend | R-026, R-031, R-035 | K4 | C, tag `0018-release-c` |

## Matrix
| R | K |
|---|---|
| R-001 | K2 (API), K3 (web) |
| R-002 | K2 |
| R-003 | K2, K3 |
| R-004 | K2, K3 |
| R-005 | K2, K3 |
| R-006 | K2, K3 |
| R-007 | K2 (K1 schema; K4 T050 walks it) |
| R-008 | K2 |
| R-009 | K2 (K4 T050 walks the cutover) |
| R-010 | K2 (redirects), K3 (`/login?cli=1`) |
| R-011 | K2 (K1 schema) |
| R-012 | K2 |
| R-013 | K2 |
| R-014 | K2 |
| R-015 | K2 (K1 schema) |
| R-016 | K3 (K2 data) |
| R-017 | K3 (K2 status) |
| R-018 | K2 |
| R-019 | K2 (flag, dismiss), K3 (screen); K1 column |
| R-020 | K2 (`available`), K3 (card) |
| R-021 | K2 |
| R-022 | K2, K3 |
| R-023 | K2, K3 |
| R-024 | K2, K3 |
| R-025 | K2, K3 |
| R-026 | K1 (seed), K2 (lookup), K5 (top-up) |
| R-027 | K2 (gate), K3 (hidden) |
| R-028 | K2 |
| R-029 | K2 (API), K3 (screen); K1 table |
| R-030 | K2 |
| R-031 | K1 (carry-over), K2 (routing), K5 (top-up) |
| R-032 | K2, K3 |
| R-033 | K2 |
| R-034 | K2 |
| R-035 | K1 (A half), K2 (B half), K5 (C half) |
| R-036 | K2 (403 code), K3 (page) |
| R-037 | K2 (confirm), K3 (form) |
| R-038 | K2 |

Uncovered: none. Orphan: K4 (closing, by design).

## Owner's words not served
None. `## In the owner's words` is five sentences. Checked one by one:
- "As an applika user who belongs to the Borderless community, I want to sign in to applika with my Borderless email and password instead of GitHub, so that my BASE or PSP membership shows up as a badge on my account and gives me access to the biweekly reports.": K2 (sign-in, badges, gate), K3 (form, chip, Reports gate).
- "If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't.": K1 (`github_connections` seed), K2 (email match, restore), K3 (welcome screen, profile card), K5 (gap top-up).
- "As an admin, I want to assign each report webhook to a badge (BASE or PSP), so that a member's report goes to the webhooks of their community.": K1 (`report_webhooks`), K2 (admin API, routing), K3 (admin screen).
- "Discord linking goes away.": K2 (routes, code, settings removed), K3 (profile card and notices removed), K5 (Discord tables to `_old`).
- "Build it as decided in docs/adr/0024-borderless-sole-login-and-membership-badges.md, in the three releases that ADR describes (migration A, code B, migration C), and settle its open questions before the plan is final.": K1 (A), K2..K4 (B), K5 (C); open questions 1-5 were settled before the plan (ADR-0024 amended and Accepted 2026-10-29), K4 T049 checks it.
