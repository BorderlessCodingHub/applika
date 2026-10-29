# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Keeping This File Up to Date

**CLAUDE.md is a living document. Update it whenever the project changes in ways that affect how you work here.**

Update CLAUDE.md when:
- New entities, relationships, or domain concepts are added (update Domain Model Relationships)
- A new architectural pattern or layer is introduced
- A new essential command is added (tasks, scripts, docker targets)
- A new environment variable becomes required or optional
- A new domain exception is introduced and mapped to an HTTP status
- The authentication/token strategy changes
- A new dependency is added that has non-obvious usage patterns
- Project skills or MCP usage patterns change

Do NOT bloat CLAUDE.md with:
- Implementation details already visible in the code
- Ephemeral task notes or in-progress work
- Debugging steps or one-off fixes
- Anything already in git history or docstrings

---

## Seed Script Rule

**Always keep `scripts/seed_mock_data.py` up to date and working.**

The seed script exercises the full public API to create realistic mock data. It is the fastest way to verify that all endpoints work end-to-end after changes.

When you add or modify any of the following, update the seed script accordingly:
- New required or optional fields on `POST /applications`, `POST /applications/{id}/timeline`, the deprecated `POST /applications/{id}/steps`, or `POST /applications/{id}/finalize` (both the no-body close and the deprecated 0.1.4 body)
- New enums (e.g., `work_mode`, `experience_level`, `salary_period`, `currency`, `mode`, `availability`)
- New support data endpoints (platforms, steps, feedbacks) — update the `/supports` fetch and field extraction
- The timeline: `seed_timeline()` drives half the applications through `/timeline` (one initial screening each, typed interviews, interviews of type `unknown` where it used to write notes - the API refuses `note` and `feedback` with 422, an offer or denied outcome), finalize without a body and, for some, reopen; `seed_legacy_steps()` drives the other half through the deprecated `/steps` and the 0.1.4 `/finalize` body and warns when an answer lacks the `Deprecation` header
- Renamed or removed fields that the seed script currently sends
- New endpoints the seed script should exercise to keep coverage complete
- Changes to authentication (cookie name, token format)
- New or changed fields on `POST /base-cvs` — `seed_base_cvs()` creates 3 master CVs and asserts the 4th is refused with 409
- New or changed behaviour on the `/pdf` export routes — `seed_cv_pdfs()` posts to both at the end of the run and checks the bytes start with `%PDF-`
- New or changed fields on `/applications/{id}/cv` — `seed_application_cv()` gives roughly half the applications a CV copy and runs the full create → read → update → delete → recreate round trip on the first one, asserting the 2nd copy is refused with 409
- Tailoring by keywords and the fit (KODI-045, ADR-0017) — `seed_keyword_copy()` makes the second seeded CV copy with `tailoring: 'keywords'` on the first master CV, against `KEYWORDS_JOB_DESCRIPTION` (written so the reorder is guaranteed), asserts `adjustments` is non-empty and `was_ai_generated` is false, then asserts `GET /applications/{id}/cv/fit` answers a `score` from 0 to 100
- New or changed fields on `/applications/drafts*` — `seed_drafts()` creates one draft that gets a CV copy and is finished into a normal application, and one draft that is left open with a CV copy attached; it asserts the open one never appears in `GET /applications`. The finished draft sends its own `application_date` on create and calls `finish` with no body (KODI-036), asserting the finished application keeps that stored date rather than today's
- Saved job searches (KODI-047) — `seed_job_searches()` deletes any left from a previous run, then creates, renames, lists and deletes one, fills the cap of 10 and asserts the 11th is refused with 409
- Drafts from a job (KODI-047) — `seed_draft_from_job()` starts one draft from the first job of `GET /jobs` with no application, the first master CV and `tailoring: 'keywords'`, and asserts `job_id`, `has_cv` and the job's `application` mark; with no jobs (no worker run on the dev stack) it logs the skip
- Beta features (ADR-0018, ADR-0021) — `has_jobs_feature()` and `has_cvs_feature()` read `GET /users/me/features` right after `/supports`; without `jobs` the script skips `seed_job_searches()`; without `cvs` it skips `seed_base_cvs()`, `seed_cv_pdfs()`, `seed_application_cv()` and `seed_drafts()`; `seed_keyword_copy()` and `seed_draft_from_job()` need both. It prints why (an admin enrols the seed user at `/admin/features`) and never fails on the gate. A new gated feature adds its own check here. `app/scripts/seed_e2e.py` resets the features on every run, `jobs` and `cvs` alike: back to `beta` (`released_at` NULL), `e2e-user` on its list, `e2e-discord` off it, every opt-out of `e2e-admin` gone; it fails loudly when either row is missing (run `alembic upgrade head` first)
- Device sessions (ADR-0019) — the pasted `ACCESS_TOKEN` must be the `__access` cookie of a **live** browser session (its JWT carries `sid`; a token from before the release, or from a browser that logged out or was revoked, is 401 `Session expired`). `app/scripts/seed_e2e.py` opens every e2e session through `OpenSessionUseCase` (a `user_sessions` row + its Redis keys): one `borderless` session per seeded user (each user bound to its stub Borderless account, see `seed_e2e.py`) and one `cli_device` session ("e2e-cli") for `e2e-user`, printed as `cli_access_token`/`cli_refresh_token` and exported by `frontend/scripts/e2e.sh` as `E2E_CLI_ACCESS_TOKEN`/`E2E_CLI_REFRESH_TOKEN`
- **A 429 is waited out, never treated as a failure** (KODI-039, ADR-0015): the script's `httpx.Client` uses `RetryOn429Transport`, which reads `Retry-After` on a 429 and resends the exact same request once. The dev/e2e compose stacks already raise `RATE_LIMIT_DEFAULT`/`RATE_LIMIT_AUTH` so a normal run never trips it; the retry only matters against a stock, un-raised stack

After any such change, mentally walk through the seed script from top to bottom and confirm it would still run without errors against a fresh database.

---

## Project Overview

This is a FastAPI backend for **Applika.dev** (Application Panel), a job application tracking system with biweekly reporting and analytics. The codebase follows Clean Architecture with strict layer separation and uses async SQLAlchemy with PostgreSQL. All entity IDs use Snowflake-generated BigIntegers.

## Essential Commands

### Development
```bash
# Install dependencies
uv sync

# Run development server (port 8000 with auto-reload)
uv run task run

# Run formatter
make format

# Run linter with auto-fix
make lint

# Run tests with coverage
make test
```

### Background worker (ADR-0016)
```bash
# The worker (consumes the `applika:tasks` queue) and the single scheduler
# (enqueues `ingest_jobs` on JOBS_INGEST_CRON); both need REDIS_URL/DATABASE_URL
uv run taskiq worker app.worker.broker:broker app.worker.tasks
uv run taskiq scheduler app.worker.broker:scheduler app.worker.tasks

# In the dev compose stack: `worker` and `scheduler` services
docker compose logs -f worker
```

### Database Migrations
```bash
# Create new migration (auto-generate from models)
uv run task autorevision

# Apply migrations
uv run task auhead

# Rollback all migrations
uv run task adbase
```

### Seed Script
```bash
# Full reset + seed (downgrade → upgrade → seed)
uv run task seed

# Or seed manually (server must be running, requires a valid JWT access token)
python scripts/seed_mock_data.py
```

### Docker
```bash
# Start backend + PostgreSQL
docker compose up --build

# Run migrations in container (entrypoint already runs them)
docker exec applika.dev-api alembic upgrade head
```

## End-of-Task Validation

**Always finish a backend task by running formatting, linting, and tests.**

Run these at the end of any backend code change:

```bash
make format
make lint
make test
```

Do not skip this unless the user explicitly asks you not to run validation or the environment prevents it.

## Architecture

The codebase uses Clean Architecture with four main layers:

