# ADR-0028: applika-cli is retired for a hosted MCP server with scoped MCP tokens (ends ADR-0009; supersedes ADR-0023 and the CLI parts of ADR-0012, ADR-0019, ADR-0020, ADR-0024 and ADR-0026; amends ADR-0019 and ADR-0015; exception to ADR-0018)

**Status:** Accepted by LuisMSoares on 2026-11-14 · **Date:** 2026-11-14 · **Deciders:** LuisMSoares

## Context

PRD 0023. The owner: "i want like to decomissionate the cli and migrate to a MCP". Grilling and clarification, 2026-11-14:
"Hosted in the API (Recommended)"; "CLI parity (Recommended)"; "mcp will be released to everyone, no beta gated"; "during
mcp configuration i need to provide a token generated somewhere in the frontend app (generate the full configuration to add
the mcp)"; "Header apps only (Recommended)"; "90 days after last use (Recommended)"; "we can reuse the cli token
authentication method in mcp but this configuration will be moved to user profile in a new tab called MCP just between
profile and devices, any route that only cli uses and mcp will not use, remove them all"; "fully delete, no need in keeping
dead code in the project. 0.1.x is also deprecated and not supported anymore"; "scoped access during mcp connection creation
(read only, write, etc) we might need this in the future"; and, on the scope set, the CLI-only fields, the limiter subject,
the REST Bearer token and the renewal refusal, "I'll pick the recommended ones". The fourth and fifth answers supersede the
earlier answer that CLI-only routes "answer 410 Gone".

On 2026-11-14 PyPI answers 404 for `applika-cli` while PyPI itself answers 200, so nobody can install the CLI. PyPI once held
0.1.1 to 0.1.4; 1.x was never published. On 2026-10-29 the owner said "the oldest versions of applika cli will be
descontinued and only the v1.x will be maintained. The cli v1.x hav it's own auth flow through pkce". This ADR replaces that
direction.

It needs an ADR for these reasons:
- It adds a new dependency.
- It adds a second credential kind and a new column on `user_sessions`, which the web and Devices share.
- It changes the rate limiter's subject.
- It ends ADR-0009 ("Removing the old endpoints is a later, explicit owner decision in its own ADR") and
  `.claude/rules/cli-compatibility.md` point 5.
- It removes decisions that exist only for the CLI in ADR-0012, ADR-0019, ADR-0020, ADR-0024 and ADR-0026, and it
  retires the feedback catalog under ADR-0012 Delta 3.
- It is an exception to ADR-0018.

## Decision

- **Hosted MCP server.** The API serves MCP over streamable HTTP at `/mcp` (public `https://applika.dev/api/mcp`),
  stateless, with JSON responses. New dependency: `mcp`, the official Python SDK, pinned to one version. It is a
  presentation adapter, `app/presentation/mcp/`, over the same use cases as the REST routers (ADR-0001). Its errors carry
  the same `detail` and `code` as the REST answer (ADR-0025). Its tools are applika-cli's commands, no more; the CLI's
  bundled skill becomes the server's instructions. Only apps that send a header are served; OAuth for claude.ai and
  ChatGPT is a later feature with its own ADR.
- **MCP token: the CLI's session machinery, created in the profile.** A signed-in web user creates one in the Profile tab
  "MCP", between Profile and Devices, through `POST /users/me/mcp-tokens`, and sees it once.
  - Like a CLI sign-in, it is one `user_sessions` row: `client_type` `mcp`, `sign_in_method` `mcp_token`, and
    `device_name` the user's name for it. It travels as `Authorization: Bearer`, the ADR-0019 session script checks it on
    every request, and it is listed and revoked in Devices with instant effect.
  - It departs from the CLI in one way: it is one long-lived secret (`applika_mcp_` + 32 random bytes, base64url) instead
    of a 15-minute JWT plus a refresh value, because AI apps hold a fixed header and never renew.
  - So it needs neither `POST /auth/token` nor `POST /auth/revoke`. This amends the ADR-0019 line "A session is one
    sign-in, which is one device".
