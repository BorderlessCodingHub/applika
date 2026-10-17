# Plan 0014 — CLI device sign-in and connected devices

PRD: docs/prd/0014-cli-device-sign-in-and-devices.md
ADRs bound: 0002 GitHub sole login, `sub`=github_id stays (amended by 0019) · 0004 own rows only, other user's row = 404 · 0009 old CLI routes stay, deprecated · 0015 limiter fail open, `/auth/*` bucket 10/min (subject amended by 0019; limiter stays fail open, session check is fail closed) · 0018 beta registry (owner exception, 0019) · 0019 (Accepted 2026-10-15) device sessions + CLI OAuth.
PRDs neighbouring: 0001-auth-users-profile.md (R-004..R-008 session as-built, superseded by this) · 0005-landing-cli.md (R-006 CLI login) · 0013-beta-features.md (exception).

## Scope
Ships: one session per sign-in (Redis uuid7 key + `user_sessions` row), `sid` claim checked every authenticated request, Devices tab in `/profile` (list, revoke, revoke others), `/device` approval page, `/cli/code` paste page, applika-cli 1.1.0 (`login` PKCE loopback, `--manual` paste, `--device` code, Bearer). Legacy `/auth/cli/*` kept, deprecated. Not: admin views, notifications, geo-IP, CLI device commands, rotation, beta gate (owner: "Gate nothing").
Releases (`.claude/rules/prod-release-runbook.md` 4):
- **A** migration only. down_revision `641001baff09` → A ships only after 0012/0013 reach `main`.
- **B** backend + web, merged only after owner confirms `alembic upgrade head` ran in prod. Deploy logs everyone out.
- **C** applika-cli 1.1.0 to PyPI, merged to `develop` only after B live (no 404 window for new CLI).

