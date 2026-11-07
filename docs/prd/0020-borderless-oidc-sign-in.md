---
PRD: 0020
title: Sign in with Borderless through OpenID Connect
status: Approved
owner: LuisMSoares
created: 2026-11-06
related-adrs: [0004, 0009, 0010, 0015, 0018, 0019, 0024, 0025, 0026]
related-prds: [0001-auth-users-profile.md, 0014-cli-device-sign-in-and-devices.md, 0018-borderless-sign-in-and-membership-badges.md]
---

# PRD 0020 — Sign in with Borderless through OpenID Connect

## In the owner's words

The owner's three inputs, in order. The second is the specification Borderless gave for applika, pasted verbatim except the client secret, which lives only in the server's environment.

1. "this prompt bellow was provided by me about how the authentication with borderless api needs to work, the callback url i asked to configure in their system is this one here /api/auth/borderless/callback."

2. The pasted specification:

```text
# Sign in with Borderless: Applika

Integrate with any OpenID Connect library as a **confidential client** (server-side only).

## Credentials
- **Issuer:** https://api.borderlesscoding.com/api/auth
- **Discovery:** https://api.borderlesscoding.com/api/auth/.well-known/openid-configuration
- **client_id:** `kpttIUIlWvHcMvFCZKXrjUVcNjsQHNqR`
- **client_secret:** [REDACTED: lives only in the VPS env as BORDERLESS_CLIENT_SECRET]
- **Redirect URIs (exact match):**
  - https://applika.dev/api/auth/borderless/callback
- **Scopes:** `openid profile email offline_access`
- **Token endpoint auth:** `client_secret_basic` (HTTP Basic)
- **PKCE:** required (`S256`)

## Flow
1. Redirect the user to `https://api.borderlesscoding.com/api/auth/oauth2/authorize` with `response_type=code`, the scopes above, a random `state` and a PKCE `code_challenge` (`S256`).
2. The user signs in with their Borderless account. There is no consent screen for this app.
3. Borderless redirects back to your redirect URI with `code` and `state`. Check that `state` matches.
4. From your backend, `POST https://api.borderlesscoding.com/api/auth/oauth2/token` with `grant_type=authorization_code`, `code`, `redirect_uri` and `code_verifier`, authenticating with HTTP Basic (`client_id:client_secret`).
5. You receive an `access_token` (1 hour), an `id_token` (10 hours) and a `refresh_token` (30 days).

## User data (id_token claims)
| Claim | Meaning |
| --- | --- |
| `sub` | Borderless user id. Use it as your user key, not the email. |
| `name`, `picture`, `preferred_username` | Profile |
| `email`, `email_verified` | Email |
| `borderless_membership` | Membership plan: `FREE`, `STARTER`, `BASE` or `PSP` |

