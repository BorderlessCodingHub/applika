import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Browser,
  type Page,
} from "@playwright/test";

import {
  BORDERLESS_ACCOUNTS,
  apiUrl,
  borderlessUrl,
  loginAs,
  signInWithBorderlessButton,
  signInWithFake,
  type BorderlessAccount,
} from "./support/auth";

/**
 * Borderless OpenID Connect sign-in on the real stack (ADR-0026): the built
 * web and API, a real Postgres and Redis, and the `borderless-fake` service
 * in place of Borderless (`--access-ttl 2`: every access token lives 2 s).
 * Nobody calls the real Borderless; the GitHub restore is walked up to
 * GitHub's consent URL and that navigation is aborted, so github.com is never
 * reached either.
 *
 * Serial, and careful with shared state:
 * - `e2e-free`, `e2e-starter`, `e2e-revoke` and `e2e-logout` become applika
 *   accounts on their first sign-in here; `beforeAll` and `afterAll` delete
 *   them (`DELETE /users/me`), so a retry starts from new accounts again.
 * - Seeded `e2e-user` is never signed in through the web: that would add a
 *   web session `devices.spec.ts` counts. It only shows its seeded chip.
 * - Never `POST /__fake/reset` here: the seeded users' rotated refresh
 *   tokens would be forgotten and their sessions ended.
 * - Each test starts in a new browser context, so with no fake Borderless
 *   session: the first sign-in of a test always shows the fake's own page.
 */

test.describe.configure({ mode: "serial" });

const CREATED: BorderlessAccount[] = [
  BORDERLESS_ACCOUNTS.free,
  BORDERLESS_ACCOUNTS.starter,
  BORDERLESS_ACCOUNTS.revoke,
  BORDERLESS_ACCOUNTS.logout,
];

const WEB_CALLBACK = apiUrl("/auth/borderless/callback");
const FAKE_ORIGIN = new URL(borderlessUrl()).origin;

type AuthorizeEntry = Record<string, string>;
type FakeLog = {
  authorize: AuthorizeEntry[];
  grants: Record<string, { grant_type: string; at: number }[]>;
  revokes: { sub: string | null; token_type_hint: string; known: boolean }[];
};

async function fakeLog(request: APIRequestContext): Promise<FakeLog> {
  const response = await request.get(borderlessUrl("/__fake/log"));
  expect(response.status()).toBe(200);
  return response.json();
}

async function revokesFor(
  request: APIRequestContext,
  account: BorderlessAccount,
) {
  return (await fakeLog(request)).revokes.filter(
    (entry) => entry.sub === account.sub,
  );
}

async function setFakeAccount(
  request: APIRequestContext,
  account: BorderlessAccount,
  changes: Record<string, unknown>,
) {
  const response = await request.post(
    borderlessUrl(`/__fake/accounts/${account.sub}`),
    { data: changes },
  );
  expect(response.status(), `fake account ${account.sub}`).toBe(200);
}

/** Signs `account` in through the fake in its own context, then `DELETE /users/me`. */
async function deleteAccount(browser: Browser, account: BorderlessAccount) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await signInWithFake(page, account.email);
    await page.waitForURL(/\/(welcome|dashboard)$/);
    const response = await page.request.delete(apiUrl("/users/me"));
    expect(response.status(), `delete ${account.email}`).toBeLessThan(300);
  } finally {
    await context.close();
  }
}

