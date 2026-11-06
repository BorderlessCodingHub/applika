---
PRD: 0009
title: Link a Discord account from the profile, and route reports to the user's Discord servers
status: Approved
owner: LuisMSoares
created: 2026-09-15
related-adrs: [0001, 0002, 0004, 0005, 0008, 0010, 0013]
related-prds: [0001-auth-users-profile.md, 0003-statistics-reports-cycles.md, 0004-admin-supports-companies.md, 0006-visual-identity.md]
---

# PRD 0009 — Link a Discord account from the profile, and route reports to the user's Discord servers

> **Retired (as-built note, 2026-10-29, ADR-0024, PRD 0018).** From Release B of plan 0018 Discord
> linking is gone: `/auth/link/discord*` answer 404, the profile has no Discord card, and no report
> or feedback post mentions anyone (PRD 0018 R-033). Reports are routed by membership badge, not by
> Discord server: R-039 is replaced by PRD 0018 R-030 (a report goes to every report webhook whose
> badges include a badge the author holds). The Discord tables stay in the database, unmapped;
> Release C renames them `_old`. This PRD is kept as history.

## In the owner's words

Keep github login but add an option in user profile to sincronize with discord.

(2026-09-24) i would like to abandom the last ticket and expand this plan, when the user clicks to connect thir applika account with discord, i want to save the refresh token and all data related to this connection in a new table istead directly in users, save only the refresh token criptografed (new end to set the encryption secret). Remove the environment DISCORD_REPORTS_WEBHOOK, we're going to do differently, as an admin user i can configure which webhooks to send my reports (new table to save the discord webhook url, the server id - will be used to check if the user is in this server - and multiples roles id in this discord server - this is optional). What i want is, when a user created a report, if this user connected their account with discord, my application needs to use the refresh token to get an access token and get a list of server ids this user is in discord, with list list i fetch from this new table all web hooks configured to the server id i fetched from my user, and then check if an admin have limited by roles id, i also need's to check if this user have the role id in that server, with everyting done, i then send the repport message in the webhooks

## Clarifications

