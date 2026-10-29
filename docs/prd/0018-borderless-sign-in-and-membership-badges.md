---
PRD: 0018
title: Borderless sign-in, membership badges and badge-routed reports
status: Approved
owner: LuisMSoares
created: 2026-10-29
related-adrs: [0002, 0004, 0005, 0009, 0010, 0013, 0015, 0018, 0019, 0024]
related-prds: [0001-auth-users-profile.md, 0003-statistics-reports-cycles.md, 0009-discord-account-link.md, 0013-beta-features.md, 0014-cli-device-sign-in-and-devices.md]
---

# PRD 0018 — Borderless sign-in, membership badges and badge-routed reports

## In the owner's words

As an applika user who belongs to the Borderless community, I want to sign in to applika with my Borderless email and password instead of GitHub, so that my BASE or PSP membership shows up as a badge on my account and gives me access to the biweekly reports. If I used applika before with GitHub, I want my old data back: automatically when my Borderless email matches my old account's email, or by linking my GitHub account from my profile when it doesn't. As an admin, I want to assign each report webhook to a badge (BASE or PSP), so that a member's report goes to the webhooks of their community. Discord linking goes away. Build it as decided in docs/adr/0024-borderless-sole-login-and-membership-badges.md, in the three releases that ADR describes (migration A, code B, migration C), and settle its open questions before the plan is final.

## Clarifications

- Q: Login shape (ADR-0024 grilling) → A: "replace github login, and replace discord link to github link, this is necessary to restore all user data from old github login".
- Q: Keeping badges current (ADR-0024 grilling) → A: "do just like was did for discord, prefer storing refresh token rather to access token".
- Q: Lost membership (ADR-0024 grilling) → A: "Revoke, keep history (Recommended)".
- Q: Restoring old data (ADR-0024 grilling) → A: "Email match, else Link GitHub (Recommended)".
- Q: Discord (ADR-0024 grilling) → A: "remove discord integration, the reports feature will be available only to users with "psp" or "base" badges, the webhook will use those roles to determine which webhook to report the status".
- Q: Beta gate (ADR-0024 grilling) → A: "Gate nothing, exception (Recommended)".
- Q: Who can open the biweekly reports after Release B? (ADR-0024 open question 3) → A: "Badge holders only (Recommended)". Option text: "The ADR as written. Without BASE/PSP, list, read and submit all answer 403 badge_required and the web hides the section. Past reports stay in the database and come back if the badge is regained. One rule, no extra branch. Cost: an admin needs a badge to test reports."
- Q: Where does the badge render in the web? (story "shows up as a badge on my account" vs ADR-0024 non-goal "Showing badges anywhere but GET /users/me") → A: "Profile and user menu (Recommended)". Option text: "A BASE/PSP chip next to your name in the user menu and on the profile header, read from /users/me, visible only to you. The profile also shows a 'sign in again to refresh your badge' notice when Borderless needs reconnecting. The ADR non-goal becomes 'no badge on any other user's view'. Cost: one small component and a ui-designer pass."
- Q: Does a brand-new account get prompted to link GitHub before it creates data? (ADR-0024 refuses the restore with 409 once the new account owns anything) → A: "Prompt on first sign-in (Recommended)". Option text: "When Borderless sign-in creates a new account, the web shows a one-time screen first: 'Used applika with GitHub before? Link GitHub to restore your data' or 'Start fresh'. The profile Link GitHub button stays as well. Cost: one screen plus a 'prompt seen' flag on the user, added in Release A."
- Q: Does applika keep the GitHub token when a user links GitHub from the profile? (ADR-0024 open question 5) → A: "the github link only exists to fetch old user data, after this step the link have no pourposes"
- Q: How often does applika re-read a user's Borderless membership? (ADR-0024 open question 4; options were daily job + every sign-in, hourly job + every sign-in, sign-in only) → A: "every sign-in and token refresh"
- Q: Does Borderless return a refresh token at sign-in, and how long does its access token live? (ADR-0024 open question 1) → A: the owner's probe of the live API, 2026-10-29, verbatim: "Token keys found in body: ['accessToken']", "Refresh token in body: False", "data.token.accessToken: str len=32 (not a JWT)", "data.token.expiresIn: int = 604800". No refresh token; the access token lives 7 days from the password sign-in.
- Q: Where is the membership in Borderless's profile answer, and how is it spelled? (ADR-0024 open question 2) → A: the owner's probe, 2026-10-29, verbatim: "membership at data.user.membership: 'PSP'", "membership at data.membership:      None", "membership at membership:           None". The profile also carries "data.user.github: str", "data.user.hasPassword: bool" and "data.user.authProviders: list[2]".
- Q: "Borderless returns no refresh token, and its access token dies 7 days after a password sign-in. Applika sessions slide 7 days on every refresh, so after day 7 an active user's membership can no longer be read. What happens to their BASE/PSP access then?" → A: "Lock reports until re-sign-in (Recommended)". Option text: "The applika session goes on. The badge counts as held only while the Borderless token is alive. After expiry, the user menu and profile show 'sign in again to confirm your membership', and the Reports page shows that prompt plus the password form instead of reports. Every reporting member types their Borderless password about once a week. No badge history churn: the badge row stays and the gate checks the token's state."

