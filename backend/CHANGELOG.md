# Changelog

All notable changes to the Applika backend are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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

### Changed

- KODI-010 `application_steps.timezone` widened from 50 to 100 characters.
