# Tasks 0014 — CLI device sign-in and connected devices

PRD: docs/prd/0014-cli-device-sign-in-and-devices.md   Plan: docs/plan/0014-cli-device-sign-in-and-devices.md
ADRs bound: 0019 (drafted by this feature, Accepted 2026-10-15); 0002, 0004, 0009, 0015, 0018; 0005 for the migration (K1). All read Accepted (checked 2026-10-15).

## Order
K1 Release A migration → K2 backend → K3 web → K5 closing (Release B) → K4 applika-cli 1.1.0 (Release C)

- **Slices (set 2026-10-15).** K1, K2, K3, K5, K4, in build order.
- **Owner, 2026-10-15:** "when the tickets are created, implement them in a linear way in auto pilot mode picking the recommended option if any criteria deviation apoear, do everything in a single branch, just like the last phase". Branching answer: "One branch, tag each release (Recommended)". This overrides the **Branches** and **deps** bullets below: K5 deps K3; K4 deps K5; K4 is built on `integration/0014-cli-device-sign-in` after the `0014-release-b` tag, never on its own branch.
- **Branch, as in 0013.** K1 on its slice branch cut from tag `0013-release-a`, tag `0014-release-a`. `integration/0014-cli-device-sign-in` cut from `develop` and `0014-release-a` merged into it `--no-ff` (develop untouched). K2, K3, K5 (tag `0014-release-b`), K4 (tag `0014-release-c`) on it, one after another.
- **Cap.** Owner: 5 slices, closing included. Set is 5. K2 runs about three days, K3 about two, K4 about one and a half; the one-day sizing yields to the cap. Slices stay vertical and testable alone: one backend, one web, one CLI.
- **Stories.** Slice grouping wins over one-story-one-slice (owner precedent, 0012, 0013). Stories stay `[USn]` tags: K1 [US1]; K2 [US1..US7]; K3 [US1, US2, US4, US5, US7]; K4 [US3, US4, US7].
- **Priority bent once.** The CLI half of US3 (P1) is K4, after K3, which carries the web halves of US4 (P2), US5 (P2) and US7 (P3). The CLI is Release C and merges only after B is live; the web halves are B.
- **deps:** K1 none; K2 = K1; K3 = K2; K4 = K2; K5 = K3 + K4.
- **Branches.**
  - K1: the slice branch, cut by hand from TAG `0013-release-a` (not from develop).
  - K2, K3, K5: one branch, `integration/0014-cli-device-sign-in`, cut from `develop` by K2, only once `develop` holds `0014-release-a`.
  - K4: built on `integration/0014-cli-device-sign-in` after the `0014-release-b` tag (owner order above), so the B tag carries no CLI source.
- **Placeholders.** `<K4 branch>` = the K4 slice branch (under the owner order above, `integration/0014-cli-device-sign-in` after the `0014-release-b` tag).
- **AC.** PRD requirement sentence verbatim, `R-nnn` prefix dropped (house precedent). Rule ACs carry their rule path. A slice carrying one side of a requirement says so on its covers line.
- **Beta gate.** None. Owner exception "Gate nothing" (PRD R-015, ADR-0019): no `FeatureKey`, no seed row, no `require_feature`, no `add_slash_twins`, no web gate.

### Releases (runbook rule 4, expand first, code second)
- **A = K1.** Commits touch only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`. Base: tag `0013-release-a` (36079ed, head `641001baff09`). Tag `0014-release-a` on the K1 tip.
  - Owner: merge `0014-release-a` into `main` (it carries 0012 A and 0013 A if they are not there yet; no code reads any of them) → CD deploys → `alembic upgrade head` in the API container → restart → confirm.
  - Owner's order: `git merge --no-ff` of K1 into `develop` (B is cut after it).
  - Old code on the new schema: one new table; the old ORM maps nothing.
- **B = K2 + K3, closed by K5.** Tag `0014-release-b` on the K5 tip of `integration/0014-cli-device-sign-in`. K2 and K3 tips are not merge points.
  - The owner merges it into `develop`, and `develop` into `main` only after A's `alembic upgrade head` is confirmed.
  - Before the deploy, on the API service: `DEVICE_VERIFICATION_URI=https://applika.dev/device`, `CLI_MANUAL_REDIRECT_URI=https://applika.dev/cli/code` (plan `## Open`).
  - The deploy signs every web and CLI user out (R-023). The owner announces it. Old CLIs print "Please run `applika login` again".
  - `FORWARDED_ALLOW_IPS` must hold Traefik's subnet (ADR-0015 deploy order), or every device shows Traefik's IP. Post-B check: Devices tab IPs vary.
- **C = K4.** Tag `0014-release-c` on the K4 tip. The owner merges it into `develop` only once B is live in prod. The merge to `main` publishes applika-cli 1.1.0 (`.github/workflows/cli-cd.yaml`, push to `main` touching `cli/**`). 1.1.0 calls routes that only B serves.
- **Rollback.** C: PyPI has no rollback; a fix goes in 1.1.1. B: previous API + web image; B sessions are lost and everyone signs in again; pre-B `applika:refresh_token:*` keys may still be valid for up to 7 days. A, only after B is rolled back: `alembic downgrade 641001baff09` + previous image; `user_sessions` → `user_sessions_old`, rows kept (Plan corrections 1).
- Build never waits for prod; merge does. Tags stay local. Never rewrite or force-push. An agent never touches prod or `main`.

### Plan corrections (checked against the code, 2026-10-15)
1. **Downgrade keeps the rows.** The plan says "`op.drop_table` in `downgrade()` only". The rule (`non-destructive-migrations.md` 3, 5), `migration-tests.md` 4 ("only renamed to `_old`") and both precedents (`641001baff09`, `b28d5134631f`) rename a new table to `*_old` on downgrade and re-adopt it on upgrade. That also keeps device history through a rollback and roll-forward, so a live Redis key never outlives its row. K1 follows the precedent. **Owner to confirm.**
2. **Base and pin.** Release A is cut from tag `0013-release-a` (36079ed, sole head `641001baff09`), as 0013 K1 was cut from `0012-release-a`. `test_only_one_head` pins the head at `tests/integration/test_timeline_contract_migration.py` l.832-835; K1 moves the pin on the tag's copy.
3. **Tests that send a real access cookie.** These mint `create_access_token(sub)` and go through the real `get_current_user`, so after K2 they need a real session (row + Redis keys) and the new signature: `tests/integration/test_feature_gating.py` l.456, `tests/integration/test_account_link_discord.py` `_cookie_for` l.143-145, `tests/integration/test_delete_account.py` l.145; plus `tests/unit/test_rate_limit.py` l.73 and `tests/integration/test_rate_limit.py` l.143-144 (signature only). K2 adds `tests/sessions_seed.py` (open a real session on `redis_client`).
4. **Tests the plan does not name.** `tests/unit/test_oauth_cli.py` l.112-144 patches `create_refresh_token`, which K2 removes. `tests/unit/test_seed_e2e.py` l.269-283 asserts the `applika:refresh_token:` key, and l.286 pins nine contract keys (eleven after K2).
5. **Dead use case.** `app/application/use_cases/refresh_token.py` (`RefreshTokenUseCase`) is replaced by `sessions/refresh_session.py`. The plan does not say to remove it. K2 deletes it with the uuid4 helpers in `app/core/tokens.py` l.67-131, and fixes the `seed_e2e.py` docstring l.19-30.
6. **"This device" lands on the login page.** PRD edge case: "they are signed out at once and sent to the login page". The plan wires the current row to `useAuth().logout`, which goes to `/` (`contexts/auth-context.tsx` l.65-70). K3: the current row goes through the same confirm, calls `DELETE /users/me/sessions/{id}` (the server clears both cookies), then `window.location.assign("/login")`.
7. **E2E addresses.** The e2e web is `127.0.0.1:8180` (`docker-compose.e2e.yml`); the new settings default to `:8080` (the dev stack). K2 sets `DEVICE_VERIFICATION_URI` and `CLI_MANUAL_REDIRECT_URI` in `x-api-environment`, so `verification_uri_complete` opens the e2e web.
8. **Web pins and tests the plan omits.** `e2e/smoke.spec.ts` l.216 pins `toHaveLength(20)`: K3 adds `/device` (user) and `/cli/code` (anon) → 22. `e2e/auth-guard.spec.ts` `PROTECTED_PATHS` gains `/device`. No test covers `(protected)/layout.tsx`: K3 adds `layout.test.tsx` for the return-to. `contexts/auth-context.test.tsx` and `hooks/use-user.test.tsx` exist: K3 adds the 503 cases.
9. **Last used, after the end.** The plan never writes `user_sessions.last_used_at` / `last_ip`; the list reads them live from Redis. An ended or expired device (key gone) would then show its sign-in values. K2: every refresh and every end copies the live fields onto the row. Also: DELETE and revoke-others end only live sessions. An open row past `expires_at`, or with its key gone, stays "expired" (R-014), and DELETE on it is the no-op 204.
10. **CLI README.** `cli/README.md` l.52-56 describes the old login. The plan names `cli/CLAUDE.md` and `SKILL.md` only. K4 updates the README too.
11. **Routes 1.1.0 calls.** `.claude/rules/cli-compatibility.md` lists the routes 0.1.4 calls. Once C ships, 1.1.0 also calls `/auth/cli/authorize`, `/auth/token`, `/auth/revoke` and `/auth/device/code`. K4 adds one line naming them (workspace root, outside git). **Owner to confirm.**
12. **Names the plan omits.** `app/application/dto/user_session.py` (new; ADR-0001: use cases return DTOs); `tests/sessions_seed.py` (new, correction 3); `e2e/support/auth.ts` `cliBearerHeader()`.
13. **Replaced, web branch only.** "ends a valid same-user `__refresh` session as `replaced`" holds in the callback's web branch only. The CLI branches (legacy handoff, PKCE) never end the browser's own session.
14. **ADR pointers.** The ADR-0002 status line names ADR-0013 only; ADR-0015 and ADR-0018 carry no pointer to ADR-0019. K5 adds dated pointers.
15. **ty baseline.** Rule: 171, ratchets down only. K1 compares against `0013-release-a`, K2..K5 against `develop`. Every new or changed file is clean.
16. **Release A merge into develop.** `backend/CHANGELOG.md` gets lines on both sides under `## [Unreleased]`, and `test_timeline_contract_migration.py` may differ. Keep both sides (0013 precedent).

