import { createHash, randomBytes } from "node:crypto";

import {
  expect,
  request as playwrightRequest,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { BORDERLESS_ACCOUNTS, apiUrl, loginAs } from "./support/auth";

/**
 * Borderless sign-in on the real stack (ADR-0024): the built web and API, a
 * real Postgres and Redis, and the `borderless-stub` service in place of
 * Borderless. Nobody calls the real Borderless; the GitHub restore is walked
 * up to GitHub's consent URL and that navigation is aborted, so github.com is
 * never reached either.
 *
 * Serial, and careful with shared state:
 * - `e2e-free` and `e2e-short` become applika accounts on their first sign-in
 *   here and are deleted again (`DELETE /users/me`) in `afterAll`.
 * - `e2e-short`'s first Borderless access lasts 3 s and every later one a
 *   week, so its form sign-in happens exactly once, in the last test, and
 *   nothing signs it in before that.
 * - Seeded `e2e-user` is never signed in through the web form: that would add
 *   a web session `devices.spec.ts` would list. Its CLI hand-off opens no
 *   session (the code is never redeemed).
 */

test.describe.configure({ mode: "serial" });

type StubAccount = { email: string; password: string };

/** Sign `account` in through the API, outside any browser. */
async function apiSession(
  account: StubAccount,
): Promise<{ context: APIRequestContext; status: number }> {
  const context = await playwrightRequest.newContext();
  const response = await context.post(apiUrl("/auth/borderless/signin"), {
    data: { email: account.email, password: account.password },
  });
  return { context, status: response.status() };
}

/** Delete the applika account `account` signs in to, if there is one. */
async function deleteAccount(account: StubAccount) {
  const { context, status } = await apiSession(account);
  try {
    if (status === 200) {
      const response = await context.delete(apiUrl("/users/me"));
      expect(response.status(), `delete ${account.email}`).toBeLessThan(300);
    }
  } finally {
    await context.dispose();
  }
}

async function signInThroughForm(page: Page, account: StubAccount) {
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
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

test.beforeAll(async () => {
  // A local rerun against a kept stack may find the account from last time.
  await deleteAccount(BORDERLESS_ACCOUNTS.free);
});

test.afterAll(async () => {
  await deleteAccount(BORDERLESS_ACCOUNTS.free);
  await deleteAccount(BORDERLESS_ACCOUNTS.short);
});

test.describe("Borderless sign-in", () => {
  test("a wrong password or an unknown email answers Invalid email or password (AC1, AC2)", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(
      page.getByRole("heading", { name: "Sign in to applika", level: 1 }),
    ).toBeVisible();
    // AC1: no GitHub sign-in anywhere on the page.
    await expect(page.getByText(/GitHub/)).toHaveCount(0);

    await signInThroughForm(page, {
      email: BORDERLESS_ACCOUNTS.free.email,
      password: "not-the-password",
    });
    await expect(signInError(page)).toHaveText("Invalid email or password");
    // The password is cleared for the next try.
    await expect(page.getByLabel("Password")).toHaveValue("");

    await signInThroughForm(page, {
      email: "nobody-at-all@e2e.applika.dev",
      password: "whatever",
    });
    await expect(signInError(page)).toHaveText("Invalid email or password");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("an email Borderless has not verified is asked to verify it there (AC3)", async ({
    page,
  }) => {
    await page.goto("/login");
    await signInThroughForm(page, BORDERLESS_ACCOUNTS.unverified);

    await expect(signInError(page)).toHaveText(
      "Verify your email on Borderless first",
    );
    await expect(page).toHaveURL(/\/login$/);
  });

  test("a FREE account is new: /welcome once, Start fresh, then no badge and no Reports (AC9, AC15)", async ({
    page,
  }) => {
    await page.goto("/login");
    await signInThroughForm(page, BORDERLESS_ACCOUNTS.free);

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

    // AC9: remembered; the screen never shows again.
    const me = await page.request.get(apiUrl("/users/me"));
    expect(me.status()).toBe(200);
    const user = await me.json();
    expect(user.github_restore).toEqual({ available: true, prompt: false });
    expect(user.badges).toEqual([]);
    await page.goto("/welcome");
    await page.waitForURL("**/dashboard");

    // AC15: no badge, no Reports entry, the API refuses with RPT-1001.
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

    // Visiting Reports anyway explains why it is closed.
    await page.goto("/reports");
    await expect(
      page.getByRole("heading", {
        name: "Reports are for Borderless BASE and PSP members",
        level: 1,
      }),
    ).toBeVisible();
  });

  test("the profile offers the GitHub restore; it leaves for github.com asking only read:user (AC10)", async ({
    page,
  }) => {
    await page.goto("/login");
    await signInThroughForm(page, BORDERLESS_ACCOUNTS.free);
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

  test("a restore outcome shows its words once and clears the URL (AC14)", async ({
    page,
  }) => {
    await page.goto("/login");
    await signInThroughForm(page, BORDERLESS_ACCOUNTS.free);
    await page.waitForURL("**/dashboard");

    await page.goto("/profile?account=github&status=not_found");
    const notice = page.locator('[data-slot="github-restore-notice"]');
    await expect(notice).toHaveAttribute("data-status", "not_found");
    await expect(notice.getByRole("alert")).toHaveText(
      "No old applika account was found for this GitHub account. Nothing was changed.",
    );
    await expect(page).toHaveURL(/\/profile$/);
  });

  test("seeded e2e-user sees its own PSP chip in the menu and on the profile, and no restore (AC7, AC10)", async ({
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

    // AC10: e2e-user has its GitHub identity on record.
    await expect(
      page.getByRole("button", { name: "Restore data from GitHub" }),
    ).toHaveCount(0);
  });

  test("applika login completes on the Borderless sign-in page and lands on the loopback URL (AC6)", async ({
    page,
  }) => {
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const callback = "http://127.0.0.1:53682/callback";
    const state = `e2e-${randomBytes(8).toString("hex")}`;

    let landedOn: string | null = null;
    await page.route("http://127.0.0.1:53682/**", async (route) => {
      landedOn = route.request().url();
      await route.fulfill({ status: 200, body: "applika-cli got the code" });
    });

    const authorize = new URL(apiUrl("/auth/cli/authorize"));
    authorize.searchParams.set("redirect_uri", callback);
    authorize.searchParams.set("code_challenge", challenge);
    authorize.searchParams.set("code_challenge_method", "S256");
    authorize.searchParams.set("state", state);
    await page.goto(authorize.toString());

    await page.waitForURL("**/login?cli=1");
    await expect(
      page.getByRole("heading", { name: "Sign in to applika-cli", level: 1 }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="sign-in-cli-note"]')).toContainText(
      "applika login",
    );

    await signInThroughForm(page, BORDERLESS_ACCOUNTS.user);

    await expect
      .poll(() => landedOn, { message: "expected the loopback redirect" })
      .not.toBeNull();
    const url = new URL(landedOn as unknown as string);
    expect(`${url.origin}${url.pathname}`).toBe(callback);
    expect(url.searchParams.get("code")).toBeTruthy();
    expect(url.searchParams.get("state")).toBe(state);

    // The CLI branch sets no browser session.
    const cookies = await page.context().cookies();
    expect(cookies.map((cookie) => cookie.name)).not.toContain("__access");
  });

  test("an expired Borderless access pauses the badge until the password confirms it (AC8, AC16, AC17)", async ({
    page,
  }) => {
    const short = BORDERLESS_ACCOUNTS.short;
    await page.goto("/login");
    await signInThroughForm(page, short);
    await page.waitForURL("**/welcome");
    await page.getByRole("button", { name: "Start fresh" }).click();
    await page.waitForURL("**/dashboard");

    // The stub's first access for this account lasts 3 s.
    await page.waitForTimeout(4_000);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toBeVisible();

    const me = await (await page.request.get(apiUrl("/users/me"))).json();
    expect(me.borderless.status).toBe("expired");
    expect(me.badges.map((row: { badge: string }) => row.badge)).toEqual([
      "borderless_psp",
    ]);

    // AC16: the Reports entry stays; no chip while the badge does not count.
    await expect(
      primaryNav(page).getByRole("link", { name: "Reports" }),
    ).toBeVisible();
    await expect(anyMembershipChip(page)).toHaveCount(0);

    // AC8: the menu asks to confirm, and so does the profile.
    const menu = await openAccountMenu(page);
    await expect(
      menu.getByRole("menuitem", {
        name: "Sign in again to confirm your membership",
      }),
    ).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto("/profile");
    await expect(
      page.locator('[data-slot="confirm-membership-notice"]'),
    ).toContainText("Sign in again to confirm your membership");

    // AC16: the API refuses with a reason distinct from "no badge".
    const refused = await page.request.get(apiUrl("/reports"));
    expect(refused.status()).toBe(403);
    expect((await refused.json()).code).toBe("RPT-1002");

    const sessionsBefore = await (
      await page.request.get(apiUrl("/users/me/sessions"))
    ).json();

    await page.goto("/reports");
    const gate = page.locator('[data-slot="badge-gate"]');
    await expect(gate).toHaveAttribute("data-state", "unconfirmed");
    await expect(
      page.getByRole("heading", {
        name: "Sign in again to confirm your membership",
        level: 1,
      }),
    ).toBeVisible();
    await expect(page.getByLabel("Email")).toHaveValue(short.email);

    // AC17: the password renews the access; the reports open.
    await page.getByLabel("Password").fill(short.password);
    await page.getByRole("button", { name: "Confirm membership" }).click();

    await expect(gate).toHaveAttribute("data-state", "held");
    await expect(
      page.getByRole("heading", { name: /My Reports/, level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Borderless PSP member" }),
    ).toHaveCount(1);
    const reports = await page.request.get(apiUrl("/reports"));
    expect(reports.status()).toBe(200);

    // The applika session is kept: the same sessions, still active.
    const sessionsAfter = await (
      await page.request.get(apiUrl("/users/me/sessions"))
    ).json();
    const shape = (rows: { id: string; status: string }[]) =>
      rows.map((row) => `${row.id}:${row.status}`).sort();
    expect(shape(sessionsAfter)).toEqual(shape(sessionsBefore));
  });
});
