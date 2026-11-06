# Changelog

All notable changes to `applika-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- applications timeline add --keep-open: with --type offer or denied, adds the event and keeps the application open; ignored with --type interview.
- daily auto update: at most once a day, after a command finishes, applika-cli checks PyPI and installs a newer release with the tool it was installed with (uv tool, pipx or pip), then prints "Updated applika-cli <old> → <new>" on stderr. It stays off when the API base URL is not https://applika.dev/api (flag, APPLIKA_API_BASE_URL or saved session), when APPLIKA_DISABLE_AUTOUPDATE is set, outside an interactive terminal (CI, pipes, AI agents) and for source or editable installs. A failed check or install prints nothing and never changes the command's exit status.
- applika update [--force]: checks PyPI now and installs the latest applika-cli with the tool it was installed with, in a terminal, in CI, in a pipe or from an AI agent. It lists every reason it refuses: an API base URL other than https://applika.dev/api (with where it comes from and the way back, --force or not), a source or editable install, an install it cannot identify, or APPLIKA_DISABLE_AUTOUPDATE (lifted by --force, the only thing --force does).

### Changed

- `applika login` (every version) completes on applika's Borderless sign-in page: the browser opens it instead of GitHub, and the user signs in with the Borderless email and password. Every user signs in again once at this backend release.
- GET /users/me adds `badges`, `borderless` and `github_restore`; `github_id` may be null. `username`, `first_name`, `last_name` and `email` are unchanged.
- help text: `applika login` says it signs in with Borderless.
- applications timeline add --type offer|denied closes the application with that event (POST /applications/{id}/finalize outcome body); --keep-open keeps it open; ignored with --type interview.
- the API refuses event_type note and feedback (422); existing ones read as interview with interview_type unknown. 0.1.4 is unaffected: its steps keep their ids.
- cvs *, applications cv * and drafts answer 404 without the "cvs" beta feature.

### Removed

- GET /users/me no longer returns `discord` and `discord_linked` (Discord linking is removed).
- applications timeline add and edit no longer take --type note or --type feedback; existing ones read as interview with interview_type unknown.

### Fixed

- README: the `--api-base-url` example points at a local API instead of a staging host that does not exist, and a duplicated `steps delete` example is gone.

## [1.1.0] - 2026-10-15

### Added

- KODI-060 `applika login` signs in through a browser authorization protected by PKCE (S256) on `GET /auth/cli/authorize`, back on a local `127.0.0.1` callback, then `POST /auth/token` (`authorization_code` grant). The CLI gets a session of its own, listed in the web profile's Devices tab; it no longer calls `/auth/cli/start` or `/auth/cli/exchange`.
- KODI-060 `applika login --manual`: for a browser that cannot reach the local callback, the browser shows `code#state` and the CLI prompts for it (`redirect_uri=oob`); the state is checked before the exchange.
- KODI-060 `applika login --device`: device code sign-in (RFC 8628) for machines without a browser. The CLI prints a short code and a web address, and polls `POST /auth/token` until the code is approved or denied in a signed-in browser, or expires.
- KODI-060 `applika login --device-name TEXT` names the device (at most 100 characters); the default is the machine's host name. `--device` and `--manual` together, a blank name or a longer one are usage errors (exit 2).
- KODI-060 login ends the stored session on the server first (`POST /auth/revoke`) and prints `Logged in as <username> on <device_name>`.
- KODI-060 every request sends `User-Agent: applika-cli/<version> (<OS>)`.
- KODI-057 new routes for applika-cli 1.1.0 (KODI-060): `GET /auth/cli/authorize` (PKCE S256, loopback or `oob`), `POST /auth/token` (authorization_code, refresh_token, device_code grants; `Authorization: Bearer` access token), `POST /auth/revoke` (204 for any value), `POST /auth/device/code`. Each answers 503 `{"detail": "Session service unavailable"}` + `Retry-After: 5` when the server's Redis cannot be reached, `POST /auth/revoke` included (fail closed: a 204 would claim the session ended).

### Changed

