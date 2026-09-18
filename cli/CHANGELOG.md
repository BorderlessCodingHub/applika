# Changelog

All notable changes to `applika-cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

### Deprecated

- KODI-011 `/applications/{id}/steps` and `/applications/{id}/steps/{step_id}`
  (all methods) and the step/feedback body of
  `POST /applications/{id}/finalize`: every answer carries
  `Deprecation: @1789430400` (RFC 9745; deprecated since 2026-09-15). No
  removal date: 0.1.4 keeps working.
- KODI-011 The `steps` and `feedbacks` lists of `GET /supports` are frozen:
  still returned, never edited again.

### Rollback note (Release B)

If the server is rolled back to the image before KODI-011, that image cannot
read a row written since KODI-011 with one of the 11 new currencies, nor one
with salary period `annually` (the owner accepted this). The server-side
`alembic downgrade d3f7b1c9e2a4` remaps `annually` back to `annual` but
cannot remap a currency, and it is what brings timeline events written since
KODI-011 back as steps.

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

### Changed

- KODI-013 The CLI's `Currency` enum grows from 9 to the 20 currencies of
  applika and mynextjob combined (CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD,
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
  application is closed (a closed application is reversible now, R-007);
  the 0.1.4 `applications steps *` / legacy `applications finalize` local
  "already been finalized" guards are unchanged.

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