- **Scopes.** Each token carries a scope set fixed at creation.
  - It is stored in the new nullable `user_sessions.scope` (space-separated names, NULL on web and CLI rows, added in
    release A) and mirrored in the session's Redis hash.
  - Every tool requires exactly one scope. `tools/list` shows only the tools the scope allows, and a call outside it
    answers `AUTH-1052`.
  - The first set (owner, 2026-11-14: "I'll pick the recommended ones") is `read`, `write` and `delete`. Every token
    includes `read`. `write` covers create, edit, close and reopen; `delete` covers deleting timeline events, master CVs
    and application CVs. The form offers "Read only", "Read and write" (preselected) and "Full access".
  - The set is open: a later scope is a new name in code, with no migration, and no existing token changes.
- **Storage.** Redis holds `applika:mcp:<sha256(token)>` → session id, and the session's `applika:session:id:<sid>` hash,
  both ending at the same instant. The token is never stored in Postgres, as itself or as a hash, and never logged. An MCP
  session has no refresh value, so session renewal can never resolve it.
- **Where it works.** The MCP server accepts only an MCP token and refuses a JWT (`AUTH-1051`, 401). Every REST route
  refuses an MCP token. A Redis failure answers 503 `AUTH-1003` with `Retry-After: 5` (fail closed).
- **Lifetime** (owner, 2026-11-14: "90 days after last use"). A token ends `MCP_TOKEN_IDLE_DAYS` (90) after its last use.
  Every call moves both Redis keys' end, and Postgres `expires_at` follows at most once a day.
- **Rate limiter subject.** This amends the ADR-0019 line "The limiter reads `Authorization: Bearer` first, then the
  `__access` cookie, then falls back to the IP". A Bearer that starts `applika_mcp_` counts against
  `mcp:<first 32 hex of its sha256>` in a new bucket `mcp` (`RATE_LIMIT_MCP`, 120 per window). The limiter still makes one
  Redis call and stays fail open.
- **Beta exception.** This is an exception to the ADR-0018 Consequence "Every later user-facing feature adds a `FeatureKey`
  member, a seed row and `require_feature` on its routes". The owner chose "mcp will be released to everyone, no beta
  gated": no `FeatureKey`, no seed row, no `require_feature` and no web gate for the MCP server, the token route, the tab or
  the page. The `cvs` key still binds: CV tools are absent for a user without it, and a call answers the gate's 404 body
  (`GEN-1001`). ADR-0018 holds for every other feature.
- **CLI retirement.** This is the explicit owner decision ADR-0009 asks for and the point-5 ADR of
  `.claude/rules/cli-compatibility.md`. applika-cli 0.1.x is deprecated and no longer supported (owner, 2026-11-14), and
  no CLI version is maintained.
  - **Superseded.**
    - ADR-0023, whole.
    - ADR-0019: the bullets "CLI sign-in, `applika-cli` 1.1.0 and later" and "Legacy handoff (ADR-0009)", the
      `refresh_token` grant in its "Sliding lifetime" bullet, and the Bearer access token on REST.
    - ADR-0012: the `Deprecation` header and its amendment of ADR-0009.
    - ADR-0020: its statements about the 0.1.4 layer.
    - ADR-0024: the CLI refresh-grant and CLI sign-in parts.
    - ADR-0026: §11 and the CLI target of §2.
  - **Deleted routes.** The sunset release deletes every route only the CLI uses, with no 410, message, forward or
    placeholder: `/auth/cli/start`, `/auth/cli/login/{login_id}`, `/auth/cli/exchange`, `/auth/cli/authorize`,
    `/auth/token`, `/auth/revoke`, `/auth/device/code`, `/auth/device/verify`, `/auth/device/approve`,
    `/auth/device/deny`, `/applications/{id}/steps`, `/applications/{id}/steps/{sid}`. A deleted path answers like any
    unknown route (404 `GEN-1001`). `POST /applications/{id}/finalize` stays, and its legacy `step_id`/`feedback_id`
    body answers 422 `GEN-1003`.
  - **Deleted fields** (owner, 2026-11-14: "I'll pick the recommended ones"). The sunset release removes the fields only
    the CLI read from routes the web shares: `steps` and `feedbacks` from `GET /supports`, which then answers its
    platforms only, and `feedback` and `salary_offer` from every application answer. `finalized`, `finalized_at` and
    `last_step` stay, because the web reads them.
  - **Deleted code and pages.** It also deletes:
    - the handlers, use cases and schemas behind those routes and fields;
    - the legacy steps and legacy finalize parts of the compatibility layer;
    - the `Deprecation` header and the Bearer JWT on REST;
    - the CLI branches of Borderless sign-in;
    - the tests of all of the above;
    - the web pages `/device` and `/cli/code`;
    - `applika/cli`, with its workflows and its gate.
  - **Kept.** `/cli` forwards to `/mcp`. Session renewal ends and refuses a `client_type` `cli` session. The codes that
    only deleted routes raised stay registered as no longer raised and are never reused (ADR-0025).
  - **Catalogs.** The step translation stays, because the web reads `last_step` and the agenda through it, so
    `steps_definition` keeps its name; ADR-0012 Delta 3 applies to it only when that translation goes. Once `/supports`
    drops `feedbacks`, nothing reads `feedbacks_definition`, so the sunset release renames it `feedbacks_definition_old`
    (ADR-0012 Delta 3). Its downgrade renames it back, and a round-trip test covers both directions. No ORM model maps
    the `_old` table.