## Keeping membership up to date
To re-check access, `POST https://api.borderlesscoding.com/api/auth/oauth2/token` with `grant_type=refresh_token` and read the membership claim from the new `id_token`. Store the new `refresh_token` every time (it rotates).
Refresh works for 30 days after login. After that, or if access was revoked, you get `invalid_grant` and the user must sign in with Borderless again.
Don't use `/oauth2/userinfo` for this: access tokens stop working when the user's Borderless session ends.
```

3. "i need a plan for this with docs updates (prds and adrs) and a proper ticket to implement this change with a double (fake api borderless to handle the auth flow during tests)"

## Clarifications

- Q: How does the OpenID Connect rework reach production? (Recommended: hold develop→main and ship once; alternative: ship PRD 0018 first, this later) → A: "hold main, we're going to develop this change in a branch called "labs01-147-v2" and then when everything tested we're going to merge into develop through a PR, the merge to main wont be did here"
- Q: What happens when Borderless refuses the refresh (`invalid_grant`: 30 days after sign-in, or revoked)? (Recommended: keep the applika session, lock reports, "Reconnect with Borderless"; alternative: end the applika session) → A: "end applika session in web and cli, both together"
- Q: Amendment to the answer above, and rules for storing the Borderless tokens (owner, 2026-11-06, unprompted; the latest answer, it supersedes the command-line half of the answer above) → A: "let's keep the cli session active, but when the user try to access some resouce locked behind a membership, interrup the operation and tell the user to reauthenticate in the web platform to get a new valid refresh token to borderless api, never store the access token in the database, save it on redis, only the refresh token is saved in the db, if the access token is expired or not exists in redis, use the refresh to get a new one. no not save the refresh token directly without encryption (always decrypt on use/ use lru cache to avoid repetitive decryption of the same token)"
- Q: How often does applika refresh the Borderless grant to re-read the membership? → A: "At most once an hour (Recommended)". Option text: "On a session refresh (web ~every 10 min, CLI on use), call Borderless only if the last refresh is over 1 hour old (the access token's life). A revoked user is logged out within about an hour of activity. ~24 calls/day per active user, refresh-token rotation stays calm, the existing row lock serialises two tabs."
- Q: What does the new STARTER membership give? → A: "No badge, like FREE (Recommended)". Option text: "STARTER maps to no badge: no chip, no reports, no webhook routing. No CHECK change, no new badge key, nothing in the web."
- Q: What does an applika logout do to the Borderless grant? → A: "This session only (Recommended)". Option text: "Logout ends that one session (today's ADR-0019 rule); the CLI stays signed in. When the user's last applika session ends, applika revokes the Borderless refresh token (best-effort). The Borderless browser session is untouched, so signing in again is one click."
- Q: Sign-off (LuisMSoares, 2026-11-06): approve this PRD, every assumption in `## Assumptions` (21) and the expand-first exception in plan 0020 `## Release`, and accept ADR-0026? → A: "approve and accept"
- Q: Build review (2026-11-07): how are the sign-in `state`, the path to redirect to after sign-in and the attempt cookie kept? → A: "applika uses it's own access and refresh token, the refresh token returned by borderless api is stored in the database after beign encrypted, the access token is stored in redis to use when i need to check if the user still holds their membership (BASE or PSP), I only use the refresh token when this access token expires or when redis no longer holds the access token, and in case of refresh token is also expired, the user session in the web app is revoked and when user is using the cli and is operating with a feature that requires a membership level, they receive an alert/error/message telling to reauthenticate in the web app to refresh their membership status. The access token which controls if the users is authenticated in the web app is still stored in redis, the refresh token returned by the applika api is still a random uuid, now, about the oauth code, generate a random uuid at the start of the flow, and during callback check if this code is the same used in the begining, save this uuid in redis as well, same to the path to redirect after user authentication"
- Q: Build review (2026-11-07): the attempt cookie `__borderless_login` is applika's own, and removing it would allow login CSRF. Keep it? → A: "Keep it, rename (Recommended)". Option text: "Rename it `__applika_login` so it's clearly applika's own. It holds only a random value checked against Redis, and stops login CSRF. Two sign-ins in two tabs keep working: the later one completes."
- Q: Build review (2026-11-07): the end-to-end test caught the command-line sign-in's return to the terminal with a real local listener, because a Playwright route does not see a redirect target. Accept? → A: "how playwright dont handle redirects, find a new way to test this ... find a new way to test this flow"
- Q: Build review (2026-11-07): the fake Borderless ran in the end-to-end stack on the API image. Accept? → A: "never store this in the original api image, this is only used during testing"
- Build review (2026-11-07), accepted as built by the owner: after a refused grant the user's other web sessions land on a plain sign-in page; a membership check within 5 seconds of a failed refresh does not call Borderless again; the attempt cookie is kept on an expired or foreign attempt, so the newer of two tabs completes.

## Problem

PRD 0018 signs people in by taking their Borderless email and password and checking them with Borderless from applika's server, because Borderless then offered no single sign-on. That design makes applika handle passwords, gets no refresh token, and makes every reporting member type their Borderless password again about once a week to keep their badge. Borderless now offers a standard OpenID Connect sign-in for applika, with a refresh token and the membership inside the identity it returns. PRD 0018 has not reached production yet, so the password sign-in is replaced before any user depends on it, and the membership is kept current without any password.

## Users and stories

- US1 (P1) A Borderless member presses "Sign in with Borderless", signs in on Borderless's page (or is already signed in there), and lands in applika signed in.
- US2 (P1) A GitHub-era user whose verified Borderless email matches their old account signs in this way and finds all their old data.
- US3 (P1) A command-line user runs `applika login`, signs in on Borderless's page in the browser, and the command-line tool gets its own session while the browser's applika session stays as it was.
- US4 (P1) A BASE or PSP member keeps their badge and the biweekly reports for as long as their Borderless access lives, without typing any password, and a membership change on Borderless shows up within about an hour of activity.
- US5 (P1) A user whose Borderless access ended (30 days after their last sign-in, or revoked by Borderless) is signed out of the web and asked to sign in again there.
- US6 (P1) In the same situation, the user's command-line tool stays signed in; when it asks for something that needs the membership, it is stopped with a message to sign in again on the web, and after that web sign-in it works fully again.
- US7 (P2) A user signs out of their last applika session; applika gives its Borderless access back, and signing in again is one click while their Borderless browser session lives.
- US8 (P2) A FREE or STARTER member signs in and has no badge and no reports section.
- US9 (P2) A developer, or the test suite, runs every sign-in, refresh and sign-out path against a fake Borderless, never the real one.

