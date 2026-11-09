import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";
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
 * signed-in describe walks Today, the quick add, the Application screen,
 * the Pipeline, the Agenda and Insights as the seeded `e2e-user` (`loginAs`,
 * never Logout, never `/__fake/reset`); the one application its quick add
 * creates is deleted in `afterAll` through the API.
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
