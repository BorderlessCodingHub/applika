# ADR-0024: Borderless is the sole login, GitHub becomes a linked account, Borderless memberships become user badges, and reports are gated and routed by badge (supersedes ADR-0002 and ADR-0013, amends ADR-0019 and ADR-0004, exception to ADR-0018)

**Status:** Accepted by LuisMSoares on 2026-10-29 · **Date:** 2026-10-29 · **Deciders:** LuisMSoares · **Amended:** 2026-10-29, open questions 1 to
5 closed, 1 and 2 by the owner's live probe (PRD 0018, plan 0018) · Amended by the owner on 2026-10-29 during the build: report webhooks hold one or more badges

## Context

The owner wants applika to sign users in with their Borderless account, the way Career Forge does, and to turn the
Borderless community each user belongs to (BASE or PSP) into a user badge: "the borderless memberships will be
transformed in user badges in applika, the user badges will be used later on".

Grilling, 2026-10-29, owner's answers verbatim:

- Login shape: "replace github login, and replace discord link to github link, this is necessary to restore all user
  data from old github login".
- Keeping badges current: "do just like was did for discord, prefer storing refresh token rather to access token".
- Lost membership: "Revoke, keep history (Recommended)".
- Badge model: "Generic user_badges table (Recommended)".
- Restoring old data: "Email match, else Link GitHub (Recommended)".
- JWT subject: "users.id snowflake (Recommended)".
- Discord: "remove discord integration, the reports feature will be available only to users with "psp" or "base"
  badges, the webhook will use those roles to determine which webhook to report the status".
- Beta gate: "Gate nothing, exception (Recommended)".

Second grilling, 2026-10-29 (PRD 0018), owner's answers verbatim:

- Who opens reports after Release B: "Badge holders only (Recommended)".
- Where the badge renders: "Profile and user menu (Recommended)".
- Prompting a brand-new account: "Prompt on first sign-in (Recommended)".
- Keeping the GitHub token: "the github link only exists to fetch old user data, after this step the link have no
  pourposes".
- How often the membership is re-read: "every sign-in and token refresh".
- What happens once the 7-day Borderless token dies (asked after the probe below): "Lock reports until re-sign-in
  (Recommended)". Option text: "The applika session goes on. The badge counts as held only while the Borderless token
  is alive. After expiry, the user menu and profile show 'sign in again to confirm your membership', and the Reports
  page shows that prompt plus the password form instead of reports. Every reporting member types their Borderless
  password about once a week. No badge history churn: the badge row stays and the gate checks the token's state."

Applika today:

- GitHub OAuth is the only login (ADR-0002). `users.github_id` is `NOT NULL UNIQUE`, the JWT `sub` is `github_id`
  (`backend/app/core/tokens.py`), and the encrypted GitHub token re-validates the session on refresh.
- Sessions are device rows plus Redis keys, with a `sid` claim checked on every request (ADR-0019). CLI sign-in goes
  through GitHub with PKCE or a device code.
- Discord is a linked account in `discord_connections`, which holds an encrypted refresh token (ADR-0013). Report
  webhooks in `discord_report_webhooks` are routed by Discord server and role ids, read live from that grant.
- `users.is_admin` is the only role, and entitlements are a non-goal (ADR-0004).

How Borderless authenticates, as Career Forge calls it (`auth-source`, ADR-008 there,
`apps/backend/src/career_forge/services/borderless_signin.py`, `borderless_profile.py`):

- Borderless offers **no OAuth/OIDC**. Career Forge's backend posts the user's email and password to
  `POST https://api.borderlesscoding.com/api/auth/signin`.
- The 200 body is `data.user.{id, emailVerified, name, username, careerStage}` and `data.token.accessToken`.
  401 means bad credentials, 429 carries `Retry-After`, and 5xx means Borderless is unavailable.
- The membership is **not** in the sign-in response. It comes from
  `GET https://api.borderlesscoding.com/api/users/profile` with `Authorization: Bearer <accessToken>`, field
  `data.user.membership`. Career Forge also looks at `data.membership` and a top-level `membership`.
- Values seen: `BASE`, `PSP`, `FREE`. Career Forge compares them case-insensitively. Anything other than BASE or PSP
  counts as no community.
- Career Forge never reads a refresh token.

The owner's probe of the live API, 2026-10-29 (redacted shape, verbatim excerpts):

