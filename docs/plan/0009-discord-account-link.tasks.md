# Tasks 0009 — Link a Discord account; route reports to the user's Discord servers

PRD: docs/prd/0009-discord-account-link.md   Plan: docs/plan/0009-discord-account-link.md
ADRs bound: 0013 (Accepted 2026-09-24; supersedes 0008, amends 0002), 0002, 0004, 0005, 0010, 0001. The ADR-0013 `## Open` edits are already applied: 0008 status, 0002 scope note, PRD 0004 as-built note. No ADR to draft.

Rewritten 2026-09-24 (expansion).
- K1..K4 stay below as history: built, on `integration/0009-discord-account-link`.
- The old K5 (closing) was deleted by the owner, and its section is dropped.
- K5..K11 are new. In the history sections, "K5" still means the deleted closing slice.

## Order
K1 → K2 → K3 → K4 (all built) → K5 S5 migration (Release A2) → K6 S6 connection API → K7 S7 webhooks admin API → K8 S8 report routing + org retired → K9 S9 frontend → K10 closing (Release B) → K11 S10 retire `is_org_member` (Release C)

- **Grouping.** The owner's standing choice, restated for 0009: one K per plan slice. S5..S10 are the K slices, plus one closing. Stories stay as `[USn]` step tags. Slices run more than a day; the owner's grouping wins over the one-day rule.
- **deps = real dependencies:**
  - K5 none;
  - K6 = K5 + K4;
  - K7 = K5;
  - K8 = K6 + K7;
  - K9 = K6 + K7 (contract);
  - K10 = K8 + K9;
  - K11 = K10.
  Build order on the one branch is still K6 → K7 → K8 → K9 → K10 → K11, each after the previous.
- **Branches.** K5 starts on its own branch; K6..K11 continue on `integration/0009-discord-account-link`.
- **AC.** Each AC is the PRD requirement sentence, verbatim. The `R-nnn` prefix and the trailing source parenthesis are dropped (house precedent). R-017 keeps its 2026-09-24 narrowing sentence. Rule ACs carry their rule path.
- **Step numbers.** T numbers continue from T078, the last history step. New steps: T079..T167.

### Releases (runbook rule 4, expand first, code second)
- **A2 = K5.**
  - Branch `integration/0009-release-a2`, cut from `develop`. Its tip touches only `backend/migrations/versions/`, `backend/tests/integration/` and `backend/CHANGELOG.md`. Tag `0009-release-a2` (local).
  - Owner: merge the tag into `develop` → release → `alembic upgrade head` in the API container → restart → confirm.
  - K5 then plain-merges the branch into `integration/0009-discord-account-link`.
- **Tag `0009-release-a`** (K1 tip, `users.discord_id`) is retired. It is never merged; deleting it is the owner's call.
- **B = K6..K10.** The K10 tip is tagged `0009-release-b`. The owner merges it only after confirming A2 ran in prod. Before deploy the owner sets the Discord env and registers the redirect URI (K10 T159).
- **C = K11.** Migration only, on `integration/0009-discord-account-link` after the `0009-release-b` tag; tagged `0009-release-c`. The owner merges it only after confirming B runs in prod.
- Build never waits for prod; merge does.
- **Closing sits before S10 (K10 before K11).**
  - Release B ships the code, so B is the release that needs the full gate, the full E2E and the by-hand walk before the owner merges it.
  - C cannot merge until B has run in prod, which may be days later. Closing after S10 would either hold B's tag hostage to C or cut B without its gate.
  - K11 is migration only and carries its own gate: round trip, head pin, backend gate and a full E2E run through C.
- Tags stay local. Never rewrite or force-push either branch.

### Plan corrections (checked against the code on 2026-09-24)
- **Plan header stale.** It says ADR-0013 Proposed and PRD Draft. ADR-0013 is Accepted (2026-09-24) with its three follow-up edits applied, and PRD 0009 is Approved. K10 T155 fixes the header line.
- **Heads.** The `develop` head is `c1d9f4a7b3e6`; the integration head is `a7e5c2f19b4d` (K1). `test_only_one_head` in `backend/tests/integration/test_timeline_contract_migration.py` pins `a7e5c2f19b4d` on the integration branch and `c1d9f4a7b3e6` on develop.
  - K5 T084 moves the develop-side pin, and the merge (K5 T090) takes that version.
  - Re-check both heads at K5 start.
- **Where `a7e5c2f19b4d` is deleted.** The plan says "same commit" as the new revision, but the file does not exist on `integration/0009-release-a2`, which is cut from develop. It is deleted while resolving the K5 merge (T090), together with its test and its K1 CHANGELOG entry.
- **Gap after the K5 merge.** The integration tip still maps `UserModel.discord_id`, and no revision creates that column any more.
  - Tests stay green (`create_all`).
  - A migrated stack (dev or E2E) returns 500 until K6 T094.
  - Run no stack on that tip; K6 starts next.
- **`UserDTO.discord_id` has three readers**, not one:
  - `presentation/api/user_feedback.py`;
  - `presentation/api/reports.py` l.108;
  - `tests/conftest.py` `override_get_current_user`.
  K6 drops the field, so K6 also moves `reports.py` to the connection read. That read is interim and keeps the org gate; K8 replaces the route deps.
- **E2E breaks in K6, not K9.**
  - `frontend/e2e/profile-discord.spec.ts` asserts `scope == "identify"`.
  - `is_configured()` now needs the key, and `docker-compose.e2e.yml` lacks it.
  K6 adds the key, reseeds through a connection row and changes the scope line. K9 adds the "Connected as" assertions.
- **Seed contract unchanged.** The JSON keys of `seed_e2e.py` stay the same, so `scripts/e2e.sh` and `frontend/e2e/support/auth.ts` do not change.
- **E2E Disconnect calls Discord.** From K6 on, Disconnect revokes server-side, best-effort. In the E2E stack that is a POST to discord.com with dummy credentials, swallowed within the 5 s timeout. The spec still asserts only the UI and `/users/me`.
- **Snowflake overflow.** The plan's id regex `^\d{17,20}$` lets a 20-digit id through, but `guild_id` and `role_ids` are BIGINT (max 9223372036854775807), so such an id causes a 500. K7 T113 also caps ids at the BIGINT max, answering 422.
- **422 leaks the webhook URL.** FastAPI's default 422 body echoes `input`, and a webhook URL is a secret (PRD Assumptions: kept out of error messages). K7 T116 keeps the submitted URL out of every 422 body, and the test pins it.
- **`README.md`** names neither `DISCORD_REPORTS_*` variable, so the plan's env line for it is stale. Nothing changes there.
- **Scopes missing at report time.** The plan Risk "routing without `guilds` treated as `needs_reconnect`" had no step; K8 T124 adds one.
- **ty baseline.** The rule baseline is 171 and only ratchets down. Every file a slice creates or changes is clean.
- **Frontend.** The frontend is Tailwind 4 + shadcn new-york (`frontend/CLAUDE.md`). There is no `components/ui/table.tsx`, so the admin list follows `supports-page.tsx`.

## History — K1..K4 as built (plan 0009 before the expansion, 2026-09-23)

### Order (2026-09-23)
K1 S1 migration (Release A) → K2 S2 backend: connect, conflict, disconnect, failed consent → K3 S3 webhook mentions → K4 S4 frontend: card, Connect/Disconnect, outcome notices, E2E → K5 closing (Release B; deleted 2026-09-24)

- **Owner's choice (2026-09-23): "5 plan slices".** One K per plan slice S1..S4, plus closing.
  - Slices run more than a day. The owner's grouping wins over the one-story, one-day rule.
  - Each story keeps its steps tagged `[USn]`, in priority order inside the slice: US1, US3, US4, US5 in K2; US1, US3, US4, US5 in K4.
- **Foundation K1:** plan `## Data` is not none, so K1 = migration only. Models and repository move to K2, because .claude/rules/prod-release-runbook.md 4 forbids code that reads or writes `discord_id` in Release A.
- **Chain:** the owner ruled: no pull request, one branch, the work done there. Strict chain, each slice after the previous one. `deps` = the previous slice; the real dependency is in brackets.
- **Branch:** one branch, `integration/0009-discord-account-link`, cut off `develop` at K1 start (as 0008 did). K2..K5 continue on it.
- **Acceptance criteria:** each AC is the PRD requirement sentence, verbatim. The `R-nnn` prefix and the trailing source parenthesis are dropped (house precedent 0008). Merged slices list each AC once. Rule ACs carry their rule path.
- **Moved check:** one check moved between slices because of the new order. "After disconnect, the next feedback post has no mention" was in the old disconnect slice. It now sits in K3 T046, because the feedback integration test file and the mention itself both land in K3.

### Release split on one branch (runbook rule 4, expand first, code second)
- K1 commits touch only `backend/migrations/versions/`, `backend/tests/integration/` and `backend/CHANGELOG.md`. The K1 tip is the Release A boundary, tagged `0009-release-a` (local).
- The K2..K4 tips are not merge points. The K5 tip is the Release B boundary, tagged `0009-release-b` (local).
- Merge order: the owner merges the `0009-release-a` tip into `develop` → release → `alembic upgrade head` in the API container → restart → confirm. Then the owner merges the `0009-release-b` tip. Build never waits for prod; merge does.
- Tags stay local. Never rewrite or force-push the branch.
- Before Release B deploys, the owner sets the Discord env on the swarm stack and registers the redirect URI in the Discord Developer Portal (K5 T078).

### Plan corrections (checked against the code on 2026-09-23)
- **Migration head:** at branch time the head is `c1d9f4a7b3e6` (`tailored_cv_base_snapshot`). The plan's `a1b2c3d4e5f7` is stale; re-check at K1 start. `backend/tests/integration/test_timeline_contract_migration.py::test_only_one_head` pins `c1d9f4a7b3e6`, so K1 T004 moves the pin.
- **ADR status:** the plan header says ADR 0008 and 0002 are Proposed. That is stale: both are Accepted and the amendment is applied.
- **E2E harness:** the plan Risk "plan 0006 E2E harness not merged" is stale. `scripts/e2e.sh`, `docker-compose.e2e.yml`, `frontend/e2e/support/auth.ts` and the `e2e` job in `.github/workflows/frontend-ci.yaml` all exist.
- **Seed script:** the path is `backend/app/scripts/seed_e2e.py`. Its JSON contract grows by one user, so `scripts/e2e.sh`, `frontend/e2e/support/auth.ts` and `backend/tests/unit/test_seed_e2e.py` follow it (K4 T053).
- **Exceptions:** `backend/app/core/exceptions.py` has no auth or 503 exception.
  - `fetch_discord_id` raises a service-local `DiscordLinkError`; the callback turns it into `status=error`.
  - The begin route raises `HTTPException(503)`, the way `GetCurrentUserUseCase` raises 401.
- **Feedback test:** no integration test posts `/feedbacks` today. K3 adds `backend/tests/integration/test_user_feedback.py` (new) to prove that the route passes `c_user.discord_id` (R-015).
- **CLI changelog:** `/users/me` is a CLI route, so the additive `discord_linked` goes in both changelogs (.claude/rules/changelogs.md 3). `cli/CHANGELOG.md` has had no `[Unreleased]` section since 1.0.0, so K2 opens one.
- **CLI version:** the CLI is at 1.0.0. The R-019 checks cover `whoami` on 0.1.4, 0.2.0 and 1.0.0.
- **ty baseline:** the rule baseline is 171 and only ratchets down. 20 was measured on 2026-09-19 (backend-qa memory). A slice never raises the total, and every file a slice creates or changes is clean.
- **Frontend stack:** the frontend is Tailwind 4 + shadcn new-york (`frontend/CLAUDE.md`); the stack table in the workspace CLAUDE.md is stale.
- **E2E Disconnect:** K4 T064 clears the seeded `e2e-discord` link. The seed re-sets `discord_id` on every upsert. The spec runs as `test.describe.serial` with Disconnect last.
- **Rollback:** the K1 downgrade drops `discord_id`, which is allowed because this revision created it. A rollback past Release A loses the links written since Release B; users relink.

## K1 — Discord link foundation: users.discord_id migration (Release A)   side: backend   covers: R-004, R-007 (schema level; K2 code)   deps: —
**Built.** Superseded 2026-09-24:
- Revision `a7e5c2f19b4d` is replaced by new K5. It is deleted at the K5 merge and never shipped.
- Tag `0009-release-a` is retired.
- R-004 is superseded.
Owner's words: "Keep github login but add an option in user profile to sincronize with discord."
Touch: backend/migrations/versions/<rev>_add_discord_id_to_users.py (new), backend/tests/integration/test_migration_discord_id.py (new), backend/tests/integration/test_timeline_contract_migration.py, backend/CHANGELOG.md
Pattern: backend/migrations/versions/c1d9f4a7b3e6_tailored_cv_base_snapshot.py (additive column at head), backend/tests/integration/test_migration_tailored_cv_base_snapshot.py (round trip)
Contract: no route. Release A: the image ships with this revision and the app code is unchanged. The owner runs `alembic upgrade head` in the API container, restarts it and confirms. Release B merges only after that.
Steps:
- T001 [US1] Create the revision in backend/migrations/versions/<rev>_add_discord_id_to_users.py (new):
  - `down_revision = 'c1d9f4a7b3e6'` (re-check the head at start).
  - `upgrade()`: `op.add_column('users', sa.Column('discord_id', sa.BigInteger(), nullable=True))`, then `op.create_index('ix_users_discord_id', 'users', ['discord_id'], unique=True)`.
  - No token column; drops nothing.
  - The docstring cites .claude/rules/non-destructive-migrations.md and runbook rule 4.
- T002 [US1] Write `downgrade()` in backend/migrations/versions/<rev>_add_discord_id_to_users.py (new): `op.drop_index('ix_users_discord_id', table_name='users')`, then `op.drop_column('users', 'discord_id')`. Only objects this revision added.
- T003 [P] [US1] Round-trip test on testcontainers Postgres, real Alembic chain, in backend/tests/integration/test_migration_discord_id.py (new). Seed users at `c1d9f4a7b3e6`, then:
  - upgrade: every user row intact, `discord_id` NULL, unique index present, many NULLs accepted, two distinct ids accepted, a duplicate non-null id raises IntegrityError, no column or table missing;
  - downgrade: user rows intact, column and index gone;
  - upgrade again: equal to the first upgrade.
- T004 [US1] Move the `test_only_one_head` pin from `c1d9f4a7b3e6` to the new revision, in backend/tests/integration/test_timeline_contract_migration.py. Keep the "exactly one head" check, assert the new `down_revision == 'c1d9f4a7b3e6'`, keep the chain walk.
- T005 [US1] Add under `## [Unreleased]` / Added in backend/CHANGELOG.md: `- users.discord_id BIGINT NULL, unique index ix_users_discord_id; no code reads it yet (Release A).`
- T006 [US1] Verify:
  - `grep -nE "op\.drop_(column|table)"` hits only inside `downgrade()`;
  - `grep -rn "_old" backend/app/` has no hits;
  - `uv run alembic downgrade -1 && uv run alembic upgrade head` works on the local DB;
  - `uv run pytest tests/integration -k migration` is green.