### Domain Layer (`app/domain/`)
- **models.py**: SQLAlchemy ORM models with `BaseMixin` providing Snowflake IDs + timestamps
- **repositories/**: Repository classes handling data access
  - All repositories use AsyncSession and follow async/await patterns
  - Handle transactions with explicit commit/rollback in try/except blocks

### Application Layer (`app/application/`)
- **use_cases/**: Business logic encapsulated in single-purpose classes
  - Each use case has one `execute()` method
  - Use cases are injected with repository dependencies
  - Keep transport-agnostic (no HTTP concerns)
- **dto/**: Data Transfer Objects using Pydantic for validation
  - Separate DTOs for creation, updates, and responses
- **services/**: External integrations (e.g., Discord webhook service)

### Presentation Layer (`app/presentation/`)
- **api/**: FastAPI route handlers organized by resource
- **schemas/**: API request/response schemas (Pydantic)
- **dependencies.py**: FastAPI dependency injection factories
  - Repository factories like `get_user_repository()`
  - Service factories like `get_discord_service()`
  - Authentication via `get_current_user()`
- **handlers.py**: Global exception handlers mapping domain exceptions to HTTP responses

### Library Layer (`app/lib/`)
- **types.py**: Snowflake ID type with Pydantic serialization
- **urls.py**: URL utility functions

## Key Patterns

### Repository Pattern
All repositories follow this structure:
- Constructor accepts `AsyncSession`
- Methods are async and use SQLAlchemy 2.0 select/insert syntax
- Explicit transaction management: `session.add()`, `await session.commit()`, `await session.rollback()`
- Eager loading with `selectinload()` for relationships

See `app/domain/repositories/application_repository.py` for reference implementation.

### Use Case Pattern
Use cases encapsulate business operations:
- Class-based with constructor dependency injection
- Single `async def execute()` method
- Raise domain exceptions (ResourceNotFound, ResourceConflict, etc.)
- Return DTOs, not ORM models

See `app/application/use_cases/applications/create_application.py` for reference.

### Authentication
- **Borderless is the only sign-in** (ADR-0024). `POST /auth/borderless/signin` `{email, password}` checks the credentials with Borderless from the server (`BorderlessClient`, `app/application/services/borderless_client.py`, httpx; `POST {BORDERLESS_API_URL}/api/auth/signin` → `data.user.*`, `data.token.accessToken`/`expiresIn`; no refresh token). The password is never stored or logged; the Borderless token is stored encrypted (`borderless_accounts.encrypted_access_token`, `encrypt_borderless_token`, `BORDERLESS_TOKEN_ENCRYPTION_KEY`) and never leaves the server. `BorderlessSignInUseCase` (`use_cases/borderless/sign_in.py`): per-email failure counter `applika:borderless:signin:<sha256(lower email)>` (`BORDERLESS_SIGNIN_EMAIL_LIMIT` in `…_WINDOW_SECONDS`, checked before the call, fail open) → 429; Borderless 401 → 401 "Invalid email or password"; 429 → 429 + `Retry-After`; 5xx/timeout (one retry) → 503 "Borderless is unavailable, try again later"; unset URL or key → 503 "Borderless sign-in is not configured"; unverified email → 403 `email_unverified`. Resolution: the account bound to the Borderless id; else the account whose email equals the Borderless email ignoring case (exact spelling first; bound to another id → 409 `binding_conflict`; several, none exact → 409 `email_ambiguous`), bound now; else a new account. A binding never moves on sign-in. Web branch: ends the browser's session `replaced`, opens a `borderless` session, sets both cookies, answers `{redirect_to: null, new_account}`; with the `__cli_login` marker it answers `redirect_to` (the CLI's loopback/oob URL with a one-use code, `cli_handoff_redirect` in `api/oauth.py`), no cookie, the browser's own session untouched
- **Membership badges** (`user_badges`, `BadgeKey` `borderless_base`|`borderless_psp`, history kept: revoking sets `revoked_at`). `RefreshBadgesUseCase` (`use_cases/borderless/refresh_badges.py`, never raises) runs at every sign-in, confirmation and refresh: binding `needs_reconnect` or expired → no call, nothing written; token no longer decrypts → `needs_reconnect`; `GET /api/users/profile` 200 → `data.user.membership` (only that path, ignoring case: BASE/PSP, else none) applied by `UserBadgeRepository.apply` (at most one live badge); 401/403 → `needs_reconnect`, rows kept; slow/failing/429 → `profile_read_failed_at`, rows kept. `badge_access(binding, live_badges)` (`use_cases/borderless/badge_access.py`) is the ONE rule: held = live row AND binding `active` AND `access_token_expires_at > now`. `data.user.github` is never read
- **Confirm** (`POST /auth/borderless/confirm`, signed in): same credential check, must be the Borderless account already bound (else 409 `binding_conflict`), renews the token + expiry, `status = active`, reads the membership. 204; no session row, no Redis session write, no cookie
- **One session per sign-in, one device** (KODI-057, ADR-0019). A session is a `user_sessions` row (`UserSessionModel`: device name, client, sign-in method, sign-in/last IP, granted, last used, `expires_at`, `ended_at` + `end_reason`; ended rows stay) plus two Redis keys on `REDIS_URL` (the rate limiter's instance), both `EXAT expires_at`: `applika:session:<uuid7>` → the session id, and `applika:session:id:<sid>` hash `{rk, user_id, last_used_at, last_ip}`. `SessionStore` (`app/application/services/session_store.py`) is the only code that touches them. **A missing key means the session has ended.** The refresh value is never stored in Postgres (not even hashed), never logged and never listed
- **Access token**: short-lived JWT, payload `{sub: users.id, sid: <user_sessions.id as string>, kind: 'access', exp}`. The web sends it in the HTTP-only `__access` cookie; `applika-cli` 1.1.0+ sends `Authorization: Bearer`. `get_current_user()` reads **Bearer first, then the cookie**, else 401 `Not authenticated`
- **Refresh value**: a random `uuid.uuid7()`, in the HTTP-only `__refresh` cookie (web and CLIs 0.1.4–1.0.1) or the CLI's own store (1.1.0). Never rotated
- **The check on every signed-in request** (`GetCurrentUserUseCase`): JWT decode first (bad/expired → 401 as before); no `sid`, a session whose key is gone, or a `sub` that is not the session's `user_id` (every pre-ADR-0024 token carried a GitHub id) → 401 `Session expired`; otherwise one Lua script (EXISTS → HSET `last_used_at`, `last_ip`) under `asyncio.timeout(0.5)`. Sets `request.state.session_id` (`CurrentSessionIdDp`). **Fail closed**: a `RedisError`, `OSError` or timeout raises `SessionServiceUnavailable` → 503 `{"detail": "Session service unavailable"}` + `Retry-After: 5`; the request never passes unchecked and nobody is signed out (a 401 would send every client to refresh). The GitHub restore callback runs the same check on its cookie
- **Sliding lifetime**: a session ends `REFRESH_TOKEN_EXPIRE_DAYS` (7) after its **last refresh**. `GET /auth/refresh` and the `refresh_token` grant resolve the uuid7; a user with no Borderless binding ends the session `expired`, 401 `Sign in again with Borderless`; otherwise read the membership (`RefreshBadgesUseCase`, `BORDERLESS_REFRESH_TIMEOUT_SECONDS`, never fails the refresh), then `EXPIREAT` both keys and `expires_at` a full window ahead and copy the live last use onto the row. `/auth/refresh` re-sets `__access` (new JWT, same `sid`) **and** `__refresh` (same value, full Max-Age); a refused refresh is 401 and clears both cookies, a 503 clears nothing
- **Ending a session** (`EndSessionUseCase`): DEL both keys, then set `ended_at` + `end_reason` (`logout` = `GET /auth/logout` / `POST /auth/revoke`, `revoked` = Devices tab, `replaced` = a new web sign-in in the same browser; `github_revoked` stays only on rows ended before ADR-0024) and copy the live last use. Only a live session ends; an ended row, a row past `expires_at` or one whose key is gone is a no-op (it already reads as ended/expired). `DELETE /users/me` DELs every open session's keys before the user goes (rows by CASCADE)
- **Cutover** (the release that ships KODI-057): nothing reads `applika:refresh_token:*` any more and a JWT without `sid` is 401, so every web and CLI user signs in again; the old keys die on their TTL
- **CLI login handoff (legacy, deprecated)**: `/auth/cli/start`, `/auth/cli/login/{id}`, `/auth/cli/exchange` keep their shapes for CLIs 0.1.4–1.0.1 (ADR-0009) and open a `cli_legacy` session at the exchange. `/auth/cli/login/{id}` and `/auth/cli/authorize` 307 to `WEB_SIGNIN_URI?cli=1` with the `__cli_login` marker (400/404 unchanged); the sign-in completes on applika's Borderless sign-in page. A PKCE code is refused there (it is redeemed only with its verifier on `POST /auth/token`)
- **CLI sign-in (1.1.0+)**: authorization code + PKCE S256 (`GET /auth/cli/authorize`, loopback `redirect_uri` or `oob` → the code is shown at `CLI_MANUAL_REDIRECT_URI`), or the RFC 8628 device code (`/auth/device/*`, approved by a signed-in web user at `DEVICE_VERIFICATION_URI`). Login state and codes live in `AuthHandoffStateUseCase` (`flow='pkce'`, `code_challenge`, `redirect_uri`; codes `GETDEL`, 60 s); device codes in `DeviceCodeUseCase` (`applika:device:code:<device_code>` hash + `applika:device:user_code:<CODE>`, `EX DEVICE_CODE_TTL_SECONDS`, decided and consumed by Lua). Each CLI sign-in is a session of its own (`client_type='cli'`); a CLI sign-in never ends the browser's own session
- **Not gated**: the Devices API and every CLI sign-in route are open to every user (owner: "Gate nothing", the ADR-0019 exception to ADR-0018)
- Token and cookie utilities in `app/core/tokens.py`, PKCE in `app/core/pkce.py`, user codes in `app/core/user_codes.py`, device labels (`describe_user_agent`: "Chrome on macOS", "applika-cli 1.1.0", httpx → "applika-cli (older version)") in `app/core/user_agent.py`, encryption in `app/core/crypto.py`
- Cookie settings: HTTPOnly, Secure in PROD, SameSite=Lax
- **Tests**: `async_client`/`admin_client` override `get_current_user` (no session needed). Fakes `FakeBorderlessClient`/`FakeGitHubOAuthService` replace `BorderlessClientDp`/`GitHubOAuthServiceDp` in every test (`tests/conftest.py`, autouse); `bind_borderless(session, user_id, …)` and the `reports_badge` fixture (an active binding + a live PSP badge) set up a member; `bound_user` (`tests/integration/conftest.py`) binds the base user to a fake account with `CREDENTIALS`. A test that sends a real token uses `real_client` (`tests/integration/conftest.py`, the real dependency on `redis_client`) and opens a session through `tests/sessions_seed.py` (`open_session` = row + keys, `live_access_token` = keys only)

### GitHub restore (ADR-0024)
- GitHub is not a sign-in. `GitHubOAuthService` (`app/application/services/github_service.py`, httpx) serves the one-shot restore only: `authorize_url(state)` (scope `read:user`), `exchange_code`, `fetch_identity -> (id, login)`, `revoke` (best effort). No GitHub token is stored or logged
- `github_connections` holds the GitHub identity every pre-ADR-0024 account signed in with (seeded by revision `d9e0b46dd7e1`). `POST /auth/github/restore` (`BeginGithubRestoreUseCase`): 409 "This account already has its GitHub data" when the caller has a row; 503 "GitHub restore is not configured" without the client id and secret; marks the welcome prompt seen; a 10-minute nonce (`AccountLinkStateUseCase`, `applika:account_link:github_restore:{nonce}`)
- `GET /auth/github/callback` always 307s to `ACCOUNT_LINK_REDIRECT_URI?account=github&status=…`: consume the nonce, resolve the caller's own `__access` (`GetCurrentUserUseCase`), require the same user, exchange, read the identity once, revoke, then `CompleteGithubRestoreUseCase`: no row → `not_found` (nothing stored); the old account already bound → `already_bound`; the caller holds data (`UserRepository.holds_data`: applications incl. drafts, cycles, reports, master CVs, CV copies, timeline events) → `has_data`; else, in one transaction, the binding and every badge move to the old account, the caller's session keys are DEL'd and the caller is deleted → `restored`, and the browser gets a new `borderless` session for the old account. Any failure → `error`
- `users.github_restore_prompt_seen_at`: `github_restore.prompt` on `/users/me` is "no GitHub row and not seen"; `POST /users/me/github-restore/dismiss` marks it

### Reports and webhooks (ADR-0024)
- `/reports*` carry `RequireReportsBadgeDp`: no live badge → 403 `{detail: "Reports are for Borderless BASE and PSP members", code: "badge_required"}` (administrators included); a live badge that does not count → 403 `{detail: "Sign in again to confirm your membership", code: "membership_unconfirmed"}`. Reports are never deleted; they come back when the badge counts again. No beta gate (ADR-0024 §9)
- `ResolveReportWebhooksUseCase` → the URLs of every `report_webhooks` row whose badge the author holds, distinct, oldest first; a webhook with no badge receives nothing. `SubmitReportUseCase` saves first, answers 201 whatever the webhooks answer
- `DiscordService.post_report_message(message, webhook_url=None)` posts `{"content", "allowed_mentions": {"parse": []}}`: report and feedback posts carry `@<username>` and mention nobody. Feedback posts to `DISCORD_FEEDBACK_WEBHOOK`

### Exception Handling
Domain exceptions in `app/core/exceptions.py`:
- `ResourceNotFound` → 404
- `ResourceConflict` → 409
- `ApplicationFinalized` → 409 (a closed application: "Reopen the application to edit it")
- `BusinessRuleViolation` → 422 (among others: an application archived in a cycle)
- `InvalidDate` → 422
- `ForbiddenAccess` → 403
- `PdfRenderFailed` → 500
- `ServiceUnavailable` → 503 (KODI-046: the background worker's queue cannot be reached, `POST /admin/jobs/runs` → "Background service unavailable")
- `SessionServiceUnavailable(ServiceUnavailable)` → 503 `{"detail": "Session service unavailable"}` + `Retry-After: 5` (KODI-057: the session store cannot be reached, on every signed-in route, the GitHub callback, `/auth/refresh`, `/auth/logout` with a `__refresh` cookie, `/auth/token`, `/auth/revoke`, `/auth/device/*`; a sign-in that fails here leaves no `user_sessions` row)
- `InvalidSession` → 401 `{detail}` (KODI-057: a refresh value that resolves to no live session)
- `OAuthError` → 400 `{"error": <RFC 6749/8628 code>, "detail"}` (KODI-057: `POST /auth/token`)
- `InvalidRequest` → 400 `{detail}` (KODI-057: a bad PKCE method or challenge on `/auth/cli/authorize`)
- `CodedRefusal` → its own status, `{detail, code?}` and headers (ADR-0024): `InvalidCredentials` 401, `EmailUnverified` 403 `email_unverified`, `BindingConflict` 409 `binding_conflict`, `EmailAmbiguous` 409 `email_ambiguous`, `SignInRateLimited` 429 + `Retry-After`, `BadgeRequired` 403 `badge_required`, `MembershipUnconfirmed` 403 `membership_unconfirmed`
- `NotImplementedError` → 501

Handlers registered in `app/presentation/handlers.py` via `register_handlers(app)`.

### CV PDF Rendering

`app/application/services/cv_rendering/` turns a stored CV document — a master
CV or an application's copy — into PDF bytes with **RenderCV 2.8 + Typst**
(`rendercv==2.8` + `typst==0.15.0`, both pinned). All wheels, no system
packages, no Dockerfile change.

Deliberately **not** `rendercv[full]`: that extra pulls `rendercv-fonts` — 59 MB
of fifteen font families — for a theme that typesets in Source Sans 3 alone,
plus the CLI-only `typer`, `watchdog` and `packaging`. The single module in
RenderCV that imports it is `renderer/pdf_png.py`, and nothing else in the
render path needs that module, so `renderer.py` never imports it and drives
`typst.Compiler` itself. Schema validation is unaffected — RenderCV hardcodes
`available_font_families` as a literal list, so `Source Sans 3` stays valid.

- `mapper.py` — a pure `document → RenderCV dict/YAML` map. An empty section is
  omitted, never printed blank. It also defuses the three ways ordinary stored
  data would otherwise 500: an email or phone RenderCV refuses is dropped from
  the header instead of aborting the render, a link URL `pydantic.HttpUrl`
  would refuse is dropped the same way, and `#word` — which RenderCV reads as a
  *Typst command* — is rewritten to `#sym.hash`.

  **`Links` is never a section.** The owner: *"Links isn't a section, it must
  appear in bellow the headline, alongside with my email, location and links."*
  Every stored link becomes a **header connection**, on the same line as the
  location, the email and the phone. One RenderCV recognises goes to
  `social_networks`; every other one goes to `custom_connections`, emitted
  **after** `social_networks` because `Cv.capture_input_order` records this
  dict's key order as `cv._key_order` and `parse_connections` walks it.
  `custom_connections` and not `cv.website`: both are unbounded, but
  `parse_connections` sets a website's body to `clean_url(url)` and throws the
  user's label away, while a custom connection's body **is** its `placeholder`,
  so `label` survives (blank label ⇒ the cleaned URL). `fontawesome_icon` is
  `'link'` — required by the model, never typeset, because the theme sets
  `header.connections.show_icons=False`. This is also what puts the PDF back on
  parity with the on-screen preview, which always rendered links inline in the
  header. A link URL `pydantic.HttpUrl` refuses (`not a url`, a scheme-less
  `github.com/ada`) is **dropped from the header** rather than raising — before
  the section was retired it printed under a `Links` heading instead.

  **Section order is insertion order, and it only survives the dump because
  `sort_base_mapping_type_on_output` is off.** The order the owner asked for is
  Summary, Experience, Languages, Skills, Projects, Education, Certifications,
  and **nothing follows Certifications**; `ruamel.yaml`'s representer sorts
  mapping keys by default, which is what once put the summary at the bottom of
  the page. `SECTION_ORDER` names it and `tests/unit/test_cv_rendering.py`
  asserts it on the generated YAML text and on the generated `.typ`, never by
  reading a parsed dict back.

  Section shapes: skills are NormalEntries (`{name: "<category>:", summary:
  "<keywords joined by ' · '>"}`, U+00B7 MIDDLE DOT — *not* the U+2022 BULLET
  the header separator uses); projects are NormalEntries whose summary is
  `"<markdown link>\n<description>"`, so the entry reads name / link /
  description on three lines, with the raw URL standing in for a missing link
  label; education is an EducationEntry, dated exactly like experience.

  **Experience and education dates go to RenderCV's `start_date`/`end_date`,
  never to its arbitrary `date`.** The stored `start` / optional `end` are ISO
  `YYYY-MM`, which `start_date`/`end_date` accept verbatim, and the theme's
  `templates.single_date` (`MONTH_IN_TWO_DIGITS/YEAR`) and
  `templates.date_range` (`START_DATE - END_DATE`) typeset them as
  `02/2023 - 02/2024`. An entry with no `end` omits `end_date` and RenderCV's
  own `check_and_adjust_dates` fills in `present` — the mapper never writes
  that word. The two are **mutually exclusive**: setting `date` makes RenderCV
  discard `start_date`/`end_date` silently, so `_apply_period()` is the single
  place either key is written and `date` is never emitted for these sections.
  A blank `start` omits both keys rather than emitting a half range.
- `renderer.py` — compiles in `anyio.to_thread.run_sync` under
  `CV_PDF_RENDER_TIMEOUT_SECONDS`, in a temp directory removed in `finally`.
  The directory is mandatory: RenderCV resolves a custom theme by looking for a
  folder named after it **next to the input YAML**, so every render gets its own
  copy of `themes/applika/`. Failure or timeout → `PdfRenderFailed`, with a
  fixed message — RenderCV's own errors quote the CV field that upset them.
- `fonts/` — the four Source Sans 3 faces the theme uses, plus their `OFL.txt`
  (the licence has to travel with the files). They are the **only** fonts on
  the compiler's path, and `ignore_system_fonts=True` keeps the host's own out,
  so a developer machine and the API image — which has no system fonts at all —
  render the same row identically. A glyph Source Sans 3 lacks does not fail
  the compile: Typst silently falls back to a built-in face and embeds that,
  which is why the integration test asserts the embedded font set holds Source
  Sans 3 **and nothing else**. Kept outside `themes/applika/` on purpose — that
  folder is copied per render.
- `themes/applika/` — the one theme, `ApplikaTheme(ClassicTheme)` plus four
  `.j2.typ` templates, vendored from the owner's own theme and renamed
  `custom` → `applika`. Every design token is an overridden field default, so
  the generated YAML only ever says `design: {theme: applika}`. The user does
  not choose a theme. **Every** token of the owner's `design` block is set
  here, including the ones that happen to equal RenderCV's own default — the
  file reproduces *his block*, not the delta against `ClassicTheme`, so a
  RenderCV release that moves a default cannot move the product's look.
  `OWNER_DESIGN_TOKENS` in `tests/unit/test_cv_rendering.py` pins all of them
  one parametrized case per dotted path, and a companion test re-reads his
  file when it is on disk and fails if the table does not cover it key for key.
  Education needs no vendored template: `templates.education_entry` in that
  block drives ClassicTheme's own `EducationEntry`.
  `themes/applika/__init__.py` is loaded by RenderCV via
  `importlib.util.spec_from_file_location`, outside the `app` package — its
  imports must stay absolute and must never reach into `app`.

**The four `.j2.typ` files are the owner's, and they are frozen.** The owner:
*"Just use the template as is in the reference directory removing the key
achievements section, I won't accept any deviation of the original template."*
The only edit the theme carries is dropping `key_achievements` from the grid
branch of `SectionBeginning.j2.typ`. `tests/unit/test_cv_rendering.py` enforces
that twice — a diff against the owner's folder when it is on disk, and a sha256
pin that also runs in CI. A layout problem is fixed in `mapper.py`, never in a
template; a change that genuinely needs one goes back to the owner.

One consequence to know before touching `mapper.py`: `SectionBeginning.j2.typ`
opens a `#grid(` only for `languages` while `SectionEnding.j2.typ` closes one
for **every** OneLineEntry section, so **`Languages` is the only section that
may map to OneLineEntry**. Certifications are TextEntry lines
(`**label** details`) for exactly that reason. Adding a second
OneLineEntry section does not fail the compile — Typst prints the orphan `[`,
`],` and `)` as text — so the guard is a delimiter-balance assertion on the
generated `.typ`, not on the PDF.

### The Tailoring Port
`TailoringService` (`app/application/services/tailoring.py`) is a `Protocol`
describing "tailor a master CV to a job posting": one `async def tailor(request)
-> TailoringResult`. It exists so a model-backed implementation can be dropped
in later without changing the stored CV shape or the API.

There are **two** bindings (ADR-0017, amending ADR-0007), both deterministic,
with no model, no network and no external service:

- `CloneTailoringService` (`clone_tailoring.py`) copies the master CV verbatim
  — identity and contact included — with `was_ai_generated=False` and
  `adjustments=[]`. It is the **default** everywhere.
- `KeywordTailoringService` (`keyword_tailoring.py`, a port of Ían
  Muliterno's `cv_tailor_service.py`) starts from the clone, then only
  reorders, stably, by match with the job description's keywords: keywords
  within each skill category, skill categories, bullets within each
  experience entry. It never adds, removes or rewrites text, never reorders
  entries or other sections, keeps `was_ai_generated=False` and records one
  `{section, description}` adjustment per section it moved. A blank job
  description gives exactly the clone.

The binding is picked **per request**: `POST /applications/{id}/cv` takes
`tailoring: "copy" | "keywords"` (default `"copy"`), and
`get_tailoring_resolver()` in `dependencies.py` returns `resolve_tailoring`,
a `TailoringResolver` (`Callable[[TailoringMode], TailoringService]`) the
create use case calls with that value. A body without `tailoring` — every
installed `applika-cli` — gets the clone. `"keywords"` on an application with
a blank `job_description` is a 422 `"Add a job description to tailor by
keywords"`, checked after the editability guard and before anything else is
read. There is no AI in this codebase. The port is `async` even though
neither binding does I/O.

The keyword fit (`keyword_fit.py`, a port of Ían's `keywords_service.py`) is
pure functions: `job_keywords(text, tags)` (25 most frequent terms + 25 most
frequent word pairs, stop words removed, plus tags; a tag is matched
as written, its own punctuation included, and dropped when it holds no word
(`-`, `#`) or is a lone stop word or letter). Since KODI-046 (owner,
2026-10-12) a word may start with a digit and hold letters of any script
(`5G`, `3D`, `2FA`, `Vue 3`, `Résumé` are kept and matched), a token with no
letter is never a term (`2024`, `10+`), a leading dot is part of the word
(`.NET` never matches "Net income"), sentence punctuation around a tag goes
(`Python,` is `python`), and a hyphen cut off a word still separates it from
the next one (`machine- learning` is no pair), `cv_text(content)`
(headline, summary, skill keywords, experience roles and bullets, project
names and descriptions, certifications) and `score_fit(keywords, text)`
(whole word/phrase, case-insensitive, `round(100 × matched ÷ keywords)` half
up, `score=None` without keywords). Commits that port or change either file
carry `Co-authored-by: Ían Muliterno <iannimuliterno@gmail.com>`.

### Background worker (ADR-0016)

Job collection and fit recompute run in a **taskiq** worker, a delivery layer
of its own (`app/worker/`, next to `app/presentation/`), never in the API
process. The API only produces tasks.

- **Broker** (`app/worker/broker.py`): `ListQueueBroker` on
  `TASKIQ_BROKER_URL` (unset → `REDIS_URL`), queue `applika:tasks`, **no
  result backend** - a run's outcome lives in `job_sources.last_run_*`.
  `socket_timeout=None` is deliberate: redis-py 8 reads with a 5-second
  default and the worker's `BRPOP` would die every 5 seconds; connecting is
  bounded (2 s). `TaskiqScheduler` + `LabelScheduleSource` reads the tasks'
  `schedule` labels; run **exactly one** scheduler. Under
  `ENVIRONMENT=TEST` the broker is `InMemoryBroker(await_inplace=True)`, so
  `.kiq()` runs the task inline in a test.
- **Tasks** (`app/worker/tasks.py`, thin): `ingest_jobs` on
  `JOBS_INGEST_CRON` (default hourly, UTC) takes the lock
  `applika:jobs:ingest:lock` with `SET NX EX JOBS_INGEST_LOCK_SECONDS` on the
  API's own `REDIS_URL` Redis; held → logs and returns (R-009); released in
  `finally` by a compare-and-delete, so a run that outlived its lock never
  frees the next run's. `recompute_fit(base_cv_id)`. Each task opens its own
  session (`AsyncLocalSession`) - never a request's.
- **Port**: `JobQueue` (`app/application/services/job_queue.py`:
  `enqueue_ingest`, `enqueue_recompute_fit`, `ingest_running`) bound by
  `TaskiqJobQueue` (`app/worker/queue.py`, every call under a 2-second
  timeout, raises on failure). `JobQueueDp` in `dependencies.py`;
  `tests/conftest.py` overrides it with `FakeJobQueue` (the `job_queue`
  fixture) for `async_client`/`admin_client`.
- **Lifespan** (`app/main.py`): starts/stops the broker client
  (`start_client`/`stop_client`); a failure is a WARNING, **never** a failed
  boot. Redis down = runs and recomputes pause, the API keeps serving.
- **What a run does** (`use_cases/jobs/ingest_jobs.py`): for each enabled
  source that has a scraper, fetch the last `JOBS_LOOKBACK_DAYS` (undated
  postings too), upsert on `(source_id, external_id)` (new → insert;
  same `content_hash` → only `last_seen_at`; changed → every field, fresh
  `keywords`, `is_active` back on; fields cut to their columns; `keywords`
  are part of the hash, so a matcher change refreshes every posting), and
  record `last_run_at`/`status` (`ok`|`failed`|`blocked`)/`found`/`saved`
  (= inserted + changed)/`error` (the scraper's own fixed text, or
  `Unexpected error: <Type>` - never a stack or a message that could quote
  a secret). One source failing never stops the other. Then postings past
  `coalesce(posted_at, first_seen_at) + JOBS_RETENTION_DAYS` get
  `is_active=false` (rows kept, R-007) and lose their fit rows, and
  `RecomputeFitUseCase` scores new/changed jobs × every master CV, then every
  stale CV (`coalesce(updated_at, created_at)` past its newest
  `computed_at`, or no row) × every listed job. The stale list is read
  **before** the new jobs are scored - scoring them stamps every CV's
  `computed_at`, which would hide an edit whose enqueue was lost. `score_fit(...)` `None` → no
  row. The worker writes jobs, sources and fit scores only - nothing under
  `app/worker/` or `use_cases/jobs/` imports an application, CV copy or
  saved search repository (a test greps for it).
- **Master CV save** (`api/base_cv.py`): POST and PATCH call
  `request_fit_recompute` after the write - a queue failure is a WARNING,
  the answer is unchanged; DELETE queues nothing (FK CASCADE removes the
  fit rows).
- **Scrapers** (`app/application/services/job_ingestion/scrapers/`, ports of
  Ían Muliterno's, commits carry his `Co-authored-by`): `himalayas`
  (`cloudscraper` behind the one typed wrapper `cloudscraper_get`, paging
  in `anyio.to_thread`, 50 pages × 20 - about seven hours of Himalayas
  postings, a WARNING when the budget runs out), `remoteok` (`httpx`), each
  with `JOBS_SCRAPER_TIMEOUT_SECONDS`; a Cloudflare challenge, 403 or 429 is
  `SourceBlocked`, anything else `SourceFailed`. HTML descriptions go
  through the stdlib `HTMLParser` to plain text (script/style dropped).
  `fixture` serves every source code from `JOBS_FIXTURE_PATH`
  (`tests/fixtures/jobs/postings.json`, `posted_days_ago` dates relative to
  today's midnight UTC) and is **refused in PROD** by `Settings`.
  `registry.build_registry` builds them from `JOBS_SCRAPERS`.
- **Deploy**: compose runs `worker` and `scheduler` from the backend image,
  the API's environment, after `api` is healthy (the migration ran); they
  never run Alembic. CD updates the swarm services named by
  `vars.SWARM_WORKER_SERVICE_NAME`/`vars.SWARM_SCHEDULER_SERVICE_NAME` only
  when they exist. `taskiq worker` starts **2 processes** by default
  (`--workers`).

### Beta features (ADR-0018)

A user-facing feature starts in `beta` and is released to everyone later.
Binding for every new user-facing feature: the workspace rule
`.claude/rules/beta-features.md` (outside this repo, at the workspace root).
The rule (`app/core/features.py` `access_via`, mirrored as ONE SQL predicate
in `FeatureRepository.access_predicate`): a user has feature F when F is
`general`, OR a `(F, user)` row is on `feature_beta_users`, OR
`users.is_admin` is true and no `(F, user)` row is on
`feature_admin_opt_outs`. Nothing else grants F. An opt-out only removes the
admin access: a listed admin keeps F, everyone has a `general` F, and an
opt-out left by a former admin grants nothing. A key with no `features` row
is hidden from everyone, admins included (fail closed).

- **Keys**: one `StrEnum`, `FeatureKey` (`JOBS = 'jobs'`, `CVS = 'cvs'`). A
  new feature adds a member, its own Release A seed row, and
  `require_feature` on its routes. `cvs` (master CVs, CV copies, drafts) is
  a feature gated after it shipped (ADR-0021): its Release A revision
  `f28e3d9705dd` listed every CV owner, its Release B revision
  `647a047921ec` tops the list up with the users whose first CV came after
  Release A (`added_by` NULL both times). Only those two migrations write a
  beta list outside `/admin/features`.
- **Gate**: `require_feature(FeatureKey.X)` in `dependencies.py`, built on
  `CurrentUserDp` (anonymous gets today's 401 first) and `FeatureRepositoryDp`.
  Without the feature it raises `ResourceNotFound('Not Found')`, so the body
  is `{"detail": "Not Found"}` - byte-equal to an unknown route
  (`NOT_FOUND_DETAIL`). Applied on the **router** when the whole router is
  gated (`api/jobs.py`, `api/job_searches.py` on `jobs`; `api/base_cv.py`,
  `api/tailored_cv.py`, `api/application_draft.py` on `cvs`), on the
  **route** for a second key inside a gated router (`POST
  /applications/drafts/from-job` and `GET /applications/{id}/cv/fit` add
  `jobs`, so they need both), and **per value** for a gated option on a
  route (`POST /applications/{id}/cv` with `tailoring: "keywords"` →
  `BusinessRuleViolation('Unknown tailoring option')` 422 before the use case,
  through `user_has_feature` on `jobs`; `copy` or no field never queries;
  without `cvs` the router's 404 comes first). **Per request** in a handler:
  `GET /jobs` and `GET /jobs/{id}` call `user_has_feature(FeatureKey.CVS,
  ...)` and pass `with_fit` to the use case - without `cvs` no fit at all
  (`best_fit` null, `fits` [], `min_fit` → empty page, `sort=fit` = newest).
- **No cache**: one indexed query per gated request; `is_admin` comes from the
  database on every request (`get_current_user`), so an admin change applies
  on the next request, no deploy, no restart.
- **Never gated**: `app/worker/*` and `use_cases/jobs/` (they act for no
  user; a test greps for `require_feature` there; the worker scores every
  master CV whoever owns it), every `/admin/*` route (`AdminUserDp` guards
  them; `/admin/jobs/sources` stays open to an opted-out admin),
  `/applications*` (an application keeps working without its CV link), the
  timeline, `/steps*`, `/finalize`, `/supports`, `Draft.job_id` and
  `TailoredCVOut.adjustments`. Losing a feature deletes nothing: CVs,
  copies, drafts, searches and dismissals come back unchanged.
- **What the gate cannot hide** (plan 0013 correction 5, owner-approved
  2026-10-14): FastAPI decodes the JSON body before any dependency runs, so a
  body that is not JSON answers its own 422 `json_invalid` on a gated route,
  and Starlette answers an undefined method with 405. Field validation runs
  after the dependencies, so a well-formed body with wrong fields is still the
  404. Both hold on the slash-suffixed path too (`POST /jobs/` is 405).
- **Trailing slash** (owner ruling 2026-10-14): Starlette redirects a path
  that matches no route but would match without its slash (307) before any
  dependency runs, which would reveal a gated route. So every gated route
  gets a schema-hidden `<path>/` twin (`add_slash_twins`,
  `app/presentation/gated_slash.py`, called at the end of `api/jobs.py`,
  `api/job_searches.py`, `api/base_cv.py`, `api/tailored_cv.py` and
  `api/application_draft.py`, over every route): same endpoint,
  methods and dependencies; its regex takes one trailing slash or more,
  since Starlette's redirect strips them all. Without the feature `/jobs/`,
  `/jobs//`, `/jobs/{id}/`, `/job-searches/` etc. answer the gate's 404,
  byte-equal to `GET /no-such-route/`; with it the slash path is served
  directly by the same handler; anonymous gets the 401. `GET`/`PUT`/`DELETE
  /applications/drafts/from-job/` reach the `/applications/drafts/{draft_id}/`
  twin, as the slash-less form reaches `/{draft_id}` (422 with `cvs`, the
  404 without). Every other route (the CLI's `/supports/`, `/applications/`,
  `/applications/{id}/`, `/users/me/`) keeps Starlette's 307 -
  `redirect_slashes` stays on app-wide. A new gated router or route calls
  `add_slash_twins` too.
- **Tests**: `create_all` has no seed rows, so no feature exists in a test
  until a test inserts it. The `jobs_beta` fixture (`tests/conftest.py`)
  inserts `jobs` as revision `641001baff09` seeds it and enrols the
  `async_client` user; `cvs_beta` does the same for `cvs` (revision
  `f28e3d9705dd`'s name and description) and sits on every CV and draft
  test module; `admin_client` has a feature once its row exists. Helpers
  in `tests/features_seed.py` (`seed_jobs_feature`, `seed_cvs_feature`,
  `enrol`, `opt_out`). The gate itself: `tests/integration/
  test_feature_gating.py` (`jobs`) and `test_cvs_gating.py` (`cvs`).

### Snowflake IDs
All entity primary keys use Snowflake-generated `BigInteger` IDs instead of UUIDs or auto-increment. Defined in `app/lib/types.py` with Pydantic serialization to string for JSON/OpenAPI.

### Request ID Logging
- Every request gets a UUID via `HTTPLifecycleMiddleware`
- Request ID propagated via context variable (`request_id_ctx`)
- Added to logs via `RequestIdFilter`
- Returned in response header `X-Request-ID`
- `client_ip` is the address **uvicorn resolved** (KODI-039, ADR-0015):
  uvicorn's `proxy_headers` (on by default) rewrites `request.client.host`
  from `X-Forwarded-For` only when the connecting peer is in
  `FORWARDED_ALLOW_IPS`. The middleware reads `request.client.host` only —
  it never reads the raw header itself, since anyone can forge it

### Rate limiting (ADR-0015)

`RateLimitMiddleware` (`app/config/rate_limit.py`, pure ASGI, same shape as
`DeprecationHeaderMiddleware`) wraps every HTTP route in a fixed-window
limiter backed by Redis (`app/core/rate_limit.py`). Installed in
`app/main.py` **inside** (added before) the CORS middleware, so CORS wraps
it: a 429 still carries `Access-Control-Allow-Origin`, and a browser
preflight (`OPTIONS`) is answered by `CORSMiddleware` before this
middleware ever counts it.

- **Subject**: a request whose `Authorization: Bearer` header, else whose
  `__access` cookie (KODI-057, ADR-0019: Bearer first), holds a valid,
  unexpired access token is counted against that token's subject
  (`user:<sub>`); any other request is counted against the client IP
  (`ip:<addr>`) — the same `client.host` uvicorn resolved, above. The
  limiter reads the JWT only: the session check is `get_current_user`'s,
  and the limiter stays fail open.
- **Buckets**: `/auth/*` counts against `RATE_LIMIT_AUTH` (default 10);
  every other route against `RATE_LIMIT_DEFAULT` (default 120). The two are
  counted separately, `RATE_LIMIT_WINDOW_SECONDS` (default 60) wide.
- **Fixed window + `EXPIREAT`**: the key is
  `applika:ratelimit:{bucket}:{subject}:{window_index}`
  (`window_index = floor(now / window)`); one Redis pipeline runs `INCR`
  then `EXPIREAT (window_index + 1) * window + 1` — the key always expires
  one second after its window ends, and a refused request never pushes
  that end out (the value only depends on `window_index`, not the count).
- **Fail open, bounded**: the pipeline runs under `asyncio.timeout(0.5)`; a
  `RedisError`, `OSError` or a timeout returns `None` and logs a WARNING
  (`rate_limit_unavailable`, naming the bucket only, never the subject) —
  the request goes through with no `X-RateLimit-*` headers.
  `RATE_LIMIT_ENABLED` (default `True`) is read on every request, so it
  switches with a restart, no release.
- **Over the limit**: `429`
  `{"detail": "Too many requests. Try again in <n> seconds."}` +
  `Retry-After: <n>` + `X-RateLimit-Limit`/`X-RateLimit-Remaining: 0`/
  `X-RateLimit-Reset: <n>`. The route handler never runs. Under the limit,
  the same three `X-RateLimit-*` headers ride the real answer.
  `CORSMiddleware.expose_headers` includes `Retry-After` and the three
  `X-RateLimit-*` headers, so the web app can read them across origins.
- **Traefik + `FORWARDED_ALLOW_IPS`**: production runs behind Traefik on
  the swarm (ADR-0010). `FORWARDED_ALLOW_IPS` must hold Traefik's overlay
  subnet or every anonymous request looks like it comes from Traefik
  itself, and shares one IP bucket. Deploy order (plan 0011 `## Release`):
  raise `RATE_LIMIT_AUTH`, set `FORWARDED_ALLOW_IPS`, confirm the request
  log's `client_ip` shows real, varying addresses, then drop the raise.
- **Tests off by default**: `tests/conftest.py` sets
  `envs.RATE_LIMIT_ENABLED = False` for the whole session; a test that
  exercises the limiter turns it back on with `monkeypatch`.
- **Compose stacks raised**: `docker-compose.yml` and
  `docker-compose.e2e.yml` set `RATE_LIMIT_DEFAULT`/`RATE_LIMIT_AUTH` far
  above anything a dev session, the seed script or the E2E suite would hit,
  so the limiter stays wired up (still on) without either ever seeing a
  429.

## API Endpoints

### OAuth (`/auth`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/auth/borderless/signin` | No | ADR-0024: `{email ≤100, password 1..200}` → 200 `{redirect_to, new_account}` (+ cookies on the web branch); 401/403/409/429/503 (see **Authentication**) |
| POST | `/auth/borderless/confirm` | Yes | ADR-0024: renew the Borderless access, read the membership → 204, session untouched |
| GET | `/auth/github/login` | No | 307 to `WEB_SIGNIN_URI` (GitHub sign-in is gone) |
| POST | `/auth/github/restore` | Yes | `{authorize_url}`; 409; 503 (see **GitHub restore**) |
| GET | `/auth/github/callback` | No (cookie resolved internally) | The GitHub restore callback, always a 307 |
| POST | `/auth/cli/start` | No | Deprecated (0.1.4–1.0.1): create pending CLI login, return browser login URL |
| GET | `/auth/cli/login/{login_id}` | No | Deprecated: mark browser flow as CLI login, 307 to `WEB_SIGNIN_URI?cli=1` |
| POST | `/auth/cli/exchange` | No | Deprecated: exchange the code for `{access_token, refresh_token, access_expires_in, refresh_expires_in}`, a `cli_legacy` session |
| GET | `/auth/refresh` | No (`__refresh`) | Slide the session 7 days, re-set `__access` + `__refresh`; 401 clears both; 503 when Redis is down |
| GET | `/auth/logout` | No (`__refresh`) | End the session (`logout`), clear both cookies |
| GET | `/auth/cli/authorize` | No | KODI-057: `?redirect_uri&code_challenge&code_challenge_method=S256&state` → 307 `WEB_SIGNIN_URI?cli=1` + `__cli_login`; 400 loopback messages, `code_challenge_method must be S256`, `Invalid code_challenge` |
| POST | `/auth/token` | No | KODI-057: `grant_type` `authorization_code` `{code, code_verifier, redirect_uri, device_name?}` · `refresh_token` · `urn:ietf:params:oauth:grant-type:device_code` → `{access_token, token_type: "Bearer", expires_in, refresh_token, refresh_expires_in}`; 400 `{error, detail}`; 422 bad shape |
| POST | `/auth/revoke` | No | KODI-057: `{refresh_token}` → 204 for any value, live, ended or unknown (ends a live session as `logout`); 503 when Redis is down (fail closed: a 204 would claim an end that did not happen) |
| POST | `/auth/device/code` | No | KODI-057: `{device_name?}` → `{device_code, user_code: "XXXX-XXXX", verification_uri, verification_uri_complete, expires_in: 600, interval: 10}` |
| GET | `/auth/device/verify` | Yes | KODI-057: `?user_code=` → `{device_name, client_label, ip, requested_at, expires_at}`; 404 `Code not found or expired` |
| POST | `/auth/device/approve`, `/auth/device/deny` | Yes | KODI-057: `{user_code}` → 204; 404; 409 `Code already used`. The poll then answers `authorization_pending`, `slow_down` (faster than `interval`), `access_denied`, `expired_token`, or the session (signed in as the approver, one use) |

Discord linking is removed (ADR-0024): `/auth/link/discord*` answer 404. The Discord tables stay in the database, unmapped.

### Users (`/users`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/users/me` | Yes | Get current user profile |
| PATCH | `/users/me` | Yes | Update profile |
| POST | `/users/me/github-restore/dismiss` | Yes | ADR-0024: the one-time restore screen is answered; 204, idempotent |
| GET | `/users/me/features` | Yes | KODI-052: `{features: [{key, stage: 'beta' \| 'general'}]}`, the caller's own, by key (web only; `/users/me` is unchanged for the CLI) |
| GET | `/users/me/sessions` | Yes | KODI-057: the caller's devices `[{id, client_type, sign_in_method, device_name, client_label, created_ip, last_ip, created_at, last_used_at, expires_at, ended_at, status: active\|signed_out\|revoked\|expired, current}]`: active by `last_used_at` DESC NULLS LAST (live from Redis), then ended by `coalesce(ended_at, expires_at)` DESC within `SESSION_HISTORY_DAYS`. Status derived; the GET writes nothing |
| DELETE | `/users/me/sessions/{id}` | Yes | KODI-057: revoke → 204 (ended/expired: no-op 204; the current one also clears both cookies); 404 `Session not found` for any other user's id, admins too |
| POST | `/users/me/sessions/revoke-others` | Yes | KODI-057: every other live session ends as `revoked` → `{revoked: n}` |

`GET`/`PATCH /users/me` build the response with `UserProfile.from_user(user, badges, binding, github)`: `badges` = live rows `[{badge, granted_at}]` held or not; `borderless` = `{status: active|expired|needs_reconnect, expires_at, email}` or null (computed at request time); `github_restore` = `{available: no GitHub row, prompt: available and not seen}`; `github_id` = the caller's `github_connections.github_id` or null. `username`, `first_name`, `last_name`, `email` are unchanged for the CLI.

### Applications (`/applications`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/applications` | Yes | Create application (201) |
| GET | `/applications` | Yes | List all user applications |
| PUT | `/applications/{id}` | Yes | Update application |
| DELETE | `/applications/{id}` | Yes | Delete application (204); its events go with it |
| POST | `/applications/{id}/finalize` | Yes | Close it. No body → 200, idempotent. New optional outcome body → 200, no Deprecation. 0.1.4 body → 201, deprecated |
| POST | `/applications/{id}/reopen` | Yes | Reopen a closed application (200, idempotent) |

### Application drafts (`/applications/drafts`, KODI-032, ADR-0014, KODI-036, web only - not a CLI route)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/applications/drafts` | Yes | Create a draft (201); optional `application_date` |
| GET | `/applications/drafts` | Yes | List the caller's own drafts, most recently saved first, `[]` when none |
| GET | `/applications/drafts/{id}` | Yes | Get one own draft (404 otherwise) |
| PUT | `/applications/drafts/{id}` | Yes | Full replace of the draft's data; never touches its CV copy |
| DELETE | `/applications/drafts/{id}` | Yes | Delete it (204); its CV copy is cascade-deleted |
| POST | `/applications/drafts/from-job` | Yes | KODI-047: `{job_id, base_cv_id?, tailoring?: 'copy' \| 'keywords' = 'copy', application_date?}` → 201 `Draft` filled from the job, dated `application_date` (the caller's local day, KODI-050) or the server's UTC day; 422 `application_date` outside UTC today ± 1; 404 job unknown or off the list, or base CV not own; 409 `"You already have an application for this job"`; 422 `keywords` without a job description |
| POST | `/applications/drafts/{id}/finish` | Yes | Body optional - no body, `{}` or `{application_date}` - → 200 `Application` (same shape `GET /applications` returns); 422 with no CV copy; 422 past `UTC today + 1` |

**Gate (ADR-0018, ADR-0021):** every drafts route needs the `cvs` beta
feature, else the unknown-route 404; `POST /applications/drafts/from-job`
needs `jobs` too. A draft started from a job keeps working without `jobs`.

**`is_draft` and the `NOT_DRAFT` rule.** A draft is a plain `applications` row
with `is_draft = true` (`ApplicationModel.is_draft`, migration `3b78c3cd2a71`
column, mapped by this ticket; `ix_applications_user_id_drafts` mirrored in
`__table_args__` because the test schema is built with `create_all`). It is
the "new application with CV" flow: create the draft with its data, attach a
CV copy through the ordinary `/applications/{id}/cv*` routes (`tailored_cvs/
guards.load_owned_application` passes `include_drafts=True`, the **one**
caller that ever sees a draft through the application repository), then
`finish` it. Finishing needs a CV copy (422 `"Pick a master CV before
finishing"` otherwise), applies `ensure_not_in_future` to the date that will
be used, flips `is_draft` to `false` and leaves `cycle_id` NULL - the row
then behaves like any application created the ordinary way.

**`application_date` is saved with the draft** (KODI-036, R-003, reusing the
existing `applications.application_date` column - no migration).
`DraftInput.application_date` is optional: a POST that omits it defaults to
the server's own day (`ApplicationRepository.create_draft`); a PUT that omits
the key, **or sends it explicit `null`**, keeps the stored value - it never
clears, unlike every other draft field (which is a full replace, same as
`job_description` being the one exception on `PUT /applications/{id}`,
except here *every* absence/`null` of this one field means "leave it alone").
A given value on create or update is refused past `UTC today + 1`
(`ensure_not_in_future`) **before** the draft is even read, so a future date
writes nothing. `Draft`, the response shape, **always** carries
`application_date` - never null. The finish body's own `application_date` is
optional too: given, it wins; absent (no body or `{}`), the draft's own
stored date is used - either way still refused in the future.

`app/domain/repositories/application_filters.NOT_DRAFT` (`ApplicationModel
.is_draft.is_(False)`) is the one condition every other application read
path applies: `ApplicationRepository.get_all_by_user_id`/
`get_by_id_and_user_id` (default; `include_drafts=True` is the one opt-in,
above), `UserStatsRepository._cycle_filter`, `QuinzenalReportRepository
._app_cycle_filter`, `CycleRepository.count_current_applications`/
`archive_current_applications` (a draft is never swept into a new cycle),
`TimelineEventRepository.list_agenda`, and every `ApplicationModel` query in
`AdminRepository` **except** `count_entity_references` - a platform or
company a draft uses still blocks the admin delete, on purpose. A draft id on
any ordinary application route (`PUT`/`DELETE /applications/{id}`, timeline,
steps, finalize, reopen, the 0.1.4 compat routes) is a 404, exactly like an
application owned by someone else - a draft has no timeline and is changed
only through the drafts routes above.

**Closed is reversible** (PRD 0008). `finalized_at` set = closed, NULL = open;
`finalized` is `finalized_at is not null`. Closing asks for no step, feedback
or salary: the outcome is an `offer` or `denied` timeline event, and there is
no Offer ⇔ Accepted rule. Writes to a closed application's timeline are
`ApplicationFinalized` (409, "Reopen the application to edit it (it is
currently closed)"); anything on an application archived in a cycle is
`BusinessRuleViolation` (422), checked **first** (`use_cases/applications/
guards.py`: `ensure_mutable` for event writes, `ensure_not_archived` for
finalize/reopen). A closed application swept into a cycle stays closed for
good.

`/finalize` dispatches on the body (`presentation/api/application.py`): no
body, an empty body, `null` or `{}` is the new close; a body carrying
`step_id` or `feedback_id` is the 0.1.4 body; any other body is the new
optional outcome body (R-032).

The 0.1.4 body `{step_id, feedback_id, finalize_date, salary_offer?,
observation?}` is handled by `use_cases/compat/legacy_finalize.py`, which
answers exactly as the steps version did (future date 422, 404, archived
422, closed 409 "This application has already been finalized", strict step
404, feedback 404), then refuses a `salary_offer` on a step that is not an
offer (422) and records the terminal event of the mapped step: feedback
name appended to the observation as `Feedback: <name>`, an offer's salary =
`salary_offer` or 0 with the application's currency or USD and period or
monthly (owner decision (b)), `finalized_at` = `finalize_date` 00:00 UTC —
the shape revision `afd4074c70c2` gave the applications it migrated. 201,
`Deprecation` header.

**R-032, the new optional outcome body** `{outcome?: "offer"|"denied",
event_date?, observation?, salary_amount?, salary_currency?,
salary_period?}` (`presentation/schemas/application.py:
FinalizeWithOutcome`, `use_cases/applications/finalize_application.py:
FinalizeApplicationWithOutcomeUseCase`): 200, **no** `Deprecation` header.
Validated before any I/O, same as the timeline write schema: an invalid
`outcome` is 422; `outcome=offer` requires the salary triad, else 422;
the salary fields are refused when `outcome` is `denied` or absent, else
422; `event_date`/`observation` without an `outcome` are refused too (the
orchestrator's pin — never silently dropped). A body whose fields are all
absent or null is the same idempotent close as no body at all (no outcome
event). With an outcome: 404 if not owned, `BusinessRuleViolation` (422) if
archived, `ApplicationFinalized` (409, "Reopen the application to edit it")
if already closed, then `event_date` defaults to today and is refused in
the future (`validators/application_date.ensure_not_in_future`), then one
`offer`/`denied` timeline event (`interview_type` NULL) and `finalized_at`
are written through the same shared-session, single-commit pattern
`LegacyFinalizeApplicationUseCase` uses (`TimelineEventRepository.create`'s
commit persists both; a failed insert leaves `finalized_at` unwritten). The
offer's `salary_period` is `monthly` or `annually`, same restriction and
same message as the timeline write schema (`hourly` is a 422) —
`timeline_events/rules.OFFER_PERIODS`/`OFFER_PERIOD_INVALID`, enforced in
`FinalizeWithOutcome` and again in `FinalizeApplicationWithOutcomeUseCase`
via `rules.ensure_offer_period_allowed`. Fixed in KODI-011 remediation
round 1 (R-032): the outcome body used to go through
`timeline_events/rules.normalize_event` alone, which only checks the
salary fields are present, not the period's value, so the same offer event
was valid through `/timeline` and refused through `/finalize`, or the
reverse. `ensure_offer_period_allowed` is deliberately **not** folded into
`normalize_event` itself, because the 0.1.4 legacy finalize body
(`compat/legacy_finalize.py`) also goes through `normalize_event` and
fills an offer's period from `application.salary_period`, which can itself
be `hourly` — that compat behaviour is pinned and unchanged. One
consequence: the legacy body can still write an offer event with
`salary_period=hourly` (owner decision (b)'s convention, unchanged), and
that event, once read back, cannot be re-submitted unchanged through
`PUT /timeline` — the timeline write schema refuses `hourly` on an offer
regardless of how the event got there.

The `Application` response carries `finalized_at` and keeps the fields
installed `applika-cli` 0.1.4 reads, **derived from the timeline** by
`use_cases/applications/read_model.py` (three queries for any list, no N+1):
`last_step` = the latest event (timeline order, reversed) shown as its
reverse-mapped legacy step `{id, name, color, date}`; `feedback` = always
null; `salary_offer` = the latest offer event's amount.

`job_description` (optional, max 50 000 chars) carries the pasted job posting.
On `PUT /applications/{id}` it is the **one** sticky field: omitting the key
keeps the stored text, sending `null` clears it. Every other optional field is
still a full replace and clears when omitted — that is the PUT contract
published `applika-cli` versions rely on. `app/presentation/api/application.py`
carries the distinction by dropping the key from the DTO when it is absent from
`payload.model_fields_set`.

### Application Timeline (`/applications/{id}/timeline`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/{id}/timeline` | Yes | Events, ordered `event_date, start_time NULLS FIRST, created_at` |
| POST | `/{id}/timeline` | Yes | Add an event (201) |
| PUT | `/{id}/timeline/{event_id}` | Yes | Replace an event (full body) |
| DELETE | `/{id}/timeline/{event_id}` | Yes | Delete an event (204) |

A timeline event (`TimelineEventModel`, table `timeline_events`) is
exactly one of `interview`, `offer`, `denied` (ADR-0020). `note` and
`feedback` are refused as an invalid value (422) on create and on edit, and
by `ck_timeline_events_event_type` in the database (mirrored in
`__table_args__`). Release A's revision `f28e3d9705dd` turned every stored
note and feedback into an interview of type `unknown` and kept the original
in `timeline_events.event_type_old`, which no model maps and no code reads;
its switch-over trigger is dropped by `647a047921ec`. Former notes count in
the `unknown` stage, in new reports' `interviews_completed_fortnight` and in
the agenda. `interview_type` (`unknown`, `initial_screening`, `technical`,
`cultural`, `hiring_manager`, `take_home`, `final`) is set on interviews only
and defaults to `unknown`; on any other type it is a 422. An offer needs
`salary_amount` (≥ 0, 2-decimal string on the way out), `salary_currency`
and `salary_period` (`monthly` or `annually` for an offer); every other type
refuses all three, so turning an offer into something else drops the salary
in the same PUT. `start_time`/`end_time` come together, end after start;
`timezone` ≤ 100, `observation` ≤ 5000. **`start_time`/`end_time`/`timezone`
are allowed on an interview event only** (KODI-016, R-038/R-039,
`ck_timeline_events_schedule_interview_only`; owner: "if event type is
different from interview, these attributes must be blocked"), same pattern
as `interview_type`: a non-null value on any other type is a 422, an
explicit null or an absent key is always fine. A non-interview event's
response **omits** the three keys entirely (not null — absent,
`TimelineEventOut`'s own `model_serializer`) everywhere an event is
serialized. There is **no** date-order rule against the application date or
the previous event. An application holds **one** `initial_screening`
interview at most: a second one is a `ResourceConflict` 409 (use-case
pre-check, and the partial unique index
`uq_timeline_events_one_initial_screening` turns a race into the same 409).
The rules live in three places on purpose: the request schema (422 before
I/O), `use_cases/timeline_events/rules.py` (so the compat routes obey them)
and the database CHECKs. Reads are allowed on closed and archived
applications; another user's application or event is a 404.

### Application Steps (`/applications/{id}/steps`) — deprecated
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/{id}/steps` | Yes | Every timeline event, shown as a legacy step |
| POST | `/{id}/steps` | Yes | Add the event a non-strict step maps to (201) |
| PUT | `/{id}/steps/{step_id}` | Yes | Replace the event `{step_id}` |
| DELETE | `/{id}/steps/{step_id}` | Yes | Delete the event (204) |

Kept only for installed `applika-cli` 0.1.4 (`.claude/rules/
cli-compatibility.md`), with its request and response shapes unchanged
(`{id, step_id, step_name, step_date, start_time, end_time, timezone,
observation}`); `deprecated: true` in OpenAPI. The translator is
`use_cases/compat/step_translation.py`: forward, a step becomes
`steps_definition.event_type/interview_type` (filled by revision
`afd4074c70c2`; NULL → interview/unknown); reverse, an event becomes one step
by name (`initial_screening` → "Initial Screen", other interviews → "Phase
2", offer → "Offer", denied → "Denied"; `REVERSE_STEP_NAMES` no longer
carries the revision map's note and feedback entries, which also named
"Phase 2", so a former note keeps its step id), else the first
row with the same mapping, else the first non-strict row — **identical** to
the revision's SQL, so the ids a 0.1.4 client reads stay stable across
releases. A PUT whose `step_id` is the event's own reverse step keeps the
event's type, interview type and salary (0.1.4 `steps edit` without `--step`
resends it; that reverse step may be strict). A POST/PUT with another step
still refuses strict steps (404, as always). Writes go through the timeline
use cases, so every timeline rule, guard and the one-initial-screening 409
apply — **except** the schedule (KODI-016, R-038/R-039): `legacy_steps.py`
drops `start_time`/`end_time`/`timezone` itself before calling into the
timeline use case whenever the mapped event is not an interview, so an
installed CLI that always sends times is never 422'd for it
(`.claude/rules/cli-compatibility.md`); the response still carries the three
keys, null, unchanged 0.1.4 shape (`LegacyStepDTO` is not the schema that
omits them — only `TimelineEventOut` does).

**`Deprecation` header.** Every answer of `/steps*` and of `/finalize` with
the 0.1.4 body, errors included, carries `Deprecation: @1789430400`
(`app/presentation/deprecation.py`). RFC 9745 defines the field as a
structured-field Date, `@` + Unix seconds; the drafts' bare `true` is not
valid under it, so the RFC form was chosen. The date is 2026-09-15T00:00:00Z,
the day ADR 0012 was accepted and deprecated these routes. There is **no
`Sunset` header** and no removal date: removal is a later owner decision
recorded in an ADR. A route opts in with `Depends(mark_deprecated)` (or by
calling it, as `/finalize` does once it sees a body); the
`DeprecationHeaderMiddleware` stamps the header on the response, which is why
validation errors carry it too. `Deprecation` is in the CORS
`expose_headers`.

### Companies (`/companies`) and Platforms (`/platforms`), ADR-0014

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/companies` | Yes | List/search companies visible to the caller |
| POST | `/companies` | Yes | `{name, url}` → 201 new private company, or 200 reusing an existing visible one |
| GET | `/platforms` | Yes | (S7, KODI-035) List/search platforms visible to the caller, ordered by name - the web platform picker; `/supports` below stays the CLI's route, unchanged |
| POST | `/platforms` | Yes | `{name, url?}` → 201, private to the caller; url is optional |

**Private until published.** `CompanyModel.is_public` / `PlatformModel.is_public`
(default `True`, migration `3b78c3cd2a71`'s `server_default true` - every row
that existed before KODI-031 stays public) and `PlatformModel.created_by`
(nullable FK `users.id`, **`ON DELETE SET NULL`**) are the two columns this
ticket maps onto the ORM; Release A (KODI-030) only added them to the schema.
A row a user adds through `POST /companies`, `POST /platforms` or inline on
`POST /applications` is **private**: visible and selectable only by its
creator, until an admin publishes it. **There is no admin branch** - an admin
adding a company/platform while tracking their own applications gets a
private row exactly like anyone else (owner decision, 2026-09-25: "an admin
user is like any other non admin user but with permissions to access some
areas"). Only the admin screens (`POST /admin/companies`, `POST
/admin/platforms`) create a row public at once, and it still records
`created_by` = that admin.

`visible_to(model, user_id)` (`app/domain/repositories/catalog_visibility.py`)
is the one predicate every visibility check shares: `is_public OR created_by
== user_id`. `GET /companies` and `GET /supports` (below) list public rows
plus the caller's own private ones; `CompanyRepository`/`PlatformRepository`
expose it as `get_visible`/`list_visible`/`find_visible_by_name`/
`find_visible_match`. `POST /applications` and `PUT /applications/{id}`
resolve `platform_id` and a company id the same way
(`use_cases/catalog/resolve.py`: `ensure_platform_visible`,
`resolve_company`) - an id the caller cannot see is `ResourceNotFound`
(`"Platform not found"` / `"Company not found"`), checked before either
write, so a 404 leaves nothing written. A `{name, url}` company input reuses
a visible match (public preferred over private) on the normalised url and
lower-cased name, else creates a new **private** row owned by the submitting
user; `{name}` with no url stays free text, never a row, as before. A
platform name that matches, ignoring case, one the caller already sees is a
409 naming that platform, before any insert; the database's own partial
unique indexes (`uq_companies_public_name_url`,
`uq_companies_private_owner_name_url`, `uq_platforms_private_owner_name`,
migration `3b78c3cd2a71`) turn a same-instant race into the same conflict
instead of a duplicate row - two different users may still hold a private
company or platform with the identical name (and, for companies, url).

**Admin publish** (`POST /admin/companies/{id}/publish`, `POST
/admin/platforms/{id}/publish`, `AdminUserDp`, `PublishCompanyUseCase`/
`PublishPlatformUseCase`): flips a private row to `is_public=True`, keeping
`created_by` untouched - publishing never re-parents a row to the admin who
approved it. Idempotent: publishing an already-public row is a no-op 200.
Refused with a 409 naming the public row it would duplicate: on `(lower(name),
url)` for a company, on `lower(name)` alone for a platform (there is
deliberately no uniqueness among existing public platform names - production
may already hold duplicates, migration `3b78c3cd2a71`'s own note). `GET
/admin/companies` and `GET /admin/platforms` (the latter paginated since S7,
KODI-035, on the same shape as companies) both take `?search=&visibility=
public|private&sort_by=name|created_at|applications_count&sort_order=asc|
desc&page&per_page` and answer `{items, total, page, per_page, total_pages}`,
every row adding `is_public`, `created_by {id, username} | null` and
`applications_count` (drafts excluded, `NOT_DRAFT`, R-035).

### Statistics (`/applications/statistics`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/statistics` | Yes | General statistics |
| GET | `/statistics/steps/conversion_rate` | Yes | `[{event_type, interview_type, total_applications, conversion_rate}]` per stage |
| GET | `/statistics/steps/avarage_days` | Yes | `[{event_type, interview_type, average_days}]` per stage |
| GET | `/statistics/platforms` | Yes | Applications per platform |
| GET | `/statistics/mode` | Yes | Active vs passive split |
| GET | `/statistics/trends` | Yes | Last month daily trends |

Statistics read the timeline. A **stage** is each interview type, then
`offer`, then `denied`: always these nine rows, in that order
(`use_cases/user_stats/stages.py`). Conversion = distinct applications with at
least one event of the stage over all in-scope applications; average days =
mean of `event_date - application_date` over the stage's events. `offers` and
`denials` in `/statistics` are applications with at least one offer / denied
event, counted independently.

### Biweekly Reports (`/reports`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/reports` | Yes | List all reports |
| GET | `/reports/{day}` | Yes | Get report details |
| POST | `/reports/{day}/submit` | Yes | Submit report (201) |

New reports are computed from the timeline
(`QuinzenalReportRepository.calculate_*_metrics`): `initial_screenings_count`
= distinct applications with an interview of type `initial_screening`
**only** (an `unknown` or any other interview never counts — the owner's
"explicit only"); `interviews_completed_fortnight` = interview events of any
type; `offers_count` = distinct applications with an offer event;
`active_processes_count` = open applications (`finalized_at` NULL) past their
initial screening. A submitted report is a stored row and is **never**
recomputed.

### User Feedback (`/feedbacks`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/feedbacks` | Yes | Submit app feedback (201) |

### Base CVs (`/base-cvs`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/base-cvs` | Yes | List the user's own master CVs (newest first) |
| POST | `/base-cvs` | Yes | Create a master CV (201); 4th is 409 |
| GET | `/base-cvs/{id}` | Yes | Get one own master CV (404 if not owned) |
| PATCH | `/base-cvs/{id}` | Yes | Partial update (404 if not owned) |
| DELETE | `/base-cvs/{id}` | Yes | Delete a master CV (204, never blocked) |

**Gate (ADR-0018, ADR-0021):** every `/base-cvs*` route (the PDF and
Markdown exports included) needs the `cvs` beta feature, else the
unknown-route 404. Saving a master CV still queues its fit recompute.

A user may hold at most **3** master CVs. The cap lives in
`CreateBaseCVUseCase`, not in a trigger or a constraint: one transaction takes
a `SELECT ... FOR UPDATE` lock on the owning user row, counts, refuses with
`ResourceConflict('Base CV limit reached (max 3 per user)')` at 3, then
inserts. The lock is what keeps concurrent creates from overshooting.

### Application CVs (`/applications/{id}/cv`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/{id}/cv` | Yes | Copy a master CV onto the application (201); optional `tailoring: "copy"` (default) \| `"keywords"` |
| GET | `/{id}/cv` | Yes | Get the application's CV copy |
| GET | `/{id}/cv/fit` | Yes | Keyword fit of the copy for the job description: `{score: int \| null, matched_keywords, missing_keywords}` (`null`, `[]`, `[]` on a blank description); drafts included, no read-only guard; 404 not owned or no copy |
| PUT | `/{id}/cv` | Yes | Replace the copy whole (every field editable) |
| DELETE | `/{id}/cv` | Yes | Delete the copy (204); a new one can then be made |

**Gate (ADR-0018, ADR-0021):** every `/{id}/cv*` route needs the `cvs`
beta feature, else the unknown-route 404 (the PDF, Markdown and diff routes
below included). `GET /{id}/cv/fit` needs `jobs` too; `POST /{id}/cv` with
`tailoring: "keywords"` without `jobs` is a 422 `"Unknown tailoring
option"`, nothing written. `copy` and no `tailoring` never look at `jobs`.

At most **one** CV copy per application (UNIQUE on
`tailored_cvs.application_id`); a second POST is a 409. Writes are refused
exactly as a timeline event write is refused — it calls the same
`ensure_mutable`: archived in a cycle → `BusinessRuleViolation` (422), closed
→ `ApplicationFinalized` (409, "Reopen the application to edit it"), in that
order. `GET` has **no** such guard — viewing a finished application's CV
always works.

Ownership is enforced at the use-case layer only: nothing in the schema ties
`tailored_cvs.user_id` to `applications.user_id` or `base_cvs.user_id`, so
every route authorizes against the **application's** owner, and POST
additionally authorizes the source master CV on its own. Another user's row is
a 404, for admins too.

### CV PDF export

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/base-cvs/{id}/pdf` | Yes | Download the master CV as a PDF |
| POST | `/applications/{id}/cv/pdf` | Yes | Download the application's CV copy as a PDF |

Both return `application/pdf` with
`Content-Disposition: attachment; filename="<slug>.pdf"`, where `<slug>` comes
from the row's `name` (the CV **label**, not the person): lowercased, every run
of non-`[a-z0-9]` collapsed to one `-`, trimmed, `cv` when nothing is left. The
`Content-Disposition` header is in `expose_headers` on the CORS middleware, or
the browser could not read the filename.

`POST`, not `GET`: the server does a real Typst compile. There is **no request
body and no theme parameter** — the look is fixed. A row that does not exist or
is not owned is a 404; a failed or timed-out render is a
`PdfRenderFailed` → 500. Neither route writes anything.

Unlike every write on `/applications/{id}/cv`, the export carries **no**
finalized or archived guard — the CV of a finished application is exactly the
one a user wants to download.

### Support Data (`/supports`)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/supports` | Yes | Steps, feedbacks, platforms |

The step and feedback lists are **frozen** catalogs (PRD 0008): nothing
writes `steps_definition` or `feedbacks_definition` any more, and the admin
catalog routes `/admin/step-definitions*` and `/admin/feedback-definitions*`
are gone (404). They are served, unchanged in shape, only so installed
`applika-cli` 0.1.4 can resolve step and feedback names; new clients use the
`EventType`/`InterviewType` enums. The `platforms` list is **not** frozen
(ADR-0014): it is the caller's visible platforms (`list_visible`, above), a
platform's `url` is nullable (a platform may have none, whoever added it),
and each row adds `is_public`. **Unchanged by S7/KODI-035**: `/supports`
still calls `list_visible(user_id)` with no `name` or `order_by_name`, so its
content, shape and `ORDER BY id` are exactly what installed CLI clients read
today (R-036) - the web platform picker reads the new `GET /platforms`
instead, ordered by name and searchable, above.

Admin statistics (`/admin/stats*`, `/admin/users*`, admin-only) read the
timeline too: offers/accepted = applications with an offer event,
denials/rejected = with a denied event, open/active = `finalized_at` NULL,
finalized = `finalized_at` set, and activity (30-day active users, the
heatmap) comes from `timeline_events.created_at`.

### Admin report webhooks (`/admin/report-webhooks`, ADR-0024)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/admin/report-webhooks` | Admin | `[{id, label, badge \| null, webhook_url_masked, created_at, updated_at}]` |
| POST | `/admin/report-webhooks` | Admin | `{webhook_url, badge, label?}` → 201; 409 "This webhook is already configured"; 422 |
| PATCH | `/admin/report-webhooks/{id}` | Admin | Partial; `badge` BASE or PSP only, never null; blank `webhook_url` keeps it; `label: null` clears → 200; 404 "Report webhook not found" |
| DELETE | `/admin/report-webhooks/{id}` | Admin | 204; 404 |

Table `report_webhooks` (`ReportWebhookModel`), carried over from `discord_report_webhooks` with no badge. A badge accepts `borderless_base`/`borderless_psp` or `BASE`/`PSP`, any case. Only `webhook_url_masked` is ever returned (`validators/report_webhook.mask`), logs name the id, and the router's `NoInputEchoRoute` (`app/presentation/no_input_echo.py`, also on `/auth/borderless/*`) strips `input` from every 422, so the URL (or a password) is never echoed. `/admin/discord-webhooks*` answer 404.

### Admin job sources (`/admin/jobs`, KODI-046, ADR-0016)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/admin/jobs/sources` | Admin | `[{id, code, name, base_url, platform_id, is_enabled, last_run_at, last_run_status \| null, last_run_error, last_run_found, last_run_saved, active_jobs}]` (ids are Snowflake strings) |
| PATCH | `/admin/jobs/sources/{id}` | Admin | `{is_enabled: bool}` (strict, extra fields 422) → 200 row; unknown 404 |
| POST | `/admin/jobs/runs` | Admin | 202 `{queued: true}`; 409 `"A run is already in progress"` while the lock is held; 503 `"Background service unavailable"` when the queue cannot be reached |

`active_jobs` counts the source's listed (`is_active`) jobs. A source that is
off is skipped by every run; its jobs stay listed until they expire. Not a
CLI route. The platform a source points at (R-019) cannot be deleted from
`/admin/platforms` - `count_entity_references('platform', id)` counts
`job_sources.platform_id` as well as applications.

### Admin features (`/admin/features`, KODI-052, ADR-0018)

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/admin/features` | Admin | `[{key, name, description \| null, stage, beta_user_count, released_at \| null, updated_at, me {has, via: 'general' \| 'list' \| 'admin' \| null, opted_out}}]` by key |
| PATCH | `/admin/features/{key}` | Admin | `{stage: 'beta' \| 'general'}` (strict) → 200 row; same stage a no-op 200; 404 `"Feature not found"` |
| GET | `/admin/features/{key}/users` | Admin | `?search (≤100, username ILIKE, wildcards escaped)&page&per_page=1..100 (25)` → `{items: [{user_id, username, email, added_at, added_by {id, username} \| null}], total, page, per_page, total_pages}` newest first |
| PUT | `/admin/features/{key}/users/{user_id}` | Admin | 204, idempotent (`ON CONFLICT DO NOTHING`); 404 `"Feature not found"` / `"User not found"` |
| DELETE | `/admin/features/{key}/users/{user_id}` | Admin | 204, idempotent; 404 `"Feature not found"` |
| PUT | `/admin/features/{key}/opt-out` | Admin | The caller's own opt-out, no body → 204, idempotent, stored in either stage |
| DELETE | `/admin/features/{key}/opt-out` | Admin | Removes the caller's own opt-out → 204, idempotent |

`beta_user_count` counts beta-list rows only - an admin who has the feature
because they are an admin is never counted. `me` is the calling admin's own
access and why. `updated_at` is `coalesce(updated_at, created_at)`, never
null (the seed row has no `updated_at`). Release (`general`) sets
`released_at = now()`, moving back to `beta` clears it; neither touches the
beta list or the opt-outs, so an opt-out counts again after a move back. An
admin writes only their own opt-out row - there is no route to opt someone
else out. The API never creates, renames or deletes a feature; it joins
through an Alembic seed row. Not a CLI route; never gated.

### Jobs (`/jobs`, KODI-047, PRD 0012, web only - not a CLI route)

**Gate (KODI-052):** the whole router needs the `jobs` beta feature, else
every route is the unknown-route 404. The fit also needs `cvs` (ADR-0021):
without it `GET /jobs` sends `best_fit: null` on every item, `min_fit`
matches no job (`items: []`, `total: 0`) and `sort=fit` is `newest`; `GET
/jobs/{id}` sends `fits: []`, `best_fit: null` and reads no master CV. The
`application` mark and everything else are unchanged.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/jobs` | Yes | `?search&source&tags&min_fit&posted_within_days&sort=newest\|fit&include_dismissed&page&per_page=1..100 (25)` → `{items: JobSummary[], total, page, per_page, total_pages}` |
| GET | `/jobs/{id}` | Yes | `JobDetail` = summary + `description_text`, `company_url`, `fits[]`; 404 unknown, or off the list unless the caller has an application from it |
| PUT | `/jobs/{id}/dismissal` | Yes | Dismiss for the caller (204, idempotent); unknown 404 |
| DELETE | `/jobs/{id}/dismissal` | Yes | Restore (204, idempotent); unknown 404 |

`JobSummary` is `{id, source {code, name}, title, company_name, location_text,
employment_type, salary_text, tags, posted_at, job_url, is_active, best_fit
{base_cv_id, score} | null, dismissed, application {id, is_draft} | null}`.
Every per-user part is the **caller's own**, admins included (ADR-0004, no
admin bypass): `best_fit` is the caller's highest `job_fit_scores` row (ties:
lowest master CV id), `dismissed` the caller's `job_dismissals` row,
`application` the caller's application with this `job_id` in any state (draft,
open, closed, archived - "Draft" vs "Applied"). The list shows active jobs
only (`JobRepository.list_for_user`): `search` is `ILIKE` on title, company
and description with `%`/`_` escaped; `tags` needs every chosen tag
(`tags @> :tags`, exact case); `min_fit` drops a job with no fit;
`posted_within_days` (1..15) and `newest` count from `coalesce(posted_at,
first_seen_at)`, then `id DESC`; `fit` sorts `best_fit DESC NULLS LAST`, then
newest. The detail's `fits` are computed **live** for each of the caller's
master CVs (`score_fit(job.keywords, cv_text(cv))`), with matched and missing
keywords; a job without keywords has none, and `best_fit` there is the best
live fit. `JobFilters` (`schemas/jobs.py`) is also the saved search body:
unknown keys 422 there; as `GET /jobs` query parameters unknown keys are
ignored (`JobListQuery`).

**Draft from a job** (`POST /applications/drafts/from-job`,
`use_cases/application_drafts/create_draft_from_job.py`, a port of Ían
Muliterno's `create_application_from_job.py`). Checks before any write: a sent
`application_date` within UTC today ± 1 (422, first, KODI-050), job
listed (404 `"Job not found"`), no application of the caller with that
`job_id` (409), a non-blank title (422 `"This job has no title to start
from"`), the source's `platform_id` visible (`ensure_platform_visible`,
R-019), the base CV the caller's own (404), `keywords` needs a description
(422). Then: a blank company name (scrapers may store `''`) → free text
`"Unknown company"`, never a company row, even with a `company_url`;
otherwise a valid http(s) `company_url` goes through `resolve_company`
unchanged (visible match reused, else a new **private** company, which
commits on its own and stays on a later failure); none or invalid → free
text. The draft: role = title (cut to 200), company name (200), platform,
`link_to_job` = `job_url` when a valid URL ≤ 2083, `job_description` =
description (cut to 50 000), `work_mode` remote, `mode` active, the sent `application_date` (checked first, within UTC today ± 1) else UTC today, no
country, `job_id`. With a base CV, `ApplicationRepository.create_draft(...,
commit=False)` flushes and `CreateTailoredCVUseCase` (same session) commits
both; any failure rolls the draft back. An `IntegrityError` on
`uq_applications_user_job` (double click) is the same 409. `job_id` appears on
`Draft` only - never on `Application` / `GET /applications`; `update_draft`
never touches it (not in `DraftInput`, a PUT naming it is 422) and finishing
keeps it.

### Job searches (`/job-searches`, KODI-047, R-030, R-032)

**Gate (KODI-052):** the whole router needs the `jobs` beta feature, else
every route is the unknown-route 404. The rows stay when a user loses it.

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/job-searches` | Yes | `[{id, name, filters, created_at, updated_at}]`, by name ignoring case |
| POST | `/job-searches` | Yes | `{name 1..100 (stripped), filters: JobFilters}` → 201; 409 `"A saved search with this name already exists"` (any case); 409 `"Saved search limit reached (max 10)"` |
| PUT | `/job-searches/{id}` | Yes | `{name?, filters?}` (at least one) → 200; 404; 409 name taken |
| DELETE | `/job-searches/{id}` | Yes | 204; 404 |

The cap of 10 is `CreateJobSearchUseCase` under a `SELECT ... FOR UPDATE` on
the user row (the `base_cvs/create.py` pattern); the name rule is checked
first and backed by `uq_saved_job_searches_user_name` (`user_id,
lower(name)`), whose violation the repository turns into the same 409.
Another user's search is a 404, admins included. `filters` is stored as the
keys the caller set and read back as a full `JobFilters`. A saved search has
no notification field, route or side effect (R-032).

### Agenda (`/users/me/agenda`)
Every **interview** event dated inside the window (`from_date`/`to_date`,
default 30 days either side of today), ordered by date then start time — the
window and order the steps agenda had. Narrowed to interview events only by
KODI-016 (R-038/R-039): a non-interview event carries no schedule any more,
so an agenda entry with nothing to show would be pointless. An item keeps its
step-era shape (`id`, `step_id`, `step_date`, `step_name`, `step_color`,
times, timezone, observation, `application_id`, `company_name`, `role`; the
step fields are the reverse-mapped legacy step) and adds `event_type` and
`interview_type`.

## Testing

Uses pytest with testcontainers for integration tests:
- Postgres container spun up per test session
- `async_client` fixture overrides dependencies to use test DB
- Base data seeded via `base_data()` helper
- Tests run with `asyncio_mode = "auto"`
- Ryuk reaper disabled on Windows

See `app/tests/` for test fixtures and test files.

## Enums

Defined in `app/core/enums.py`:
- **Currency**: the 20 supported (applika's original 9 plus 11 added) — USD, BRL, EUR, GBP, CAD, AUD, JPY, CHF, INR, CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD, MXN, ZAR, AED
- **SalaryPeriod**: hourly, monthly, annually. `annual` (what `applika-cli` 0.1.4 sends) is accepted on every input **forever** and means annually: `SalaryPeriod._missing_` maps it, so Pydantic accepts it without OpenAPI advertising it. In the database the `salaryperiod` labels are member names (HOURLY, MONTHLY, ANNUAL, ANNUALLY); `SalaryPeriodType` (`domain/models.py`) writes ANNUALLY and reads both ANNUAL and ANNUALLY as annually, so the API never returns `annual`. The contract migration (`ad747aba90fc`, R2, KODI-013) remapped every row that still held the legacy `ANNUAL` label to `ANNUALLY` on `applications`, `users` and `timeline_events`; the PG enum keeps both labels (Postgres cannot drop one) so a not-yet-remapped row, should one ever appear, still reads as `annually`
- **EventType**: interview, offer, denied (ADR-0020). The PG type `event_type` keeps all five lower-case labels (`note`, `feedback` too); `ck_timeline_events_event_type` allows the three
- **InterviewType**: unknown, initial_screening, technical, cultural, hiring_manager, take_home, final (PG type `interview_type`); the declaration order is the statistics stage order
- **ExperienceLevel**: intern, junior, mid_level, senior, staff, lead, principal, specialist
- **WorkMode**: remote, hybrid, on_site
- **Availability**: open_to_work, casually_looking, not_looking

## Environment Variables

Required:
- `DATABASE_URL`: postgresql+asyncpg://user:pass@host:port/db
- `BORDERLESS_API_URL` (https in PROD) and `BORDERLESS_TOKEN_ENCRYPTION_KEY` (Fernet): sign-in answers 503 until both are set (ADR-0024)

Optional (with defaults):
- `ENVIRONMENT`: PROD | DEV | TEST (default: DEV)
- `JWT_SECRET`: JWT signing secret (default: changeme placeholder)
- `JWT_ALGORITHM`: HS256 (default)
- `ACCESS_TOKEN_EXPIRE_MINUTES`: 15 (default)
- `GITHUB_REDIRECT_URI`: OAuth callback URL
- `LOGIN_REDIRECT_URI`: Post-login redirect
- `REFRESH_TOKEN_EXPIRE_DAYS`: a session ends this many days after its last refresh (sliding, default: 7)
- `DEVICE_CODE_TTL_SECONDS`: device-code lifetime (KODI-057, default 600)
- `DEVICE_CODE_POLL_INTERVAL_SECONDS`: the device poll interval; faster is `slow_down` (default 10)
- `DEVICE_VERIFICATION_URI`: the web approval page (default `http://127.0.0.1:8080/device`; prod `https://applika.dev/device`)
- `CLI_MANUAL_REDIRECT_URI`: the web page that shows a PKCE code to paste (`redirect_uri=oob`, default `http://127.0.0.1:8080/cli/code`; prod `https://applika.dev/cli/code`)
- `SESSION_HISTORY_DAYS`: ended devices stay listed this long (default 30); older rows are kept, not shown
- `REDIS_URL`: Redis connection URL (default: redis://localhost:6379/0)
- `CV_PDF_RENDER_TIMEOUT_SECONDS`: wall-clock ceiling for one CV PDF render (default: 30); past it the request is a 500
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`: the GitHub OAuth app of the restore (default unset → 503)
- `BORDERLESS_TIMEOUT_SECONDS` (5.0), `BORDERLESS_REFRESH_TIMEOUT_SECONDS` (3.0, the membership read on a refresh), `BORDERLESS_SIGNIN_EMAIL_LIMIT` (5), `BORDERLESS_SIGNIN_EMAIL_WINDOW_SECONDS` (900)
- `WEB_SIGNIN_URI`: the web sign-in page every CLI browser sign-in lands on (`?cli=1`, default `http://127.0.0.1:8080/login`)
- `DISCORD_FEEDBACK_WEBHOOK`: Discord webhook for user feedback
- `ACCOUNT_LINK_REDIRECT_URI`: the profile page the GitHub restore callback
  redirects back to (default `http://127.0.0.1:8080/profile`)
- `ACCOUNT_LINK_STATE_TTL_SECONDS`: TTL of the account-link CSRF nonce in
  Redis (default: 600)
- `CORS_ORIGINS`, `CORS_HEADERS`, `CORS_METHODS`: CORS configuration
- `RATE_LIMIT_ENABLED`: on/off switch for the API rate limiter (KODI-039,
  ADR-0015, default `True`), read on every request
- `RATE_LIMIT_DEFAULT`: requests per window on every route outside
  `/auth/*` (default `120`)
- `RATE_LIMIT_AUTH`: requests per window on `/auth/*` (default `10`)
- `RATE_LIMIT_WINDOW_SECONDS`: the fixed window width, seconds (default `60`)
- `FORWARDED_ALLOW_IPS`: uvicorn's own setting (not a Pydantic `Settings`
  field), default `127.0.0.1`. The trusted proxy hop(s) `X-Forwarded-For`
  is honoured from — in production, Traefik's overlay subnet. See
  **Rate limiting (ADR-0015)** below
- `TASKIQ_BROKER_URL`: the taskiq broker's Redis (KODI-046, ADR-0016,
  default unset → `REDIS_URL`)
- `JOBS_INGEST_ENABLED`: `false` makes every collection run a no-op
  (default `true`)
- `JOBS_INGEST_CRON`: the collection schedule, UTC (default `0 * * * *`)
- `JOBS_LOOKBACK_DAYS`: postings published this many days back are
  collected (default `7`)
- `JOBS_RETENTION_DAYS`: a posting leaves the list this many days after
  publication, else first seen (default `15`)
- `JOBS_SCRAPER_TIMEOUT_SECONDS`: per request to a job board (default `30`)
- `JOBS_INGEST_LOCK_SECONDS`: TTL of the run lock (default `900`)
- `JOBS_SCRAPERS`: comma list of scraper codes (default
  `himalayas,remoteok`); `fixture` serves every source from
  `JOBS_FIXTURE_PATH` and is refused when `ENVIRONMENT=PROD`
- `JOBS_FIXTURE_PATH`: the fixture scraper's JSON file (default unset)
- `LOG_LEVEL`, `LOG_FORMAT`: Logging configuration
- `API_PREFIX`: Route prefix (default: /api)
- `DATABASE_ECHO`: SQLAlchemy echo (default: False)

## Domain Model Relationships

### Core Entities
- **User**: signs in with Borderless (ADR-0024); profile (company, role, salary, tech stack, seniority, availability). The Borderless binding, the badges and the GitHub-era identity are rows of their own (below); `users.github_id`, `users.encrypted_github_token` and `users.is_org_member_old` stay in the database, unmapped (`.claude/rules/non-destructive-migrations.md` rule 7)
- **UserSession** (KODI-057, ADR-0019, table `user_sessions`, revision `ed39a0fad1e5`): one sign-in = one device. `client_type` `web`|`cli`, `sign_in_method` `github_web` (pre-ADR-0024 rows)|`borderless`|`cli_browser`|`cli_device`|`cli_legacy`, `device_name` (given ≤ 100, else from the user agent), `user_agent` (≤ 512), `created_ip`/`last_ip`, `last_used_at` (copied from Redis on refresh and on end), `expires_at` (slides), `ended_at` + `end_reason` (`logout`|`revoked`|`expired`|`github_revoked`|`replaced`, set together). `__table_args__` mirror the revision (four CHECKs, `ix_user_sessions_user_id_created_at`, partial `ix_user_sessions_open`). No refresh value column. The live half is in Redis (see **Authentication**)
- **BorderlessAccount** (table `borderless_accounts`, revision `d9e0b46dd7e1`): the Borderless account bound to a user, `user_id` and `borderless_user_id` each UNIQUE, `email`, `encrypted_access_token`, `access_token_expires_at`, `status` `active`|`needs_reconnect`, `linked_at`, `profile_read_at`, `profile_read_failed_at`. No refresh token column
- **UserBadge** (`user_badges`): `badge` `borderless_base`|`borderless_psp`, `source` `borderless`, `granted_at`, `revoked_at`; partial unique `uq_user_badges_live (user_id, badge) WHERE revoked_at IS NULL`
- **GithubConnection** (`github_connections`): the GitHub-era identity (`github_id` UNIQUE, `username`, `linked_at`), read only by the restore
- **ReportWebhook** (`report_webhooks`): admin catalog, `url` UNIQUE, `badge` nullable, `label`
- `users.github_id`, `users.encrypted_github_token`, `discord_connections` and `discord_report_webhooks` stay in the database, unmapped
- **Company**: Job companies (ADR-0014). `is_public` (default `True`) and `created_by` (nullable, `ON DELETE SET NULL`) decide visibility - see **Companies and Platforms** above. Uniqueness is two scoped partial indexes, not one global one: `uq_companies_public_name_url` (`lower(name), url` where public) and `uq_companies_private_owner_name_url` (`created_by, lower(name), url` where private) - two users may hold a private company with the same name and url
- **Application**: Job applications with tracking, salary info, and country. `is_draft` (KODI-032, ADR-0014) marks a "new application with CV" draft, excluded from every read model by default (`NOT_DRAFT`, see **Application drafts** above)
- **TimelineEvent**: one entry of an application's timeline (`timeline_events`), typed by `EventType`, with `interview_type` on interviews and the salary triple on offers; rows migrated from `application_steps` kept the step's id
- **StepDefinition**: the frozen legacy step catalog, read only by the compat layer; `event_type`/`interview_type` are its mapping onto the timeline (`strict=True` steps were the finalize-only ones)
- **FeedbackDefinition**: the frozen legacy outcome catalog, read only by `/supports` and the 0.1.4 finalize body
- **Platform**: Job platforms (LinkedIn, Indeed, etc.), same private-until-published shape as Company (ADR-0014): `is_public` (default `True`) and `created_by` (nullable, `ON DELETE SET NULL`). `url` is optional - a platform may have none, whoever adds it. Only *private* platform names are scoped unique per creator (`uq_platforms_private_owner_name`, `created_by, lower(name)`) - there is deliberately no uniqueness among public platform names, since production may already hold duplicates
- **QuinzenalReport**: Biweekly progress reports with fortnight + accumulated metrics
  - Report days: 1, 14, 28, 42, 56, 70, 84, 98, 112, 120
  - Phases: 1-4
  - Includes manual metrics (mock interviews, LinkedIn posts, strategic connections)
  - Posted to the report webhooks of the author's badges
- **UserFeedback**: In-app feedback from users (score 1-5 + optional text)
- **BaseCV**: A user's master CV, capped at 3 per user
  - Identity and contact (`name` label, `full_name`, `headline`, `location`, `email`, optional `phone`) plus a `summary`
  - Seven repeatable sections stored as JSONB arrays, never NULL: `links`, `skills`, `experience`, `projects`, `education`, `certifications`, `languages`
  - `skills` is a list of **categories**, not tags: `{id, category, keywords[]}`. The owner: *"skills isn't simply a section where i put "tags" or just "keywords" it's a section where i can create a category and inside this caregory add keywords"*. There is no `list[str]` back-compat shim — revision `f2a9c1d4b6e8` was amended in place before it ever ran anywhere
  - `experience` is `{id, company, company_description?, role, start, end?, location?, bullets[]}` and `education` is `{id, institution, degree, area?, start, end?}`
  - **`start` is required on both, `end` is optional**, and both are ISO `YYYY-MM` in storage and on the wire (regex `^\d{4}-(0[1-9]|1[0-2])$`). An absent `end` means the entry is current and the PDF prints `present`. A finish earlier than its start is a 422, enforced on the item model so create, PATCH and the tailored-CV copy all refuse it. The owner: *"instead of a bare text input it needs to ask when started and when finished (finish is optional, when empty is counted as Present), it's a date input but only for month and year "MM/yyyy""* — `MM/yyyy` is the **input and display** format and lives in the frontend; ISO is what the API stores, because ISO is what RenderCV's `start_date`/`end_date` take
  - The free-text `period` both sections used to carry is retired: revision `d3f7b1c9e2a4` renamed the columns to `experience_old` / `education_old` on `base_cvs` and `tailored_cvs` and seeded every migrated item with `start` and `end` of `2026-01`. Nothing was parsed; the original text lives on in the `_old` columns, which no application code and no ORM model touches
  - Section sub-item `id`s are **client-generated strings** preserved round-trip, never minted server-side
  - Read and written whole (a document aggregate), so there are no child tables
- **TailoredCV**: an application's CV copy — at most one per application
  - A **full snapshot** of the master CV it was made from: same identity, contact, summary and seven sections, stored on its own row
  - Editing or deleting the master never changes it; when the master is deleted `base_cv_id` becomes NULL and the copy keeps every field ("source CV deleted")
  - `was_ai_generated` / `adjustments` are the tailoring port's provenance fields: `was_ai_generated` is always `false`; `adjustments` is `[]` for a verbatim copy and filled by the keyword binding (one `{section, description}` per reordered section, ADR-0017)
  - Created through `TailoringService`, never assembled in the use case

- **JobSource** (KODI-046, table `job_sources`, revision `b28d5134631f`): the admin-managed catalog of job boards (`himalayas`, `remoteok`, seeded by the migration), no owner. `code` UNIQUE; `platform_id` → the public platform named after the source (`ON DELETE SET NULL`, but the admin delete refuses it); `is_enabled`; `last_run_at/status/error/found/saved` (status CHECK `ok`/`failed`/`blocked`)
- **Job** (table `jobs`): one shared posting per `(source_id, external_id)` (`uq_jobs_source_external`): title, company, company url, location (default `Remote`), job url, plain-text description, employment type, salary text, `tags TEXT[]` (GIN `ix_jobs_tags`), `keywords` JSONB (ADR-0017), `content_hash`, `posted_at`, `first_seen_at`, `last_seen_at`, `is_active` (`ix_jobs_active_posted`). Never deleted
- **JobFitScore** (table `job_fit_scores`): the fit 0..100 (CHECK) of one master CV for one job, UNIQUE `(base_cv_id, job_id)`, `user_id` = the CV's owner, `computed_at`; `ix_job_fit_scores_user_job`
- **JobDismissal** (KODI-047, table `job_dismissals`): a job one user took off their own list, UNIQUE `(user_id, job_id)` (`uq_job_dismissals_user_job`), both FKs CASCADE. Per user, no admin access
- **SavedJobSearch** (KODI-047, table `saved_job_searches`): a user's named `JobFilters` (`filters` JSONB), at most 10 per user, `uq_saved_job_searches_user_name` on `(user_id, lower(name))`, user FK CASCADE. Never notifies
- `Application.job_id` (KODI-047): nullable FK `jobs.id` `ON DELETE SET NULL` (`fk_applications_job_id`); one application per user per job (`uq_applications_user_job`, partial on `job_id IS NOT NULL`); on `Draft` only, absent from `GET /applications` and the `Application` schema
- Fits, dismissals and saved searches are per user; no admin route reads another user's (ADR-0004)
- **Feature** (ADR-0018, table `features`, revision `641001baff09`): the beta-feature registry, admin-managed, no owner. `key` UNIQUE (`uq_features_key`), `name`, `description` (nullable), `stage` `beta`|`general` (`ck_features_stage`, server default `beta`), `released_at`. Seeded by migrations only (`jobs` / "Job board", `cvs` / "CV builder")
- **FeatureBetaUser** (table `feature_beta_users`): one user on one feature's beta list, UNIQUE `(feature_id, user_id)` (`uq_feature_beta_users_feature_user`), `ix_feature_beta_users_user_id`, `added_by` = the admin who added them
- **FeatureAdminOptOut** (table `feature_admin_opt_outs`): one admin who turned one feature off for themselves, UNIQUE `(feature_id, user_id)` (`uq_feature_admin_opt_outs_feature_user`), `ix_feature_admin_opt_outs_user_id`. Its own table, never a flag on the list

### Key Relationships
- Application → User (many-to-one, cascade delete)
- Application → Platform (many-to-one)
- Application → Company (many-to-one, optional)
- TimelineEvent → Application (many-to-one, cascade delete, `passive_deletes=True`)
- TimelineEvent → User (many-to-one, cascade delete)
- The contract migration (`ad747aba90fc`, R2, KODI-013) renamed the legacy `applications.last_step_id`, `last_step_date`, `feedback_id`, `feedback_date`, `salary_offer` columns to `*_old` and the `application_steps` table to `application_steps_old`, and dropped the two transitional sync triggers `afd4074c70c2` created. The renamed objects still exist in the database (rule: retire with `_old`, never drop) but **no model maps them** and no code reads them
- Company → User (many-to-one via created_by, **SET NULL** on delete - a deleted user's private companies stay, `created_by` becomes NULL)
- Platform → User (many-to-one via created_by, **SET NULL** on delete, same as Company - fixed 2026-09-26, KODI-031: this used to read "cascade delete" here, which was never true for either FK)
- QuinzenalReport → User (many-to-one, cascade delete), unique on (user_id, report_day)
- UserFeedback → User (many-to-one, cascade delete)
- BaseCV → User (many-to-one, cascade delete), at most 3 per user
- TailoredCV → Application (one-to-one, cascade delete, `passive_deletes=True`), UNIQUE on application_id
- TailoredCV → User (many-to-one, cascade delete)
- TailoredCV → BaseCV (many-to-one, nullable, **SET NULL** on delete — the copy outlives its master)
- Job → JobSource (many-to-one, **RESTRICT** on delete)
- JobSource → Platform (many-to-one, nullable, SET NULL on delete; the admin platform delete refuses it)
- JobFitScore → User, Job and BaseCV (many-to-one, **CASCADE** on each - deleting a master CV removes its fit everywhere)
- JobDismissal → User and Job (many-to-one, **CASCADE** on each)
- SavedJobSearch → User (many-to-one, **CASCADE**)
- Application → Job (many-to-one, optional, **SET NULL** on delete - jobs are never deleted, so in practice the link stays)
- FeatureBetaUser → Feature and User (many-to-one, **CASCADE** on each); `added_by` → User (**SET NULL**)
- FeatureAdminOptOut → Feature and User (many-to-one, **CASCADE** on each)
- UserSession → User (many-to-one, **CASCADE**; `DELETE /users/me` also DELs the Redis keys first)
- BorderlessAccount, UserBadge, GithubConnection → User (CASCADE)

Applications are closed ("finalized") when `finalized_at` is set; reopen clears it.

## Code Conventions

### Formatting
- Ruff formatter with single quotes (`'`)
- Line length: 80 (hard), 120 (max for pycodestyle)
- Import sorting via Ruff

### Async/Await
- All database operations are async
- Use `await` for session operations
- Repository methods return ORM models or None
- Use case methods return DTOs

### Dependency Injection
Use FastAPI `Depends()` with type aliases:
```python
UserRepositoryDp = Annotated[UserRepository, Depends(get_user_repository)]
CurrentUserDp = Annotated[UserDTO, Depends(get_current_user)]
DiscordServiceDp = Annotated[DiscordService, Depends(get_discord_service)]
```

### File Organization
- Use cases grouped in subdirectories by feature (applications/, timeline_events/, compat/, user_stats/, quinzenal_reports/, companies/, user_feedbacks/, base_cvs/, tailored_cvs/, jobs/ - the worker's ingest and fit recompute plus the user's list/detail/dismiss/restore, job_searches/, admin/jobs/, features/ - the caller's own beta features, admin/features/)
- `app/worker/` is the background worker's delivery layer (ADR-0016): `broker.py`, `tasks.py`, `queue.py`; scrapers live in `app/application/services/job_ingestion/scrapers/`
- `use_cases/compat/` holds the layer for installed `applika-cli` 0.1.4 (step translation, legacy steps, legacy finalize); nothing there owns data
- One repository per model in `domain/repositories/`
- API routes in `presentation/api/` match resource names

## MCP Usage

Use available MCP (Model Context Protocol) servers during interactions.
**Always prefer MCP tools over bash equivalents when an MCP server is available.**

### Git MCP
- **Always use the Git MCP for every commit** — prefer `git_add`, `git_commit`, `git_diff`, `git_status`, etc. over bash git commands
- Create meaningful commits as you work — don't batch everything at the end
- Commit after completing logical units of work (e.g., after finishing a migration, after adding a new feature layer)
- Write descriptive commit messages following conventional commits style
(feat(backend): message, fix(backend): message, test(backend): message, etc)

### Context7 MCP
- Use context7 to look up library documentation when working with FastAPI, SQLAlchemy, Alembic, Pydantic, or any other dependency
- Prefer context7 over guessing API signatures or relying on outdated knowledge

### Other MCPs
- Use any other available MCP server when relevant (e.g., Docker MCP for container operations)
- Check available MCPs at the start of complex tasks and leverage them throughout

## Project Skills

This repository includes Claude Code skills in `.claude/skills/backend-patterns/` covering:
- async-repository, use-case, pydantic-dto patterns
- JWT cookie auth, OAuth2 integration
- Custom exception handling
- Testcontainers testing setup
- Context variable logging

Refer to `CLAUDE_SKILLS.md` for full examples from the codebase.