## Problem

Applika signs people in with GitHub and routes biweekly reports through each user's linked Discord account. The owner's
community lives on Borderless, which knows who is a BASE or a PSP member. The owner wants Borderless to be the way in,
the membership to become a badge on the account, and the badge to decide who may use the biweekly reports and which
community channels receive them. People who used applika with GitHub must get their data back, and the Discord link,
which only existed to route reports, goes away.

## Users and stories

- US1 (P1) A Borderless member signs in with their Borderless email and password and lands in applika.
- US2 (P1) A GitHub-era user whose Borderless email matches their old account signs in and finds all their old data.
- US3 (P1) A BASE or PSP member sees their badge in the user menu and on the profile header, and opens, reads and submits biweekly reports.
- US4 (P1) A member submits a report and it is posted to every webhook assigned to their badge.
- US5 (P1) An administrator assigns each report webhook to BASE or PSP, and adds, changes or removes webhooks.
- US6 (P1) A command-line user runs `applika login` and completes it on applika's Borderless sign-in page.
- US7 (P2) A brand-new account's first sign-in shows a one-time screen: restore your data from GitHub, or start fresh.
- US8 (P2) A GitHub-era user whose emails differ restores their old data by authorising GitHub from that screen or the profile.
- US9 (P2) A user without BASE or PSP sees no report section, and the API refuses the report routes.
- US10 (P2) A member whose membership changes on Borderless sees the badge follow at the next sign-in or session refresh.
- US11 (P2) A member whose Borderless access lapsed, about a week after their password sign-in, sees "sign in again to confirm your membership" and confirms it with their Borderless password from the Reports page or the profile, staying signed in.

## Requirements