- T007 [US1] Confirm:
  - backend/app/domain/models.py does not map `discord_id`;
  - backend/tests/conftest.py `create_all` is unchanged;
  - `git diff develop --name-only` lists no file under `backend/app/` (runbook 4).
- T008 [US1] Backend gate:
  - `uv run ruff format --check ./app`;
  - `uv run ruff check ./app`;
  - `uv run ty check`: total ≤ 171 and not above the count at slice start; changed files clean;
  - `uv run pytest . --cov=app`: coverage ≥ 90%.
- T009 [US1] Record at slice close:
  - The K1 tip sha is the Release A boundary; tag it `0009-release-a`.
  - Owner steps: merge the tag tip into `develop` → release → `alembic upgrade head` in the API container → restart the API → confirm. Prod must also run any earlier pending revision up to `c1d9f4a7b3e6`; `upgrade head` runs them in order.
  - Rollback: `alembic downgrade c1d9f4a7b3e6` plus the previous image.
  - The agent never touches prod.
AC:
- A Discord account is linked to at most one Applika user.
- After a successful connection the system stores the Discord user id and nothing else from Discord; no Discord token is ever stored.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)

## K2 — S2 backend: Discord link API — connect, conflict, disconnect, failed consent   side: backend   covers: R-001, R-003, R-004, R-005, R-007, R-008, R-009, R-010, R-011, R-012, R-013, R-018, R-019   deps: K1
**Built.**

- Kept: the Redis nonce, the callback order, the three outcomes, the begin and unlink routes, `DiscordLinkError`.
- Superseded 2026-09-24, moved to new K6:
  - scope `identify` (R-003 → R-020);
  - `fetch_discord_id` + revoke at connect (R-005);
  - `users.discord_id` storage (R-004 → R-021, R-022);
  - unlink calling nothing at Discord (R-011 → R-024);
  - `discord_linked` only (R-018 → R-025);
  - the refusal when another user holds the id (T026, T029): R-008 rewritten, the link now moves (K6 T095, T101), and `ResourceConflict` stays only for the two-user race.
Owner's words: "Keep github login but add an option in user profile to sincronize with discord."
Touch:
- backend/app/config/settings.py
- backend/app/domain/models.py
- backend/app/application/dto/user.py
- backend/app/domain/repositories/user_repository.py
- backend/app/application/services/discord_oauth_service.py (new)
- backend/app/application/use_cases/account_link_state.py (new)
- backend/app/application/use_cases/account_links/__init__.py (new)
- backend/app/application/use_cases/account_links/link_discord.py (new)
- backend/app/application/use_cases/account_links/unlink_discord.py (new)
- backend/app/presentation/api/account_link.py (new)
- backend/app/presentation/schemas/account_link.py (new)
- backend/app/presentation/schemas/user.py
- backend/app/presentation/dependencies.py
- backend/app/main.py
- backend/tests/unit/test_discord_oauth_service.py (new)
- backend/tests/unit/test_account_link_state.py (new)
- backend/tests/unit/test_link_discord.py (new)
- backend/tests/unit/test_unlink_discord.py (new)
- backend/tests/integration/test_account_link_discord.py (new)
- backend/tests/integration/test_users.py
- backend/tests/integration/test_delete_account.py
- backend/CLAUDE.md
- backend/CHANGELOG.md
- cli/CHANGELOG.md
Pattern:
- shape: begin returns a JSON URL; callback redirects with linked/conflict/error; link pre-checks the id, then `IntegrityError` → `ResourceConflict`; unlink is idempotent.
- applika:
  - backend/app/application/use_cases/auth_handoff_state.py (Redis state, GETDEL)
  - backend/app/application/services/github_service.py (httpx, error handling)
  - backend/app/presentation/api/oauth.py (router prefix `/auth`)
Contract: prefix `/api`, cookie `__access`.
- `POST /auth/link/discord` →
  - 200 `{"authorize_url": "https://discord.com/oauth2/authorize?...&scope=identify&state=<nonce>"}`
  - 401 `{"detail": "Not authenticated"}`
  - 503 `{"detail": "Discord linking is not configured"}`
- `GET /auth/link/discord/callback?code&state` → 307 `Location: <ACCOUNT_LINK_REDIRECT_URI>?account=discord&status=linked|conflict|error`. Never JSON; sets no cookie.
- `DELETE /auth/link/discord` → 200 `{"provider": "discord", "linked": false}` | 401. Idempotent; calls nothing at Discord; works when no Discord app is configured.
- `GET|PATCH /users/me` → 200, adds `"discord_linked": true|false`, never `discord_id`.
- `DELETE /users/me` unchanged: deleting the row removes the link.
Steps:
- T010 [US1] Add optional settings in backend/app/config/settings.py:
  - `DISCORD_CLIENT_ID: str | None = None`
  - `DISCORD_CLIENT_SECRET: str | None = None`
  - `DISCORD_LINK_REDIRECT_URI: str = 'http://127.0.0.1:8000/api/auth/link/discord/callback'`
  - `ACCOUNT_LINK_REDIRECT_URI: str = 'http://127.0.0.1:8080/profile'`
  - `ACCOUNT_LINK_STATE_TTL_SECONDS: int = 600`
  `DISCORD_REPORTS_*`, `DISCORD_FEEDBACK_WEBHOOK` and `core/crypto.py` stay untouched.
- T011 [US1] Map the column:
  - `UserModel.discord_id: Mapped[int | None] = mapped_column(sa.BigInteger, unique=True, index=True)` in backend/app/domain/models.py; the index name is `ix_users_discord_id`, as in K1.
  - `UserDTO.discord_id: int | None = None` in backend/app/application/dto/user.py. Internal; never in an API schema.
- T012 [US1] Add `get_by_discord_id(discord_id)` and `link_discord(user_id, discord_id)` in backend/app/domain/repositories/user_repository.py. If the same user already holds that id, it is a no-op. Commit/rollback follows the repo pattern. The cross-user conflict comes in T026.
- T013 [US1] Check fastapi-sso 0.18 `DiscordSSO` state handling with context7 (plan Risk): does `verify_and_process` require its own state cookie? If yes, validate our nonce ourselves and do the code exchange plus `GET https://discord.com/api/users/@me` with httpx. Record the choice in the service docstring.
- T014 [US1] Create `DiscordOAuthService` in backend/app/application/services/discord_oauth_service.py (new):
  - `is_configured()`.
  - `get_authorize_url(state)`: `scope=['identify']` only, `allow_insecure_http=envs.ENVIRONMENT != 'PROD'`, redirect to `DISCORD_LINK_REDIRECT_URI`.
  - `fetch_discord_id(request) -> int`: exchange the code, read the id, then call `revoke_token(access_token)`. The token stays in a local variable: never logged, returned or stored. Raises a service-local `DiscordLinkError` on failure.
  - `revoke_token(token)`: httpx `POST https://discord.com/api/oauth2/token/revoke`, form `token`, `token_type_hint=access_token`, client id/secret, timeout 5 s. Swallows and logs `httpx.HTTPError` and non-2xx responses, without the token value.
  - Add `get_discord_oauth_service` + `DiscordOAuthServiceDp` in backend/app/presentation/dependencies.py.
  - The webhook `DiscordService` stays untouched.
- T015 [US1] Create `AccountLinkStateUseCase` in backend/app/application/use_cases/account_link_state.py (new):
  - `create(user_id) -> nonce`: nonce from `secrets.token_urlsafe(32)`, then `SET applika:account_link:discord:{nonce} user_id EX ACCOUNT_LINK_STATE_TTL_SECONDS`.
  - `consume(nonce) -> int | None`: `GETDEL`, single use.
  - Add `get_account_link_state_use_case` + `AccountLinkStateUseCaseDp` (`RedisDp`) in backend/app/presentation/dependencies.py.
- T016 [US1] Create `LinkDiscordUseCase.execute(user_id, discord_id)` → `user_repo.link_discord`, in backend/app/application/use_cases/account_links/link_discord.py (new) and backend/app/application/use_cases/account_links/__init__.py (new).
- T017 [US1] Create the begin and callback routes:
  - Schema `AccountLinkStart {authorize_url}` in backend/app/presentation/schemas/account_link.py (new).
  - Router in backend/app/presentation/api/account_link.py (new): `APIRouter(prefix='/auth', tags=['Account links'])`.
  - `POST /auth/link/discord` (`CurrentUserDp`): not configured → 503 "Discord linking is not configured"; otherwise create a nonce and return 200 with the authorize URL.
  - `GET /auth/link/discord/callback`, in this order:
    1. consume the nonce; missing, expired or replayed → error;
    2. resolve the `__access` cookie via `GetCurrentUserUseCase`; missing, expired or invalid → error;
    3. cookie user id != nonce user id → error;
    4. `fetch_discord_id`;
    5. `LinkDiscordUseCase`;
    6. 307 to `{ACCOUNT_LINK_REDIRECT_URI}?account=discord&status=linked`.
    Any other failure → `status=error`. Never JSON. Sets and clears no cookie (R-001).
  - `include_router` in backend/app/main.py.
- T018 [US1] Add `discord_linked: bool = False` to `UserProfile` in backend/app/presentation/schemas/user.py, filled from `discord_id is not None`. Never serialise `discord_id`. Confirm that `AdminUserRowSchema` and `AdminUserDetailSchema` in backend/app/presentation/schemas/admin.py (read only) gain no Discord field (non-goal: admin views).
- T019 [P] [US1] Unit tests:
  - backend/tests/unit/test_discord_oauth_service.py (new), with `httpx.MockTransport`:
    - the authorize URL scope is exactly `identify`, plus `state`;
    - revoke is called after the id is read;
    - a revoke failure (HTTPError, 500) is swallowed and the id is still returned;
    - the token value is absent from captured logs;
    - `is_configured` is false when the id/secret are unset.
  - backend/tests/unit/test_account_link_state.py (new):
    - single use: a second consume returns None;
    - TTL equals the setting;
    - key prefix.
  - backend/tests/unit/test_link_discord.py (new):
    - link stores the id;
    - the same user with the same id again is a no-op.
- T020 [US1] Integration tests in backend/tests/integration/test_account_link_discord.py (new) and backend/tests/integration/test_users.py. `DiscordOAuthServiceDp` is overridden by a fake (no network), and the callback gets a real `__access` cookie.
  - Begin:
    - 200, and the URL has `scope=identify` and `state`;
    - 401 without a cookie;
    - 503 when unconfigured.
  - Callback, happy path: 307 with `status=linked`; the row holds the id; no `Set-Cookie`; the refresh token in Redis is unchanged.
  - Callback refusals, each → error, nothing stored:
    - replayed state;
    - expired state;
    - unknown state;
    - cookie user != state user;
    - missing or expired cookie.
  - Relinking the same account → linked, row unchanged.
  - `GET /users/me` and `PATCH /users/me` return `discord_linked` true/false and no `discord_id` key; the admin user detail has no Discord key.
- T021 [US1] CLI compatibility:
  - `uv run pytest tests -k "steps or finalize or supports"` in backend;
  - `make test` in cli;
  - `whoami` reads dict keys (cli/src/applika/commands/auth.py l.75-93), so 0.1.4, 0.2.0 and 1.0.0 ignore the new key.
- T022 [US1] Changelogs:
  - backend/CHANGELOG.md, Added: routes, settings, `discord_linked`.
  - cli/CHANGELOG.md: open `## [Unreleased]` with Changed `- GET|PATCH /users/me returns a new discord_linked boolean; additive; no CLI change; 0.1.4, 0.2.0, 1.0.0 unaffected.`
- T023 [US1] Document in backend/CLAUDE.md:
  - the Account links endpoints;
  - the five env vars;
  - `DiscordOAuthService` vs `DiscordService`;
  - `discord_linked`;
  - `users.discord_id` in the Domain Model.
  Confirm backend/scripts/seed_mock_data.py still runs (it sends no field that changed).
- T024 [US1] Backend gate as in K1 T008; `grep -rn "_old" backend/app/` has no hits.
- T025 [US1] Record at slice close:
  - The K2 tip is not a merge point (Release B = K5 tip).
  - Risk: if Release B is deployed before the migration, `UserModel` selects a missing column and every auth request returns 500. The runbook order is the only guard.
- T026 [US3] In `link_discord` (backend/app/domain/repositories/user_repository.py):
  - `get_by_discord_id` finds an owner and `owner.id != user_id` → `ResourceConflict('This Discord account is linked to another Applika account')`.
  - An `IntegrityError` on commit (race) → rollback plus the same `ResourceConflict`.
  - Neither user changes.
- T027 [US3] In backend/app/presentation/api/account_link.py, the callback maps `ResourceConflict` → 307 `?account=discord&status=conflict`, before the catch-all error.
- T028 [P] [US3] Unit tests in backend/tests/unit/test_link_discord.py:
  - another user holds the id → `ResourceConflict`, no row written;
  - IntegrityError → `ResourceConflict` plus rollback (race: exactly one wins);
  - the same user relinking → no-op.
- T029 [US3] Integration test in backend/tests/integration/test_account_link_discord.py: user B's callback carries a Discord id that user A holds → 307 `status=conflict`. A keeps the id, B stays unlinked, and `GET /users/me` for B returns `discord_linked` false.
- T030 [US3] Added entry (conflict outcome) in backend/CHANGELOG.md; conflict rule in backend/CLAUDE.md. Backend gate as in K1 T008.
- T031 [US4] Add `unlink_discord(user_id)` in backend/app/domain/repositories/user_repository.py: `discord_id = None`, commit; idempotent.
- T032 [US4] Create `UnlinkDiscordUseCase.execute(user_id)` → `user_repo.unlink_discord`, in backend/app/application/use_cases/account_links/unlink_discord.py (new). No `DiscordOAuthService` dependency, no Discord call.
- T033 [US4] Create the disconnect route:
  - Schema `AccountLinkOut {provider, linked}` in backend/app/presentation/schemas/account_link.py.
  - Route `DELETE /auth/link/discord` (`CurrentUserDp`) in backend/app/presentation/api/account_link.py → 200 `AccountLinkOut(provider='discord', linked=False)`, with no `is_configured` check.
- T034 [P] [US4] Unit tests in backend/tests/unit/test_unlink_discord.py (new):
  - clears the id;
  - unlinked → no-op;
  - zero HTTP requests.
