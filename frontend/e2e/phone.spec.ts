import { readFile } from "node:fs/promises";

import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import {
  BORDERLESS_ACCOUNTS,
  apiUrl,
  authCookieHeader,
  deleteAccount,
  loginAs,
  signInWithFake,
  type SeededRole,
} from "./support/auth";
import { clearOptOut } from "./support/beta-features";
import { COOKIE_NOTICE_ACKNOWLEDGED } from "./support/cookie-notice";
import {
  PHONE,
  expectNoSidewaysScroll,
  expectPhoneTargets,
} from "./support/phone";

/**
 * The phone layout of PRD 0021 on the real stack, at the boards' 390×844.
 *
 * The public screens switch by CSS (one tree per width, `data-slot` per
 * tree; Playwright leaves `display: none` out of role queries): below md
 * `/` is v2/Landing, `/cookie-policy` v2/CookiePolicy, `/cli/code`
 * v2/CliCode, and `/cli` (no board) keeps today's content under the phone
 * public bar. The landing header and footer are md-and-up only. `/login`
 * (option C) is walked in `borderless-signin.spec.ts`, `/device` in
 * `devices.spec.ts`, the signed-in shell in `shell-responsive.spec.ts`.
 *
 * The public screens are read-only: signed out, nothing is written. The
 * signed-in describes, as the seeded users (`loginAs`, never Logout, never
 * `/__fake/reset`):
 * - `e2e-user` walks Today, the quick add, the Application screen, the
 *   Pipeline, the Agenda, Insights and the Account hub (Jobs and CVs, no
 *   Admin; Light and back to Dark; Português (BR) and back to English); the
 *   applications it creates are deleted in `afterAll` through the API.
 * - `e2e-user` opens every account-area, job and CV board once, read-only:
 *   Profile (Edit, then Cancel), Devices (Sign out opened, then Cancel —
 *   never confirmed), Cycles, Reports and a report day (never submitted),
 *   Jobs, a job and its Start application sheet (Cancel: no draft), the
 *   draft's step 1 (nothing typed: no draft), CVs (Delete opened, then
 *   Cancel) and the CV editor (nothing saved; the PDF is a read). The one
 *   master CV it needs is made through the API in `beforeAll` and deleted
 *   in `afterAll`; an empty job board gets the admin's collection run first,
 *   as `cvs-beta.spec.ts` does (the jobs stay, like `jobs.spec.ts`'s).
 * - `e2e-admin` walks the admin console's chips and boards; the one report
 *   webhook it lists is made and deleted through the API (a synthetic
 *   address), and its own `jobs` opt-out (a feature taken away) is deleted
 *   again before the test ends and in `afterAll`.
 * Logout ends the session it runs in, so it never runs as a seeded user: a
 * disposable fake Borderless account (`e2e-free`, no membership) signs in
 * through the fake in its own context and is deleted (`DELETE /users/me`)
 * in `beforeAll` and `afterAll`, as `borderless-signin.spec.ts` does.
 */

test.use({ viewport: PHONE });

/** The language + theme pair: one visible switcher on every public screen. */
async function expectThePair(page: Page) {
  const group = page.getByRole("radiogroup", { name: "Toggle language" });
  await expect(group).toHaveCount(1);
  await expect(group).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Toggle theme", exact: true }),
  ).toBeVisible();
}

async function expectHomeBackLink(page: Page) {
  const bar = page.locator('[data-slot="phone-public-bar"]');
  await expect(bar).toBeVisible();
  const home = bar.getByRole("link", { name: "Home", exact: true });
  await expect(home).toBeVisible();
  await expect(home).toHaveAttribute("href", "/");
}

