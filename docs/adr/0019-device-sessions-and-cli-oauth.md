# ADR-0019: Device sessions in Redis, a session claim checked on every request, and OAuth-style CLI sign-in (amends ADR-0002 and ADR-0015, exception to ADR-0018)

**Status:** Accepted (LuisMSoares, 2026-10-15) · Amended by ADR-0024 on 2026-10-29 (`sub` is `users.id`; CLI sign-in lands on the Borderless sign-in page; `borderless` sign-in method) · **Date:** 2026-10-15 · **Deciders:** LuisMSoares

## Context

PRD 0014. The owner: "i would like to implement the same authentication flow used in claude cli and implement in
applika lci, today the cli only reuse the same token and refresh token used by frontend, i also want to create a lost
of devices connected and a section to revoke the access". He also asked for the refresh value to be "an random uuid7
value, the same one used as key in the redis" that the rate limiter uses, and for an expired key to mean an ended
session.

Today (ADR-0002) the refresh key is `applika:refresh_token:<uuid4>` and holds only the user id. The CLI handoff
returns the web's own access and refresh values, and the CLI replays them as cookies. Nothing records devices, and
nothing can end one session early except logout from that same client.

Grilling, 2026-10-15: "Both" (PKCE loopback by default, device code for headless); the access token stays a JWT and
only the refresh value becomes a UUID; "Instant" revocation; "Postgres + Redis"; "Log everyone out"; "Gate nothing".
This changes `get_current_user`, which every authenticated route uses, the rate limiter's subject (ADR-0015) and the
beta rule (ADR-0018), so it needs an ADR.

## Decision

- **A session is one sign-in, which is one device.** Table `user_sessions` (owner `user_id`, FK `CASCADE`) keeps the
  device's details and history. Redis on `REDIS_URL`, the rate limiter's instance, keeps the live state.
- **Refresh value.** It is `uuid.uuid7()` (stdlib, Python 3.14, no new dependency). Key `applika:session:<uuid7>`. The web
  carries it in `__refresh`, with the cookie flags unchanged. A missing key means the session has ended.
- **Sliding lifetime (owner, 2026-10-15: "Sliding on refresh").** A session ends `REFRESH_TOKEN_EXPIRE_DAYS` after its
  last refresh. Each refresh moves both Redis keys' `EXPIREAT` and `user_sessions.expires_at` that far ahead. This holds
  for `GET /auth/refresh`, which serves the web and installed CLIs 0.1.4 to 1.0.1, and for the `refresh_token` grant
  of `POST /auth/token`, which serves 1.1.0. `GET /auth/refresh` re-sets `__refresh` with the same value and the full
  Max-Age, the same way it re-sets `__access` today. The refresh value is never rotated. A device that is not
  refreshed for that long is signed out.
- **Access token.** It stays a JWT. The web sends it in the `__access` cookie, and `applika-cli` 1.1.0 and later send it
  as `Authorization: Bearer`. `sub` stays `github_id` (ADR-0002 non-goal kept). A new claim, `sid`, is the public
  `user_sessions.id` (snowflake) and never the uuid7 (owner, 2026-10-15: "Public row id"). A second Redis key,
  `applika:session:id:<sid>`, expires at the same instant as `applika:session:<uuid7>`. The access token never
  carries the refresh value.
- **Every authenticated request** needs `sid`. One Redis script stamps last-used time and IP when the session key exists.
  If it is missing, the answer is 401 `Session expired`. The call is bounded by 0.5 s.
- **Fail closed (owner, 2026-10-15: "Fail closed").** When Redis errors or times out, the session check answers
  503 `{"detail": "Session service unavailable"}` with `Retry-After: 5`, and the request never goes through unchecked.
  This departs on purpose from the ADR-0015 fail-open stance. The rate limiter itself stays fail open.
  - Why 503 and not 401: a 401 sends the web and every CLI to refresh. A failed refresh signs the web out and makes
    CLI 0.1.4 to 1.0.1 delete `session.json`. No client refreshes on a 503.
  - The web app retries a 503 on its auth and profile queries, as it does a 429. CLI 1.1.0 keeps its session on a
    503, on any route and on refresh.