/** A new account answers the one-time welcome choice; an existing one lands on the dashboard. */
async function landSignedIn(page: Page, { isNew }: { isNew: boolean }) {
  if (isNew) {
    await page.waitForURL("**/welcome");
    await page.getByRole("button", { name: "Start fresh" }).click();
  }
  await page.waitForURL("**/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
}

function signInError(page: Page) {
  return page.locator('[data-slot="sign-in-error"]');
}

function primaryNav(page: Page) {
  return page.locator("aside").getByRole("navigation", { name: "Primary" });
}

function anyMembershipChip(page: Page) {
  return page.getByRole("img", { name: /^Borderless (BASE|PSP) member$/ });
}

/** The rail's account menu (desktop); its name carries the account's username. */
async function openAccountMenu(page: Page) {
  await page
    .locator("aside")
    .getByRole("button", { name: /^Open account menu for / })
    .click();
  return page.getByRole("menu");
}

async function logOut(page: Page) {
  const menu = await openAccountMenu(page);
  await menu.getByRole("menuitem", { name: "Logout" }).click();
  await page.waitForURL((url) => url.pathname === "/");
}

/** Every committed page URL of this tab, to prove no code, state or token reaches the web. */
function trackNavigations(page: Page): string[] {
  const urls: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) urls.push(frame.url());
  });
  return urls;
}