## Data
Revision (new) `backend/migrations/versions/<rev>_user_sessions.py`. Create only; `op.drop_table` in `downgrade()` only.
`user_sessions` (tenancy `user_id`):
- `id` BIGINT PK snowflake, `created_at` TIMESTAMPTZ NOT NULL (= granted), `updated_at` NULL (BaseMixin)
- `user_id` BIGINT NOT NULL FK `users.id` ON DELETE CASCADE
- `client_type` VARCHAR(10) NOT NULL, `ck_user_sessions_client_type` IN ('web','cli')
- `sign_in_method` VARCHAR(20) NOT NULL, `ck_user_sessions_sign_in_method` IN ('github_web','cli_browser','cli_device','cli_legacy')
- `device_name` VARCHAR(100) NOT NULL · `user_agent` VARCHAR(512) NULL
- `created_ip` VARCHAR(45) NULL · `last_ip` VARCHAR(45) NULL · `last_used_at` TIMESTAMPTZ NULL
- `expires_at` TIMESTAMPTZ NOT NULL (slides: every refresh sets now + `REFRESH_TOKEN_EXPIRE_DAYS`) · `ended_at` TIMESTAMPTZ NULL
- `end_reason` VARCHAR(20) NULL, `ck_user_sessions_end_reason` IN ('logout','revoked','expired','github_revoked','replaced'); `ck_user_sessions_ended_pair` `(ended_at IS NULL) = (end_reason IS NULL)`
- `ix_user_sessions_user_id_created_at` (user_id, created_at DESC); `ix_user_sessions_open` (user_id) WHERE ended_at IS NULL
No refresh value, no hash of it. ORM `UserSessionModel` in `backend/app/domain/models.py` ships in B (indexes mirrored in `__table_args__`, create_all).
Redis (B, `REDIS_URL`, limiter's instance), both session keys `EXAT expires_at` in one MULTI, at open and again on every refresh (sliding; value never rotated):
- `applika:session:<uuid7>` → session id
- `applika:session:id:<sid>` hash `{rk, user_id, github_id, last_used_at, last_ip}`; JWT `sid` = this snowflake id (owner 2026-10-15), never the uuid7
- `applika:device:code:<device_code>` hash `{user_code, status pending|approved|denied, user_id, github_id, device_name, ip, user_agent, requested_at, last_poll_at}` EX `DEVICE_CODE_TTL_SECONDS`; `applika:device:user_code:<CODE>` → device_code, same EX
- `applika:auth_handoff:login|code:*` (existing) + optional `flow='pkce'`, `code_challenge`, `redirect_uri`
- `applika:refresh_token:*` never read after B; dies on TTL ≤ 7 d. Nothing deletes it.

## Backend (B)
New: `app/core/pkce.py` (S256 verify), `app/core/user_agent.py` (`describe_user_agent` → "Chrome on macOS", "applika-cli 1.1.0", httpx UA → "applika-cli (older version)"; regex, no dependency), `app/core/user_codes.py` (8 of `BCDFGHJKLMNPQRSTVWXZ`, `XXXX-XXXX`, normalize case/hyphen), `app/application/services/session_store.py` (`SessionStore`: `open`, `resolve_refresh`, `slide` (EXPIREAT both keys), `touch` Lua EXISTS→HSET under `asyncio.timeout(0.5)`, `end`, `live_fields`; any `RedisError`/`OSError`/timeout raises `SessionServiceUnavailable`, fail closed), `SessionServiceUnavailable(ServiceUnavailable)` in `app/core/exceptions.py` → `app/presentation/handlers.py` 503 + `Retry-After: 5`, `app/domain/repositories/user_session_repository.py`, `app/application/use_cases/sessions/` (`open_session.py`, `refresh_session.py`, `end_session.py`, `list_my_sessions.py`, `revoke_other_sessions.py`), `app/application/use_cases/cli_auth/` (`authorize.py`, `token.py`, `device_code.py`), `app/presentation/api/cli_auth.py` (router `/auth`), `app/presentation/api/user_sessions.py` (router `/users/me/sessions`), `app/presentation/schemas/user_sessions.py`, `app/presentation/schemas/cli_token.py`.
Changed:
- `app/core/tokens.py`: `create_access_token(sub, sid)`, `TokenPayload.sid`; uuid4 refresh helpers removed.
- `app/application/use_cases/get_current_user.py`: JWT decode first (bad/expired → 401 as today); no `sid` or `touch` miss → 401 `Session expired`; Redis error/timeout → 503 `Session service unavailable` (never passes unchecked); sets `request.state.session_id`. 503, not 401: a 401 sends the web and every CLI to refresh, and a failed refresh signs the web out and makes CLI 0.1.4–1.0.1 delete `session.json`; nothing refreshes on 503.
- `app/presentation/dependencies.py`: `get_current_user` reads `HTTPBearer(auto_error=False)` first, then `APIKeyCookie(auto_error=False)`, else 401 `Not authenticated`; new `CurrentSessionIdDp`, `SessionStoreDp`, `UserSessionRepositoryDp`.
- `app/presentation/api/oauth.py`: callback opens `github_web` session, ends a valid same-user `__refresh` session as `replaced`; `_build_auth_handoff_response` branches on `flow='pkce'` (code bound to challenge + redirect_uri; `oob` → `CLI_MANUAL_REDIRECT_URI`); `/auth/cli/exchange` opens `cli_legacy`; `/auth/refresh` → `RefreshSessionUseCase` (GitHub check kept, `github_revoked` end; slides keys + `expires_at`; re-sets `__refresh` same value, full Max-Age, as `__access` is re-set today, so old CLIs' cookie jar takes it the same way); `/auth/logout` ends `logout`; `/auth/cli/start|login|exchange` `deprecated=True`.
- `app/presentation/api/account_link.py`: callback's `GetCurrentUserUseCase` call gets the session store.
- `app/presentation/api/user.py` `delete_me`: end all open sessions (DEL keys) before delete.
- `app/core/rate_limit.py` `subject_for(headers, cookies, host)`: Bearer, then `__access`, then IP; `app/config/rate_limit.py` passes headers.
- `app/config/settings.py`: `DEVICE_CODE_TTL_SECONDS=600`, `DEVICE_CODE_POLL_INTERVAL_SECONDS=10`, `DEVICE_VERIFICATION_URI='http://127.0.0.1:8080/device'`, `CLI_MANUAL_REDIRECT_URI='http://127.0.0.1:8080/cli/code'`, `SESSION_HISTORY_DAYS=30`.
- `app/main.py`: include both routers. `app/scripts/seed_e2e.py`: `mint_session` via `OpenSessionUseCase`; extra `cli_device` session for e2e-user. `scripts/e2e.sh`: export `E2E_CLI_ACCESS_TOKEN`, `E2E_CLI_REFRESH_TOKEN`. `scripts/seed_mock_data.py`: header note only (pasted `__access` carries `sid`).
- `backend/CLAUDE.md` (Authentication, tables, env vars, domain model), `backend/CHANGELOG.md`.
Pattern: router `app/presentation/api/account_link.py`; repo `app/domain/repositories/discord_connection_repository.py`; use case `app/application/use_cases/account_links/unlink_discord.py`; Redis state `app/application/use_cases/auth_handoff_state.py`; migration `641001baff09_feature_flags.py`.

## Frontend (B)
Module `frontend/src/`.
- `app/(protected)/profile/profile-page.tsx`: `Tabs` variant `line`, "Profile" (today's `ProfileView`) + "Devices"; `?tab=devices` read once by lazy `useState`.
- `components/profile/devices-tab.tsx` (new) `DevicesTab`: Active list then "Ended (last 30 days)"; `components/profile/device-row.tsx` (new): name, client label, method, last IP (sign-in IP secondary), granted, last used, expires, status badge, "This device" badge; "Revoke" → `AlertDialog` ("Revoke access" / "Cancel"); current row "Sign out" → `useAuth().logout`; "Sign out all other devices" → `AlertDialog`. Empty state.
- `hooks/use-sessions.ts` (new): `useSessions` (`['sessions']`), `useRevokeSession`, `useRevokeOtherSessions`; invalidate; `toast.error(rateLimitNotice(error) ?? "Failed to revoke device")`.
- `services/interfaces/i-session-service.ts`, `services/implementations/session-service.ts`, `services/types/sessions.ts` (new); registered in `services/services.ts`. `auth-service.ts`, `i-auth-service.ts`, `types/auth.ts`: `verifyDeviceCode`, `approveDeviceCode`, `denyDeviceCode`.
- `app/(protected)/device/page.tsx` (Suspense) + `device-page.tsx` (new): code input `XXXX-XXXX` prefilled from `?code=`, "Continue" → verify → card (device name, IP, requested at, "Only approve if you started this sign-in yourself"), "Approve" / "Deny"; done → "Device signed in. You can return to your terminal." + link `/profile?tab=devices`.
- `lib/rate-limit.ts`: `isTemporary(error)` = 429 or 503; `retryAfterMs` reads `Retry-After` for both. `contexts/auth-context.tsx:49` and `hooks/use-user.ts:20` retry on `isTemporary`, so a 503 never signs the web out. Other queries: `getApiError` toast shows the 503 `detail`.
- `app/(protected)/layout.tsx`: path `/device` → `sessionStorage['applika:return-to']` before `router.replace("/login")`; once authenticated, consume once, `router.replace` (value must start `/`, not `//`).
- `app/cli/code/page.tsx` + `cli-code-page.tsx` (new), outside groups like `/login`, no auth: shows `<code>#<state>` read-only + "Copy" + "Paste this code into your terminal".
- i18n: none (frontend has no i18n).
- Design system (`frontend/CLAUDE.md`): `### UI Components` (`components/ui/tabs.tsx` variant `line`, `cn()`, tokens in `src/app/globals.css` `@theme`), `### Profile — connected accounts` (card, badge, `AlertDialog` confirm), `### Auth & Token Refresh` (429 never signs out), `### Routing` (Suspense around `useSearchParams`, `/login` outside groups).
- No `useHasFeature`/`FeatureGate`/nav `feature` (owner exception). `frontend/CLAUDE.md` updated.
Pattern: `components/profile/connected-accounts.tsx` + `hooks/use-account-links.ts`.

## CLI (C) — applika-cli 1.1.0
- `cli/src/applika/lib/pkce.py` (new): verifier `secrets.token_urlsafe(64)`, S256 challenge.
- `cli/src/applika/lib/device_flow.py` (new): start, poll at `interval`; `slow_down` +5 s; 429 → wait `Retry-After`; `expired_token`/`access_denied` → exit 1 with message.
- `cli/src/applika/lib/api.py`: `Authorization: Bearer`, no cookies; `_refresh` → `POST /auth/token` `refresh_token` grant; 429 or 503 keeps `session.json` and raises `ApiError(detail)`; other non-200 clears; 503 on any other route → `ApiError`, no refresh, session kept; `logout` → `POST /auth/revoke` then clear; UA `applika-cli/<version> (<platform.system()>)`.
- `cli/src/applika/lib/session.py`: shape unchanged (4 keys). Old CLIs read a 1.1.0 file: same JWT works as `__access` cookie, uuid7 works on `GET /auth/refresh`.
- `cli/src/applika/commands/auth.py`: `login [--device] [--manual] [--device-name TEXT]` (default `socket.gethostname()`, ≤100); ends existing session first (revoke, errors ignored); prints `Logged in as <username> on <device_name>`. `lib/loopback.py` reused.
- `cli/pyproject.toml` 1.1.0, `cli/CHANGELOG.md`, `cli/CLAUDE.md`, `cli/src/applika/skills/applika-cli/SKILL.md` (login section).

## Contract
- `GET /auth/cli/authorize?redirect_uri&code_challenge&code_challenge_method=S256&state` → 307 GitHub + `__cli_login`; 400 `{detail}`: existing loopback messages, `"code_challenge_method must be S256"`, `"Invalid code_challenge"` (43..128 base64url). `redirect_uri` = loopback (`validate_cli_callback_url`) or literal `oob`.
- GitHub callback, pkce login → 307 `<redirect_uri>?code&state` or `CLI_MANUAL_REDIRECT_URI?code&state`. Code TTL 60 s, one use.
- `POST /auth/token`, JSON on `grant_type`: `authorization_code` `{code, code_verifier, redirect_uri, device_name?}` · `refresh_token` `{refresh_token}` · `urn:ietf:params:oauth:grant-type:device_code` `{device_code}` → 200 `{access_token, token_type:"Bearer", expires_in, refresh_token, refresh_expires_in}` (refresh grant: same refresh_token, `refresh_expires_in` = full window, expiry slid). 400 `{error, detail}`, error ∈ `invalid_grant`, `unsupported_grant_type`, `authorization_pending`, `slow_down`, `access_denied`, `expired_token`. 422 bad shape. 503 `{detail:"Session service unavailable"}`.
- `POST /auth/revoke` `{refresh_token}` → 204 always.
- `POST /auth/device/code` `{device_name?}` → 200 `{device_code, user_code, verification_uri, verification_uri_complete, expires_in:600, interval:10}`.
- `GET /auth/device/verify?user_code=` (auth) → 200 `{device_name, client_label, ip, requested_at, expires_at}` · 404 `"Code not found or expired"` · 401.
- `POST /auth/device/approve` · `POST /auth/device/deny` `{user_code}` (auth) → 204 · 404 same · 409 `"Code already used"`.
- `GET /users/me/sessions` → 200 `[{id, client_type, sign_in_method, device_name, client_label, created_ip, last_ip, created_at, last_used_at|null, expires_at, ended_at|null, status: active|signed_out|revoked|expired, current}]`. Active by `last_used_at` DESC NULLS LAST, then ended by `coalesce(ended_at, expires_at)` DESC within `SESSION_HISTORY_DAYS`. Status derived, GET writes nothing: `logout|replaced`→signed_out, `revoked|github_revoked`→revoked, open row with key gone or past `expires_at`→expired. Live `last_used_at`/`last_ip` from Redis.
- `DELETE /users/me/sessions/{id}` → 204 (ended row: no-op 204; current: also clears both cookies) · 404 `"Session not found"` (unknown or not own).
- `POST /users/me/sessions/revoke-others` → 200 `{revoked: int}`.
- Unchanged shapes: `/auth/cli/start` 201, `/auth/cli/login/{id}` 303 (as built; ADR-0019 as-built note), `/auth/cli/exchange` 200 (values now JWT+sid, uuid7), `/auth/refresh` 200 `{detail:"Token refreshed"}` + Set-Cookie `__access` and `__refresh` (same value, full Max-Age) / 401 / new 503, `/auth/logout` 200. Every authenticated route: new 401 `"Session expired"`; new 503 `{detail:"Session service unavailable"}` + `Retry-After: 5` when Redis fails.

## Tests
Unit (backend): `tests/unit/test_pkce.py`, `test_user_agent.py`, `test_user_codes.py`, `test_session_status.py`, `test_get_current_user.py` (sid required; Redis error/timeout → 503, never passes), `test_rate_limit.py` (Bearer subject).
Integration: `tests/integration/test_migration_user_sessions.py` (round trip, seeded `users` intact each step), `test_sessions_api.py` (list order/history window/current, revoke, revoke-others, other user 404), `test_session_lifecycle.py` (callback row + keys, refresh, logout, revoke → next call 401, JWT without sid 401, legacy uuid4 key 401, re-login `replaced`, GitHub revoked, lost key → expired, refresh slides both keys' TTL + `expires_at` + `__refresh` Max-Age, Redis down → 503 on an authenticated route), `test_cli_pkce.py`, `test_device_flow.py` (pending, slow_down, denied, expired, one-time), `test_oauth_cli.py` (+ legacy shape unchanged, `cli_legacy` row, cookie refresh), `test_delete_account.py` (keys gone), `test_rate_limit.py` (Bearer per user).
CLI: `cli/tests/test_pkce.py`, `test_device_flow.py`, `test_api.py` (Bearer, `/auth/token` refresh, 429 and 503 keep session, 1.0.1 file loads), `test_commands.py` (login flags, logout revoke).
Frontend vitest: `components/profile/devices-tab.test.tsx`, `app/(protected)/device/device-page.test.tsx`, `app/cli/code/cli-code-page.test.tsx`, `app/(protected)/profile/profile-page.test.tsx` (tabs), `lib/rate-limit.test.ts` (`isTemporary`, 503 `Retry-After`).
E2E: `frontend/e2e/devices.spec.ts`: (1) e2e-user → `/profile` Devices → "This device" + seeded CLI row → Revoke → `GET /api/users/me` with Bearer `E2E_CLI_ACCESS_TOKEN` → 401; (2) API `POST /auth/device/code` → `/device?code=` → Approve → device grant 200 → row listed.

## Rules that bind
- `non-destructive-migrations.md`: create-only; drop only in `downgrade()`; nothing renamed.
- `migration-tests.md`: `test_migration_user_sessions.py`, upgrade/downgrade/upgrade with seeded rows.
- `prod-release-runbook.md`: A → owner migrates → B → C. Agents never touch prod.
- `cli-compatibility.md`: `/auth/cli/*`, `/auth/refresh`, `/auth/logout`, `/users/me` keep shapes; deprecated in OpenAPI; old commands work.
- `changelogs.md`: both CHANGELOGs; forced re-login, `sid`, sliding expiry + `__refresh` re-set on `/auth/refresh`, new 401 `Session expired`, new 503 `Session service unavailable` on every authenticated route (0.1.4–1.0.1 print it and keep the session), deprecations, new routes.
- `beta-features.md`: owner exception 2026-10-15 "Gate nothing"; no `FeatureKey`, seed row, `require_feature`, web gate.
- `quality-gates.md`: touched files ty-clean (171 baseline), coverage ≥ 90, prettier, tsc, vitest, e2e real stack.
- `branches-and-commits.md`: slice branch, `feat(auth): …`, PR to `develop`.

## Risks
- B logs out every web and CLI user. Owner announces. Old CLIs print "Please run `applika login` again".
- Redis down (fail closed): every authenticated route 503, signed-in app unusable until Redis is back. Web and CLI 1.1.0 keep session. Old CLIs keep it on 503, but clear it if their JWT expires mid-outage (`/auth/refresh` 503, today 500; any refresh non-200 logs them out).
- Redis without persistence: restart = everyone signed out (as today).
- `client_ip` is Traefik's unless `FORWARDED_ALLOW_IPS` holds its subnet. Post-B check: Devices tab IPs vary.
- Device polling vs `RATE_LIMIT_AUTH` 10/min per IP: interval 10 s, 429 → wait. NAT-shared IPs may still hit it.
- Device-code phishing (RFC 8628 §5.4): approval card shows device, IP, time, warning.
- Rollback B→A: B sessions lost; pre-B keys live ≤ 7 d.
- Extra Redis round trip on every authenticated request.
- Release order: chain sits on `641001baff09`; 0012/0013 must ship first.

## Open
- Closed 2026-10-15 (PRD `## Clarifications`): `sid` = public row id; sliding lifetime; fail closed (503).
- Prod env at B: `DEVICE_VERIFICATION_URI=https://applika.dev/device`, `CLI_MANUAL_REDIRECT_URI=https://applika.dev/cli/code` (owner sets in stack).