- Q: What does the profile show and store once Discord is linked? → A: "ID + token only": store nullable `discord_id` (unique) and the encrypted token only; profile shows just "Discord connected"; least personal data; user can't see which account is linked. Use the minimal OAuth scope that yields the id (`identify`). **Superseded 2026-09-15 by the refresh-token answer below: no token is stored; the rest (unique id, "Discord connected", scope `identify`) still holds.** **Superseded again 2026-09-24: the connection has its own record, the profile shows name and avatar, and the scopes grow (answers of 2026-09-24).**
- Q: What happens when the Discord account is already linked to another Applika user? → A: "Refuse, explain on profile (Recommended)": callback redirects to profile with `status=conflict`; message says the Discord account is linked to another Applika account; nothing changes for either user. **Superseded 2026-09-24 by the link-conflict answer below: the link moves to the user who just completed consent, nothing is revoked at Discord, and `status=conflict` remains only for two users linking the same account at the same instant.**
- Q: Can the user disconnect Discord, and what happens to the stored token? → A: "Disconnect clears + revokes (Recommended)": Disconnect clears `discord_id` and token and calls Discord's token revoke endpoint best-effort (Discord failure doesn't block); user can link again anytime; account deletion clears it too. **Superseded 2026-09-15 by the refresh-token answer below: there is no stored token, so Disconnect clears `discord_id` only and calls nothing at Discord; relinking and account deletion still clear the link.** **Restored 2026-09-24: a grant is stored again, so Disconnect revokes it, best-effort (R-024).**
- (2026-09-15) Q: Should the Discord refresh token be stored as well? → A: "dont store tokens, only discord id, change of plans, i dont have interest to allow synced accounts to login with their discord account, this link - for now - is only to mention the right users in the webhook, I have other plans to this but i'll leave to the future, but for now the only data that is important to me is the discord user id" **Superseded 2026-09-24 by the owner's expanded story: the refresh token is stored, encrypted, in its own record. Discord login is still out.**
- (2026-09-15) Q: Does this feature also make the webhooks mention linked users, and which ones? → A: "Yes, both webhooks (Recommended)": when a linked user submits a biweekly report or feedback, the message includes `<@discord_id>` and `allowed_mentions.users` allows only that id; unlinked users posted exactly as today.
- (2026-09-24) Q: ADR-0008 (Accepted) says no Discord token is stored; the story stores an encrypted refresh token in a new table. How does the ADR change? → A: "New ADR supersedes 0008 (Recommended)": draft ADR-0013 (Proposed); ADR-0008 gets "Superseded by 0013" only when the owner accepts 0013 (list that edit under Open, do not apply it yourself).
- (2026-09-24) Q: The users.discord_id revision is on integration/0009-discord-account-link and never reached develop or main. How does the new table arrive? → A: "Replace the unshipped revision (Recommended)": rewrite that revision so it creates the Discord connection table (plus the webhook table) and never touches users. Prod never sees users.discord_id. Dev DB must `alembic downgrade -1` before pulling the rewrite (note it).
- (2026-09-24) Q: What gates report posting now, and what happens to a user without Discord? → A: "Discord server replaces org gate (Recommended)": remove DISCORD_REPORTS_WEBHOOK and the GitHub org check (DISCORD_REPORTS_ORGANIZATION, `_validate_org_membership`) from reports. Server membership (+ optional roles) is the only gate. User without Discord linked: report saved, posted nowhere.
- (2026-09-24) Q: Does feedback change? → A: "Feedback unchanged (Recommended)": DISCORD_FEEDBACK_WEBHOOK env stays; feedback keeps the <@discord_id> mention for linked users (id now read from the new table). Admin webhook table is for reports only.
- (2026-09-24) Q: What happens when the refresh fails or Discord is down at report time? → A: "Flag link, ask reconnect (Recommended)": report saved (discord_posted=false), submit still succeeds. invalid_grant → connection marked needs-reconnect; profile shows "Reconnect Discord". Discord down/5xx → not posted, link kept. Every successful refresh stores the new (rotated) encrypted refresh token.
- (2026-09-24) Q: Which Discord data is stored, and does the profile show it? → A: "Store + show name/avatar (Recommended)": table keeps discord_id (unique), username, global_name, avatar hash, granted scopes, access-token expiry, status, linked_at/updated_at; refresh token encrypted; profile shows "Connected as <name>" with avatar. Access token never stored. Server list and roles fetched live at report time, not stored. Scopes: identify + guilds + guilds.members.read. PRD 0009 non-goal "never show name/avatar" is dropped.
- (2026-09-24) Q: A webhook limited to several roles: must the user hold at least one of them, or all of them? → A: "one of those". A role-limited webhook is kept when the user holds at least one of its role ids.
- (2026-09-24) Q: Should the GitHub organisation setting be removed entirely, or should only reports stop using it? → A: "removed entirely". The setting goes away completely: sign-in stops asking GitHub for organisation access, the login-time organisation check stops, and organisation membership is no longer recorded or returned. The recorded values are set aside, not deleted.
- (2026-09-24) Q: The build flagged that revoking the new grant on a link conflict could cancel the holder's grant at Discord. What happens when user B links a Discord account that user A already holds? → A: "drop the old connection and create the new one". Confirmed option: "Move the link to B (Recommended) — Delete A's connection row, create B's with B's new grant, and don't revoke at Discord (a revoke could cancel B's new grant too). The callback returns status=linked. A's profile shows Discord not connected, and A's feedback no longer mentions them. R-008 is rewritten, the edge cases on PRD lines 130–131 are updated, and the conflict outcome only remains for the two-user race." Supersedes clarification 2.

## Problem

Applika posts biweekly reports and user feedback to Discord through webhooks. It only knows users
by their GitHub name, so those posts cannot mention the right person on Discord. The owner wants
each user to be able to tie a Discord account to their Applika account from the profile page, so
that the posts mention them.

Reports today all go to one fixed channel, and only for members of one GitHub organisation. The
owner runs several Discord communities and wants to decide, as an administrator, which channels
get reports. A report should reach the channels of the servers the user is actually in, and an
administrator can also limit a channel to members who hold certain roles. To check a user's
servers and roles when they submit a report, Applika must keep the user's Discord grant, stored
safely in a record of its own. Discord server membership replaces the GitHub organisation rule,
and the owner retires that rule from the whole product.

## Users and stories

- US1 (P1) A signed-in user connects their Discord account from the profile page, then sees which Discord account is connected.
- US2 (P1) A linked user who submits a biweekly report or feedback is mentioned on Discord in that post.
- US3 (P1) A signed-in user connects a Discord account that another Applika user had linked, the link moves to them, and the other user's profile shows Discord not connected.
- US4 (P2) A signed-in user disconnects Discord from the profile page, is no longer mentioned, and can connect again later.
- US5 (P3) A user who cancels or fails the Discord consent screen returns to the profile page with a clear message.
- US6 (P1) An administrator adds a report webhook for a Discord server, optionally limited to some roles.
- US7 (P1) A linked user submits a biweekly report, and it is posted to every configured channel of the servers they are in, where they hold a required role if one is set.
- US8 (P2) A linked user whose Discord access was withdrawn sees Reconnect Discord on the profile page and reconnects.
- US9 (P2) An administrator changes or removes a report webhook, and never sees its full address after saving it.
- US10 (P3) A user submits a report while Discord is down, and the report is saved anyway.

