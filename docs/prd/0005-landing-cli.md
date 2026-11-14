---
PRD: 0005
title: Landing and CLI (as-built)
status: Draft
owner: LuisMSoares
created: 2026-09-15
---

# PRD 0005 — Landing and CLI (as-built)

What applika does today. Decisions: ADR-0006 (landing restyle), ADR-0009 (CLI compatibility).

## Scope

- Landing: `frontend/src/app/(public)/page.tsx`, `(public)/home-page.tsx`,
  `(public)/cookie-policy/page.tsx`, `frontend/src/components/landing/`,
  `frontend/src/components/cli-promo-banner.tsx`, `frontend/src/components/cookie-consent.tsx`.
- CLI: `cli/src/applika/`, published on PyPI as `applika-cli` 0.1.4.

## Requirements

### Landing

- **R-001** The public home page is composed of header, hero, dashboard mockup, features, how it
  works, stats, testimonials, open source, call to action and footer sections.
  Proof: `frontend/src/components/landing/` (`landing-header.tsx`, `hero-section.tsx`,
  `dashboard-mockup.tsx`, `features-section.tsx`, `how-it-works-section.tsx`, `stats-section.tsx`,
  `testimonials-section.tsx`, `open-source-section.tsx`, `cta-section.tsx`, `landing-footer.tsx`).
- **R-002** A cookie policy page exists at `/cookie-policy`, and a cookie consent banner is shown.
  Proof: `frontend/src/app/(public)/cookie-policy/page.tsx`,
  `frontend/src/components/cookie-consent.tsx`.
- **R-003** A banner promotes the CLI.
  Proof: `frontend/src/components/cli-promo-banner.tsx`.
- **R-004** The site supports light and dark themes with a toggle. The brand is the Applika icon
  with "applika.dev".
  Proof: `frontend/src/components/theme-toggle.tsx`, `frontend/src/components/app-logo.tsx`.
- **R-005** The frontend is a static export served by nginx.
  Proof: `frontend/next.config.ts` (`output: "export"`), `frontend/docker/Dockerfile`,
  `frontend/docker/nginx.conf`.

### CLI

- **R-006** `applika login` signs in through the browser handoff and stores the session locally.
  `applika logout` clears it. `applika whoami` shows the user.
  Proof: `cli/src/applika/commands/auth.py`, `cli/src/applika/lib/session.py`,
  `cli/src/applika/lib/loopback.py`.
- **R-007** `applika applications list`, `new`, `edit` and `finalize` manage applications. Running
  `applika applications` alone lists them.
  Proof: `cli/src/applika/commands/applications/__init__.py`, `commands.py`.
- **R-008** `applika applications steps list`, `add`, `edit` and `delete` manage steps.
  Proof: `cli/src/applika/commands/applications/__init__.py`.
- **R-009** `steps add` and `steps edit` resolve a non-strict step name to `step_id` through
  `/supports`. `finalize` resolves a strict step and a feedback through `/supports`, and sends
  `step_id`, `feedback_id`, `finalize_date`, `salary_offer` and `observation`.
  Proof: `cli/src/applika/commands/applications/api_resolve.py`,
  `cli/src/applika/commands/applications/commands.py`,
  `cli/src/applika/schemas/application_step.py`.
- **R-010** `applika skill install` installs the bundled AI skill. `applika version` and `--version`
  print the version.
  Proof: `cli/src/applika/commands/skill.py`, `cli/src/applika/commands/version.py`.
- **R-011** The API base URL defaults to `https://applika.dev/api` and is overridden by
  `--api-base-url` or `APPLIKA_API_BASE_URL`.
  Proof: `cli/src/applika/app.py`, `cli/src/applika/config.py`.
- **R-012** CLI schemas are vendored copies of backend enums and DTOs, not imports.
  Proof: `cli/src/applika/schemas/`.
- **R-013** CI runs ruff, pytest and build. A push to `main` publishes to PyPI.
  Proof: `.github/workflows/cli-ci.yaml`, `.github/workflows/cli-cd.yaml`.

## Tests

`cli/tests/test_api.py`, `test_commands.py`, `test_session.py`. The landing has no tests.

## Open questions

- `cli/pyproject.toml` names `ApplikaDev/applika`; the canonical repository is
  `Applika-dev/applika`. PRD 0000, question 19.