/** The CLI's PKCE pair (RFC 7636), as `applika login` makes it. */
function pkce() {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

/**
 * The CLI's loopback listener, as `applika login` opens one on 127.0.0.1.
 * The API 307s the browser straight to it, and Playwright cannot route a
 * redirect target, so a real listener receives it.
 */
async function openLoopback() {
  let landedOn: URL | null = null;
  const server = createServer((req, res) => {
    landedOn ??= new URL(req.url ?? "/", "http://127.0.0.1");
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("applika-cli got the code");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    callback: `http://127.0.0.1:${port}/callback`,
    landedOn: () => landedOn,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

type CliTokens = { access_token: string; refresh_token: string };
/** e2e-revoke's command-line session, opened in the CLI test and used by the refusal test. */
let revokeCli: CliTokens | null = null;

test.beforeAll(async ({ browser }) => {
  // A retry (CI) starts again from accounts that do not exist yet.
  for (const account of CREATED) await deleteAccount(browser, account);
});

test.afterAll(async ({ browser }) => {
  const control = await playwrightRequest.newContext();
  try {
    await setFakeAccount(control, BORDERLESS_ACCOUNTS.logout, {
      membership: "PSP",
    });
  } finally {
    await control.dispose();
  }
  for (const account of CREATED) await deleteAccount(browser, account);
});

test.describe("Borderless sign-in through OpenID Connect", () => {
  test("a PSP account signs in on Borderless's own page; logout revokes the grant; signing in again is one click (AC1, AC3, AC12, AC17, AC18, AC22, AC24)", async ({
    page,
    request,
  }) => {
    const account = BORDERLESS_ACCOUNTS.logout;
    const urls = trackNavigations(page);

    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Sign in to applika", level: 1 }),
    ).toBeVisible();
    // AC1, AC22: one button; no field, no password, no GitHub sign-in.
    await expect(signInWithBorderlessButton(page)).toBeVisible();
    await expect(page.locator("input")).toHaveCount(0);
    await expect(page.getByText(/GitHub/)).toHaveCount(0);

    await signInWithBorderlessButton(page).click();
    // The fake Borderless's own sign-in page, on its own origin.
    await page.waitForURL(borderlessUrl("/**"));
    await expect(
      page.getByRole("heading", { name: "Sign in to Borderless (fake)" }),
    ).toBeVisible();
    await page.getByLabel("Email").fill(account.email);
    await page.getByLabel("Password").fill(account.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();

    await landSignedIn(page, { isNew: true });
    await expect(
      page.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveCount(1);

    // AC3: the attempt carried PKCE S256, a state and a nonce; no `prompt`
    // on a web sign-in (AC18).
    const first = (await fakeLog(request)).authorize.at(-1)!;
    expect(first).toMatchObject({
      response_type: "code",
      client_id: "applika-fake-client",
      redirect_uri: WEB_CALLBACK,
      code_challenge_method: "S256",
    });
    expect(first.scope.split(" ")).toEqual(
      expect.arrayContaining(["openid", "profile", "email", "offline_access"]),
    );
    expect(first.code_challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first.state.length).toBeGreaterThanOrEqual(32);
    expect(first.nonce.length).toBeGreaterThanOrEqual(32);
    expect(first.state).not.toBe(first.nonce);
    expect(first).not.toHaveProperty("prompt");

    // AC12: the web never held a code, a state or a token: no web URL
    // carried one, nothing readable by script holds one.
    const webUrls = urls.filter((url) => !url.startsWith(FAKE_ORIGIN));
    for (const url of webUrls) {
      expect(url, url).not.toMatch(/[?&](code|state|token|id_token)=/);
    }
    const stored = await page.evaluate(() =>
      JSON.stringify({
        local: { ...window.localStorage },
        session: { ...window.sessionStorage },
        cookie: document.cookie,
      }),
    );
    expect(stored).not.toMatch(/__access|__refresh|__borderless_login/);
    expect(stored).not.toContain(first.state);
    expect(stored).not.toMatch(/eyJ[\w-]+\.[\w-]+/);

    // AC17: the last session's logout gives the grant back, once, and leaves
    // the Borderless browser session alone.
    const revokesBefore = (await revokesFor(request, account)).length;
    await logOut(page);
    await expect
      .poll(async () => (await revokesFor(request, account)).length, {
        message: "expected one revoke of the refresh token",
      })
      .toBe(revokesBefore + 1);
    expect((await revokesFor(request, account)).at(-1)).toMatchObject({
      token_type_hint: "refresh_token",
      known: true,
    });

    // AC18: signing in again is one click — the fake's session answers
    // straight back, its page never shows.
    const fakePagesBefore = urls.filter((url) =>
      url.startsWith(FAKE_ORIGIN),
    ).length;
    await page.goto("/login");
    await signInWithBorderlessButton(page).click();
    await landSignedIn(page, { isNew: false });
    expect(urls.filter((url) => url.startsWith(FAKE_ORIGIN))).toHaveLength(
      fakePagesBefore,
    );
    // AC3: a fresh state for every attempt.
    const second = (await fakeLog(request)).authorize.at(-1)!;
    expect(second.state).not.toBe(first.state);
    expect(second.code_challenge).not.toBe(first.code_challenge);
    expect(second).not.toHaveProperty("prompt");

    // Leave no session open: the next test's logout must be the last one.
    await logOut(page);
    await expect
      .poll(async () => (await revokesFor(request, account)).length)
      .toBe(revokesBefore + 2);
  });

  test("a membership changed on Borderless shows at the next check; the last logout revokes once (AC8, AC9, AC17)", async ({
    page,
    request,
  }) => {
    // The previous test signed e2e-logout out everywhere: this sign-in opens
    // its only session.
    const account = BORDERLESS_ACCOUNTS.logout;
    await signInWithFake(page, account.email);
    await landSignedIn(page, { isNew: false });
    await expect(
      page.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveCount(1);

    await setFakeAccount(request, account, { membership: "BASE" });
    // The access token lives 2 s; past it, the next session refresh reads
    // the membership again through a refresh grant.
    const grantsBefore = (await fakeLog(request)).grants[account.sub] ?? [];
    await page.waitForTimeout(2_500);
    await page.reload();
    await expect(
      page.getByRole("img", { name: "Borderless BASE member" }),
    ).toHaveCount(1);
    await expect(
      page.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveCount(0);
    const grantsAfter = (await fakeLog(request)).grants[account.sub] ?? [];
    expect(
      grantsAfter
        .slice(grantsBefore.length)
        .some((grant) => grant.grant_type === "refresh_token"),
    ).toBe(true);

    const revokesBefore = (await revokesFor(request, account)).length;
    await logOut(page);
    await expect
      .poll(async () => (await revokesFor(request, account)).length)
      .toBe(revokesBefore + 1);
  });

  test("a FREE account is new: /welcome once, Start fresh, then no badge and no Reports (AC8)", async ({
    page,
  }) => {
    await signInWithFake(page, BORDERLESS_ACCOUNTS.free.email);

    await page.waitForURL("**/welcome");
    await expect(
      page.getByRole("heading", {
        name: "Used applika with GitHub before?",
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Restore your data from GitHub" }),
    ).toBeVisible();

    // Any other page sends a new account back to the choice first.
    await page.goto("/applications");
    await page.waitForURL("**/welcome");

    await page.getByRole("button", { name: "Start fresh" }).click();
    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    const me = await page.request.get(apiUrl("/users/me"));
    expect(me.status()).toBe(200);
    const user = await me.json();
    expect(user.github_restore).toEqual({ available: true, prompt: false });
    expect(user.badges).toEqual([]);
    expect(user.borderless).toMatchObject({
      status: "active",
      email: BORDERLESS_ACCOUNTS.free.email,
    });
    await page.goto("/welcome");
    await page.waitForURL("**/dashboard");

    // No badge, no Reports entry, the API refuses with RPT-1001.
    await expect(
      primaryNav(page).getByRole("link", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(
      primaryNav(page).getByRole("link", { name: "Reports" }),
    ).toHaveCount(0);
    await expect(anyMembershipChip(page)).toHaveCount(0);

    const reports = await page.request.get(apiUrl("/reports"));
    expect(reports.status()).toBe(403);
    expect((await reports.json()).code).toBe("RPT-1001");

    await page.goto("/reports");
    await expect(
      page.getByRole("heading", {
        name: "Reports are for Borderless BASE and PSP members",
        level: 1,
      }),
    ).toBeVisible();
  });

  test("a STARTER account holds no badge (AC8)", async ({ page }) => {
    await signInWithFake(page, BORDERLESS_ACCOUNTS.starter.email);
    await landSignedIn(page, { isNew: true });

    await expect(anyMembershipChip(page)).toHaveCount(0);
    await expect(
      primaryNav(page).getByRole("link", { name: "Reports" }),
    ).toHaveCount(0);
    const user = await (await page.request.get(apiUrl("/users/me"))).json();
    expect(user.badges).toEqual([]);
  });

  test("the profile offers the GitHub restore; it leaves for github.com asking only read:user", async ({
    page,
  }) => {
    await signInWithFake(page, BORDERLESS_ACCOUNTS.free.email);
    // Answered already: straight to the dashboard, never /welcome.
    await page.waitForURL("**/dashboard");

    await page.goto("/profile");
    const card = page.locator('[data-slot="github-restore-card"]');
    await expect(card).toBeVisible();

    let attemptedUrl: string | null = null;
    await page.route("https://github.com/**", async (route) => {
      attemptedUrl = route.request().url();
      await route.abort();
    });

    await card
      .getByRole("button", { name: "Restore data from GitHub" })
      .click();

    await expect
      .poll(() => attemptedUrl, {
        message: "expected a navigation attempt to github.com",
      })
      .not.toBeNull();
    const url = new URL(attemptedUrl as unknown as string);
    expect(url.hostname).toBe("github.com");
    expect(url.pathname).toBe("/login/oauth/authorize");
    expect(url.searchParams.get("scope")).toBe("read:user");
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  test("a restore outcome shows its words once and clears the URL", async ({
    page,
  }) => {
    await signInWithFake(page, BORDERLESS_ACCOUNTS.free.email);
    await page.waitForURL("**/dashboard");

    await page.goto("/profile?account=github&status=not_found");
    const notice = page.locator('[data-slot="github-restore-notice"]');
    await expect(notice).toHaveAttribute("data-status", "not_found");
    await expect(notice.getByRole("alert")).toHaveText(
      "No old applika account was found for this GitHub account. Nothing was changed.",
    );
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("an email Borderless has not verified lands on /login with words to verify it there (AC7, AC12, AC21)", async ({
    page,
  }) => {
    await signInWithFake(page, BORDERLESS_ACCOUNTS.unverified.email);

    await page.waitForURL("**/login?error=AUTH-1005");
    // Nothing but the code in the URL bar.
    expect(new URL(page.url()).search).toBe("?error=AUTH-1005");
    await expect(signInError(page)).toHaveAttribute("data-code", "AUTH-1005");
    await expect(signInError(page)).toHaveText(
      "Verify your email on Borderless first",
    );
    // The way back is right below the words.
    await expect(signInWithBorderlessButton(page)).toBeVisible();
    const me = await page.request.get(apiUrl("/users/me"));
    expect(me.status()).toBe(401);
  });

  test("seeded e2e-user sees its own PSP chip in the menu and on the profile, and no restore", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/profile");

    const header = page.getByRole("heading", { level: 1 });
    await expect(header).toBeVisible();
    const chips = page.getByRole("img", { name: "Borderless PSP member" });
    // The profile header and the sidebar account trigger.
    await expect(chips).toHaveCount(2);
    await expect(chips.first()).toHaveText("PSP");
    await expect(
      page.getByRole("img", { name: "Borderless BASE member" }),
    ).toHaveCount(0);

    const menu = await openAccountMenu(page);
    await expect(
      menu.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveText("PSP");
    await page.keyboard.press("Escape");

    // e2e-user has its GitHub identity on record.
    await expect(
      page.getByRole("button", { name: "Restore data from GitHub" }),
    ).toHaveCount(0);
  });

  test("applika login asks on Borderless even with a Borderless session, and leaves the browser's applika session alone (AC19, AC20)", async ({
    page,
    request,
  }) => {
    const account = BORDERLESS_ACCOUNTS.revoke;
    await signInWithFake(page, account.email);
    await landSignedIn(page, { isNew: true });
    const sessionBefore = (await page.context().cookies())
      .filter((cookie) => ["__access", "__refresh"].includes(cookie.name))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .sort();
    expect(sessionBefore).toHaveLength(2);

    const { verifier, challenge } = pkce();
    const loopback = await openLoopback();
    const callback = loopback.callback;
    const state = `e2e-${randomBytes(8).toString("hex")}`;

    const authorize = new URL(apiUrl("/auth/cli/authorize"));
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("state", state);
    await page.goto(authorize.toString());

    // The fake's page shows despite its session: `prompt=login`.
    await page.waitForURL(borderlessUrl("/**"));
    await expect(
      page.getByRole("heading", { name: "Sign in to Borderless (fake)" }),
    ).toBeVisible();
    expect((await fakeLog(request)).authorize.at(-1)).toMatchObject({
      prompt: "login",
      redirect_uri: WEB_CALLBACK,
      code_challenge_method: "S256",
    });
    await page
      .getByRole("button", { name: account.email, exact: true })
      .click();

    let url: URL;
    try {
      await expect
        .poll(() => loopback.landedOn(), {
          message: "expected the loopback redirect",
        })
        .not.toBeNull();
      url = loopback.landedOn()!;
    } finally {
      await loopback.close();
    }
    expect(url.pathname).toBe("/callback");
    const code = url.searchParams.get("code");
    expect(code).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(state);
    expect([...url.searchParams.keys()].sort()).toEqual(["code", "state"]);

    // The browser's own applika session: not opened, ended or replaced.
    const sessionAfter = (await page.context().cookies())
      .filter((cookie) => ["__access", "__refresh"].includes(cookie.name))
      .map((cookie) => `${cookie.name}=${cookie.value}`)
      .sort();
    expect(sessionAfter).toEqual(sessionBefore);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    // The CLI redeems the code with its verifier, as every version does.
    const token = await request.post(apiUrl("/auth/token"), {
      data: {
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: callback,
        device_name: "e2e-revoke-cli",
      },
    });
    expect(token.status()).toBe(200);
    revokeCli = await token.json();
    expect(revokeCli?.access_token).toBeTruthy();
    expect(revokeCli?.refresh_token).toBeTruthy();
  });

  test("a refused grant ends the web sessions with words, keeps the CLI signed in but locked, and the next web sign-in restores it (AC13, AC14, AC15, AC23)", async ({
    page,
    request,
  }) => {
    expect(revokeCli, "the CLI test opened a session").not.toBeNull();
    const account = BORDERLESS_ACCOUNTS.revoke;
    await signInWithFake(page, account.email);
    await landSignedIn(page, { isNew: false });
    await expect(
      page.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveCount(1);

    // Borderless refuses applika's grant (30 days, or access revoked).
    const revoked = await request.post(
      borderlessUrl(`/__fake/grants/${account.sub}/revoke`),
    );
    expect(revoked.status()).toBe(200);
    expect((await revoked.json()).revoked).toBeGreaterThan(0);

    // Past the access token's 2 s, the web's next session refresh asks.
    await page.waitForTimeout(2_500);
    const refused = page.waitForResponse(
      (response) =>
        response.url() === apiUrl("/auth/refresh") && response.status() === 401,
    );
    await page.reload();
    const refusal = await refused;
    expect(await refusal.json()).toEqual({
      detail:
        "Your Borderless sign-in has ended. Sign in again with Borderless",
      code: "AUTH-1049",
    });

    // AC13: the sign-in page says what happened and what to do.
    await page.waitForURL("**/login?error=AUTH-1049");
    await expect(signInError(page)).toHaveAttribute("data-code", "AUTH-1049");
    await expect(signInError(page)).toHaveText(
      "Your Borderless sign-in has ended. Sign in again with Borderless",
    );
    const signedOut = await page.request.get(apiUrl("/users/me"));
    expect(signedOut.status()).toBe(401);

    // AC14: the command-line session stays signed in…
    const refreshedCli = await request.post(apiUrl("/auth/token"), {
      data: {
        grant_type: "refresh_token",
        refresh_token: revokeCli!.refresh_token,
      },
    });
    expect(refreshedCli.status()).toBe(200);
    revokeCli = await refreshedCli.json();
    const bearer = { Authorization: `Bearer ${revokeCli!.access_token}` };
    expect(
      (await request.get(apiUrl("/users/me"), { headers: bearer })).status(),
    ).toBe(200);

    // …but a member route is stopped, naming the applika website.
    const locked = await request.get(apiUrl("/reports"), { headers: bearer });
    expect(locked.status()).toBe(403);
    expect(await locked.json()).toEqual({
      detail:
        "Your Borderless sign-in has ended. Sign in again on the applika website to use member features",
      code: "AUTH-1050",
    });

    // AC23: the web sessions read as ended in the Devices list.
    const sessions: { client_type: string; status: string }[] = await (
      await request.get(apiUrl("/users/me/sessions"), { headers: bearer })
    ).json();
    const web = sessions.filter((row) => row.client_type === "web");
    expect(web.length).toBeGreaterThanOrEqual(2);
    expect(web.every((row) => row.status === "revoked")).toBe(true);
    expect(
      sessions.some(
        (row) => row.client_type === "cli" && row.status === "active",
      ),
    ).toBe(true);

    // AC14: the next web sign-in restores member access to every session.
    // This browser still holds its Borderless session: one click (AC18).
    await signInWithBorderlessButton(page).click();
    await landSignedIn(page, { isNew: false });
    await expect(
      page.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveCount(1);
    const reopened = await request.get(apiUrl("/reports"), { headers: bearer });
    expect(reopened.status()).toBe(200);

    // The CLI signs out as every version does.
    const signOut = await request.post(apiUrl("/auth/revoke"), {
      data: { refresh_token: revokeCli!.refresh_token },
    });
    expect(signOut.status()).toBe(204);
  });
});