- **Releases** (`.claude/rules/prod-release-runbook.md` point 4).
  - A: `user_sessions.scope`, the widened `ck_user_sessions_client_type` and `ck_user_sessions_sign_in_method`, and
    `ck_user_sessions_mcp_scope`; `cli-cd.yaml` removed.
  - B: the MCP server, tokens, tab and page, only after the owner confirms A ran.
  - C: the deletion and the catalog rename, only after the owner confirms the MCP works in production. C's code reads the
    catalog under neither name, so the C image runs before and after the owner's `alembic upgrade head`.

## Consequences

- Installed 0.1.x copies stop working in release C with no hint. Sign-in answers 404, and a signed-in copy fails at its
  next renewal, within 15 minutes. Nobody can install a replacement. ADR-0009's Non-goal "Forcing users to upgrade the
  CLI" no longer applies.
- A client that still reads `/supports` `steps` or `feedbacks`, or an application's `feedback` or `salary_offer`, loses
  them in release C. The web reads none of them.
- Rolling release C back runs the catalog downgrade before the B image, because B reads `feedbacks_definition` for
  `/supports`, and the web loads its platform list from there.
- A token lives in plain text in the user's AI-app settings. A narrow scope limits what a leak can do, and revoking it in
  Devices or the MCP tab ends it. The generated configurations target user settings, never a project file.
- A token whose scope must change is replaced: the user creates a new one and revokes the old one.
- If Redis loses its data, every MCP connection ends and users paste a new token, as every web session ends today.
- claude.ai and ChatGPT cannot connect until the OAuth feature ships.
- Revision A refuses to downgrade once an `mcp` row exists, like `d9e0b46dd7e1`: from then on it is forward-only.
- An open MCP connection is an open session, so ADR-0026's last-session release keeps the Borderless grant while one
  lives.
- The renewal refusal for `cli` sessions has nothing left to refuse 7 days after release C, and a later change may delete
  it.
- The `mcp` SDK brings its own Starlette, anyio and pydantic-settings constraints into the API image.
- The owner retires, outside the repository, the workspace rule `.claude/rules/cli-compatibility.md` and the CLI lines
  of `.claude/rules/quality-gates.md`.

## Non-goals

- An OAuth authorization server, `.well-known` discovery, dynamic client registration.
- A local stdio MCP package, or any package on PyPI.
- Scopes beyond `read`, `write` and `delete` in this feature; editing a token's scope; admin tools; tools beyond the
  CLI's commands.
- Reviving, publishing or supporting any applika-cli version.

## Open questions

- None. The owner settled the scope set, the CLI-only fields, the limiter subject, the REST Bearer token and the renewal
  refusal on 2026-11-14 ("I'll pick the recommended ones").