- KODI-060 the access token goes in `Authorization: Bearer`; the CLI no longer sends nor stores cookies. The session refreshes through `POST /auth/token` (`refresh_token` grant) instead of `GET /auth/refresh`. `~/.config/applika/session.json` keeps its four keys, so an older CLI can still read a 1.1.0 file and a 1.1.0 CLI reads a 1.0.1 file.
- KODI-060 `applika logout` ends the session on the server (`POST /auth/revoke`) before clearing it locally. If the server answers 429 or 503, or cannot be reached, the local session is kept and logout exits 1: run it again later or revoke the device in the web profile's Devices tab.
- KODI-060 fail closed: a 429 or 503 on the session refresh, and a 503 on any route, keep the stored session and print the server's message with the `Retry-After` wait; any other refused refresh clears it.
- KODI-057 every user signs in again at the release that ships device sessions (ADR-0019): a session stored by 0.1.4, 0.2.0, 1.0.0 or 1.0.1 is refused with 401, and these versions print "Please run `applika login` again".
- KODI-057 the access token now carries `sid` (the session id); the values `POST /auth/cli/exchange` returns keep their JSON shape (the refresh value is a UUIDv7). Each CLI sign-in is a device of its own, listed in the web profile's Devices tab and revocable there.
- KODI-057 a session ends 7 days after its last refresh; `GET /auth/refresh` slides it and re-sets `__refresh` (same value, full Max-Age) next to `__access`.
- KODI-057 new 401 `{"detail": "Session expired"}` on every authenticated route when the session was revoked, signed out or expired.
- KODI-057 new 503 `{"detail": "Session service unavailable"}` + `Retry-After: 5` on every authenticated route when the server's Redis cannot be reached. 0.1.4, 0.2.0, 1.0.0 and 1.0.1 print it and keep the session; a 503 on `GET /auth/refresh` (an access token that expires during the outage) still clears it, as any failed refresh does.
- KODI-052 POST /applications/{id}/cv with tailoring "keywords" needs the "jobs" beta feature, else 422 "Unknown tailoring option". No CLI version sends it; 0.1.4, 0.2.0, 1.0.0 and 1.0.1 are unaffected.
- KODI-045 POST /applications/{id}/cv accepts an optional tailoring field; without it the copy stays verbatim, so 0.1.4, 0.2.0, 1.0.0 and 1.0.1 are unaffected. A copy made with "keywords" in the web carries non-empty adjustments (a read-only key). New GET /applications/{id}/cv/fit.

### Deprecated

- KODI-057 `/auth/cli/start`, `/auth/cli/login/{login_id}` and `/auth/cli/exchange` are deprecated in OpenAPI; their request and response shapes are unchanged and 0.1.4, 0.2.0, 1.0.0 and 1.0.1 keep using them.

## [1.0.1] - 2026-09-27

### Changed

- KODI-039 every route may answer 429 `{detail}` + `Retry-After` +
  `X-RateLimit-*`; no route or field change. 0.1.4, 0.2.0 and 1.0.0 print
  the `detail` and fail, and work again after the wait; a 429 on the
  automatic session refresh clears the stored session in these versions
  (`lib/api.py` `_refresh`) - run `applika login` again. Settled by the
  owner on 2026-09-27: fixed in 1.0.1 (K6), which keeps the session.