- T035 [US4] Integration tests:
  - Unlink, in backend/tests/integration/test_account_link_discord.py:
    - linked → DELETE 200 → `discord_linked` false, column NULL;
    - DELETE when unlinked → 200;
    - anonymous → 401;
    - unconfigured Discord → still 200.
  - Relink, in backend/tests/integration/test_account_link_discord.py:
    - the same id after unlink → linked;
    - another id → linked;
    - another user can link the freed id.
  - Delete account, in backend/tests/integration/test_delete_account.py: `DELETE /users/me` of a linked user → row gone → another user links the same id → linked.
  - The "next feedback post has no mention after disconnect" check moved to K3 T046.
- T036 [US4] Added entry (`DELETE /auth/link/discord`) in backend/CHANGELOG.md; the endpoint in backend/CLAUDE.md. Backend gate as in K1 T008.
- T037 [US5] Callback failures, in backend/app/presentation/api/account_link.py and backend/app/application/services/discord_oauth_service.py. Each → `status=error`, with nothing stored:
  - a Discord `error` query param (e.g. `access_denied`) or a missing `code`: no call to Discord, but the nonce is still consumed;
  - `fetch_discord_id` raises `DiscordLinkError` (code exchange refused, Discord unreachable, id missing);
  - the Discord app is unconfigured.
  Reasons are logged without code or token values.
- T038 [P] [US5] Unit tests in backend/tests/unit/test_discord_oauth_service.py:
  - `fetch_discord_id` raises `DiscordLinkError` on a token-exchange 4xx/5xx, a network error and a missing id;
  - no revoke when no token was issued;
  - the token never appears in logs.
- T039 [US5] Integration tests in backend/tests/integration/test_account_link_discord.py:
  - `?error=access_denied&state=<valid>` → 307 `status=error`; the fake `fetch_discord_id` is never called; row unchanged;
  - the fake raises `DiscordLinkError` → error; row unchanged;
  - unconfigured → error;
  - after a failure the user starts again (new nonce) → linked.
- T040 [US5] Changed entry in backend/CHANGELOG.md. Backend gate as in K1 T008.
AC:
- The system keeps GitHub as the only way to sign in; connecting Discord never creates or changes a session.
- The system asks Discord only for the permission that reveals the Discord user id.
- After a successful connection the system stores the Discord user id and nothing else from Discord; no Discord token is ever stored.
- The system asks Discord to revoke the access token right after reading the user id, and a Discord failure does not block the connection.
- A Discord account is linked to at most one Applika user.
- When the Discord account is already linked to another Applika user, the system refuses, changes nothing for either user, and the profile page says the Discord account is linked to another Applika account. **As built; R-008 rewritten 2026-09-24 (transfer), see K6.**
- The system returns the user to the profile page after the Discord consent screen with one of three outcomes: connected, already linked elsewhere, or failed. **As built; R-009 narrowed 2026-09-24 ("already linked" only on the two-user race), see K6.**
- The system accepts a Discord consent result only for the same signed-in user who started it, only once, and within a short time window.
- Disconnect Discord removes the stored Discord user id and calls nothing at Discord.
- A user who disconnected can connect Discord again, the same account or another one.
- Deleting the Applika account removes the Discord link.
- The profile data the API returns tells whether Discord is linked, without the Discord id.
- The installed command-line tool keeps working unchanged.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K3 — S3 webhook mentions: linked users mentioned in report and feedback posts   side: backend   covers: R-014, R-015, R-016, R-017   deps: K2
**Built.**
- Kept: the `allowed_mentions` payload and the header mention.
- Superseded 2026-09-24:
  - the mention id source moves to new K6 (connection row);
  - the org gate and the single `DISCORD_REPORTS_WEBHOOK` move to new K8 (routing);
  - R-017 is narrowed to feedback.
Owner's words: "Keep github login but add an option in user profile to sincronize with discord."
Touch:
- backend/app/application/services/discord_service.py
- backend/app/application/use_cases/quinzenal_reports/submit_report.py
- backend/app/application/use_cases/user_feedbacks/submit_feedback.py
- backend/app/presentation/api/reports.py
- backend/app/presentation/api/user_feedback.py
- backend/tests/unit/test_discord_mentions.py (new)
- backend/tests/integration/test_quinzenal_reports.py
- backend/tests/integration/test_user_feedback.py (new)
- backend/CLAUDE.md
- backend/CHANGELOG.md
Pattern: backend/app/application/services/discord_service.py (`post_report_message` payload), backend/tests/integration/test_quinzenal_reports.py
Contract: no route change. Webhook payload:
- linked: `{"content": "<header> - @name <@123>...", "allowed_mentions": {"parse": [], "users": ["123"]}}`;
- unlinked: unchanged, `{"content": ..., "allowed_mentions": {"parse": []}}`.
Steps:
- T041 [US2] Change `post_report_message(message, mention_user_id: int | None = None)` in backend/app/application/services/discord_service.py:
  - `allowed_mentions` = `{'parse': []}` when the id is None (unchanged), else `{'parse': [], 'users': [str(mention_user_id)]}`;
  - never `everyone`, `roles` or `users` in `parse`;
  - log line unchanged.
- T042 [US2] Report, in backend/app/application/use_cases/quinzenal_reports/submit_report.py:
  - `execute(user_id, username, day, payload, discord_id: int | None = None)`;
  - `_build_discord_message(..., discord_id=None)`: the header at l.97 becomes `... - @{safe_username} <@{discord_id}>` when linked, byte-identical when not;
  - the call at l.254 passes `mention_user_id=discord_id`;
  - the org-member gate is unchanged: a non-member is still not posted.
- T043 [US2] Feedback: the same change, header at l.39 and call at l.64, in backend/app/application/use_cases/user_feedbacks/submit_feedback.py.
- T044 [US2] Pass `c_user.discord_id` at backend/app/presentation/api/reports.py l.107 and backend/app/presentation/api/user_feedback.py l.33. DI `get_discord_service` and `get_discord_feedback_service` stay unchanged.
- T045 [P] [US2] Unit tests in backend/tests/unit/test_discord_mentions.py (new):
  - the `DiscordService` payload with and without `mention_user_id` (`_post_message` patched);
  - `parse` never holds `everyone`, `roles` or `users`;
  - the report and feedback `_build_discord_message` header, linked vs unlinked; the unlinked header is byte-identical to today's string.
- T046 [US2] Integration tests, with `DISCORD_CLIENT_ID`/`SECRET` unset (edge case: a server without a Discord app still mentions linked users):
  - Reports, in backend/tests/integration/test_quinzenal_reports.py:
    - a linked org member → `post_report_message` called with `mention_user_id`;
    - unlinked → None;
    - non-member → not called.
  - Feedback, in backend/tests/integration/test_user_feedback.py (new), with a recording fake `DiscordFeedbackServiceDp`:
    - linked and unlinked users post `/feedbacks` → the fake gets `mention_user_id` / None;
    - after `DELETE /auth/link/discord`, the next `/feedbacks` post carries no mention (moved from K2 T035).
- T047 [US2] Document webhook mentions in backend/CLAUDE.md; Changed entry in backend/CHANGELOG.md. Backend gate as in K1 T008.
AC:
- When a linked user's biweekly report is posted to Discord, the post mentions that user.
- When a linked user's feedback is posted to Discord, the post mentions that user.
- A webhook post allows a mention of the submitting user only, and never of everyone, roles or other users.
- A post for an unlinked user is exactly what Applika sends today.
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K4 — S4 frontend: Connected accounts card, Connect/Disconnect, outcome notices, E2E   side: frontend (+ E2E seed)   covers: R-002, R-003 (E2E asserts scope), R-006, R-008 (profile message), R-009 (notices), R-012 (Connect offered again)   deps: K3 (needs K2 contract)
**Built.**
- Kept: the card shell, Connect/Disconnect, the outcome notices, `use-account-links`, the serial E2E.
- Superseded 2026-09-24:
  - "Discord connected" and never showing a name or avatar (R-006 → R-023) move to new K9;
  - the E2E scope line moves to new K6.
- Narrowed 2026-09-24: the conflict notice (T056..T058) stays as built. After the R-008 rewrite it shows only when a user loses the two-user race. No frontend change.
Owner's words: "Keep github login but add an option in user profile to sincronize with discord."
Touch:
- frontend/src/services/types/users.ts
- frontend/src/services/types/auth.ts (new)
- frontend/src/services/interfaces/i-auth-service.ts
- frontend/src/services/implementations/auth-service.ts
- frontend/src/hooks/use-account-links.ts (new)
- frontend/src/hooks/use-user.ts
- frontend/src/components/profile/connected-accounts.tsx (new)
- frontend/src/components/profile/connected-accounts.test.tsx (new)
- frontend/src/components/profile/profile-view.tsx
- frontend/src/app/(protected)/profile/page.tsx
- frontend/src/app/(protected)/profile/profile-page.tsx
- frontend/src/app/(protected)/profile/profile-page.test.tsx (new)
- frontend/e2e/profile-discord.spec.ts (new)
- frontend/e2e/support/auth.ts
- scripts/e2e.sh
- docker-compose.e2e.yml
- backend/app/scripts/seed_e2e.py
- backend/tests/unit/test_seed_e2e.py
- backend/CHANGELOG.md
- frontend/CLAUDE.md
Pattern:
- applika:
  - frontend/src/app/(protected)/cvs/editor/page.tsx (Suspense + `useSearchParams` under static export)
  - frontend/src/hooks/use-user.ts
  - frontend/src/components/ui/alert-dialog.tsx
Contract: as K2.
- `POST /auth/link/discord` → 200 `{authorize_url}` | 401 | 503.
- The callback lands the browser on `/profile?account=discord&status=linked|conflict|error`.
- `DELETE /auth/link/discord` → 200 `{"provider": "discord", "linked": false}` | 401.
- `GET /users/me` carries `discord_linked`.
Steps:
- T048 [US1] Types and service:
  - `discord_linked: boolean` on `User` in frontend/src/services/types/users.ts;
  - `AccountLinkStart { authorize_url: string }` in frontend/src/services/types/auth.ts (new);
  - `startDiscordLink()` → `POST /auth/link/discord` in frontend/src/services/interfaces/i-auth-service.ts and frontend/src/services/implementations/auth-service.ts.
- T049 [P] [US1] Create `useStartDiscordLink` in frontend/src/hooks/use-account-links.ts (new):
  - onSuccess: `window.location.assign(authorize_url)`;
  - 503 → toast "Discord linking is unavailable";
  - other errors → toast `getApiError`.
  Export `USER_QUERY_KEY` from frontend/src/hooks/use-user.ts.
- T050 [US1] Create the card in frontend/src/components/profile/connected-accounts.tsx (new):
  - heading "Connected accounts" and one Discord row;
  - unlinked → "Connect Discord" button, with a pending state;
  - linked → "Discord connected";
  - never renders a Discord id, name or avatar;
  - helper text: the linked account is mentioned in biweekly report and feedback posts;
  - applika tokens.
  Render it in frontend/src/components/profile/profile-view.tsx, above Delete account.
- T051 [US1] Linked notice, in frontend/src/app/(protected)/profile/page.tsx and frontend/src/app/(protected)/profile/profile-page.tsx:
  - `page.tsx` wraps `ProfilePage` in `<Suspense>`;
  - `profile-page.tsx` reads `account`/`status` with `useSearchParams`;
  - on `account=discord&status=linked`: show a notice ("Discord connected") that survives the URL clean, invalidate `USER_QUERY_KEY`, then `router.replace('/profile')`.
- T052 [P] [US1] Vitest:
  - Card, in frontend/src/components/profile/connected-accounts.test.tsx (new):
    - unlinked shows Connect Discord and no "Discord connected";
    - linked shows "Discord connected" and no Connect;
    - no Discord id, name or avatar when linked;
    - clicking Connect calls `startDiscordLink` and assigns `authorize_url`;
    - 503 → "Discord linking is unavailable".
  - Page, in frontend/src/app/(protected)/profile/profile-page.test.tsx (new): the `status=linked` notice shows, the user query is invalidated, and the URL is replaced by `/profile`.
- T053 [US1] E2E harness:
  - Seed a third user, `e2e-discord`, in backend/app/scripts/seed_e2e.py: `github_id` 999000000003, a fixed synthetic `discord_id` re-set on every upsert. Emit `discord_user_id`, `discord_access_token`, `discord_refresh_token`. Extend backend/tests/unit/test_seed_e2e.py.
  - Export `E2E_DISCORD_USER_ID`, `E2E_DISCORD_ACCESS_TOKEN`, `E2E_DISCORD_REFRESH_TOKEN` in scripts/e2e.sh.
  - Add `SeededRole` `"discord"` in frontend/e2e/support/auth.ts.
  - Add dummy `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` and `ACCOUNT_LINK_REDIRECT_URI: http://127.0.0.1:8180/profile` to the `api` env in docker-compose.e2e.yml.
  - Backend Changed line (E2E seed) in backend/CHANGELOG.md.
- T054 [US1] E2E on the real stack, `test.describe.serial`, in frontend/e2e/profile-discord.spec.ts (new):
  - `e2e-user` sees Connect Discord; on click, `page.route('https://discord.com/**')` aborts the request; the requested URL has `scope=identify` and `state`;
  - `e2e-discord` sees "Discord connected" and no Connect.
