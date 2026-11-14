# ADR-0014: Private-until-published catalog rows, and draft applications hidden from every read model

**Status:** Accepted by LuisMSoares on 2026-09-25 · **Date:** 2026-09-25 · **Deciders:** LuisMSoares

## Context

PRD 0010. `companies` and `platforms` are shared catalogs read by applications, `/supports`, `/companies`,
the admin screens and admin statistics (ADR-0004: "An admin can manage the shared catalogs"). Today a company
a user adds with a URL is visible to every user at once
(`backend/app/application/use_cases/applications/create_application.py`), and platforms are
admin-only. The owner: "privater to the creator, but, i as an admin can approve and make available to everyone
(still keeping the reference to who's created), this is what i also would like for companies".

The owner also wants a "new application with CV" flow that auto-saves as a draft: "draft applications dont
count's to the report and can be resumed at any time". A draft is an `applications` row, read today by
applications, statistics, reports, cycles, agenda, admin statistics and the CLI list.

Both rules bind code outside the feature: every read of those three tables.

## Decision

Catalog visibility

- `companies` and `platforms` carry `is_public` and `created_by` (FK `users.id`, `ON DELETE SET NULL`).
  For catalog rows `created_by` is the owner column; it survives publishing, which a `user_id` owner would not
  express. This refines ADR-0004 for catalog rows only.
- A row is visible to a user when it is public or that user created it. Every user-facing read and every write
  that accepts a company or platform id applies this rule; an invisible id is a 404. Admin routes see every row.
- A row added through the user flows (application forms, `POST /companies`, `POST /platforms`) is private,
  whoever adds it; an admin there is like any other user. A row added on the admin screens is public. Every row
  that exists when the migration runs is public.
- Only an admin publishes, private to public, one way. `created_by` is kept.
- Uniqueness is scoped: one public company per `lower(name)` + `url`; one private company per creator per
  `lower(name)` + `url`; one private platform per creator per `lower(name)`. Duplicates across scopes are
  allowed. Publishing a row that duplicates a public one is refused. Merging duplicates is a later feature.
- A downgrade rebuilds the global unique company index when no duplicate `lower(name)` + `url` group exists, and
  a non-unique one otherwise, logging the duplicate ids (owner, 2026-09-25).
- A platform's `url` is optional for users and admins; `/supports` sends `null` for it (owner, 2026-09-25).

Draft applications

- `applications.is_draft` marks a draft. A draft is an ordinary row owned by `user_id` (ADR-0004), so a CV
  copy attaches to it unchanged.
- Every read model excludes drafts through one shared predicate: `GET /applications`, statistics, reports,
  cycles (a draft is never archived), agenda, admin statistics and admin user rows.
- Only the draft routes and `/applications/{id}/cv*` address a draft. Every other application route answers
  404 for a draft id.
- Reference counts that block deleting a company or platform still count drafts.

Enforced by integration tests that seed a draft and another user's private row before every read route they
cover, and by the migration round-trip test (ADR-0005).

## Consequences

- Every repository query on `applications`, `companies` or `platforms` must carry its predicate. A missed one
  leaks a draft into a report or a private row to another user.
- `/supports` and `/companies` change content per user; new fields are additive (ADR-0009). The one type change,
  a platform `url` that may be `null`, is a field `applika-cli` 0.1.4 never reads; both changelogs record it.
- A company or platform added through `applika-cli` becomes private too.
- The global unique index on companies becomes two partial indexes. A downgrade after users made same-name
  private companies restores a non-unique index, so old code during a rollback no longer refuses a duplicate.
- Rolling back to a release without this code shows drafts as applications and private rows to everyone until
  the upgrade runs again.

## Non-goals

- Unpublishing, merging duplicates, users editing their own catalog rows.
- A catalog approval workflow beyond one admin action.
- RBAC (ADR-0004).

## Open questions

- None. The downgrade question was settled by the owner on 2026-09-25 (Decision above).
