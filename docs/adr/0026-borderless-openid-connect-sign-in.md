# ADR-0026: Sign in with Borderless through OpenID Connect; the refresh token lives encrypted in the database, the access token in Redis, and a refused grant ends web sessions and locks member features in the CLI (amends ADR-0024 and ADR-0019)

**Status:** Accepted by LuisMSoares on 2026-11-06 · **Date:** 2026-11-06 · **Deciders:** LuisMSoares

## Context

ADR-0024 made Borderless the only login when Borderless had no OAuth/OIDC: applika posts the user's email and password to
Borderless, stores a 7-day opaque access token, and reporting members re-type their password weekly. Its Consequences
say: "If Borderless ships OAuth/OIDC, a later ADR should move to it." Borderless now registers applika as an OpenID
Connect **confidential client** (PRD 0020 quotes the specification): issuer `https://api.borderlesscoding.com/api/auth`,
`client_secret_basic`, PKCE S256 required, scopes `openid profile email offline_access`, redirect URI
`https://applika.dev/api/auth/borderless/callback` (exact match), an `id_token` carrying `sub`, `email`,
`email_verified` and `borderless_membership` (`FREE`, `STARTER`, `BASE`, `PSP`), a 1-hour access token and a 30-day
rotating refresh token.

Live discovery (2026-11-06): `id_token_signing_alg_values_supported: ['EdDSA']` (one Ed25519 key in `/jwks`),
`authorization_response_iss_parameter_supported: true`, `response_modes_supported: ['query']`, `prompt` includes
`login`, and `/oauth2/revoke`, `/oauth2/end-session` and back-channel logout exist.

ADR-0024's password proxy is on `develop` only; production still runs GitHub login and holds no `borderless_accounts`
row. The owner's answers (PRD 0020 `## Clarifications`): ship both together from a branch; refresh "At most once an
hour"; STARTER "No badge, like FREE"; logout "This session only", revoking the refresh token when the last session ends.
On `invalid_grant` the owner first chose "end applika session in web and cli, both together", then amended it the same
day: "let's keep the cli session active, but when the user try to access some resouce locked behind a membership,
interrup the operation and tell the user to reauthenticate in the web platform [...] never store the access token in
the database, save it on redis, only the refresh token is saved in the db, if the access token is expired or not
exists in redis, use the refresh to get a new one. no not save the refresh token directly without encryption (always
decrypt on use/ use lru cache to avoid repetitive decryption of the same token)".

## Decision

1. **OpenID Connect replaces the credential check** (replaces ADR-0024 §1 "Credential check on the server", the
   `POST /auth/borderless/signin` and `POST /auth/borderless/confirm` endpoints, and the per-email limit). Applika never
   sees a Borderless password. Endpoints come from the issuer's discovery document, cached; its `issuer` must equal the
   configured one, and in production the issuer and redirect URI must be https. The client secret is an environment
   value only.
2. **Two routes.** `GET /auth/borderless/login` sends the browser to Borderless's authorize endpoint with
   `response_type=code`, the four scopes, a random `state`, a `nonce` and an S256 `code_challenge`.
   `GET /auth/borderless/callback` always answers 307: to the web sign-in page with a session (web), to the CLI's
   loopback or manual-code page through the existing handoff (CLI), or to the sign-in page with `error=<code>`.
3. **Binding the attempt.** The attempt is a single-use Redis record keyed by `state` (verifier, nonce, flow, CLI login
   id), ten minutes, bound to the browser by an HttpOnly, SameSite=Lax cookie whose hash the record holds. The callback
   requires that cookie, the matching `state`, and the `iss` parameter equal to the issuer (RFC 9207). The code is
   exchanged with HTTP Basic, the `code_verifier` and the `redirect_uri`.
4. **The id_token is verified** against the issuer's JWKS with `EdDSA` as the only algorithm: signature, `iss`, `aud`
   (and `azp` when present) equal to the client id, `exp`, `iat`, and on sign-in `nonce`. A refreshed id_token's `sub`
   must equal the bound account. The callback's query, the code, the state and every token are never logged.
5. **Account resolution is unchanged** (ADR-0024 §1 "Which user a sign-in opens", "A binding never moves"), keyed by
   `sub`. An `email_verified: false` identity is refused.
6. **Where the tokens live** (amends ADR-0024 §4 table; owner amendment). The refresh token lives only in the database,
   in the new `borderless_accounts.encrypted_refresh_token`, always Fernet-encrypted with
   `BORDERLESS_TOKEN_ENCRYPTION_KEY`, and is decrypted on use through a bounded in-process LRU cache keyed by the
   ciphertext. The access token never enters the database: it is stored Fernet-encrypted in Redis, one key per user,
   expiring with the token (`expires_in`). `encrypted_access_token` and `access_token_expires_at` are retired to `_old`
   (ADR-0005). The id_token is never stored; user-info is never called. One grant per user: each sign-in replaces both.