## Requirements

- R-001 The system signs users in only through Borderless's OpenID Connect sign-in, as a confidential client from its own server. Applika never asks for, receives or stores a Borderless password. (spec: "Integrate with any OpenID Connect library as a **confidential client** (server-side only)")
- R-002 Borderless returns every sign-in to `https://applika.dev/api/auth/borderless/callback`, exactly. (owner: "the callback url i asked to configure in their system is this one here /api/auth/borderless/callback"; spec: "Redirect URIs (exact match)")
- R-003 Every sign-in attempt carries a fresh random state and a PKCE S256 challenge. The return is accepted only once, only in the browser that started the attempt, only within ten minutes, and only when its state matches. (spec Flow 1 and 3: "a random `state` and a PKCE `code_challenge` (`S256`)", "Check that `state` matches")
- R-004 The system accepts a Borderless identity only from an identity token it has verified as signed by Borderless, issued to applika, unexpired, and tied to that one sign-in attempt. (spec: "Integrate with any OpenID Connect library")
- R-005 The system knows a Borderless account by its `sub`, never by its email. (spec: "Use it as your user key, not the email.")
- R-006 A sign-in opens the applika account bound to that Borderless account. With none, it binds and opens the account whose email equals the verified Borderless email, ignoring case. With none, it creates a new account. A binding never moves, and the refusals of PRD 0018 R-008 are kept. (PRD 0018 R-007, R-008)
- R-007 A Borderless account whose email is not verified is refused, with a message asking the user to verify it on Borderless. (spec claim `email_verified`; PRD 0018 R-004)
- R-008 The membership in the identity becomes the badge: BASE gives the BASE badge and PSP the PSP badge, compared ignoring case. FREE, STARTER, any other value or no value gives none. A user holds at most one. (spec: "`borderless_membership` | Membership plan: `FREE`, `STARTER`, `BASE` or `PSP`"; clarification: "No badge, like FREE")
- R-009 The system reads the membership at every sign-in, and again whenever it holds no live Borderless access token for the user, by refreshing applika's Borderless grant. It checks at every session refresh, on the web and in every command-line version, and at every request for something that needs the membership. An access token lives about an hour, so Borderless is called about once an hour per active user. The system never uses Borderless's user-info endpoint for this. (spec: "To re-check access, `POST ... /oauth2/token` with `grant_type=refresh_token`", "Don't use `/oauth2/userinfo`"; clarifications: "At most once an hour", "if the access token is expired or not exists in redis, use the refresh to get a new one")
- R-010 The Borderless refresh token is kept only in the database, always encrypted, and decrypted only when it is used. The system stores the newest one every time it receives one. (spec: "Store the new `refresh_token` every time (it rotates)."; clarification: "only the refresh token is saved in the db", "no not save the refresh token directly without encryption (always decrypt on use")
- R-011 The Borderless access token is never stored in the database. It is kept, encrypted, in the short-term store for no longer than its own lifetime. (clarification: "never store the access token in the database, save it on redis")
- R-012 No Borderless token, authorization code, state value or client secret reaches the browser, the command-line tool, a response body or a log. (spec: "confidential client (server-side only)"; PRD 0018 R-002)
- R-013 When Borderless refuses applika's grant, 30 days after the sign-in or because access was revoked, the system ends every web session of that user and asks them to sign in again on the web. (clarification: "end applika session in web and cli, both together", amended: "let's keep the cli session active")
- R-014 In the same case, the user's command-line sessions stay signed in. A command-line request for something that needs the membership is stopped, and the answer tells the user to sign in again on the applika website. The next sign-in restores member access to every session of the user. (clarification: "when the user try to access some resouce locked behind a membership, interrup the operation and tell the user to reauthenticate in the web platform to get a new valid refresh token")
- R-015 A membership refresh that fails because Borderless is slow, failing or rate-limiting never blocks or ends an applika session. The badges stay as last read and keep counting, and the next check tries again. (PRD 0018 R-013)
- R-016 A recorded badge counts as held while the user's Borderless binding is in good standing. It no longer depends on a 7-day token, and no user ever types a password to keep reports. (spec "refresh_token (30 days)"; replaces PRD 0018 R-014, R-036, R-037)
- R-017 Logging out ends only that one session. When it ends the user's last open applika session, the system revokes its Borderless refresh token, best-effort, and leaves the user's Borderless browser session alone. (clarification: "This session only")
- R-018 A web sign-in uses the user's Borderless browser session when one exists, so signing in again is one click. (clarification option text: "signing in again is one click")
- R-019 A command-line sign-in always asks the user to sign in on Borderless, even when the browser is already signed in there, and never opens, ends or replaces the browser's own applika session. (ADR-0024 §7; Assumptions)
- R-020 Installed command-line versions 0.1.4 to 1.1.0 keep signing in, refreshing and signing out with no change on their side. (owner rule: installed CLI versions keep working)
- R-021 When a sign-in cannot complete, the user lands on applika's sign-in page with a message, in their language, that says what happened and what to do: the attempt expired or came from another browser, Borderless did not complete it, Borderless is unavailable, the answer could not be verified, the email is unverified, or the account cannot be bound. (ADR-0025; R-003, R-004, R-007)
- R-022 The password sign-in and the membership confirmation by password are removed. No applika screen shows a Borderless password field. (owner input 1: "how the authentication with borderless api needs to work")
- R-023 Web sessions ended because Borderless refused the grant appear as ended in the user's Devices list. (clarification: "end applika session in web")
- R-024 Every test and the end-to-end stack run sign-in, membership refresh, refusal and sign-out against one fake Borderless that plays the whole flow: discovery, a sign-in page where the test picks the account, the code exchange with its PKCE and client checks, refresh with rotation, refusal on demand, keys and revocation. No test reaches the real Borderless. (owner: "a double (fake api borderless to handle the auth flow during tests)")