## K1 — Release A: user_sessions table and its round-trip test   side: backend   covers: R-006 (schema; behaviour K2)   deps: —
Goal: Ship the `user_sessions` table as a migration-only Release A, cut from tag 0013-release-a.
Owner's words: "i would like to implement the same authentication flow used in claude cli and implement in applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost of devices connected and a section to revoke the access, this must be displayed in a new tab inside user profile, losting the device name, ip, when was granted access, last time accessed and more."
Clarified: "Postgres + Redis" (a `user_sessions` table keeps device metadata and history, revoked and expired rows visible; Redis keeps the live key; a Release A migration + round-trip test and a two-release rollout).
Covers: R-006 (schema; behaviour K2)
Release: A, tag `0014-release-a`. Plan: docs/plan/0014-cli-device-sign-in-and-devices.md `## Data`, `## Scope` (Releases). Tasks: docs/plan/0014-cli-device-sign-in-and-devices.tasks.md (Plan corrections 1, 2, 15, 16)
Touch:
- backend/migrations/versions/<rev>_user_sessions.py (new)
- backend/tests/integration/test_migration_user_sessions.py (new)
- backend/tests/integration/test_timeline_contract_migration.py (`test_only_one_head` pin)
- backend/CHANGELOG.md
Pattern:
- backend/migrations/versions/641001baff09_feature_flags.py (`*_old` re-adopt, `create_index` guard, downgrade index handling, docstring)
- backend/tests/integration/test_migration_feature_flags.py (round trip)
Contract: no route. Release A: the image ships this revision, app code unchanged.
Steps:
- T001 [US1] Base, branch:
  - `git rev-parse --short '0013-release-a^{commit}'` → `36079ed`. Else stop, ask the owner;
  - cut the slice branch from `0013-release-a` (`git switch -c <slice branch> 0013-release-a`);
  - one head: `grep -rn "^down_revision" backend/migrations/versions/` → `641001baff09` is nobody's parent.
- T002 [US1] Create backend/migrations/versions/<rev>_user_sessions.py (new), `down_revision = '641001baff09'`. Table `user_sessions`:
  - `id BIGINT` PK snowflake (no sequence), `created_at TIMESTAMPTZ NOT NULL` (= granted), `updated_at` NULL, as the other tables;
  - `user_id BIGINT NOT NULL` FK `users.id` ON DELETE CASCADE;
  - `client_type VARCHAR(10) NOT NULL`, `sign_in_method VARCHAR(20) NOT NULL`, `device_name VARCHAR(100) NOT NULL`, `user_agent VARCHAR(512) NULL`;
  - `created_ip VARCHAR(45) NULL`, `last_ip VARCHAR(45) NULL`, `last_used_at TIMESTAMPTZ NULL`, `expires_at TIMESTAMPTZ NOT NULL`, `ended_at TIMESTAMPTZ NULL`, `end_reason VARCHAR(20) NULL`;
  - no refresh value and no hash of it (ADR-0019).
- T003 [US2] Same revision, CHECKs: `ck_user_sessions_client_type` IN ('web','cli'); `ck_user_sessions_sign_in_method` IN ('github_web','cli_browser','cli_device','cli_legacy'); `ck_user_sessions_end_reason` IN ('logout','revoked','expired','github_revoked','replaced'); `ck_user_sessions_ended_pair` `(ended_at IS NULL) = (end_reason IS NULL)`.
- T004 [US1] Same revision, indexes: `ix_user_sessions_user_id_created_at` (user_id, created_at DESC); `ix_user_sessions_open` (user_id) WHERE ended_at IS NULL. Created only when missing (re-upgrade).
- T005 [US1] Re-upgrade and downgrade, shape of `641001baff09` (Plan corrections 1):
  - upgrade: an existing `user_sessions_old` is renamed back, not created; indexes after;
  - downgrade: drop this revision's two indexes; rename `user_sessions` → `user_sessions_old`; every row stays; no drop of the table;
  - docstring cites non-destructive rules 1, 2, 3, 5, 7; runbook 4; ADR-0005; ADR-0019 (code ships in B).
- T006 [P] [US1] Round trip in backend/tests/integration/test_migration_user_sessions.py (new): testcontainers Postgres, real chain. Seed at `641001baff09`: users A and B.
  - **upgrade:** every column with type, length and nullability; the four CHECK names; both indexes (the partial one with its WHERE); the FK with CASCADE; insert an open web row for A and an ended `revoked` cli row for B; bad `client_type`, bad `sign_in_method`, bad `end_reason`, `ended_at` without `end_reason` → IntegrityError each; delete B → B's rows gone; users rows intact;
  - **downgrade:** `user_sessions_old` holds every row; `user_sessions` is gone; neither index is left; users intact;
  - **upgrade again:** name back, rows equal to the first upgrade, indexes equal;
  - no table or column missing after upgrade, only renamed to `_old`.
- T007 [US1] backend/tests/integration/test_timeline_contract_migration.py `test_only_one_head` (l.832-835): pin `641001baff09` → `<rev>`; assert `down_revision == '641001baff09'`; keep the chain walk; one docstring line for K1.
- T008 [US1] backend/CHANGELOG.md `## [Unreleased]` Added: `- table user_sessions: one row per sign-in (device name, client, sign-in method, sign-in and last IP, granted, last used, expiry, end and reason); no code reads it yet (Release A, ADR-0019).` No CLI entry: no route, field or enum change.
- T009 [US1] Verify and Release A shape:
  - `grep -nE "op\.drop_(column|table)"` on the revision → none; `grep -rn "_old" backend/app/` → none;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`; `uv run pytest tests/integration -k migration`;
  - backend/app/domain/models.py maps nothing new; backend/tests/conftest.py unchanged;
  - `git diff 0013-release-a --name-only` → only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md`.
- T010 [US1] Gate, record, close:
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `0013-release-a`, ceiling 171; changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - annotated tag `0014-release-a` on the K1 tip (local);
  - the owner steps of `### Releases` (A), including the `--no-ff` merge into `develop` on his order (Plan corrections 16); rollback `alembic downgrade 641001baff09` + previous image;
  - The agent never touches prod or `main`.