- KODI-031 `GET /companies` and `GET /supports` now list only the public
  companies/platforms plus the caller's own private ones (previously every
  row); both add an `is_public` field, and a `/supports` platform's `url`
  can now be `null`. A company or platform the CLI creates through
  `POST /applications` (inline `{name, url}`) is now **private** to that
  user until an admin publishes it, instead of immediately shared; a known
  `{name, url}` match now **reuses** the existing visible company instead
  of racing a 409 on the old global unique index. An invisible (someone
  else's private) `platform_id` or company id on `POST /applications` /
  `PUT /applications/{id}` is a 404 instead of succeeding. The CLI reads
  only `id`/`name`/`url` off these dicts today and never reads a platform's
  `url`, so no command changes; 0.1.4, 0.2.0 and 1.0.0 are all unaffected.

- KODI-020 `GET/PATCH /users/me` now also returns a `discord_linked: bool`
  field (whether the profile has a Discord account connected). Additive,
  no CLI command reads it: `whoami` (`applika/cli/src/applika/commands/
  auth.py`) reads `username`/`first_name`/`last_name`/`email` off the
  response dict and ignores unknown keys, so 0.1.4, 0.2.0 and 1.0.0 are all
  unaffected. Corrected by KODI-024 below: `discord_linked` stays, but the
  Discord id was never a field and still is not one.
- KODI-024 `GET|PATCH /users/me` also return `discord {username,
  global_name, avatar_url, status}` or `null`; additive; `discord_linked`
  kept; 0.1.4, 0.2.0, 1.0.0 unaffected.

### Fixed

- KODI-040 a session refresh refused with 429 keeps the stored session; the
  command fails with the server's retry message (no wait, no retry). Every
  other refresh failure still ends the session. 0.1.4, 0.2.0 and 1.0.0 are
  unchanged and still log out.

## [1.0.0] - 2026-09-23

Master CV and application-CV-copy commands, `--file` input everywhere, and
the first published major. No command and no flag of 0.1.4 / 0.2.0 was
removed or changed (`.claude/rules/cli-compatibility.md`); 0.x scripts keep
working unchanged.

### Added

- KODI-018 `applika cvs list` lists your master CVs:
  `--output table|json|yaml|md` (`md` is a Markdown table of id, name,
  headline, updated). `GET /base-cvs`.
- KODI-018 `applika cvs get <cv-id>` shows one master CV:
  `--output text|json|yaml|md`. `GET /base-cvs/{id}`.
- KODI-018 `applika cvs create` creates a master CV (max 3 per user; the
  API's 409 is printed): `--file <path>` (required), `--name <text>`
  (required unless the file carries `name`), `--output text|json|yaml|md`.
  `POST /base-cvs`.
- KODI-018 `applika cvs edit <cv-id>` edits a master CV: `--file <path>`
  and/or `--name <text>` (at least one), `--output text|json|yaml|md`.
  Partial: a section present in the file replaces that whole section, an
  absent key is left unchanged. `PATCH /base-cvs/{id}`.
- KODI-018 `applika cvs delete <cv-id>`: `--yes` skips the confirmation.
  `DELETE /base-cvs/{id}`. Existing copies keep their content.
- KODI-018 `applika cvs download <cv-id>`: `--type pdf|md` (required),
  `--dir <path>`, `--filename <name>`, `--force`.
  `POST /base-cvs/{id}/pdf` or `GET /base-cvs/{id}/markdown`.
- KODI-018 `applika applications cv get <application-id>`:
  `--output text|json|yaml|md`. `GET /applications/{id}/cv`.
- KODI-018 `applika applications cv create <application-id>` copies a master
  CV into an application and applies the edits in the same command:
  `--from <cv-id>` (required), `--file <path>`, `--name <text>`,
  `--output text|json|yaml|md`. `POST /applications/{id}/cv` followed, only
  when `--file` or `--name` is given, by `PUT /applications/{id}/cv`.
- KODI-018 `applika applications cv edit <application-id>`: `--file <path>`
  and/or `--name <text>` (at least one), `--output text|json|yaml|md`. The
  API's `PUT` is a full replace, so the CLI reads the copy, applies the
  file's keys and sends the whole document.
- KODI-018 `applika applications cv delete <application-id>`: `--yes`.
  `DELETE /applications/{id}/cv`.
- KODI-018 `applika applications cv download <application-id>`:
  `--type pdf|md` (required), `--dir`, `--filename`, `--force`.
- KODI-018 `applika applications cv diff <application-id>` downloads the
  diff between the copy and the master CV it came from: `--type pdf|md`
  (required), `--dir`, `--filename`, `--force`, and `--print` (with
  `--type md`: print to stdout instead of writing a file). A copy with no
  baseline answers 409 and is shown as "nothing to compare against".
- KODI-018 `--file` accepts JSON (`.json`) or YAML (`.yaml`/`.yml`), picked
  by the extension; `-` reads JSON or YAML from stdin. Its keys are the API
  field names and it is validated locally — types, required fields, lengths,
  `YYYY-MM` dates, an `end` earlier than its `start`, and unknown keys —
  before anything is sent.
- KODI-018 `get --output json` / `--output yaml` prints a document `--file`
  accepts: the server-only keys (`id`, `created_at`, `updated_at`,
  `application_id`, `base_cv_id`, `was_ai_generated`, `adjustments`,
  `base_snapshot`) are accepted and ignored on input, so export → edit →
  `edit --file` round-trips for both a master CV and a copy.
- KODI-018 Section items (`links`, `skills`, `experience`, `projects`,
  `education`, `certifications`, `languages`) need a client `id`; ids missing
  from the file are generated, ids already present are kept, so the web diff
  keeps matching items.
- KODI-018 `applications new --file <path>` takes the whole create payload
  (API field names) instead of the named options, and
  `applications edit <id> --file <path>` updates the keys present and leaves
  the rest unchanged. Both are mutually exclusive with the named options.
  `company` may be a company id, a company name (resolved through
  `/companies`, like `--company`) or `{"name": …, "url": …}`.
- KODI-018 `applications new|edit --job-description <text>` and
  `--job-description-file <path>` (plain text / Markdown) set the
  application's `job_description`; it is also accepted as the
  `job_description` key in `--file`. On `edit`, `--job-description ""`
  clears it, and the key is never sent when neither option nor file key was
  given — the API's `job_description` is sticky on `PUT`.
- KODI-018 `pyyaml` is a runtime dependency (`--file` reads YAML).
- KODI-011 The API accepts 11 more salary currencies: CNY, SEK, NOK, DKK,
  PLN, SGD, HKD, NZD, MXN, ZAR, AED (20 in total). A 0.1.4 CLI only offers
  its 9 on input, but may now receive the new ones in `currency` from
  applications created in the web app; listing and viewing such an
  application still works, `applications edit` does not (see Known
  limitations under Changed).
- KODI-011 `Application` responses carry `finalized_at` (null when open).
  0.1.4 ignores it.
- KODI-011 New API routes a future CLI can use: the application timeline
  (`GET/POST /applications/{id}/timeline`,
  `PUT/DELETE /applications/{id}/timeline/{event_id}`),
  `POST /applications/{id}/finalize` without a body (200, idempotent) and
  `POST /applications/{id}/reopen`.
- KODI-011 `POST /applications/{id}/finalize` also accepts a new optional
  body `{outcome?: "offer"|"denied", event_date?, observation?,
  salary_amount?, salary_currency?, salary_period?}`: an offer requires
  the salary triad, and its `salary_period` must be `monthly` or
  `annually` (`hourly` is a 422, same restriction as the timeline body); a
  denial or no outcome refuses the salary fields entirely. 200, no
  `Deprecation` header. 0.1.4 never sends it; a future CLI can finalize
  with the outcome in one call instead of a `/timeline` POST followed by a
  bodyless finalize.

### Changed

- KODI-018 `applications new`'s `--company`, `--role`, `--platform`,
  `--mode` and `--date` are no longer Typer-required, because `--file` can
  supply them instead. Every invocation that already worked behaves
  identically; an invocation missing one of the five still fails with exit
  code 2, now with a message naming the missing options and pointing at
  `--file`.
- KODI-018 The CLI's exit codes are explicit on the CV and `--file` paths:
  1 for an API error (the API's `detail` is printed), 2 for a usage or
  file-validation error (nothing was sent).
- KODI-018 The CLI's vendored `Application` create/update payload carries
  `job_description`. It is only put on the wire when the caller asked for
  it, so the bytes a 0.1.4/0.2.0-style invocation sends are unchanged.
- KODI-011 Salary period `annual` is renamed `annually`. The API still
  accepts `annual` (what 0.1.4 sends) on applications and `/users/me`, but
  every response now says `annually`: `salary_period` read by 0.1.4 is
  `annually` where it used to be `annual`.
- KODI-011 **Known limitation of 0.1.4**: `applications edit` fails locally
  on an application whose `salary_period` is `annually` or whose
  `currency` is one of the 11 currencies this release adds (CNY, SEK, NOK,
  DKK, PLN, SGD, HKD, NZD, MXN, ZAR, AED). `edit` pre-fills its update
  payload from the fetched application and validates it against 0.1.4's own
  `Currency` (9 values) and `SalaryPeriod` (`hourly`/`monthly`/`annual`)
  enums before sending the request, so the value never reaches the API —
  0.1.4 rejects it client-side. `applications list` and `applications new`
  are unaffected. Accepted by the owner as an exception to
  `.claude/rules/cli-compatibility.md` rule 1 (never break a field a
  published CLI version uses): fixed by upgrading to `applika-cli` 0.2.0,
  released together with this API.
- KODI-011 Finalize is reversible on the server: an application can be
  reopened (web app or a future CLI) and then edited or finalized again.
- KODI-011 `Application.feedback` is always null. `last_step` is the latest
  timeline event, shown as a step (id, name, color, date); `salary_offer` is
  the latest offer's amount; `finalized` is still a boolean.
- KODI-011 `applications steps list` shows every timeline event as a step:
  notes, feedback and interviews of any type other than initial screening
  appear as "Phase 2", initial screening as "Initial Screen", offers as
  "Offer", denied as "Denied". Ids of existing steps are unchanged.
- KODI-011 `applications steps add` maps the chosen step to a timeline
  event; a second "Initial Screen" on one application is refused (409). The
  added step is returned with the step that was chosen.
- KODI-011 `applications steps edit` without `--step` keeps the event's own
  type (a note stays a note, an offer keeps its salary); with `--step` the
  event takes that step's type. Steps of a closed application are refused
  with 409 "Reopen the application to edit it (it is currently closed)",
  and an archived one with 422, as before.
- KODI-011 The step date no longer has to follow the application date or
  the previous step.
- KODI-011 `applications finalize` (the step/feedback body) now refuses
  `--salary` when the step is not Offer (422); it still answers 201 and
  refuses an already finalized application with 409. The feedback name is
  kept in the outcome's observation.
- KODI-011 `GET /applications/statistics/steps/conversion_rate` and
  `.../steps/avarage_days` return one row per stage
  (`{event_type, interview_type, ...}`) instead of one per step definition
  (`{id, name, color, ...}`). 0.1.4 does not call them.
- KODI-011 Rollback (Release B): if the server is rolled back to the image
  before KODI-011, that image cannot read a row written since KODI-011 with
  one of the 11 new currencies, nor one with salary period `annually` (the
  owner accepted this). The server-side `alembic downgrade d3f7b1c9e2a4`
  remaps `annually` back to `annual` but cannot remap a currency, and it is
  what brings timeline events written since KODI-011 back as steps.
- KODI-016 The deprecated `POST/PUT /applications/{id}/steps*` route now
  silently stores `null` for `start_time`/`end_time`/`timezone` when the
  step maps to a non-`interview` timeline event, instead of the value the
  0.1.4 request body sent — still 200/201, never 422. The `/steps`
  response keeps 0.1.4's exact shape (the keys are always present), just
  `null` where a schedule was sent on a non-interview step.
  `applications steps add|edit` in this CLI are unaffected: they still
  send whatever `--start-time`/`--end-time`/`--timezone` the caller gives,
  with no client-side type restriction (`.claude/rules/cli-compatibility.md`).

### Deprecated

- KODI-011 `/applications/{id}/steps` and `/applications/{id}/steps/{step_id}`
  (all methods) and the step/feedback body of
  `POST /applications/{id}/finalize`: every answer carries
  `Deprecation: @1789430400` (RFC 9745; deprecated since 2026-09-15). No
  removal date: 0.1.4 keeps working.
- KODI-011 The `steps` and `feedbacks` lists of `GET /supports` are frozen:
  still returned, never edited again.

## [0.2.0]

### Added

- KODI-013 `applications timeline list <application-id>` lists an
  application's timeline events (table or `--output-format json`), in the
  API's own order (`event_date`, `start_time`, `created_at`).
- KODI-013 `applications timeline add <application-id>` adds an event:
  `--type` (`note`/`interview`/`feedback`/`offer`/`denied`, required),
  `--date` (required), `--interview-type` (only with `--type interview`,
  defaults to `unknown`), `--start-time`/`--end-time` (together),
  `--timezone`, `--observation`, and `--salary`/`--currency`/`--period`
  (only with `--type offer`, then all three required, `--period` restricted
  to `monthly`/`annually`).
- KODI-013 `applications timeline edit <application-id> <event-id>` replaces
  an event (the API's `PUT` is a full body): unspecified flags keep the
  event's current value. Changing `--type` away from `offer` drops the
  salary fields; away from `interview` drops the interview type; to
  `interview` without `--interview-type` defaults to `unknown`; to `offer`
  requires the salary triad unless the event already had one.
- KODI-013 `applications timeline delete <application-id> <event-id>`
  deletes an event.
- KODI-013 `applications finalize` accepts `--outcome offer|denied` plus
  `--date`, `--observation` and, for `offer`, `--salary`/`--currency`/
  `--period`. No flags at all is the same idempotent close as before
  (bodyless — the CLI never sends `{}` either).
- KODI-013 `applications reopen [<application-id>]` reopens a closed
  application (idempotent).
- KODI-013 `Application` responses' `finalized_at` is now typed in
  `ApplicationEntry` and included whenever a response is passed through
  raw, e.g. `applications list --output-format json`; no command surfaces
  it as its own flag yet.
- KODI-013 `EventType` and `InterviewType` vendored in `schemas/enums.py`,
  matching `applika/backend/app/core/enums.py`.
- KODI-014 `applications timeline add|edit --reason <value>` sets the denied
  reason on a `denied` event: valid only with `--type denied` (`add`) or
  when the event is or becomes `denied` (`edit`, where unspecified
  `--reason` preserves the event's current reason and changing `--type`
  away from `denied` drops it, the same PUT-is-a-full-replace pattern as
  `--interview-type`); defaults to `unknown` when omitted on a `denied`
  event. `applications finalize --outcome denied --reason <value>` does the
  same for the closing event; only valid with `--outcome denied`, refused
  with `--outcome offer`, with no `--outcome`, or with the deprecated
  `--step` body. Ten values: `unknown`, `not_good_enough`,
  `skills_mismatch`, `assessment_failed`, `too_many_candidates`,
  `position_filled`, `role_closed`, `ghosted`, `salary_mismatch`, `other`
  (English labels shown by `timeline list`/`add`/`edit`: Unknown, Not good
  enough, Skills mismatch, Assessment failed, Too many candidates, Position
  filled, Role closed, Ghosted, Salary mismatch, Other). `DeniedReason`
  vendored in `schemas/enums.py`, matching
  `applika/backend/app/core/enums.py`.
- KODI-014 Backend contract change this CLI consumes: `TimelineEvent`
  responses gain `denied_reason: <value>|null` (non-null iff `event_type`
  is `denied`); `POST/PUT .../timeline` and `POST .../finalize` (body
  `outcome: "denied"`) accept an optional `denied_reason`, defaulting to
  `unknown` when the event/outcome is `denied` and omitted, and answering
  422 when set on anything else — same pattern as `interview_type` on a
  non-interview. The CLI tolerates a response without `denied_reason` at
  all (an older API). Legacy 0.1.4 paths (`/steps*`, the legacy finalize
  body) are unaffected: a denied event they create gets `unknown`, or, for
  the legacy finalize body, the old feedback name mapped to a reason
  server-side; 0.1.4 request/response shapes do not change, and
  `applika-cli` 0.1.4 never sees this field.

### Changed

- KODI-013 The CLI's `Currency` enum grows from 9 to 20 currencies
  (CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD,
  MXN, ZAR, AED added), same order as the backend.
  `applications new`/`edit --currency` now offer all 20.
  `applications timeline add|edit --currency` and
  `applications finalize --currency` offer the same 20.
- KODI-013 `annually` is the preferred salary period spelling everywhere.
  `applications new`/`edit --salary-period` still accepts `annual` (the
  spelling `applika-cli` 0.1.4 sent) and sends it as-is — the API reads it
  as `annually` — and now also accepts `annually` directly, so
  `applications edit` can round-trip an application the API already
  reports as `annually`. A new, stricter `OfferPeriod` choice
  (`monthly`/`annually` only — no `hourly`, no `annual`) backs
  `applications timeline add|edit --period` and
  `applications finalize --period`, matching the API's offer restriction
  (`hourly` is a 422 on an offer); those flags never accept or send
  `annual`.
- KODI-013 `applications finalize --step`, `--feedback` and
  `--salary-offer` are deprecated (help text says so) but still work
  exactly as in 0.1.4, sending the same legacy body. They cannot be
  combined with `--outcome`/`--salary`/`--currency`/`--period`; combining
  them is refused client-side before any request is made.
- KODI-013 `applications steps *` still work unchanged; the `steps` sub-app
  and each of its commands now say `[DEPRECATED]` in their help text and
  point at `applications timeline`.
- KODI-013 A `409` from the timeline/finalize/reopen routes prints the
  API's message plus a hint to run `applications reopen` when the
  application is closed (a closed application can be reopened now);
  the 0.1.4 `applications steps *` / legacy `applications finalize` local
  "already been finalized" guards are unchanged.
- KODI-016 `applications timeline add|edit --start-time`/`--end-time`/
  `--timezone` are now valid only with `--type interview` (`add`) or when
  the resulting type — the `--type` given, else the event's current type —
  is `interview` (`edit`); refused client-side before any write request
  is sent, same `--interview-type`/`--reason` pattern. `edit` never re-sends
  a stored schedule once the resulting type is not `interview`: the `PUT`
  is a full replace, so those three fields go out `null`, even if the
  event being edited already has a schedule (including a legacy one from
  before this rule existed). Interview `add`/`edit` behaviour is
  unchanged.
- KODI-016 Backend contract change this CLI consumes: `POST/PUT
  .../timeline[/{event_id}]` now answer 422 if `start_time`/`end_time`/
  `timezone` are set on anything other than an `interview` event
  (`ck_timeline_events_schedule_interview_only`, same mechanism as
  `interview_type`). `TimelineEvent` responses (list, add, edit) now omit
  the three keys entirely — not `null` — when `event_type` is not
  `interview`. `TimelineEventEntry` marks them optional and every read in
  this CLI already goes through `.get()`, so a response missing the keys
  renders the same `-` it showed for `null`; no `KeyError`.

### Deprecated

- KODI-013 `applications steps list|add|edit|delete`: use
  `applications timeline list|add|edit|delete` instead.
- KODI-013 `applications finalize --step`, `--feedback` and
  `--salary-offer`: use `--outcome`, `--salary`, `--currency` and
  `--period` instead.

### Fixed

- KODI-013 The 0.1.4 `applications edit` failure on an application whose
  `salary_period` is `annually` or whose `currency` is one of the 11
  currencies KODI-011 added (CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD, MXN,
  ZAR, AED) is fixed by upgrading to `applika-cli` 0.2.0: both values now
  parse, so `edit` can fetch, merge and resend such an application.
- KODI-013 (remediation round 1) `applications finalize` (bodyless and
  `--outcome`) no longer prints `Application.last_step` as the "final
  step" — it is the *latest-dated* timeline event, not the closing one, so
  a future-dated interview added before closing could sort after the
  outcome and print as the result (e.g. `final_step=Initial Screen ...
  date=2026-09-22` after closing with `--outcome denied`). It now prints
  `status=open|closed` and `finalized_at`, and for `--outcome` the outcome
  the request itself carried. `applications reopen` gets the same
  `status=`/`finalized_at=` output in place of the `date=<application_date>`
  it used to print. The deprecated `--step` finalize body's output is
  unchanged — it still prints `final_step=`/`feedback=`, pinned exactly as
  0.1.4 had
  it.
