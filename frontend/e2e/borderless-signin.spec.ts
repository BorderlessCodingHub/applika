import { createHash, randomBytes } from "node:crypto";
import { connect } from "node:net";

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
  type Request,
} from "@playwright/test";

import {
  BORDERLESS_ACCOUNTS,
  apiUrl,
  borderlessUrl,
  deleteAccount,
  loginAs,
  signInWithBorderlessButton,
  signInWithFake,
  type BorderlessAccount,
} from "./support/auth";
import { COOKIE_NOTICE_ACKNOWLEDGED } from "./support/cookie-notice";
import {
  PHONE,
  expectNoSidewaysScroll,
  expectPhoneTargets,
} from "./support/phone";

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
 *
 * `/login` is sign-in option C below md (signin/C_Mobile, its "Continue with
 * Borderless" with Borderless's logo before the label) and option A at md
 * and up (signin/A_Desktop: the paired tiles in one card, "Sign in with
 * Borderless"), one tree per width by CSS: role queries see the tree the
 * viewport shows; a `data-slot` locator names its tree. The last describe
 * walks both trees' states signed out: C at 390×844 (and 320), A at 1280,
 * pending included (recorded in the page the moment it renders; the real
 * API answers, then the fake's page, and Back brings the page back ready).
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

type SignInTree = "sign-in-desktop" | "sign-in-phone";

/** The refusal box of one width's tree (each tree has its own). */
function signInError(page: Page, tree: SignInTree = "sign-in-desktop") {
  return page.locator(`[data-slot="${tree}"] [data-slot="sign-in-error"]`);
}

function cliHint(page: Page, tree: SignInTree) {
  return page.locator(`[data-slot="${tree}"] [data-slot="sign-in-cli-hint"]`);
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
 * A loopback port nothing listens on, for the CLI's callback URL. Found by
 * CONNECTING (refused), never by listening: `applika login` opens its own
 * listener there, this test opens none. The API's 307 to it is observed as
 * the browser's own request instead (see the CLI test).
 */
async function closedLoopbackPort(): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 20_000 + Math.floor(Math.random() * 40_000);
    const refused = await new Promise<boolean>((resolve) => {
      const socket = connect({ host: "127.0.0.1", port });
      socket.once("connect", () => {
        socket.destroy();
        resolve(false);
      });
      socket.once("error", (error: NodeJS.ErrnoException) =>
        resolve(error.code === "ECONNREFUSED"),
      );
    });
    if (refused) return port;
  }
  throw new Error("no closed loopback port found on 127.0.0.1");
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
    expect(stored).not.toMatch(/__access|__refresh|__applika_login/);
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

  test("a new account answers the welcome choice on a phone (v2/Welcome)", async ({
    browser,
  }) => {
    // STARTER answered on the desktop just before: deleted, it is new again.
    await deleteAccount(browser, BORDERLESS_ACCOUNTS.starter);
    const context = await browser.newContext({
      viewport: PHONE,
      storageState: COOKIE_NOTICE_ACKNOWLEDGED,
    });
    try {
      const page = await context.newPage();
      await signInWithFake(page, BORDERLESS_ACCOUNTS.starter.email);
      await page.waitForURL("**/welcome");

      await expect(page.locator('[data-slot="welcome-phone"]')).toBeVisible();
      await expect(
        page.getByRole("heading", {
          name: "Used applika with GitHub before?",
          level: 1,
        }),
      ).toBeVisible();
      const choice = page.getByRole("radiogroup", { name: "How to start" });
      const restore = choice.getByRole("radio", {
        name: "Bring back your old account",
      });
      const fresh = choice.getByRole("radio", {
        name: "Start with an empty account",
      });
      await expect(restore).toBeChecked();
      await expect(
        page.getByRole("button", { name: "Restore your data from GitHub" }),
      ).toBeVisible();
      // The two answers and the button (the applika-cli banner shows on Today only).
      await expectPhoneTargets(page, 3);
      await expectNoSidewaysScroll(page);

      // One button, for the answer picked.
      await fresh.click();
      await expect(fresh).toBeChecked();
      await expect(
        page.getByRole("button", { name: "Restore your data from GitHub" }),
      ).toHaveCount(0);
      await page
        .getByRole("button", { name: "Start fresh", exact: true })
        .click();

      await page.waitForURL("**/dashboard");
      await expect(page.locator('[data-slot="phone-tab-bar"]')).toBeVisible();
      const user = await (await page.request.get(apiUrl("/users/me"))).json();
      expect(user.github_restore).toEqual({ available: true, prompt: false });
    } finally {
      await context.close();
    }
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
    const port = await closedLoopbackPort();
    const loopbackOrigin = `http://127.0.0.1:${port}`;
    const callback = `${loopbackOrigin}/callback`;
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

    // The callback 307s the browser to the CLI's loopback. Nothing listens
    // there: Playwright raises a request for every redirect hop (a route
    // never sees a redirect target), so the hop is read as the browser
    // makes it, and its navigation is left to fail.
    const toLoopback = (hop: Request) =>
      hop.url().startsWith(`${loopbackOrigin}/`);
    const hopSeen = page.waitForRequest(toLoopback);
    const hopFailed = page.waitForEvent("requestfailed", toLoopback);
    await page
      .getByRole("button", { name: account.email, exact: true })
      .click();
    const hop = await hopSeen;

    // The hop is the API callback's own 307, reached from Borderless's answer.
    expect(hop.isNavigationRequest()).toBe(true);
    expect(hop.method()).toBe("GET");
    const fromCallback = hop.redirectedFrom();
    expect(fromCallback, "the hop before the loopback").toBeTruthy();
    const callbackUrl = new URL(fromCallback!.url());
    expect(`${callbackUrl.origin}${callbackUrl.pathname}`).toBe(WEB_CALLBACK);
    expect((await fromCallback!.response())?.status()).toBe(307);
    const fromFake = fromCallback!.redirectedFrom();
    expect(fromFake, "the hop before the callback").toBeTruthy();
    expect(new URL(fromFake!.url()).origin).toBe(FAKE_ORIGIN);
    // Nobody served it: no listener on the port.
    expect((await hopFailed).failure()?.errorText).toBe(
      "net::ERR_CONNECTION_REFUSED",
    );

    const url = new URL(hop.url());
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
    // The tab that followed the hop is still committing the browser's error
    // page; a new tab of the same browser opens the dashboard on that session.
    const tab = await page.context().newPage();
    await tab.goto("/dashboard");
    await expect(
      tab.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();
    await tab.close();

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

test.describe("the sign-in page signed out: option C below md, option A at md and up", () => {
  const AUTH_1046 =
    "The sign-in expired or was started in another browser. Start it again";
  const CLI_RETRY = "Return to your terminal and run applika login again.";

  async function openPhone(page: Page, path: string) {
    await page.setViewportSize(PHONE);
    await page.goto(path);
    await expect(page.locator('[data-slot="sign-in-phone"]')).toBeVisible();
    await expect(page.locator('[data-slot="sign-in-desktop"]')).toBeHidden();
  }

  test("390×844, ready: C_Mobile's heading, the badge on the app icon, Continue with Borderless", async ({
    page,
  }) => {
    await openPhone(page, "/login");
    const phone = page.locator('[data-slot="sign-in-phone"]');

    await expect(
      page.getByRole("heading", {
        name: "One account for your whole job search",
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      phone.getByRole("img", { name: "Applika", exact: true }),
    ).toBeVisible();
    const badge = phone.getByRole("img", { name: "with Borderless" });
    await expect(badge).toBeVisible();
    await expect(badge).toHaveAttribute("src", "/borderless-logo.png");
    // Served by the built frontend: the image decoded.
    expect(
      await badge.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    await expect(phone.getByText("applika × Borderless")).toBeVisible();

    // Focus on load lands in the visible tree's CTA.
    const cta = signInWithBorderlessButton(page);
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeVisible();
    await expect(cta).toBeFocused();
    await expect(cta).toHaveAccessibleName("Continue with Borderless");
    // Borderless's mark before the label: decorative, decoded, 20×20.
    const logo = cta.locator('img[data-slot="sign-in-logo"]');
    await expect(logo).toHaveAttribute("alt", "");
    await expect(cta.getByRole("img")).toHaveCount(0);
    expect(
      await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    const logoBox = (await logo.boundingBox())!;
    expect(logoBox.width).toBeCloseTo(20, 0);
    expect(logoBox.height).toBeCloseTo(20, 0);
    expect(
      await logo.evaluate((img) => getComputedStyle(img).borderRadius),
    ).toBe("0px");
    const label = await cta.evaluate((button) => {
      const range = document.createRange();
      const text = Array.from(button.childNodes).find(
        (node) => node.nodeType === Node.TEXT_NODE,
      )!;
      range.selectNodeContents(text);
      return range.getBoundingClientRect().x;
    });
    expect(logoBox.x + logoBox.width).toBeLessThanOrEqual(label);
    // C's 56px button, unchanged.
    expect((await cta.boundingBox())!.height).toBeCloseTo(56, 0);
    await expect(cta).toHaveAccessibleDescription(
      "Sign in with Borderless. It confirms it's you and sends you back here.",
    );
    const account = page.getByRole("link", {
      name: "I don't have a Borderless account",
    });
    await expect(account).toBeVisible();
    await expect(account).toHaveAttribute("target", "_blank");
    await expect(account).toHaveAccessibleDescription("Opens in a new tab.");
    await expect(
      page.getByRole("link", { name: "Back to home", exact: true }),
    ).toHaveAttribute("href", "/");
    await expect(
      page.getByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveCount(1);
    await expect(signInError(page, "sign-in-phone")).toBeEmpty();
    await expect(cliHint(page, "sign-in-phone")).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(0);

    await expectPhoneTargets(page, 5);
    await expectNoSidewaysScroll(page);

    // At 320 the button keeps its logo and its words on the page, nothing sideways.
    await page.setViewportSize({ width: 320, height: 720 });
    await expect(logo).toBeVisible();
    await expectPhoneTargets(page, 5);
    await expectNoSidewaysScroll(page);
  });

  test("390×844 light, in Portuguese: C's words, the logo before Continuar com a Borderless", async ({
    page,
  }) => {
    await openPhone(page, "/login");
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await page
      .getByRole("radiogroup", { name: "Toggle language" })
      .getByRole("radio", { name: "Português" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

    const cta = signInWithBorderlessButton(page).or(
      page.getByRole("button", { name: "Continuar com a Borderless" }),
    );
    await expect(cta).toHaveAccessibleName("Continuar com a Borderless");
    await expect(cta.locator('img[data-slot="sign-in-logo"]')).toHaveAttribute(
      "alt",
      "",
    );
    await expect(
      page.getByRole("heading", {
        name: "Uma conta para toda a sua busca de emprego",
        level: 1,
      }),
    ).toBeVisible();
    const account = page.getByRole("link", {
      name: "Não tenho conta na Borderless",
    });
    await expect(account).toHaveAttribute("target", "_blank");
    await expect(account).toHaveAccessibleDescription("Abre em uma nova aba.");
    // The label may take two lines below 340px: it stays inside the button.
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 720 });
      const fit = await cta.evaluate((button) => ({
        overflowX: button.scrollWidth - button.clientWidth,
        overflowY: button.scrollHeight - button.clientHeight,
      }));
      expect(fit, `${width}px`).toEqual({ overflowX: 0, overflowY: 0 });
      await expectPhoneTargets(page, 5);
      await expectNoSidewaysScroll(page);
    }
  });

  test("390×844, refused: ?error=AUTH-1046 says why in the phone tree's alert, focused", async ({
    page,
  }) => {
    await openPhone(page, "/login?error=AUTH-1046");

    const alert = signInError(page, "sign-in-phone");
    await expect(alert).toHaveAttribute("data-code", "AUTH-1046");
    await expect(alert).toHaveText(AUTH_1046);
    await expect(alert).toBeVisible();
    await expect(alert.locator('[tabindex="-1"]')).toBeFocused();
    await expect(cliHint(page, "sign-in-phone")).toHaveCount(0);
    // The way back is right below the words.
    await expect(signInWithBorderlessButton(page)).toBeVisible();
    await expectPhoneTargets(page, 5);
    await expectNoSidewaysScroll(page);
  });

  test("390×844, from the command line: &cli=1 shows the terminal hint", async ({
    page,
  }) => {
    await openPhone(page, "/login?cli=1");

    const hint = cliHint(page, "sign-in-phone");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(CLI_RETRY);
    await expect(hint.locator("code")).toHaveText("applika login");
    await expect(signInError(page, "sign-in-phone")).toBeEmpty();
    // The h1 stays the web sign-in's: the button starts a web sign-in.
    await expect(
      page.getByRole("heading", {
        name: "One account for your whole job search",
        level: 1,
      }),
    ).toBeVisible();
    await expect(signInWithBorderlessButton(page)).toBeFocused();
    await expectNoSidewaysScroll(page);
  });

  test("390×844, refused from the command line: the reason and the cli line in one alert", async ({
    page,
  }) => {
    await openPhone(page, "/login?error=AUTH-1046&cli=1");

    const alert = signInError(page, "sign-in-phone");
    await expect(alert).toHaveAttribute("data-code", "AUTH-1046");
    await expect(alert).toContainText(AUTH_1046);
    await expect(alert).toContainText(CLI_RETRY);
    await expect(
      alert.locator('[data-slot="sign-in-cli-hint"] code'),
    ).toHaveText("applika login");
    await expect(cliHint(page, "sign-in-phone")).toHaveCount(1);
    await expect(alert.locator('[tabindex="-1"]')).toBeFocused();
    await expectPhoneTargets(page, 5);
    await expectNoSidewaysScroll(page);
  });

  const A_LEAD =
    "Use your Borderless account. Borderless confirms it's you and sends you back here.";
  const DESKTOP = { width: 1280, height: 800 } as const;

  async function openDesktop(page: Page, path: string) {
    await page.setViewportSize(DESKTOP);
    await page.goto(path);
    await expect(page.locator('[data-slot="sign-in-desktop"]')).toBeVisible();
    await expect(page.locator('[data-slot="sign-in-phone"]')).toBeHidden();
  }

  test("1280, ready: option A's card, the paired tiles, Continue with Borderless focused with its logo, the sign-up link in a new tab (dark)", async ({
    page,
  }) => {
    await openDesktop(page, "/login");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    const desktop = page.locator('[data-slot="sign-in-desktop"]');

    await expect(
      page.getByRole("heading", { name: "Sign in to applika", level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0);
    // No side panel: the card is the tree's one block (Sonner's toaster is a region of its own).
    await expect(desktop.getByRole("region")).toHaveCount(0);

    // The card: 448 wide, centred in the page.
    const card = desktop.locator(".ph-a-card");
    const cardBox = (await card.boundingBox())!;
    expect(cardBox.width).toBeCloseTo(448, 0);
    expect(cardBox.x + cardBox.width / 2).toBeCloseTo(DESKTOP.width / 2, 0);
    expect(cardBox.y + cardBox.height / 2).toBeCloseTo(DESKTOP.height / 2, 0);

    // The paired tiles: Applika, the hidden link mark, Borderless (decoded).
    const tiles = desktop.locator('[data-slot="sign-in-tiles"]');
    await expect(tiles.getByRole("img")).toHaveCount(2);
    await expect(
      tiles.getByRole("img", { name: "Applika", exact: true }),
    ).toBeVisible();
    const borderless = tiles.getByRole("img", {
      name: "Borderless",
      exact: true,
    });
    await expect(borderless).toBeVisible();
    expect(
      await borderless.evaluate(
        (img) => (img as HTMLImageElement).naturalWidth,
      ),
    ).toBeGreaterThan(0);
    for (const tile of await tiles.locator(".ph-a-tile").all()) {
      const box = (await tile.boundingBox())!;
      expect(box.width).toBeCloseTo(72, 0);
      expect(box.height).toBeCloseTo(72, 0);
    }
    await expect(tiles.locator(".ph-a-link")).toHaveAttribute(
      "aria-hidden",
      "true",
    );

    // The CTA: focused on load, A's words and lead, the logo decorative.
    const cta = signInWithBorderlessButton(page);
    await expect(cta).toHaveCount(1);
    await expect(cta).toBeFocused();
    await expect(cta).toHaveAccessibleName("Continue with Borderless");
    await expect(cta).toHaveAccessibleDescription(A_LEAD);
    const ctaBox = (await cta.boundingBox())!;
    expect(ctaBox.height).toBeCloseTo(48, 0);
    expect(ctaBox.width).toBeCloseTo(448 - 2 * 40 - 2, 0);
    const logo = cta.locator('img[data-slot="sign-in-logo"]');
    await expect(logo).toHaveAttribute("alt", "");
    await expect(cta.getByRole("img")).toHaveCount(0);
    expect(
      await logo.evaluate((img) => (img as HTMLImageElement).naturalWidth),
    ).toBeGreaterThan(0);
    expect((await logo.boundingBox())!.width).toBeCloseTo(18, 0);

    // The rule, then the sign-up line: Borderless's sign-up in a new tab.
    await expect(desktop.locator('[data-slot="separator"]')).toBeVisible();
    await expect(desktop.locator(".ph-a-foot")).toHaveText(
      "No account yet? Create a Borderless account",
    );
    const account = page.getByRole("link", {
      name: "Create a Borderless account",
      exact: true,
    });
    await expect(account).toHaveAttribute(
      "href",
      "https://platform.borderlesscoding.com/sign-up",
    );
    await expect(account).toHaveAttribute("target", "_blank");
    await expect(account).toHaveAttribute("rel", "noopener noreferrer");
    await expect(account).toHaveAccessibleDescription("Opens in a new tab.");

    // The theme + language pair at top 20, right 24, theme first.
    const pair = page.locator('[data-slot="sign-in-bar"] .ph-pair');
    const group = page.getByRole("radiogroup", { name: "Toggle language" });
    await expect(group).toHaveCount(1);
    const theme = page.getByRole("button", {
      name: "Toggle theme",
      exact: true,
    });
    const pairBox = (await pair.boundingBox())!;
    expect(pairBox.y).toBeCloseTo(20, 0);
    expect(DESKTOP.width - (pairBox.x + pairBox.width)).toBeCloseTo(24, 0);
    expect((await theme.boundingBox())!.x).toBeLessThan(
      (await group.boundingBox())!.x,
    );
    await expect(
      page.getByRole("link", { name: "Back to home", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator("input")).toHaveCount(0);
    await expectNoSidewaysScroll(page);

    // Tab order: the pair, then the CTA, then the sign-up link.
    await page.keyboard.press("Tab");
    await expect(account).toBeFocused();

    // From md (768) up the card fits with no second breakpoint, clear of the pair.
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(desktop).toBeVisible();
    await expect(cta).toBeInViewport();
    const narrowCard = (await card.boundingBox())!;
    const narrowPair = (await pair.boundingBox())!;
    // The pair (top right) and the centred card never cover each other.
    expect(narrowPair.y + narrowPair.height).toBeLessThanOrEqual(narrowCard.y);
    await expectNoSidewaysScroll(page);

    // A phone in landscape (812×375) is md and up: the card sits below the
    // pair and the page scrolls to the button.
    await page.setViewportSize({ width: 812, height: 375 });
    await expect(desktop).toBeVisible();
    const shortCard = (await card.boundingBox())!;
    const shortPair = (await pair.boundingBox())!;
    expect(shortPair.y + shortPair.height).toBeLessThanOrEqual(shortCard.y);
    await cta.scrollIntoViewIfNeeded();
    await expect(cta).toBeInViewport();
    await expectNoSidewaysScroll(page);

    // A short wide screen (1280×450): the pair is beside the card, so the
    // card stays centred as the board draws it, with nothing to scroll.
    await page.setViewportSize({ width: 1280, height: 450 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(desktop).toBeVisible();
    const wideCard = (await card.boundingBox())!;
    const widePair = (await pair.boundingBox())!;
    expect(wideCard.y + wideCard.height / 2).toBeCloseTo(450 / 2, 0);
    expect(wideCard.x + wideCard.width / 2).toBeCloseTo(1280 / 2, 0);
    expect(widePair.x).toBeGreaterThanOrEqual(wideCard.x + wideCard.width);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollHeight -
          document.documentElement.clientHeight,
      ),
      "vertical scroll in px",
    ).toBe(0);
    await expect(cta).toBeInViewport();
    await expectNoSidewaysScroll(page);
  });

  test("1280 light, in Portuguese: option A's words", async ({ page }) => {
    await openDesktop(page, "/login");
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await page
      .getByRole("radiogroup", { name: "Toggle language" })
      .getByRole("radio", { name: "Português" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");

    await expect(
      page.getByRole("heading", { name: "Entre no Applika", level: 1 }),
    ).toBeVisible();
    const cta = page.getByRole("button", {
      name: "Continuar com a Borderless",
      exact: true,
    });
    await expect(cta).toBeVisible();
    await expect(cta).toHaveAccessibleDescription(
      "Use sua conta Borderless. A Borderless confirma que é você e traz você de volta para cá.",
    );
    await expect(
      page.locator('[data-slot="sign-in-desktop"] .ph-a-foot'),
    ).toHaveText(
      "Não tem uma conta ainda? Criar uma conta na Borderless",
    );
    const account = page.getByRole("link", {
      name: "Criar uma conta na Borderless",
      exact: true,
    });
    await expect(account).toHaveAttribute("target", "_blank");
    await expect(account).toHaveAccessibleDescription("Abre em uma nova aba.");
    await expectNoSidewaysScroll(page);
  });

  test("1280, refused: ?error=AUTH-1047 says why between the lead and the button, focused", async ({
    page,
  }) => {
    await openDesktop(page, "/login?error=AUTH-1047");

    const alert = signInError(page, "sign-in-desktop");
    await expect(alert).toHaveAttribute("data-code", "AUTH-1047");
    await expect(alert).toHaveText(
      "Borderless did not complete the sign-in. Try signing in again",
    );
    await expect(alert.locator('[tabindex="-1"]')).toBeFocused();
    const lead = page.locator('[data-slot="sign-in-desktop"] .ph-a-lead');
    const cta = signInWithBorderlessButton(page);
    const leadBox = (await lead.boundingBox())!;
    const alertBox = (await alert.boundingBox())!;
    const ctaBox = (await cta.boundingBox())!;
    expect(leadBox.y + leadBox.height).toBeLessThanOrEqual(alertBox.y);
    expect(alertBox.y + alertBox.height).toBeLessThanOrEqual(ctaBox.y);
    // The alert spans the card's content width, as the button does.
    expect(alertBox.width).toBeCloseTo(ctaBox.width, 0);
    await expect(cliHint(page, "sign-in-desktop")).toHaveCount(0);
    await expectNoSidewaysScroll(page);
  });

  test("1280, from the command line: ?cli=1 shows the terminal hint above the button; with an error, inside the alert", async ({
    page,
  }) => {
    await openDesktop(page, "/login?cli=1");
    const hint = cliHint(page, "sign-in-desktop");
    await expect(hint).toBeVisible();
    await expect(hint).toHaveText(CLI_RETRY);
    await expect(hint.locator("code")).toHaveText("applika login");
    await expect(signInError(page, "sign-in-desktop")).toBeEmpty();
    await expect(
      page.getByRole("heading", { name: "Sign in to applika", level: 1 }),
    ).toBeVisible();
    await expect(signInWithBorderlessButton(page)).toBeFocused();
    expect((await hint.boundingBox())!.y).toBeLessThan(
      (await signInWithBorderlessButton(page).boundingBox())!.y,
    );

    await openDesktop(page, "/login?error=AUTH-1046&cli=1");
    const alert = signInError(page, "sign-in-desktop");
    await expect(alert).toContainText(AUTH_1046);
    await expect(alert).toContainText(CLI_RETRY);
    await expect(cliHint(page, "sign-in-desktop")).toHaveCount(1);
    await expect(alert.locator('[tabindex="-1"]')).toBeFocused();
    await expectNoSidewaysScroll(page);
  });

  test("pending at 1280 and 390: the spinner takes the logo's place in the same box, a second press starts nothing, the browser leaves; Back brings the page back ready", async ({
    page,
  }) => {
    for (const [viewport, tree] of [
      [DESKTOP, "sign-in-desktop"],
      [PHONE, "sign-in-phone"],
    ] as const) {
      await page.setViewportSize(viewport);
      await page.goto("/login");
      const cta = signInWithBorderlessButton(page);
      await expect(cta).toBeFocused();
      const starts: string[] = [];
      const onRequest = (request: Request) => {
        if (new URL(request.url()).pathname.endsWith("/auth/borderless/login"))
          starts.push(request.url());
      };
      page.on("request", onRequest);

      // Pending lasts only until the browser leaves, so the page records it
      // the moment it renders (the real API answers; nothing is stubbed),
      // and presses the button a second time while it is pending.
      await page.evaluate((slot) => {
        const tree = document.querySelector(`[data-slot="${slot}"]`)!;
        const button = tree.querySelector<HTMLButtonElement>(
          'button[data-action="sign-in-borderless"]',
        )!;
        const box = (node: Element) => {
          const r = node.getBoundingClientRect();
          return [r.x, r.y, r.width, r.height].map(Math.round);
        };
        const container = button.closest(".ph-a-card") ?? button.parentElement!;
        const ready = { button: box(button), container: box(container) };
        new MutationObserver((_, observer) => {
          if (button.getAttribute("aria-busy") !== "true") return;
          observer.disconnect();
          sessionStorage.setItem(
            "e2e:pending",
            JSON.stringify({
              ready,
              pending: { button: box(button), container: box(container) },
              disabled: button.getAttribute("aria-disabled"),
              text: button.textContent,
              spinner: Boolean(button.querySelector("svg.ph-spin")),
              logo: Boolean(button.querySelector('[data-slot="sign-in-logo"]')),
              focused: document.activeElement === button,
              status: document.querySelector(
                '[data-slot="sign-in-pending-status"]',
              )?.textContent,
              wide: document.documentElement.scrollWidth > innerWidth,
            }),
          );
          button.click();
        }).observe(button, { attributes: true });
      }, tree);
      await cta.click();

      await page.waitForURL(borderlessUrl("/**"));
      await expect(
        page.getByRole("heading", { name: "Sign in to Borderless (fake)" }),
      ).toBeVisible();
      page.off("request", onRequest);
      expect(starts, `${tree}: one sign-in started`).toHaveLength(1);

      await page.goBack();
      await page.waitForURL((url) => url.pathname === "/login");
      const seen = JSON.parse(
        (await page.evaluate(() => sessionStorage.getItem("e2e:pending")))!,
      );
      expect(seen, tree).toMatchObject({
        disabled: "true",
        text: "Opening Borderless…",
        spinner: true,
        logo: false,
        focused: true,
        status: "Opening Borderless…",
        wide: false,
      });
      // Nothing moves: the button and its card or column keep their boxes.
      expect(seen.pending, tree).toEqual(seen.ready);

      const ready = signInWithBorderlessButton(page);
      await expect(ready).toBeVisible();
      await expect(ready).not.toHaveAttribute("aria-busy", "true");
      await expect(ready.locator('[data-slot="sign-in-logo"]')).toBeVisible();
      await expect(
        page.locator('[data-slot="sign-in-pending-status"]'),
      ).toBeEmpty();
      await page.evaluate(() => sessionStorage.removeItem("e2e:pending"));
    }
  });
});