test.describe("public screens below md", () => {
  test("/ is the Landing board, with a sign-in action in reach from top to bottom", async ({
    page,
  }) => {
    await page.goto("/");

    const phone = page.locator('[data-slot="landing-phone"]');
    await expect(phone).toBeVisible();
    await expect(page.locator('[data-slot="landing-desktop"]')).toBeHidden();
    // Today's landing header and footer are md and up only.
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(phone.getByRole("banner")).toBeVisible();
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: /^Manage your job search with clarity\.?$/,
      }),
    ).toBeVisible();
    await expect(
      page.getByText("Free & open-source job tracker"),
    ).toBeVisible();
    await expectThePair(page);
    const signIn = phone
      .getByRole("banner")
      .getByRole("link", { name: "Sign in", exact: true });
    await expect(signIn).toBeVisible();
    await expect(signIn).toHaveAttribute("href", "/login");

    // The sticky CTA is on screen at the top, halfway and at the bottom.
    const cta = phone
      .locator('[data-slot="landing-phone-cta"]')
      .getByRole("link", { name: "Sign in with Borderless", exact: true });
    await expect(cta).toBeInViewport();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight / 2),
    );
    await expect(cta).toBeInViewport();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(
      page.getByRole("link", { name: "Cookie policy", exact: true }),
    ).toBeInViewport();
    await expect(cta).toBeInViewport();
    const box = await cta.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(PHONE.height);

    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);

    await cta.click();
    await page.waitForURL("**/login");
  });

  test("/cookie-policy is the CookiePolicy board under Home and the pair", async ({
    page,
  }) => {
    await page.goto("/cookie-policy");

    const phone = page.locator('[data-slot="cookie-policy-phone"]');
    await expect(phone).toBeVisible();
    await expect(
      page.locator('[data-slot="cookie-policy-desktop"]'),
    ).toBeHidden();
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "Cookie Policy" }),
    ).toBeVisible();
    await expect(phone.getByText("Legal", { exact: true })).toBeVisible();
    await expectHomeBackLink(page);
    await expectThePair(page);

    // The same cookies as the desktop table, as the board's cards.
    const rows = phone.locator('li[data-slot="cookie-row"]');
    await expect(rows.first()).toBeVisible();
    await expect(rows).toHaveCount(
      await page
        .locator('[data-slot="cookie-policy-desktop"] tbody tr')
        .count(),
    );
    const locale = phone.locator(
      'li[data-slot="cookie-row"][data-cookie="NEXT_LOCALE"]',
    );
    await expect(locale).toContainText("Remembers the language you chose");
    await expect(locale).toContainText("1 year (readable by the page)");

    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    await phone.getByRole("link", { name: "Home", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/");
  });

  test("/cli keeps today's content under the phone public bar", async ({
    page,
  }) => {
    await page.goto("/cli");

    await expectHomeBackLink(page);
    await expectThePair(page);
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { level: 1, name: "applika-cli" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Install" }),
    ).toBeVisible();
    await expect(page.getByText("uv tool install applika-cli")).toBeVisible();

    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);
  });

  test("/cli/code is the CliCode board: the code, Copy that says Copied, the expiry", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/cli/code?code=e2e-code&state=e2e-state");

    const phone = page.locator('[data-slot="cli-code-phone"]');
    await expect(phone).toBeVisible();
    await expect(phone).toHaveAttribute("data-state", "ready");
    await expect(page.locator('[data-slot="cli-code-desktop"]')).toBeHidden();
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeVisible();
    await expect(phone.locator('[data-slot="cli-code-value"]')).toHaveText(
      "e2e-code#e2e-state",
    );
    await expect(
      phone.getByText("The code works once and expires after a minute."),
    ).toBeVisible();
    await expectThePair(page);
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    await phone.getByRole("button", { name: "Copy", exact: true }).click();
    await expect(
      phone.getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    await expect(phone.locator('[data-slot="cli-code-status"]')).toHaveText(
      "Code copied.",
    );
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "e2e-code#e2e-state",
    );
  });

  test("each public screen switches light and dark, and the language, from its own pair", async ({
    page,
  }) => {
    const html = page.locator("html");
    for (const path of ["/", "/cookie-policy", "/cli", "/cli/code", "/login"]) {
      await page.goto(path);
      await expect(html, path).toHaveClass(/\bdark\b/);
      await page
        .getByRole("button", { name: "Toggle theme", exact: true })
        .click();
      await expect(html, path).not.toHaveClass(/\bdark\b/);
      await page
        .getByRole("button", { name: "Toggle theme", exact: true })
        .click();
      await expect(html, path).toHaveClass(/\bdark\b/);
    }

    // The phone trees follow the switch in place.
    await page.goto("/");
    await page
      .getByRole("radiogroup", { name: "Toggle language" })
      .getByRole("radio", { name: "Português" })
      .click();
    await expect(html).toHaveAttribute("lang", "pt-BR");
    await expect(
      page.getByRole("link", { name: "Entrar com a Borderless", exact: true }),
    ).toBeInViewport();
    await page.goto("/cookie-policy");
    await expect(
      page.getByRole("heading", { level: 1, name: "Política de Cookies" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-slot="phone-public-bar"]')
        .getByRole("link", { name: "Início", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("radiogroup", { name: "Alternar idioma" })
      .getByRole("radio", { name: "English" })
      .click();
    await expect(html).toHaveAttribute("lang", "en");
  });

  test("/cli/code without its code says so, with no Copy", async ({ page }) => {
    await page.goto("/cli/code");

    const phone = page.locator('[data-slot="cli-code-phone"]');
    await expect(phone).toHaveAttribute("data-state", "missing");
    await expect(phone.locator('[data-slot="cli-code-missing"]')).toContainText(
      "This sign-in link is missing its code.",
    );
    await expect(page.getByRole("button", { name: "Copy" })).toHaveCount(0);
  });
});

/** The bottom tab bar: below md the only "Primary" navigation. */
const tabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Primary" });

function apiHeaders() {
  return { Cookie: authCookieHeader("user") };
}

/** Deletes e2e-user's applications at `company` (the quick add's, by its stamped name). */
async function deleteApplicationsAt(
  request: APIRequestContext,
  company: string,
) {
  const response = await request.get(apiUrl("/applications"), {
    headers: apiHeaders(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  for (const app of (await response.json()) as Array<{
    id: string;
    company_name: string;
  }>) {
    if (app.company_name !== company) continue;
    const deleted = await request.delete(apiUrl(`/applications/${app.id}`), {
      headers: apiHeaders(),
    });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
}

test.describe("signed-in core screens below md", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  const COMPANY = `Phone Quick Add ${stamp}`;
  const ROLE = `Phone Engineer ${stamp}`;
  /** The quick add's application screen, `/applications?focus=<id>`. */
  let createdPath = "";
  /** An application quiet for 25 days, made through the API, deleted in `afterAll`. */
  const QUIET = `Phone Quiet Co ${stamp}`;

  test.afterAll(async ({ request }) => {
    await deleteApplicationsAt(request, COMPANY);
    await deleteApplicationsAt(request, QUIET);
  });

  test("Today: the greeting, the tab bar with Today current, the initials to the Account hub", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/dashboard");

    const today = page.locator('[data-slot="phone-today"]');
    await expect(today.getByRole("heading", { level: 1 })).toHaveText(
      /^Good (morning|afternoon|evening), \S/,
    );
    await expect(
      page.getByRole("heading", { name: "Dashboard", level: 1 }),
    ).toHaveCount(0);
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText(
      "Today",
    );
    await expect(page.locator('[data-slot="today-stats"]')).toHaveAttribute(
      "href",
      "/insights",
    );
    await expect(
      page.getByRole("region", { name: "Needs your attention" }),
    ).toBeVisible();
    await expect(page.getByRole("region", { name: "Coming up" })).toBeVisible();
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);

    await page.locator('[data-slot="phone-avatar"]').click();
    await page.waitForURL("**/account");
    await expect(page.getByRole("region", { name: "Workspace" })).toBeVisible();
  });

  test("Today: Log update on a quiet application takes it off Needs your attention", async ({
    page,
    request,
  }) => {
    const supports = await request.get(apiUrl("/supports"), {
      headers: apiHeaders(),
    });
    expect(supports.ok(), await supports.text()).toBeTruthy();
    const { platforms } = (await supports.json()) as {
      platforms: Array<{ id: string }>;
    };
    const quietDay = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const created = await request.post(apiUrl("/applications"), {
      headers: { ...apiHeaders(), "Content-Type": "application/json" },
      data: {
        company: { name: QUIET, url: null },
        platform_id: platforms[0].id,
        role: "Quiet Engineer",
        mode: "active",
        application_date: quietDay,
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    const { id } = (await created.json()) as { id: string };

    await loginAs(page, "user");
    await page.goto("/dashboard");
    const card = page.locator(
      `[data-slot="today-attention-item"][data-application-id="${id}"]`,
    );
    await expect(card).toBeVisible();
    await expect(card).toContainText(/No update for 2[456] days/);

    await card.getByRole("button", { name: "Log update" }).click();
    const dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Add event" }).click();

    // The event dates it today: no longer quiet, it leaves the list.
    await expect(dialog).toHaveCount(0);
    await expect(card).toHaveCount(0);
  });

  test("Add on Today: the quick add creates it, opens it, and the Pipeline lists it under Applied", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/dashboard");
    await expect(tabBar(page)).toBeVisible();

    await page.getByRole("button", { name: "Add", exact: true }).click();
    const sheet = page.getByRole("dialog", { name: "Add application" });
    await expect(sheet).toBeVisible();

    await sheet.getByRole("combobox", { name: "Company", exact: true }).click();
    await page.getByPlaceholder(/search or add a company/i).fill(COMPANY);
    await page.getByText(`Create "${COMPANY}"`).click();
    await page.getByRole("button", { name: "Add company" }).click();
    await sheet.getByLabel("Role", { exact: true }).fill(ROLE);
    const where = sheet.getByRole("radiogroup", {
      name: "Where did you apply?",
    });
    // The first platform chip is picked; Today is the date.
    await expect(where.getByRole("radio").first()).toBeChecked();
    await expect(
      sheet.getByRole("radio", { name: "Today", exact: true }),
    ).toBeChecked();
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);

    await sheet.getByRole("button", { name: "Add to pipeline" }).click();

    // The new application opens: the Application board, without the tab bar.
    await page.waitForURL(/\/applications\?focus=/);
    await expect(
      page.getByRole("heading", { level: 1, name: COMPANY }),
    ).toBeVisible();
    await expect(page.getByText(ROLE, { exact: true })).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Log update" }),
    ).toBeVisible();
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);
    createdPath = new URL(page.url()).pathname + new URL(page.url()).search;

    // More, and the Delete confirm (cancelled): a long company name in the
    // sheet's title never squeezes its Close under 44px.
    await page.getByRole("button", { name: "More actions" }).click();
    const more = page.getByRole("dialog", { name: COMPANY });
    await expect(more).toBeVisible();
    await expectPhoneTargets(page, 3);
    await more.getByRole("button", { name: "Delete", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expectPhoneTargets(page, 2);
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(confirm).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "More actions" }),
    ).toBeFocused();

    // Back to the Pipeline: the tab bar again, the row under Applied.
    await page.getByRole("link", { name: "Pipeline", exact: true }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Pipeline" }),
    ).toBeVisible();
    await expect(tabBar(page)).toBeVisible();
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText(
      "Pipeline",
    );
    await page.getByRole("tab", { name: /^Applied/ }).click();
    const row = page
      .getByRole("region", { name: /^Applied/ })
      .getByRole("link", { name: COMPANY, exact: true });
    await expect(row).toBeVisible();
    await expect(row).toHaveAttribute("data-stage", "applied");
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);
  });

  test("Agenda: the week strip moves by week", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/agenda");

    await expect(
      page.getByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeVisible();
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText(
      "Agenda",
    );
    const week = page.getByRole("tablist", { name: /^Week of / });
    await expect(week.getByRole("tab")).toHaveCount(7);
    await expect(week.locator('[data-today="true"]')).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const thisWeek = await week.getAttribute("aria-label");

    await page.getByRole("button", { name: "Next week" }).click();
    await expect(week).not.toHaveAttribute("aria-label", thisWeek ?? "");
    await expect(week.locator('[data-today="true"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Previous week" }).click();
    await expect(week).toHaveAttribute("aria-label", thisWeek ?? "");
    await expect(page.getByRole("region", { name: "Later" })).toBeVisible();
    await expectPhoneTargets(page, 12);
    await expectNoSidewaysScroll(page);
  });

  test("Insights: the cycle pill opens the cycle sheet", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/insights");

    await expect(
      page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Success rate" }),
    ).toBeVisible();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);

    await page.locator('[data-action="choose-cycle"]').click();
    const sheet = page.getByRole("dialog", { name: "Choose a cycle" });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("radio", { name: "Current Cycle" }),
    ).toBeChecked();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
  });

  test("the initials open the Account hub: Jobs and CVs, no Admin; Light and back; Português (BR) and back", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/insights");
    await expect(
      page.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeVisible();
    await page.locator('[data-slot="phone-avatar"]').click();
    await page.waitForURL("**/account");

    // e2e-user is on the jobs and cvs beta lists (the seed); not an admin.
    const workspace = page.getByRole("region", { name: "Workspace" });
    await expect(
      workspace.getByRole("link", { name: "Jobs", exact: true }),
    ).toHaveAttribute("href", "/jobs");
    await expect(
      workspace.getByRole("link", { name: "CVs", exact: true }),
    ).toHaveAttribute("href", "/cvs");
    await expect(
      page
        .getByRole("region", { name: "Account", exact: true })
        .getByRole("link", { name: "Admin" }),
    ).toHaveCount(0);
    await expectPhoneTargets(page, 15);
    await expectNoSidewaysScroll(page);

    // The theme: Light holds on the next phone screen, then Dark again.
    const html = page.locator("html");
    await expect(html).toHaveClass(/\bdark\b/);
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    await theme.getByRole("radio", { name: "Light", exact: true }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.goto("/cycles");
    await expect(
      page.getByRole("heading", { level: 1, name: "Cycles" }),
    ).toBeVisible();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await page.goto("/account");
    await theme.getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(html).toHaveClass(/\bdark\b/);

    // The language: the hub, the tab bar and a K4 board follow it in place.
    await page
      .getByRole("radiogroup", { name: "Language" })
      .getByRole("radio", { name: "Português (BR)" })
      .click();
    await expect(html).toHaveAttribute("lang", "pt-BR");
    await expect(
      page.getByRole("region", { name: "Espaço de trabalho" }),
    ).toBeVisible();
    await page
      .getByRole("banner")
      .getByRole("link", { name: "Voltar", exact: true })
      .click();
    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("navigation", { name: "Principal" }).getByRole("link"),
    ).toHaveText(["Hoje", "Funil", "Agenda", "Insights"]);
    await page.goto("/cycles");
    await expect(
      page.getByRole("heading", { level: 1, name: "Ciclos" }),
    ).toBeVisible();
    await page.goto("/account");
    await page
      .getByRole("radiogroup", { name: "Idioma" })
      .getByRole("radio", { name: "English" })
      .click();
    await expect(html).toHaveAttribute("lang", "en");
    await expect(page.getByRole("region", { name: "Workspace" })).toBeVisible();
    await expect(html).toHaveClass(/\bdark\b/);
  });

  for (const width of [360, 320]) {
    test(`${width}px: the six screens keep 44px targets and never scroll sideways`, async ({
      page,
    }) => {
      test.skip(!createdPath, "the quick add above did not run");
      await page.setViewportSize({ width, height: 740 });
      await loginAs(page, "user");

      for (const path of [
        "/dashboard",
        "/applications",
        "/agenda",
        "/insights",
      ]) {
        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(tabBar(page)).toBeVisible();
        await expectPhoneTargets(page, 6);
        await expectNoSidewaysScroll(page);
      }

      await page.goto(createdPath);
      await expect(
        page.getByRole("heading", { level: 1, name: COMPANY }),
      ).toBeVisible();
      await expectPhoneTargets(page, 4);
      await expectNoSidewaysScroll(page);

      await page.goto("/dashboard");
      await page.getByRole("button", { name: "Add", exact: true }).click();
      await expect(
        page.getByRole("dialog", { name: "Add application" }),
      ).toBeVisible();
      await expectPhoneTargets(page, 8);
      await expectNoSidewaysScroll(page);
    });
  }
});