- **The refresh value is never stored in Postgres, as itself or as a hash,** and never returned by the device list.
- **CLI sign-in, `applika-cli` 1.1.0 and later.**
  1. Authorization code + PKCE S256. The browser goes through `GET /auth/cli/authorize`, then GitHub, then back to a
     loopback `redirect_uri`, or with `oob` to a web page that shows the code to paste.
  2. Device code (RFC 8628 shape). A signed-in web user approves it on `/device`.

  One token endpoint, `POST /auth/token`, handles the `authorization_code`, `refresh_token` and `device_code` grants.
  `POST /auth/revoke` ends a session.
- **Legacy handoff (ADR-0009).** `/auth/cli/start`, `/auth/cli/login/{id}` and `/auth/cli/exchange` keep their shapes,
  are marked deprecated in OpenAPI, and open a session with method `cli_legacy`. `GET /auth/refresh` and
  `GET /auth/logout` keep their contracts for the web and for installed CLIs.
- **Cutover.** From the release that ships this code, nothing reads `applika:refresh_token:*`, and a JWT without `sid`
  gets a 401, so everyone signs in again. The old keys expire on their own TTL.
- **Rate limiter subject (amends the ADR-0015 Decision line "a request whose `__access` cookie holds a valid,
  unexpired access token is counted against that token's subject").** The limiter reads `Authorization: Bearer` first,
  then the `__access` cookie, then falls back to the IP.
- **Ownership (ADR-0004).** A user lists and revokes only their own sessions. Any other session id answers 404, for
  admins too.
- **Beta exception (exception to the ADR-0018 Consequence "Every later user-facing feature adds a `FeatureKey`
  member, a seed row and `require_feature` on its routes").** The owner chose "Gate nothing" on 2026-10-15. This
  feature has no `FeatureKey`, no seed row, no `require_feature` and no web gate. ADR-0018 holds for every other
  feature.

## Consequences

- Every authenticated request makes one more Redis round trip, next to the limiter's.
- Redis is now a hard dependency of every authenticated route. During an outage the signed-in app answers 503
  everywhere, no revoked device gets through, and nobody is signed out. If Redis loses its data, everyone is signed
  out, as happens today with refresh tokens.
- An installed CLI (0.1.4 to 1.0.1) keeps its session on a 503. If its access token expires during an outage, its
  call to `GET /auth/refresh` gets a 503 (today a 500), and it clears its session, as it does today.
- The release that ships this code signs out every web and CLI user. CLI 0.1.4 to 1.0.1 print "Please run
  `applika login` again".
- Device-code polling falls in the `/auth/*` bucket (10 per minute per IP). The poll interval is 10 s, and the CLI
  treats a 429 as `slow_down`.
- Rolling back to the image from before this release loses the new sessions. Old `applika:refresh_token:*` keys may
  still be valid for up to 7 days after the release.
- A uuid7 carries its creation time and has fewer random bits than a uuid4. This is accepted as the owner's choice,
  with the `/auth/*` rate limit as the guard against guessing.
- Tests that override `get_current_user` are unaffected. The e2e seed mints real sessions.

**As-built note (2026-10-15).** The Decision stands. Three places where the build departs from the plan's
contract text:
- *`POST /auth/revoke` in a Redis outage* (recommended option taken under the owner's autopilot order). The
  plan said "204 always". The build answers 204 for a known, unknown or already-ended refresh value, and 503
  `Session service unavailable` with `Retry-After: 5` when Redis fails. That follows the fail-closed Decision: a 204
  there would tell `applika logout` the session ended while its key may still be live.
- *Legacy `GET /auth/cli/login/{id}`* answers 303, the status fastapi-sso has always returned, not the 307 the plan's
  contract text lists. Its shape is unchanged for installed CLIs, which follow either redirect. The new
  `GET /auth/cli/authorize` answers 307 as specified.
- *Web device-code calls.* `verifyDeviceCode`, `approveDeviceCode` and `denyDeviceCode` live in the web's
  `session-service.ts` (with the device list and revoke calls), not in `auth-service.ts` as the plan named.

## Non-goals

- Another login provider, a new JWT subject, refresh rotation, sign-in notifications, geo-IP.
- Admin access to other users' sessions. A cap on sessions per user. Purging history.
- Removing the legacy CLI handoff routes, which stays an explicit owner decision in its own ADR (ADR-0009).

## Open questions

- None. `sid`, the lifetime and the Redis-outage behaviour were settled by the owner on 2026-10-15 (PRD 0014
  `## Clarifications`).