## Permissions and tenancy

A sign-in opens only the applika account bound to the returning Borderless `sub`, or the account that R-006 resolves, and nobody else's. A returning sign-in is accepted only in the browser session that started it, only once and only for ten minutes, so a link captured by someone else opens nothing. A command-line sign-in hands its result only to the command-line login that started it, and it never touches the browser's own applika session.

When Borderless refuses a grant, only that user's web sessions end, and every one of them ends. That user's command-line sessions stay, but they are refused anything that needs the membership until the user signs in again. A logout revokes only the caller's own Borderless grant, and only when the caller has no other open session. Administrator status grants nothing extra on another user's sessions, binding, tokens or badges.

The server never returns a Borderless refresh token, access token, identity token, authorization code or the client secret to anyone, the user included. The fake Borderless and its test controls exist only in the test stack and in local runs, never in the API or in production.

## Edge cases

- A user already signed in on Borderless in this browser presses "Sign in with Borderless": they come back signed in without seeing a Borderless screen.
- A command-line sign-in in a browser signed in to Borderless: Borderless still asks the user to sign in; the browser's applika session is unchanged.
- The user cancels on Borderless, or Borderless refuses the sign-in: they land on applika's sign-in page with "Borderless did not complete the sign-in".
- The return link is opened twice, in another browser, or more than ten minutes after the attempt started: refused, the user is asked to start again, and nothing is created.
- Two sign-in attempts in two tabs of one browser: the later one completes; the earlier one is asked to start again.
- Borderless is down at sign-in: "Borderless is unavailable, try again later"; open sessions keep working.
- Borderless is down when the membership is checked: the session refreshes or the request goes on with the badges as last read, and the next check tries again.
- The short-term store is unavailable when a membership-locked request checks the access token: the system refreshes from the database instead, so the check still works.
- A member moves from PSP to BASE on Borderless: the badge follows once the current access token has expired, at the next session refresh or membership-locked request.
- 30 days after the user's last sign-in on any device, or after Borderless revoked them: at the next membership check, every web session ends and the web shows "Your Borderless sign-in has ended" on the sign-in page; command-line sessions stay signed in.
- A command-line user in that state asks for something that needs the membership: the request is refused with "Your Borderless sign-in has ended. Sign in again on the applika website"; everything else in the command-line tool keeps working. No installed command-line version calls such a route today.
- That user signs in again on the web, or runs `applika login`: the new Borderless access unlocks every session at its next request.
- Signing in on a new device restarts the 30 days for all of that user's devices, because applika keeps one Borderless grant per user.
- A user logs out of the web while the command-line tool is signed in: the command-line tool stays signed in and Borderless is not told.
- A user ends their last session, by logging out or by revoking it in the Devices list: Borderless is told to drop applika's refresh token; the Borderless browser session stays, and the next web sign-in is one click.
- A user deletes their account: every session ends, applika's Borderless refresh token is revoked best-effort, and the binding, the stored access token and the badges go with the account.
- A Borderless identity whose email is held, ignoring case, by an applika account bound to another Borderless account: refused as in PRD 0018; nothing is created.
- An account bound by the PRD 0018 password sign-in, which exists only in development databases: its web sessions end at its first membership check, and it keeps its binding when it signs in again through Borderless.
- Borderless answers a sign-in without a refresh token: the sign-in fails with "could not be verified", because applika could not keep the membership current.
- The encryption secret for Borderless tokens is lost or replaced: every active user's web sessions end within about an hour of activity, and member features are locked on the command line until the user signs in again.

