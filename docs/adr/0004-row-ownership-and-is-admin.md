# ADR-0004: Per-user row ownership, `is_admin` as the only role

**Status:** Accepted by LuisMSoares on 2026-09-16 · Amended by ADR-0024 on 2026-10-29 (badges are an entitlement for reports only; `is_admin` stays the only role) · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

The new features could bring permission strings (`base_cv.*`, `tailored_cv.*`) and plan tiers. The owner: "So no
plan tiers for now. keep id_admin for now, a better rbac will be designed in the future".

## Decision

- Every user-owned row carries `user_id`. Every read and every write filters by the current
  user's id. A row that belongs to another user is reported as not found
  (`get_by_id_and_user_id` in `backend/app/domain/repositories/`,
  `backend/app/application/use_cases/application_steps/create_application_step.py`).
- The only role is the boolean `users.is_admin`
  (`backend/app/domain/models.py`).
- Admin routes under `/admin/*` require `AdminUserDp`
  (`backend/app/presentation/dependencies.py`).
- New tables (base CVs, tailored CVs, timeline events) follow the same
  ownership rule. They do not use permission strings.

## Consequences

- A user can read and change only their own applications, steps, cycles, reports, CVs and timeline
  events.
- An admin can manage the shared catalogs, and an admin still cannot act on another user's
  applications through the user routes.
- Permission checks (`require('<perm>')`) are never added; ownership filters cover access.

## Non-goals

- RBAC. It will be designed later in its own ADR.
- Plan tiers and entitlements.