## Requirements

- R-001 The system keeps GitHub as the only way to sign in; connecting Discord never creates or changes a session. (owner: "Keep github login"; clarification 4)
- R-002 The profile page offers a Connect Discord action when the user has no Discord link. (owner: "add an option in user profile")
- R-003 The system asks Discord only for the permission that reveals the Discord user id. (clarification 1) **Superseded 2026-09-24 by R-020.**
- R-004 After a successful connection the system stores the Discord user id and nothing else from Discord; no Discord token is ever stored. (clarification 4) **Superseded 2026-09-24 by R-021 and R-022.**
- R-005 The system asks Discord to revoke the access token right after reading the user id, and a Discord failure does not block the connection. (clarification 4) **Superseded 2026-09-24 by R-022: the grant is kept, not revoked.**
- R-006 The profile page shows "Discord connected" and a Disconnect Discord action when the user has a Discord link, and never shows the Discord id, name or avatar. (clarification 1) **Superseded 2026-09-24 by R-023.**
- R-007 A Discord account is linked to at most one Applika user. (clarification 2)
- R-008 When a user completes Discord consent for a Discord account that is linked to another Applika user, the system moves the link to the user who completed it. It deletes the other user's connection record, creates the new user's record with the grant just received, revokes nothing at Discord, and returns the new user to the profile page with the outcome connected. The Discord account stays linked to at most one Applika user (R-007). (clarification 2026-09-24, "drop the old connection and create the new one"; rewritten, was clarification 2)
- R-009 The system returns the user to the profile page after the Discord consent screen with one of three outcomes: connected, failed, or already linked to another Applika account. The last one occurs only when another user linked the same Discord account at the same instant and won. (clarification 2, narrowed 2026-09-24; US5)
- R-010 The system accepts a Discord consent result only for the same signed-in user who started it, only once, and within a short time window. (US1; ADR-0010 separate origins)
- R-011 Disconnect Discord removes the stored Discord user id and calls nothing at Discord. (clarification 4) **Superseded 2026-09-24 by R-024.**
- R-012 A user who disconnected can connect Discord again, the same account or another one. (clarification 3)
- R-013 Deleting the Applika account removes the Discord link. (clarification 3)
- R-014 When a linked user's biweekly report is posted to Discord, the post mentions that user. (clarification 5)
- R-015 When a linked user's feedback is posted to Discord, the post mentions that user. (clarification 5)
- R-016 A webhook post allows a mention of the submitting user only, and never of everyone, roles or other users. (clarification 5)
- R-017 A post for an unlinked user is exactly what Applika sends today. (clarification 5) **Narrowed 2026-09-24: holds for feedback only; an unlinked user's report is posted nowhere (R-036).**
- R-018 The profile data the API returns tells whether Discord is linked, without the Discord id. (clarification 1) **Superseded 2026-09-24 by R-025.**
- R-019 The installed command-line tool keeps working unchanged. (owner: "Keep github login"; CLI rule)
- R-020 The system asks Discord for permission to read the user's identity, the servers the user is in, and the user's roles in those servers, and for nothing more. (clarification 2026-09-24, stored data)
- R-021 After a successful connection the system keeps the connection in a record of its own, apart from the user's account data. The record holds the Discord user id, username, display name and avatar, the granted permissions, the access expiry, the connection state, and the times of linking and of the last update. (owner: "in a new table istead directly in users"; clarification 2026-09-24, stored data)
- R-022 The system stores the Discord refresh token encrypted with a secret used only for Discord, separate from the GitHub one, and never stores the Discord access token. (owner: "save only the refresh token criptografed (new end to set the encryption secret)")
- R-023 When the user has a Discord connection, the profile page shows "Connected as <name>" with the Discord avatar and a Disconnect Discord action. It never shows the Discord id. (clarification 2026-09-24, stored data)
- R-024 Disconnect Discord removes the connection record and asks Discord to revoke the stored grant, and a Discord failure does not block the disconnect. (clarification 3, restored 2026-09-24)
- R-025 The profile data the API returns tells whether Discord is connected, the Discord name and avatar, and whether the connection needs reconnecting. It never carries the Discord id as a field. (clarification 2026-09-24, stored data)
- R-026 When Discord refuses the stored grant, the system marks the connection as needing reconnection, and the profile page shows a Reconnect Discord action. (clarification 2026-09-24, refresh failure)
- R-027 Reconnecting runs the same consent flow, refreshes the stored data and clears the reconnection mark. (clarification 2026-09-24, refresh failure)
- R-028 Each time the system renews Discord access, it replaces the stored refresh token with the new one, encrypted. (clarification 2026-09-24, refresh failure)
- R-029 An administrator can list, add, change and remove report webhooks. Each webhook holds a Discord webhook address, a Discord server id, and zero or more Discord role ids. (owner: "as an admin user i can configure which webhooks to send my reports")
- R-030 The system accepts a report webhook only when its address is a secure Discord webhook address and the server id and role ids are Discord ids. (owner: "the discord webhook url, the server id")
- R-031 After a report webhook is saved, the system never shows its full address again, only a masked form. (owner: "the discord webhook url"; Assumptions)
- R-032 When a user submits a biweekly report, the system saves it before contacting Discord, and the submission succeeds whatever Discord answers. (clarification 2026-09-24, refresh failure)
- R-033 When the submitting user has an active Discord connection, the system uses the stored grant to get fresh Discord access. It then reads the ids of the servers the user is in and selects every report webhook configured for one of those servers. (owner: "use the refresh token to get an access token and get a list of server ids")
- R-034 For a selected webhook limited to role ids, the system reads the user's roles in that server, and keeps the webhook only when the user holds at least one of those roles. (owner: "check if an admin have limited by roles id, i also need's to check if this user have the role id in that server"; clarification 2026-09-24, "one of those")
- R-035 The system posts the report to every kept webhook, and each post mentions the submitting user. (owner: "i then send the repport message in the webhooks"; clarification 5)
- R-036 A report from a user who has no Discord connection, or whose connection needs reconnecting, is saved and posted nowhere. (clarification 2026-09-24, report gate)
- R-037 When Discord is unreachable or failing at report time, the report is saved and not posted, and the connection is left as it is. (clarification 2026-09-24, refresh failure)
- R-038 The report records whether it reached at least one webhook. (clarification 2026-09-24, `discord_posted`)
- R-039 Discord server membership, plus the optional roles, is the only rule that decides where a report is posted. The single reports webhook setting no longer exists. (owner: "Remove the environment DISCORD_REPORTS_WEBHOOK"; clarification 2026-09-24, report gate)
  As-built note (2026-10-29, ADR-0024): replaced by PRD 0018 R-030 from Release B of plan 0018.
