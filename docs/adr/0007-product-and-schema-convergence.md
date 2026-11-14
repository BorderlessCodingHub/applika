# ADR-0007: Product and schema convergence

**Status:** Accepted by LuisMSoares on 2026-09-15 · Amended by ADR-0017 on 2026-10-11 (tailoring binding line, ATS non-goal) · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

The owner chose full convergence on a target product and schema: schema and UX reach the target
over time, and every difference becomes a migration. Also: "So no plan tiers for now".

Target schema changes (from the discover map): `platform_id` nullable plus `platform_name`;
company three-way; cycles extra columns (`target_role`, `salary_expectation`,
`remote_preference`); quinzenal report unique key; `numeric(10,2)` to `(12,2)`; `users.email`
100 to 255; `applications.job_description`; `link_to_job` stays at 2083; salary period
`annual` to `annually`; 9 to 20 currencies.

## Decision

- The target product and schema above are the design target for applika.
- Each target change ships as its own applika change with its own migration under ADR-0005.
- First the four named features, in order: identity (ADR-0006), CV builder, steps as timeline,
  Discord linking (ADR-0008). Then the remaining target changes.
- The following are excluded: plan tiers, AI quota, AI tailoring, permission strings, Discord
  login, dark-only theme.
- Every design decision binds applika only through an applika ADR.
- Where a target change would shrink a column or drop data, applika keeps the wider or existing
  shape. `link_to_job` stays at 2083.
- The CV builder uses a provider-agnostic tailoring port with the verbatim clone binding only.
  Amended by ADR-0017: a keyword binding is added; the clone stays the default.

## Consequences

- Applika's schema carries `_old` columns during convergence.
- Admin-editable catalogs (`steps_definition`, `feedbacks_definition`) are replaced by hardcoded
  event types in the timeline feature.
- `/kodi.plan` owns the detail of each target change.

## Non-goals

- ATS scoring.
- RenderCV. Amended by ADR-0011 (Accepted 2026-09-15): applika adopts server-side RenderCV with
  its own `applika` theme.
- An AI provider.

## Open questions

- Steps mapping, feedback catalog fate, finalize semantics, offer salary CHECK on legacy rows, enum
  changes, and hardcoded `'offer'` and `'Initial Screen'` (PRD 0000, questions 6 to 11).
- CV selection, self-contained copy, one copy per application, PDF, 3-CV limit enforcement
  (PRD 0000, questions 1 to 5).