AC:
- The system keeps each device's details and history in the database, so ended devices stay visible.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K2 — Backend: device sessions in Redis, session check on every request, devices API, CLI sign-in routes   side: backend   covers: R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-010 (API), R-011 (API), R-012 (API), R-013 (API), R-014 (API), R-015 (API), R-016 (API), R-017 (API), R-018 (API), R-019 (API), R-020, R-021 (API), R-022 (API), R-023, R-024   deps: K1
Goal: One session per sign-in (Redis uuid7 key + user_sessions row), a sid checked on every request (fail closed), the devices API and the CLI OAuth routes, with the old CLI handoff kept.
Owner's words: "i would like to implement the same authentication flow used in claude cli and implement in applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost of devices connected and a section to revoke the access, this must be displayed in a new tab inside user profile, losting the device name, ip, when was granted access, last time accessed and more." "i also want to instead of returning the refresh token in jwt, save it in the redis instance used by the rate limiter, the access token cookie value now will become an random uuid7 value, the same one used as key in the redis, if the redis key expire, this mean the session also expired, i also want to list the devices connected by the frontend app in the profile"
Clarified: "Both" (PKCE loopback by default, `applika login --device` for headless); "the access token will still be a jwt token, only the refresh token will become an uuid value, i am refrering to the cookies"; "Instant (Recommended)"; "Postgres + Redis"; "Log everyone out"; "Gate nothing"; "Public row id (Recommended)"; "Sliding on refresh"; "Fail closed".
Covers: R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-010 (API), R-011 (API), R-012 (API), R-013 (API), R-014 (API), R-015 (API), R-016 (API), R-017 (API), R-018 (API), R-019 (API), R-020, R-021 (API), R-022 (API), R-023, R-024
Release: B. Plan: docs/plan/0014-cli-device-sign-in-and-devices.md `## Data` (Redis), `## Backend (B)`, `## Contract`, `## Tests`. Tasks: docs/plan/0014-cli-device-sign-in-and-devices.tasks.md (Plan corrections 3, 4, 5, 7, 9, 12, 13, 15)
Touch:
- backend/app/domain/models.py
- backend/app/config/settings.py
- backend/app/core/pkce.py (new), user_agent.py (new), user_codes.py (new)
- backend/app/core/tokens.py, exceptions.py, rate_limit.py
- backend/app/config/rate_limit.py
- backend/app/application/services/session_store.py (new)
- backend/app/application/dto/user_session.py (new)
- backend/app/domain/repositories/user_session_repository.py (new)
- backend/app/application/use_cases/sessions/__init__.py, open_session.py, refresh_session.py, end_session.py, list_my_sessions.py, revoke_other_sessions.py (new)
- backend/app/application/use_cases/cli_auth/__init__.py, authorize.py, token.py, device_code.py (new)
- backend/app/application/use_cases/get_current_user.py, auth_handoff_state.py
- backend/app/application/use_cases/refresh_token.py (deleted)
- backend/app/presentation/dependencies.py, handlers.py
- backend/app/presentation/api/oauth.py, account_link.py, user.py
- backend/app/presentation/api/cli_auth.py (new), user_sessions.py (new)
- backend/app/presentation/schemas/cli_token.py (new), user_sessions.py (new)
- backend/app/main.py
- backend/app/scripts/seed_e2e.py, backend/scripts/seed_mock_data.py
- scripts/e2e.sh, docker-compose.e2e.yml
- backend/tests/sessions_seed.py (new)
- backend/tests/unit/test_pkce.py, test_user_agent.py, test_user_codes.py, test_session_status.py (new); test_get_current_user.py, test_rate_limit.py, test_oauth_cli.py, test_seed_e2e.py
- backend/tests/integration/test_sessions_api.py, test_session_lifecycle.py, test_cli_pkce.py, test_device_flow.py (new); test_oauth_cli.py, test_delete_account.py, test_rate_limit.py, test_feature_gating.py, test_account_link_discord.py
- backend/CLAUDE.md, backend/CHANGELOG.md, cli/CHANGELOG.md
Pattern:
- backend/app/presentation/api/account_link.py (router)
- backend/app/domain/repositories/discord_connection_repository.py (repository)
- backend/app/application/use_cases/account_links/unlink_discord.py (use case)
- backend/app/application/use_cases/auth_handoff_state.py (Redis state, `GETDEL` one-time code)
- backend/app/core/rate_limit.py `hit` (`asyncio.timeout(0.5)`, `RedisError`/`OSError`/`TimeoutError`)
- backend/app/presentation/handlers.py `_service_unavailable_handler`
- backend/tests/integration/conftest.py (`redis_client`)
- docs/adr/0019-device-sessions-and-cli-oauth.md
Contract (K3, K4 consume):
- `GET /auth/cli/authorize?redirect_uri&code_challenge&code_challenge_method=S256&state` → 307 GitHub + `__cli_login`; 400 `{detail}`: the existing loopback messages, `"code_challenge_method must be S256"`, `"Invalid code_challenge"` (43..128 base64url). `redirect_uri` = loopback (`validate_cli_callback_url`) or literal `oob`.
- GitHub callback, PKCE login → 307 `<redirect_uri>?code&state`, or `CLI_MANUAL_REDIRECT_URI?code&state` for `oob`. Code TTL 60 s, one use.
- `POST /auth/token`, JSON on `grant_type`: `authorization_code` `{code, code_verifier, redirect_uri, device_name?}` · `refresh_token` `{refresh_token}` · `urn:ietf:params:oauth:grant-type:device_code` `{device_code}` → 200 `{access_token, token_type: "Bearer", expires_in, refresh_token, refresh_expires_in}` (refresh grant: same `refresh_token`, `refresh_expires_in` = the full window, expiry slid). 400 `{error, detail}`, `error` ∈ `invalid_grant`, `unsupported_grant_type`, `authorization_pending`, `slow_down`, `access_denied`, `expired_token`. 422 bad shape. 503 `{detail: "Session service unavailable"}`.
- `POST /auth/revoke` `{refresh_token}` → 204 always.
- `POST /auth/device/code` `{device_name?}` → 200 `{device_code, user_code, verification_uri, verification_uri_complete, expires_in: 600, interval: 10}`.
- `GET /auth/device/verify?user_code=` (signed in) → 200 `{device_name, client_label, ip, requested_at, expires_at}` · 404 `"Code not found or expired"` · 401.
- `POST /auth/device/approve` · `POST /auth/device/deny` `{user_code}` (signed in) → 204 · 404 same · 409 `"Code already used"`.
- `GET /users/me/sessions` → 200 `[{id, client_type, sign_in_method, device_name, client_label, created_ip, last_ip, created_at, last_used_at|null, expires_at, ended_at|null, status: active|signed_out|revoked|expired, current}]`. Active by `last_used_at` DESC NULLS LAST, then ended by `coalesce(ended_at, expires_at)` DESC within `SESSION_HISTORY_DAYS`. Status derived, GET writes nothing: `logout`|`replaced` → signed_out, `revoked`|`github_revoked` → revoked, open row with the key gone or past `expires_at` → expired. Live `last_used_at` / `last_ip` from Redis.
- `DELETE /users/me/sessions/{id}` → 204 (ended or expired row: no-op 204; current: also clears both cookies) · 404 `"Session not found"` (unknown or not own, admins too).
- `POST /users/me/sessions/revoke-others` → 200 `{revoked: int}`.
- Unchanged shapes: `/auth/cli/start` 201, `/auth/cli/login/{id}` 307, `/auth/cli/exchange` 200 (values now JWT with `sid` and a uuid7), `/auth/refresh` 200 `{detail: "Token refreshed"}` + Set-Cookie `__access` and `__refresh` (same value, full Max-Age) / 401 / new 503, `/auth/logout` 200.
- Every authenticated route: new 401 `"Session expired"`; new 503 `{detail: "Session service unavailable"}` + `Retry-After: 5` when Redis fails. Ids are snowflake strings.
Steps:
- T011 [US1] Base and start:
  - `git merge-base --is-ancestor 0014-release-a develop` → yes. Else stop: the owner orders the `--no-ff` merge of K1 first;
  - `git merge-base --is-ancestor 0013-release-b develop` → yes;
  - no `integration/0014-cli-device-sign-in` yet → `git switch -c integration/0014-cli-device-sign-in develop`;
  - `uv run alembic heads` → `<rev>` only.
- T012 [US1] backend/app/domain/models.py: `UserSessionModel` (BaseMixin). `__table_args__` mirror every K1 name: four CHECKs, both indexes (`ix_user_sessions_open` with `postgresql_where`, `created_at` DESC), FK `ondelete='CASCADE'`: `create_all` builds the K1 schema. No `_old` mapped, no refresh column.
- T013 [P] [US1] backend/app/config/settings.py: `DEVICE_CODE_TTL_SECONDS=600`, `DEVICE_CODE_POLL_INTERVAL_SECONDS=10`, `DEVICE_VERIFICATION_URI='http://127.0.0.1:8080/device'`, `CLI_MANUAL_REDIRECT_URI='http://127.0.0.1:8080/cli/code'`, `SESSION_HISTORY_DAYS=30`.
- T014 [P] [US3] Pure modules (new):
  - backend/app/core/pkce.py: S256 verify; a challenge is 43..128 base64url;
  - backend/app/core/user_agent.py `describe_user_agent`: browser UA → "Chrome on macOS"; `applika-cli/1.1.0 (...)` → "applika-cli 1.1.0"; httpx UA → "applika-cli (older version)"; regex, no dependency;
  - backend/app/core/user_codes.py: 8 of `BCDFGHJKLMNPQRSTVWXZ`, shown `XXXX-XXXX`, normalize case and hyphen.
- T015 [US1] Tokens (Plan corrections 5):
  - backend/app/core/tokens.py: `create_access_token(sub, sid)`, `TokenPayload.sid`, `set_access_cookie(sub, sid, response)`; remove the uuid4 refresh helpers (l.67-131); `set_refresh_cookie` and both `clear_*` stay (the value is now the uuid7);
  - delete backend/app/application/use_cases/refresh_token.py;
  - `grep -rn "applika:refresh_token" backend/app` → none (R-023: nothing reads the old keys).