- R-001 The system signs users in only with a Borderless email and password. GitHub sign-in and Discord linking no longer exist. (owner: "sign in to applika with my Borderless email and password instead of GitHub"; "Discord linking goes away")
- R-002 The system checks the credentials with Borderless from its own server, never stores or logs the Borderless password, and never hands a Borderless token to the browser or the command-line tool. (ADR-0024 §1)
- R-003 A wrong email or password answers "Invalid email or password", whatever the cause. (ADR-0024 §1)
- R-004 An email that Borderless has not verified is refused with a message asking the user to verify it on Borderless. (ADR-0024 §1)
- R-005 When Borderless is unreachable or failing, sign-in fails with a "try again later" message and sessions already open keep working. (ADR-0024 §1, Consequences)
- R-006 When Borderless rate-limits a sign-in, or one email fails too often, sign-in is refused with the time to wait. (ADR-0024 §1)
- R-007 A sign-in opens the applika account bound to that Borderless account. With none, it binds and opens the account whose email equals the Borderless email, ignoring case. With none, it creates a new account. (owner: "automatically when my Borderless email matches my old account's email")
- R-008 A binding never moves on sign-in. A sign-in whose email belongs to an applika account bound to another Borderless account is refused, and no second account is created with that email. (ADR-0024 §1)
- R-009 Every session open before this release ends, and every user signs in again with Borderless. (ADR-0024 §2)
- R-010 Installed command-line tools keep working; their sign-in completes on applika's Borderless sign-in page. (ADR-0024 §7; owner rule: installed CLI versions keep working)
- R-011 The system turns the membership in Borderless's profile answer into a badge: BASE gives the BASE badge, PSP gives the PSP badge, compared ignoring case, and anything else, or no value, gives none. A user holds at most one. (owner: "my BASE or PSP membership shows up as a badge"; clarification: probe "membership at data.user.membership: 'PSP'")
- R-012 The system reads the membership at every Borderless sign-in and at every session refresh, on the web and on every command-line version, for as long as the Borderless access from the last password sign-in is alive. That access lives 7 days and cannot be renewed without the password. (clarifications: "every sign-in and token refresh"; probe "Refresh token in body: False", "data.token.expiresIn: int = 604800")
- R-013 A membership read that fails because Borderless is slow, failing or rate-limiting never blocks the sign-in or the refresh, and the user keeps their badge while the Borderless access is alive. (ADR-0024 §4)
- R-014 A badge counts as held only while the Borderless access is alive and Borderless has not refused it. When the access expires, or Borderless refuses it, the badge stays recorded but stops counting until the user signs in again with their Borderless password; nothing is revoked by that alone. (clarification: "Lock reports until re-sign-in"; "No badge history churn")
- R-015 A membership read that answers another membership revokes the badge and keeps its history; regaining it grants the badge again. (clarification: "Revoke, keep history")
- R-016 The signed-in user sees their own badge next to their name in the user menu and on the profile header while it counts as held. No other user's view shows a badge. (clarifications: "Profile and user menu"; "Lock reports until re-sign-in")
- R-017 While a recorded badge does not count because the Borderless access expired or was refused, the user menu and the profile show "sign in again to confirm your membership". (clarification: "Lock reports until re-sign-in")
- R-018 The profile data the API returns lists the user's recorded badges and whether they count, with the state and expiry of the Borderless access. (ADR-0024 §5; clarification: "Lock reports until re-sign-in")
- R-019 When Borderless sign-in creates a new account, the web first shows a one-time screen offering "restore your data from GitHub" or "start fresh". Either choice is remembered, and the screen never shows again. (clarification: "Prompt on first sign-in")
- R-020 The profile offers "Restore data from GitHub" only to an account that has no GitHub identity on record. (clarification: "after this step the link have no pourposes"; Assumptions)
- R-021 A restore asks GitHub only for the user's public identity, uses GitHub's answer once to find the old account, and keeps no GitHub token. (clarification: "the github link only exists to fetch old user data")
- R-022 When the GitHub identity belongs to an old account with no Borderless binding and the current account holds no data, the system moves the Borderless binding and badges to the old account, keeps the user signed in as the old account and deletes the empty new account. (owner: "I want my old data back ... by linking my GitHub account from my profile")
- R-023 When the current account already holds data (applications, drafts, cycles, reports, CVs or timeline events), the restore is refused and the profile explains that two accounts that both hold data are not merged. (ADR-0024 §3)
- R-024 When the old account already has a Borderless binding, the restore is refused with an explanation. (ADR-0024 §3)
- R-025 When the GitHub identity belongs to no applika account, nothing is stored and the user is told no old account was found. (clarification: "after this step the link have no pourposes")
- R-026 Every account that signed in with GitHub before this release keeps its GitHub identity on record, so a restore can find it. (ADR-0024 §3)
- R-027 Only a user who holds BASE or PSP can list, read or submit biweekly reports. A user with no recorded badge, administrators included, is refused, and the web hides the report section. (clarification: "Badge holders only")
- R-036 A user whose recorded badge does not count (R-014) keeps the Reports entry; the Reports page shows "sign in again to confirm your membership" and the Borderless password form instead of reports, and the API refuses the report routes with a reason distinct from "no badge". (clarification: "Lock reports until re-sign-in")
- R-037 Confirming the membership with the Borderless password, from the Reports page or the profile, renews the Borderless access, reads the membership and keeps the user's current applika session; it must be the Borderless account already bound to the user. (clarification: "Lock reports until re-sign-in"; ADR-0024 §1 "a binding never moves")
- R-038 The system never uses the GitHub account named in the user's Borderless profile to find or restore an applika account. (probe: "data.user.github: str" is self-declared on Borderless and unverified)
- R-028 Reports stored before a user lost their badge are kept and come back when the badge is regained. (clarification: "Badge holders only")
- R-029 An administrator can list, add, change and remove report webhooks. Each holds a webhook address, a badge (BASE or PSP) and an optional label. (owner: "As an admin, I want to assign each report webhook to a badge (BASE or PSP)")
- R-030 A submitted report is saved first, then posted to every webhook whose badge the user holds. The submission succeeds whatever the webhooks answer. (owner: "a member's report goes to the webhooks of their community")
- R-031 The report webhooks configured before this release are carried over without a badge and receive nothing until an administrator assigns one. (ADR-0024 §6)
- R-032 After a webhook is saved, the system shows only a masked form of its address. (ADR-0024 §6)
- R-033 Report and feedback posts carry the applika username and mention nobody. (ADR-0024 §6)
- R-034 Feedback keeps going to its one configured feedback webhook. (ADR-0024 §6)
- R-035 The retired GitHub and Discord data is set aside, never deleted, by this change. (ADR-0024 §8; owner's non-destructive migration order)

## Permissions and tenancy

A signed-in user may read their own badges, their own Borderless binding state and their own restore offer, and nobody
else's. No route shows a badge, a Borderless email or a binding of another user, and administrator status grants nothing
extra on them. Badges are not a role: a badge gives no right over another user's data, and every user still reads and
writes only their own rows. A badge is the one entitlement to the biweekly reports, it counts only while the user's
Borderless access is alive, and an administrator without a badge is refused like any other user. A user may confirm a
membership only with the Borderless account already bound to their own applika account.

A restore may be started only by the signed-in user for their own account, and its GitHub answer is accepted only in the
browser session of the user who started it, only once and only for a short time. A restore that succeeds deletes only the
caller's own empty account, and it takes an old account only when that account has no Borderless binding.

Only an administrator may list, add, change or remove report webhooks. A non-administrator is refused and sees nothing
of them. After saving, an administrator sees only a masked address. A report reaches a webhook only when the submitting
user holds that webhook's badge at submission time, and a post names only the user who submitted it.

The server never returns the Borderless password, the Borderless tokens or a GitHub token to anyone, the user included.

## Edge cases

- A GitHub-era user whose email matches signs in: the old account is bound, and the next sign-ins use the binding even if the Borderless email changes later.
- Two GitHub-era accounts hold emails that differ only by letter case: the one with the same spelling as the Borderless email is bound; when neither matches exactly, sign-in is refused and the user is asked to contact support.
- A new Borderless account's email is already held, ignoring case, by an applika account bound to another Borderless account: sign-in is refused (R-008); no account is created.
- The Borderless membership is FREE, missing or an unknown value: the user signs in with no badge and no report section.
- Borderless answers the sign-in but the membership read fails: the user signs in; badges stay as they were (none for a new account).
- Borderless is down during a session refresh: the session refreshes; badges stay and keep counting while the access is alive; the failure is recorded.
- A member drops from PSP to BASE: at the next refresh while the access is alive the PSP badge is revoked and the BASE badge granted; their next report goes to BASE webhooks. After the access expired, the change shows at the next confirmation.
- A member keeps using applika for more than 7 days without typing the Borderless password: the session goes on, the Reports page asks to confirm the membership, and the API refuses reports with the "unconfirmed" reason until they do.
- A member confirms with a Borderless account other than the one bound to them: refused (R-037); nothing changes.
- A Borderless account that has no password (signed up through another provider) tries to sign in: Borderless refuses it, the user sees "Invalid email or password", and the sign-in page's hint tells them to set a password in their Borderless account first.
- A member loses their badge while a report page is open: the next report request is refused and the section hides on the next profile load.
- A new user starts a restore but cancels on GitHub, or GitHub fails: the profile shows the failure; the first-sign-in screen does not return.
- A new user created data through the command-line tool before seeing the screen: a restore is refused (R-023).
- The GitHub identity belongs to the caller's own old account that is already bound to another Borderless account: refused (R-024).
- The new account's session expired while on GitHub's consent screen: the restore fails and the user signs in again.
- A browser already signed in is used to complete a command-line sign-in: the sign-in page still asks for the Borderless password, and the browser's own session stays as it was.
- A carried-over webhook has no badge: it receives no report until an administrator assigns one.
- An administrator adds the same webhook address twice, or an address that is not a Discord webhook: refused with a message.
- A user deletes their account: their Borderless binding, badges and GitHub identity record go with it.
- The Borderless encryption secret is lost or replaced: every binding is marked as needing a fresh sign-in, and no badge counts until each user confirms with their password.

## Non-goals

- Applika passwords, applika sign-up, password reset or email codes.
- Any sign-in other than Borderless; GitHub or Discord sign-in.
- Merging two applika accounts that both hold data, or an administrator tool to do it.
- Keeping a GitHub link after a restore, or an Unlink GitHub action.
- Badges granted by administrators, or from any source other than Borderless.
- A badge on any other user's view, including administrator screens.
- Mentions in report or feedback posts; routing feedback by badge.
- A background job that re-reads memberships on a schedule, or keeping Borderless access alive past 7 days without the password.
- Using the GitHub account a user names in their Borderless profile; it is self-declared and unverified, and trusting it would let anyone claim another user's data.
- Encryption-key rotation.
- Command-line commands for badges or webhooks.
- A beta gate for this change (ADR-0024 §9).

## Success signals

- A GitHub-era user whose email matches sees their old applications on their first Borderless sign-in, with no extra step.
- No Borderless password, Borderless token or GitHub token appears in a log, a response or the database unencrypted.
- A PSP member's report reaches the PSP webhooks and no BASE webhook.
- A membership change on Borderless shows in applika within one session refresh (about ten minutes on the web) while the Borderless access is alive, else at the next confirmation.
- A reporting member confirms their membership in under 30 seconds from the Reports page, without losing their session.
- `applika whoami` from command-line versions 0.1.4, 1.0.1 and 1.1.0 works after the user signs in again.
- No report submission fails because a webhook failed.
- No restore ever leaves a user with two accounts that both hold data.

## Assumptions

- Restore is offered, on the profile and on the first-sign-in screen, only to an account with no GitHub identity on record; accounts that signed in with GitHub before this release never see it.
- There is no Unlink GitHub action; an old account's GitHub identity stays on record, used only to find that account in a later restore.
- A restore that finds no old account stores nothing; the user may try with another GitHub account.
- The first-sign-in screen counts as seen as soon as the user picks either option, even when the restore then fails.
- After a restore or an email match, the account keeps its own username and email; the Borderless email is kept with the binding.
- A new account takes Borderless's display name as its username, else the Borderless username.
- Emails longer than applika's 100-character limit are refused at sign-in.
- A membership read during a session refresh waits a few seconds at most and is not retried within that refresh.
- A refresh for a user who has never signed in with Borderless ends that session and asks for a Borderless sign-in; this is how R-009 reaches devices whose session would otherwise slide on.
- One email may fail sign-in 5 times in 15 minutes before it is made to wait.
- The badge reads "BASE" or "PSP", and its accessible name says "Borderless BASE member" or "Borderless PSP member".
- Visiting the reports page without a badge explains why, rather than showing "page not found"; badges are not secret.
- Deleting an account revokes nothing at Borderless.
- Carried-over webhooks keep their labels. A webhook's badge can be changed between BASE and PSP but not cleared.
- The sign-in page links to Borderless for people who have no Borderless account, and carries a short hint that a Borderless account without a password (signed up through another provider) must set one on Borderless first.
- Confirming the membership keeps the current applika session; it opens no new device and ends none.
- The user menu asks to confirm the membership only when a badge is recorded; the profile asks whenever the Borderless access has expired or was refused, so a membership gained on Borderless later can be picked up.
- A user with a recorded but unconfirmed badge keeps the Reports entry in the navigation; a user with no recorded badge has none.
