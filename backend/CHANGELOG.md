# Changelog

All notable changes to the Applika backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- KODI-011 `GET /users/me/agenda` now honours `to_date`. `from_date` and
  `to_date` shared one `Query(None)` default object, so FastAPI resolved
  both parameters from the first one's query key and the window silently
  collapsed to `from_date`-only, one day when both were sent explicitly.
  Each parameter now gets its own `Query(None)` instance.

### Added

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
- KODI-011 `finalized_at` on every `Application` response.
- KODI-011 Agenda items (`GET /users/me/agenda`) gain `event_type` and
  `interview_type`; they list timeline events.
- KODI-011 The API accepts the 11 currencies migration `afd4074c70c2` added
  (CNY, SEK, NOK, DKK, PLN, SGD, HKD, NZD, MXN, ZAR, AED): 20 in total.
- KODI-011 A `Deprecation: @1789430400` header (RFC 9745, deprecated since
  2026-09-15) on every answer of the deprecated routes, errors included. No
  `Sunset` header, no removal date.

### Changed

- KODI-010 `application_steps.timezone` widened from 50 to 100 characters.
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