- R-040 The system reads a user's servers and roles when a report is submitted and never stores them. (clarification 2026-09-24, stored data)
- R-041 Feedback keeps going to its one configured feedback webhook. It mentions a user who has a Discord connection, whatever that user's servers or connection state. (clarification 2026-09-24, feedback)
- R-042 The system no longer uses GitHub organisation membership for anything. The organisation setting is removed, sign-in asks GitHub for the email permission only, and the system neither checks, records nor returns organisation membership. (clarification 2026-09-24, "removed entirely")
- R-043 The organisation-membership values recorded before this change are kept aside, unused, and are never deleted by this change. (clarification 2026-09-24, "removed entirely"; owner's non-destructive migration order)

## Permissions and tenancy

A signed-in user may connect, reconnect and disconnect a Discord account for their own Applika
account only. No user, including an administrator, may connect, disconnect or view another
user's Discord connection. Administrator status grants nothing extra on connections. The one
exception is R-008: a user who completes Discord's consent as a Discord account takes that
account's link from its previous holder, whose record is deleted; nothing is revoked at Discord.

Only an administrator may list, add, change or remove report webhooks. A non-administrator is
refused and sees nothing of them, including their addresses. After saving, an administrator sees
only a masked webhook address.

A consent result that one user started cannot be completed in the browser session of a different
user. An anonymous visitor can neither start nor complete a connection.

The system uses a user's stored Discord grant only to route that same user's own reports. Nobody,
the user included, can read the stored grant back through the product. A report reaches a
webhook only when the submitting user is in that webhook's server at submission time and, for a
role-limited webhook, holds the required roles. A webhook post mentions only the user who
submitted the report or feedback.

## Edge cases

- The Discord account is already linked to another user: the link moves to the user who just completed consent, and the result is "connected" (R-008). The other user's connection record is deleted and nothing is revoked at Discord. The other user gets no notice. From then on their profile shows Discord not connected, their feedback no longer mentions them, and their reports are posted nowhere.
- Two users link the same Discord account at the same instant: the at-most-one-user rule (R-007) decides. Exactly one wins, and the other sees "already linked to another Applika account"; nothing is stored for the loser and nothing is revoked at Discord.
- The user reconnects the Discord account they already have: the stored data and grant are refreshed, the result is "connected", and any reconnection mark is cleared.
- A user whose connection needs reconnecting authorises a different Discord account: the new account replaces the old connection. When another user held that account, the link moves as in R-008.
- The user denies consent on Discord or Discord returns an error: result "failed", nothing stored.
- The consent result arrives after the time window or is replayed: result "failed", nothing stored.
- The user's Applika session expired while on the Discord consent screen: result "failed"; the user retries.
- Discord is unreachable when revoking on disconnect: the connection is still removed.
- Disconnect when nothing is linked: succeeds and changes nothing.
- The server has no Discord app or no Discord encryption secret configured: Connect reports that Discord linking is unavailable. Disconnect still works. Feedback still mentions already linked users. Reports are saved and posted nowhere.
- The Discord encryption secret was replaced by a different one: stored grants cannot be read, so each connection is marked as needing reconnection at its next report.
- The user is in none of the configured servers: the report is saved and posted nowhere.
- The user is in a server that has two webhooks, and lacks the role one of them requires: the report goes to the other webhook only.
- The user left a server after linking: that server's webhooks are skipped, because membership is checked live.
- Discord rate-limits a call, or one webhook was deleted on Discord: that post fails, the other posts still go out, and the report records that it was posted if any post went out.
- An administrator enters an address that is not a Discord webhook, or adds the same address twice: refused with a message.
- The linked Discord user is not a member of the feedback webhook's server: Discord shows the mention as an unknown user, and the feedback post still goes out.
- ~~A biweekly report from a user who is not a member of the reporting organisation is not posted today and still is not posted.~~ Superseded 2026-09-24 by R-039 and R-042.
- A user disconnects: the next feedback post has no mention, and the next report is posted nowhere.
- A user who signed in before this change granted GitHub organisation access. That grant may stay on GitHub's side, but nothing uses it.
- An administrator opens a user's details: organisation membership is no longer part of them.

## Non-goals

- Signing in with Discord.
- Storing the Discord access token, email, server list or roles.
- Moving the session subject from the GitHub id to the Applika user id.
- Checking a webhook against Discord when an administrator saves it.
- Routing feedback by server, or more than one feedback webhook.
- Retrying a failed report post later, or posting reports submitted before this change.
- Other future uses of the link; the owner leaves them for later.
- Any CLI command for Discord or for report webhooks.
- Admin views of users' Discord connections.
- ~~Reading or showing Discord username, avatar, email, servers or roles.~~ Dropped 2026-09-24 for username and avatar; servers and roles are read but never shown or stored; email stays out.
- ~~Storing any Discord token.~~ Superseded 2026-09-24 by R-022.
- ~~Changing which reports or feedback are posted, or the webhook destinations.~~ Superseded 2026-09-24 for reports.

## Success signals

- A user connects Discord in under 30 seconds from the profile page.
- A linked user in a configured server sees their next report in that server's channel, with a mention.
- A linked user's next feedback post mentions them on Discord.
- No Discord id is ever linked to two users.
- No Discord access token, and no unencrypted refresh token, exists in the database.
- A report submission never fails because of Discord.
- The GitHub sign-in consent screen asks for email access only.
- `applika whoami` from CLI 0.1.4, 0.2.0 and 1.0.0 still works after release.

## Assumptions

- "sincronize with discord" means linking the Discord account so posts can mention the user and reports can be routed; nothing else moves between the services.
- The mention appears on the first line of the post, right after the existing `@username` text.
- The consent result is valid for 10 minutes.
- The Connect action stays visible when Discord is not configured on the server and reports the problem on click.
- Outcome messages appear as a notice on the profile page, and the address bar is cleaned afterwards.
- Disconnect asks for confirmation before acting.
- While a connection is active, the UI never offers Connect. Reconnect Discord appears only when the connection needs reconnecting.
- Deleting the Applika account also asks Discord to revoke the grant, best-effort.
- "Connected as" shows the Discord display name, or the username when there is no display name. With no avatar, a Discord icon is shown.
- The avatar image address contains the user's own Discord id; the id is never shown as text.
- A webhook address is a secret, so it is shown masked after saving and kept out of logs and error messages.
- Accepted webhook addresses are https addresses on Discord's own domains.
- A report webhook may carry an optional label so administrators can tell webhooks apart.
- A server may have several report webhooks, and the same address cannot be added twice.
- A webhook holds at most 25 role ids.
- Changing a webhook without entering a new address keeps the stored address.
- A connection that needs reconnecting still carries its Discord id, so feedback still mentions that user.
