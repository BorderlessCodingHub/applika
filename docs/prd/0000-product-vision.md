---
PRD: 0000
title: Product vision
status: Draft
owner: LuisMSoares
created: 2026-09-15
---

# PRD 0000 — Product vision

## In the owner's words

Opening request: add new features to Applika, the first one the CV builder. A user creates up to 3 master CVs, selects one and edits it to the job specifications; each job application stores its own edited copy of that master CV. Real models connect later. GitHub login stays, and the user profile gets an option to link Discord. Applika gets a new visual identity and a new model for application steps. Applika is in production: migrations are downgradable, an upgrade never deletes a column, a retired column is renamed to an older version and its data is copied or migrated.

On roles and plans: no AI integration, no subscriptions, no ATS checking and no CV improvement recommendations are planned yet. No plan tiers for now. `is_admin` stays for now; a better RBAC will be designed in the future.

On gates: "the better of two worlds, i also want frontend tests and e2e tests with real application stack"

On production: "applika project runs in a vps with docker swarm, there ir no CD automation, once the image is published in docker hub, I upgrade the swarm stack to use the latest version, docker exec in api image, i run alembic upgrade and then restart the api container."

Selected options: order "Identity → CV → steps → Discord"; "Keep Applika name + logo"; "Keep light+dark; restyle landing"; "Upgrade in the identity feature"; "Link now, Discord login later"; full product and schema convergence (ADR 0007); "Converge, as a late feature" (single image); "Suffix `_old`"; "Compat layer + new CLI".

## Problem

- Applika tracks job applications, steps, cycles, statistics and biweekly reports. It has no CV feature.
- Applika has no CV builder, no timeline model for steps and an outdated visual identity.
- Applika is in production. Every change must keep existing data and allow a rollback.

## Users

- Job seekers who sign in with GitHub and track their applications in the web app or with `applika-cli`.
- Admins: users with `users.is_admin = true`. They manage companies, platforms, step definitions and feedback definitions.
- No plan tiers. No AI quota.

## How they work today

- Sign in with GitHub. The session is a JWT cookie whose `sub` is `github_id`.
- Create an application, add steps from the admin-editable `steps_definition` catalog, and finalize it irreversibly with a strict step and a `feedbacks_definition` outcome.
- Group applications in cycles. Read statistics on the dashboard. Submit biweekly reports.
- Use `applika-cli` 0.1.4 for applications, steps and finalize.

## Where the product is today

- `backend`: FastAPI, layer-first clean architecture, Snowflake ids, Postgres 16, Redis. 14 migrations, head `a1b2c3d4e5f7`.
- `frontend`: Next.js 16 static export, React 18.3, Tailwind 3.4, shadcn default, teal HSL palette, light and dark, header navigation, landing page.
- `cli`: `applika-cli` 0.1.4 on PyPI.
- Deploy: two images on a Docker Swarm VPS, deployed by CD on push to `main`. Alembic runs by hand afterwards. Owner: "yes, there is a cd automation, but not for migrations".
- As-built modules: PRD 0001 to PRD 0005 in `docs/prd/`.
- No CV feature. No Discord account. Discord is used only for outbound webhooks.

## Where it must get to

Features ship in this order.

1. **Visual identity.** A new look with Applika's name, logo and domain. Tailwind v4, React 19, shadcn new-york and the sidebar shell, split into slices: platform bump, then tokens, then shell. Light and dark both kept. Landing restyled. ADR 0006.
2. **CV builder.** A user creates up to 3 master CVs. The user selects one and edits it to a job. Each application stores its own edited copy. Tailoring is a verbatim copy now; real models connect later behind a port (ADR 0007).
3. **Steps as timeline.** Application steps become a timeline of events. Old data is copied, old columns and tables are renamed `_old`, and `applika-cli` 0.1.4 keeps working through a compatibility layer. ADR 0009.
4. **Discord linking.** The profile gets Connect and Disconnect Discord, storing only the Discord user id, used to mention linked users in the report and feedback webhooks. GitHub stays the only login; no Discord login is planned. Owner (2026-09-15): "i dont have interest to allow synced accounts to login with their discord account, this link - for now - is only to mention the right users in the webhook". ADR 0008, PRD 0009.
5. **Full convergence.** Schema and UX reach the target product and schema over time, every difference as its own migration, excluding plan tiers, quota and AI. ADR 0007.
6. **Single-image deploy.** Last, as its own feature with its own ADR. ADR 0010.

## Constraints

- Every migration has a downgrade. No upgrade drops a column or a table. No column shrinks. `.claude/rules/non-destructive-migrations.md`.
- Every new migration has a round-trip test. `.claude/rules/migration-tests.md`.
- Installed `applika-cli` versions keep working. `.claude/rules/cli-compatibility.md`.
- Images deploy by CD; migrations are applied by hand after the deploy. `.claude/rules/prod-release-runbook.md`.
- Applika name, logo, domain, PyPI package and CLI URLs stay valid.
- `is_admin` stays the only role.
- Canonical repository: `Applika-dev/applika`. PRs target `develop`.

## Non-goals

- Plan tiers, AI quota, AI tailoring, ATS scoring, CV improvement recommendations.
- RBAC beyond `is_admin`.
- Discord as a login method.
- Retiring the GitHub login.
- Single-image deploy before the four features ship.

## Open questions

CV builder:
1. Is the selected master CV persisted as a default, or picked per application at tailoring time?
2. Is the tailored copy self-contained, with identity fields copied, so it survives deletion of its master CV?
3. Is it strictly one copy per application?
4. PDF export: html2pdf client-side, server-side RenderCV, or out of the first slice?
5. Is the 3-CV limit enforced in the database or only in the use case?

Steps and timeline:
Owner on questions 6, 9 and 10: "to the other 3 is questions to be decided during ticket implementation". On `_old` data: "_old can be deleted in the future" (ADR 0005).

6. How does every `steps_definition` row, including admin-created production rows, map to `note`, `interview`, `feedback`, `offer` or `denied`? (decided during implementation)
7. What happens to `feedbacks_definition` values, including "On going"?
8. Finalize: a reversible finalize and reopen, or applika's irreversible finalize with the Offer and Accepted coupling?
9. The offer salary CHECK requires currency and period; legacy `salary_offer` rows lack them. How are they migrated? (decided during implementation)
10. `annual` to `annually`, and 9 currencies to 20: how is the enum changed without losing rows? (decided during implementation)
11. Statistics and reports hardcode `'offer'` and `'Initial Screen'`. What replaces them?

Identity:
12. Is the `/app/*` URL prefix for signed-in pages adopted?

Gates:
13. What coverage floor applies to existing applika code?
14. Must `ty` pass on existing code?

Deploy:
15. Settled: expand first, code second (`.claude/rules/prod-release-runbook.md`).

Discord:
16. Settled: only `discord_id` is stored (ADR 0008).
17. Settled: unlinking is allowed (ADR 0008).
18. Settled: `DiscordOAuthService` next to the webhook `DiscordService` (ADR 0008).

Repository:
19. The git remote is `ProgramadoresSemPatria/applika` and `cli/pyproject.toml` says `ApplikaDev/applika`; kodi uses `Applika-dev/applika`. When are they aligned?