- T016 [US1] [US2] Session store and its error:
  - backend/app/application/services/session_store.py (new) `SessionStore` on `REDIS_URL`, the limiter's instance:
    - `open`: refresh value `uuid.uuid7()`; one MULTI: `applika:session:<uuid7>` → session id, `applika:session:id:<sid>` hash `{rk, user_id, github_id, last_used_at, last_ip}`, both `EXAT expires_at`;
    - `resolve_refresh`, `slide` (EXPIREAT both keys), `end` (DEL both), `live_fields`;
    - `touch`: one Lua EXISTS → HSET `last_used_at`, `last_ip`, under `asyncio.timeout(0.5)`;
    - any `RedisError`, `OSError` or `TimeoutError` → `SessionServiceUnavailable`. The refresh value is never logged;
  - backend/app/core/exceptions.py: `SessionServiceUnavailable(ServiceUnavailable)`;
  - backend/app/presentation/handlers.py: its handler → 503 `{"detail": "Session service unavailable"}` + `Retry-After: 5`.
- T017 [US1] DTO and repository:
  - backend/app/application/dto/user_session.py (new; Plan corrections 12);
  - backend/app/domain/repositories/user_session_repository.py (new): `create`, `get_own(id, user_id)`, `list_for_user(user_id, since)`, `set_expiry(id, expires_at, last_used_at, last_ip)`, `end(id, reason, at, last_used_at, last_ip)` only where `ended_at IS NULL`, `list_open(user_id)`.
- T018 [US1] [US2] [US5] [US6] Use cases in backend/app/application/use_cases/sessions/ (new):
  - open_session.py: the row (`client_type`, `sign_in_method`, `device_name` = the given name ≤ 100 else `describe_user_agent`, `user_agent` ≤ 512, `created_ip` = `last_ip`, `expires_at` = now + `REFRESH_TOKEN_EXPIRE_DAYS`), then the keys; returns the access JWT (`sid` = row id), the refresh value and both lifetimes;
  - refresh_session.py: resolve → user → GitHub check as today (revoked → end `github_revoked`, 401 `GitHub token revoked`) → slide both keys and `expires_at`; copy the live `last_used_at` / `last_ip` to the row (Plan corrections 9); never rotates. Serves `GET /auth/refresh` and the `refresh_token` grant;
  - end_session.py: own id, else `ResourceNotFound('Session not found')`, admins too; already ended, past `expires_at` or key gone → no-op; else copy the live fields, DEL the keys, set `ended_at` and the reason (`logout`, `revoked`, `replaced`, `github_revoked`);
  - list_my_sessions.py: the Contract order, window, derived status and `current`; writes nothing;
  - revoke_other_sessions.py: ends every live session of the caller except the current one as `revoked`; `{revoked: n}`.
- T019 [US1] The check on every request:
  - backend/app/application/use_cases/get_current_user.py: JWT decode first (bad or expired → 401 as today); no `sid`, or a `touch` miss → 401 `Session expired`; store error → 503, never passes unchecked; sets `request.state.session_id`;
  - backend/app/presentation/dependencies.py `get_current_user` (l.419-427): `HTTPBearer(auto_error=False)` first, then `APIKeyCookie(auto_error=False)`, else 401 `Not authenticated`; new `SessionStoreDp`, `UserSessionRepositoryDp`, `CurrentSessionIdDp`;
  - backend/app/presentation/api/account_link.py l.100: the callback's `GetCurrentUserUseCase` gets the store.
