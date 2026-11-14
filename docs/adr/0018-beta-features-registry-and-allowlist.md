# ADR-0018: Beta features: a feature registry with per-feature allowlists (extends ADR-0004)

**Status:** Accepted by LuisMSoares on 2026-10-14 · **Date:** 2026-10-14 · **Deciders:** LuisMSoares · **Amended by:** ADR-0021 (gating a shipped feature), ADR-0025 on 2026-10-31 (the gate's 404 carries `code` GEN-1001) · **Exception:** ADR-0024 (Borderless sign-in and badges ship ungated), ADR-0025 (English and Portuguese and the language switcher ship ungated)

## Context

PRD 0013. The owner: "with the jobs featurw implemented i would like to block this feature under beta features and
release only to selected beta users, all mew features in the feature will follow the same pattern, start as beta and
then release to everyone". He chose a per-feature allowlist, an admin screen under `/admin`, features fully hidden and
enforced by the API, all of PRD 0012 behind the `jobs` key, and a reversible lifecycle that keeps the list. On
2026-10-14 he added: "features is granted to admins automatically, but it can also be disabled by them in the admin
panel". He chose "Each admin opts out per feature (Recommended)".

The ADR-0004 Decision says: "The only role is the boolean `users.is_admin`". Its Non-goals list "RBAC" and "Plan tiers
and entitlements". A beta allowlist adds a per-user, per-feature visibility check. It is code that every later
feature binds to, which is why this needs an ADR.

## Decision

- **This is a release stage, not a role and not an entitlement.** Being on a beta list grants no right over another
  user's data, over the shared catalogs, or over any admin route. The ADR-0004 ownership rule and its "a row that
  belongs to another user is reported as not found" rule are unchanged. `users.is_admin` stays the only role. Every
  feature ends up general. There is no plan, no quota and no price. Admins get beta features automatically as a
  testing convenience on top of the existing role. That access adds no right: inside a feature, an admin sees only
  their own rows, like any user.
- **Registry.** Table `features`: `key` (unique), `name`, `description`, `stage` `beta|general` (varchar + CHECK) and
  `released_at`. It is shared and managed by admins, with no owner. A feature joins only through an Alembic seed row,
  in its own Release A migration, at stage `beta`. The admin API cannot create, rename or delete a feature.
- **Allowlist.** Table `feature_beta_users`: `feature_id`, `user_id`, `added_by` and a timestamp, unique on
  `(feature_id, user_id)`. User FK `CASCADE`, `added_by` FK `SET NULL`. Only admins write it.
- **Admin opt-out.** Table `feature_admin_opt_outs`: `feature_id`, `user_id` and timestamps, unique on
  `(feature_id, user_id)`, both FKs `CASCADE`. An admin writes only their own row. It is kept apart from the allowlist,
  so list counts and list membership never mix with opt-outs.
- **Rule.** A user has feature F when `F.stage = 'general'`, or when a `(F, user)` allowlist row exists, or when
  `users.is_admin` is true and no `(F, user)` opt-out row exists. An opt-out only takes away the automatic admin
  access: an admin on the allowlist keeps F, and in `general` everyone has F. A row from a former admin grants nothing.
  A key that is not in the table means hidden for everyone, admins included (fail closed).
- **Lifecycle.** `beta ↔ general` through an admin action, in both directions. The allowlist and the opt-outs are
  untouched either way, so an opt-out counts again if F moves back to `beta`. Moving to `general` sets `released_at`; moving back to `beta` clears it. Removing a gate from code (so the
  feature is always on) is a later change that the owner orders explicitly.
- **Enforcement, API first.** One dependency, `require_feature(key)` in
  `backend/app/presentation/dependencies.py`, is built on `CurrentUserDp` (which carries `is_admin`). When the
  user lacks the feature it
  answers `404 {"detail": "Not Found"}`, the same as an unknown route. It is applied on the router for routers that
  are wholly gated, on the route for gated routes inside shared routers, and per value for a gated option on a shared
  route (`tailoring: "keywords"` → 422). Keys live in one `StrEnum`, `FeatureKey`, in
  `backend/app/core/features.py`. Nothing is cached: one indexed query per gated request.
- **Web follows the API.** `GET /users/me/features` returns the caller's own features with their stages. The web hides
  navigation, pages and controls for missing keys and shows a "Beta" label while a feature is in beta. The web hiding
  things is a courtesy; the API is the rule.
- **Not gated:** background tasks (`app/worker/`, ADR-0016), which act for no user, and admin routes, which
  `AdminUserDp` already guards.
- **Management:** `/admin/features*` under `AdminUserDp`: list features, list, add and remove users on a list, set
  the stage, and the caller's own opt-out (`PUT`/`DELETE /admin/features/{key}/opt-out`).

## Consequences

- Every later user-facing feature adds a `FeatureKey` member, a seed row and `require_feature` on its routes, plus the
  matching web hook. A workspace rule, `.claude/rules/beta-features.md`, makes this binding on plans.
- Tests build the schema with `create_all`, so seed rows are absent there. A gated test enrols its user through a
  fixture.
- If code ships before its migration has run, every gated route fails. Releases follow
  `.claude/rules/prod-release-runbook.md`: migration first, code second.
- A user's web view can lag behind an admin change until the next page load. API answers change on the next request.
- Admins see every beta feature in production by default. An admin who wants to see what a normal user sees opts
  out for each feature.

**As-built note (2026-10-14).** The Decision stands. Three places where the build adds to it:
- *Trailing slash* (owner ruling 2026-10-14). Starlette answers a slash-suffixed path with a 307 before any dependency
  runs, which would reveal a gated route. Every gated route therefore also gets a schema-hidden `<path>/` twin
  (`add_slash_twins`, `backend/app/presentation/gated_slash.py`) with the same endpoint and the same
  `require_feature` dependency. Without the feature `/jobs/`, `/jobs//`, `/jobs/{id}/` answer the gate's 404, byte-equal
  to an unknown route. `redirect_slashes` stays on for every ungated route (the CLI's included).
- *What the gate cannot hide* (plan 0013 correction 5, owner-approved 2026-10-14). FastAPI decodes a JSON body before
  dependencies run, so a body that is not JSON answers 422 `json_invalid` on a gated route; an undefined method answers
  405. A well-formed body with wrong fields still gets the 404.
- *Own access switch while listed* (plan 0013 correction 9, owner-accepted 2026-10-14). The admin UI
  locks "Use this feature myself" while the admin is on the list and shows the stored choice with the listed reason.
  The API still stores the opt-out in either case.

**Note (2026-10-15, plan 0014 correction 14).** Feature 0014 (device sessions, the Devices tab, CLI sign-in)
is an owner exception to the first Consequence above. The owner chose "Gate nothing" on 2026-10-15: no `FeatureKey`
member, no seed row, no `require_feature`, no web gate (ADR-0019 Decision, "Beta exception"). The rule holds for every
other feature.

**Note (2026-10-19, PRD 0017).** The applika-cli self-update (the daily auto update and `applika update`) is an owner
exception to the first Consequence above. The owner chose "No gate, an exception" on 2026-10-19: no `FeatureKey`
member, no seed row, no route and no API call (ADR-0023 Decision, "Beta exception"). The rule holds for every other
feature.

**Note (2026-10-31, PRD 0019).** English and Portuguese on the web, and the language switcher, are an owner exception
to the first Consequence above. The owner chose "No gate, everyone at once" on 2026-10-31: no `FeatureKey` member, no
seed row, no `require_feature` and no web gate (ADR-0025 Decision, "Beta exception"). The rule holds for every other
feature. ADR-0025 also gives the gate's 404 a code: it answers `{"detail": "Not Found", "code": "GEN-1001"}`, and the
unknown-route 404 carries the same code, so the two stay byte-equal. The `detail` is unchanged.

## Non-goals

- RBAC, permission strings, plan tiers and entitlements. The ADR-0004 Non-goals stand.
- Percentage rollouts, cohorts and groups, self-enrolment, notifications, a kill switch for everyone, and stages per
  environment.
- An admin opting out on behalf of another admin or a user. Opt-outs while a feature is `general`.
