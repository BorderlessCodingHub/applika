---
PRD: 0002
title: Applications, steps and finalize (as-built)
status: Draft
owner: LuisMSoares
created: 2026-09-15
---

# PRD 0002 — Applications, steps and finalize (as-built)

What applika does today. The timeline feature replaces this model under ADR-0005, ADR-0007 and
ADR-0009.

## Scope

- Routes: `backend/app/presentation/api/application.py`,
  `backend/app/presentation/api/application_step.py`.
- Tables: `applications`, `application_steps`, `steps_definition`, `feedbacks_definition`,
  `platforms`, `companies` (`backend/app/domain/models.py`).
- Screens: `frontend/src/app/(protected)/applications/page.tsx`,
  `frontend/src/components/applications/` (`application-item.tsx`,
  `application-form-sheet.tsx`, `finalize-dialog.tsx`, `step-form-dialog.tsx`,
  `timezone-combo-box.tsx`, `company-select.tsx`), `frontend/src/hooks/use-application-steps.ts`.

## Requirements

### Applications

- **R-001** `POST /applications` creates an application for the signed-in user with platform,
  company name or company id, role, mode (`active` or `passive`), application date and optional
  salary, currency, period, experience level, work mode, country, link and observation.
  Proof: `backend/app/application/use_cases/applications/create_application.py`.
  As-built note (2026-09-26, ADR-0014, PRD 0010, Release B): the company and the platform must be
  visible to the caller (public, or private and added by the caller); another user's private row
  is a 404 (`ensure_platform_visible`, `resolve_company` in
  `backend/app/application/use_cases/catalog/resolve.py`). A company sent as `{name, url}`
  reuses a visible match (case-insensitive name, normalised URL); otherwise it is created private
  to the caller.
- **R-002** `GET /applications` lists the signed-in user's applications.
  Proof: `backend/app/application/use_cases/applications/list_applications.py`.
  As-built note (2026-09-26, ADR-0014, PRD 0010, Release B): draft applications
  (`applications.is_draft`) are never listed here, nor in statistics, reports, cycles, the agenda or
  admin stats. They live under `/applications/drafts` (web only). The web shows them only in the
  Drafts tab of the applications page.
- **R-003** `PUT /applications/{id}` and `DELETE /applications/{id}` act only on the signed-in
  user's application. Another user's application returns 404.
  Proof: `update_application.py`, `delete_application.py` in
  `backend/app/application/use_cases/applications/`.
- **R-004** An application with `cycle_id` set is archived. Update, delete, step changes and
  finalize are rejected with a business-rule violation.
  Proof: `update_application.py`, `delete_application.py`, `finalize_application.py`,
  `backend/app/application/use_cases/application_steps/create_application_step.py`.
- **R-005** `applications.link_to_job` is `VARCHAR(2083)`. Salary columns are `NUMERIC(10,2)`.
  Proof: `backend/app/domain/models.py`.

### Steps

- **R-006** `GET/POST /applications/{id}/steps` and `PUT/DELETE /applications/{id}/steps/{step_id}`
  manage an application's steps. Each step has a step definition, date, optional start time,
  end time, timezone and observation.
  Proof: `backend/app/presentation/api/application_step.py`,
  migration `a1b2c3d4e5f7_add_time_fields_to_application_steps.py`.
- **R-007** A step added through the steps routes must use a non-strict step definition.
  Proof: `create_application_step.py`.
- **R-008** A step date is not earlier than the application date and not earlier than the
  previous step. On update it is also not later than the next step.
  Proof: `create_application_step.py`, `update_application_step.py`.
- **R-009** Steps of a finalized application cannot be created, updated or deleted (409).
  Proof: `create_application_step.py`, `update_application_step.py`, `delete_application_step.py`.
- **R-010** Step types come from `steps_definition` (name, color, strict), editable by admins.
  Seeded: Initial Screen, Phase 2, Phase 3, Phase 4, Offer (strict), Denied (strict).
  Proof: `StepDefinitionModel`, migration `83243abba58d_strict_step_definition.py`.

### Finalize

- **R-011** `POST /applications/{id}/finalize` takes `step_id` (strict), `feedback_id`,
  `finalize_date`, optional `salary_offer` and optional `observation`.
  Proof: `backend/app/application/use_cases/applications/finalize_application.py`.
- **R-012** Finalize inserts a final step row and sets `last_step_id`, `last_step_date`,
  `feedback_id`, `feedback_date` and `salary_offer`.
  Proof: `finalize_application.py`.
- **R-013** Finalize is irreversible. A second finalize returns 409. An application is finalized
  when `feedback_id` is set.
  Proof: `finalize_application.py`, `ApplicationModel.finalized`.
- **R-014** Feedback "Accepted" requires step "Offer", and step "Offer" requires feedback
  "Accepted". Names are compared case-insensitively.
  Proof: `finalize_application.py` (`OFFER_STEP_NAME`, `ACCEPTED_FEEDBACK_NAME`).
- **R-015** `salary_offer` is accepted only for Offer with Accepted.
  Proof: `finalize_application.py`.
- **R-016** `finalize_date` cannot be in the future.
  Proof: `finalize_application.py` (`ensure_not_in_future`).
- **R-017** Outcomes come from `feedbacks_definition` (name, color), editable by admins. Seeded:
  On going, Accepted, Not good enough, Too many candidates, Position filled, Ghost, Skills,
  Role closed, Assessment failed.
  Proof: `FeedbackDefinitionModel`.

### Supports

- **R-018** `GET /supports` returns steps, feedbacks and platforms.
  Proof: `backend/app/application/use_cases/get_supports.py`,
  `frontend/src/contexts/supports-context.tsx`.
- **R-019** `GET /companies` lists and searches companies.
  Proof: `backend/app/presentation/api/company.py`.

## Known defect

- `ApplicationModel.feedback` builds an `ApplicationLastStep` instead of `ApplicationFeedback`.
  The shapes are equal. Proof: `backend/app/domain/models.py`.

## Tests

`backend/tests/integration/test_applications.py`, `test_finalize.py`,
`test_date_validations.py`, `test_application_steps.py`, `test_supports.py`, `test_companies.py`;
`backend/tests/unit/test_create_application.py`, `test_update_application.py`,
`test_finalize_application.py`, `test_delete_application.py`, `test_application_steps_uc.py`.

## Open questions

- Steps-to-timeline mapping, feedback catalog, finalize semantics, offer salary on legacy rows,
  enum changes: PRD 0000, questions 6 to 11.
