---
PRD: 0001
title: Auth, users and profile (as-built)
status: Draft
owner: LuisMSoares
created: 2026-09-15
---

# PRD 0001 — Auth, users and profile (as-built)

What applika does today. Decisions: ADR-0002, ADR-0004.

## Scope

- Routes: `/auth/*` in `backend/app/presentation/api/oauth.py`; `/users/me*` in
  `backend/app/presentation/api/user.py`.
- Table: `users` (`backend/app/domain/models.py`, `UserModel`).
- Screens: `frontend/src/app/login/page.tsx`, `frontend/src/app/(protected)/profile/page.tsx`,
  `frontend/src/app/(protected)/agenda/page.tsx`, `frontend/src/components/profile/`,
  `frontend/src/contexts/auth-context.tsx`.

## Requirements

### Sign-in

- **R-001** A user signs in with GitHub OAuth only, through `GET /auth/github/login` and
  `GET /auth/github/callback`, with scopes `user:email` and `read:org`.
  Proof: `backend/app/presentation/api/oauth.py`.
  As-built note (2026-09-25, ADR-0013, PRD 0009 R-042): from Release B of plan 0009 the GitHub
  scope is `user:email` only; `read:org` is no longer requested.
  As-built note (2026-10-29, ADR-0024, PRD 0018): from Release B of plan 0018 GitHub sign-in is
  gone. Sign-in is Borderless email and password through `POST /auth/borderless/signin`
  (`backend/app/presentation/api/borderless_auth.py`); `GET /auth/github/login` answers 307 to the
  Borderless sign-in page. GitHub stays only as a one-shot restore of an old account
  (`POST /auth/github/restore`, scope `read:user`, no token kept).
- **R-002** The callback creates the user or updates the existing one, matched on `github_id`.
  Proof: `backend/app/application/use_cases/user_registration.py`.
  As-built note (2026-10-29, ADR-0024, PRD 0018): from Release B of plan 0018 the user is found by
  Borderless id in `borderless_accounts`, else by email (an old GitHub-era account is adopted with
  no extra step), else created. `github_id` is no longer the match key.
- **R-003** The callback stores the GitHub token encrypted in `users.encrypted_github_token` and
  stores GitHub organisation membership in `users.is_org_member`.
  Proof: `backend/app/core/crypto.py`, `backend/app/domain/models.py`,
  migration `d5e6f7a8b9c0_add_github_token_and_org_member.py`.
  As-built note (2026-09-25, ADR-0013, PRD 0009 R-042): from Release B of plan 0009 organisation
  membership is no longer checked or recorded; the ORM no longer maps `users.is_org_member`.
  From Release C the column is renamed `is_org_member_old` (data kept). The encrypted GitHub token
  stays.
  As-built note (2026-10-29, ADR-0024, PRD 0018): from Release B of plan 0018 no GitHub token is
  stored or read. The Borderless access token is stored encrypted in `borderless_accounts`
  (`BORDERLESS_TOKEN_ENCRYPTION_KEY`). The `users.encrypted_github_token` column is no longer
  mapped; Release C renames it `_old`.
- **R-004** The session is an access JWT in the HTTP-only cookie `__access`, with `sub` set to
  `github_id`, and an opaque refresh token in Redis referenced by the HTTP-only cookie `__refresh`.
  Proof: `backend/app/core/tokens.py`, `backend/app/config/settings.py`.
  As-built note (2026-10-29, ADR-0024, ADR-0019, PRD 0018): from Release B of plan 0018 `sub` is
  `users.id`, not `github_id`. Release B ends every older session (sign in again).
- **R-005** `GET /auth/refresh` re-validates the GitHub token against GitHub and re-issues the access
  cookie. If GitHub has revoked the token, the session ends.
  Proof: `backend/app/application/use_cases/refresh_token.py`.
  As-built note (2026-10-29, ADR-0024, PRD 0018): from Release B of plan 0018 the refresh no longer
  calls GitHub. It reads the Borderless membership while the Borderless access is alive and never
  fails because of it; past the 7-day access the badges stop counting until the user confirms
  their password, and the session is kept.
- **R-006** `GET /auth/logout` revokes the refresh token and clears both cookies.
  Proof: `backend/app/presentation/api/oauth.py`.
- **R-007** The frontend polls refresh every 10 minutes.
  Proof: `frontend/src/contexts/auth-context.tsx`.

### CLI sign-in

- **R-008** The CLI starts a login with `POST /auth/cli/start`, the browser completes GitHub OAuth
  through `GET /auth/cli/login/{login_id}`, and the CLI exchanges a short-lived one-time code with
  `POST /auth/cli/exchange` for the same session values in JSON.
  Proof: `backend/app/presentation/api/oauth.py`,
  `backend/app/application/use_cases/auth_handoff_state.py`,
  `backend/tests/integration/test_oauth_cli.py`.

### Profile

- **R-009** `GET /users/me` returns the signed-in user's profile.
  Proof: `backend/app/presentation/api/user.py`.
- **R-010** `PATCH /users/me` updates names, current company, role, salary, currency, period,
  experience years, tech stack, seniority, location, availability, bio and LinkedIn URL.
  Proof: `backend/app/application/use_cases/update_user.py`, `UserModel`,
  `backend/tests/unit/test_update_user.py`.
- **R-011** `DELETE /users/me` deletes the user and clears both cookies. Rows owned by the user are
  removed by `ON DELETE CASCADE`.
  Proof: `backend/app/presentation/api/user.py`,
  `backend/tests/integration/test_delete_account.py`.
- **R-012** `GET /users/me/agenda` returns the user's scheduled steps within a date range.
  Proof: `backend/app/application/use_cases/get_user_agenda.py`,
  `frontend/src/components/layout/agenda-dropdown.tsx`.

### Data

- **R-013** `users.github_id` is `BIGINT UNIQUE NOT NULL`. `users.email` is `VARCHAR(100) UNIQUE NOT NULL`.
  `users.is_admin` is a boolean defaulting to false. There are no Discord columns.
  Proof: `backend/app/domain/models.py`.
  As-built note (2026-09-25, ADR-0013, PRD 0009): still true after plan 0009. `users` has no
  Discord column; a Discord connection lives in its own table, `discord_connections`
  (one row per user, deleted with the user).
  As-built note (2026-10-29, ADR-0024, PRD 0018): from Release A of plan 0018 `users.github_id`
  is nullable and the Release B ORM no longer maps it; the GitHub identity lives in
  `github_connections`. Borderless identity, badges and bindings live in `borderless_accounts`
  and `user_badges`. Release C renames the retired GitHub and Discord objects `_old`.

## Tests

`backend/tests/integration/test_oauth_cli.py`, `test_users.py`, `test_delete_account.py`;
`backend/tests/unit/test_oauth_cli.py`, `test_get_current_user.py`, `test_update_user.py`.

## Open questions

- None raised by the inputs for the as-built state. Discord linking: ADR-0013 (supersedes ADR-0008;
  PRD 0009).