- T055 [US1] Docs and gates:
  - Add the Connected accounts card, `use-account-links` and the profile `?account=&status=` notice under Suspense to frontend/CLAUDE.md.
  - Frontend gate: `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build` in frontend.
  - Backend gate on the seed change: ruff; ty clean on changed files; pytest.
  - `scripts/e2e.sh e2e/profile-discord.spec.ts e2e/smoke.spec.ts` green.
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` empty afterwards.
- T056 [US3] In frontend/src/app/(protected)/profile/profile-page.tsx, `status=conflict` →
  - notice "This Discord account is linked to another Applika account";
  - user query invalidated;
  - `router.replace('/profile')`;
  - the card stays unlinked (Connect Discord).
- T057 [P] [US3] Vitest in frontend/src/app/(protected)/profile/profile-page.test.tsx: the conflict notice text is exact, and no "Discord connected" notice appears.
- T058 [US3] E2E in frontend/e2e/profile-discord.spec.ts: `e2e-user` opens `/profile?account=discord&status=conflict` → notice visible → URL becomes `/profile` → Connect Discord still shown.
- T059 [US3] Frontend gate as in T055; `scripts/e2e.sh e2e/profile-discord.spec.ts` green; no `applika-e2e-*` container left.
- T060 [US4] Add `AccountLinkOut { provider: "discord"; linked: boolean }` and `unlinkDiscord()` → `DELETE /auth/link/discord`, in frontend/src/services/types/auth.ts, frontend/src/services/interfaces/i-auth-service.ts and frontend/src/services/implementations/auth-service.ts.
- T061 [P] [US4] Create `useUnlinkDiscord` in frontend/src/hooks/use-account-links.ts: invalidate `USER_QUERY_KEY`, success toast, error toast `getApiError`.
- T062 [US4] Linked state, in frontend/src/components/profile/connected-accounts.tsx: "Disconnect Discord" button → `AlertDialog` confirm (Cancel / Disconnect) → mutation → the card shows Connect Discord. Connect is never offered while linked.
- T063 [P] [US4] Vitest in frontend/src/components/profile/connected-accounts.test.tsx:
  - linked shows Disconnect Discord;
  - a click opens the confirm;
  - Cancel → no call;
  - confirm → `unlinkDiscord` called once and the user query invalidated;
  - unlinked has no Disconnect;
  - linked has no Connect.
- T064 [US4] E2E on the real API, the last test of the serial file, in frontend/e2e/profile-discord.spec.ts: `e2e-discord` → Disconnect → confirm → Connect Discord visible, "Discord connected" gone, `GET /api/users/me` returns `discord_linked` false. The seed re-links on the next run.
- T065 [US4] Frontend gate as in T055; `scripts/e2e.sh e2e/profile-discord.spec.ts` green; no `applika-e2e-*` container left.
- T066 [US5] In frontend/src/app/(protected)/profile/profile-page.tsx, `status=error` →
  - a notice saying Discord was not connected and the user can try again;
  - user query invalidated;
  - `router.replace('/profile')`;
  - the card still offers Connect Discord.
- T067 [P] [US5] Vitest in frontend/src/app/(protected)/profile/profile-page.test.tsx: the error notice shows; each of `linked`, `conflict` and `error` shows its own notice and only that one.
- T068 [US5] The plan's E2E has no failed flow; vitest carries it. Confirm frontend/e2e/profile-discord.spec.ts is still green.
- T069 [US5] Frontend gate as in T055; no `applika-e2e-*` container left.
AC:
- The profile page offers a Connect Discord action when the user has no Discord link.
- The system asks Discord only for the permission that reveals the Discord user id.
- The profile page shows "Discord connected" and a Disconnect Discord action when the user has a Discord link, and never shows the Discord id, name or avatar.
- When the Discord account is already linked to another Applika user, the system refuses, changes nothing for either user, and the profile page says the Discord account is linked to another Applika account. **As built; R-008 rewritten 2026-09-24 (transfer), see K6. The notice now shows only on the two-user race.**
- The system returns the user to the profile page after the Discord consent screen with one of three outcomes: connected, already linked elsewhere, or failed. **As built; R-009 narrowed 2026-09-24 ("already linked" only on the two-user race), see K6.**
- A user who disconnected can connect Discord again, the same account or another one.

## (old K5 — closing: deleted 2026-09-24 by the owner; section dropped. T070..T078 were its steps and are not reused.)

## K5 — S5 Release A2 migration: discord_connections + discord_report_webhooks, merged into the integration branch   side: backend   covers: R-007, R-013, R-021, R-022, R-040 (schema level; code K6, K8)   deps: —
Owner's words: "(2026-09-24) i would like to abandom the last ticket and expand this plan, when the user clicks to connect thir applika account with discord, i want to save the refresh token and all data related to this connection in a new table istead directly in users, save only the refresh token criptografed (new end to set the encryption secret)." "Remove the environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which webhooks to send my reports (new table to save the discord webhook url, the server id - will be used to check if the user is in this server - and multiples roles id in this discord server - this is optional)."
Touch:
- backend/migrations/versions/<rev>_discord_connections_and_report_webhooks.py (new)
- backend/tests/integration/test_migration_discord_connections.py (new)
- backend/tests/integration/test_timeline_contract_migration.py
- backend/CHANGELOG.md
- deleted at the merge: backend/migrations/versions/a7e5c2f19b4d_add_discord_id_to_users.py, backend/tests/integration/test_migration_discord_id.py
Pattern:
- backend/migrations/versions/afd4074c70c2_timeline_events_expand.py (PG enum + new table)
- backend/migrations/versions/c1d9f4a7b3e6_tailored_cv_base_snapshot.py (docstring shape, head placement)
- backend/tests/integration/test_migration_tailored_cv_base_snapshot.py (round trip)
Release gate: Release A2.
- Branch `integration/0009-release-a2` from `develop`; tag `0009-release-a2`.
- Owner: merge the tag into `develop` → release → `alembic upgrade head` in the API container → restart → confirm. Release B merges only after that.
- Rollback A2 = `alembic downgrade c1d9f4a7b3e6` + the previous image. It drops both tables, so users reconnect and admins re-enter webhooks.
Steps:
- T079 [US1] Branch and head:
  - `git switch -c integration/0009-release-a2 develop`.
  - Re-check the head: `grep -rn "^down_revision" backend/migrations/versions/`. Expect the develop head `c1d9f4a7b3e6`; `a7e5c2f19b4d` does not exist on this branch.
- T080 [US1] Create backend/migrations/versions/<rev>_discord_connections_and_report_webhooks.py (new). The id is new, never `a7e5c2f19b4d`; `down_revision = 'c1d9f4a7b3e6'` (re-checked). `upgrade()`:
  - enum `discord_connection_status`, with the lower-case labels `active` and `needs_reconnect` (as `event_type` does);
  - table `discord_connections`:
    - the BaseMixin `id`/`created_at`/`updated_at` columns, exactly as `domain/models.py` `BaseMixin` declares them;
    - `user_id BIGINT NOT NULL`, FK `users.id` ON DELETE CASCADE, unique `uq_discord_connections_user_id`;
    - `discord_id BIGINT NOT NULL`, unique `uq_discord_connections_discord_id`;
    - `username VARCHAR(32) NOT NULL`, `global_name VARCHAR(32) NULL`, `avatar VARCHAR(64) NULL`;
    - `scopes VARCHAR(255) NOT NULL`, `encrypted_refresh_token TEXT NOT NULL`, `access_token_expires_at TIMESTAMPTZ NULL`;
    - `status discord_connection_status NOT NULL DEFAULT 'active'`;
    - `linked_at TIMESTAMPTZ NOT NULL DEFAULT now()`.
  - No access-token column, no server column, no role column.
- T081 [US6] In the same revision, table `discord_report_webhooks`:
  - the BaseMixin columns;
  - `guild_id BIGINT NOT NULL`, index `ix_discord_report_webhooks_guild_id`;
  - `webhook_url VARCHAR(500) NOT NULL`, unique `uq_discord_report_webhooks_webhook_url`;
  - `role_ids BIGINT[] NOT NULL`, defaulting to an empty array;
  - `label VARCHAR(100) NULL`;
  - no `user_id`: it is a platform catalog, admin-only (ADR-0004).
  `users` stays untouched, `is_org_member` included.
- T082 [US1] `downgrade()` drops `discord_report_webhooks`, then `discord_connections`, then the enum `discord_connection_status`: only this revision's objects. The docstring cites:
  - .claude/rules/non-destructive-migrations.md 1-2;
  - runbook rule 4 (Release A2: no code reads the tables yet);
  - ADR-0013;
  - that it replaces the unshipped `a7e5c2f19b4d`.
- T083 [P] [US1] Round-trip test in backend/tests/integration/test_migration_discord_connections.py (new): testcontainers Postgres, real Alembic chain. Seed users (`is_org_member` true and false) at `c1d9f4a7b3e6`, then:
  - **upgrade:**
    - both tables and the enum exist;
    - `users` rows, columns and values are unchanged;
    - insert one connection and one webhook;
    - a duplicate `discord_id`, a second row for the same `user_id` and a duplicate `webhook_url` each raise IntegrityError;
    - `role_ids` defaults to an empty array and `status` to `active`;
    - deleting the user deletes its connection;
    - no column or table is missing.
  - **downgrade to `c1d9f4a7b3e6`:** both tables and the enum are gone; `users` is intact.
  - **upgrade again:** the structure equals the first upgrade.
- T084 [US1] In backend/tests/integration/test_timeline_contract_migration.py, update `test_only_one_head`:
  - heads == [<rev>];
  - `<rev>.down_revision == 'c1d9f4a7b3e6'`;
  - keep the chain walk;
  - the docstring names K5.
- T085 [US1] In backend/CHANGELOG.md, under `## [Unreleased]` / Added: `- Migration <rev> (Release A2, expand only): enum discord_connection_status, tables discord_connections and discord_report_webhooks; users untouched; no code reads them yet.`
- T086 [US1] Verify on the A2 branch:
  - `grep -nE "op\.drop_(column|table)"` hits only inside `downgrade()`;
  - `git diff develop --name-only` lists only `backend/migrations/versions/`, `backend/tests/integration/` and `backend/CHANGELOG.md` (runbook 4);
  - on a local DB at `c1d9f4a7b3e6`: `uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head`;
  - `uv run pytest tests/integration -k migration` is green.
- T087 [US1] Backend gate:
  - `uv run ruff format --check ./app`;
  - `uv run ruff check ./app`;
  - `uv run ty check`: ≤ 171, not above the count at slice start, changed files clean;
  - `uv run pytest . --cov=app`: ≥ 90%.
- T088 [US1] Commit `feat(migrations): discord connection and report webhook tables`, then tag the A2 tip `0009-release-a2` (local). Record at slice close:
  - owner steps and rollback A2 (Release gate above);
  - `0009-release-a` is retired and never merged;
  - the agent never touches prod.
- T089 [US1] Dev DB, before the merge. The `integration/0009-discord-account-link` tip still carries `a7e5c2f19b4d`. Any local DB at `a7e5c2f19b4d` runs `cd backend && uv run alembic downgrade c1d9f4a7b3e6` on that tip, BEFORE the merge.
  - A missed downgrade fails loudly ("Can't locate revision a7e5c2f19b4d").
  - To recover: check out the pre-merge tip, downgrade, return.
- T090 [US1] Merge: `git switch integration/0009-discord-account-link && git merge --no-ff integration/0009-release-a2`. A plain merge: no rebase, no rewrite, no force push. Resolve:
  - delete backend/migrations/versions/a7e5c2f19b4d_add_discord_id_to_users.py and backend/tests/integration/test_migration_discord_id.py (unshipped, replaced, ADR-0013);
  - backend/tests/integration/test_timeline_contract_migration.py: take the A2 pin (one head = <rev>) and drop the K1 docstring lines;
  - backend/CHANGELOG.md: remove the K1 `users.discord_id` entry (never released), keep the K5 entry.
  Merge commit: `chore(migrations): merge 0009-release-a2, retire unshipped a7e5c2f19b4d`.
- T091 [US1] After the merge:
  - `uv run alembic heads` shows one head, <rev>;
  - `uv run pytest tests/integration -k migration` and `uv run pytest .` are green.
  Record: this tip still maps `UserModel.discord_id`, and no revision creates it now. A migrated dev or E2E stack returns 500 until K6 T094. Run no stack on this tip; K6 starts next.
AC:
- A Discord account is linked to at most one Applika user.
- Deleting the Applika account removes the Discord link.
- After a successful connection the system keeps the connection in a record of its own, apart from the user's account data. The record holds the Discord user id, username, display name and avatar, the granted permissions, the access expiry, the connection state, and the times of linking and of the last update.
- The system stores the Discord refresh token encrypted with a secret used only for Discord, separate from the GitHub one, and never stores the Discord access token.
- The system reads a user's servers and roles when a report is submitted and never stores them.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)

## K6 — S6 backend: Discord connection record, encrypted grant, reconnect, link transfer, revoke on disconnect, /users/me discord   side: backend (+ E2E seed, compose, one spec line)   covers: R-001, R-007, R-008, R-009, R-010, R-012, R-013, R-015, R-017 (feedback, narrowed), R-019, R-020, R-021, R-022, R-024, R-025, R-027, R-028, R-041   deps: K5, K4
**Reopened 2026-09-24 for the R-008 rewrite.**
- Why: the build flagged that revoking the new grant on a link conflict could cancel the holder's grant at Discord.
- Owner: "drop the old connection and create the new one". Confirmed option: "Move the link to B (Recommended)".
- Change: a Discord id held by another user now moves to the caller. The holder's row is deleted, the caller's row is written with the new grant, nothing is revoked at Discord, and the callback answers `status=linked`. `status=conflict` remains only for the two-user race (IntegrityError), and it revokes nothing either.
- Changed: the callback Contract line, T095, T097, T101, T103, T104, T105, T107, T108, the AC, and K10 T158. No frontend change: the K4 conflict notice stays for the race.
Owner's words: "Keep github login but add an option in user profile to sincronize with discord." "(2026-09-24) i would like to abandom the last ticket and expand this plan, when the user clicks to connect thir applika account with discord, i want to save the refresh token and all data related to this connection in a new table istead directly in users, save only the refresh token criptografed (new end to set the encryption secret)."
Touch:
- backend/app/config/settings.py
- backend/app/core/crypto.py
- backend/app/core/enums.py
- backend/app/domain/models.py
- backend/app/application/dto/discord.py (new)
- backend/app/application/dto/user.py
- backend/app/domain/repositories/discord_connection_repository.py (new)
- backend/app/domain/repositories/user_repository.py
- backend/app/application/services/discord_oauth_service.py
- backend/app/application/use_cases/account_links/link_discord.py
- backend/app/application/use_cases/account_links/unlink_discord.py
- backend/app/presentation/api/account_link.py
- backend/app/presentation/api/user.py
- backend/app/presentation/api/user_feedback.py
- backend/app/presentation/api/reports.py (interim id source)
- backend/app/presentation/schemas/user.py
- backend/app/presentation/dependencies.py
- backend/app/scripts/seed_e2e.py
- backend/tests/conftest.py
- backend/tests/unit/test_discord_crypto.py (new)
- backend/tests/unit/test_discord_oauth_service.py
- backend/tests/unit/test_link_discord.py
- backend/tests/unit/test_unlink_discord.py
- backend/tests/unit/test_seed_e2e.py
- backend/tests/integration/test_account_link_discord.py
- backend/tests/integration/test_users.py
- backend/tests/integration/test_delete_account.py
- backend/tests/integration/test_user_feedback.py
- backend/tests/integration/test_quinzenal_reports.py
- docker-compose.e2e.yml
- frontend/e2e/profile-discord.spec.ts (scope line only)
- .env.example
- docker-compose.yml
- backend/docker-compose.yml
- backend/README.md
- backend/CLAUDE.md
- backend/CHANGELOG.md
- cli/CHANGELOG.md
Pattern:
- backend/app/core/crypto.py (Fernet, None on InvalidToken)
- backend/app/domain/repositories/user_repository.py (current `link_discord` pre-check + IntegrityError → ResourceConflict; moves)
- backend/app/domain/repositories/base_cv_repository.py (`FOR UPDATE`)
- backend/app/application/services/github_service.py (httpx error handling)
Contract: prefix `/api`.
- `POST /auth/link/discord` →
  - 200 `{"authorize_url": "https://discord.com/oauth2/authorize?...&scope=identify+guilds+guilds.members.read&state=<nonce>"}`
  - 401
  - 503 `{"detail": "Discord linking is not configured"}` when the id, the secret or the key is missing