- Sign-in: "data.user.id: str", "data.token.accessToken: str len=32 (not a JWT)", "data.token.expiresIn: int =
  604800", "Token keys found in body: ['accessToken']", "Refresh token in body: False". No `Set-Cookie`. Borderless
  issues **no refresh token**; the opaque access token lives 7 days from the password sign-in.
- Profile: "membership at data.user.membership: 'PSP'", "membership at data.membership: None", "membership at
  membership: None". The membership lives only at `data.user.membership`, upper case. The profile also carries
  `data.user.github` (self-declared, unverified), `data.user.hasPassword` and `data.user.authProviders`: a Borderless
  account may have no password.

This replaces the login, the JWT subject, two linked-account designs and the report gate. Every authenticated route
and every existing user is affected, so it needs an ADR.

## Decision

### 1. Borderless is the only login

- **Credential check on the server.** The web posts the Borderless email and password to the API, and the API posts
  them to Borderless. Applika is the session issuer. Borderless tokens never reach the browser or the CLI, and the
  Borderless password is never stored or logged.
- Endpoint `POST /auth/borderless/signin` takes `{email, password}`. On success it opens a session exactly as
  ADR-0019 does: a `user_sessions` row, Redis keys, `__access` and `__refresh` cookies.
- **Refusals:**
  - A Borderless 401 answers 401 "Invalid email or password", with the same text whatever the cause.
  - `emailVerified: false` answers 403.
  - Borderless 5xx or a timeout gets one retry, then 503.
  - A Borderless 429 answers 429 and passes `Retry-After` on.
- **Rate limit.** The endpoint is in the `/auth/*` bucket of the Redis limiter (ADR-0015). It also gets its own
  per-email limit, checked before Borderless is called.
- **Which user a sign-in opens:**
  1. A `borderless_accounts` row with that Borderless `user.id` opens its user.
  2. Otherwise, a user whose `users.email` equals the Borderless email (case-insensitive) is bound to it. This is the
     owner's "Email match". Borderless has verified that email.
  3. Otherwise, a new user is created, with `username` from `data.user.name` (or `username`) and `email` from the
     sign-in.
- **A binding never moves on its own.** If the Borderless `user.id` presented differs from the one bound to that
  applika user, sign-in is refused (409). The same refusal applies when step 3 finds the email, ignoring case, held by
  an account bound to another Borderless `user.id`: no second user is created, so the insert never reaches the unique
  email index.
- **Confirming the membership** (owner: "Lock reports until re-sign-in"). `POST /auth/borderless/confirm` takes
  `{email, password}` from a signed-in user, checks them with Borderless as sign-in does, stores the new access token
  and reads the membership (§4). The Borderless `user.id` must be the one bound to the caller, else 409. It keeps the
  current session: no new `user_sessions` row, no Redis write and no cookie, so ADR-0019 shapes are untouched and the
  Devices list gains no weekly row.
- A Borderless account with no password (`hasPassword: false`, signed up through another provider) gets Borderless's
  401, so applika answers "Invalid email or password". The sign-in page tells such users to set a password on
  Borderless first.
- **GitHub sign-in is removed.** `GET /auth/github/login` and `GET /auth/github/callback` stop issuing sessions in the
  code release (§3).

### 2. JWT subject is `users.id`

- `sub` becomes the public `users.id` (ADR-0003 string snowflake). `sid` stays as ADR-0019 defines it. This amends
  the ADR-0019 Decision line "`sub` stays `github_id` (ADR-0002 non-goal kept)".
- `get_current_user` resolves the user by id. The `sid` session must belong to that user id, where today it must
  belong to that GitHub id.
- `users.github_id` becomes nullable and keeps its unique index while users still reference it. §3 retires it.
- **Cutover.** From the code release, a token whose `sub` is not a user id answers 401 "Session expired". Every live
  session ends, as at the ADR-0019 cutover, and everyone signs in again with Borderless. A refresh value that is still
  live cannot slide a pre-release session on: a refresh for a user with no `borderless_accounts` row ends that session
  and answers 401 "Sign in again with Borderless".

### 3. GitHub becomes a one-shot restore of old data

- **Table `github_connections`:** `user_id` unique (FK `CASCADE`), `github_id` unique, `username`, `linked_at`. It is
  the record of which applika account a GitHub identity signed in to before this ADR, and nothing else. No GitHub token
  is stored (owner: "the github link only exists to fetch old user data, after this step the link have no pourposes").