## Non-goals

- Ending the Borderless browser session from applika, or acting on Borderless's back-channel logout.
- Borderless's user-info endpoint, using the access token for anything beyond marking the membership fresh, or the `picture` claim.
- A badge for STARTER, or any badge other than BASE and PSP.
- A scheduled job that re-reads memberships.
- Applika passwords, sign-up or password reset.
- Changes to the GitHub data restore, the report webhooks or their routing (PRD 0018).
- A new command-line command or a new command-line version.
- A beta gate for this change (ADR-0024 §9).
- Merging into `main` or deploying to production from this branch.

## Success signals

- No Borderless password reaches applika: no password field exists in the web and no request carries one.
- No Borderless access token is ever found in the database, and no refresh token is ever stored unencrypted.
- A BASE or PSP member uses the biweekly reports for 30 days without typing anything.
- A membership change on Borderless shows in applika within about one hour of activity.
- A user Borderless revoked loses every web session within about an hour of activity, and their command-line tool is refused member features, with a message naming the website, until they sign in again.
- `applika whoami` from command-line versions 0.1.4, 1.0.1 and 1.1.0 works after a sign-in through Borderless, and keeps working after Borderless refuses the grant.
- Applika calls Borderless's token endpoint about 24 times a day at most per active user.
- The whole flow runs in the test suite and the end-to-end stack against the fake Borderless, and no test reaches the real one.
- No authorization code, state, Borderless token or client secret appears in a log.

## Assumptions

- A command-line sign-in asks for the Borderless sign-in even when the browser is signed in there (ADR-0024 §7 kept); a web sign-in uses Borderless's own session.
- On Borderless's refusal, only web sessions end, and only they carry the new "Borderless ended it" reason; command-line sessions stay (owner amendment, 2026-11-06).
- A command-line request for something that needs the membership gets a refusal with its own error code, whose message tells the user to sign in again on the applika website. Today only the biweekly reports need the membership, and no command-line version calls them; command-line version 1.1.0 prints the server's message on such a refusal.
- The access token lives in the short-term store (Redis), one per user, for exactly its own lifetime, encrypted with the same secret as the refresh token, because a dump of that store exposes it like a database dump would.
- The presence of that access token replaces the "last refresh over an hour old" check of the third clarification: present means no call to Borderless; missing or expired means a refresh, at a session refresh or at a membership-locked request.
- The refresh token is decrypted on use through a small in-memory cache of recently used tokens, so the same token is not decrypted again and again; the plan names its size and cost.
- When the short-term store cannot be reached, the access token counts as missing and the system refreshes from the database, so the membership check keeps working.
- Borderless's `sub` is the same id its password API returned; bindings made by PRD 0018 in development keep matching. No production account has a binding yet.
- A missing or unknown membership value revokes the Borderless badge, as FREE does (PRD 0018 rule kept).
- Applika keeps one Borderless grant per user: each new sign-in, web or command line, replaces the stored refresh token and restarts the 30 days; the replaced token is not revoked.
- A failed refresh stores no access token, so the next session refresh or membership-locked request tries again.
- Deleting an account revokes applika's Borderless refresh token, best-effort (PRD 0018's assumption "Deleting an account revokes nothing at Borderless" is replaced).
- Revoking a device other than the last one tells Borderless nothing.
- A sign-in attempt lives ten minutes.
- In two parallel attempts in one browser, the newer attempt wins.
- A new account takes Borderless's display name as its username, else the Borderless username.
- Web sessions ended by Borderless's refusal show as "revoked" in the Devices list.
- A stored refresh token applika can no longer decrypt (encryption secret lost) is handled like Borderless's refusal.
- The sign-in page keeps the "Create a Borderless account" link and drops the hint about Borderless accounts without a password.
- The PRD 0018 state "sign in again to confirm your membership" is replaced by the "sign in again on the applika website" refusal; a web page that meets it shows a "Sign in again" button instead of a password form.
- The Borderless client lists only the production return address, so development and the test stack use the fake; checking against the real Borderless before release needs Borderless to add a development return address (plan `## Open`).
