---
PRD: 0004
title: Admin, supports and companies (as-built)
status: Draft
owner: LuisMSoares
created: 2026-09-15
---

# PRD 0004 — Admin, supports and companies (as-built)

What applika does today. Decision: ADR-0004.

## Scope

- Routes: `backend/app/presentation/api/admin/` (`users.py`, `companies.py`,
  `platforms.py`, `step_definitions.py`, `feedback_definitions.py`, `stats.py`),
  `backend/app/presentation/api/support.py`, `backend/app/presentation/api/company.py`,
  `backend/app/presentation/api/user_feedback.py`.
- Tables: `users`, `companies`, `platforms`, `steps_definition`, `feedbacks_definition`,
  `user_feedbacks`.
- Screens: `frontend/src/app/(protected)/admin/page.tsx`, `admin/companies/page.tsx`,
  `admin/supports/page.tsx`, `admin/users/page.tsx`, `frontend/src/components/admin/`.

## Requirements

### Access

- **R-001** Every `/admin/*` route requires `users.is_admin = true`, through `AdminUserDp`.
  Proof: `backend/app/presentation/dependencies.py`,
  `backend/tests/unit/test_admin_access.py`.

### Users

- **R-002** `GET /admin/users` lists users with pagination. `GET /admin/users/{id}` returns one user.
  `PATCH /admin/users/{id}` updates a user.
  Proof: `backend/app/presentation/api/admin/users.py`,
  `backend/app/application/use_cases/admin/users/`.
  As-built note (2026-09-24, ADR-0013, PRD 0009 R-042): GitHub organisation membership is retired;
  from Release B of plan 0009, `GET /admin/users/{id}` no longer returns `is_org_member`, and
  Release C renames `users.is_org_member` to `is_org_member_old`.
- **R-003** `GET /admin/users/growth` and `GET /admin/users/seniority` return user growth and
  seniority breakdown.
  Proof: `get_user_growth.py`, `get_seniority_breakdown.py`.

### Catalogs

- **R-004** Admins list, create, update and delete companies (`/admin/companies`), platforms
  (`/admin/platforms`), step definitions (`/admin/step-definitions`) and feedback definitions
  (`/admin/feedback-definitions`).
  Proof: `backend/app/presentation/api/admin/`.
  As-built note (2026-09-26, ADR-0014, PRD 0010, Release B): companies and platforms an admin
  creates on the admin screen are public. Rows users add are private until an admin approves them
  (`POST /admin/companies/{id}/publish`, `POST /admin/platforms/{id}/publish`), and the admin list
  can filter by visibility and shows who added each row. The web Supports page is now Platforms:
  `/admin/platforms` is paginated with search and an applications count that excludes drafts
  (a platform used only by drafts shows 0, and deleting it is still refused), and the web path
  `/admin/supports` redirects to `/admin/platforms`.
- **R-005** Deleting a company, platform, step definition or feedback definition that is still
  referenced returns 409.
  Proof: `backend/app/application/use_cases/admin/companies/delete_company.py`,
  `admin/platforms/delete_platform.py`, `admin/step_definitions/delete_step_definition.py`,
  `admin/feedback_definitions/delete_feedback_definition.py`.
- **R-006** Production may hold step and feedback definitions created by admins beyond the seeds.
  Proof: R-004.

### Admin stats

- **R-007** `GET /admin/stats`, `/admin/stats/top-platforms`, `/admin/stats/top-companies` and
  `/admin/stats/activity-heatmap` return platform-wide statistics.
  Proof: `backend/app/presentation/api/admin/stats.py`,
  `backend/app/application/use_cases/admin/stats/`.

### Supports and companies

- **R-008** `GET /supports` returns step definitions, feedback definitions and platforms to any
  signed-in user.
  Proof: `backend/app/application/use_cases/get_supports.py`.
  As-built note (2026-09-26, ADR-0014, PRD 0010, Release B): `/supports` returns only the platforms
  visible to the caller (public, plus the caller's private ones); platform `url` is nullable and
  each platform carries `is_public`; otherwise the content, shape and `id` order are unchanged. The
  web reads platforms from `GET /platforms?name=` (ordered by name) instead.
- **R-009** `GET /companies` lists and searches companies for any signed-in user.
  Proof: `backend/app/application/use_cases/companies/list_companies.py`.
  As-built note (2026-09-26, ADR-0014, PRD 0010, Release B): `GET /companies` lists only visible
  companies (public, plus the caller's private ones). `POST /companies` adds a company: a visible
  match is reused, otherwise a private row is created for the caller.
- **R-010** Companies are unique on `lower(name)` and `url`. `created_by` is set null when the
  creating user is deleted.
  Proof: `CompanyModel` in `backend/app/domain/models.py`.
  As-built note (2026-09-26, ADR-0014, PRD 0010, revision `3b78c3cd2a71`): uniqueness is scoped:
  `(lower(name), url)` among public companies, and `(created_by, lower(name), url)` among each
  user's private ones. Platforms: `(created_by, lower(name))` among private ones, and publishing a
  duplicate public name is refused with a 409 that names the public row. `platforms.created_by` is
  also set null when the user is deleted; the user's rows stay.

### In-app feedback

- **R-011** `POST /feedbacks` stores a score from 1 to 5 and optional text up to 2000 characters,
  and posts to the Discord feedback webhook.
  Proof: `backend/app/application/use_cases/user_feedbacks/submit_feedback.py`,
  `UserFeedbackModel`.

## Tests

`backend/tests/integration/test_admin.py`, `test_supports.py`, `test_companies.py`;
`backend/tests/unit/test_admin_access.py`. `POST /feedbacks` has no test.

## Open questions

- What happens to the admin step and feedback definition screens when the timeline replaces the
  catalogs? PRD 0000, questions 6 and 7.