- **Release A seeds it.** The migration copies every `users.github_id` into `github_connections`, with
  `linked_at = users.created_at`. Every old account keeps its GitHub proof. Release C tops it up with any account that
  signed in with GitHub between Release A and Release B.
- **Profile action: Restore data from GitHub.** It uses OAuth with scope `read:user` only, never issues a session by
  itself, lands on the API at the existing GitHub callback URL and returns to the profile page (ADR-0010 origins, the
  same flow ADR-0013 used for Discord). The OAuth access token is used once to read the GitHub id and is then revoked,
  best-effort. The action is offered only to an account with no `github_connections` row. There is no Unlink action.
- **First sign-in prompt** (owner: "Prompt on first sign-in"). When Borderless sign-in creates a new account, the web
  first shows a one-time screen: "restore your data from GitHub" or "start fresh". Picking either sets
  `users.github_restore_prompt_seen_at`, and the screen never shows again.
- **Restoring the old account is the owner's "else Link GitHub".** The GitHub id read from GitHub is looked up in
  `github_connections`:
  - **The row belongs to an old account with no `borderless_accounts` row.** The Borderless binding and the badges move
    onto it, and the current user's session is reissued for it.
    - The current user is deleted if it owns nothing: no applications, cycles, reports, CVs, timeline events or
      drafts.
    - If the current user owns anything, the claim is refused (409) and the profile explains why. Merging two
      accounts that both hold data is not done.
  - **The old account already has a Borderless binding.** The restore is refused (409).
  - **The GitHub account is on no user.** Nothing is stored, and the profile says no old account was found.
- Only the GitHub id proven through GitHub's OAuth counts. The GitHub login a user names in their Borderless profile
  (`data.user.github`) is self-declared and unverified, and it is never used to find or restore an account.

### 4. Borderless account table and keeping badges current

- **Table `borderless_accounts`:** `user_id` unique (FK `CASCADE`), `borderless_user_id` unique (`VARCHAR(64)`;
  Borderless's id is a string), `email`, `encrypted_access_token`, `access_token_expires_at`, `status` (`active` or
  `needs_reconnect`, varchar + CHECK), `linked_at`, `profile_read_at`, `profile_read_failed_at`. There is no refresh
  token column: Borderless issues none (probe 2026-10-29).
- Tokens are Fernet-encrypted with a new secret, `BORDERLESS_TOKEN_ENCRYPTION_KEY`, kept apart from the GitHub and
  Discord keys. Sign-in is refused (503) until that key and `BORDERLESS_API_URL` are set.
- **Prefer the refresh token** stays the owner's rule ("prefer storing refresh token rather to access token"), but
  Borderless returns none. So the access token is stored encrypted, the same as Career Forge, with
  `access_token_expires_at` = sign-in time + `expiresIn` (604800 s, 7 days). Nothing can renew it without the
  password. If Borderless ever issues a refresh token, a later additive migration stores it and only it.
- **When the profile is read** (owner: "every sign-in and token refresh"):
  - At every sign-in and every membership confirmation (§1), before answering. A failed read does not block either.
  - At every session refresh: `GET /auth/refresh` (the web and CLI 0.1.4 to 1.0.1) and the `refresh_token` grant of
    `POST /auth/token` (CLI 1.1.0). A failed read never blocks the refresh. The read during a refresh has a short
    timeout and no retry.
  - No read while the account is `needs_reconnect` or the access token is past `access_token_expires_at`; nothing is
    written then. Only a password sign-in or confirmation renews the token and clears `needs_reconnect`.
  - There is no scheduled job. Nothing is added to the ADR-0016 worker.
- **What a read does:**
  - A 200 applies the badge rule (§5).
  - 401 or 403 sets `needs_reconnect`. Badge rows are kept, but stop counting as held (§5).
  - A timeout, 5xx or 429 records `profile_read_failed_at` and keeps the badge rows; they keep counting while the
    access token is alive. It is retried at the next refresh, sign-in or confirmation.
- **Session refresh no longer calls GitHub.** The ADR-0002 rule "`GET /auth/refresh` re-validates the GitHub token"
  is dropped; the Borderless read above takes its place and never ends a session. A session ends by revocation, by the
  ADR-0019 sliding lifetime, or by the §2 cutover rule.

### 5. User badges

