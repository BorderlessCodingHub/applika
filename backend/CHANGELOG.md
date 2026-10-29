# Changelog

All notable changes to the Applika backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- table report_webhook_badges (a report webhook holds one or more badges, BASE and/or PSP); each report webhook's badge is copied into it and report_webhooks.badge is kept as badge_old. No code reads it yet (Release A, ADR-0024).
- Borderless sign-in (ADR-0024): POST /auth/borderless/signin `{email, password}` checks the credentials with Borderless from the server and answers 200 `{redirect_to, new_account}` (web: a `borderless` session and both cookies; with the `__cli_login` marker: `redirect_to` hands the sign-in back to the CLI, no cookie, the browser's session kept); 401 "Invalid email or password", 403 `email_unverified`, 409 `binding_conflict` / `email_ambiguous`, 422 `email_unusable` when an unbound Borderless account's email is over 100 characters (once normalized) or not a valid address (nothing written, not counted by the per-email limit), 429 with Retry-After (Borderless's limit, or 5 failures per email in 15 minutes), 503 when Borderless is unavailable or not configured. The Borderless password is never stored or logged; the Borderless token never leaves the server.
- the account bound to a Borderless account opens on sign-in; with none, the account with the same email (ignoring case) is bound; with none, a new account is created. A binding never moves on sign-in.
- membership badges BASE and PSP, read from the Borderless profile at every sign-in, confirmation and session refresh while the 7-day Borderless access lives; a failing read never blocks. A badge counts only while that access is alive and not refused; another membership revokes it and keeps its history.
- POST /auth/borderless/confirm (signed in) renews the Borderless access and reads the membership; 204, the session and cookies untouched; 409 `binding_conflict` for another Borderless account.
- GitHub restore: POST /auth/github/restore → `{authorize_url}` (scope read:user; 409 when the account already has a GitHub identity, 503 when not configured); GET /auth/github/callback moves the Borderless binding and badges to the GitHub-era account, deletes the empty new account and signs the browser in as the old one, then 307s to ACCOUNT_LINK_REDIRECT_URI?account=github&status=restored|not_found|has_data|already_bound|error. No GitHub token is stored. POST /users/me/github-restore/dismiss → 204.
- GET/PATCH /users/me: `badges`, `borderless` `{status, expires_at, email}` and `github_restore` `{available, prompt}`.
- /admin/report-webhooks (GET, POST, PATCH /{id}, DELETE /{id}): a webhook address, a badge (BASE or PSP) and an optional label; only a masked address is returned.
- settings BORDERLESS_API_URL (https in PROD), BORDERLESS_TOKEN_ENCRYPTION_KEY, BORDERLESS_TIMEOUT_SECONDS, BORDERLESS_REFRESH_TIMEOUT_SECONDS, BORDERLESS_SIGNIN_EMAIL_LIMIT, BORDERLESS_SIGNIN_EMAIL_WINDOW_SECONDS, WEB_SIGNIN_URI.
- a Borderless stub for the E2E stack and local runs (tests/fixtures/borderless/stub.py, service `borderless-stub` in docker-compose.e2e.yml).
- tables borderless_accounts, github_connections (one row per existing user, from users.github_id), user_badges and report_webhooks (the Discord report webhooks copied, badge unset); users.github_restore_prompt_seen_at; users.github_id nullable; sign-in method borderless allowed. No code reads them yet (Release A, ADR-0024).
- the `cvs` beta feature gates master CVs, application CV copies and drafts (`FeatureKey.CVS`, ADR-0021). On release, revision `647a047921ec` adds to the `cvs` beta list every user whose first master CV or CV copy is newer than the `cvs` row, added by no admin (Release B). A user an admin removed from the list keeps off unless their first CV came after Release A.
- feature "cvs" ("CV builder") seeded in beta; every user who owns a master CV or a CV copy is on its beta list, added by no admin (Release A, ADR-0021).
- KODI-057 device sessions (ADR-0019): one session per sign-in, a `user_sessions` row (`UserSessionModel`) plus two Redis keys on `REDIS_URL` (`applika:session:<uuid7>` and `applika:session:id:<sid>`), the refresh value a random UUIDv7.
- KODI-057 GET /users/me/sessions (the caller's devices, web and CLI: name, client, sign-in method, sign-in and last IP, granted, last used, expiry, status active|signed_out|revoked|expired, "This device"), DELETE /users/me/sessions/{id} (204; 404 "Session not found" for any other user's session, admins too) and POST /users/me/sessions/revoke-others ({revoked}). Not behind a beta flag (owner: "Gate nothing").
- KODI-057 CLI sign-in for applika-cli 1.1.0: GET /auth/cli/authorize (PKCE S256, loopback or `oob` redirect_uri), POST /auth/token (authorization_code, refresh_token and urn:ietf:params:oauth:grant-type:device_code grants; RFC 6749 400 {error, detail}), POST /auth/revoke (204 for any value; 503 when the session service is down, fail closed), POST /auth/device/code, GET /auth/device/verify, POST /auth/device/approve and /deny (RFC 8628, 10-minute code, 10 s interval). POST /auth/token, /auth/revoke and /auth/device/* answer 503 {"detail": "Session service unavailable"} + Retry-After: 5 when Redis cannot be reached.
- KODI-057 settings DEVICE_CODE_TTL_SECONDS (600), DEVICE_CODE_POLL_INTERVAL_SECONDS (10), DEVICE_VERIFICATION_URI, CLI_MANUAL_REDIRECT_URI and SESSION_HISTORY_DAYS (30).
- KODI-052 GET /users/me/features and the feature gate require_feature (ADR-0018).
- KODI-052 /admin/features: list, beta list (list, add, remove), release and move back to beta, the admin's own opt-out (ADR-0018).
- KODI-050 backend/docker-compose.yml runs the taskiq `worker` and `scheduler` services (ADR-0016) once the api is healthy; the api gains a healthcheck. The root README documents the worker, the scheduler and the JOBS_* settings.
- KODI-047 GET /jobs, GET /jobs/{id}, PUT|DELETE /jobs/{id}/dismissal, /job-searches (max 10 per user), POST /applications/drafts/from-job; Draft gains job_id; a job without a title is 422, a job without a company name starts a draft whose company is the free text "Unknown company". Ports Ían Muliterno's list_jobs, get_job and create_application_from_job (his job_scrapping pull request). No CLI change: jobs and drafts are web only, and GET /applications is unchanged (no job_id).
- KODI-046 taskiq worker and scheduler (ADR-0016): hourly Himalayas and RemoteOK collection, fit recompute, GET/PATCH /admin/jobs/sources and POST /admin/jobs/runs; TASKIQ_BROKER_URL and JOBS_* settings; CD updates the worker and scheduler services when they exist.
- KODI-045 keyword tailoring binding (ADR-0017) and GET /applications/{id}/cv/fit.
- KODI-056 table user_sessions: one row per sign-in (device name, client,
  sign-in method, sign-in and last IP, granted, last used, expiry, end and
  reason); no code reads it yet (Release A, ADR-0019).
- KODI-051 tables features, feature_beta_users and feature_admin_opt_outs;
  feature "jobs" ("Job board") seeded in beta with an empty beta list; no
  code reads them yet (Release A, ADR-0018).
- KODI-044 tables job_sources, jobs, job_fit_scores, job_dismissals,
  saved_job_searches and applications.job_id; Himalayas and RemoteOK sources
  seeded, each with a public platform (an existing public one with the same
  name is reused); no code reads them yet (Release A).
- KODI-043 history import of Ían Muliterno's job_scrapping (his upstream pull
  request, head IanniMuliterno/applika:job_scrapping), no behaviour change.
- KODI-039 API rate limiter (ADR-0015): per user, IP without a session;
  120/min, 10/min on /auth/*; 429 {"detail": "Too many requests. Try again
  in <n> seconds."} + Retry-After + X-RateLimit-*; RATE_LIMIT_* settings;
  fail open.
- KODI-035 GET /platforms?name=: visible platforms, searchable, ordered by
  name (web picker).
- KODI-032 draft applications API - "new application with CV" (ADR-0014,
  Release B of PRD 0010, S3). `ApplicationModel.is_draft` is now mapped
  (the migration `3b78c3cd2a71` column KODI-030 left unmapped) and
  `app/domain/repositories/application_filters.NOT_DRAFT` is the one
  filter every application read path applies by default.
  - `POST /applications/drafts` (new, web only, not a CLI route): create a
    draft - `{company_id?, company_name, role, platform_id, mode?,
    link_to_job?, observation?, expected_salary?, salary_range_min?,
    salary_range_max?, currency?, salary_period?, experience_level?,
    work_mode?, country?, job_description?}` - 201. No `application_date`
    is asked; the row gets a server-today placeholder until it is
    finished. `company_id` wins over `company_name` when both are sent
    (the row's own name is stored); a bare `company_name` stays free text,
    same as the ordinary application's `{name, url: null}`. An invisible
    `company_id`/`platform_id` is 404 and writes nothing.
  - `GET /applications/drafts` (new): the caller's own drafts as
    `DraftSummary {id, company_name, role, platform_id, has_cv,
    created_at, updated_at}`, most recently saved first, `[]` when there
    are none.
  - `GET /applications/drafts/{id}` (new): one draft, full shape (`Draft`),
    404 if not owned or not a draft.
  - `PUT /applications/drafts/{id}` (new): full replace of the draft's
    application data. Never touches its CV copy - going back to step 1,
    editing, and returning to step 2 keeps the copy.
  - `DELETE /applications/drafts/{id}` (new): 204; its CV copy is
    cascade-deleted with it.
  - `POST /applications/drafts/{id}/finish` (new): `{application_date}` -
    200, the same `Application` shape `GET /applications` returns. 422
    `"Pick a master CV before finishing"` with no CV copy; 422 when
    `application_date` is past `UTC today + 1` (the same rule every other
    application date uses). On success `is_draft` flips to false,
    `cycle_id` stays NULL, and the row appears in every ordinary read
    model from then on.
  - `/applications/{id}/cv*` (create/get/update/delete/pdf/markdown/diff)
    now accept a draft id - the CV copy page (PRD 0007) is reused as step 2
    of the draft flow (`tailored_cvs/guards.load_owned_application` is the
    one caller that opts back into seeing a draft).

- KODI-031 private companies and platforms, admin Approve (ADR-0014,
  Release B of PRD 0010, S2). `CompanyModel`/`PlatformModel` now map
  `is_public` and `PlatformModel.created_by` (the migration `3b78c3cd2a71`
  columns Release A left unmapped); `visible_to(model, user_id)`
  (`app/domain/repositories/catalog_visibility.py`) is the one rule every
  visibility check shares: public, or private and created by that user.
  - `POST /platforms` (new): any user may add a platform not already
    listed, `{name, url?}` - url is optional, whoever adds it. Starts
    **private** to that caller (admins included - the owner's own
    applications go through the same flow as anyone's). A name that
    matches, ignoring case, a platform the caller already sees is a 409
    naming that platform.
  - `POST /companies` (new): `{name, url}` - 201 for a new private company,
    200 reusing an existing one the caller can see with the same normalised
    name and url. `{name}` with no url stays free text on the application,
    as before, and is never listed.
  - `GET /companies` and `GET /supports` now list every public row plus the
    caller's own private ones, never another user's private row. Both
    responses add `is_public`; a `/supports` platform's `url` is now
    nullable (fixes a 500 on a url-less platform).
  - `POST /applications` and `PUT /applications/{id}`: an invisible
    `platform_id` or company id is a 404 (`"Platform not found"` /
    `"Company not found"`) and writes nothing - checked before any row is
    inserted or updated.
  - `GET /admin/companies` and `GET /admin/platforms` add `?visibility=
    public|private`, `is_public` and `created_by {id, username}|null` on
    every row.
  - `POST /admin/companies/{id}/publish` and `POST /admin/platforms/{id}/
    publish` (new, `AdminUserDp`): publishes a private row (idempotent on
    an already-public one), keeping `created_by`. Refused with a 409
    naming the public row it would duplicate on `(lower(name), url)`
    (companies) or `lower(name)` (platforms) - there is otherwise no
    uniqueness among public platform names (production may already hold
    duplicates).
  - A company or platform created through the admin screens
    (`POST /admin/companies`, `POST /admin/platforms`) is public at once;
    one an admin adds through the ordinary user flows (`POST /companies`,
    `POST /platforms`, `POST /applications`) is private like any user's
    (owner decision, 2026-09-25: "an admin user is like any other non admin
    user but with permissions to access some areas").
  - Every company and platform that existed before this release stays
    public (carried by migration `3b78c3cd2a71`'s `server_default true`).

- KODI-030 catalog visibility and draft flag columns (migration only,
  ADR-0014, ADR-0005, Release A of PRD 0010). Revision `3b78c3cd2a71` adds
  `companies.is_public` and `platforms.is_public` (`NOT NULL`, default
  `true` — every row that exists today stays public),
  `platforms.created_by` (nullable, `fk_platforms_created_by` ->
  `users.id ON DELETE SET NULL`, `ix_platforms_created_by`) and
  `applications.is_draft` (`NOT NULL`, default `false`). Replaces the
  global `uq_companies_name_url` with two scoped partial unique indexes,
  `uq_companies_public_name_url` (`lower(name), url` where public) and
  `uq_companies_private_owner_name_url` (`created_by, lower(name), url`
  where private), and adds `uq_platforms_private_owner_name`
  (`created_by, lower(name)` where private; no public-platform index,
  since production may already hold duplicate public platform names) and
  `ix_applications_user_id_drafts` (`user_id` where draft). No ORM
  mapping, route or frontend change ships in this release — `app/` reads
  and writes none of these columns yet; that is Release B (K2). Not a CLI
  change: no route or payload shape moves. Follow-up (owner decision,
  2026-09-26): `upgrade()` now pre-checks for duplicate public companies on
  `(lower(name), url)` before building `uq_companies_public_name_url` and
  stops with a clear `RuntimeError` naming the index and every colliding
  group's ids, instead of a raw Postgres unique-violation, in case a prior
  rollback left the non-unique `ix_companies_name_url` branch and old code
  inserted a new duplicate public company.
- KODI-025 admin report webhook catalog (ADR-0013, K7): an admin can list,
  add, change and remove the Discord webhooks reports may be posted to.
  `discord_report_webhooks` (added by K5 migration `ba44f9cfd3c1`, no
  `user_id` - a platform catalog, admin-only per ADR-0004) is now mapped by
  `DiscordReportWebhookModel`; no new migration.
  - `GET /admin/discord-webhooks` (admin-only): 200 list, each row
    `{id, label, guild_id, role_ids, webhook_url_masked, created_at,
    updated_at}` - the full webhook address is **never** returned, only a
    masked form (`https://discord.com/api/webhooks/<id>/…<last4>`).
  - `POST /admin/discord-webhooks`: 201, `{webhook_url, guild_id, role_ids?,
    label?}`. `webhook_url` must be a secure (`https://`) Discord webhook
    address (`discord.com`/`discordapp.com`, `ptb`/`canary` subdomains, an
    optional `/v<n>` segment); `guild_id`/`role_ids` must be Discord
    snowflake ids (17-20 digits and within Postgres `BIGINT`, so an
    over-length numeric string is a 422, not a 500); at most 25 role ids,
    deduped; `label` <= 100 chars. A duplicate `webhook_url` is 409 `"This
    webhook is already configured"`. Every field on this route is optional
    at the schema level and the required-ness is enforced in the use case
    on purpose: FastAPI's own `RequestValidationError` for a missing field
    echoes the *whole* submitted body, which would leak `webhook_url` into
    an unrelated 422 - here a missing/blank field is instead a fixed-string
    `BusinessRuleViolation` that never contains the submitted value.
  - `PATCH /admin/discord-webhooks/{id}`: 200, partial. An omitted or
    blank/whitespace `webhook_url` keeps the stored one; a real new value is
    re-validated and a duplicate is still 409; `role_ids` fully replaces the
    stored list when present; `label: null` clears it, omitting the key
    keeps it. Unknown id -> 404 `"Discord webhook not found"`.
  - `DELETE /admin/discord-webhooks/{id}`: 204; unknown id -> 404.
  - Not a CLI route (`/admin/*`); `DiscordReportWebhookRepository
    .list_by_guild_ids` is provided for K8's submit-time routing, not wired
    to anything yet.
- KODI-024 Discord connection record (ADR-0013, supersedes ADR-0008/KODI-020):
  connect, transfer, disconnect, reconnect, `/users/me` `discord` object.
  Keeps GitHub as the only way to sign in - the flow never creates, changes
  or reads an Applika session cookie beyond resolving who is already signed
  in.
  - `POST /auth/link/discord` (auth required): 200
    `{"authorize_url": "https://discord.com/oauth2/authorize?...&scope=
    identify+guilds+guilds.members.read&state=<nonce>"}`, 401 when signed
    out, 503 `{"detail": "Discord linking is not configured"}` when the id,
    the secret or the new encryption key below is missing. The nonce is a
    single-use, 10-minute Redis value (`AccountLinkStateUseCase`,
    `applika:account_link:discord:{nonce}` -> the user id who started it).
  - `GET /auth/link/discord/callback?code&state`: always a 307 to
    `ACCOUNT_LINK_REDIRECT_URI?account=discord&status=linked|conflict|error`,
    never JSON, never sets or clears a cookie. Consumes the nonce first (a
    replay never matches twice), then requires the caller's own `__access`
    cookie to name the same user the nonce was issued to, then exchanges the
    code (`DiscordOAuthService.exchange_code`) and reads the Discord profile
    (`fetch_profile`) - unlike the retired KODI-020 flow, the access token
    is never revoked at connect time, and the refresh token is stored
    encrypted. A Discord-side `error` query param, a missing `code`, an
    unconfigured app or any exchange/profile failure (`DiscordLinkError`)
    all answer `status=error` with nothing written; the id already
    belonging to another Applika user **moves to the caller** (see the
    2026-09-24 rewrite below) - `status=conflict` is left only for a
    two-user race.
  - `DELETE /auth/link/discord` (auth required): 200
    `{"provider": "discord", "linked": false}`, idempotent. Deletes the
    connection row, then asks Discord to revoke the stored refresh token
    best-effort - a Discord failure never blocks the disconnect.
    `DELETE /users/me` now runs the same revoke before the row goes by
    cascade.
  - The connection is its own record, apart from `users`
    (`DiscordConnectionModel`, table `discord_connections`, migration
    `ba44f9cfd3c1`, shipped code-free in KODI-023/Release A2): Discord user
    id, username, display name, avatar, granted scopes, access expiry,
    `status` (`active` | `needs_reconnect`) and both `linked_at` and
    `updated_at`. `user_id` and `discord_id` are each UNIQUE. The refresh
    token is encrypted with its own Fernet secret; the access token is
    never stored.
  - Reconnect runs the identical consent flow: linking on the caller's own
    row refreshes every field in place and clears a `needs_reconnect` mark,
    rather than creating a second row.
  - **Reopened 2026-09-24 (R-008 rewrite): a Discord id already linked to
    another Applika user moves to the caller instead of refusing the link.**
    Owner: "drop the old connection and create the new one". The other
    user's connection row is deleted, the caller's row is written with the
    caller's new grant, in one transaction, and nothing is revoked at
    Discord for either user - a revoke could cancel the caller's own
    just-granted access, since it is the same Discord user authorizing the
    same app. The callback answers `status=linked`, the previous holder's
    `/users/me` `discord` goes back to `null`, and their feedback stops
    carrying a mention. `status=conflict` is now reached only when two
    users complete consent for the same Discord account at the same
    instant; the loser's write is refused by the database's own
    `uq_discord_connections_discord_id` (`IntegrityError` -> `ResourceConflict`),
    nothing is stored for the loser, and nothing is revoked there either.
    This supersedes the "new grant revoked best-effort" conflict behaviour
    described above when this same KODI-024 entry first shipped.
  - `GET/PATCH /users/me` gain `discord: {username, global_name, avatar_url,
    status} | null` and keep `discord_linked: bool` (now `discord is not
    null`); the Discord id is never a field on any schema. Additive - see
    `cli/CHANGELOG.md`.
  - New setting: `DISCORD_TOKEN_ENCRYPTION_KEY` (optional, `None` unset) -
    its own Fernet key, distinct from `GITHUB_TOKEN_ENCRYPTION_KEY`. Connect
    Discord answers 503 until `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`
    AND this key are all set.
  - `app/core/crypto.py` gains `encrypt_discord_token`/`decrypt_discord_token`
    (`None` on `InvalidToken` or an unset key), a Discord-only Fernet pair
    beside the existing GitHub ones.
  - `app/domain/repositories/discord_connection_repository.py` (new) owns
    the connection row: `link` (connect/reconnect/transfer - a Discord id
    held by another user moves to the caller, that user's row deleted in
    the same transaction; `ResourceConflict` only on a two-user race, an
    `IntegrityError` on `uq_discord_connections_discord_id`),
    `store_grant`, `mark_needs_reconnect`, `delete_by_user_id` (idempotent).
    `user_repository.link_discord`/`unlink_discord`/`get_by_discord_id` and
    `users.discord_id` are gone; `UserDTO.discord_id` is gone too.
- KODI-023 Migration ba44f9cfd3c1 (Release A2, expand only): enum
  discord_connection_status, tables discord_connections and
  discord_report_webhooks; users untouched. KODI-024 adds the ORM mapping
  for `discord_connections`; `discord_report_webhooks` stays unmapped until
  K7/K8.
- KODI-022 `app/scripts/seed_e2e.py` seeds a third deterministic E2E user,
  `e2e-discord` (`github_id 999000000003`), whose Discord connection row
  (KODI-024) is re-linked to a fixed synthetic Discord id (`E2E_DISCORD_ID`)
  on every seed run, so an E2E Disconnect is undone the next time it runs;
  `e2e-user` and `e2e-admin` have their connection deleted on every run.
  The seed's JSON contract gains `discord_user_id`, `discord_access_token`,
  `discord_refresh_token` for a real minted session, alongside the
  existing `user_id`/`admin_user_id` pairs. No route or schema change -
  test/harness only, for the KODI-022 frontend E2E.
- KODI-017 (part 3, T090/T091) Four new read-side GET export routes, all
  owner-scoped, all 404 when not owned / no copy, none carrying a
  finalized/archived guard (R-024/R-025):
  - `GET /base-cvs/{base_cv_id}/markdown` and
    `GET /applications/{application_id}/cv/markdown` — the CV as
    `text/markdown; charset=utf-8`, `Content-Disposition: attachment;
    filename="<pdf slug>.md"`. Built from the SAME `RenderCVModel` the PDF
    path maps (`cv_rendering/mapper.py`), rendered in memory with RenderCV
    2.8's own Markdown templater
    (`rendercv.renderer.templater.templater.render_full_template(model,
    "markdown")`) — same section order, same `SECTION_ORDER`. One documented
    override: RenderCV's bundled `Header.j2.md` computes
    `cv._connections` (every header contact, including a link that is not a
    known social network) but never reads it, so a `custom_connections`
    link — present in the PDF header — is silently dropped from RenderCV's
    stock Markdown output; `markdown_overrides/Header.j2.md` is a one-file
    template override (RenderCV's own override mechanism, not a parallel
    renderer) that lists `cv._connections` instead and prints the headline
    under the name, as the applika Typst header does (the stock Markdown
    header omits it). The mapper's Typst escape for `#word` is turned back
    into a literal `#` after rendering. Failure →
    `CVExportFailed` (new, 500, sibling of `PdfRenderFailed`).
  - `GET /applications/{application_id}/cv/diff/markdown` and
    `GET /applications/{application_id}/cv/diff/pdf` — the diff between the
    copy and its baseline. Baseline: `base_snapshot` if present, else the
    current master CV via `base_cv_id`, else `ResourceConflict` (409, "This
    CV copy has no baseline to compare with."). Baseline label: the current
    master's name when `base_cv_id` still resolves, else "the original
    master CV" — independent of whether the content came from the snapshot
    or the live master. The diff itself is a new pure, framework-free
    function, `app/application/services/cv_diff.py`
    (`diff_cv(baseline, current) -> CVDiffResult`): list items matched by
    client-generated `id`, never position (a pure reorder is zero changes);
    `None`/`""` normalise equal; `bullets` compares as one whole value;
    `keywords` compares as a set per skill category. Canonical JSON output
    `{total, sections: {identity, links, summary, experience, languages,
    skills, projects, education, certifications}, changes: [{kind, section,
    path, before, after}]}`, pinned identical to the web diff
    (`frontend/src/components/tailored-cvs/cv-diff.ts`) by a shared fixture
    set under `applika/fixtures/cv-diff/*.json` (see its `README.md`), loaded
    by both the backend pytest and the frontend vitest suites. The Markdown
    document (`cv_diff_markdown.py`) is deterministic: `# Changes to <copy
    name>`, `Compared with <label>: N changes`, one `## <Section> (n)` per
    section with changes (order: Identity and contact, Links, Summary, then
    Experience, Languages, Skills, Projects, Education, Certifications), one
    bullet per change, `No changes.` at zero. Every value is rendered on one
    line (lists such as `bullets` joined with `; `, newlines collapsed), so
    a change is always exactly one bullet; a changed item field or keyword
    names its item (`Changed experience Role (<role> at <company>): ...`,
    `Added keyword Go to <category>`). The PDF is the same content
    compiled through Typst (`diff_pdf_renderer.py` + a minimal
    `diff_template/diff.typ`) via `sys.inputs` — the diff content, which is
    free CV text and may itself contain Typst markup characters, needs no
    escaping this way. Filenames `"<pdf slug>-changes.md"` /
    `"<pdf slug>-changes.pdf"`.
  - New exception `CVExportFailed` (`app/core/exceptions.py`) → 500, for all
    four routes' render failures; same fixed-message discipline as
    `PdfRenderFailed` (never quotes CV content).
  - `app/presentation/handlers.py`: every exception handler is now typed
    `exc: Exception` and narrows with `assert isinstance(...)`, which clears
    the Starlette `add_exception_handler` signature diagnostic on all nine
    registrations. Behaviour is unchanged. The backend `ty` baseline drops
    from 28 to 20.
  - No CLI changelog entry: `applika-cli` does not call any of the four
    routes (checked: no `/cv`, `/base-cvs/.../markdown` or `/diff` in
    `cli/src`).

### Changed

- the access token's `sub` is `users.id`; every session open before this release ends and every user signs in again with Borderless.
- /auth/refresh and the refresh_token grant read the Borderless membership instead of checking a GitHub token; a user with no Borderless binding, or a session opened before this release, gets 401 "Sign in again with Borderless" and the session ends.
- /auth/github/login 307s to WEB_SIGNIN_URI; /auth/cli/authorize and /auth/cli/login/{id} 307 to WEB_SIGNIN_URI?cli=1 (400/404 unchanged).
- /reports* need a held BASE or PSP badge: 403 `badge_required` without a recorded badge (administrators included), 403 `membership_unconfirmed` when the recorded badge does not count. A report posts to the report webhooks of the author's badges; webhooks carried over without a badge receive nothing.
- report and feedback posts carry the applika username and mention nobody.
- /admin/users `github_id` comes from the GitHub identity on record and may be null; /users/me `github_id` is nullable.
- the CV diff fixtures moved from the repository root (fixtures/cv-diff/) to backend/tests/fixtures/cv-diff/, beside the jobs fixtures; the backend and frontend suites read them there, and the frontend suite fails instead of skipping when they are missing. The E2E runner moved to frontend/scripts/e2e.sh. No runtime change.
- the OpenAPI description of `EventType` names the three event types only; the database internals moved to a code comment. No value changed.
- without the `cvs` feature, `GET /jobs` and `GET /jobs/{id}` answer with no fit: `best_fit` null, `fits` [], `min_fit` matches no job (`total` 0), `sort=fit` sorts by newest. The `application` mark is unchanged.
- without the `cvs` feature, every `/base-cvs*`, `/applications/{id}/cv*` and `/applications/drafts*` route answers 404 `{"detail": "Not Found"}`, the same as an unknown route, trailing-slash paths included; `GET /applications/{id}/cv/fit` and `POST /applications/drafts/from-job` need `cvs` and `jobs`. Anonymous callers still get the 401. Every master CV, CV copy and draft is kept and comes back with the feature; the worker keeps scoring every master CV.
- revision `647a047921ec` drops the switch-over trigger `trg_timeline_events_legacy_event_type` and its function; `ck_timeline_events_event_type` now refuses any `note` or `feedback` write. Its downgrade recreates both (Release B).
- timeline events of type note and feedback are now interviews of type unknown; the original type is kept in timeline_events.event_type_old, a CHECK allows only interview, offer and denied, and a temporary trigger converts what the previous release still writes (Release A, ADR-0020).
- KODI-057 the access JWT carries `sid` (the session id) and every signed-in request checks that session in Redis: a token without `sid`, or whose session ended, is 401 "Session expired"; when Redis cannot be reached the request is 503 {"detail": "Session service unavailable"} + Retry-After: 5 (fail closed, nobody signed out). Every session that existed before this release ends: web and CLI users sign in again; `applika:refresh_token:*` keys are no longer read.
- KODI-057 `Authorization: Bearer` is accepted before the `__access` cookie, and the rate limiter counts a Bearer token against its user.
- KODI-057 sessions slide: GET /auth/refresh (and the refresh_token grant) moves the session's end 7 days ahead and re-sets `__refresh` (same value, full Max-Age) with `__access`; a refused refresh (401) clears both cookies, a 503 clears none. GET /auth/logout ends the session (503 + Retry-After: 5 when Redis is down, cookies kept); signing in again in the same browser ends its previous session; deleting the account ends every session.
- KODI-057 POST /auth/cli/exchange opens a session of its own (`cli_legacy`); same JSON shape, the access value is a JWT with `sid` and the refresh value a UUIDv7.
- KODI-052 without the "jobs" feature, /jobs*, /job-searches*, POST /applications/drafts/from-job and GET /applications/{id}/cv/fit answer 404, and POST /applications/{id}/cv with tailoring "keywords" answers 422 "Unknown tailoring option".
- KODI-052 without the "jobs" feature, the slash-suffixed gated paths (/jobs/, /jobs//, /jobs/{id}/, /job-searches/, /applications/drafts/from-job/, /applications/{id}/cv/fit/ ...) answer the same 404 instead of a 307 redirect; with it they are served directly. Every other route keeps its trailing-slash redirect.
- KODI-046 the keyword matcher keeps and matches tags with digits and
  non-English letters (5G, 3D, 2FA, Vue 3, Résumé); .NET no longer matches
  "Net income"; "Python," is "python"; "machine- learning" is no pair.
- KODI-046 deleting a platform a job source uses is refused (409), like one
  an application uses; the message now reads "application(s) or job
  source(s)".
- KODI-046 redis-py 7.4 -> 8.1 (taskiq-redis 1.2.4 requires it); its new
  5-second default read timeout now applies to the API's Redis client.
- KODI-045 POST /applications/{id}/cv takes an optional tailoring ("copy" default, "keywords").
- KODI-039 request log client_ip is the uvicorn-resolved address
  (FORWARDED_ALLOW_IPS), no longer the raw X-Forwarded-For.
- KODI-036 draft applications now carry `application_date` (S8 of PRD 0010,
  R-003; reuses the existing `applications.application_date` column, no
  migration). `DraftInput.application_date` is optional: `POST
  /applications/drafts` without it still defaults to the server's own day
  (unchanged), `PUT /applications/drafts/{id}` without the key, or with it
  explicit `null`, keeps the stored value - it never clears, the only draft
  field with that rule. Either way a given date beyond `UTC today + 1` is a
  422 and nothing is written. `Draft` (every create/get/update response) now
  always carries `application_date`. `POST
  /applications/drafts/{id}/finish` now takes an **optional** body - no
  body, `{}` or `{application_date}` - the body date wins when given, else
  the draft's own stored date is used; the 422 "Pick a master CV before
  finishing" and the future-date 422 are unchanged. Not a CLI route; no CLI
  changelog entry.
- KODI-035 GET /admin/platforms paginated with search, visibility, sort and
  applications_count (drafts excluded); /supports unchanged.
- KODI-032: `GET /applications`, statistics, reports, cycles, the agenda
  and admin statistics/user counts now all exclude drafts
  (`NOT_DRAFT`); starting a new cycle never archives one.
  `count_entity_references` (admin platform/company delete refusal) is
  unchanged on purpose - a platform or company a draft uses still blocks
  the delete. A draft id on any ordinary application route (`PUT`/`DELETE
  /applications/{id}`, timeline, steps, finalize, reopen, the 0.1.4
  compat routes) is a 404, same as an application owned by someone else.
- KODI-029 `users.is_org_member` renamed `is_org_member_old` (Release C,
  migration only, revision `583226ca46bc`); values kept; nothing reads it.
- KODI-026 Report submission now routes to Discord by the submitting user's
  live server (guild) membership and, optionally, their roles in it — the
  single `DISCORD_REPORTS_WEBHOOK`/`DISCORD_REPORTS_ORGANIZATION` gate is
  gone (ADR-0013, R-032..R-040, R-014).
  - `POST /reports/{day}/submit` keeps its request/response shape
    (`{success, report_id, discord_posted, discord_error}`) but now answers
    **201** whatever Discord does (previously 200); the report is always
    saved before Discord is contacted, and a Discord failure never blocks or
    unwinds the submission.
  - New `ResolveReportWebhooksUseCase.execute(user_id)` -> `ReportRouteDTO`:
    uses the user's stored Discord grant to fetch their live guild ids
    (`DiscordOAuthService.list_guild_ids`), looks up every admin-configured
    `discord_report_webhooks` row for those guilds
    (`DiscordReportWebhookRepository.list_by_guild_ids`), and for a
    role-limited row reads the user's roles in that server
    (`get_member_role_ids`) — the webhook is kept only when the user holds at
    least one of the listed roles. A guild's role lookup failing drops only
    that guild's role-limited hooks. The access token, the guild ids and the
    role ids are read fresh on every call and never stored or logged
    (R-014/R-042).
  - Each successful renewal (`DiscordOAuthService.refresh`) replaces the
    stored refresh token with the new one, encrypted, **before** any further
    Discord call (R-017); a revoked grant (`DiscordGrantRevoked`) marks the
    connection `needs_reconnect` (`GET /users/me` then reports
    `discord.status == "needs_reconnect"`); a transient failure
    (`DiscordUnavailable`) leaves the connection exactly as it was and the
    report simply posts nowhere.
  - `SubmitReportUseCase` no longer takes `github_service`/`user_repo` and no
    longer validates GitHub org membership; it posts the same message once
    per resolved webhook URL, `discord_posted` is true if any post
    succeeded, and `discord_error` joins every failure's message with `'; '`
    (≤ 500 chars, `None` when no post failed).
  - No CLI changelog entry: `applika-cli` does not call `/reports/*`.
- KODI-026 GitHub sign-in now asks for scope `user:email` only (was
  `user:email read:org`); the organisation-membership check that ran on
  every `GET /auth/github/callback` is gone. No CLI changelog entry:
  `applika-cli` never reads the granted OAuth scope, and this is not a route
  the installed CLI calls in a way that depends on it.
- KODI-021 User-feedback Discord webhook posts mention the submitting user
  when their account holds a Discord connection; an unlinked user's post is
  byte-identical to before. No route contract change. (Originally this entry
  also covered biweekly reports; KODI-026 above replaced that path
  end-to-end — a report's mention now depends on `ResolveReportWebhooksUseCase`
  finding a live, configured route, not merely on the connection row, and an
  unlinked or unconfigured user's report is not posted at all, not "posted
  without a mention".)
  - `DiscordService.post_report_message(message, mention_user_id=None,
    webhook_url=None)`: `allowed_mentions` is `{'parse': []}` when
    `mention_user_id` is `None` (unchanged), else `{'parse': [],
    'users': [str(mention_user_id)]}` — never `everyone`, `roles`, or any
    user other than the submitter. `webhook_url` (KODI-026) posts to that
    address instead of the constructor's own URL.
  - `SubmitFeedbackUseCase.execute` takes an optional `discord_id`; the
    header line gains `<@discord_id>` after `@username` when linked.
    (`SubmitReportUseCase.execute` no longer takes `discord_id` — KODI-026
    above.)
  - Feedback mentions still work with `DISCORD_CLIENT_ID`/
    `DISCORD_CLIENT_SECRET` unset: `user_feedback.py` reads the connection
    row directly, not through the Discord OAuth app. Reports no longer do:
    `ResolveReportWebhooksUseCase` gates on `DiscordOAuthService
    .is_configured()` first.
  - No CLI changelog entry: no route, request or response field changes.

### Removed

- Discord linking: /auth/link/discord*, /admin/discord-webhooks*, the `discord` and `discord_linked` fields of /users/me, and the DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_LINK_REDIRECT_URI, DISCORD_TOKEN_ENCRYPTION_KEY settings. The Discord tables stay in the database.
- GitHub sign-in, the stored GitHub token check, GITHUB_TOKEN_ENCRYPTION_KEY, GITHUB_CACHE_TTL_SECONDS and the fastapi-sso dependency (pyjwt is now a direct dependency).
- timeline event types `note` and `feedback` (ADR-0020): `POST /applications/{id}/timeline` and `PUT /applications/{id}/timeline/{event_id}` refuse them with 422; OpenAPI lists `interview`, `offer` and `denied`. Former notes and feedback read as interviews of type `unknown`, count in the statistics `unknown` stage, in new reports and in the agenda. The 0.1.4 `/steps*` routes show them as "Phase 2" with the same step id as before.
- KODI-026 `DISCORD_REPORTS_WEBHOOK` and `DISCORD_REPORTS_ORGANIZATION`
  settings, from `config/settings.py`, `.env.example` and both
  `docker-compose.yml` files — report routing is now the admin-managed
  `discord_report_webhooks` table (KODI-025) matched against a user's live
  Discord servers and roles (KODI-026 above).
- KODI-026 the `read:org` GitHub OAuth scope and
  `GitHubService.check_org_membership`/`org_name` — GitHub organisation
  membership is no longer checked, recorded or returned anywhere.
- KODI-026 `is_org_member` from `GET /admin/users/{id}`
  (`AdminUserDetailSchema`/`AdminUserDetailDTO`) and from `UserDTO`. The
  underlying `users.is_org_member` column is **not** dropped
  (`.claude/rules/non-destructive-migrations.md`): it stays in the database,
  unmapped by the ORM, kept aside for a later, explicit migration (K11,
  Release C). No CLI changelog entry: `/admin/users/{id}` is not a CLI route
  and `/users/me` never carried `is_org_member`.

### Fixed

- KODI-050 a draft started from a job (`POST /applications/drafts/from-job`)
  is dated with the caller's local calendar day: the body takes an optional
  `application_date` (`YYYY-MM-DD`) and stores it; absent, the draft keeps
  the server's UTC day as before. A given day must lie within UTC today
  plus or minus one day (every real timezone), else 422 with nothing
  written - past the top, the existing "cannot be in the future" message;
  below it, `application_date cannot be more than one day in the past (min
  allowed: <date>)`. Before, west of UTC in the evening Finish refused the
  draft's own date as in the future, and east of UTC after midnight the
  draft got yesterday. No CLI change: the route is web only.

- KODI-020 the dev stack (`docker-compose.yml`) now passes `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DISCORD_LINK_REDIRECT_URI` and
  `ACCOUNT_LINK_REDIRECT_URI` to the `api` container, and `.env.example`
  documents them; before, setting them in `.env` left Connect Discord at 503.
  Superseded by KODI-024's connection-record flow.
- KODI-011 `GET /users/me/agenda` now honours `to_date`. `from_date` and
  `to_date` shared one `Query(None)` default object, so FastAPI resolved
  both parameters from the first one's query key and the window silently
  collapsed to `from_date`-only, one day when both were sent explicitly.
  Each parameter now gets its own `Query(None)` instance.
- KODI-011 (remediation round 1, R-032) `POST /applications/{id}/finalize`
  with the new optional outcome body now refuses `salary_period=hourly` on
  `outcome=offer` (422, "offer salary_period must be monthly or annually"),
  the same restriction and message the timeline write schema already
  enforces. Before this fix the outcome body validated the salary triad's
  presence but not the period's value, so the same offer event was valid
  through `POST/PUT /timeline` and refused through `/finalize`, or the
  reverse. The shared check lives in
  `timeline_events/rules.ensure_offer_period_allowed`; the 0.1.4 legacy
  finalize body is unchanged — it still fills an offer's period from the
  application, which can itself be hourly.
- KODI-011 (remediation round 1) The finalize `requestBody` in OpenAPI now
  documents both accepted shapes — the deprecated 0.1.4 body and the new
  optional outcome body (R-032) — as a `oneOf`, instead of only the
  0.1.4 shape. `required: false` is unchanged.
- KODI-013 (remediation round 1, AC7/AC8) Migration `ad747aba90fc`'s
  `downgrade()` no longer collides with R1's (`afd4074c70c2`) on the temp
  table name `timeline_downgrade_touched`. `migrations/env.py` wraps a whole
  `alembic downgrade`/`upgrade` command in one outer transaction, so a
  single `alembic downgrade d3f7b1c9e2a4` from head — crossing this
  revision's `downgrade()` and then R1's in that same still-open transaction
  — used to raise `asyncpg.exceptions.DuplicateTableError` on R1's `CREATE
  TEMPORARY TABLE timeline_downgrade_touched`: `ON COMMIT DROP` only fires
  once the whole command's transaction commits, not between the two
  revisions. `alembic downgrade -1` run twice (one command, one transaction
  per revision) never showed it. Fixed in `ad747aba90fc` only — R1 is
  Release A and unchanged — by naming its temp table
  `timeline_downgrade_touched_ad747aba90fc` and dropping it explicitly at
  the end of its own `downgrade()`, rather than relying solely on `ON COMMIT
  DROP`. Regression test:
  `test_single_command_downgrade_and_upgrade_cross_two_revisions` in
  `tests/integration/test_timeline_contract_migration.py`.

### Added

- KODI-017 (part 2, T086/T087) `tailored_cvs.base_snapshot`: a nullable
  JSONB column (migration `c1d9f4a7b3e6`, R5, `down_revision =
  'ad747aba90fc'`, no backfill) holding a one-time snapshot of the master
  CV a copy was made from, taken from the master at copy-creation time
  (never from the tailoring result). Exposed read-only as `base_snapshot`
  on `TailoredCVOut` for `GET`/`POST`/`PUT /applications/{id}/cv`, `null`
  for a copy created before this revision; never written by `PUT`
  (`TailoredCVUpdate` is unchanged, `extra='forbid'` turns an attempt into
  a 422). It survives editing or deleting the master CV, exactly like the
  copy's own fields. Exists so the web CV copy editor can diff the copy
  against its baseline (R-021..R-023).
  **Migration placement, owner-accepted exception to
  `prod-release-runbook.md` rule 4**: this column ships in the same
  release as the code that reads and writes it, instead of an earlier,
  code-free release. Between the CD image deploy and the owner's manual
  `alembic upgrade head`, the new API image briefly runs against the old
  schema and every verb on `/applications/{id}/cv` (including
  `POST .../cv/pdf`) fails until the migration is applied — recorded in
  the migration's own docstring, not an oversight.
- KODI-010 Migration `afd4074c70c2` (release A, expand only): table
  `timeline_events` with PG enums `event_type` (note, interview, feedback,
  offer, denied) and `interview_type` (unknown, initial_screening, technical,
  cultural, hiring_manager, take_home, final), the CHECKs
  `ck_timeline_events_interview_type` and `ck_timeline_events_offer_salary`,
  the indexes `ix_timeline_events_application_id`,
  `ix_timeline_events_user_id` and `ix_timeline_events_user_id_start_time`,
  and the partial unique index `uq_timeline_events_one_initial_screening` (at
  most one initial screening per application).
- KODI-010 Column `applications.finalized_at` (TIMESTAMPTZ, nullable), set to
  `feedback_date` 00:00 UTC for every finalized application.
- KODI-010 Columns `steps_definition.event_type` and
  `steps_definition.interview_type` (nullable), the step-to-event mapping:
  Initial Screen is interview/initial_screening, Phase 2-4 and every
  admin-created step are interview/unknown, Offer is offer, Denied is denied.
- KODI-010 Backfill of every `application_steps` row into `timeline_events`,
  keeping its id, date, times, timezone and observation. Only the earliest
  Initial Screen of an application keeps initial_screening. Offer events carry
  the application's `salary_offer`, or 0 when currency or period is missing
  (USD and monthly fill the gaps). The feedback name is appended to the
  terminal event's observation.
- KODI-010 Transitional triggers `trg_application_steps_sync` and
  `trg_applications_finalize_sync` that mirror old-code step writes and
  finalizations into `timeline_events` until the contract migration removes
  them. A trigger error never fails the write.
- KODI-010 PG enum `currency` gains CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD,
  MXN, ZAR and AED (20 values). PG enum `salaryperiod` gains `ANNUALLY`.
  Database only: the API enums are unchanged until KODI-011.
- KODI-011 Timeline routes: `GET/POST /applications/{id}/timeline` and
  `PUT/DELETE /applications/{id}/timeline/{event_id}`. An event is one of
  note, interview, feedback, offer, denied; `interview_type` is set on
  interviews only (default `unknown`, 422 elsewhere); an offer needs
  `salary_amount`, `salary_currency` and `salary_period` (monthly or
  annually) and every other type refuses them; start and end times come
  together, end after start; timezone up to 100, observation up to 5000
  characters. Ordered by `event_date`, `start_time` (nulls first),
  `created_at`. A second initial screening on one application is 409.
- KODI-011 `POST /applications/{id}/finalize` without a body closes the
  application (200, idempotent, sets `finalized_at`) and asks for no step,
  feedback or salary.
- KODI-011 `POST /applications/{id}/reopen` reopens a closed application
  (200, idempotent).
- KODI-011 `POST /applications/{id}/finalize` accepts an optional new body
  `{outcome?, event_date?, observation?, salary_amount?, salary_currency?,
  salary_period?}` (R-032, backend part; the UI is KODI-012): `outcome` is
  `offer` or `denied`, an offer requires the salary triad, a denial or no
  outcome refuses it, `event_date` defaults to today and cannot be in the
  future. It writes one timeline event of that outcome and `finalized_at`
  in the same transaction, answers 200 and never carries the `Deprecation`
  header. A body without an outcome (fields all absent or null) is the
  same idempotent close as no body at all.
- KODI-011 `finalized_at` on every `Application` response.
- KODI-011 Agenda items (`GET /users/me/agenda`) gain `event_type` and
  `interview_type`; they list timeline events.
- KODI-011 The API accepts the 11 currencies migration `afd4074c70c2` added
  (CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD, MXN, ZAR, AED): 20 in total.
- KODI-011 A `Deprecation: @1789430400` header (RFC 9745, deprecated since
  2026-09-15) on every answer of the deprecated routes, errors included. No
  `Sunset` header, no removal date.
- KODI-013 Migration `ad747aba90fc` (release C, the contract migration, R2).
  Ships with **no reconcile copy**: an `application_steps` row the R1
  trigger failed to sync during the switch-over and a row whose migrated
  event a Release B/C user later deleted are indistinguishable from the
  data alone (no column marks *when* R1's migration itself ran), so a
  reconcile keyed on any of them would resurrect deleted events — the
  common case — to catch a rare, already-logged trigger failure. Neither is
  copied into `timeline_events`; both stay fully intact under
  `application_steps_old`. See the revision's own docstring, "Reconcile
  design (why there is no reconcile)", for the full reasoning and the open
  question it flags to the owner (whether a follow-up should amend R1, which
  has not reached production, to record failed-sync ids). The two R1
  transitional triggers (`trg_application_steps_sync`,
  `trg_applications_finalize_sync`) and their functions are then dropped —
  nothing has written `application_steps` since Release B.
- KODI-013 (addendum, AC23) `GET /applications/statistics` gains `active:
  int` on `ApplicationsStatistics`: the current user's applications in the
  same scope/cycle filter as `total_applications` whose `finalized_at` is
  NULL — not closed, regardless of outcome. `applika-cli` does not call this
  route, so no CLI changelog entry.
- KODI-014 Migration `c8b3e9f4a1d6` (R3, folded into release A per the
  owner's choice, chained R1 -> R3 -> R2, expand only): PG enum
  `denied_reason` (unknown, not_good_enough, skills_mismatch,
  assessment_failed, too_many_candidates, position_filled, role_closed,
  ghosted, salary_mismatch, other) and nullable
  `timeline_events.denied_reason`, plus the CHECK
  `ck_timeline_events_denied_reason` (`denied_reason IS NOT NULL` iff
  `event_type = 'denied'`). Every existing `denied` event is backfilled from
  its application's legacy feedback name (Not good enough->not_good_enough,
  Skills->skills_mismatch, Assessment failed->assessment_failed, Too many
  candidates->too_many_candidates, Position filled->position_filled, Role
  closed->role_closed, Ghost->ghosted; anything else or no feedback->
  unknown). R1's transitional sync trigger functions are replaced (same
  names) so an old-code write during release A, including the whole A->B
  window before the owner runs `alembic upgrade head`, keeps satisfying the
  new CHECK. Database only: no application code reads or writes this column
  until KODI-014's backend part ships in release B.
- KODI-014 `denied_reason` (backend part, release B): `timeline_events` gains
  the mapped `denied_reason` column and `ck_timeline_events_denied_reason`
  CHECK in the ORM. `POST`/`PUT /applications/{id}/timeline` accept an
  optional `denied_reason` on `denied` events (default `unknown`, same
  pattern as `interview_type`); it is refused (422) on any other event type,
  and changing an event away from `denied` nulls it in the same request.
  `POST /applications/{id}/finalize`'s new optional outcome body gains
  `denied_reason`, only with `outcome=denied` (422 otherwise, default
  `unknown`); the closing denied event carries it, readable back through
  `GET /applications/{id}/timeline` (`TimelineEventOut.denied_reason`) — the
  finalize route's own response is `Application`, which does not gain a
  field. Legacy 0.1.4 paths: a `denied` event created through `/steps` gets
  `unknown`; the 0.1.4 finalize body maps the legacy feedback name to a
  reason with the same map R3's backfill uses
  (`use_cases/compat/legacy_finalize.LEGACY_FEEDBACK_TO_DENIED_REASON`,
  pinned equal to it). `applika-cli` 0.1.4 request/response shapes are
  otherwise unchanged. OpenAPI documents the `DeniedReason` enum (ten
  values). See `cli/CHANGELOG.md` for the CLI 0.2.0 `--reason` flag.
- KODI-016 Migration `af50c83911a7` (R4, folded into release A per the
  owner's choice, chained R1 -> R3 -> R4 -> R2, expand only): every
  non-interview `timeline_events` row has its `start_time`, `end_time` and
  `timezone` cleared, and the CHECK `ck_timeline_events_schedule_
  interview_only` (`event_type = 'interview' OR (start_time IS NULL AND
  end_time IS NULL AND timezone IS NULL)`) keeps it that way. The cleared
  originals are not lost for any event that started life as a step — they
  stay in `application_steps` and `downgrade()` restores them from there
  by id; a schedule on a Release-native event with no step counterpart is
  not recoverable on downgrade (owner: "you can remove the value in the
  database as well in case of problems"). The step sync trigger function
  `timeline_events_sync_application_step` is replaced (same name) so an
  old-code write during release A, including the whole A->B window before
  the owner runs `alembic upgrade head`, keeps satisfying the new CHECK;
  `timeline_events_sync_application_finalize` is untouched — it never
  writes a schedule. Database only: no application code reads or writes
  this CHECK differently until KODI-016's backend part ships.
- KODI-016 Schedule-interview-only (backend part): `timeline_events` gains
  `ck_timeline_events_schedule_interview_only` in the ORM
  (`TimelineEventModel.__table_args__`). `POST`/`PUT
  /applications/{id}/timeline` refuse (422) a non-null `start_time`,
  `end_time` or `timezone` on any event that is not `interview`, same
  pattern and same layering as `interview_type` (request schema
  `_TimelineEventWrite._validate_schedule_event_type`, then
  `use_cases/timeline_events/rules.normalize_event`, then the database
  CHECK); explicit nulls or absent keys are always accepted. Owner,
  verbatim: "if event type is different from interview, these attributes
  must be blocked". `TimelineEventOut` **omits** `start_time`, `end_time`
  and `timezone` from the response body entirely (not null — absent) when
  `event_type` is not `interview`, via a `model_serializer`, everywhere the
  schema is serialized (`GET`/`POST`/`PUT /timeline`); OpenAPI never listed
  the three as `required` (they already had defaults). Finalize outcome
  events (`POST /applications/{id}/finalize`) never carried a schedule and
  are unaffected. `GET /users/me/agenda` now returns interview events only
  — a non-interview event has nothing to schedule any more.
- KODI-016 Legacy `/applications/{id}/steps` (deprecated): a step whose
  mapped event is not an interview now has its `start_time`/`end_time`/
  `timezone` silently dropped before the timeline use case runs, so an
  installed `applika-cli` 0.1.4 client — which always sends the three
  fields — is never 422'd for it (`.claude/rules/cli-compatibility.md`).
  The response still carries the three keys, null, exact 0.1.4 shape
  (`LegacyStepDTO` does not use `TimelineEventOut`'s omitting serializer).

### Changed

- KODI-010 `application_steps.timezone` widened from 50 to 100 characters.
- KODI-013 `application_steps` renamed `application_steps_old`, with its
  primary key and its three foreign keys; `applications.last_step_id`,
  `last_step_date`, `feedback_id`, `feedback_date` and `salary_offer`
  renamed `*_old`, with their two foreign keys. `steps_definition` and
  `feedbacks_definition` keep their names — `/supports` still reads them,
  frozen, for installed CLIs. Nothing is dropped (rule: a retired object is
  renamed, never removed) and nothing under `app/` reads or writes any of
  it — the ORM has not mapped these objects since Release B (KODI-011).
- KODI-013 `salary_period` rows holding the legacy `ANNUAL` label are
  remapped to `ANNUALLY` on `applications`, `users` and `timeline_events`
  (decision (c), row remap; the PG enum label itself stays — Postgres
  cannot drop one). `downgrade()` remaps `ANNUALLY` back to `ANNUAL` on the
  same three tables, unconditionally: `SalaryPeriodType` already reads both
  labels as `annually`, so relabelling a Release-C-native `ANNUALLY` row on
  rollback loses no meaning.
- KODI-011 Application progress is read and written as timeline events;
  the code no longer reads `application_steps` nor the legacy
  `applications.last_step_id`, `last_step_date`, `feedback_id`,
  `feedback_date` and `salary_offer` columns (they stay in the database until
  the contract migration).
- KODI-011 Closing is reversible: an application is closed when
  `finalized_at` is set. Writes to a closed application's timeline are 409
  "Reopen the application to edit it (it is currently closed)"; an
  application archived in a cycle is 422 on every write, finalize and reopen,
  checked first. The CV-copy routes use the same guard (codes unchanged).
- KODI-011 The Offer step is no longer coupled to the Accepted feedback.
- KODI-011 Salary period `annual` is renamed `annually`. Every input that
  takes a salary period (applications, `/users/me`, the timeline) still
  accepts `annual` and stores `annually`; responses only say `annually`,
  also for rows that still hold the legacy `ANNUAL` label.
- KODI-011 `/applications/{id}/steps` runs on the timeline: a step maps to
  the event type and interview type of its definition and back; the ids of
  migrated steps are kept; an edit that resends the listed step keeps the
  event's type and salary; a second Initial Screen is 409; an offer step
  gets a 0 salary in the application's currency (USD) and period (monthly).
  The step date no longer has to follow the application date or the
  previous step.
- KODI-011 `/finalize` with the 0.1.4 body records the outcome as the
  timeline event of the mapped step, with `Feedback: <name>` appended to the
  observation and `finalized_at` = `finalize_date` 00:00 UTC. It still
  answers 201, 404 on an unknown or non-strict step or feedback, 409 when
  closed, 422 on a future date; `salary_offer` on a step that is not Offer is
  now 422.
- KODI-011 `Application.feedback` is always null; `last_step` is the latest
  timeline event shown as its legacy step; `salary_offer` is the latest
  offer event's amount; `finalized` is `finalized_at` set.
- KODI-011 `GET /applications/statistics`: offers and denials are the
  applications with at least one offer or denied event.
- KODI-011 `GET /applications/statistics/steps/conversion_rate` returns
  `[{event_type, interview_type, total_applications, conversion_rate}]` and
  `.../steps/avarage_days` returns `[{event_type, interview_type,
  average_days}]`, one row per stage (interview x 7 types, offer, denied),
  always in that order. The step-keyed `{id, name, color, ...}` rows are gone.
- KODI-011 New biweekly reports count initial screenings as applications
  with an interview of type `initial_screening` only; `interviews_completed
  _fortnight` counts interview events; offers are applications with an offer
  event; active processes are open applications past their initial
  screening. Submitted reports are never recomputed.
- KODI-011 Admin statistics: offers = applications with an offer event,
  denials = with a denied event, active = open, activity from timeline
  events.
- KODI-011 Deleting a cycle deletes its timeline events.

### Deprecated

- KODI-057 /auth/cli/start, /auth/cli/login/{login_id} and /auth/cli/exchange are marked deprecated in OpenAPI; they keep working for applika-cli 0.1.4 to 1.0.1 (ADR-0009).
- KODI-011 `GET/POST /applications/{id}/steps` and
  `PUT/DELETE /applications/{id}/steps/{step_id}` (marked deprecated in
  OpenAPI) and the `/finalize` request body; use the timeline routes,
  `/finalize` without a body and `/reopen`. They keep working for installed
  `applika-cli` versions, with no removal date.
- KODI-011 The step and feedback lists of `GET /supports` are frozen: served
  unchanged for installed CLIs, no longer editable.

### Removed

- KODI-011 Admin routes `/admin/step-definitions*` and
  `/admin/feedback-definitions*` (now 404): nobody can create, edit or
  delete a step or feedback definition any more.

### KODI-010 flag (Denied-with-salary)

A legacy finalize with a `Denied` step and a `salary_offer` kept that salary
only in `applications.salary_offer` — the timeline's offer `CHECK` refuses a
non-offer event from carrying a salary, and R1's backfill never invented an
offer event for a denied application. Migration `ad747aba90fc` does not
invent a new home for that value either: it moves, unedited, into
`applications.salary_offer_old` and stays exactly there. `downgrade()` never
overwrites a non-null `salary_offer` it restores, so the value survives
`alembic upgrade` -> `downgrade` -> `upgrade` untouched.

### Rollback note (Release B)

KODI-011 ships as code only, no migration: rolling back means redeploying
the pre-B image; migration `afd4074c70c2` stays. Known and accepted by the
owner: the pre-B image cannot read a row written in Release B with one of
the 11 new currencies, nor one with salary period `ANNUALLY` (it only knows
`ANNUAL`). `alembic downgrade d3f7b1c9e2a4` remaps `ANNUALLY` to `ANNUAL` on
`applications` and `users` but cannot remap a currency. Timeline events
written in Release B reach `application_steps`, where the pre-B image shows
them, only after that downgrade (it copies them back through the reverse
step map).

### Rollback note (Release C)

Rollback C: `alembic downgrade afd4074c70c2` + the Release B image.
`downgrade()` renames every retired object back, recreates the two
transitional sync triggers, folds any Release C write (new or edited
timeline event, a close or reopen) into `application_steps` and the legacy
`applications` columns through the same reverse map and recompute R1's own
downgrade uses, and remaps `ANNUALLY` back to `ANNUAL` on `applications`,
`users` and `timeline_events`. An `application_steps` row whose event was
deleted after the R2 upgrade is never deleted on rollback — it comes back
exactly as `application_steps_old` had it, visible to the Release B image
again, the same choice R1's own downgrade already made for a Release B
deletion.
