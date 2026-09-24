# Changelog

All notable changes to the Applika backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

- KODI-021 Biweekly report and user-feedback Discord webhook posts now
  mention the submitting user when their account holds a Discord connection
  (KODI-024's `discord_connections`, in any connection status, R-041); an
  unlinked user's post is byte-identical to before. No route contract
  change.
  - `DiscordService.post_report_message(message, mention_user_id=None)`:
    `allowed_mentions` is `{'parse': []}` when `mention_user_id` is `None`
    (unchanged), else `{'parse': [], 'users': [str(mention_user_id)]}` —
    never `everyone`, `roles`, or any user other than the submitter.
  - `SubmitReportUseCase.execute` and `SubmitFeedbackUseCase.execute` take an
    optional `discord_id`; the header line gains `<@discord_id>` after
    `@username` when linked. `presentation/api/reports.py` and
    `presentation/api/user_feedback.py` now read it fresh from
    `DiscordConnectionRepositoryDp` per request (KODI-024 - the connection
    replaced `users.discord_id`), so unlinking takes effect on the very next
    post.
  - Works with `DISCORD_CLIENT_ID`/`DISCORD_CLIENT_SECRET` unset: the mention
    only needs the connection row, not a configured Discord OAuth app.
  - No CLI changelog entry: no route, request or response field changes.

### Fixed

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
