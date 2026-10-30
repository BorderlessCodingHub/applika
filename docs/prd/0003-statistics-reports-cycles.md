---
PRD: 0003
title: Statistics, reports and cycles (as-built)
status: Draft
owner: LuisMSoares
created: 2026-09-15
---

# PRD 0003 — Statistics, reports and cycles (as-built)

What applika does today.

## Scope

- Routes: `backend/app/presentation/api/statistic.py`,
  `backend/app/presentation/api/reports.py`, `backend/app/presentation/api/cycle.py`.
- Tables: `cycles`, `quinzenal_reports`; reads `applications`, `application_steps`,
  `steps_definition`.
- Screens: `frontend/src/app/(protected)/dashboard/page.tsx`,
  `frontend/src/components/dashboard/`, `frontend/src/app/(protected)/reports/page.tsx`,
  `frontend/src/app/(protected)/reports/[day]/page.tsx`, `frontend/src/components/reports/`,
  `frontend/src/app/(protected)/cycles/page.tsx`, `frontend/src/components/layout/cycle-selector.tsx`,
  `frontend/src/contexts/cycle-context.tsx`.

## Requirements

### Statistics

- **R-001** `GET /applications/statistics` returns the user's general statistics.
  Offer counts match the step name `offer`.
  Proof: `backend/app/application/use_cases/user_stats/get_general_statistics.py`.
- **R-002** `GET /applications/statistics/steps/conversion_rate` returns conversion rates per step.
  Proof: `get_conversion_rate.py`.
- **R-003** `GET /applications/statistics/steps/avarage_days` returns average days per step.
  Proof: `get_step_avg_days.py`.
- **R-004** `GET /applications/statistics/platforms` returns applications per platform.
  Proof: `get_platform_stats.py`.
- **R-005** `GET /applications/statistics/mode` returns the active versus passive split.
  Proof: `get_mode_stats.py`.
- **R-006** `GET /applications/statistics/trends` returns daily trends for the last month.
  Proof: `get_last_month_trends_stats.py`.

All in `backend/app/application/use_cases/user_stats/`.

### Biweekly reports

- **R-007** Report days are 1, 14, 28, 42, 56, 70, 84, 98, 112 and 120. Phases are 1 to 4.
  Proof: `QuinzenalReportModel` check constraints in `backend/app/domain/models.py`.
- **R-008** `GET /reports` lists the user's reports. `GET /reports/{day}` returns one report.
  Proof: `backend/app/application/use_cases/quinzenal_reports/list_reports.py`, `get_report.py`.
  As-built note (2026-10-29, ADR-0024, PRD 0018 R-027, R-028): from Release B of plan 0018 every
  `/reports*` route is for Borderless BASE and PSP members only. No recorded badge (administrators
  included) → 403 `badge_required`; a badge that does not count while the Borderless access is
  expired → 403 `membership_unconfirmed`. Reports are never deleted and come back with the badge.
  The web hides the report section without a badge.
- **R-009** `POST /reports/{day}/submit` accepts only the next report day. Day 1 requires a
  `start_date` that is not in the future. A later day requires day 1. A day that has not been
  reached returns 403. A day already submitted returns 409.
  Proof: `backend/app/application/use_cases/quinzenal_reports/submit_report.py`.
- **R-010** Submit computes fortnight and accumulated metrics and stores them with the user's manual
  metrics (mock interviews, LinkedIn posts, strategic connections, biggest win, biggest challenge,
  next goal). Initial screenings match the step name `Initial Screen`.
  Proof: `submit_report.py`, `backend/app/domain/repositories/quinzenal_report_repository.py`.
- **R-011** Submit posts the report to the Discord reports webhook only if the user's stored GitHub
  token confirms organisation membership. `discord_posted` records the result.
  Proof: `submit_report.py`, `backend/app/application/services/discord_service.py`.
  As-built note (2026-09-25, ADR-0013): superseded by PRD 0009 R-039 from Release B of plan 0009.
  The single reports webhook and the organisation check are gone; a report posts to the
  admin-configured webhooks of the Discord servers the linked user is in (optionally limited by
  role). `discord_posted` still records the result.
  As-built note (2026-10-29, ADR-0024, PRD 0018 R-030): from Release B of plan 0018 a submitted
  report is saved first, then posted to every report webhook whose badges include a badge the
  author holds, each address once; the post carries the username and mentions nobody. The
  submission answers 201 whatever the webhooks answer. `discord_posted` still records the result.
- **R-012** A report is unique on (`user_id`, `report_day`, `cycle_id`), and unique on
  (`user_id`, `report_day`) where `cycle_id` is null.
  Proof: `QuinzenalReportModel`.

### Cycles

- **R-013** `POST /cycles` requires at least 10 current applications. It creates the cycle and
  archives the user's current applications and reports into it.
  Proof: `backend/app/application/use_cases/cycles/create_cycle.py`.
- **R-014** `GET /cycles` lists the user's cycles.
  Proof: `backend/app/application/use_cases/cycles/list_cycles.py`.
- **R-015** `DELETE /cycles/{id}` deletes only the user's own cycle, with its archived data.
  Another user's cycle returns 404.
  Proof: `backend/app/application/use_cases/cycles/delete_cycle.py`,
  `backend/app/domain/repositories/cycle_repository.py`.
- **R-016** Archived applications cannot be changed (PRD 0002, R-004).

## Tests

`backend/tests/integration/test_statistics.py`, `test_quinzenal_reports.py`,
`test_cycles.py`, `test_delete_cycle.py`, `test_past_cycle_data.py`;
`backend/tests/unit/test_*_stats.py`, `test_quinzenal_report*.py`.

## Open questions

- What replaces the hardcoded `'offer'` and `'Initial Screen'` names when steps become timeline
  events? PRD 0000, question 11.