function roleHeaders(role: SeededRole) {
  return {
    Cookie: authCookieHeader(role),
    "Content-Type": "application/json",
  };
}

async function getJson<T>(
  request: APIRequestContext,
  role: SeededRole,
  path: string,
): Promise<T> {
  const response = await request.get(apiUrl(path), {
    headers: roleHeaders(role),
  });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

/** How long the admin's collection run may take to fill an empty board. */
const RUN_TIMEOUT = 120_000;

/** The jobs on the board: a collection run first if there are none yet (the `cvs-beta.spec.ts` shape). */
async function ensureJobs(request: APIRequestContext) {
  const board = await getJson<{ total: number }>(request, "user", "/jobs");
  if (board.total > 0) return;
  const run = await request.post(apiUrl("/admin/jobs/runs"), {
    headers: roleHeaders("admin"),
  });
  // 409: a run is already going, which fills the board just the same.
  expect([202, 409], await run.text()).toContain(run.status());
  await expect(async () => {
    const after = await getJson<{ total: number }>(request, "user", "/jobs");
    expect(after.total).toBeGreaterThan(0);
  }).toPass({ timeout: RUN_TIMEOUT, intervals: [2_000] });
}

async function draftCount(request: APIRequestContext): Promise<number> {
  return (
    await getJson<Array<{ id: string }>>(
      request,
      "user",
      "/applications/drafts",
    )
  ).length;
}

test.describe("the account area, jobs and CVs below md", () => {
  test.describe.configure({ mode: "serial" });

  const stamp = Date.now();
  /** The master CV the CV, job and draft boards read; made and deleted here. */
  const CV_NAME = `Phone E2E master CV ${stamp}`;
  let cvId = "";

  test.beforeAll(async ({ request }) => {
    test.setTimeout(RUN_TIMEOUT + 30_000);
    const response = await request.post(apiUrl("/base-cvs"), {
      headers: roleHeaders("user"),
      data: {
        name: CV_NAME,
        full_name: "E2E Candidate",
        headline: "Backend Engineer",
        location: "Remote",
        email: "e2e-user@e2e.applika.dev",
        phone: null,
        summary: "Seeded by the phone E2E suite.",
        links: [],
        skills: [
          {
            id: "s-phone",
            category: "Backend",
            keywords: ["Python", "FastAPI", "PostgreSQL"],
          },
        ],
        experience: [
          {
            id: "e-phone",
            company: "E2E Previous Co",
            role: "Engineer",
            start: "2020-01",
            end: null,
            bullets: ["Built Python services with FastAPI on PostgreSQL"],
          },
        ],
        projects: [],
        education: [],
        certifications: [],
        languages: [],
      },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
    cvId = ((await response.json()) as { id: string }).id;
    await ensureJobs(request);
  });

  test.afterAll(async ({ request }) => {
    if (!cvId) return;
    const deleted = await request.delete(apiUrl(`/base-cvs/${cvId}`), {
      headers: roleHeaders("user"),
    });
    expect([204, 404], await deleted.text()).toContain(deleted.status());
  });

  test("Profile: the board, its sections nav, and Edit swaps in today's form until Cancel", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/profile");

    const profile = page.locator('[data-slot="phone-profile"]');
    await expect(profile).toBeVisible();
    await expect(profile).not.toHaveAttribute("data-editing", "");
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    const sections = page.getByRole("navigation", {
      name: "Profile sections",
    });
    await expect(sections.getByRole("link")).toHaveText(["Profile", "Devices"]);
    await expect(
      sections.getByRole("link", { name: "Profile", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator('[data-slot="profile-badges"]')).toBeVisible();
    await expect(page.locator('[data-slot="delete-account"]')).toBeVisible();
    // The account's first-run GitHub restore is answered for e2e-user (the seed).
    await expect(page.locator('[data-slot="github-restore-card"]')).toHaveCount(
      0,
    );
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);

    // Edit (the top bar) swaps in today's form; Cancel brings the board back.
    const topBarEnd = page.locator('[data-slot="phone-top-bar-end"]');
    await topBarEnd.locator('[data-action="edit-profile"]').click();
    await expect(profile).toHaveAttribute("data-editing", "");
    await expectNoSidewaysScroll(page);
    await profile.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(profile).not.toHaveAttribute("data-editing", "");
    await expect(
      topBarEnd.locator('[data-action="edit-profile"]'),
    ).toBeVisible();
  });

  test("Devices: This device with its IP, last use and expiry; Sign out opens its sheet, Cancel closes it", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/profile");
    await page
      .getByRole("navigation", { name: "Profile sections" })
      .getByRole("link", { name: "Devices", exact: true })
      .click();
    await expect(page).toHaveURL(/\/profile\?tab=devices$/);

    await expect(page.locator('[data-slot="phone-devices"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Active" }),
    ).toBeVisible();
    const here = page.locator(
      'li[data-slot="device-row"][data-current][data-status="active"]',
    );
    await expect(here).toHaveCount(1);
    await expect(here).toContainText("This device");
    await expect(here.locator('[data-slot="device-last-ip"]')).not.toBeEmpty();
    await expect(here.getByText("Last used", { exact: true })).toBeVisible();
    await expect(here.getByText("Expires", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Ended" }),
    ).toBeVisible();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);

    // e2e-user's own web session: the sheet opens and is cancelled, never confirmed.
    await here.locator('[data-slot="device-action"]').click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expect(
      confirm.locator('[data-action="confirm-sign-out"]'),
    ).toBeVisible();
    await expectPhoneTargets(page, 2);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(here).toBeVisible();
  });

  test("Cycles: the current cycle and the archived ones", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/cycles");

    await expect(page.locator('[data-slot="phone-cycles"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Cycles" }),
    ).toBeVisible();
    const current = page.locator('[data-slot="cycles-current"]');
    await expect(current).toContainText("Current Cycle");
    await expect(current).toContainText(/\d+ applications? · \d+ offers?/);
    await expect(
      page.getByRole("heading", { level: 2, name: "Archived" }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-slot="cycles-empty"]')
        .or(page.locator('li[data-slot="cycle-row"]').first()),
    ).toBeVisible();
    await expectPhoneTargets(page, 3);
    await expectNoSidewaysScroll(page);
  });

  test("Reports: a PSP member's board, and a report day's form with its date picker (never submitted)", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/reports");

    await expect(page.locator('[data-slot="phone-reports"]')).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /^My Reports/,
    );
    await expect(
      page.getByRole("progressbar", { name: "Challenge progress" }),
    ).toBeVisible();
    await expect(page.getByText(/Reports are due every/)).toBeVisible();
    await expect(page.locator('[data-slot="reports-closed"]')).toHaveCount(0);
    await expectPhoneTargets(page, 2);
    await expectNoSidewaysScroll(page);

    // The current report's day, else day 1 (a statically exported route).
    const current = page.locator('[data-slot="reports-current"] [data-day]');
    const day = (await current.count())
      ? ((await current.getAttribute("data-day")) ?? "1")
      : "1";
    await page.goto(`/reports/${day}`);
    const reportDay = page.locator(
      `[data-slot="phone-report-day"][data-day="${day}"]`,
    );
    await expect(reportDay).toHaveAttribute("data-mode", /^(edit|read)$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Reports" }),
    ).toBeVisible();
    const mode = await reportDay.getAttribute("data-mode");
    console.log(`[phone] /reports/${day} renders in ${mode} mode`);
    // Edit: the fields and the bar; read: the back link at least.
    await expectPhoneTargets(page, mode === "edit" ? 8 : 1);
    await expectNoSidewaysScroll(page);

    if (mode === "edit") {
      await expect(
        reportDay.locator('[data-action="submit-report"]'),
      ).toBeVisible();
      if (day === "1") {
        await reportDay.getByLabel("Challenge Start Date").click();
        const calendar = page.locator('[data-slot="popover-content"]');
        await expect(calendar).toBeVisible();
        await expectNoSidewaysScroll(page);
        await page.keyboard.press("Escape");
        await expect(calendar).toHaveCount(0);
      }
    }
  });

  test("Jobs: the search, the sort chips and each job as an article named by its title", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/jobs");

    await expect(page.locator('[data-slot="phone-jobs"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search jobs" }),
    ).toBeVisible();
    const toolbar = page.getByRole("toolbar", { name: "Sort and filters" });
    await expect(toolbar.locator('[data-action="sort-fit"]')).toBeVisible();
    await expect(toolbar.locator('[data-action="sort-newest"]')).toBeVisible();
    await expect(
      toolbar.locator('[data-action="choose-source"]'),
    ).toBeVisible();
    await expect(toolbar.locator('[data-action="more-filters"]')).toBeVisible();

    const cards = page.locator('article[data-slot="job-list-item"]');
    await expect(cards.first()).toBeVisible();
    // A card is an article named by its title, and its link carries the same name.
    const first = cards.first();
    const title = (
      await first.getByRole("heading", { level: 2 }).textContent()
    )?.trim();
    expect(title, "the first card has no title").toBeTruthy();
    await expect(first).toHaveAccessibleName(title!);
    // Each card carries Dismiss or its Draft / Applied mark.
    await expect(
      first.locator(
        '[data-action="dismiss-job"], [data-action="restore-job"], [data-slot="job-status-badge"]',
      ),
    ).not.toHaveCount(0);
    await expect(
      first.getByRole("link", { name: title, exact: true }),
    ).toHaveAttribute(
      "href",
      `/jobs/view?id=${await first.getAttribute("data-job-id")}`,
    );
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);
  });

  test("a job: Your fit per master CV, and Start application's sheet (Cancel: no draft)", async ({
    page,
    request,
  }) => {
    const { items } = await getJson<{
      items: Array<{ id: string; title: string }>;
    }>(request, "user", "/jobs");
    const job = items[0];
    const draftsBefore = await draftCount(request);

    await loginAs(page, "user");
    await page.goto(`/jobs/view?id=${job.id}`);

    await expect(
      page.locator(`[data-slot="phone-job-detail"][data-job-id="${job.id}"]`),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: job.title, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Jobs", exact: true }),
    ).toHaveAttribute("href", "/jobs");
    const fit = page.locator('section[data-slot="job-fit-list"]');
    await expect(
      fit.getByRole("heading", { level: 2, name: "Your fit" }),
    ).toBeVisible();
    await expect(
      fit.getByRole("tablist", { name: "Master CV" }).getByRole("tab", {
        name: new RegExp(`^${CV_NAME} · `),
      }),
    ).toHaveAttribute("aria-selected", "true");
    await expect(
      fit.getByRole("tabpanel").getByRole("heading", {
        level: 3,
        name: CV_NAME,
        exact: true,
      }),
    ).toBeAttached();
    await expect(
      page.getByRole("heading", { level: 2, name: "Description" }),
    ).toBeVisible();
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    await page.locator('[data-action="start-application"]').click();
    const sheet = page.getByRole("dialog", { name: "Start an application" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("radio", { name: CV_NAME })).toBeChecked();
    await expect(
      sheet.getByRole("radio", { name: /without a cv/i }),
    ).toBeVisible();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);
    await sheet.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    expect(await draftCount(request)).toBe(draftsBefore);
  });

  test("the new application with CV: step 1, More details holds the application date (nothing typed: no draft)", async ({
    page,
    request,
  }) => {
    const draftsBefore = await draftCount(request);
    await loginAs(page, "user");
    await page.goto("/applications/new-with-cv");

    await expect(page.locator('[data-slot="phone-draft"]')).toBeVisible();
    await expect(
      page.locator('[data-slot="draft-application-step"]'),
    ).toBeVisible();
    await expect(
      page.getByRole("banner").getByRole("link", { name: "Applications" }),
    ).toHaveAttribute("href", "/applications");
    await expect(page.getByPlaceholder(/senior engineer/i)).toBeVisible();
    await expect(page.locator('[data-action="continue-to-cv"]')).toBeVisible();
    await expect(page.getByLabel(/application date/i)).toBeHidden();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);

    const more = page.locator('[data-action="more-details"]');
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByLabel(/application date/i)).toBeVisible();
    await expectPhoneTargets(page, 10);
    await expectNoSidewaysScroll(page);
    expect(await draftCount(request)).toBe(draftsBefore);
  });

  test("CVs: the card with Edit and Delete (Cancel), and the new-CV tile with the slots left", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/cvs");

    await expect(page.locator('[data-slot="phone-cvs"]')).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "CVs" }),
    ).toBeVisible();
    const card = page.locator(`[data-slot="cv-card"][data-cv-id="${cvId}"]`);
    await expect(card.getByRole("heading", { name: CV_NAME })).toBeVisible();
    await expect(card).toContainText("Backend Engineer");
    await expect(card).toContainText("FastAPI");
    await expect(
      card.getByRole("link", { name: `Edit ${CV_NAME}`, exact: true }),
    ).toHaveAttribute("href", `/cvs/editor?id=${cvId}`);
    await expect(page.locator('[data-slot="cv-new-tile"]')).toContainText(
      /left/,
    );
    await expectPhoneTargets(page, 3);
    await expectNoSidewaysScroll(page);

    await card
      .getByRole("button", { name: `Delete ${CV_NAME}`, exact: true })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toBeVisible();
    await expectPhoneTargets(page, 2);
    await confirm.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(card).toBeVisible();
  });

  test("the CV editor: expandable sections, one open at a time, the PDF, no live preview", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto(`/cvs/editor?id=${cvId}`);

    await expect(page.locator('[data-slot="phone-cv-editor"]')).toBeVisible();
    const rows = page.locator('[data-slot="cv-acc"]');
    await expect(rows.first()).toHaveAttribute("data-open", "true");
    expect(await rows.count()).toBeGreaterThanOrEqual(5);
    await expect(page.locator('[data-slot="cv-acc"][data-open]')).toHaveCount(
      1,
    );
    await expect(page.locator('[data-slot="cv-document"]')).toHaveCount(0);
    await expect(
      page.getByText("Preview does not show the final PDF layout."),
    ).toHaveCount(0);
    const pdf = page
      .locator('[data-slot="phone-top-bar-end"]')
      .getByRole("button", { name: "Download PDF", exact: true });
    await expect(pdf).toHaveText("PDF");
    await expect(page.locator('[data-action="save-cv"]')).toBeVisible();
    // Identity and contact is open: its fields are measured too.
    await expectPhoneTargets(page, 12);
    await expectNoSidewaysScroll(page);

    const skills = page.locator('[data-slot="cv-acc"][data-section="skills"]');
    await skills.getByRole("button", { name: "Skills" }).click();
    await expect(skills).toHaveAttribute("data-open", "true");
    await expect(page.locator('[data-slot="cv-acc"][data-open]')).toHaveCount(
      1,
    );

    // The PDF the server typesets from the stored CV: a read.
    const started = page.waitForEvent("download");
    await pdf.click();
    const saved = await started;
    expect(saved.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await readFile((await saved.path())!);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("Admin is an administrator's only: the address sends e2e-user back to Today", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/admin");
    await page.waitForURL("**/dashboard");
    await expect(page.locator('[data-slot="phone-today"]')).toBeVisible();
  });
});