- **Table `user_badges`:** `user_id` (FK `CASCADE`), `badge` (varchar + CHECK), `source` (varchar + CHECK),
  `granted_at`, `revoked_at` (nullable). A partial unique index allows one live row per `(user_id, badge)`
  `WHERE revoked_at IS NULL`.
- Badges today: `borderless_base` and `borderless_psp`, both from source `borderless`. A new badge or source is a CHECK
  change in its own migration.
- **Badge rule on a successful profile read.** The membership is read at `data.user.membership` only (probe: seen
  `'PSP'`; `data.membership` and a top-level `membership` are absent, so they are not read). `data.user.github` is
  never read: it is self-declared and unverified, and trusting it would let anyone claim another user's data (§3).
  - `membership` BASE (case-insensitive) makes sure `borderless_base` is live and revokes `borderless_psp`.
  - PSP does the reverse.
  - FREE, any other value, or a missing field revokes every live `borderless` badge.
- A user holds at most one Borderless badge, because Borderless returns a single membership.
- **Revoke, keep history** (owner). Revoking sets `revoked_at`. Regaining a badge inserts a new row. Rows are never
  deleted while the user exists. Only a 200 read with another membership revokes; expiry and `needs_reconnect` never do
  (owner: "No badge history churn").
- **Held** (owner: "Lock reports until re-sign-in"). A badge is *held*, for the report gate, webhook routing and the
  chip, only when a live row exists AND the user's `borderless_accounts` row is `active` AND its
  `access_token_expires_at` is in the future. A live row that is not held is *unconfirmed*.
- `GET /users/me` gains `badges: [{badge, granted_at}]` for live rows, and `borderless: {status, expires_at, email}`
  where `status` is `active`, `expired` (token past expiry, computed at request time) or `needs_reconnect`. A badge is
  held when it is listed and `status` is `active`. The change is additive, so installed CLIs are unaffected (ADR-0009).
- **Where badges show** (owner: "Profile and user menu"). The signed-in user's own held badge renders next to their
  name in the user menu and on the profile header, read from `GET /users/me`. While a badge is unconfirmed, the user
  menu and the profile show "sign in again to confirm your membership"; the profile and the Reports page carry the
  password form (§1 confirmation). No other user's view shows a badge.
- **Badges are not a role.** `users.is_admin` stays the only role, and a badge gives no right over another user's
  data (ADR-0004 ownership is unchanged). A badge *is* an entitlement for reports (§6). This amends the ADR-0004
  non-goal "Plan tiers and entitlements" for badge-gated features only. There are still no plans and no prices.

### 6. Discord integration is removed; reports are gated and routed by badge

- **Discord linking is removed:** Connect/Disconnect Discord, `DiscordOAuthService`, and the `DISCORD_CLIENT_ID`,
  `DISCORD_CLIENT_SECRET`, `DISCORD_LINK_REDIRECT_URI` and `DISCORD_TOKEN_ENCRYPTION_KEY` settings.
  `discord_connections` is retired (§8). This supersedes ADR-0013.
- **Report gate** (owner: "Badge holders only"). Only a user who holds `borderless_base` or `borderless_psp` can list,
  open or submit a biweekly report, administrators included.
  - A user with no live badge row gets 403 `{"code": "badge_required"}` on the report routes, and the web hides the
    report section.
  - A user whose badge is unconfirmed (§5) gets 403 `{"code": "membership_unconfirmed"}`. The web keeps the Reports
    entry, and the Reports page shows "sign in again to confirm your membership" and the password form instead of
    reports (owner: "Lock reports until re-sign-in").
  - Reports stored while the user held a badge stay, and come back when the badge is regained.
  - This replaces the ADR-0013 rule "Server membership, plus the optional roles, is the only report gate".