- T020 [US1] [US6] backend/app/presentation/api/oauth.py:
  - callback web branch (l.186-188): `OpenSessionUseCase` `github_web` (the browser's UA and IP); a valid same-user `__refresh` session ends as `replaced`. Web branch only: the CLI branches never end the browser's own session (Plan corrections 13);
  - `_build_auth_handoff_response` branches on `flow='pkce'`: the code is bound to the challenge and `redirect_uri`; `oob` → `CLI_MANUAL_REDIRECT_URI?code&state`. The legacy branch is unchanged;
  - `/auth/cli/exchange` (l.193-225): opens a `cli_legacy` session (the exchange request's UA and IP); same JSON shape;
  - `/auth/refresh` (l.228-244): `RefreshSessionUseCase`; re-sets `__access` (with `sid`) and `__refresh` (same value, full Max-Age), as `__access` is re-set today; 401 / 503;
  - `/auth/logout` (l.247-259): ends the session as `logout`, clears both cookies, 200 as today;
  - `/auth/cli/start`, `/auth/cli/login/{login_id}`, `/auth/cli/exchange`: `deprecated=True` in OpenAPI.
- T021 [US3] [US4] [US7] CLI sign-in routes:
  - backend/app/application/use_cases/auth_handoff_state.py: optional `flow`, `code_challenge`, `redirect_uri` on the login and code state; codes stay `GETDEL` (one use, 60 s);
  - backend/app/application/use_cases/cli_auth/ (new): authorize.py; token.py (three grants; a verifier or `redirect_uri` mismatch → `invalid_grant`); device_code.py (start, verify, approve, deny; poll answers `authorization_pending`, `slow_down` when polled faster than `interval`, `access_denied`, `expired_token`; approved → one `cli_device` session signed in as the approver; one use);
  - backend/app/presentation/api/cli_auth.py (new, router `/auth`) + backend/app/presentation/schemas/cli_token.py (new): every Contract route above.
- T022 [US1] [US2] [US5] backend/app/presentation/api/user_sessions.py (new, router `/users/me/sessions`) + backend/app/presentation/schemas/user_sessions.py (new): `GET`, `DELETE /{id}` (current: clears both cookies), `POST /revoke-others`. backend/app/main.py includes both new routers. No `require_feature`, no `add_slash_twins` (owner exception).
- T023 [US1] Account delete and the limiter:
  - backend/app/presentation/api/user.py `delete_me`: end every open session (DEL keys) before the user delete (R-008); rows go by CASCADE;
  - backend/app/core/rate_limit.py `subject_for(headers, cookies, host)`: Bearer, then `__access`, then IP; backend/app/config/rate_limit.py passes the headers. The limiter stays fail open.
- T024 [US6] Seeds and stacks:
  - backend/app/scripts/seed_e2e.py: `mint_session` through `OpenSessionUseCase` (`github_web`) for the three users; one more `cli_device` session for `e2e-user` (device "e2e-cli"); payload + `cli_access_token`, `cli_refresh_token`; docstring l.19-30;
  - scripts/e2e.sh: export `E2E_CLI_ACCESS_TOKEN`, `E2E_CLI_REFRESH_TOKEN`;
  - docker-compose.e2e.yml `x-api-environment`: `DEVICE_VERIFICATION_URI: http://127.0.0.1:8180/device`, `CLI_MANUAL_REDIRECT_URI: http://127.0.0.1:8180/cli/code` (Plan corrections 7);
  - backend/scripts/seed_mock_data.py: header note only (a pasted `__access` carries `sid`).
- T025 [P] [US1] Unit tests:
  - new: tests/unit/test_pkce.py, test_user_agent.py, test_user_codes.py, test_session_status.py;
  - tests/unit/test_get_current_user.py rewritten: Bearer before cookie; no `sid` → 401; touch miss → 401 `Session expired`; `RedisError` and timeout → 503, never the user;
  - tests/unit/test_rate_limit.py: Bearer subject; `create_access_token(sub, sid)` (l.73);
  - tests/unit/test_oauth_cli.py (l.112-144) off `create_refresh_token`; tests/unit/test_seed_e2e.py: session keys (l.269-283), eleven contract keys (l.286) (Plan corrections 4).
- T026 [P] [US1] [US2] [US3] [US4] [US5] [US6] [US7] Integration tests on `redis_client`:
  - tests/integration/test_sessions_api.py (new): order, history window, `current`, revoke, ended or expired no-op, revoke-others count, other user's id 404, admins too;
  - tests/integration/test_session_lifecycle.py (new): callback row + keys; refresh slides both keys' TTL, `expires_at` and the `__refresh` Max-Age; logout; revoke → next call 401; JWT without `sid` → 401; legacy uuid4 key → 401; re-login → `replaced`; GitHub revoked; lost key → expired; last used copied on refresh and on end; Redis down → 503 on an authenticated route and on `/auth/refresh`;
  - tests/integration/test_cli_pkce.py (new): S256 only, bad challenge 400, `oob` redirect, one-time code, verifier mismatch `invalid_grant`; tests/integration/test_device_flow.py (new): pending, slow_down, denied, expired, one-time, signed in as the approver, verify 404 and 401, approve twice 409;
  - tests/integration/test_oauth_cli.py: legacy shapes unchanged, `cli_legacy` row, cookie refresh works; test_delete_account.py: keys gone; test_rate_limit.py (l.143-144): Bearer counts per user;
  - real-cookie tests open a real session through tests/sessions_seed.py (new): test_feature_gating.py l.456, test_account_link_discord.py `_cookie_for` l.143-145, test_delete_account.py l.145 (Plan corrections 3).
- T027 [US1] Docs and changelogs:
  - backend/CLAUDE.md: Authentication (one session per sign-in, uuid7 refresh value, `sid`, Bearer, fail closed, sliding, the cutover), OAuth table + the new routes, Users table + `/users/me/sessions*`, Exception Handling (`SessionServiceUnavailable` 503 + `Retry-After`), Rate limiting subject, Environment Variables, Domain `UserSession`, Seed Script Rule;
  - backend/CHANGELOG.md `## [Unreleased]` Added / Changed / Deprecated, each line `- …`;
  - cli/CHANGELOG.md `## [Unreleased]` (changelogs rule 3): every user signs in again at the release; the access token carries `sid`; sliding 7-day expiry and `__refresh` re-set on `GET /auth/refresh`; new 401 `Session expired`; new 503 `Session service unavailable` + `Retry-After: 5` on every authenticated route (0.1.4, 0.2.0, 1.0.0 and 1.0.1 print it and keep the session; a refresh 503 still clears it); `/auth/cli/*` deprecated, shapes unchanged; the new routes.
- T028 [US1] Checks, gate, close:
  - `uv run pytest tests -k "steps or finalize or supports"`; `make test` in cli;
  - `grep -rn "require_feature\|FeatureKey" backend/app/presentation/api/user_sessions.py backend/app/presentation/api/cli_auth.py` → none;
  - `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; changed files clean), `uv run pytest . --cov=app` (≥ 90%);
  - full `scripts/e2e.sh` green (every spec now on real device sessions); no applika-e2e container left;
  - Not a merge point.
AC:
- The system gives each sign-in its own session. One browser sign-in or one CLI sign-in is one device.
- The system makes a session's refresh value a random UUIDv7 and uses that same value as the session's key in the Redis instance the rate limiter uses. The web app carries it in the refresh cookie.
- The system keeps the access token a short-lived JWT.
- The system ends a session 7 days after its last refresh: each refresh, web or CLI, pushes the end 7 days ahead, so a device in use stays signed in and a device not refreshed for 7 days is signed out. A session whose Redis key has expired or been deleted is ended: refreshing it fails, and the device's next request fails.
- The system checks on every signed-in request that the request's session still exists, so a revoked device is refused on its next request. When the check cannot reach Redis, the system refuses the request with a temporary error and signs nobody out; a request never goes through unchecked.
- The system keeps each device's details and history in the database, so ended devices stay visible.
- The system re-checks the GitHub token when a session is refreshed, as today, and ends the session when GitHub has revoked it.
- The system ends every session of an account at once when the account is deleted.
- The system lists the caller's devices, web and CLI, each with device name, IP address (last seen and at sign-in), when access was granted, when it was last used, the client (browser and system, or CLI version), how it signed in, when it expires, and its status.
- The system marks the device the user is looking from as "This device".
- The system lets the user revoke any one of their active devices, after a confirmation.
- The system lets the user sign out all their other devices in one action, after a confirmation.
- The system shows ended devices with how they ended (signed out, revoked, expired).
- The system shows the Devices tab and the CLI sign-in to every user at release. Nothing in this feature is behind a beta flag.
- The system signs `applika login` in through a browser authorization protected by PKCE, which returns to a local callback on the user's machine, and gives the CLI a session of its own.
- The system signs `applika login --device` in with a device code: the CLI shows a short code and a web address, the user approves on a browser where they are signed in, and the CLI receives a session of its own.
- The system shows the requesting device's name, IP address and request time on the approval page, and lets the user approve or deny.
- The system lets the user paste a code shown in the browser into the CLI when the browser cannot reach the local callback.
- The system takes the new CLI's access token from an `Authorization: Bearer` header.
- The system names a CLI device after the machine's host name unless the user gives a name.
- The system ends the CLI's own session on the server when the user runs `applika logout`.
- The system ends every existing session at the release that turns this on; web and CLI users sign in again.
- The system keeps installed `applika-cli` 0.1.4, 0.2.0, 1.0.0 and 1.0.1 working: they sign in through the existing browser handoff, refresh through cookies, and appear in the device list.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- When the model changes under such a route, keep the route and translate the old payload to the new model in a compatibility layer. Mark the route deprecated in OpenAPI. (.claude/rules/cli-compatibility.md 2)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)
- An agent never runs anything against production. (.claude/rules/prod-release-runbook.md 5)

## K3 — Web: Devices tab in the profile, /device approval page, /cli/code page, devices E2E   side: frontend (+ E2E)   covers: R-005 (web: a 503 signs nobody out), R-009, R-010 (UI), R-011 (UI), R-012 (UI), R-013 (UI), R-014 (UI), R-015 (UI), R-017 (approval page), R-018 (UI), R-019 (code page)   deps: K2
Goal: The profile gets a Devices tab (list, revoke, sign out all other devices), the web gets /device for device-code approval and /cli/code for the paste code, and a 503 never signs the web out.
Owner's words: "i would like to implement the same authentication flow used in claude cli and implement in applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost of devices connected and a section to revoke the access, this must be displayed in a new tab inside user profile, losting the device name, ip, when was granted access, last time accessed and more." "i also want to instead of returning the refresh token in jwt, save it in the redis instance used by the rate limiter, the access token cookie value now will become an random uuid7 value, the same one used as key in the redis, if the redis key expire, this mean the session also expired, i also want to list the devices connected by the frontend app in the profile"
Clarified: "Instant (Recommended)"; "Gate nothing" (Devices tab visible to everyone at release); "Fail closed" (the web retries a 503 on its auth and profile queries, as it does a 429). Assumptions: the Devices tab sits beside a "Profile" tab that holds today's profile content; ended devices are listed for 30 days after they end; revoking "This device" signs the user out.
Covers: R-005 (web), R-009, R-010 (UI), R-011 (UI), R-012 (UI), R-013 (UI), R-014 (UI), R-015 (UI), R-017 (approval page), R-018 (UI), R-019 (code page)
Release: B. Plan: docs/plan/0014-cli-device-sign-in-and-devices.md `## Frontend (B)`, `## Tests` (Frontend vitest, E2E). Tasks: docs/plan/0014-cli-device-sign-in-and-devices.tasks.md (Plan corrections 6, 8, 12)
Touch:
- frontend/src/services/types/sessions.ts (new), services/interfaces/i-session-service.ts (new), services/implementations/session-service.ts (new), services/services.ts
- frontend/src/services/implementations/auth-service.ts, services/interfaces/i-auth-service.ts, services/types/auth.ts
- frontend/src/hooks/use-sessions.ts (new)
- frontend/src/lib/rate-limit.ts, lib/rate-limit.test.ts
- frontend/src/contexts/auth-context.tsx, contexts/auth-context.test.tsx
- frontend/src/hooks/use-user.ts, hooks/use-user.test.tsx
- frontend/src/app/(protected)/profile/profile-page.tsx, profile-page.test.tsx
- frontend/src/components/profile/devices-tab.tsx (new), devices-tab.test.tsx (new), device-row.tsx (new)
- frontend/src/app/(protected)/device/page.tsx (new), device-page.tsx (new), device-page.test.tsx (new)
- frontend/src/app/(protected)/layout.tsx, layout.test.tsx (new)
- frontend/src/app/cli/code/page.tsx (new), cli-code-page.tsx (new), cli-code-page.test.tsx (new)
- frontend/e2e/devices.spec.ts (new), e2e/smoke.spec.ts, e2e/auth-guard.spec.ts, e2e/support/auth.ts
- frontend/CLAUDE.md
Pattern:
- frontend/src/components/profile/connected-accounts.tsx + hooks/use-account-links.ts (card, badge, AlertDialog confirm)
- frontend/src/app/(protected)/profile/profile-page.tsx (lazy `useState` from search params, one-shot `useRef`)
- frontend/src/app/(protected)/applications/applications-page.tsx (`Tabs` `variant="line"`)
- frontend/src/app/(protected)/cvs/editor/page.tsx (Suspense shell for `?query=`); frontend/src/app/login/ (a route outside the groups)
- frontend/src/lib/rate-limit.ts, contexts/auth-context.tsx (429 retry, never a sign-out)
- frontend/e2e/profile-discord.spec.ts, e2e/support/auth.ts (`loginAs`, `apiUrl`)
- frontend/CLAUDE.md "### UI Components", "### Profile — connected accounts", "### Auth & Token Refresh", "### Routing"; ADR-0006 tokens; ui-designer
Contract (from K2): `GET /users/me/sessions`; `DELETE /users/me/sessions/{id}` → 204 | 404 `"Session not found"`; `POST /users/me/sessions/revoke-others` → `{revoked}`; `GET /auth/device/verify?user_code=` → `{device_name, client_label, ip, requested_at, expires_at}` | 404 `"Code not found or expired"`; `POST /auth/device/approve|deny` `{user_code}` → 204 | 404 | 409 `"Code already used"`; any authenticated route 503 `{detail: "Session service unavailable"}` + `Retry-After: 5`; `/cli/code?code=&state=` is reached by the API's 307.
Steps:
- T029 [US1] Build on integration/0014-cli-device-sign-in, after the K2 tip.
- T030 [US1] Types and services:
  - frontend/src/services/types/sessions.ts (new): `UserSession`, `SessionStatus`, `RevokeOthersResult`;
  - services/interfaces/i-session-service.ts, services/implementations/session-service.ts (new): `list()`, `revoke(id)`, `revokeOthers()`; registered in services/services.ts;
  - auth-service.ts, i-auth-service.ts, types/auth.ts: `verifyDeviceCode`, `approveDeviceCode`, `denyDeviceCode`, `DeviceCodeInfo`.
- T031 [US1] [US2] [US5] frontend/src/hooks/use-sessions.ts (new): `useSessions` (key `['sessions']`), `useRevokeSession`, `useRevokeOtherSessions`; invalidate on success; `toast.error(rateLimitNotice(error) ?? "Failed to revoke device")`. Revoking the current one → `window.location.assign("/login")` (Plan corrections 6).
- T032 [US1] A 503 is temporary:
  - frontend/src/lib/rate-limit.ts: `isTemporary(error)` = 429 or 503; `retryAfterMs` reads `Retry-After` for both;
  - contexts/auth-context.tsx (l.49-50) and hooks/use-user.ts (l.20-21) retry on `isTemporary`, so a 503 never signs the web out;
  - other queries: the `getApiError` toast shows the 503 `detail`.
- T033 [US1] frontend/src/app/(protected)/profile/profile-page.tsx: `Tabs` `variant="line"`, "Profile" (today's content: `ProfileView`, the edit form, the Discord notice) and "Devices"; `?tab=devices` read once by a lazy `useState`.
- T034 [US1] [US2] [US5] frontend/src/components/profile/devices-tab.tsx + device-row.tsx (new), ui-designer, ADR-0006 tokens:
  - Active, then "Ended (last 30 days)"; empty state;
  - a row: name, client label, how it signed in, last IP (sign-in IP secondary), granted, last used, expires, status badge in words, "This device" badge;
  - "Revoke" → AlertDialog ("Revoke access" / "Cancel"); the current row's "Sign out" → the same confirm → `/login` (Plan corrections 6);
  - "Sign out all other devices" → AlertDialog;
  - an ended row says how it ended: Signed out, Revoked, Expired;
  - no `useHasFeature`, `FeatureGate` or nav `feature` (owner exception).
- T035 [US4] frontend/src/app/(protected)/device/page.tsx (Suspense) + device-page.tsx (new):
  - code input `XXXX-XXXX`, prefilled from `?code=`; "Continue" → verify;
  - card: device name, IP, requested at, "Only approve if you started this sign-in yourself"; "Approve" / "Deny";
  - done → "Device signed in. You can return to your terminal." + a link to `/profile?tab=devices`;
  - 404 and 409 show the server's `detail`.
- T036 [US4] frontend/src/app/(protected)/layout.tsx return-to: a signed-out visit to `/device` stores path + query in `sessionStorage['applika:return-to']` before `router.replace("/login")`; once authenticated, consume it once and `router.replace` to it (it must start with `/`, never `//`).
- T037 [US7] frontend/src/app/cli/code/page.tsx (Suspense) + cli-code-page.tsx (new), outside the groups like `/login`, no auth: shows `<code>#<state>` read-only, "Copy", "Paste this code into your terminal".
- T038 [P] [US1] [US2] [US4] [US5] [US7] Vitest:
  - components/profile/devices-tab.test.tsx (new): both lists, every field, "This device", status words, revoke confirm and Cancel, sign out others, current row → `/login`, empty;
  - app/(protected)/device/device-page.test.tsx (new): prefill, verify card, approve, deny, 404 and 409 words;
  - app/cli/code/cli-code-page.test.tsx (new): `code#state`, Copy, missing params;
  - app/(protected)/profile/profile-page.test.tsx: both tabs, `?tab=devices` opens Devices;
  - app/(protected)/layout.test.tsx (new): return-to stored, consumed once, `//` refused;
  - lib/rate-limit.test.ts: `isTemporary`, 503 `Retry-After`; contexts/auth-context.test.tsx + hooks/use-user.test.tsx: a refresh or `/users/me` 503 keeps the user signed in and retries after the wait (Plan corrections 8).
- T039 [US1] [US2] [US4] E2E on the real stack:
  - frontend/e2e/devices.spec.ts (new), serial:
    - (1) `e2e-user` → `/profile` → Devices → "This device" + the seeded CLI row → Revoke → `GET /api/users/me` with `Authorization: Bearer <E2E_CLI_ACCESS_TOKEN>` → 401;
    - (2) API `POST /auth/device/code` → `verification_uri_complete` → Approve → device grant 200 → the row is listed;
    - (3) signed out, `/device?code=<code>` → `/login`; `loginAs` → `/dashboard` → lands on `/device` with the code filled in;
  - e2e/support/auth.ts: `cliBearerHeader()`;
  - e2e/smoke.spec.ts: `/device` (user, h1) and `/cli/code` (anon) → `toHaveLength(22)`; e2e/auth-guard.spec.ts `PROTECTED_PATHS` + `/device` (Plan corrections 8).
- T040 [US1] frontend/CLAUDE.md: "### Profile — Devices" (tabs, rows, confirms, `/login` on the current row, query key); Routing (`/device`, `/cli/code`, the return-to); "### Auth & Token Refresh" (a 503 is temporary, `isTemporary`); E2E (devices.spec.ts, the seeded CLI session).
- T041 [US1] Gate, close:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend;
  - full `scripts/e2e.sh` green; no applika-e2e container, network or volume left;
  - Not a merge point.
AC:
- The system checks on every signed-in request that the request's session still exists, so a revoked device is refused on its next request. When the check cannot reach Redis, the system refuses the request with a temporary error and signs nobody out; a request never goes through unchecked.
- The system shows a new "Devices" tab in the user profile, beside the existing profile content.
- The system lists the caller's devices, web and CLI, each with device name, IP address (last seen and at sign-in), when access was granted, when it was last used, the client (browser and system, or CLI version), how it signed in, when it expires, and its status.
- The system marks the device the user is looking from as "This device".
- The system lets the user revoke any one of their active devices, after a confirmation.
- The system lets the user sign out all their other devices in one action, after a confirmation.
- The system shows ended devices with how they ended (signed out, revoked, expired).
- The system shows the Devices tab and the CLI sign-in to every user at release. Nothing in this feature is behind a beta flag.
- The system signs `applika login --device` in with a device code: the CLI shows a short code and a web address, the user approves on a browser where they are signed in, and the CLI receives a session of its own.
- The system shows the requesting device's name, IP address and request time on the approval page, and lets the user approve or deny.
- The system lets the user paste a code shown in the browser into the CLI when the browser cannot reach the local callback.
- Playwright runs against the real stack: the built API, the built frontend, a real Postgres and a real Redis, migrated with `alembic upgrade head`. No mocked API. (.claude/rules/quality-gates.md)

## K4 — applika-cli 1.1.0: own session by PKCE login, --manual paste, --device code, Bearer, logout revokes   side: cli   covers: R-016 (CLI), R-017 (CLI), R-019 (CLI), R-020 (CLI), R-021 (CLI), R-022 (CLI)   deps: K2
Goal: Ship applika-cli 1.1.0 with a session of its own (PKCE loopback, --manual paste, --device code), Bearer auth and a server-side logout, as Release C on its own branch.
Owner's words: "i would like to implement the same authentication flow used in claude cli and implement in applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost of devices connected and a section to revoke the access, this must be displayed in a new tab inside user profile, losting the device name, ip, when was granted access, last time accessed and more."
Clarified: "Both" (PKCE loopback by default, paste-code fallback, `applika login --device` for headless; the CLI gets its own session sent as `Authorization: Bearer`); "Fail closed" (CLI 1.1.0 keeps its session on a 503, on any route and on refresh). Assumptions: a device code is 8 letters shown as XXXX-XXXX, lasts 10 minutes, and the CLI polls every 10 seconds.
Covers: R-016 (CLI), R-017 (CLI), R-019 (CLI), R-020 (CLI), R-021 (CLI), R-022 (CLI)
Release: C, tag `0014-release-c`. Plan: docs/plan/0014-cli-device-sign-in-and-devices.md `## CLI (C)`, `## Contract`, `## Tests` (CLI). Tasks: docs/plan/0014-cli-device-sign-in-and-devices.tasks.md (Plan corrections 10, 11)
Touch:
- cli/src/applika/lib/pkce.py (new), lib/device_flow.py (new)
- cli/src/applika/lib/api.py
- cli/src/applika/commands/auth.py
- cli/tests/test_pkce.py (new), test_device_flow.py (new), test_api.py, test_commands.py
- cli/pyproject.toml, cli/uv.lock
- cli/CHANGELOG.md, cli/CLAUDE.md, cli/README.md, cli/src/applika/skills/applika-cli/SKILL.md
- .claude/rules/cli-compatibility.md (workspace root, outside git; one line)
Pattern:
- cli/src/applika/lib/loopback.py (reused for the callback)
- cli/tests/test_api.py (`httpx.MockTransport`, `SessionStore(tmp_path / 'session.json')`)
- cli/src/applika/lib/api.py `_refresh` (the 1.0.1 429 path, feature 0011)
- cli/CHANGELOG.md `## [1.0.1] - 2026-09-27` (heading shape)
- docs/adr/0019-device-sessions-and-cli-oauth.md
Contract (from K2): `GET /auth/cli/authorize?redirect_uri&code_challenge&code_challenge_method=S256&state` (loopback or `oob`) → callback `?code&state` (60 s, one use); `POST /auth/token` (`authorization_code` `{code, code_verifier, redirect_uri, device_name?}`, `refresh_token` `{refresh_token}`, `urn:ietf:params:oauth:grant-type:device_code` `{device_code}`) → `{access_token, token_type, expires_in, refresh_token, refresh_expires_in}` | 400 `{error, detail}` | 503; `POST /auth/device/code` `{device_name?}` → `{device_code, user_code, verification_uri, verification_uri_complete, expires_in, interval}`; `POST /auth/revoke` `{refresh_token}` → 204; every route may answer 401 `Session expired`, 429, 503 `{detail}` + `Retry-After`.
Steps:
- T042 [US3] Branch: K5 done and `0014-release-b` tagged → stay on `integration/0014-cli-device-sign-in` (`<K4 branch>`).
- T043 [P] [US3] cli/src/applika/lib/pkce.py (new): verifier `secrets.token_urlsafe(64)`, S256 challenge.
- T044 [P] [US4] cli/src/applika/lib/device_flow.py (new): start; print `user_code` and `verification_uri` (+ the complete URI); poll at `interval`; `authorization_pending` → keep polling; `slow_down` → interval + 5 s; 429 → wait `Retry-After`, keep polling; `expired_token` → exit 1, run login again; `access_denied` → exit 1, the sign-in was denied.
- T045 [US3] cli/src/applika/lib/api.py:
  - `Authorization: Bearer`, no cookies; UA `applika-cli/<version> (<platform.system()>)`;
  - `_refresh` → `POST /auth/token` `refresh_token` grant; 429 or 503 keeps `session.json` and raises `ApiError(detail, status)`; any other non-200 clears it;
  - a 503 on any other route → `ApiError`, no refresh, session kept;
  - `logout` → `POST /auth/revoke`, then clear (errors ignored);
  - cli/src/applika/lib/session.py: shape unchanged (four keys); an old CLI reads a 1.1.0 file (the JWT works as the `__access` cookie, the uuid7 on `GET /auth/refresh`).
- T046 [US3] [US4] [US7] cli/src/applika/commands/auth.py `login [--device] [--manual] [--device-name TEXT]`:
  - device name default `socket.gethostname()`, ≤ 100;
  - an existing session is ended first (revoke, errors ignored);
  - default: PKCE through `lib/loopback.py` and `GET /auth/cli/authorize`; `--manual`: `redirect_uri=oob`, prompt for the `code#state` shown in the browser, state checked; `--device`: `lib/device_flow.py`;
  - then `POST /auth/token`; prints `Logged in as <username> on <device_name>`;
  - `logout` revokes on the server, then clears. No old command or flag changes (cli-compatibility rule 4).
- T047 [P] [US3] [US4] [US7] Tests (`httpx.MockTransport`):
  - cli/tests/test_pkce.py (new): verifier length, S256 vector;
  - cli/tests/test_device_flow.py (new): pending, slow_down +5 s, 429 waits `Retry-After`, expired exit 1, denied exit 1;
  - cli/tests/test_api.py: Bearer and no cookie; refresh through `/auth/token`; 429 and 503 keep the session; another refresh failure clears it; a 503 on a route keeps it; a 1.0.1 session file loads;
  - cli/tests/test_commands.py: `--device`, `--manual`, `--device-name`, the host-name default, re-login revokes first, logout revokes.
- T048 [US3] Version and docs:
  - cli/pyproject.toml `version = "1.1.0"`; `uv lock`; `uv sync && uv run applika --version` → `1.1.0`;
  - cli/CHANGELOG.md: under `## [Unreleased]` add `### Added` `- …` (login by PKCE with its own session, `--manual`, `--device`, `--device-name`, Bearer, logout revokes on the server, 503 keeps the session); rename that section `## [1.1.0] - <date of this commit>` (it takes K2's entries with it); a new empty `## [Unreleased]` above; the heading matches `pyproject.toml`;
  - cli/CLAUDE.md (`auth.py` flags, `lib/pkce.py`, `lib/device_flow.py`, Bearer); cli/README.md l.52-56 login (Plan corrections 10); cli/src/applika/skills/applika-cli/SKILL.md login section;
  - .claude/rules/cli-compatibility.md: one line naming the routes 1.1.0 calls (Plan corrections 11).
- T049 [US3] Checks, gate, close:
  - `git diff integration/0014-cli-device-sign-in...<K4 branch> --name-only` → only `cli/`;
  - cli-compatibility rule 4: every 1.0.1 command and flag still parses (`applika --help`, `applika login --help`);
  - `make format && make lint && make test` in cli; the changelogs verify command;
  - annotated tag `0014-release-c` on the K4 tip (local);
  - The owner merges C only after B is live.
AC:
- The system signs `applika login` in through a browser authorization protected by PKCE, which returns to a local callback on the user's machine, and gives the CLI a session of its own.
- The system signs `applika login --device` in with a device code: the CLI shows a short code and a web address, the user approves on a browser where they are signed in, and the CLI receives a session of its own.
- The system lets the user paste a code shown in the browser into the CLI when the browser cannot reach the local callback.
- The system takes the new CLI's access token from an `Authorization: Bearer` header.
- The system names a CLI device after the machine's host name unless the user gives a name.
- The system ends the CLI's own session on the server when the user runs `applika logout`.
- New capabilities ship in a new CLI version with new commands. The old commands keep working. (.claude/rules/cli-compatibility.md 4)
- Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). New entries go under `## [Unreleased]` with `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`. The CLI's version heading matches `cli/pyproject.toml` when it is released. (.claude/rules/changelogs.md 4)

## K5 — Closing 0014: full gate, E2E, ADRs, walk, Release B   side: both   covers: — (closing; T056 guards the release split)   deps: K3, K4
Goal: Prove 0014 whole: full gate in CLAUDE.md order, target gates, E2E, ADRs, a by-hand walk on a real stack, and tag Release B. No new feature work.
Owner's words: "i would like to implement the same authentication flow used in claude cli and implement in applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost of devices connected and a section to revoke the access, this must be displayed in a new tab inside user profile, losting the device name, ip, when was granted access, last time accessed and more." "i also want to instead of returning the refresh token in jwt, save it in the redis instance used by the rate limiter, the access token cookie value now will become an random uuid7 value, the same one used as key in the redis, if the redis key expire, this mean the session also expired, i also want to list the devices connected by the frontend app in the profile"
Clarified: success signals: a revoked device gets 401 on its next request, web and CLI; new CLI sign-ins by browser and by device code appear with their method and device name; installed CLI 0.1.4 to 1.0.1 sign in again after the release and work; device-code polling causes no 429 on `/auth/*` at default limits; every active device has a live session and every live session a device row; a Redis outage signs nobody out of the web app or CLI 1.1.0 and lets no revoked device through.
Covers: — (closing)
Release: B, tag `0014-release-b`. Plan: docs/plan/0014-cli-device-sign-in-and-devices.md. Tasks: docs/plan/0014-cli-device-sign-in-and-devices.tasks.md (Plan corrections 14)
Touch:
- docs/adr/0002-github-oauth-sole-login.md, docs/adr/0015-redis-api-rate-limiter.md (status line pointer), docs/adr/0018-beta-features-registry-and-allowlist.md (dated note under Consequences)
- docs/adr/0019-device-sessions-and-cli-oauth.md (a dated as-built note under Consequences, only where the build departs)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; docs/plan/0013-beta-features.tasks.md K5
Contract: none new.
Steps:
- T050 On integration/0014-cli-device-sign-in. Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T051 Target gates (.claude/rules/quality-gates.md):
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (no new diagnostics vs `develop`, ceiling 171; every file K2 touched clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test` here, and again on `<K4 branch>` (1.1.0).
- T052 Full `scripts/e2e.sh` (`devices.spec.ts` + every older spec). Confirm the `e2e` job in .github/workflows/frontend-ci.yaml runs it. Cheaper layers carry what the E2E does not:
  - Redis down → 503 and nobody signed out, sliding expiry, lost key → expired, GitHub revoked, re-login `replaced`: test_session_lifecycle.py;
  - PKCE, `oob`, one-time codes: test_cli_pkce.py; device-code states: test_device_flow.py;
  - list order, window, ownership 404: test_sessions_api.py;
  - installed CLIs: test_oauth_cli.py + `uv run pytest tests -k "steps or finalize or supports"` + the T055 walk;
  - CLI 1.1.0: cli tests on `<K4 branch>` + the T055 walk;
  - the migration round trip: test_migration_user_sessions.py.
- T053 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty;
  - no network or volume from docker-compose.e2e.yml; no testcontainers Postgres or Redis left;
  - the owner's dev containers untouched; `git switch integration/0014-cli-device-sign-in` after any walk on the K4 branch.
- T054 ADRs and rules:
  - ADR-0019 reads Accepted; its Decision matches the build (uuid7 key, `sid` = row id, fail closed 503, sliding, Bearer, one token endpoint, legacy kept, limiter subject, no gate). A departure → a dated as-built note under Consequences; the Decision untouched;
  - ADR-0002 and ADR-0015 status lines gain "Amended by ADR-0019 on 2026-10-15"; ADR-0018 gets a dated note under Consequences naming the 0014 exception (Plan corrections 14); 0004 and 0009 read Accepted;
  - `grep -rn "_old" backend/app/` → none; `op.drop_` only in `downgrade()` of `<rev>`; `uv run pytest tests/integration -k migration`;
  - the changelogs verify command; both changelogs carry K2's CLI-facing entries;
  - the commit-format verify on `develop..integration/0014-cli-device-sign-in` and on `<K4 branch>` → no output;
  - `git diff develop -- backend/app/core/features.py` empty (no gate).
- T055 Walk by hand on a real stack: the dev compose stack with the owner's GitHub OAuth app (the e2e stack has dummy GitHub keys; `KEEP_STACK=1 scripts/e2e.sh` is fine for the device code and the list). `ACCESS_TOKEN_EXPIRE_MINUTES=1` to see refreshes. Both themes, desktop and 390px:
  - cutover (R-023): a web session and a `uvx applika-cli==1.0.1 login` made on the dev stack built from `develop` → rebuild on this branch → both get 401 and sign in again;
  - web sign-in → Devices: This device, every field, IPs real; sign in again in the same browser → the earlier row Signed out; a second browser → revoke it → its next request 401 → login; revoke This device → `/login`; Sign out all other devices;
  - CLI 1.1.0 from `<K4 branch>` (`cd cli && uv run applika --api-base-url <api> login`): PKCE → row `cli_browser` named after the host; `--manual` paste; `--device` approve, deny, a wrong code on `/device`, a code left 10 minutes; signed out on `/device?code=` → back with the code; re-login ends the previous CLI row; `applika logout` → Signed out; no 429 while polling;
  - installed CLIs: `uvx applika-cli==1.0.1 login`, `whoami`, `applications list`; `uvx applika-cli==0.1.4 applications list` → row "applika-cli (older version)", `cli_legacy`; refresh through cookies works past the access lifetime;
  - stop Redis → web shows the temporary error and stays signed in; CLI 1.1.0 keeps its session; a revoked device stays refused; start Redis → all work again;
  - delete a throwaway account → its session keys gone.
- T056 Release guards:
  - `git merge-base --is-ancestor 0014-release-a integration/0014-cli-device-sign-in` → yes; `git merge-base --is-ancestor 0013-release-b integration/0014-cli-device-sign-in` → yes;
  - `git diff develop...integration/0014-cli-device-sign-in -- cli/src cli/pyproject.toml` empty: B carries no CLI source;
  - `git diff integration/0014-cli-device-sign-in...<K4 branch> --name-only` → only `cli/`;
  - the agent never touches `main`.
- T057 Record at close:
  - tag the K5 tip `0014-release-b` (local);
  - the owner steps of `### Releases`: B after A's `alembic upgrade head` is confirmed, the two env vars, the announcement, `FORWARDED_ALLOW_IPS`; C only after B is live; rollback C, B, then A;
  - the agent never touches prod.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty with no new diagnostics and changed files clean, coverage ≥ 90%, prettier, tsc), and the CLI gate on the Release C branch.
- Every ADR the feature drafted reads Accepted (ADR-0019, Accepted 2026-10-15; bound 0002, 0004, 0009, 0015, 0018 Accepted; 0002 and 0015 point at 0019).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (devices.spec.ts, the whole suite green via scripts/e2e.sh) runs inside the gate and is green; Redis outage, PKCE, device-code states, installed CLIs, CLI 1.1.0 and the migration round trip are carried by the cheaper layers named in T052.
- By-hand walk of the feature on a real stack done, including the cutover and the success signals (revoked device 401 on web and CLI, new CLI rows with method and name, installed 0.1.4 and 1.0.1 sign in again and work, no 429 while polling, a Redis outage signs nobody out and lets no revoked device through).
- No new feature work.

## Table
| K | title | side | covers | deps | release |
|---|---|---|---|---|---|
| K1 | Release A: user_sessions table and its round-trip test | backend | R-006 | — | A, tag `0014-release-a` |
| K2 | Backend: device sessions in Redis, session check on every request, devices API, CLI sign-in routes | backend | R-001, R-002, R-003, R-004, R-005, R-006, R-007, R-008, R-010, R-011, R-012, R-013, R-014, R-015, R-016, R-017, R-018, R-019, R-020, R-021, R-022, R-023, R-024 | K1 | B |
| K3 | Web: Devices tab in the profile, /device approval page, /cli/code page, devices E2E | frontend (+ E2E) | R-005, R-009, R-010, R-011, R-012, R-013, R-014, R-015, R-017, R-018, R-019 | K2 | B |
| K4 | applika-cli 1.1.0: own session by PKCE login, --manual paste, --device code, Bearer, logout revokes | cli | R-016, R-017, R-019, R-020, R-021, R-022 | K2 | C, tag `0014-release-c` |
| K5 | Closing 0014: full gate, E2E, ADRs, walk, Release B | both | — | K3, K4 | B, tag `0014-release-b` |

## Matrix
| R | K |
|---|---|
| R-001 | K2 |
| R-002 | K2 |
| R-003 | K2 |
| R-004 | K2 |
| R-005 | K2, K3 |
| R-006 | K1, K2 |
| R-007 | K2 |
| R-008 | K2 |
| R-009 | K3 |
| R-010 | K2, K3 |
| R-011 | K2, K3 |
| R-012 | K2, K3 |
| R-013 | K2, K3 |
| R-014 | K2, K3 |
| R-015 | K2, K3 (K5 T054 checks) |
| R-016 | K2, K4 |
| R-017 | K2, K3, K4 |
| R-018 | K2, K3 |
| R-019 | K2, K3, K4 |
| R-020 | K2, K4 |
| R-021 | K2, K4 |
| R-022 | K2, K4 |
| R-023 | K2 (K5 T055 walks it) |
| R-024 | K2 (K5 T055 walks it) |

Uncovered: none. Orphan: K5 (closing, by design).

## Owner's words not served
None. `## In the owner's words` is two sentences. Checked clause by clause:
- "implement the same authentication flow used in claude cli and implement in applika lci": K2 (`/auth/cli/authorize`, `/auth/token`, device code), K4 (1.1.0 `login`, `--manual`, `--device`).
- "today the cli only reuse the same token and refresh token used by frontend": K2 (a CLI sign-in opens its own `cli_browser`, `cli_device` or `cli_legacy` session), K4 (Bearer, own refresh value).
- "create a lost of devices connected and a section to revoke the access": K1 (table), K2 (list, revoke, revoke-others API), K3 (Devices tab, Revoke, Sign out all other devices).
- "this must be displayed in a new tab inside user profile": K3 (Profile | Devices tabs).
- "losting the device name, ip, when was granted access, last time accessed and more": K1 (columns), K2 (list contract), K3 (row fields).
- "instead of returning the refresh token in jwt, save it in the redis instance used by the rate limiter": K2 (`SessionStore` on `REDIS_URL`, the limiter's instance; the refresh value never in the JWT).
- "the access token cookie value now will become an random uuid7 value, the same one used as key in the redis": as clarified by the owner ("only the refresh token will become an uuid value, i am refrering to the cookies"): K2 (`__refresh` = uuid7 = `applika:session:<uuid7>`; `__access` stays a JWT).
- "if the redis key expire, this mean the session also expired": K2 (R-004, key gone → refresh and next request fail), K3 (Expired status).
- "list the devices connected by the frontend app in the profile": K2 (`github_web` sessions), K3 (web rows in the Devices tab).
