# ADR-0002: GitHub OAuth is the sole login (as-built)

**Status:** Superseded by ADR-0024 (`0024-borderless-sole-login-and-membership-badges.md`) on 2026-10-29 · was Accepted by LuisMSoares on 2026-09-15 · Amended by ADR-0013 on 2026-09-24 (scope line) · Amended by ADR-0019 on 2026-10-15 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

Applika signs users in with GitHub only. The owner's order: "Keep github login". No ADR records the
session design. Applika does not adopt the opposite design (Discord as the primary login,
`sub = users.id`).

## Decision

This records what the code does today.

- Login is GitHub OAuth through `fastapi-sso` `GithubSSO` with scope `user:email`
  (`backend/app/presentation/api/oauth.py`). Amended by ADR-0013 on 2026-09-24: `read:org` and the
  login-time organisation-membership check are retired; until Release B of plan 0009 ships, the code
  still asks for `user:email` and `read:org`.
- The callback upserts the user on `github_id`
  (`backend/app/application/use_cases/user_registration.py`).
- The GitHub token is stored Fernet-encrypted in `users.encrypted_github_token`
  (`backend/app/core/crypto.py`).
- The access token is a JWT in the HTTP-only cookie `__access`. Its `sub` is `github_id`
  (`backend/app/core/tokens.py`, `backend/app/application/use_cases/get_current_user.py`).
- The refresh token is an opaque UUID stored in Redis and referenced by the HTTP-only cookie
  `__refresh`.
- `GET /auth/refresh` re-validates the GitHub token against the GitHub API, with a Redis cache. If
  GitHub has revoked the token, the session is killed
  (`backend/app/application/use_cases/refresh_token.py`).
- The CLI signs in through a browser handoff: `POST /auth/cli/start`, `GET /auth/cli/login/{id}`,
  `POST /auth/cli/exchange` (`backend/app/presentation/api/oauth.py`).
- Cookies are HTTP-only, `SameSite=Lax`, and `Secure` in PROD.

## Consequences

- Every user has a GitHub account. `users.github_id` is `NOT NULL UNIQUE`.
- A future second login method needs a stable subject that is not `github_id`. ADR-0008 records
  that follow-up.

## Non-goals

- Discord login (ADR-0008).
- LinkedIn linking.
- Changing the JWT subject now.
