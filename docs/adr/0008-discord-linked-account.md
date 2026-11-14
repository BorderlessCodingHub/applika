# ADR-0008: Discord as a linked account for webhook mentions

**Status:** Superseded by ADR-0013 (`0013-discord-connection-and-report-webhook-routing.md`) on 2026-09-24 · was Accepted by LuisMSoares on 2026-09-15 · **Date:** 2026-09-15 · **Deciders:** LuisMSoares

## Context

The owner: "Keep github login but add an option in user profile to sincronize with discord".
Discovery first selected "Link now, Discord login later". During `/kodi.plan` for PRD 0009 the
owner changed plans: "dont store tokens, only discord id, change of plans, i dont have interest to
allow synced accounts to login with their discord account, this link - for now - is only to
mention the right users in the webhook, I have other plans to this but i'll leave to the future,
but for now the only data that is important to me is the discord user id". Selected for mentions:
"Yes, both webhooks".

Today applika has no Discord account data. Discord appears only as outbound webhooks
(`DISCORD_REPORTS_WEBHOOK`, `DISCORD_FEEDBACK_WEBHOOK`, `DISCORD_REPORTS_ORGANIZATION` in
`backend/app/config/settings.py`; `backend/app/application/services/discord_service.py`),
which send `allowed_mentions: {parse: []}`. An account can be linked without issuing a session
(`/auth/link/*`).

## Decision

- The profile page has Connect Discord and Disconnect Discord.
- `users` gets a nullable, unique `discord_id` only. No Discord token is stored; the access token
  from linking is revoked right after the id is read.
- Linking never issues a session. GitHub stays the only login (ADR-0002). No Discord login is
  planned; owner: "i dont have interest to allow synced accounts to login with their discord
  account".
- The link is used to mention the linked user in the biweekly report and feedback webhook posts,
  with `allowed_mentions` limited to that user; owner: "this link - for now - is only to mention
  the right users in the webhook".
- Other uses of the link are left to the future and need their own decision.

## Consequences

- The migration only adds one nullable column with a unique index, so it obeys ADR-0005.
- The API and the frontend are separate origins with `SameSite=Lax` cookies (ADR-0010). The OAuth
  callback lands on the API and returns the user to the frontend profile page.
- `DiscordOAuthService` (`app/application/services/discord_oauth_service.py`) sits next to the
  webhook `DiscordService`, which now sends a mention for linked users and an unchanged payload
  for unlinked users.
- The CLI is unaffected.
- The link flow checks for a conflict in the user repository and redirects from the API callback
  to the profile page.
- Plan: `docs/plan/0009-discord-account-link.md`.

## Non-goals

- Discord login.
- Storing any Discord token, username, avatar or email.
- GitHub or LinkedIn linking.
- Changing the JWT subject.

## Settled (2026-09-15, during /kodi.plan for PRD 0009)

- Discord username and avatar: not stored; only `discord_id`.
- Unlinking: allowed; it clears `discord_id` and calls nothing at Discord.
- Discord account already linked to another user: refused; the profile says so; nothing changes.
- Name clash: `DiscordOAuthService` for linking, `DiscordService` stays the webhook service.
