# Plan 0009 — Release B record and owner by-hand walk (K10, T158/T159)

Plan: docs/plan/0009-discord-account-link.md · Tasks: docs/plan/0009-discord-account-link.tasks.md (K10)
ADR: docs/adr/0013-discord-connection-and-report-webhook-routing.md
Recorded: 2026-09-25 by the build orchestrator for K10.


## Release B

- Branch `integration/0009-discord-account-link`. The K10 tip is Release B, tagged `0009-release-b`
  (local annotated tag; the owner pushes it).
- Release B ships code only. It has no Alembic revision: `git diff 0009-release-a2..0009-release-b -- backend/migrations` is empty.
- The owner merges `0009-release-b` into `develop` only after confirming that Release A2
  (`0009-release-a2`, revision `ba44f9cfd3c1`) ran `alembic upgrade head` in prod.
  If B is deployed before A2's migration, `/users/me` reads a missing table and every page
  returns 500.

## Owner steps before deploy (swarm stack)

1. Set on the API service of the swarm stack:
   1. `DISCORD_CLIENT_ID`: the Discord application's client id.
   2. `DISCORD_CLIENT_SECRET`: the Discord application's client secret.
   3. `DISCORD_TOKEN_ENCRYPTION_KEY`: a **new** Fernet key
      (`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`),
      distinct from `GITHUB_TOKEN_ENCRYPTION_KEY`. Back it up with the stack secrets: losing or
      changing it forces every linked user to reconnect.
   4. `DISCORD_LINK_REDIRECT_URI`: the https prod callback, `https://<prod api host>/api/auth/link/discord/callback`.
   5. `ACCOUNT_LINK_REDIRECT_URI`: the prod profile URL, `https://<prod frontend host>/profile`.
2. Register the exact `DISCORD_LINK_REDIRECT_URI` value under OAuth2 → Redirects in the Discord
   Developer Portal.
3. Keep `DISCORD_REPORTS_WEBHOOK` and `DISCORD_REPORTS_ORGANIZATION` set until Release C is
   proven. Release B ignores them, but a rollback to the previous image needs them.
4. Keep `DISCORD_FEEDBACK_WEBHOOK` as is; feedback still posts there.

## Owner steps after deploy

1. The CD deploy updates the images (no migration to run for B).
2. An admin adds the report webhooks on the admin Discord webhooks page. Until then, reports are
   saved and posted nowhere.

## Rollback order

- Rollback B = point the swarm stack back to the previous image tag (the Release A2 image) and
  restart the API container. B has no revision, so there is no `alembic downgrade` for B.
- If Release C shipped, roll C back first (`alembic downgrade` to the K5 revision
  `ba44f9cfd3c1` inside the API container), then roll B back. Full order: C → B → A2.
- Rollback A2 (only if needed after B is rolled back) = `alembic downgrade c1d9f4a7b3e6` + the
  previous image; it drops both Discord tables (users reconnect, admins re-enter webhooks).

## Success signals

1. No Discord id is linked to two users (`discord_connections.discord_id` is unique; spot-check
   `SELECT discord_id, count(*) FROM discord_connections GROUP BY 1 HAVING count(*) > 1` is empty).
2. No access token and no plaintext refresh token in the DB: `discord_connections` has no
   access-token column, and the refresh-token column holds Fernet ciphertext (starts with `gAAAAA`).
3. The GitHub consent screen asks for email only (no organisation access).
4. `whoami` is green on applika-cli 0.1.4, 0.2.0 and 1.0.0.

## Owner by-hand walk (T158)

Needs a real stack, a real Discord application, two test Discord accounts (D1, D2), two Applika
users (U1, U2; one admin), and a test Discord server with two roles (R1, R2) and two webhooks
(H1 unrestricted, H2 limited to R1). Tick each step; the expected result is after the arrow.

### Connect and link

1. U1 opens Profile → Connect Discord → the Discord consent lists `identify`, `guilds` and
   `guilds.members.read`.
2. Approve with D1 → back on Profile: "Connected as <D1 name>" with the avatar; the URL has no
   query string left; no raw Discord id text shown.
3. DB: the `discord_connections` row for U1 holds discord id, username, global name, avatar
   hash, scopes, access expiry, status `active`, `linked_at`, `updated_at`; the refresh token is
   ciphertext; no access token anywhere; `users` has no Discord column.
4. Browser devtools: the callback response sends no `Set-Cookie`.
5. Replay the same callback URL → the profile shows the failed outcome.
6. Start Connect and cancel on the consent → the profile shows the failed outcome.
7. U2 connects D1 → U2 sees "Connected as <D1 name>"; U1's row is gone and U1's profile shows
   Connect Discord; U1's next feedback has no mention; the Discord Authorized Apps entry of D1
   stays (nothing revoked); U2's next report still routes.

### Admin webhooks

8. Admin adds H1 (no roles) and H2 (role R1) → each shows masked after save.
9. A bad URL is refused; a duplicate URL is refused.
10. Edit H2's roles → saved.
11. The full URL is never shown again (list, edit, API responses).
12. A non-admin reaches neither the page nor `/api/admin/discord-webhooks`.

### Report routing

13. A linked user holding R1 submits a report → posted to H1 and H2, with the mention on the
    first line after `@username`.
14. A linked user without R1 → posted to H1 only.
15. A linked user in no configured server → report saved, posted nowhere.
16. An unlinked user → report saved, posted nowhere.
17. After a report, the stored refresh-token ciphertext has changed (rotation).

### Revoked or failing Discord

18. Revoke the app in Discord → User Settings → Authorized Apps → the next report is saved and
    not posted, and the profile shows Reconnect Discord.
19. Reconnect → "Connected as" again; `needs_reconnect` cleared.
20. Block discord.com from the API host → report returns 201, not posted; the link stays active.

### Feedback

21. A linked user's feedback mentions them, also while `needs_reconnect`.
22. An unlinked user's feedback post is unchanged.

### Disconnect

23. Disconnect → confirm → the row is gone and the Authorized Apps entry is gone.
24. The next feedback has no mention; the next report is posted nowhere.
25. Relinking works.

### Key unset

26. Unset `DISCORD_TOKEN_ENCRYPTION_KEY`, restart → Connect toasts "Discord linking is unavailable".
27. Disconnect still works.
28. Reports are posted nowhere.
29. Feedback still mentions linked users. Restore the key afterwards.

### Account, GitHub, CLI, UI

30. Delete a linked account → its `discord_connections` row is gone and the grant is revoked at
    Discord.
31. The GitHub consent asks for email only; the admin user detail shows no organisation field.
32. `uvx applika-cli==0.1.4 whoami`, then `uvx applika-cli==0.2.0 whoami` and
    `uvx applika-cli==1.0.0 whoami` → all green; CLI login works.
33. Walk the profile Discord card and the admin webhooks page in light and dark theme, on
    desktop and on mobile width → layout and states correct.

## What the automated layers already prove

- E2E (`scripts/e2e.sh`, real stack, no mocked API): `frontend/e2e/profile-discord.spec.ts`,
  `frontend/e2e/admin-discord-webhooks.spec.ts` and the rest of the suite.
- Real Discord cannot run in E2E; routing, OAuth and revoke are carried by
  `backend/tests/unit/test_resolve_report_webhooks.py`, `backend/tests/integration/test_quinzenal_reports.py`,
  `backend/tests/unit/test_discord_oauth_service.py`, `backend/tests/integration/test_account_link_discord.py`,
  `backend/tests/integration/test_user_feedback.py`, `backend/tests/unit/test_discord_mentions.py`,
  `backend/tests/integration/test_admin_discord_webhooks.py`.
