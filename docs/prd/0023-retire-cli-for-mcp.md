---
PRD: 0023
title: Retire applika-cli for a hosted MCP server
status: Approved
owner: LuisMSoares
created: 2026-11-14
related-adrs: [0001, 0004, 0009, 0012, 0015, 0018, 0019, 0023, 0024, 0025, 0026, 0028]
related-prds: [0005-landing-cli.md, 0008-steps-as-timeline.md, 0013-beta-features.md, 0014-cli-device-sign-in-and-devices.md, 0017-cli-self-update-and-repo-layout.md, 0022-phone-v3-screens.md]
---

# PRD 0023 — Retire applika-cli for a hosted MCP server

## In the owner's words

i want like to decomissionate the cli and migrate to a MCP

## Clarifications

- Q: Your story says "migrate to a MCP". Where should the Applika MCP server run? (hosted in the API vs a local stdio PyPI package vs both) → A: "Hosted in the API (Recommended)" — option text: "A remote MCP endpoint at applika.dev/api/mcp (streamable HTTP). Users add it as a connector in Claude, ChatGPT, Cursor, etc.; nothing to install or update." (The OAuth-discovery part of that option is superseded by the Q5 answer below.)
- Q: Your story says "decomissionate the cli". What happens to the CLI and to the API routes that installed copies (0.1.x) still call? → A: "Sunset after MCP is live (Recommended)" — option text: "This feature removes applika/cli from the repo, replaces the /cli landing page with an MCP setup page, and writes the ADR that ends the cli-compatibility rule. CLI-only routes (/auth/cli/*, /applications/{id}/steps*, legacy finalize payloads) answer 410 Gone with a message pointing to the MCP, shipped only once the MCP is released to everyone. Installed 0.1.x copies stop working on that release. Shared routes (/applications, /users/me, /auth/token…) stay because web/MCP use them."
- Q: Which tools should the MCP expose in this feature? → A: "CLI parity (Recommended)" — option text: "Exactly what the CLI does today: whoami; applications list/get/create/edit/finalize/reopen; timeline list/add/edit/delete; supports & companies lookups; CVs and application CVs (create/edit/delete/download/diff) behind the cvs beta, as the CLI does. The bundled agent skill becomes the server's instructions."
- Q: The beta rule says every new user-facing feature starts behind a beta flag, but the MCP replaces the CLI, which is ungated. How should the MCP be gated, and when do the CLI routes go 410? → A (owner typed): "mcp will be released to everyone, no beta gated"
- Q: When a user connects an AI app (Claude, ChatGPT, Cursor…) to the MCP, what can that connection do in their account? → A (owner typed): "during mcp configuration i need to provide a token generated somewhere in the frontend app (generate the full configuration to add the mcp)"
- Q: PRD 0023 R-003 is open: claude.ai (web/phone) and ChatGPT add connectors with an address plus OAuth sign-in only; they have no field for a header, so the token you chose to generate in the web app cannot reach them. Must they work in this feature? → A: "Header apps only (Recommended)" — option text: "Configs generated for Claude Code, Claude Desktop (via npx mcp-remote, needs Node.js), Cursor, VS Code, Codex CLI, Gemini CLI and "Other" (address + header). claude.ai and ChatGPT wait for a later OAuth feature with its own ADR."
- Q: PRD 0023 R-005 is open: how long does an MCP token (the one generated in the web app and pasted into the AI app's config) stay valid? → A: "90 days after last use (Recommended)" — option text: "Sliding: every call pushes the end back 90 days, like your 2026-10-15 "Sliding on refresh" choice for devices."
- Q: PRD 0023 R-016 is open: your earlier answer listed `/auth/token` as a shared route that stays, but the web app never calls `/auth/token` or `/auth/revoke` (it uses /auth/refresh and /auth/logout), and only CLI 1.1.0, never published, calls them. What happens to these two routes in the shutdown release (C)? → A (owner typed): "the cli will be deprecated/removed, the package was already gone from pypi, we can reuse the cli token authentication method in mcp but this configuration will be moved to user profile in a new tab called MCP just between profile and devices, any route that only cli uses and mcp will not use, remove them all."
- Q: Your last answer says "any route that only cli uses and mcp will not use, remove them all"; your earlier shutdown answer said those routes "answer 410 Gone with a message pointing to the MCP". In the shutdown release (C), what does a request to a removed CLI-only route (/auth/cli/*, /auth/token, /auth/revoke, /auth/device/*, /applications/{id}/steps*, legacy finalize body) get? → A (owner typed): "fully delete, no need in keeping dead code in the project. 0.1.x is also deprecated and not supported anymore"
- Q: What can an MCP token do in the user's account? The PRD currently assumes full access ("it acts as that token's user") and lists read-only tokens as a non-goal; the grilling never settled it. → A (owner typed): "scoped access during mcp connection creation (read only, write, etc) we might need this in the future"
- Q: R-022: which scopes ship now ("read only, write, etc")? → A (owner typed, 2026-11-14): "I'll pick the recommended ones" — picked option: "`read`, `write`, `delete`. The form offers "Read only", "Read and write" (preselected) and "Full access", and every token includes `read`. Deletes get their own scope. No more scopes now; a later scope is a new name in code, with no migration."
- Q: R-016: fields on shared routes that only the CLI read (`/supports` `steps` and `feedbacks`; the application answer's `feedback` and `salary_offer`)? → A (owner typed, 2026-11-14): "I'll pick the recommended ones" — picked option: "remove them in Release C, plus the one revision there that renames `feedbacks_definition` to `feedbacks_definition_old` (ADR-0012 Delta 3), with a round-trip test (migration-tests rule)."

## Problem

applika-cli lets users and their AI agents track job applications from a terminal. Nobody can install it any more: on 2026-11-14 PyPI answers 404 for `applika-cli` while PyPI itself answers 200. PyPI once held 0.1.1 to 0.1.4; 1.x was never published. Installed 0.1.x copies may still call the API, so the API keeps a compatibility layer for them (ADR-0009), three CLI sign-in flows (the legacy hand-off, browser authorization and device code) and two web pages that only the CLI uses. On 2026-10-29 the owner chose to keep only CLI 1.x; this feature replaces that direction, and 0.1.x is no longer supported.

AI apps connect to outside tools through MCP. An MCP server hosted by Applika lets a user's AI app do what the CLI did, with nothing to install or update. It lets the CLI, its sign-in flows, its compatibility routes and their code go.

## Users and stories

- US1 (P1) A user connects their AI app to Applika: in the MCP tab of their profile they create a token, choose what it may do, copy the configuration generated for their app, paste it, and install nothing.
- US2 (P1) A user asks their AI app to list, read, add, edit, close or reopen applications and to list, add, edit or delete timeline events, as applika-cli did, within what the token allows.
- US3 (P1) A user sees each AI connection and what it may do in Devices and in the MCP tab, revokes one, and it stops working at once.
- US4 (P2) A user gives a token only the access it needs, so an AI app that should only read cannot change anything.
- US5 (P2) A user with the CVs feature asks their AI app to read, write, tailor, download and compare master CVs and application CVs.
- US6 (P2) A visitor reads the MCP page and learns what the server does, which apps it works with and how to connect.
- US7 (P3) After the sunset release, an installed applika-cli stops working; Applika gives it no hint and no longer supports 0.1.x.
- US8 (P3) The owner deletes the CLI, its sign-in flows, its compatibility routes, its pages and their code.

## Requirements

- R-001 The system offers an MCP server hosted by Applika at one public address under the API, over streamable HTTP; the user installs nothing. (story: "migrate to a MCP"; Q1)
- R-002 A signed-in user creates an MCP token in a profile tab named "MCP", placed between the Profile tab and the Devices tab: they give it a name, choose its scope, and see the token in full once. (Q5; R-016 answer: "a new tab called MCP just between profile and devices"; scope answer)
- R-003 Right after creating a token, the MCP tab shows the ready-to-paste configuration with the token filled in for Claude Code, Claude Desktop (through `npx mcp-remote`), Cursor, VS Code, Codex CLI, Gemini CLI, and "Other" (the address and the header), each with a Copy action. (Q5: "generate the full configuration to add the mcp"; R-003 answer)
- R-004 The MCP server answers only a request that carries a live MCP token, and it acts as that token's user within the token's scope. (Q5; scope answer)
- R-005 An MCP token ends 90 days after its last use: every call pushes the end back 90 days. The user can revoke it at any time. (R-005 answer)
- R-006 Each MCP token is one connection, and it appears in Devices and in the MCP tab with its name, scope, creation date, last use and last IP; the user revokes it in either place, and its next request is refused. (Q5; R-016 answer: "reuse the cli token authentication method"; PRD 0014)
- R-007 An MCP token works only on the MCP server; every other API route refuses it. (Q5)
- R-008 The MCP server offers tools for everything applika-cli does today: who am I; list, read, create, edit, close and reopen applications; list, add, edit and delete timeline events; look up platforms and companies. (Q3)
- R-009 For a user who has the CVs feature, the server also offers master CVs (list, read, create, edit, delete, download) and application CVs (read, create, edit, delete, download, show changes); for any other user those tools do not exist. (Q3: "behind the cvs beta, as the CLI does")
- R-010 Each tool gives the result, the refusal message and the error code the web app gets for the same action. (Q3: "Exactly what the CLI does today")
- R-011 The server gives the AI app, as its instructions, the guidance of the CLI's bundled agent skill rewritten for tools. (Q3: "The bundled agent skill becomes the server's instructions.")
- R-012 The MCP server, the MCP tab and the MCP page reach every user in the release that ships them, with no beta list. (Q4)
- R-013 A public MCP page replaces the applika-cli page: what the server does, which apps it works with, how to connect in three steps, and a link to the MCP tab. (Q2: "replaces the /cli landing page with an MCP setup page")
- R-014 Every link and banner in the web app that points to applika-cli points to the MCP page instead. (story: "decomissionate the cli")
- R-015 A release after the MCP reaches everyone deletes every route that only the CLI uses and the MCP does not: the legacy CLI hand-off, CLI browser authorization, `/auth/token`, `/auth/revoke`, the device-code routes and the legacy steps routes. A request to a deleted route gets the same answer as any unknown address. (R-016 answer: "remove them all"; fourth answer: "fully delete")
- R-016 The routes the web app uses keep what the web app reads: applications (with `last_step` and `finalized`), timeline, companies, platforms, supports (its platforms), the user's profile, and the web's session renewal and sign-out. The sunset release removes from them the fields only applika-cli read: `steps` and `feedbacks` from supports, and `feedback` and `salary_offer` from every application answer. Closing an application keeps every body except the legacy step body, which the sunset release refuses as invalid. (Q2: "Shared routes … stay because web/MCP use them"; fourth answer; R-016 round-2 answer: "I'll pick the recommended ones")
- R-017 From the sunset release, an installed applika-cli copy can no longer sign in or read or change the user's data, and Applika gives it no message; 0.1.x is no longer supported. (Q2: "Installed 0.1.x copies stop working on that release."; fourth answer: "0.1.x is also deprecated and not supported anymore")
- R-018 The sunset release deletes the web pages that exist only for the CLI, device-code approval and the sign-in code page; their addresses answer like any unknown page. (fourth answer: "fully delete")
- R-019 The CLI's source, tests, build, publishing and its gate leave the repository in the sunset release, and nothing publishes applika-cli again. (Q2: "removes applika/cli from the repo")
- R-020 An ADR records the end of the CLI compatibility promise, and that applika-cli 0.1.x is no longer supported, before the sunset release ships. (Q2: "writes the ADR that ends the cli-compatibility rule"; fourth answer)
- R-021 The MCP tab and the MCP page have a phone layout and a desktop layout, work in light and dark, and exist in English and Brazilian Portuguese. (owner 2026-11-08: "all futures components and pages needs also to be designed for mobile as well"; PRD 0019)
- R-022 The scope offers three choices: "Read only" (`read`), "Read and write" (`read write`: also create, edit, close and reopen), which is preselected, and "Full access" (`read write delete`: also delete timeline events, master CVs and application CVs). Every token includes `read`, and deleting has its own scope. A token lists and runs only the tools its scope allows, and a call outside its scope is refused with a numbered error code. (scope answer: "scoped access during mcp connection creation (read only, write, etc)"; R-022 round-2 answer: "I'll pick the recommended ones")
- R-023 The scope set is open: a later feature adds a scope without touching existing tokens or stored data, and every token keeps the scope it was created with. (scope answer: "we might need this in the future"; R-022 round-2 answer)

## Permissions and tenancy

Only a signed-in user creates an MCP token, from the MCP tab, and only for their own account. An MCP token cannot create, list or revoke tokens. An MCP token acts as its user on the MCP server and nowhere else, and every other API route refuses it.

An MCP token does only what its scope allows, and never more than its user may do. A tool outside the scope is absent from the token's tool list, and a call to it is refused.

Through the MCP server, a user reads and changes only their own applications, timeline events, master CVs and application CVs. A row that belongs to someone else is reported as not found, and this holds for admins too (ADR-0004). Company and platform lookups return the public rows and the user's own private rows, as the web app does. The MCP server offers no admin capability, even when its user is an admin.

The CV tools exist only for a user who has the CVs feature: a user on its beta list, an admin who has not opted out, or everyone once it is released (ADR-0018). Losing the feature removes the tools on the next request.

A user lists and revokes only their own connections, and any other connection id is reported as not found, for admins too. No one, admins included, sees another user's token, connections or scopes. Applika shows a token only once, to the user who created it.

## Edge cases

- A revoked or expired token: the next call is refused with a message that says to create a new token in Profile > MCP.
- A lost token: the user creates a new one and revokes the old one.
- One token pasted into two AI apps: both work; Devices shows one connection with the latest use of either.
- A token needs more access: the user creates a new token with a wider scope and revokes the old one; a scope never changes after creation.
- A tool outside the token's scope: it is not in the tool list, and a direct call is refused with its code and a message that points to Profile > MCP.
- The session service is down: the MCP server refuses every call with "try again", as the web app does (ADR-0019, fail closed).
- The user loses the CVs feature: the CV tools disappear on the next request.
- An application in an archived cycle: closing or editing it through MCP is refused with the web app's message.
- A tool names another user's application, CV or event: not found.
- Too many calls: refused with the time to wait.
- An old `/cli` link opens the MCP page. From the sunset release, old `/device` and `/cli/code` links answer like any unknown page.
- After the sunset release, an installed CLI that signs in gets "not found" with no hint; a signed-in copy fails its next renewal, within 15 minutes, and cannot sign in again.
- After the sunset release, closing an application with the legacy step body is refused as invalid, and nothing closes.
- A job description or CV text that tries to steer the AI app: tools that delete are marked destructive, so AI apps ask the user before they run them, and a token without the delete scope cannot run them at all.

## Non-goals

- OAuth sign-in for claude.ai and ChatGPT connectors; a later feature with its own ADR (R-003 answer).
- A local MCP package (stdio), or any Applika package on PyPI.
- Tools the CLI never had: deleting applications, drafts, jobs, reports, statistics, cycles, admin.
- Scopes beyond read, write and delete in this feature, and changing a token's scope after creation.
- A beta stage for the MCP (Q4).
- A message, forward or placeholder for a deleted CLI route (fourth answer: "fully delete").
- Publishing, maintaining or supporting any applika-cli version.
- Analytics of tool use.

## Success signals

- A signed-in user goes from the MCP tab to a working Claude Code connection in under two minutes.
- Every CLI command named in Q3 has a tool, each proven by a test, and each tool is proven to be absent and refused outside its scope.
- After the sunset release, the repository holds no route, page, handler, schema, field or test that only the CLI used, and every deleted path answers like an unknown address.
- `make leaks` finds no MCP token in the repository.

## Assumptions

- The MCP address is `https://applika.dev/api/mcp`, streamable HTTP, and the server keeps no session between requests.
- The MCP token reuses the CLI's session machinery: one Devices entry per token, the token sent in the `Authorization` header, the session check on every request and instant revocation. It differs in one way: it is one long-lived secret instead of the CLI's 15-minute token plus renewal, because AI apps keep a fixed header and never renew. So the MCP needs neither `/auth/token` nor `/auth/revoke`.
- Applika never shows a token again after creation; a lost token is replaced, never recovered.
- A token's name defaults to "MCP connection" and holds at most 100 characters.
- A user may hold any number of tokens (ADR-0019 sets no cap on devices).
- Each generated configuration targets the user's own settings, never a project file such as `.mcp.json`, so the token does not land in a git repository.
- The public MCP page lives at `/mcp`. `/cli` forwards to it, also after the sunset release, because outside links (old READMEs, search results) still point there; the forward serves visitors and holds no CLI code.
- The applika-cli banner becomes an MCP banner in the same places, dismissed the same way.
- The sunset release ships only after the owner confirms the MCP works in production. It carries one migration: the feedback catalog, which nothing reads once supports drops `feedbacks`, is renamed `feedbacks_definition_old` and kept (ADR-0012).
- The step translation behind `last_step` and the agenda stays, because the web reads it, so the step catalog keeps its name.
- "Sign out of other devices" also ends MCP connections, since each one is a device, and its confirm text says so.
- A Borderless grant that ends (ADR-0026) ends web sessions only and leaves MCP connections.
- Deleting the account ends every MCP connection.
- Devices keeps showing ended CLI sessions with their CLI labels.
- The error codes that only deleted CLI routes raised stay registered as no longer raised and are never reused (ADR-0025), as the codes ADR-0026 retired did.
- Through MCP, a CV download comes as Markdown text or as a PDF file attached to the answer; the AI app decides what to do with the file.
- Tool names, descriptions and messages are in English; the web pages are in English and Brazilian Portuguese.
- MCP calls count against a rate limit of 120 per minute per connection.
- A signed-in CLI copy keeps working for at most 15 minutes after the sunset release, the life of its access token.