- **Webhook routing.** `discord_report_webhooks` is replaced by `report_webhooks` (`url`, `label`, timestamps) and
  its badges in `report_webhook_badges` (`report_webhook_id`, `badge`, one row per badge the webhook holds). A webhook holds one or
  more badges: BASE, PSP, or both (owner, 2026-10-29, during the build: "i must be able to configure a webhook for a
  pair of badges (1 or more)"). Its badges can be changed but never left empty. It is managed by admins under
  `/admin/report-webhooks` with `AdminUserDp`.
  - A submitted report posts to every webhook whose badges include a badge the user holds, each address once.
  - This is the owner's "the webhook will use those roles to determine which webhook to report the status": Borderless
    BASE/PSP take the place of Discord server and role ids.
  - Release A copies the existing webhook URLs with no badge, so an admin assigns at least one to each. A webhook
    with no badge receives nothing.
- After an admin saves a webhook, the API never returns the full URL again (kept from ADR-0013).
- **No Discord wording in the admin area** (owner, 2026-10-29: "Remove any wording to Discord in admin area"), except
  the webhook address field. It still accepts only Discord webhook URLs, because posts use Discord's message format,
  and shows a generic Discord webhook URL as its placeholder (owner: "keep the webhook input as is, only accepting
  discord webhooks with a generic discord webhook as placeholder").
- **No mention.** Posts no longer mention the user, because there is no Discord id. Report posts carry the applika
  username. Feedback keeps `DISCORD_FEEDBACK_WEBHOOK` and posts without a mention.
- Failure handling is kept from ADR-0013: on a 429, a timeout or a failing webhook, the report is saved and that post
  is skipped.

### 7. CLI and web sign-in surfaces (amends ADR-0019)

- **PKCE.** `GET /auth/cli/authorize` sends the browser to the web's Borderless sign-in page instead of GitHub. After
  sign-in it returns to the loopback `redirect_uri`, or with `oob` it shows the code. `POST /auth/token` and its grants
  keep their contracts.
- **Device code** is unchanged: a signed-in web user approves it on `/device`.
- **Legacy handoff** (`/auth/cli/start`, `/auth/cli/login/{id}`, `/auth/cli/exchange`, ADR-0009) keeps its shapes.
  `login/{id}` lands on the Borderless sign-in page instead of GitHub. The session method stays `cli_legacy`.
- `user_sessions.method` gains `borderless` for web sign-ins.
- A CLI sign-in on the web page asks for the Borderless password even when the browser is signed in, and it never
  opens, ends or replaces the browser's own session.
- **Sign-in page.** The web's sign-in page becomes an email + password form with a "Create a Borderless account"
  link. Applika has no sign-up of its own.

### 8. Releases (ADR-0005)

- **Release A, migration only, two revisions.**
  - The first (`d9e0b46dd7e1`) adds `borderless_accounts`, `github_connections` (seeded from `users.github_id`),
    `user_badges` and `report_webhooks` (seeded from `discord_report_webhooks` URLs, with `badge` unset).
  - It makes `users.github_id` nullable, adds the nullable `users.github_restore_prompt_seen_at` (§3 first sign-in
    prompt), and adds `borderless` to the `user_sessions.sign_in_method` CHECK (§7).
  - Its downgrade renames the four new tables and the new column to `_old`, keeping their rows (precedent
    `ed39a0fad1e5`; a re-upgrade adopts them back), narrows the CHECK and restores `NOT NULL`. It refuses to run if any
    user has a null `github_id` or any session has method `borderless`.
  - The second (owner's amendment, 2026-10-29), child of the first, adds `report_webhook_badges`
    (`report_webhook_id` FK `report_webhooks.id` `ON DELETE CASCADE`, `badge` with the badge-key CHECK, primary key
    `(report_webhook_id, badge)`), copies every non-null `report_webhooks.badge` into it, and renames
    `report_webhooks.badge` to `badge_old`, which no code maps.
  - Its downgrade renames `badge_old` back to `badge`, restored from the link rows (one deterministic badge when a
    webhook holds both), and renames the link table to `report_webhook_badges_old`, which keeps the full set.
- **Release B, code.**
  - Ships everything above. GitHub sign-in stops, and nothing reads or writes `discord_*` tables, `users.github_id` or
    `users.encrypted_github_token`.
- **Release C, migration only.** First tops up `github_connections` and `report_webhooks` (with no badge) with the
  rows created between Release A and Release B. Then renames the retired objects to `_old` and keeps their data:
  - `discord_connections` → `discord_connections_old`
  - `discord_report_webhooks` → `discord_report_webhooks_old`
  - `users.github_id` → `github_id_old`
  - `users.encrypted_github_token` → `encrypted_github_token_old`

  The downgrade renames them back. C must be downgraded before the image is rolled back past B.

### 9. Beta exception (exception to ADR-0018)

- The owner chose "Gate nothing, exception (Recommended)". A login replacement cannot be on for some users and off
  for others.
- This change has no `FeatureKey`, no seed row and no `require_feature`. Badges are not behind a beta gate either.
- ADR-0018 holds for every other feature, including later features that read badges.

## Consequences

- **Everyone needs a Borderless account to use applika.** A user without one cannot sign in.
  - Old accounts come back automatically when the emails match. Otherwise the user signs in with Borderless and
    restores from GitHub, from the first sign-in screen or the profile.
  - An old user whose Borderless email differs, and who has already created data in the new account, cannot merge.
    An admin would have to resolve it by hand (no tool for that in this ADR).
- **Applika handles the user's Borderless password** on every sign-in. Using TLS and never logging the request body
  are hard requirements. This is a credential proxy, not SSO. If Borderless ships OAuth/OIDC, a later ADR should move
  to it.
- **Release B signs out every web and CLI user.** CLI 0.1.4 to 1.0.1 print "Please run `applika login` again", and
  their next login goes through the Borderless page.
- **Borderless is a hard dependency of sign-in.** During a Borderless outage, nobody can sign in, but existing
  sessions keep working.
- **Badges follow Borderless at the next sign-in or session refresh** (about every ten minutes for an active web user)
  while the 7-day access token lives. Borderless is called on every such refresh, which adds its latency to the
  refresh and its rate limit to applika's load.
- **Reporting members re-type their Borderless password about once a week** (owner: "Lock reports until
  re-sign-in"). The applika session slides on, but the Borderless token cannot, so after 7 days the badge is
  unconfirmed and reports lock until the member confirms. Users who only track applications are not affected. If
  `BORDERLESS_TOKEN_ENCRYPTION_KEY` is lost, every account turns `needs_reconnect`, and no badge counts until each
  member confirms.
- **A Borderless account without a password cannot sign in** until its owner sets one on Borderless.
- **Reports are closed to users without BASE or PSP**, including admins who hold no badge. Webhooks copied in Release
  A post nothing until an admin assigns each at least one badge.
- **Report and feedback posts no longer mention anyone.**
- The retired GitHub and Discord data stays in `_old` objects. Removing it is a later explicit decision (ADR-0005
  Settled).
- ADR-0002 becomes "Superseded by ADR-0024" and ADR-0013 becomes "Superseded by ADR-0024". ADR-0019 and ADR-0004 get
  an "Amended by ADR-0024" note. ADR-0018 gets an "Exception: ADR-0024" note.

## Non-goals

- Applika's own passwords, sign-up, password reset or email OTP.
- A login provider other than Borderless, and GitHub or Discord login.
- Merging two applika accounts that both hold data.
- Admin-granted badges, or badges from any source other than Borderless (the table allows them later; this ADR adds
  none).
- A badge on any other user's view (the user's own user menu and profile header are in scope, §5). Later features that
  use badges get their own decisions.
- Keeping a GitHub link after a restore, an Unlink GitHub action, or storing any GitHub token.
- A scheduled badge sync job, or keeping Borderless access alive past 7 days without the password.
- Using `data.user.github` from the Borderless profile to find or restore an applika account: it is self-declared and
  unverified.
- Mentions in webhook posts.
- Encryption-key rotation.

## Open questions

1. ~~**Does Borderless return a refresh token, and how long does its access token live?**~~ Closed 2026-10-29 by the
   owner's live probe: "Refresh token in body: False"; "data.token.accessToken: str len=32 (not a JWT)";
   "data.token.expiresIn: int = 604800". The access token is stored with its 7-day expiry (§4), and the owner chose
   "Lock reports until re-sign-in (Recommended)" for what follows expiry (§5, §6).
2. ~~**Where exactly does `membership` live in the profile response, and how are its values spelled?**~~ Closed
   2026-10-29 by the probe: "membership at data.user.membership: 'PSP'"; `data.membership` and top-level `membership`
   are None. Only `data.user.membership` is read, compared case-insensitively (§5). BASE and FREE spellings come from
   Career Forge and were not seen live.
3. ~~**Should admins without a badge still see reports, for support?**~~ Closed 2026-10-29: "Badge holders only
   (Recommended)". Admins without a badge are refused like anyone else (§6).
4. ~~**Daily badge sync: is the cadence right?**~~ Closed 2026-10-29: "every sign-in and token refresh". The daily job
   is dropped; the membership is read at every sign-in and every session refresh (§4).
5. ~~**Is not storing the GitHub token right?**~~ Closed 2026-10-29: "the github link only exists to fetch old user
   data, after this step the link have no pourposes". No token is stored, the action is a one-shot restore, and there is
   no Unlink (§3).
