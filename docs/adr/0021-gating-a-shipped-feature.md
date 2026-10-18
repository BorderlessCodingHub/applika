# ADR-0021: Gating a feature that already shipped: its beta list starts with its current users (amends ADR-0018)

**Status:** Accepted (LuisMSoares, 2026-10-17) · **Date:** 2026-10-17 · **Deciders:** LuisMSoares

## Context

PRD 0015. The owner: "i would like to lock the cv builder and applications cv's in a feature flag just like jobs".
Unlike the job board, CVs are already in use. In the grilling he chose "One 'cvs' key, enrol owners
(Recommended)": the Release A migration seeds `cvs` in beta and puts every user who already owns a base CV or an
application CV on its beta list.

The ADR-0018 Decision says: "Allowlist. Table `feature_beta_users` … Only admins write it." and "A feature joins
only through an Alembic seed row, in its own Release A migration, at stage `beta`." `.claude/rules/beta-features.md`
point 2 says: "no beta list row, no opt-out row". PRD 0013 lists "Gating features that shipped before the job board"
as a non-goal. If the list started empty, every CV user who is not an admin would lose their CVs at the code release
until an admin added them one by one.

## Decision

- A feature that already shipped may be put behind a beta key later, on the owner's explicit order. CVs, key
  `cvs`, is the first case.
- Its Release A migration seeds the `features` row at stage `beta`, as ADR-0018 requires. The same migration fills
  `feature_beta_users` with the users who already use the feature, by a rule the feature's plan names. For `cvs`,
  the rule is every user who owns at least one row in `base_cvs` or `tailored_cvs` when the migration runs.
- These rows have `added_by` NULL. After that they are ordinary list rows: only admins change them, through
  `/admin/features`, and the ADR-0018 access rule is unchanged.
- The release that turns the gate on runs one more migration. It enrols the users whose first use came after
  Release A. For `cvs`, those are the users whose earliest `base_cvs` or `tailored_cvs` row is newer than the
  `features` row. A user an admin removed from the list in between is not added back.
- These two migrations are the only way a beta list gets written outside `/admin/features`. "Only admins write it"
  still holds for everything the API does. A new feature still starts with an empty list (PRD 0013 R-004). Point 2
  of the beta rule gets this exception when this ADR is accepted.
- A downgrade keeps the seeded rows. An older image then lists a key it does not gate on `/admin/features`, which
  does no harm, because the admin API types `key` as a plain string.

## Consequences

- Current CV users notice nothing except the "Beta" label.
- A user whose first CV comes between the code deploy and the second migration gets "not found" until that
  migration runs. The owner runs it right after the deploy.
- `/admin/features` shows the enrolled rows with no "added by".
- The PRD 0013 non-goal "Gating features that shipped before the job board" no longer holds for `cvs`. It still
  holds for every other feature until the owner orders otherwise.

## Non-goals

- Gating any other shipped feature without an owner order.
- Self-enrolment, enrolment after the gate is live, cohorts or percentages.
- Enrolment by any rule other than prior use.
