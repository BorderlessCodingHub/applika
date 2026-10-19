import type { Page } from "@playwright/test";

/**
 * Real seeded sessions for the E2E suite (KODI-001 / R-003).
 *
 * `frontend/scripts/e2e.sh` runs the backend's own seed script inside the API container.
 * It creates two genuine user rows in the real database and mints real session
 * material with the backend's own token code — a signed `__access` JWT and an
 * opaque `__refresh` token stored in the real Redis — then exports them as the
 * `E2E_*` variables read below.
 *
 * `loginAs` installs exactly the cookies a successful GitHub OAuth callback
 * would set, which is the ONLY thing it bypasses: GitHub's own site cannot be
 * driven headless. No login route is added, nothing is mocked, and every
 * request the app makes afterwards — starting with `GET /api/users/me` — hits
 * the real API against the real database.
 */

export type SeededRole = "user" | "admin" | "discord";

/**
 * The seeded identities, stable across runs. Specs assert against these real
 * values rather than against a browser stub.
 *
 * `discord` (KODI-022, plan 0009) is `e2e-discord`, seeded with a fixed
 * Discord id RE-SET on every seed run — so a Disconnect performed by the E2E
 * suite is undone the next time `frontend/scripts/e2e.sh` seeds, and the role is
 * deterministically linked at the start of every run.
 */
export const SEEDED_USERS = {
  user: {
    username: "e2e-user",
    email: "e2e-user@e2e.applika.dev",
    isAdmin: false,
  },
  admin: {
    username: "e2e-admin",
    email: "e2e-admin@e2e.applika.dev",
    isAdmin: true,
  },
  discord: {
    username: "e2e-discord",
    email: "e2e-discord@e2e.applika.dev",
    isAdmin: false,
  },
} as const satisfies Record<
  SeededRole,
  { username: string; email: string; isAdmin: boolean }
>;

/** The env var names `frontend/scripts/e2e.sh` exports for each role. */
const ENV_VARS = {
  user: {
    id: "E2E_USER_ID",
    access: "E2E_ACCESS_TOKEN",
    refresh: "E2E_REFRESH_TOKEN",
  },
  admin: {
    id: "E2E_ADMIN_USER_ID",
    access: "E2E_ADMIN_ACCESS_TOKEN",
    refresh: "E2E_ADMIN_REFRESH_TOKEN",
  },
  discord: {
    id: "E2E_DISCORD_USER_ID",
    access: "E2E_DISCORD_ACCESS_TOKEN",
    refresh: "E2E_DISCORD_REFRESH_TOKEN",
  },
} as const satisfies Record<
  SeededRole,
  { id: string; access: string; refresh: string }
>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `${name} is not set. Run the suite through ` +
        `\`frontend/scripts/e2e.sh\` from the ` +
        `repo root — it stands up the real stack, seeds the real users and ` +
        `exports this variable. Playwright is not meant to be run standalone ` +
        `here (\`pnpm e2e\` alone will not work).`,
    );
  }
  return value;
}

/** The seeded primary key for a role, as returned by `GET /api/users/me`. */
export function seededUserId(role: SeededRole): string {
  return requireEnv(ENV_VARS[role].id);
}

/**
 * Install the REAL seeded session for `role` in the browser context.
 *
 * Call BEFORE `page.goto(...)`: the app resolves identity on the client (static
 * export, no server middleware), so the cookie has to be there when the first
 * page boots.
 *
 * The cookies are scoped by `domain` + `path` rather than by `url` on purpose.
 * Applika serves the web app on `127.0.0.1:8180` and the API on
 * `127.0.0.1:8100`; cookies ignore the port, so a host-scoped cookie is sent to
 * both origins. Pinning to a `url` would bind them to one port and the API
 * calls would go out unauthenticated. `secure: false` because the E2E stack is
 * plain HTTP on loopback.
 */
export async function loginAs(page: Page, role: SeededRole): Promise<void> {
  const { access, refresh } = ENV_VARS[role];

  await page.context().addCookies([
    {
      name: "__access",
      value: requireEnv(access),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
    {
      name: "__refresh",
      value: requireEnv(refresh),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
    },
  ]);
}

/**
 * The `Cookie` header carrying a real seeded session, for specs that need to
 * talk to the API out-of-band through Playwright's `request` fixture. Not
 * mocking: it is the same session cookie the browser carries.
 */
export function authCookieHeader(role: SeededRole): string {
  const { access, refresh } = ENV_VARS[role];
  return `__access=${requireEnv(access)}; __refresh=${requireEnv(refresh)}`;
}

/** The real API origin the browser's XHRs hit (`:8100`, not the web origin). */
export function apiUrl(path = ""): string {
  const base = process.env.E2E_API_URL ?? "http://127.0.0.1:8100/api";
  return `${base}${path}`;
}

/**
 * The `Authorization` header value of e2e-user's seeded CLI session
 * (KODI-057: a `cli_device` session named "e2e-cli", exported by
 * `frontend/scripts/e2e.sh` as `E2E_CLI_ACCESS_TOKEN`). The CLI sends its access token
 * as a Bearer, never as a cookie. `e2e/devices.spec.ts` revokes this session,
 * so it is refused for the rest of the run after that spec.
 */
export function cliBearerHeader(): string {
  return `Bearer ${requireEnv("E2E_CLI_ACCESS_TOKEN")}`;
}