test.describe("the admin console below md", () => {
  test.describe.configure({ mode: "serial" });

  const LABEL = "e2e phone webhook";
  /** Synthetic: the API only checks the shape and never posts on save. */
  const HOOK_TAIL = "e2e-dummy-phone-webhook-not-real";
  const HOOK_URL = `https://discord.com/api/webhooks/123456789012345678/${HOOK_TAIL}`;

  async function deleteOwnWebhooks(request: APIRequestContext) {
    const rows = await getJson<Array<{ id: string; label: string | null }>>(
      request,
      "admin",
      "/admin/report-webhooks",
    );
    for (const row of rows) {
      if (row.label !== LABEL) continue;
      const deleted = await request.delete(
        apiUrl(`/admin/report-webhooks/${row.id}`),
        { headers: roleHeaders("admin") },
      );
      expect(deleted.ok(), await deleted.text()).toBeTruthy();
    }
  }

  test.beforeAll(async ({ request }) => {
    await deleteOwnWebhooks(request);
    const created = await request.post(apiUrl("/admin/report-webhooks"), {
      headers: roleHeaders("admin"),
      data: { webhook_url: HOOK_URL, badges: ["borderless_psp"], label: LABEL },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    await deleteOwnWebhooks(request);
    await clearOptOut(request, "jobs");
  });

  const chips = (page: Page) =>
    page.getByRole("navigation", { name: "Admin sections" });

  async function tapChip(page: Page, name: string, path: string) {
    await chips(page).getByRole("link", { name, exact: true }).click();
    await page.waitForURL(`**${path}`);
    await expect(
      chips(page).getByRole("link", { name, exact: true }),
    ).toHaveAttribute("aria-current", "page");
  }

  test("the Admin row opens the console: seven chips, the Dashboard, Jobs and Report webhooks boards", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/account");
    await page
      .getByRole("region", { name: "Account", exact: true })
      .getByRole("link", { name: "Admin" })
      .click();
    await page.waitForURL("**/admin");

    await expect(chips(page).getByRole("link")).toHaveText([
      "Dashboard",
      "Users",
      "Companies",
      "Platforms",
      "Jobs",
      "Features",
      "Report webhooks",
    ]);
    await expect(chips(page).locator('[aria-current="page"]')).toHaveText(
      "Dashboard",
    );
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin Console" }),
    ).toBeVisible();
    await expect(page.locator('[data-slot="phone-top-bar-end"]')).toContainText(
      "System",
    );
    await expect(page.locator('[data-slot="admin-stats"]')).toBeVisible();
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);

    // Jobs: one card per source, with today's row hooks and its switch.
    await tapChip(page, "Jobs", "/admin/jobs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin Console" }),
    ).toBeVisible();
    const sources = page.locator('li[data-slot="job-source-row"]');
    await expect(sources.first()).toBeVisible();
    const count = await sources.count();
    for (let index = 0; index < count; index += 1) {
      await expect(sources.nth(index)).toHaveAttribute(
        "data-source-code",
        /\S/,
      );
      await expect(sources.nth(index)).toHaveAttribute(
        "data-enabled",
        /^(true|false)$/,
      );
    }
    await expect(
      page.getByRole("switch", { name: /^Collect from / }),
    ).toHaveCount(count);
    await expect(page.locator('[data-slot="job-run-now"]')).toBeVisible();
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    // Report webhooks: the masked address only, never the stored one.
    await tapChip(page, "Report webhooks", "/admin/report-webhooks");
    await expect(
      page.getByRole("heading", { level: 1, name: "Admin Console" }),
    ).toBeVisible();
    const row = page
      .locator('li[data-slot="report-webhook-row"]')
      .filter({ hasText: LABEL });
    await expect(row.locator('[data-slot="report-webhook-url"]')).toHaveText(
      "https://discord.com/api/webhooks/123456789012345678/…real",
    );
    await expect(row.locator('[data-slot="report-webhook-badge"]')).toHaveText([
      "PSP",
    ]);
    expect(await page.content()).not.toContain(HOOK_TAIL);
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    // Today's add/edit dialog at both widths: it fits the phone too.
    await row.getByRole("button", { name: `Edit ${LABEL}` }).click();
    const edit = page.getByRole("dialog", { name: "Edit webhook" });
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel("Webhook URL")).toHaveValue("");
    await expectNoSidewaysScroll(page);
    await page.keyboard.press("Escape");
    await expect(edit).toHaveCount(0);
    await page.locator('[data-action="add-webhook"]').click();
    const add = page.getByRole("dialog", { name: "Add webhook" });
    await expect(add).toBeVisible();
    await expectNoSidewaysScroll(page);
    await page.keyboard.press("Escape");
    await expect(add).toHaveCount(0);
    expect(await page.content()).not.toContain(HOOK_TAIL);
  });

  test("Users, Companies, Platforms and Features keep today's content under the same header", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");
    for (const [name, path] of [
      ["Users", "/admin/users"],
      ["Companies", "/admin/companies"],
      ["Platforms", "/admin/platforms"],
      ["Features", "/admin/features"],
    ] as const) {
      await tapChip(page, name, path);
      // "Admin Console" is a `p` here: today's page keeps the one h1.
      await expect(page.locator('p[data-slot="admin-phone-title"]')).toHaveText(
        "Admin Console",
      );
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      await expect(
        page.locator('[data-slot="admin-phone-content"]'),
      ).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expectNoSidewaysScroll(page);
    }

    await page.goto("/admin/features/view?key=jobs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Job board" }),
    ).toBeVisible();
    await expect(
      chips(page).getByRole("link", { name: "Features", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.waitForLoadState("networkidle");
    await expectNoSidewaysScroll(page);
  });

  test("a feature taken away: its Account row goes on the next load and its address is not found", async ({
    page,
    request,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/account");
    const jobsRow = page
      .getByRole("region", { name: "Workspace" })
      .getByRole("link", { name: "Jobs", exact: true });
    await expect(jobsRow).toBeVisible();

    const optOut = await request.put(apiUrl("/admin/features/jobs/opt-out"), {
      headers: roleHeaders("admin"),
    });
    expect(optOut.ok(), await optOut.text()).toBeTruthy();
    try {
      await page.reload();
      await expect(
        page.getByRole("region", { name: "Workspace" }),
      ).toBeVisible();
      await expect(jobsRow).toHaveCount(0);
      await page.goto("/jobs");
      await expect(page.getByText("Oops! Page not found")).toBeVisible();
      await expect(page.locator('[data-slot="phone-jobs"]')).toHaveCount(0);
    } finally {
      await clearOptOut(request, "jobs");
    }
    await page.goto("/account");
    await expect(jobsRow).toBeVisible();
  });
});

