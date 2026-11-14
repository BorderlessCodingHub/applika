---
PRD: 0014
title: CLI device sign-in and connected devices
status: Approved
owner: LuisMSoares
created: 2026-10-15
related-adrs: [0002, 0004, 0009, 0015, 0018, 0019]
related-prds: [0001-auth-users-profile.md, 0005-landing-cli.md, 0013-beta-features.md]
---

# PRD 0014 — CLI device sign-in and connected devices

## In the owner's words

> i would like to implement the same authentication flow used in claude cli and implement in applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost of devices connected and a section to revoke the access, this must be displayed in a new tab inside user profile, losting the device name, ip, when was granted access, last time accessed and more. i also want to instead of returning the refresh token in jwt, save it in the redis instance used by the rate limiter, the access token cookie value now will become an random uuid7 value, the same one used as key in the redis, if the redis key expire, this mean the session also expired, i also want to list the devices connected by the frontend app in the profile

## Clarifications

- Q: Which login shape should the new applika-cli copy from the Claude CLI? Options: PKCE + own token (browser OAuth with PKCE, loopback redirect, paste-code fallback, CLI gets own session sent as Authorization: Bearer) / Device code (RFC 8628) / Both (PKCE loopback by default, `applika login --device` for headless). → A: "Both"
- Q: How does a session live and die in Redis? (options offered: one key sliding TTL / two keys access+refresh / one key fixed TTL) → A: "the access token will still be a jwt token, only the refresh token will become an uuid value, i am refrering to the cookies"
- Q: When a device is revoked, how fast must it lose access? → A: "Instant (Recommended)" — JWT carries a `sid` claim = the session's uuid7; each authenticated request checks the key still exists in Redis (one GET, same Redis as the rate limiter, also updates 'last accessed'). Revoked device gets 401 on its next call.
- Q: Where does the device list live? → A: "Postgres + Redis" — a `user_sessions` table keeps device metadata and history (revoked/expired rows visible), Redis keeps the live key. Needs a Release A migration + round-trip test and a two-release rollout.
- Q: What happens to sessions and installed applika-cli 0.1.4 at deploy? → A: "Log everyone out" — deploy invalidates all old refresh keys; web and CLI users log in again and get a proper device row. Old CLI 0.1.4 must still be able to log in via /auth/cli/* and refresh via cookies (cli-compatibility rule).
- Q: Does this go behind a beta flag? (rule beta-features) → A: "Gate nothing" — Devices tab visible to everyone at release. This is the owner's explicit exception to .claude/rules/beta-features.md; record it in the PRD.
- Q: What does the JWT `sid` claim hold? (2026-10-15) → A: "Public row id (Recommended)" — sid = user_sessions.id snowflake, second Redis key `applika:session:id:<sid>` expiring with the uuid7 key.
- Q: Session lifetime fixed 7 days or extended while used? (2026-10-15) → A: "Sliding on refresh" — each refresh pushes expiry REFRESH_TOKEN_EXPIRE_DAYS ahead; idle devices die after 7 days. Still no rotation of the refresh value.
- Q: Redis unreachable during per-request session check? (2026-10-15) → A: "Fail closed" — every authenticated request answers an error when the session check cannot reach Redis; revocation is never bypassed.

## Problem

The CLI borrows the web's session. Its browser handoff hands it the same access and refresh values the
web app uses, and it replays them as cookies. Nobody can see where their account is signed in. A lost
laptop or a shared machine keeps access until the session runs out on its own. A machine with no
browser (SSH, a container) cannot sign in at all, because the login needs a browser on the same
machine.

## Users and stories

US1 (P1) As a user, I see every device signed in to my account, web and CLI, in a Devices tab of my profile.
US2 (P1) As a user, I revoke one device, and it loses access on its next request.
US3 (P1) As a CLI user, I run `applika login`, approve in my browser, and the CLI gets a session of its own.
US4 (P2) As a CLI user on a machine without a browser, I run `applika login --device`, approve the short code from any signed-in browser, and the CLI signs in.
US5 (P2) As a user, I sign out every other device in one action.
US6 (P2) As a user of an installed older CLI, I sign in once more after the release and keep working.
US7 (P3) As a CLI user whose browser cannot reach the CLI's local callback, I paste a code shown in the browser into the terminal.

## Requirements

### Sessions

- R-001 The system gives each sign-in its own session. One browser sign-in or one CLI sign-in is one device.
- R-002 The system makes a session's refresh value a random UUIDv7 and uses that same value as the session's key in the Redis instance the rate limiter uses. The web app carries it in the refresh cookie.
- R-003 The system keeps the access token a short-lived JWT.
- R-004 The system ends a session 7 days after its last refresh: each refresh, web or CLI, pushes the end 7 days ahead, so a device in use stays signed in and a device not refreshed for 7 days is signed out. A session whose Redis key has expired or been deleted is ended: refreshing it fails, and the device's next request fails.
- R-005 The system checks on every signed-in request that the request's session still exists, so a revoked device is refused on its next request. When the check cannot reach Redis, the system refuses the request with a temporary error and signs nobody out; a request never goes through unchecked.
- R-006 The system keeps each device's details and history in the database, so ended devices stay visible.
- R-007 The system re-checks the GitHub token when a session is refreshed, as today, and ends the session when GitHub has revoked it.
- R-008 The system ends every session of an account at once when the account is deleted.

### Devices tab

- R-009 The system shows a new "Devices" tab in the user profile, beside the existing profile content.
- R-010 The system lists the caller's devices, web and CLI, each with device name, IP address (last seen and at sign-in), when access was granted, when it was last used, the client (browser and system, or CLI version), how it signed in, when it expires, and its status.
- R-011 The system marks the device the user is looking from as "This device".
- R-012 The system lets the user revoke any one of their active devices, after a confirmation.
- R-013 The system lets the user sign out all their other devices in one action, after a confirmation.
- R-014 The system shows ended devices with how they ended (signed out, revoked, expired).
- R-015 The system shows the Devices tab and the CLI sign-in to every user at release. Nothing in this feature is behind a beta flag.

### CLI sign-in

- R-016 The system signs `applika login` in through a browser authorization protected by PKCE, which returns to a local callback on the user's machine, and gives the CLI a session of its own.
- R-017 The system signs `applika login --device` in with a device code: the CLI shows a short code and a web address, the user approves on a browser where they are signed in, and the CLI receives a session of its own.
- R-018 The system shows the requesting device's name, IP address and request time on the approval page, and lets the user approve or deny.
- R-019 The system lets the user paste a code shown in the browser into the CLI when the browser cannot reach the local callback.
- R-020 The system takes the new CLI's access token from an `Authorization: Bearer` header.
- R-021 The system names a CLI device after the machine's host name unless the user gives a name.
- R-022 The system ends the CLI's own session on the server when the user runs `applika logout`.

### Compatibility and rollout

- R-023 The system ends every existing session at the release that turns this on; web and CLI users sign in again.
- R-024 The system keeps installed `applika-cli` 0.1.4, 0.2.0, 1.0.0 and 1.0.1 working: they sign in through the existing browser handoff, refresh through cookies, and appear in the device list.

## Permissions and tenancy

A user sees and revokes only their own devices. A device id that belongs to another user answers as not
found, and that holds for admins too. No screen and no route lets an admin list or revoke another
user's devices. Only a signed-in user can approve a device code, and the device that is approved is
signed in as the user who approved it. Anyone who holds a session's refresh value can use it until the
session ends, so the refresh value never appears in the device list, in the access token, in a web
address, or in a log. The access token names its session by the device's public id.
The device list shows the IP addresses of the caller's own devices only.

## Edge cases

- The user signs in again in the same browser: the earlier browser session ends as signed out instead of staying active.
- The user revokes "This device": they are signed out at once and sent to the login page.
- The user revokes a device that has already ended: nothing changes, and no error is shown.
- A device code is not approved within 10 minutes: the CLI stops and asks the user to run login again.
- A device code is denied: the CLI stops and says the sign-in was denied.
- A wrong or expired code is typed on the approval page: the page says the code was not found or expired.
- The CLI polls faster than allowed, or hits the rate limit while polling: it waits longer and keeps polling.
- A login code or a device code is used twice: the second use fails.
- A device code is approved from the wrong account: the CLI prints which account it signed in as.
- `applika login` runs while the CLI is already signed in: the previous CLI session ends first.
- Redis loses its data: every session ends, and the list shows those devices as expired.
- Redis cannot be reached: every signed-in request fails with a temporary error until Redis is back. The web app and CLI 1.1.0 keep their session and work again afterwards. An installed older CLI keeps its session too, unless its access token runs out during the outage; its refresh then fails and it asks for a new login, as it does today.
- A device is not refreshed for 7 days (web tab closed, CLI unused): it is signed out and shows as expired.
- A signed-out user opens the approval link: after signing in, they land back on the approval page with the code filled in.

## Non-goals

- Any sign-in other than GitHub (ADR-0002).
- Notifications about a new sign-in.
- Location from the IP address.
- An admin view of other users' devices, or an admin revoke.
- CLI commands to list or revoke devices.
- Renaming a device from the web.
- Rotating the refresh value on refresh.
- Removing the old CLI handoff routes (a later owner decision, ADR-0009).
- A cap on devices per user, and purging old device history.
- Changing the access token's subject (ADR-0002).

## Success signals

- A revoked device gets 401 on its next request, web and CLI.
- New CLI sign-ins by browser and by device code appear in the list with their method and device name.
- Installed CLI 0.1.4 to 1.0.1 sign in again after the release and work.
- Device-code polling causes no 429 on `/auth/*` at default limits.
- Every active device in the list has a live session, and every live session has a device row.
- A Redis outage signs nobody out of the web app or CLI 1.1.0, and lets no revoked device through.

## Assumptions

- The 7-day window is `REFRESH_TOKEN_EXPIRE_DAYS`, today's value.
- The refresh value is not rotated: a device keeps one refresh value for its whole life.
- "Last used" and the last IP are updated on every signed-in request.
- Ended devices are listed for 30 days after they end. Older rows are kept but not shown.
- A web device's name is derived from the browser's user agent, e.g. "Chrome on macOS".
- An older CLI shows as "applika-cli (older version)".
- The IP address is the one the server resolves behind its proxy. There is no location lookup.
- A device code is 8 letters shown as XXXX-XXXX. It lasts 10 minutes, and the CLI polls every 10 seconds.
- The paste-code page is public. The code alone is useless without the secret the CLI kept (PKCE).
- Revoking "This device" signs the user out.
- The Devices tab sits beside a "Profile" tab that holds today's profile content.
- "Gate nothing" is the owner's explicit exception to `.claude/rules/beta-features.md` for this feature only. The rule still applies to every other feature.