7. **Membership from the claim** (replaces the ADR-0024 §5 badge rule's source and the "held" rule). `BASE` and `PSP`,
   ignoring case, give `borderless_base` and `borderless_psp`; `FREE`, `STARTER`, anything else or nothing revokes.
   History is kept as ADR-0024 §5 says. A badge is *held* when its row is live and the binding is `active`; there is
   no expiry.
8. **Keeping it current** (replaces ADR-0024 §4 "When the profile is read" and "never ends a session"). The Redis
   access token is the freshness marker: present means no Borderless call. It is checked at every session refresh
   (`GET /auth/refresh`, the `refresh_token` grant) and at every membership-gated request. Missing or expired, applika
   takes the binding's row lock, checks Redis again, and calls the `refresh_token` grant. A success commits the rotated
   refresh token and the claim's badges, then stores the new access token in Redis. Slowness, 5xx or 429 records the
   failure and blocks nothing; the badges keep their last read. When Redis cannot be read, the token counts as missing,
   so the gate works from the database alone. No scheduled job.
9. **A refused grant** (`invalid_grant`, or a stored token that no longer decrypts) ends every open **web** session of
   the user with the new `end_reason` `borderless_revoked`, clears the refresh token, deletes the Redis access token and
   sets `needs_reconnect`. A web refresh is then refused. **CLI sessions stay** and keep refreshing. A membership-gated
   request from any client answers 403 with a code whose message says to sign in again on the applika website. The
   next sign-in, web or CLI, stores a new grant and unlocks every session.
10. **Logout** (ADR-0019 per-session rule kept). When a logout, a device revocation or an account deletion leaves the
   user with no open session, applika clears both tokens and revokes the refresh token at Borderless after answering,
   best-effort. The Borderless browser session is never ended by applika.
11. **CLI and web surfaces** (replaces ADR-0024 §7 PKCE, legacy and sign-in page bullets; amends ADR-0019 CLI sign-in).
   `GET /auth/cli/authorize` and `GET /auth/cli/login/{id}` send the browser straight to Borderless with
   `prompt=login`; web sign-ins send no `prompt`. Every CLI contract is unchanged (ADR-0009). The web sign-in page is a
   "Sign in with Borderless" button.
12. **One fake Borderless.** A test double implements discovery, authorize (a page where the test picks the account),
   token (PKCE, client authentication, rotation, reuse refusal, scripted `invalid_grant`, configurable access-token
   life), JWKS (Ed25519) and revoke. Backend tests drive it in-process through an httpx transport; the E2E stack and
   local runs serve it over HTTP. It replaces the password-API stub.
13. **Codes and gate.** New codes AUTH-1046 to AUTH-1050 (ADR-0025). AUTH-1004, AUTH-1009, AUTH-1010 and RPT-1002 are
   no longer raised and are never reused. No beta gate (ADR-0024 §9 exception extends to this change).

## Consequences

- No password crosses applika, and members never re-type one; ADR-0024's credential-proxy consequence and its weekly
  re-confirmation end.
- Every user signs in again on the web at most 30 days after their last sign-in. The CLI stays signed in, but member
  features (the biweekly reports today, which no CLI version calls) are refused until that sign-in. A revoked user loses
  the web within about an hour of activity.
- If Borderless rotates a refresh token and applika loses the answer (timeout, crash before commit), the next refresh
  gets `invalid_grant` and that user signs in again on the web.
- A Redis flush costs one refresh per active user, nothing more. Plaintext refresh tokens of recently refreshed users
  sit in each API process's memory, beside the key that decrypts them all.
- Borderless stays a hard dependency of sign-in; during an outage open sessions go on and badges keep their last read.
- Development cannot reach the real Borderless while only the production redirect URI is registered.
- Losing `BORDERLESS_TOKEN_ENCRYPTION_KEY` signs every active user out of the web within about an hour of activity.
- On acceptance: ADR-0024 gets "Amended by ADR-0026" (§1, §4, §5, §7) and ADR-0019 gets "Amended by ADR-0026"
  (CLI sign-in target, `borderless_revoked` on web sessions).

## Non-goals

- RP-initiated logout (`end_session_endpoint`) and back-channel logout.
- User-info, using the access token beyond freshness, `picture`, or a STARTER badge.
- Dynamic client registration, several Borderless clients, or key rotation.
- Revoking a replaced refresh token, or any token other than on the last session's end.
