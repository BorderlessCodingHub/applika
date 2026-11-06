# ADR-0013: Discord connection with a stored grant, and admin-routed report webhooks

**Status:** Superseded by ADR-0024 (`0024-borderless-sole-login-and-membership-badges.md`) on 2026-10-29 · was Accepted by LuisMSoares on 2026-09-24 · **Date:** 2026-09-24 · **Deciders:** LuisMSoares · **Supersedes:** ADR-0008 · **Amends:** ADR-0002 (GitHub scope line)

## Context

ADR-0008 (Accepted 2026-09-15) links Discord by storing `users.discord_id` only, and it revokes
the access token right after reading the id. That design was built on
`integration/0009-discord-account-link`. None of it reached `develop` or `main`,
so production has no Discord column.

On 2026-09-24 the owner expanded the feature: "i want to save the refresh token and all data
related to this connection in a new table istead directly in users, save only the refresh token
criptografed (new end to set the encryption secret). Remove the environment
DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which
webhooks to send my reports". In the owner's design, a report goes to every admin-configured
webhook of a Discord server that the user is in. An admin can also limit a webhook to role ids.

Today reports post to a single webhook (`DISCORD_REPORTS_WEBHOOK`), and only for members of a
GitHub organisation (`DISCORD_REPORTS_ORGANIZATION`, `SubmitReportUseCase._validate_org_membership`
in `backend/app/application/use_cases/quinzenal_reports/submit_report.py`).
`backend/app/core/crypto.py` encrypts the GitHub token with `GITHUB_TOKEN_ENCRYPTION_KEY`.
The same organisation setting also drives a login-time check: `oauth.py` requests the GitHub
scope `read:org`, and each login stores `users.is_org_member`, which `/admin/users/{id}` returns.
On 2026-09-24 the owner answered "one of those" for role matching and "removed entirely" for the
organisation setting.

## Decision

- A Discord connection has its own table, `discord_connections`. It holds one row per user
  (`user_id` unique, deleted with the user) and a unique `discord_id`. It also stores the
  username, global name, avatar hash, granted scopes, access-token expiry, status (`active`,
  `needs_reconnect`), `linked_at`, `updated_at` and the encrypted refresh token. `users` gets no
  Discord column.
- The refresh token is Fernet-encrypted with a new secret, `DISCORD_TOKEN_ENCRYPTION_KEY`, kept
  separate from `GITHUB_TOKEN_ENCRYPTION_KEY`. The access token is never stored. Linking stays off
  until the Discord client id, the client secret and this key are all set.
- The OAuth scopes are `identify guilds guilds.members.read`.
- Linking never issues a session. GitHub stays the only login (ADR-0002).
- Report destinations are rows of `discord_report_webhooks`: a webhook URL, a server (guild) id
  and optional role ids. Only admins manage them, under `/admin/discord-webhooks` with
  `AdminUserDp` (ADR-0004). `DISCORD_REPORTS_WEBHOOK` is removed.
- When a linked user submits a report, the API:
  1. refreshes the grant and stores the rotated refresh token;
  2. reads the user's server ids;
  3. selects the webhooks of those servers;
  4. drops each role-limited webhook unless the user holds at least one of its roles;
  5. posts to the webhooks that remain, mentioning the user.

  The server list and the roles are read live at submit time and never stored.
- Server membership, plus the optional roles, is the only report gate.
- GitHub organisation membership is retired from the whole product:
  - `DISCORD_REPORTS_ORGANIZATION` is removed.
  - The login-time check is removed, and so is `GitHubService.check_org_membership`.
  - The GitHub login scope becomes `user:email` only. This amends the ADR-0002 Decision line
    "scopes `user:email` and `read:org`".
  - The ORM stops mapping `users.is_org_member` in the code release. A later, migration-only
    release renames the column to `is_org_member_old`, and its downgrade renames it back.
  - `users.encrypted_github_token` stays, because refresh re-validation needs it (ADR-0002).
- If Discord refuses the grant (`invalid_grant`), the connection is marked `needs_reconnect`. The
  report is saved and not posted. If Discord is unreachable or failing, the report is saved and
  not posted, and the connection is left unchanged.
- Disconnect deletes the row and asks Discord to revoke the grant, best-effort.
- Linking a Discord account another user holds moves it: the holder's row is deleted, the new
  row is written, nothing is revoked at Discord; a simultaneous race is decided by the unique
  `discord_id`, and the loser gets `status=conflict`. (Added 2026-09-24 with the owner's
  approval; owner's words: "drop the old connection and create the new one".)
- Feedback does not change. It still goes to `DISCORD_FEEDBACK_WEBHOOK` and mentions the linked
  user.
- The unshipped revision `a7e5c2f19b4d` (`users.discord_id`) is replaced by a new revision. The new
  revision creates the two tables and does not touch `users`.

## Consequences

- Submitting a report now triggers Discord calls inside the request: one refresh, one server
  list, one member lookup per role-limited server, and one post per webhook. The cost is added
  latency and exposure to Discord rate limits. On a 429 or a timeout, that call is skipped and
  the report is still saved.
- If `DISCORD_TOKEN_ENCRYPTION_KEY` is lost or changed, no stored grant can be decrypted, and
  every linked user has to reconnect. Key rotation is not supported.
- A webhook URL contains Discord's webhook token. It is stored as is, because the owner said
  "save only the refresh token criptografed". After an admin saves a webhook, the API never
  returns the full URL again.
- Release A's migration only adds two tables and one enum. Release C's migration only renames a
  column to `_old` and keeps its data. Both obey ADR-0005. Rolling A back drops both tables:
  users have to reconnect and admins have to re-enter webhooks.
- `GET|PATCH /users/me` gain fields. The change is additive, so installed CLIs are not affected
  (ADR-0009). `/admin/users/{id}` loses `is_org_member`; no CLI calls it.
- There are three releases: A adds the tables, B ships the code (which stops using
  `is_org_member`), and C renames the column to `_old`. C must be downgraded before the image is
  rolled back past B.
- Plan: `docs/plan/0009-discord-account-link.md`. PRD: `docs/prd/0009-discord-account-link.md`.

## Non-goals

- Discord login.
- Storing the access token, email, server list or roles.
- Routing feedback by server.
- Checking a webhook against Discord when an admin saves it.
- Encryption-key rotation.
- Retrying a failed post later.

## Open

Accepted by LuisMSoares on 2026-09-24. The three follow-up edits were applied the same day:

- ADR-0008's status becomes "Superseded by 0013".
- ADR-0002: the Decision scope line changes to `user:email` only, and the ADR gets an
  "Amended by 0013" note.
- `docs/prd/0004-admin-supports-companies.md` gets an as-built note: admin user details
  no longer carry organisation membership.

Closed on 2026-09-24: role match is any one ("one of those"), and the organisation setting is
removed entirely ("removed entirely").