- The callback answers 307 `?account=discord&status=linked|conflict|error`; the values are unchanged. A Discord id held by another user → `linked` (transfer). `conflict` only when the two-user race is lost. It sets no cookie.
- `DELETE /auth/link/discord` → 200 `{"provider": "discord", "linked": false}` | 401. It deletes the row and revokes best-effort.
- `GET|PATCH /users/me` add `"discord": {"username", "global_name", "avatar_url", "status": "active"|"needs_reconnect"} | null`. `discord_linked` = `discord != null`. There is no `discord_id` key.
- `DELETE /users/me` revokes best-effort; the row goes by cascade.
Steps:
- T092 [US1] On `integration/0009-discord-account-link`, after the K5 merge, add `DISCORD_TOKEN_ENCRYPTION_KEY: str | None = None` to backend/app/config/settings.py. `DISCORD_REPORTS_*` stays until K8.
- T093 [US1] In backend/app/core/crypto.py, add `encrypt_discord_token(plaintext) -> str` and `decrypt_discord_token(ciphertext) -> str | None`:
  - their own Fernet, keyed by `DISCORD_TOKEN_ENCRYPTION_KEY`;
  - `InvalidToken` or an unset key → None.
  The GitHub functions stay unchanged.
- T094 [US1] Model and DTOs:
  - `DiscordConnectionStatus` (`active`, `needs_reconnect`) in backend/app/core/enums.py;
  - `DiscordConnectionModel` in backend/app/domain/models.py, with names and types exactly as in the K5 revision: enum name `discord_connection_status`, lower-case labels, the `uq_*` names, FK `ondelete='CASCADE'`;
  - remove `UserModel.discord_id`, and `UserDTO.discord_id` from backend/app/application/dto/user.py;
  - `DiscordConnectionDTO` in backend/app/application/dto/discord.py (new): the public fields, no token.
  The E2E run (T110) against the migrated stack proves that the model matches the revision.
- T095 [US1] Create backend/app/domain/repositories/discord_connection_repository.py (new):
  - `get_by_user_id` and `get_by_user_id_for_update` (`with_for_update()`);
  - `link(user_id, discord_id, username, global_name, avatar, scopes, encrypted_refresh_token, access_token_expires_at)`:
    - another user holds the id → that user's row is deleted, then the caller's row is written, in one transaction (R-008 transfer);
    - the user's own row → updated in place, with `status=active` and `linked_at=now()`;
    - an IntegrityError on commit (two-user race) → rollback, then `ResourceConflict(DISCORD_ALREADY_LINKED)`;
  - `store_grant(user_id, encrypted_refresh_token, access_token_expires_at, scopes)`;
  - `mark_needs_reconnect(user_id)`;
  - `delete_by_user_id(user_id)`, idempotent.
  `DISCORD_ALREADY_LINKED` moves here. `get_by_discord_id`, `link_discord` and `unlink_discord` leave backend/app/domain/repositories/user_repository.py.
- T096 [US1] Rework backend/app/application/services/discord_oauth_service.py:
  - `SCOPE = 'identify guilds guilds.members.read'`;
  - `is_configured()` needs the id, the secret and the key;
  - `exchange_code(code) -> DiscordGrant(access_token, refresh_token, expires_in, scope)`, with the token fields `repr=False`;
  - `fetch_profile(access) -> DiscordProfile(id, username, global_name, avatar)`;
  - no revoke at connect;
  - `refresh(refresh) -> DiscordGrant`: 400 `invalid_grant` → `DiscordGrantRevoked`; 429, 5xx or `httpx.HTTPError` → `DiscordUnavailable`;
  - `revoke(refresh)`: `token_type_hint=refresh_token`, best-effort, swallowed and logged without values;
  - timeout 5 s;
  - `fetch_discord_id` and `revoke_token` are removed;
  - tokens and codes are never logged.
  The docstring keeps the T013 decision.
- T097 [US1] Link use case and DI:
  - `LinkDiscordUseCase(conn_repo).execute(user_id, grant, profile)` in backend/app/application/use_cases/account_links/link_discord.py: encrypt the refresh token, then `conn_repo.link`. It calls nothing at Discord, in any outcome:
    - on a transfer, no revoke: a revoke could cancel the caller's new grant (same Discord user, same app);
    - on `ResourceConflict` (race), no revoke for the same reason; re-raise.
  - In backend/app/presentation/dependencies.py: `get_discord_connection_repository` + `DiscordConnectionRepositoryDp`; the link use case takes the connection repo; the unlink use case takes the connection repo and the OAuth service.
- T098 [US1] In backend/app/presentation/api/account_link.py:
  - callback step 4 = `exchange_code` + `fetch_profile`; `DiscordLinkError` → `status=error`;
  - steps 1-3 stay unchanged;
  - begin answers 503 when the id, the secret or the key is missing;
  - the callback answers `error` when unconfigured;
  - no `Set-Cookie` (R-001).
- T099 [US1] `/users/me`:
  - in backend/app/presentation/schemas/user.py: `DiscordAccountOut {username, global_name, avatar_url, status}` and `UserProfile.discord: DiscordAccountOut | None`;
  - `from_user(user, connection=None)` sets `discord`, and `discord_linked = discord is not None`;
  - `avatar_url` = `https://cdn.discordapp.com/avatars/{discord_id}/{avatar}.png?size=64`, None without an avatar;
  - no `discord_id` key;
  - backend/app/presentation/api/user.py `get_me`/`update_me` read the connection.
- T100 [US2] Mention id source:
  - backend/app/presentation/api/user_feedback.py reads `discord_id` from the connection, in any status (R-041);
  - backend/app/presentation/api/reports.py does the same read as an interim step, with the org gate unchanged; K8 replaces it.
  The payload stays byte-identical.
- T101 [US3] Transfer (R-008):
  - user B's callback carries a Discord id that user A holds → A's row is deleted, B's row is written with B's new grant, nothing is revoked at Discord, and the callback answers `status=linked`;
  - A's `/users/me` then returns `discord` null, and A's feedback has no mention;
  - the callback still maps `ResourceConflict` → `status=conflict`, now only for the two-user race: the loser stores nothing, nothing is revoked, and the winner is unchanged.
- T102 [US4] Unlink, in backend/app/application/use_cases/account_links/unlink_discord.py:
  - read the row, `delete_by_user_id`, then `revoke(decrypted refresh)` best-effort;
  - skip the revoke when unconfigured or when decrypt returns None;
  - idempotent.
  `DELETE /auth/link/discord` keeps its body and gets no `is_configured` gate. In backend/app/presentation/api/user.py, `delete_me` runs `UnlinkDiscordUseCase` before `user_repo.delete`.
- T103 [US8] Reconnect: `link` on the user's own row refreshes username, global_name, avatar, scopes, token and expiry, and sets `status=active` and `linked_at=now()`. A `needs_reconnect` user who authorises a different Discord account gets the row replaced in place. If another user holds that account, it moves as in T101: that user's row is deleted, and nothing is revoked.
- T104 [P] [US1] Unit tests:
  - backend/tests/unit/test_discord_crypto.py (new):
    - round trip;
    - the GitHub key cannot decrypt;
    - an unset key → None.
  - backend/tests/unit/test_discord_oauth_service.py (rewrite, `httpx.MockTransport`):
    - the scope string is exact;
    - exchange and profile parse;
    - no revoke at connect;
    - refresh: `invalid_grant` → revoked; 429, 5xx or network → unavailable;
    - revoke uses hint `refresh_token`, and its failure is swallowed;
    - tokens and the code are absent from logs and from `repr(grant)`;
    - `is_configured` is false without the key.
  - backend/tests/unit/test_link_discord.py and backend/tests/unit/test_unlink_discord.py:
    - link encrypts (decrypts with the Discord key only);
    - another user holds the id → that row deleted, the caller's row written, no revoke call;
    - race (IntegrityError) → rollback, `ResourceConflict`, no row, no revoke call;
    - reconnect updates in place and clears the mark;
    - unlink deletes, then revokes; a revoke failure is swallowed;
    - an unlinked user → no-op, no HTTP.
- T105 [US1] Integration tests. backend/tests/conftest.py `override_get_current_user` drops `discord_id`. `DiscordOAuthServiceDp` is overridden by a fake (no network).
  - backend/tests/integration/test_account_link_discord.py:
    - begin: the scope is `identify guilds guilds.members.read`, with a state; 503 without the key;
    - linked → the row holds every R-021 field, and `encrypted_refresh_token` decrypts with the Discord key only;
    - `users` has no Discord column;
    - replay, expired or unknown state, cookie mismatch, missing cookie, `error=access_denied` and `DiscordLinkError` → error, nothing stored;
    - B links A's Discord id → `status=linked`, A's row gone, B's row holds B's grant, no revoke call, A's `/users/me` `discord` null;
    - a race (IntegrityError) → `status=conflict`, nothing stored for the loser, no revoke call;
    - reconnect → linked, the row refreshed, the mark cleared;
    - disconnect → row gone, revoke called, 200; idempotent; anonymous → 401; unconfigured → 200 with no revoke;
    - relink the same account or another one; another user can link the freed id.
  - backend/tests/integration/test_users.py:
    - `GET` and `PATCH /users/me` return the `discord` object or null, and `discord_linked` matches;
    - no `discord_id` key anywhere in the body;
    - a `needs_reconnect` row → `status: needs_reconnect`.
  - backend/tests/integration/test_delete_account.py: a linked user is deleted → the row is gone, revoke was tried, and the freed id can be linked again.
  - backend/tests/integration/test_user_feedback.py:
    - linked (active or `needs_reconnect`) → mention;
    - unlinked → None, payload byte-identical;
    - after disconnect → no mention;
    - after the link moved to another user (T101) → no mention for the previous holder.
  - backend/tests/integration/test_quinzenal_reports.py: the interim path links through a connection row; the org-member mention path stays green.
- T106 [US1] E2E harness:
  - backend/app/scripts/seed_e2e.py:
    - drop `user.discord_id`;
    - `e2e-discord` gets a connection row, re-set on every run: `E2E_DISCORD_ID`, `e2e-discord` / `E2E Discord`, avatar None, scopes = `SCOPE`, a dummy refresh token encrypted with the stack key, `active`;
    - the connections of `e2e-user` and `e2e-admin` are deleted on every run;
    - the JSON contract is unchanged, so scripts/e2e.sh and frontend/e2e/support/auth.ts stay as they are.
  - backend/tests/unit/test_seed_e2e.py follows the seed.
  - docker-compose.e2e.yml: add a fixed throwaway Fernet key as `DISCORD_TOKEN_ENCRYPTION_KEY` in the `api` env, distinct from the GitHub one.
  - frontend/e2e/profile-discord.spec.ts: the scope assertion becomes `identify guilds guilds.members.read`. Nothing else changes.
  - Disconnect in E2E now revokes against discord.com with dummy credentials, best-effort. It is swallowed within the 5 s timeout.