test.describe("Logout below md, in a disposable account", () => {
  test.describe.configure({ mode: "serial" });

  /** No membership: no grant or badge state to put back afterwards. */
  const ACCOUNT = BORDERLESS_ACCOUNTS.free;

  test.beforeAll(async ({ browser }) => {
    await deleteAccount(browser, ACCOUNT);
  });

  test.afterAll(async ({ browser }) => {
    await deleteAccount(browser, ACCOUNT);
  });

  test("a new account: Start fresh, Today, no Jobs, CVs or Reports, the closed Reports, then Logout signs it out", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: PHONE,
      storageState: COOKIE_NOTICE_ACKNOWLEDGED,
    });
    try {
      const page = await context.newPage();
      await signInWithFake(page, ACCOUNT.email);
      await page.waitForURL("**/welcome");
      await page
        .getByRole("radiogroup", { name: "How to start" })
        .getByRole("radio", { name: "Start with an empty account" })
        .click();
      await page
        .getByRole("button", { name: "Start fresh", exact: true })
        .click();
      await page.waitForURL("**/dashboard");
      await expect(page.locator('[data-slot="phone-today"]')).toBeVisible();

      await page.locator('[data-slot="phone-avatar"]').click();
      await page.waitForURL("**/account");
      // No jobs or cvs beta, no membership: Cycles is the one Workspace row
      // (a row's name is its label; its meta is its description).
      const rows = page
        .getByRole("region", { name: "Workspace" })
        .getByRole("link");
      await expect(rows).toHaveCount(1);
      await expect(rows).toHaveAccessibleName("Cycles");
      await expect(
        page
          .getByRole("region", { name: "Account", exact: true })
          .getByRole("link", { name: "Admin" }),
      ).toHaveCount(0);

      // The address still opens: the closed layout, and no report request.
      const reportRequests: string[] = [];
      page.on("request", (sent) => {
        if (new URL(sent.url()).pathname.startsWith("/api/reports")) {
          reportRequests.push(sent.url());
        }
      });
      await page.goto("/reports");
      const closed = page.locator(
        '[data-slot="reports-closed"][data-reason="none"]',
      );
      await expect(closed).toBeVisible();
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Reports are for Borderless BASE and PSP members",
        }),
      ).toBeVisible();
      await expect(
        closed.getByRole("link", { name: /^Visit Borderless/ }),
      ).toBeVisible();
      await expect(
        closed.getByRole("button", { name: "Sign in again", exact: true }),
      ).toBeVisible();
      await expectPhoneTargets(page, 2);
      await expectNoSidewaysScroll(page);
      expect(reportRequests).toEqual([]);

      // Logout ends this session only, and lands on the landing.
      await page.goto("/account");
      await page.locator('[data-slot="account-logout"]').click();
      await page.waitForURL((url) => url.pathname === "/");
      await expect(page.locator('[data-slot="landing-phone"]')).toBeVisible();
      const me = await page.request.get(apiUrl("/users/me"));
      expect(me.status()).toBe(401);
    } finally {
      await context.close();
    }
  });
});