- T107 [US1] Env and docs:
  - add `DISCORD_TOKEN_ENCRYPTION_KEY` to .env.example, docker-compose.yml, backend/docker-compose.yml and backend/README.md;
  - backend/CLAUDE.md, Account links section: the scopes, the encrypted grant, no revoke at connect in any outcome, the link transfer (holder's row deleted; `conflict` only on the race), revoke on disconnect and on account delete, `needs_reconnect`, the `discord` object on `/users/me`, the env var;
  - backend/CLAUDE.md, Domain Model: `DiscordConnection`; `users` has no Discord column.
  Confirm backend/scripts/seed_mock_data.py still runs.
- T108 [US1] Changelogs (rule 3):
  - backend/CHANGELOG.md:
    - rewrite the unreleased K2 and K4 entries to match what ships; the K2 conflict entry (T030) now says a Discord account held by another user moves to the new user, and `status=conflict` only answers a lost race;
    - add K6 Added/Changed lines.
  - cli/CHANGELOG.md, under `[Unreleased]` / Changed:
    - correct the K2 line;
    - add `- GET|PATCH /users/me also return discord {username, global_name, avatar_url, status} or null; additive; discord_linked kept; 0.1.4, 0.2.0, 1.0.0 unaffected.`
- T109 [US1] CLI compatibility:
  - `uv run pytest tests -k "steps or finalize or supports"` in backend;
  - `make test` in cli;
  - `whoami` reads dict keys (cli/src/applika/commands/auth.py).
- T110 [US1] Gates:
  - backend gate as in K5 T087;
  - `grep -rn "_old" backend/app/` has no hits;
  - frontend: `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test`;
  - `scripts/e2e.sh e2e/profile-discord.spec.ts e2e/smoke.spec.ts` green on the stack migrated through K5;
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` is empty.
- T111 [US1] Record at slice close:
 the K6 tip is not a merge point (Release B = the K10 tip). B deployed before A2's migration → `/users/me` reads a missing table → every page returns 500.
AC:
- The system keeps GitHub as the only way to sign in; connecting Discord never creates or changes a session.
- A Discord account is linked to at most one Applika user.
- When a user completes Discord consent for a Discord account that is linked to another Applika user, the system moves the link to the user who completed it. It deletes the other user's connection record, creates the new user's record with the grant just received, revokes nothing at Discord, and returns the new user to the profile page with the outcome connected. The Discord account stays linked to at most one Applika user (R-007).
- The system returns the user to the profile page after the Discord consent screen with one of three outcomes: connected, failed, or already linked to another Applika account. The last one occurs only when another user linked the same Discord account at the same instant and won.
- The system accepts a Discord consent result only for the same signed-in user who started it, only once, and within a short time window.
- A user who disconnected can connect Discord again, the same account or another one.
- Deleting the Applika account removes the Discord link.
- When a linked user's feedback is posted to Discord, the post mentions that user.
- A post for an unlinked user is exactly what Applika sends today. Narrowed 2026-09-24: holds for feedback only; an unlinked user's report is posted nowhere (R-036).
- The installed command-line tool keeps working unchanged.
- The system asks Discord for permission to read the user's identity, the servers the user is in, and the user's roles in those servers, and for nothing more.
- After a successful connection the system keeps the connection in a record of its own, apart from the user's account data. The record holds the Discord user id, username, display name and avatar, the granted permissions, the access expiry, the connection state, and the times of linking and of the last update.
- The system stores the Discord refresh token encrypted with a secret used only for Discord, separate from the GitHub one, and never stores the Discord access token.
- Disconnect Discord removes the connection record and asks Discord to revoke the stored grant, and a Discord failure does not block the disconnect.
- The profile data the API returns tells whether Discord is connected, the Discord name and avatar, and whether the connection needs reconnecting. It never carries the Discord id as a field.
- Reconnecting runs the same consent flow, refreshes the stored data and clears the reconnection mark.
- Each time the system renews Discord access, it replaces the stored refresh token with the new one, encrypted.
- Feedback keeps going to its one configured feedback webhook. It mentions a user who has a Discord connection, whatever that user's servers or connection state.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- A backend change that affects the CLI goes in both files. (.claude/rules/changelogs.md 3)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K7 — S7 backend: admin report webhooks API (/admin/discord-webhooks)   side: backend   covers: R-029, R-030, R-031   deps: K5
Owner's words: "Remove the environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which webhooks to send my reports (new table to save the discord webhook url, the server id - will be used to check if the user is in this server - and multiples roles id in this discord server - this is optional)."
Touch:
- backend/app/domain/models.py
- backend/app/application/dto/discord.py
- backend/app/domain/repositories/discord_report_webhook_repository.py (new)
- backend/app/application/validators/discord_webhook.py (new)
- backend/app/application/use_cases/admin/discord_webhooks/__init__.py (new)
- backend/app/application/use_cases/admin/discord_webhooks/list_discord_webhooks.py (new)
- backend/app/application/use_cases/admin/discord_webhooks/create_discord_webhook.py (new)
- backend/app/application/use_cases/admin/discord_webhooks/update_discord_webhook.py (new)
- backend/app/application/use_cases/admin/discord_webhooks/delete_discord_webhook.py (new)
- backend/app/presentation/schemas/discord_webhook.py (new)
- backend/app/presentation/api/admin/discord_webhooks.py (new)
- backend/app/presentation/api/admin/__init__.py
- backend/app/presentation/dependencies.py
- backend/tests/unit/test_discord_webhook_validation.py (new)
- backend/tests/integration/test_admin_discord_webhooks.py (new)
- backend/CLAUDE.md
- backend/CHANGELOG.md
Pattern:
- backend/app/presentation/api/admin/platforms.py
- backend/app/application/use_cases/admin/platforms/
- backend/app/domain/repositories/platform_repository.py
- backend/tests/integration/test_admin.py (`admin_client` in backend/tests/conftest.py)
Contract: prefix `/api`, all four behind `AdminUserDp`.
- `GET /admin/discord-webhooks` → 200 `[{"id", "label", "guild_id", "role_ids": [str], "webhook_url_masked", "created_at", "updated_at"}]` | 401 | 403 `{"detail": "Admin access required"}`.
- `POST` with `{"webhook_url", "guild_id", "role_ids"?, "label"?}` → 201 row | 401 | 403 | 409 `{"detail": "This webhook is already configured"}` | 422.
- `PATCH /admin/discord-webhooks/{id}` (partial) → 200 | 401 | 403 | 404 `{"detail": "Discord webhook not found"}` | 409 | 422.
- `DELETE /admin/discord-webhooks/{id}` → 204 | 401 | 403 | 404.
- Ids travel as strings. No full URL appears in any response or log.
Steps:
- T112 [US6] Add `DiscordReportWebhookModel` to backend/app/domain/models.py, exactly as the K5 revision declares it:
  - `guild_id BigInteger`, with the index name;
  - `webhook_url String(500)`, with the unique name;
  - `role_ids ARRAY(BigInteger)`, not null, empty-array server default;
  - `label String(100)`, nullable;
  - no `user_id`.
- T113 [US6] Create backend/app/application/validators/discord_webhook.py (new):
  - URL regex from the plan Backend section (https only; discord.com or discordapp.com; ptb or canary; optional `/v<n>`);
  - ids: `^\d{17,20}$` AND ≤ 9223372036854775807 (plan correction);
  - at most 25 role ids, deduped, order kept;
  - label trimmed, ≤ 100, blank → None;
  - `mask(url)` → `https://discord.com/api/webhooks/<webhook_id>/…<last4>`;
  - errors carry fixed messages and never the URL.
- T114 [US6] Create backend/app/domain/repositories/discord_report_webhook_repository.py (new):
  - `list_all` (ordered by `created_at`), `get_by_id`, `list_by_guild_ids(ids)` (used by K8), `create`, `update`, `delete`;
  - an IntegrityError on the URL → rollback, then `ResourceConflict('This webhook is already configured')`.
- T115 [US6] DTO and use cases:
  - `DiscordReportWebhookDTO` in backend/app/application/dto/discord.py, with `webhook_url` `repr=False`;
  - the list, create, update and delete use cases under backend/app/application/use_cases/admin/discord_webhooks/ (new), on the pattern of `admin/platforms/`;
  - a missing row → `ResourceNotFound('Discord webhook not found')`.
- T116 [US6] Schemas in backend/app/presentation/schemas/discord_webhook.py (new):
  - create `{webhook_url, guild_id, role_ids?, label?}`; patch, all fields optional;
  - out `{id, label, guild_id, role_ids, webhook_url_masked, created_at, updated_at}`, ids as `SnowflakeID` strings;
  - no `webhook_url` field goes out.
  No 422 body echoes the submitted URL. FastAPI's default 422 carries `input`, so the builder chooses one fix: validate the URL in the use case (`BusinessRuleViolation` → 422, fixed message), or strip `input` for that field. The test pins it.
- T117 [US6] Create the route file backend/app/presentation/api/admin/discord_webhooks.py (new):
  - `APIRouter(prefix='/admin', tags=['Admin - Discord webhooks'])`;
  - `AdminUserDp` on all four routes;
  - add it to `routers` in backend/app/presentation/api/admin/__init__.py;
  - DI in backend/app/presentation/dependencies.py.
- T118 [US9] PATCH and DELETE:
  - PATCH is partial. An absent or blank `webhook_url` keeps the stored one; a new URL is re-validated, and a duplicate → 409. `role_ids` replaces the list; `label: null` clears it.
  - DELETE → 204.
  - An unknown id → 404 on PATCH and on DELETE.
- T119 [US9] No response, log line or error message carries a full URL. Logs name the webhook id only.
- T120 [P] [US6] Unit tests in backend/tests/unit/test_discord_webhook_validation.py (new):
  - accepted: discord.com, discordapp.com, ptb., canary., with and without `/v10`;
  - refused: http, another host, a missing token, a query string, 16- or 21-digit ids, an id above the BIGINT max, 26 role ids;
  - dedupe;
  - the mask shape.
- T121 [US6] Integration tests in backend/tests/integration/test_admin_discord_webhooks.py (new):
  - anonymous → 401 on all four routes;
  - non-admin `async_client` → 403 "Admin access required" on all four;
  - a CRUD round trip;
  - the 422 cases;
  - 409 on a duplicate, on POST and on PATCH;
  - 404;
  - no response body, 422 included, contains the token segment of the URL.
- T122 [US6] Docs, changelog and gate:
  - backend/CLAUDE.md: the new admin endpoints and their rules;
  - backend/CHANGELOG.md, Added: the admin report webhooks API. It is not a CLI route, so there is no CLI entry;
  - backend gate as in K5 T087;
  - `grep -rn "_old" backend/app/` has no hits.
AC:
- An administrator can list, add, change and remove report webhooks. Each webhook holds a Discord webhook address, a Discord server id, and zero or more Discord role ids.
- The system accepts a report webhook only when its address is a secure Discord webhook address and the server id and role ids are Discord ids.
- After a report webhook is saved, the system never shows its full address again, only a masked form.
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K8 — S8 backend: route reports by live Discord servers and roles; GitHub organisation membership retired   side: backend   covers: R-014, R-016, R-019, R-026 (mark), R-028, R-032, R-033, R-034, R-035, R-036, R-037, R-038, R-039, R-040, R-042, R-043 (unmapped)   deps: K6, K7
Owner's words: "What i want is, when a user created a report, if this user connected their account with discord, my application needs to use the refresh token to get an access token and get a list of server ids this user is in discord, with list list i fetch from this new table all web hooks configured to the server id i fetched from my user, and then check if an admin have limited by roles id, i also need's to check if this user have the role id in that server, with everyting done, i then send the repport message in the webhooks" "Remove the environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which webhooks to send my reports (new table to save the discord webhook url, the server id - will be used to check if the user is in this server - and multiples roles id in this discord server - this is optional)."
Touch:
- backend/app/application/services/discord_oauth_service.py
- backend/app/application/dto/discord.py
- backend/app/application/use_cases/quinzenal_reports/resolve_report_webhooks.py (new)
- backend/app/application/use_cases/quinzenal_reports/submit_report.py
- backend/app/application/services/discord_service.py
- backend/app/presentation/api/reports.py
- backend/app/presentation/dependencies.py
- backend/app/config/settings.py
- backend/app/presentation/api/oauth.py
- backend/app/application/services/github_service.py
- backend/app/application/use_cases/user_registration.py
- backend/app/application/dto/user.py
- backend/app/application/dto/admin.py
- backend/app/presentation/schemas/admin.py
- backend/app/domain/repositories/admin_repository.py
- backend/app/domain/models.py
- backend/tests/unit/test_resolve_report_webhooks.py (new)
- backend/tests/unit/test_discord_oauth_service.py
- backend/tests/unit/test_discord_mentions.py
- backend/tests/unit/test_oauth_cli.py
- backend/tests/integration/test_quinzenal_reports.py
- backend/tests/integration/test_oauth_cli.py
- backend/tests/integration/test_admin.py
- .env.example
- docker-compose.yml
- backend/docker-compose.yml
- backend/README.md
- backend/CLAUDE.md
- backend/CHANGELOG.md
Pattern:
- backend/app/domain/repositories/base_cv_repository.py and backend/app/application/use_cases/base_cvs/create.py (`FOR UPDATE` held within one transaction)
- backend/tests/integration/test_quinzenal_reports.py (recording fakes via `dependency_overrides`)
Contract:
- `POST /reports/{day}/submit` keeps its shape: `{success, report_id, discord_posted, discord_error}`. It is 201 whatever Discord answers.
- `GET /auth/github/login` and `/auth/cli/login/{id}` redirect to GitHub with `scope=user:email` only.
- `GET /admin/users/{id}` loses `is_org_member`. It is not a CLI route.
- Webhook payload per URL: `{"content": "<header> - @name <@id>...", "allowed_mentions": {"parse": [], "users": ["<id>"]}}`.
Steps:
- T123 [US7] In backend/app/application/services/discord_oauth_service.py add:
  - `list_guild_ids(access) -> set[int]`: `GET /api/users/@me/guilds?limit=200`;
  - `get_member_role_ids(access, guild_id) -> set[int]`: `GET /api/users/@me/guilds/{guild_id}/member`; 404 → empty;
  - any other non-2xx or an `httpx.HTTPError` → `DiscordUnavailable`;
  - never sleep on 429.
- T124 [US7] Add `ReportRouteDTO(discord_id, webhook_urls)` to backend/app/application/dto/discord.py, `webhook_urls` `repr=False`. Create `ResolveReportWebhooksUseCase.execute(user_id) -> ReportRouteDTO` in backend/app/application/use_cases/quinzenal_reports/resolve_report_webhooks.py (new):
  - lock the row with `get_by_user_id_for_update`;
  - no row, a `needs_reconnect` row or an unconfigured service → empty;
  - stored `scopes` lack `guilds` → mark `needs_reconnect`, empty (plan Risk);
  - decrypt returns None (key replaced) → mark, empty;
  - `refresh`:
    - `DiscordGrantRevoked` → mark, commit, empty;
    - `DiscordUnavailable` → release the lock, row unchanged, empty;
  - `store_grant` (rotated token encrypted, expiry, scopes) and commit, BEFORE the next Discord call;
  - `list_guild_ids` → `list_by_guild_ids`;
  - one `get_member_role_ids` call per distinct guild that holds a role-limited hook; a failure drops only that guild's role-limited hooks;
  - keep a hook when its `role_ids` is empty or the user's roles intersect it (any of, "one of those");
  - distinct URLs, ordered by `created_at`;
  - the access token stays local; servers and roles are never stored or logged.
- T125 [US7] In backend/app/application/services/discord_service.py:
  - the ctor drops the `DISCORD_REPORTS_WEBHOOK` fallback;
  - `post_report_message(message, mention_user_id=None, webhook_url=None)` posts to `webhook_url`, else to the ctor URL;
  - the payload stays unchanged;
  - no log line or returned error contains the URL.
  `get_discord_feedback_service` stays unchanged.
- T126 [US7] Rework backend/app/application/use_cases/quinzenal_reports/submit_report.py:
  - ctor `(report_repo, discord_service, resolve_webhooks)`;
  - drop `github_service`, `user_repo`, `_validate_org_membership` and the `decrypt_token` import;
  - `execute(user_id, username, day, payload)`.
  After the save:
  1. resolve the route;
  2. build the message once, with `route.discord_id`;
  3. call `post_report_message(message, mention_user_id, webhook_url=url)` per URL;
  4. `discord_posted` = any post ok;
  5. `discord_error` = the errors joined with `'; '`, ≤ 500 chars, None when there was nothing to post;
  6. update the row when posted.
  A Discord failure never raises.
- T127 [US7] Route and DI:
  - backend/app/presentation/api/reports.py deps: `QuinzenalReportRepositoryDp`, `DiscordServiceDp`, `ResolveReportWebhooksUseCaseDp`;
  - drop `GitHubServiceDp`, `UserRepositoryDp` and K6's interim connection read;
  - `get_resolve_report_webhooks_use_case` in backend/app/presentation/dependencies.py.
- T128 [US7] Remove `DISCORD_REPORTS_WEBHOOK` and `DISCORD_REPORTS_ORGANIZATION`:
  - from backend/app/config/settings.py; confirm that `extra='ignore'` still boots a stack that sets them;
  - from .env.example, docker-compose.yml, backend/docker-compose.yml and backend/README.md.
- T129 [US7] Retire GitHub organisation membership (R-042, R-043):
  - backend/app/presentation/api/oauth.py: l.48 scope becomes `['user:email']`; the org check at l.162-171 goes; call `UserRegistrationUseCase.execute(user, github_token=...)`; `gh_service` stays for `invalidate_cache`;
  - backend/app/application/services/github_service.py: drop `org_name`, `check_org_membership` and the org docstring lines;
  - backend/app/application/use_cases/user_registration.py: drop the `is_org_member` param, its writes and its log fields;
  - remove `is_org_member` from `UserDTO` (backend/app/application/dto/user.py l.36), from backend/app/application/dto/admin.py l.101, from `AdminUserDetailSchema` (backend/app/presentation/schemas/admin.py l.94) and from backend/app/domain/repositories/admin_repository.py l.422;
  - unmap `UserModel.is_org_member` in backend/app/domain/models.py. The column stays, and its `server_default false` keeps inserts working;
  - `encrypted_github_token` stays mapped.
- T130 [P] [US7] Unit tests in backend/tests/unit/test_resolve_report_webhooks.py (new), with fake repos and a fake service:
  - every branch of T124;
  - the rotated token is stored before the server-list call (call order);
  - one member call per role-limited guild, none for an unrestricted guild;
  - any of: holding one of two roles → kept; none → dropped;
  - a member-call failure drops only that guild's role-limited hooks;
  - URLs are distinct;
  - the token is absent from logs and from `repr` of the route.
- T131 [P] [US7] Unit tests:
  - backend/tests/unit/test_discord_oauth_service.py: server and member parse; 404 → empty; 429, 5xx or network → unavailable;
  - backend/tests/unit/test_discord_mentions.py: the `webhook_url` param; payload unchanged; the URL is absent from logs and errors;
  - backend/tests/unit/test_oauth_cli.py: the fake registration has no `is_org_member`.
- T132 [US7] Integration tests in backend/tests/integration/test_quinzenal_reports.py:
  - drop `FakeGitHubService`; use a fake `DiscordOAuthServiceDp` and a recording `DiscordServiceDp` that captures `webhook_url`; seed webhooks through the repo;
  - the report is saved before any Discord call, and the answer is 201 in every case;
  - no connection → posted nowhere;
  - a member of a configured server → posted to each of that server's hooks, each with `<@id>` and `allowed_mentions.users == [id]`;
  - two hooks in one server, one role-limited: the user lacks the role → only the other hook; the user holds one of its roles → both;
  - the user is in no configured server → posted nowhere;
  - one of two posts fails → `discord_posted` true, `discord_error` set;
  - no table or column stores servers or roles.
- T133 [US8] Same file:
  - `invalid_grant` → 201, not posted, the row is `needs_reconnect`, and `GET /users/me` shows `discord.status == needs_reconnect`;
  - a `needs_reconnect` user → no Discord call;
  - a replaced key → the row is marked;
  - the rotated refresh token is stored.
- T134 [US10] Same file: a 5xx, a 429 or a network failure on the refresh or server-list call → 201, not posted, the row stays `active` and its token is unchanged.
- T135 [US7] Organisation tests:
  - backend/tests/integration/test_oauth_cli.py: the login redirect asks for `scope=user:email` only; there is no `/user/orgs` call;
  - backend/tests/integration/test_admin.py: the user detail has no `is_org_member` key;
  - `grep -rnE "is_org_member|DISCORD_REPORTS_|read:org|check_org_membership" backend/app` has no hits.
- T136 [US7] In backend/CLAUDE.md:
  - the Authentication scope line becomes `user:email`;
  - GitHub Integration without the org check;
  - webhook mentions become report routing;
  - Biweekly Reports;
  - the env list;
  - `users`: `is_org_member` unmapped, the column kept until Release C.
- T137 [US7] Changelogs:
  - backend/CHANGELOG.md:
    - Changed: routing, submit, GitHub scope;
    - Removed: `DISCORD_REPORTS_WEBHOOK`, `DISCORD_REPORTS_ORGANIZATION`, `read:org`, `check_org_membership`, and `is_org_member` on `/admin/users/{id}`;
    - rewrite the unreleased K3 entry.
  - No CLI entry. The CLI never reads the GitHub scope, and `/users/me` never carried `is_org_member`. Say so in the backend entry.
- T138 [US7] Gates:
  - `uv run pytest tests -k "steps or finalize or supports"`;
  - `make test` in cli; the CLI login redirect still reaches GitHub;
  - backend gate as in K5 T087;
  - `grep -rn "_old" backend/app/` has no hits;
  - `scripts/e2e.sh e2e/profile-discord.spec.ts e2e/smoke.spec.ts e2e/admin-gating.spec.ts` green (the seed inserts users with `is_org_member` unmapped);
  - no applika-e2e container left.
AC:
- When a linked user's biweekly report is posted to Discord, the post mentions that user.
- A webhook post allows a mention of the submitting user only, and never of everyone, roles or other users.
- The installed command-line tool keeps working unchanged.
- When Discord refuses the stored grant, the system marks the connection as needing reconnection, and the profile page shows a Reconnect Discord action.
- Each time the system renews Discord access, it replaces the stored refresh token with the new one, encrypted.
- When a user submits a biweekly report, the system saves it before contacting Discord, and the submission succeeds whatever Discord answers.
- When the submitting user has an active Discord connection, the system uses the stored grant to get fresh Discord access. It then reads the ids of the servers the user is in and selects every report webhook configured for one of those servers.
- For a selected webhook limited to role ids, the system reads the user's roles in that server, and keeps the webhook only when the user holds at least one of those roles.
- The system posts the report to every kept webhook, and each post mentions the submitting user.
- A report from a user who has no Discord connection, or whose connection needs reconnecting, is saved and posted nowhere.
- When Discord is unreachable or failing at report time, the report is saved and not posted, and the connection is left as it is.
- The report records whether it reached at least one webhook.
- Discord server membership, plus the optional roles, is the only rule that decides where a report is posted. The single reports webhook setting no longer exists.
- The system reads a user's servers and roles when a report is submitted and never stores them.
- The system no longer uses GitHub organisation membership for anything. The organisation setting is removed, sign-in asks GitHub for the email permission only, and the system neither checks, records nor returns organisation membership.
- The organisation-membership values recorded before this change are kept aside, unused, and are never deleted by this change.
- Never remove or break a route, a request field or a response field that a published CLI version uses. (.claude/rules/cli-compatibility.md 1)
- `backend/CHANGELOG.md` records every backend change. (.claude/rules/changelogs.md 2)
- `ty check` must add no new diagnostics beyond 171; files a slice creates or changes must be clean; coverage floor 90%. (.claude/rules/quality-gates.md)

## K9 — S9 frontend: Connected as / Reconnect on profile, admin Discord webhooks page, E2E   side: frontend (+ E2E)   covers: R-002, R-012, R-020 (E2E asserts scope), R-023, R-026 (profile), R-027 (Reconnect action), R-029, R-030, R-031, R-042 (type)   deps: K6, K7
Owner's words: "Keep github login but add an option in user profile to sincronize with discord." "Remove the environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which webhooks to send my reports (new table to save the discord webhook url, the server id - will be used to check if the user is in this server - and multiples roles id in this discord server - this is optional)."
Touch:
- frontend/src/services/types/users.ts
- frontend/src/components/profile/connected-accounts.tsx
- frontend/src/components/profile/connected-accounts.test.tsx
- frontend/src/components/profile/profile-view.tsx
- frontend/src/components/layout/user-menu.test.tsx
- frontend/src/app/(protected)/profile/profile-page.test.tsx
- frontend/src/services/types/admin.ts
- frontend/src/services/implementations/admin-service.ts
- frontend/src/hooks/use-admin.ts
- frontend/src/components/admin/admin-nav.tsx
- frontend/src/app/(protected)/admin/discord-webhooks/page.tsx (new)
- frontend/src/app/(protected)/admin/discord-webhooks/discord-webhooks-page.tsx (new)
- frontend/src/app/(protected)/admin/discord-webhooks/discord-webhooks-page.test.tsx (new)
- frontend/e2e/profile-discord.spec.ts
- frontend/e2e/admin-discord-webhooks.spec.ts (new)
- frontend/CLAUDE.md
Pattern:
- frontend/src/app/(protected)/admin/supports/supports-page.tsx and frontend/src/app/(protected)/admin/supports/supports-page.test.tsx
- frontend/src/components/ui/avatar.tsx, frontend/src/components/ui/dialog.tsx, frontend/src/components/ui/alert-dialog.tsx, frontend/src/components/brand-icons.tsx (`DiscordIcon`)
- frontend/e2e/profile-discord.spec.ts (serial, exact locators)
Contract: as K6 (`/users/me` `discord`) and K7 (`/admin/discord-webhooks`).
Steps:
- T139 [US1] In frontend/src/services/types/users.ts:
  - `DiscordAccount {username: string; global_name: string | null; avatar_url: string | null; status: "active" | "needs_reconnect"}`;
  - `User.discord: DiscordAccount | null`;
  - `discord_linked` kept.
  Add `discord` to the `User` fixtures in frontend/src/components/layout/user-menu.test.tsx and frontend/src/app/(protected)/profile/profile-page.test.tsx.
- T140 [US1] Card, in frontend/src/components/profile/connected-accounts.tsx:
  - the prop `account?: {name: string; avatarUrl: string | null; needsReconnect: boolean} | null` replaces `linked`;
  - active → `Avatar` (fallback `DiscordIcon`) + "Connected as <global_name ?? username>" + Disconnect Discord;
  - unlinked → unchanged (Connect Discord);
  - `data-state` = `linked|unlinked|needs_reconnect`;
  - the Discord id never appears as text;
  - helper text: reports go to the configured servers you are in, and posts mention you.
  frontend/src/components/profile/profile-view.tsx maps `user.discord` → `account`.
- T141 [US8] Reconnect state, in the same card:
  - badge "Reconnect needed";
  - a "Reconnect Discord" button (`onConnect`, the same consent flow);
  - Disconnect Discord still offered;
  - Connect is never offered while a connection exists.
- T142 [P] [US1] Vitest in frontend/src/components/profile/connected-accounts.test.tsx:
  - unlinked → Connect only;
  - active → "Connected as" + global name, falling back to the username;
  - avatar image, or `DiscordIcon` when `avatarUrl` is null;
  - no id text;
  - reconnect → badge, Reconnect Discord calls `onConnect`, Disconnect still shown;
  - the existing Disconnect confirm tests are kept.
- T143 [US6] Admin data layer:
  - frontend/src/services/types/admin.ts: `AdminDiscordWebhook` + payloads; drop `AdminUserDetail.is_org_member` (l.99, R-042; nothing renders it);
  - frontend/src/services/implementations/admin-service.ts: list, create, update and delete on `/admin/discord-webhooks`;
  - frontend/src/hooks/use-admin.ts: hooks with key `["admin","discord-webhooks"]`; invalidate on success; toast `getApiError` on error.
- T144 [US6] Page, in frontend/src/app/(protected)/admin/discord-webhooks/page.tsx (new) and discord-webhooks-page.tsx (new), on the pattern of supports-page.tsx:
  - list: label, server id, role ids, masked URL; an empty state;
  - Add dialog, RHF + zod mirroring the server: URL regex, https, 17-20-digit ids ≤ the BIGINT max, ≤ 25 roles;
  - role ids in a textarea, split on comma, space or newline, deduped;
  - label ≤ 100.
  Add the tab `/admin/discord-webhooks` "Discord" to frontend/src/components/admin/admin-nav.tsx.
- T145 [US9] Edit and Delete:
  - a blank URL on Edit keeps the stored one; the masked value is shown as a hint; only changed fields are sent;
  - Delete asks for confirmation in an `AlertDialog`;
  - no full URL is rendered after a save, and the form is cleared on close.
- T146 [P] [US6] Vitest in frontend/src/app/(protected)/admin/discord-webhooks/discord-webhooks-page.test.tsx (new):
  - the list is masked and shows no full URL;
  - zod refuses http, a non-Discord host, bad ids and 26 roles;
  - Add sends the parsed role ids;
  - Edit with a blank URL omits `webhook_url`;
  - Delete confirm → one call; Cancel → none.
- T147 [US1] E2E in frontend/e2e/profile-discord.spec.ts:
  - `e2e-discord` sees "Connected as E2E Discord", the icon fallback, no id text and Disconnect;
  - the scope assertion stays;
  - Disconnect stays LAST, and afterwards `/users/me` returns `discord` null and `discord_linked` false.
- T148 [US6] E2E in frontend/e2e/admin-discord-webhooks.spec.ts (new), on the real API, with no Discord call:
  - `e2e-admin` → Discord tab → add a fixed fake webhook → a masked row, with the token absent from the page → edit the role ids → delete → gone (the DB is shared, so the spec cleans up);
  - `e2e-user` cannot reach the page (same gating as `/admin`).
- T149 [US1] In frontend/CLAUDE.md, update the Profile section (the `account` prop, Connected as, avatar fallback, Reconnect, E2E) and add the admin Discord webhooks page.
- T150 [US1] Gates:
  - `pnpm lint && pnpm prettier --check . && pnpm tsc --noEmit && pnpm test && pnpm build`;
  - `scripts/e2e.sh e2e/profile-discord.spec.ts e2e/admin-discord-webhooks.spec.ts e2e/admin-gating.spec.ts e2e/smoke.spec.ts` green;
  - no applika-e2e container left.
AC:
- The profile page offers a Connect Discord action when the user has no Discord link.
- A user who disconnected can connect Discord again, the same account or another one.
- The system asks Discord for permission to read the user's identity, the servers the user is in, and the user's roles in those servers, and for nothing more.
- When the user has a Discord connection, the profile page shows "Connected as <name>" with the Discord avatar and a Disconnect Discord action. It never shows the Discord id.
- When Discord refuses the stored grant, the system marks the connection as needing reconnection, and the profile page shows a Reconnect Discord action.
- Reconnecting runs the same consent flow, refreshes the stored data and clears the reconnection mark.
- An administrator can list, add, change and remove report webhooks. Each webhook holds a Discord webhook address, a Discord server id, and zero or more Discord role ids.
- The system accepts a report webhook only when its address is a secure Discord webhook address and the server id and role ids are Discord ids.
- After a report webhook is saved, the system never shows its full address again, only a masked form.
- The system no longer uses GitHub organisation membership for anything. The organisation setting is removed, sign-in asks GitHub for the email permission only, and the system neither checks, records nor returns organisation membership.

## K10 — Closing 0009 Release B: full gate, E2E, ADRs, as-built notes, by-hand walk   side: both   covers: —   deps: K8, K9
Owner's words: "Keep github login but add an option in user profile to sincronize with discord."
Touch:
- docs/prd/0001-auth-users-profile.md (as-built notes)
- docs/prd/0003-statistics-reports-cycles.md (R-011 as-built note)
- docs/plan/0009-discord-account-link.md (header line only)
- otherwise verify only
Pattern: .claude/rules/quality-gates.md; old K5 T070-T078 above
Release gate: this tip is the Release B boundary, tagged `0009-release-b`. The owner merges it only after confirming A2's `alembic upgrade head` ran in prod.
Steps:
- T151 Gate in CLAUDE.md order:
  - `cd backend && make format && make lint && make test`;
  - `cd frontend && pnpm lint && pnpm test && pnpm build`;
  - `cd cli && make format && make lint && make test`.
- T152 Target gates from .claude/rules/quality-gates.md:
  - backend: `uv run ruff format --check ./app`, `uv run ruff check ./app`, `uv run ty check` (≤ 171; every file K5..K9 touched is clean), `uv run pytest . --cov=app` (≥ 90%);
  - frontend: `pnpm prettier --check .`, `pnpm tsc --noEmit`;
  - CLI: `make lint && make test`.
- T153 Run the full scripts/e2e.sh, including profile-discord.spec.ts and admin-discord-webhooks.spec.ts. The stack is migrated through the K5 revision. Confirm the CI `e2e` job in .github/workflows/frontend-ci.yaml runs it. Real Discord cannot run in E2E; these layers carry routing, OAuth and revoke:
  - backend/tests/unit/test_resolve_report_webhooks.py
  - backend/tests/integration/test_quinzenal_reports.py
  - backend/tests/unit/test_discord_oauth_service.py
  - backend/tests/integration/test_account_link_discord.py
  - backend/tests/integration/test_user_feedback.py
  - backend/tests/unit/test_discord_mentions.py
  - backend/tests/integration/test_admin_discord_webhooks.py
- T154 No test infrastructure left:
  - `docker ps -a --format '{{.Names}}' | grep -i applika-e2e` is empty;
  - no network or volume from docker-compose.e2e.yml;
  - no testcontainers;
  - the owner's dev containers are untouched.
- T155 ADRs:
  - docs/adr/0013-discord-connection-and-report-webhook-routing.md reads Accepted, and its Decision matches the build;
  - 0008 reads "Superseded by ADR-0013";
  - 0002 carries its "Amended by ADR-0013" note;
  - 0001, 0004, 0005 and 0010 read Accepted.
  Fix the stale header line of docs/plan/0009-discord-account-link.md: ADR-0013 Accepted, PRD Approved.
- T156 Rule checks:
  - `grep -nE "op\.drop_(column|table)"` on the K5 revision hits only inside `downgrade()`;
  - `grep -rn "_old" backend/app/` has no hits;
  - `grep -rnE "is_org_member|DISCORD_REPORTS_|read:org|check_org_membership" backend/app frontend/src` has no hits;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`;
  - `uv run pytest tests/integration -k migration`;
  - `uv run pytest tests -k "steps or finalize or supports"`;
  - the changelogs rule verify command;
  - the commit-format verify command.
- T157 PRD as-built notes (the PRD 0004 note already exists at l.38: confirm only):
  - docs/prd/0001-auth-users-profile.md:
    - l.27: the scope is `user:email` only from Release B;
    - l.32: org membership is no longer checked or recorded; `is_org_member_old` from Release C;
    - l.74, R-013: `users` still has no Discord column; the connection lives in `discord_connections`;
    - l.84: Discord linking is ADR-0013.
  - docs/prd/0003-statistics-reports-cycles.md R-011: superseded by PRD 0009 R-039 from Release B.
- T158 Walk through by hand on a real stack, with a real Discord app, two test Discord accounts, and a test server with two roles and two webhooks (one role-limited).
  - Connect and link:
    - Connect → the consent lists identify, guilds and guilds.members.read → "Connected as <name>" with the avatar; the URL is cleaned; no id text;
    - the DB: the row holds every R-021 field; the refresh token is ciphertext; no access token anywhere; `users` has no Discord column;
    - the callback sends no `Set-Cookie`;
    - replay the callback → failed; cancel the consent → failed;
    - a second Applika user connects the same Discord account → the link moves: "Connected as <name>" for the second user; the first user's row is gone, their profile shows Connect Discord, and their next feedback has no mention; the Authorized Apps entry stays (nothing revoked), and the second user's next report still routes.
  - Admin webhooks:
    - add both webhooks; each shows masked after save;
    - a bad URL and a duplicate are refused;
    - edit the roles;
    - the full URL is never shown again;
    - a non-admin reaches neither the page nor the API.
  - Report routing:
    - a user who holds the role → posted to both hooks, with the mention on the first line after `@username`;
    - a user without the role → only the unrestricted hook;
    - a user in no configured server → saved, posted nowhere;
    - an unlinked user → saved, posted nowhere;
    - the refresh-token ciphertext changes after a report (rotation).
  - Revoked or failing Discord:
    - revoke the app in Discord Authorized Apps → the next report is saved and not posted, and the profile shows Reconnect Discord;
    - reconnect → Connected as again, mark cleared;
    - block discord.com → report 201, not posted, the link stays active.
  - Feedback: a linked user is mentioned, also while `needs_reconnect`; an unlinked user's post is unchanged.
  - Disconnect → confirm:
    - the row is gone and the Authorized Apps entry is gone;
    - the next feedback has no mention, and the next report is posted nowhere;
    - relinking works.
  - Key unset:
    - Connect toasts "Discord linking is unavailable";
    - Disconnect still works;
    - reports are posted nowhere;
    - feedback still mentions linked users.
  - Delete the account → the row is gone and the grant is revoked.
  - The GitHub consent asks for email only, and the admin user detail has no org field.
  - `uvx applika-cli==0.1.4 whoami`, then 0.2.0 and 1.0.0; CLI login works.
  - Both themes, desktop and mobile.
- T159 Record at slice close:
  - The K10 tip is Release B; tag it `0009-release-b`. The owner merges it only after confirming that A2 ran in prod.
  - Before deploy, the owner sets these on the swarm stack:
    - `DISCORD_CLIENT_ID`;
    - `DISCORD_CLIENT_SECRET`;
    - `DISCORD_TOKEN_ENCRYPTION_KEY`: a new Fernet key, backed up with the stack secrets;
    - `DISCORD_LINK_REDIRECT_URI`: the https prod callback;
    - `ACCOUNT_LINK_REDIRECT_URI`: the prod profile URL.
  - The owner registers the redirect URI in the Discord Developer Portal.
  - `DISCORD_REPORTS_WEBHOOK` and `DISCORD_REPORTS_ORGANIZATION` stay set until C is proven: B ignores them, but a rollback needs them.
  - After deploy an admin adds the webhooks; until then reports are posted nowhere.
  - Rollback B = the previous image, and only after C is rolled back if C shipped.
  - Success signals: no Discord id on two users; no access token and no plaintext refresh token in the DB; the GitHub consent asks for email only; `whoami` green on 0.1.4, 0.2.0 and 1.0.0.
AC:
- Project full gate green in CLAUDE.md order: `cd backend && make format && make lint && make test`, then `cd frontend && pnpm lint && pnpm test && pnpm build`, then `cd cli && make format && make lint && make test`; plus .claude/rules/quality-gates.md target gates (ty ≤ 171 with changed files clean, coverage ≥ 90%, prettier, tsc).
- Every ADR the feature drafted reads Accepted (ADR-0013, Accepted 2026-09-24; bound 0001, 0002, 0004, 0005, 0010 Accepted; 0008 reads Superseded by ADR-0013).
- No test infrastructure left behind: no E2E containers, ephemeral stacks, temp databases or testcontainers.
- The E2E the feature earned (profile-discord.spec.ts and admin-discord-webhooks.spec.ts via scripts/e2e.sh) runs inside the gate and is green; report routing, Discord OAuth and revoke are carried by the unit and integration layers named in T153.
- By-hand walk of the feature on a real stack done.
- No new feature work.

## K11 — S10 Release C: retire users.is_org_member as is_org_member_old (migration only)   side: backend   covers: R-043   deps: K10
Owner's words: none in `## In the owner's words`. The slice serves the 2026-09-24 clarification "removed entirely" and the owner's order quoted in .claude/rules/non-destructive-migrations.md: "never delete a column in the database when upgrading, change the column name to an older version and only copy/migrate the data".
Touch:
- backend/migrations/versions/<rev>_retire_users_is_org_member.py (new)
- backend/tests/integration/test_migration_retire_is_org_member.py (new)
- backend/tests/integration/test_timeline_contract_migration.py
- backend/CHANGELOG.md
- backend/CLAUDE.md
Pattern:
- backend/migrations/versions/ad747aba90fc_timeline_events_contract.py (rename to `_old`, downgrade renames back)
- backend/tests/integration/test_timeline_contract_migration.py (contract round trip)
Release gate: Release C, migration only.
- Build may start after the `0009-release-b` tag; the merge waits.
- Tag `0009-release-c`. The owner merges it only after confirming B runs in prod → release → `alembic upgrade head` → restart → confirm.
- Rollback order C → B → A2.
Steps:
- T160 After the `0009-release-b` tag, re-check the head: expect the K5 revision. If another feature has landed a revision on develop, chain after it and re-check the pin.
- T161 Create backend/migrations/versions/<rev>_retire_users_is_org_member.py (new), `down_revision` = the head:
  - upgrade: `op.alter_column('users', 'is_org_member', new_column_name='is_org_member_old')`; type, NOT NULL, `server_default false` and values are kept;
  - downgrade: renames it back;
  - no drop anywhere.
  The docstring cites non-destructive rules 3, 5, 7 and 9, runbook 4 (B code never touches the column) and ADR-0013.
- T162 [P] Round-trip test in backend/tests/integration/test_migration_retire_is_org_member.py (new). Seed users with `is_org_member` true and false at the K5 revision, then:
  - **upgrade:**
    - `is_org_member_old` holds the same value per user;
    - `is_org_member` is absent;
    - NOT NULL and the default are kept: inserting a user without the column gives false;
    - every other `users` column is present, and no table is missing.
  - **downgrade:** `is_org_member` is back with the same values; `_old` is absent.
  - **upgrade again:** equal to the first upgrade.
- T163 In backend/tests/integration/test_timeline_contract_migration.py, move the `test_only_one_head` pin to <rev>, with `down_revision` == the K5 revision.
- T164 Verify:
  - `grep -nE "op\.drop_(column|table)"` has no hits in the new revision;
  - `grep -rn "_old" backend/app/` and `grep -rn "is_org_member" backend/app/` have no hits;
  - local DB: `uv run alembic downgrade -1 && uv run alembic upgrade head`;
  - `uv run pytest tests/integration -k migration`;
  - `git diff 0009-release-b --name-only` lists only `backend/migrations/versions/`, `backend/tests/integration/`, `backend/CHANGELOG.md` and `backend/CLAUDE.md`.
- T165 Docs and changelog:
  - backend/CHANGELOG.md, Changed: `users.is_org_member renamed is_org_member_old (Release C, migration only); values kept; nothing reads it.` No CLI entry.
  - backend/CLAUDE.md, `users` line: `is_org_member_old`, unmapped.
- T166 Gate:
  - backend gate as in K5 T087;
  - the full scripts/e2e.sh green on a stack migrated through C (the seed inserts users; the default fills `_old`);
  - no applika-e2e container left.
- T167 Record at slice close:
  - Tag `0009-release-c`; the owner's merge steps are in the Release gate above.
  - Rollback, in order C → B → A2:
    - C = `alembic downgrade <K5 rev>`, which renames the column back;
    - B = the previous image, with `DISCORD_REPORTS_*` still set, and only after C is rolled back;
    - A2 = `alembic downgrade c1d9f4a7b3e6`.
  - The owner may unset `DISCORD_REPORTS_WEBHOOK` and `DISCORD_REPORTS_ORGANIZATION` only after C is proven.
  - Deleting `is_org_member_old` needs a later, explicit owner order (rule 9).
  - The agent never touches prod.
AC:
- The organisation-membership values recorded before this change are kept aside, unused, and are never deleted by this change.
- Every revision has a working `downgrade()`. An empty or `pass` downgrade is forbidden. (.claude/rules/non-destructive-migrations.md 1)
- `upgrade()` never drops a column and never drops a table. (.claude/rules/non-destructive-migrations.md 2)
- A retired column or table is renamed with the suffix `_old` (`feedback_id` becomes `feedback_id_old`, `steps_definition` becomes `steps_definition_old`). (.claude/rules/non-destructive-migrations.md 3)
- `downgrade()` renames the `_old` object back to its original name and restores the data from the copy. (.claude/rules/non-destructive-migrations.md 5)
- Application code never reads and never writes an `_old` column or table. The ORM models do not map them. (.claude/rules/non-destructive-migrations.md 7)
- The test runs the real Alembic chain against a testcontainers Postgres: upgrade to the revision, downgrade to its parent, upgrade again. (.claude/rules/migration-tests.md 2)
- The test asserts that no column or table is missing after upgrade, only renamed to `_old`. (.claude/rules/migration-tests.md 4)
- A migration ships to `main` in a release whose code still works on the old schema: the migration is additive (new nullable columns, new tables, `_old` copies) and no code reads or writes the new objects yet. (.claude/rules/prod-release-runbook.md 4)

## Matrix
| R | K |
|---|---|
| R-001 | K2, K6 |
| R-002 | K4, K9 |
| R-003 | superseded by R-020 |
| R-004 | superseded by R-021, R-022 |
| R-005 | superseded by R-022 |
| R-006 | superseded by R-023 |
| R-007 | K5, K6 |
| R-008 | K6 (rewritten 2026-09-24: transfer; K2 built the refusal it replaces, K4 the race notice) |
| R-009 | K2, K4, K6 |
| R-010 | K2, K6 (re-verified) |
| R-011 | superseded by R-024 |
| R-012 | K6, K9 |
| R-013 | K5, K6 |
| R-014 | K8 |
| R-015 | K3, K6 |
| R-016 | K3, K8 |
| R-017 | K3, K6 (narrowed: feedback only) |
| R-018 | superseded by R-025 |
| R-019 | K6, K8 (K10 re-verifies) |
| R-020 | K6, K9 |
| R-021 | K5, K6 |
| R-022 | K5, K6 |
| R-023 | K9 |
| R-024 | K6 |
| R-025 | K6 |
| R-026 | K8, K9 |
| R-027 | K6, K9 |
| R-028 | K6, K8 |
| R-029 | K7, K9 |
| R-030 | K7, K9 |
| R-031 | K7, K9 |
| R-032 | K8 |
| R-033 | K8 |
| R-034 | K8 |
| R-035 | K8 |
| R-036 | K8 |
| R-037 | K8 |
| R-038 | K8 |
| R-039 | K8 |
| R-040 | K5, K8 |
| R-041 | K6 |
| R-042 | K8, K9 |
| R-043 | K8, K11 |

Uncovered: none. Superseded (not uncovered): R-003, R-004, R-005, R-006, R-011, R-018. Orphan: K10 (closing, by design).

## Owner's words not served
None. Checked sentence by sentence:
- "Keep github login but add an option in user profile to sincronize with discord." → K2 and K6 (R-001, callback sets no cookie); K4 and K9 (profile card).
- "(2026-09-24) i would like to abandom the last ticket and expand this plan, when the user clicks to connect thir applika account with discord, i want to save the refresh token and all data related to this connection in a new table istead directly in users, save only the refresh token criptografed (new end to set the encryption secret)."
  - "abandom the last ticket": the old K5 (closing) was deleted before this rewrite.

  - "expand this plan": this file, K5..K11.
  - new table: K5.
  - encrypted refresh token and new secret: K6.
- "Remove the environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which webhooks to send my reports (new table to save the discord webhook url, the server id - will be used to check if the user is in this server - and multiples roles id in this discord server - this is optional)."
  - env removed: K8.
  - table: K5.
  - admin API: K7.
  - admin page: K9.
- "What i want is, when a user created a report, if this user connected their account with discord, my application needs to use the refresh token to get an access token and get a list of server ids this user is in discord, with list list i fetch from this new table all web hooks configured to the server id i fetched from my user, and then check if an admin have limited by roles id, i also need's to check if this user have the role id in that server, with everyting done, i then send the repport message in the webhooks"
  - K8 (resolve and post), on K6's grant refresh and rotation.
