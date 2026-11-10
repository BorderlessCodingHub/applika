import { readFile } from "node:fs/promises";

import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
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
 * v2/CliCode, and `/cli` v3/Cli (PRD 0022: the landing's phone header, the
 * four command blocks with Copy, its own footer, the landing's floating
 * Sign in). The landing header and footer are md-and-up only. The phone
 * header of `/` and `/cli` (home, theme, flags) is walked from 320 to 430
 * in `headers.spec.ts`. `/login`
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
 *   An application's CV copy (v3/ApplicationCV): an application with a job
 *   description that names PostgreSQL but not Python or FastAPI is made
 *   through the API; the picker creates its copy with Tailor by keywords
 *   (one `skills` adjustment, no diff change), the editor is read and the
 *   PDF downloaded (nothing saved from the page), one headline edit is saved
 *   through the API so Show changes draws today's markers, the application
 *   is closed through the API and its copy read again. The application, and its copy with it, is
 *   deleted in `afterAll`.
 * - `e2e-admin` walks the admin console's chips and boards; the one report
 *   webhook it lists is made and deleted through the API (a synthetic
 *   address), the one it adds through the v3 sheet is deleted through the
 *   v3 delete sheet (and through the API in `afterAll`), and its own `jobs`
 *   opt-out (a feature taken away) is deleted again before the test ends
 *   and in `afterAll`. On a feature's page it never presses Your access,
 *   Add or a stage confirm (the stage sheet is cancelled). On the v3 boards
 *   (Users, Companies, Platforms) it never presses the administrator toggle; the
 *   two private companies it needs are made by `e2e-user` through the API in
 *   `beforeAll` (one approved on the phone, one used by an application made
 *   through the API), and the application and both companies are deleted
 *   in `afterAll`.
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
    // The header holds the home link alone: Sign in floats at the bottom.
    await expect(phone.getByRole("banner").getByRole("link")).toHaveCount(1);
    await expect(
      phone
        .getByRole("banner")
        .getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);

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

    // home, theme, English, Português, View on GitHub, Cookie policy, the CTA.
    await expectPhoneTargets(page, 7);
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

  test("/cli is the Cli board: the header with the pair, the four command blocks with Copy, the footer, the floating Sign in", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/cli");

    const phone = page.locator('[data-slot="cli-phone"]');
    await expect(phone).toBeVisible();
    await expect(page.locator('[data-slot="cli-desktop"]')).toBeHidden();
    // The phone tree's own header and footer; the landing's are md and up.
    await expect(page.getByRole("banner")).toHaveCount(1);
    await expect(page.getByRole("contentinfo")).toHaveCount(1);
    await expect(page.locator('[data-slot="phone-public-bar"]')).toHaveCount(0);
    const header = phone.getByRole("banner");
    await expect(
      header.getByRole("link", { name: "Applika.dev home", exact: true }),
    ).toHaveAttribute("href", "/");
    await expectThePair(page);
    await expect(
      header.getByRole("link", { name: "Sign in", exact: true }),
    ).toHaveCount(0);
    // Sign in floats at the bottom, as on the landing.
    const cta = phone
      .locator('[data-slot="landing-phone-cta"]')
      .getByRole("link", { name: "Sign in with Borderless", exact: true });
    await expect(cta).toBeInViewport();
    await expect(cta).toHaveAttribute("href", "/login");

    await expect(
      phone.getByText("Command line", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "applika-cli" }),
    ).toBeVisible();
    await expect(
      phone.getByRole("link", {
        name: "View on PyPI Opens in a new tab.",
        exact: true,
      }),
    ).toHaveCount(2);
    for (const name of [
      "Install",
      "Sign in",
      "Track from your terminal",
      "Teach your AI assistant",
      "Everything else",
    ]) {
      await expect(
        page.getByRole("heading", { level: 2, name, exact: true }),
      ).toBeVisible();
    }
    await expect(phone.locator('[data-slot="cli-phone-modes"] li')).toHaveCount(
      3,
    );
    const terms = phone.locator('[data-slot="cli-phone-term"]');
    await expect(terms).toHaveCount(4);
    await expect(
      terms.first().locator('[data-slot="cli-phone-commands"]'),
    ).toHaveText("$ uv tool install applika-cli\n$ pipx install applika-cli");
    await expect(
      phone.getByRole("button", { name: "Copy command", exact: true }),
    ).toHaveCount(4);

    // The footer: the line back home, then Cookie policy and the ©.
    await expect(
      phone.getByRole("link", { name: "home page", exact: true }),
    ).toHaveAttribute("href", "/");
    const footer = page.getByRole("contentinfo");
    await expect(
      footer.getByRole("link", { name: "Cookie policy", exact: true }),
    ).toHaveAttribute("href", "/cookie-policy");
    await expect(footer).toContainText("© Applika.dev");

    // home, theme, the two radios, two PyPI, four Copy, home page, Cookie
    // policy, the floating Sign in.
    await expectPhoneTargets(page, 13);
    await expectNoSidewaysScroll(page);
    // The long Track command scrolls inside its own block.
    const track = terms.nth(2).locator('[data-slot="cli-phone-commands"]');
    expect(
      await track.evaluate((pre) => pre.scrollWidth > pre.clientWidth),
    ).toBe(true);

    // Copy writes today's commands (no "$ ") and says Copied.
    await terms
      .first()
      .getByRole("button", { name: "Copy command", exact: true })
      .click();
    await expect(
      terms.first().getByRole("button", { name: "Copied", exact: true }),
    ).toBeVisible();
    await expect(
      phone.locator('[data-slot="cli-phone-copy-status"]').first(),
    ).toHaveText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "uv tool install applika-cli\npipx install applika-cli",
    );
    await expect(
      terms.first().getByRole("button", { name: "Copy command", exact: true }),
    ).toBeVisible({ timeout: 5_000 });
  });

  test("/cli with the clipboard refused: no Copied, and the commands stay selectable", async ({
    page,
    context,
  }) => {
    await page.goto("/cli");
    // The browser itself refuses the write (no stub of the page's code).
    const cdp = await context.newCDPSession(page);
    await cdp.send("Browser.setPermission", {
      origin: new URL(page.url()).origin,
      permission: { name: "clipboard-write" },
      setting: "denied",
    });

    const phone = page.locator('[data-slot="cli-phone"]');
    const install = phone.locator(
      '[data-slot="cli-phone-term"][data-block="install"]',
    );
    expect(
      await page.evaluate(() =>
        navigator.clipboard.writeText("probe").then(
          () => "written",
          () => "refused",
        ),
      ),
    ).toBe("refused");

    await install
      .getByRole("button", { name: "Copy command", exact: true })
      .click();
    await page.waitForTimeout(300);
    await expect(
      install.getByRole("button", { name: "Copy command", exact: true }),
    ).toBeVisible();
    await expect(phone.getByRole("button", { name: "Copied" })).toHaveCount(0);
    await expect(
      phone.locator('[data-slot="cli-phone-copy-status"]').first(),
    ).toHaveText("");

    // Selectable by hand: the commands; the "$ " prompts never are.
    const commands = install.locator('[data-slot="cli-phone-commands"]');
    await expect(commands).toHaveCSS("user-select", "auto");
    await expect(commands.locator(".ph-clp-p").first()).toHaveCSS(
      "user-select",
      "none",
    );
    await commands.selectText();
    const selected = await page.evaluate(() =>
      window.getSelection()?.toString(),
    );
    expect(selected).toContain("uv tool install applika-cli");
    expect(selected).toContain("pipx install applika-cli");
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

/**
 * Today's `CvKeywordsInput` chips inside a skill category, desktop sized
 * inside the board's row (P80): the only part of an added CV list item the
 * 44px checks leave out. The item's move and remove buttons are measured.
 */
const KEYWORD_CHIPS = '[data-slot="cv-keywords-input"]';

/**
 * v2/CVEditor's list sections keep today's 32px "Add …" control (an open
 * list section; v3/CVNew and v3/ApplicationCV draw their own 44px one).
 */
const EDITOR_ADD =
  '.ph-ce-panel > div > [data-slot="button"][data-variant="outline"][data-size="sm"]';

/**
 * Every move and remove button of the CV list items under `scope` is a
 * 44×44 box (phone.css `.ph-ce-panel`), and there are at least `atLeast`.
 */
async function expectItemActions44(scope: Locator, atLeast: number) {
  const boxes = await scope
    .locator('[data-slot="cv-item-actions"] > button')
    .evaluateAll((buttons) =>
      buttons.map((button) => {
        const rect = button.getBoundingClientRect();
        return `${button.getAttribute("aria-label")} ${Math.round(rect.width)}x${Math.round(rect.height)}`;
      }),
    );
  expect(boxes.length, "item buttons measured").toBeGreaterThanOrEqual(atLeast);
  for (const box of boxes) expect(box).toMatch(/ 44x44$/);
}

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

/** A CV copy's editable fields: its full-replace PUT sends exactly these. */
const COPY_FIELDS = [
  "name",
  "full_name",
  "headline",
  "location",
  "email",
  "phone",
  "summary",
  "links",
  "skills",
  "experience",
  "projects",
  "education",
  "certifications",
  "languages",
] as const;

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
  /** The application whose CV copy the copy board makes; deleted in `afterAll`. */
  const COPY_COMPANY = `Phone CV Copy Co ${stamp}`;
  let copyAppId = "";

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
    if (copyAppId) {
      // Its CV copy goes with it.
      const app = await request.delete(apiUrl(`/applications/${copyAppId}`), {
        headers: roleHeaders("user"),
      });
      expect([200, 204, 404], await app.text()).toContain(app.status());
    }
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
    // The seeded category's move up, move down and remove: 44px boxes.
    await expectItemActions44(skills, 3);
    await expectPhoneTargets(page, 17, [KEYWORD_CHIPS, EDITOR_ADD]);
    await expectNoSidewaysScroll(page);

    // A link added (never saved): its buttons and fields are measured.
    const links = page.locator('[data-slot="cv-acc"][data-section="links"]');
    await links.getByRole("button", { name: "Links", exact: true }).click();
    await expect(links).toHaveAttribute("data-open", "true");
    await links.getByRole("button", { name: "Add link", exact: true }).click();
    await expect(links.locator('[data-slot="cv-repeatable-item"]')).toHaveCount(
      1,
    );
    await expectItemActions44(links, 3);
    await expectPhoneTargets(page, 18, [EDITOR_ADD]);
    await expectNoSidewaysScroll(page);

    // The PDF the server typesets from the stored CV: a read.
    const started = page.waitForEvent("download");
    await pdf.click();
    const saved = await started;
    expect(saved.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await readFile((await saved.path())!);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("the new master CV: back CVs and Beta, the rows with Identity open, the Live preview card, Cancel to CVs (nothing created)", async ({
    page,
    request,
  }) => {
    const before = await getJson<Array<{ id: string }>>(
      request,
      "user",
      "/base-cvs",
    );
    // Below the cap of three, so the page offers the form.
    expect(before.length).toBeLessThan(3);
    await loginAs(page, "user");
    await page.goto("/cvs/new");

    const board = page.locator('[data-slot="phone-cv-new"]');
    await expect(board).toHaveAttribute("data-state", "form");
    const top = page.locator('[data-slot="phone-top-bar"]');
    await expect(
      top.getByRole("link", { name: "CVs", exact: true }),
    ).toHaveAttribute("href", "/cvs");
    await expect(
      page
        .locator('[data-slot="phone-top-bar-end"]')
        .getByText("Beta", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "New master CV" }),
    ).toBeVisible();

    const rows = board.locator('[data-slot="cv-acc"]');
    await expect(rows).toHaveCount(9);
    await expect(rows.first()).toHaveAttribute("data-section", "identity");
    await expect(rows.first()).toHaveAttribute("data-open", "true");
    await expect(board.locator('[data-slot="cv-acc"][data-open]')).toHaveCount(
      1,
    );
    await expect(
      rows
        .first()
        .getByRole("button", { name: "Identity and contact", exact: true }),
    ).toHaveAccessibleDescription(
      "The header at the top of your CV, plus the label you recognise this CV by.",
    );
    await expect(page.getByLabel("CV label", { exact: true })).toBeVisible();

    const preview = page.getByRole("region", { name: "Live preview" });
    await expect(preview).toBeVisible();
    await expect(preview.locator('[data-slot="cv-page"]')).toHaveCount(1);
    await expect(preview.getByText("1 / 1", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Preview does not show the final PDF layout."),
    ).toHaveCount(1);
    const sheet = await preview
      .locator('[data-slot="cv-page"] > div')
      .first()
      .boundingBox();
    expect(Math.round(sheet!.width)).toBe(210);
    expect(Math.round(sheet!.height)).toBe(297);

    const bar = page.locator('[data-slot="phone-action-bar"]');
    await expect(
      bar.getByRole("button", { name: "Create CV", exact: true }),
    ).toBeVisible();
    // Identity's six fields, the nine row toggles, the frame, the bar.
    await expectPhoneTargets(page, 18);
    await expectNoSidewaysScroll(page);

    // An empty list row: its hint and Add, one row open at a time.
    const links = board.locator('[data-slot="cv-acc"][data-section="links"]');
    await links.getByRole("button", { name: "Links", exact: true }).click();
    await expect(links).toHaveAttribute("data-open", "true");
    await expect(rows.first()).not.toHaveAttribute("data-open", /.*/);
    await expect(
      links.getByRole("button", { name: "Add link", exact: true }),
    ).toBeVisible();
    await expectPhoneTargets(page, 12);

    // A link added: its move and remove buttons are 44px, nothing excluded.
    await links.getByRole("button", { name: "Add link", exact: true }).click();
    await expect(links.locator('[data-slot="cv-repeatable-item"]')).toHaveCount(
      1,
    );
    await expectItemActions44(links, 3);
    await expectPhoneTargets(page, 18);
    await expectNoSidewaysScroll(page);

    await bar.getByRole("link", { name: "Cancel", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/cvs");
    await expect(page.locator('[data-slot="phone-cvs"]')).toBeVisible();
    const after = await getJson<Array<{ id: string }>>(
      request,
      "user",
      "/base-cvs",
    );
    expect(after.map((cv) => cv.id).sort()).toEqual(
      before.map((cv) => cv.id).sort(),
    );
  });

  test("an application's CV copy: the picker with Tailor by keywords, the copy's editor, back to the application, then read-only once closed", async ({
    page,
    request,
  }) => {
    const { platforms } = await getJson<{ platforms: Array<{ id: string }> }>(
      request,
      "user",
      "/supports",
    );
    const created = await request.post(apiUrl("/applications"), {
      headers: roleHeaders("user"),
      data: {
        company: { name: COPY_COMPANY, url: null },
        platform_id: platforms[0].id,
        role: "Phone CV Engineer",
        mode: "active",
        application_date: new Date().toISOString().slice(0, 10),
        // PostgreSQL, but not Python or FastAPI: Tailor moves one keyword.
        job_description:
          "We run PostgreSQL in production and want someone who has tuned PostgreSQL at scale.",
      },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    copyAppId = ((await created.json()) as { id: string }).id;

    await loginAs(page, "user");
    await page.goto(`/applications/cv?id=${copyAppId}`);

    // The picker.
    const board = page.locator('[data-slot="phone-application-cv"]');
    await expect(board).toHaveAttribute("data-state", "picker");
    const top = page.locator('[data-slot="phone-top-bar"]');
    await expect(
      top.getByRole("link", { name: "Application", exact: true }),
    ).toHaveAttribute("href", `/applications?focus=${copyAppId}`);
    await expect(
      page
        .locator('[data-slot="phone-top-bar-end"]')
        .getByText("Beta", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: "Application CV" }),
    ).toBeVisible();
    await expect(
      page.getByText(`Phone CV Engineer · ${COPY_COMPANY}`, { exact: true }),
    ).toBeVisible();
    const group = page.getByRole("group", { name: "Choose a master CV" });
    // The radio is a 1×1 sr-only input: its label row is the target.
    await group.getByText(CV_NAME, { exact: true }).click();
    await expect(
      group.getByRole("radio", { name: CV_NAME, exact: true }),
    ).toBeChecked();
    for (const name of [
      `Download PDF of ${CV_NAME}`,
      `Download Markdown of ${CV_NAME}`,
      `Delete ${CV_NAME}`,
    ]) {
      await expect(
        group.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    await expect(
      group.getByRole("link", { name: `Edit ${CV_NAME}`, exact: true }),
    ).toHaveAttribute("href", `/cvs/editor?id=${cvId}`);
    await expect(
      page.getByRole("link", { name: /^New master CV/ }),
    ).toHaveAttribute("href", "/cvs/new");
    const tailor = page.getByRole("switch", { name: "Tailor by keywords" });
    await expect(tailor).toHaveAttribute("aria-checked", "false");
    const create = page
      .locator('[data-slot="phone-action-bar"]')
      .getByRole("button", { name: "Create the CV copy", exact: true });
    await expect(create).toBeVisible();
    // Back, the choice's four actions, the tile, Tailor and Create.
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);

    await tailor.click();
    await expect(tailor).toHaveAttribute("aria-checked", "true");
    await create.click();

    // The copy's editor.
    await expect(board).toHaveAttribute("data-state", "editor");
    await expect(
      page.getByText(`Copied from ${CV_NAME}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Job description" }),
    ).toContainText("We run PostgreSQL in production");
    // The fit loads after the copy.
    await expect(
      page.locator('[data-slot="cv-fit-panel"][data-state="ready"]'),
    ).toBeVisible();
    await expect(
      page
        .getByRole("region", { name: "CV fit for this job" })
        .getByRole("list", { name: "Matched" }),
    ).toContainText(/postgresql/i);
    const changes = page.getByRole("region", { name: "Changes" });
    const showChanges = changes.getByRole("switch", { name: "Show changes" });
    // A reorder is no diff change.
    await expect(showChanges).toHaveAccessibleDescription(
      `Compared with ${CV_NAME}: no changes`,
    );
    await expect(
      changes.getByText("Downloads reflect the last saved version.", {
        exact: true,
      }),
    ).toBeVisible();
    const rows = board.locator('[data-slot="cv-acc"]');
    await expect(rows).toHaveCount(9);
    await expect(board.locator('[data-slot="cv-acc"][data-open]')).toHaveCount(
      0,
    );
    const skills = board.locator('[data-slot="cv-acc"][data-section="skills"]');
    const skillsToggle = skills.getByRole("button", {
      name: "Skills",
      exact: true,
    });
    await expect(skillsToggle).toHaveAccessibleDescription(/· Reordered$/);
    await expect(
      page.getByRole("button", { name: "Delete copy", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('[data-slot="phone-action-bar"]')
        .getByRole("button", { name: "Save CV copy", exact: true }),
    ).toBeVisible();

    await showChanges.click();
    await expect(showChanges).toHaveAttribute("aria-checked", "true");
    const moves = changes.getByRole("list", { name: "Reordered by job match" });
    await expect(moves.locator('li[data-section="skills"]')).toHaveText(
      "Skills",
    );
    // Said once: the row keeps "Reordered", no second "reordered" status.
    await expect(skillsToggle).toHaveAccessibleDescription(/· Reordered$/);
    // Back, Show changes and its form input, two Download changes, nine
    // rows, Download PDF and Markdown, Delete copy, Save.
    await expectPhoneTargets(page, 17);
    await expectNoSidewaysScroll(page);

    // Identity open: the board's own fields.
    await rows
      .first()
      .getByRole("button", { name: "Identity and contact", exact: true })
      .click();
    await expect(rows.first()).toHaveAttribute("data-open", "true");
    await expectPhoneTargets(page, 20);
    await expectNoSidewaysScroll(page);

    // Skills open: a category's move and remove buttons are 44px boxes;
    // only its keyword chips keep today's size (P80).
    await skillsToggle.click();
    await expect(skills).toHaveAttribute("data-open", "true");
    await expectItemActions44(skills, 3);
    await expectPhoneTargets(page, 23, [KEYWORD_CHIPS]);
    await expectNoSidewaysScroll(page);

    // The copy's PDF, typeset by the server: a read.
    const started = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Download PDF", exact: true })
      .click();
    const saved = await started;
    expect(saved.suggestedFilename()).toMatch(/\.pdf$/);
    const bytes = await readFile((await saved.path())!);
    expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

    // One edit saved through the API: Show changes then draws today's diff
    // markers inside the rows, measured with the named exclude list.
    const copy = await getJson<Record<string, unknown>>(
      request,
      "user",
      `/applications/${copyAppId}/cv`,
    );
    const edited = await request.put(apiUrl(`/applications/${copyAppId}/cv`), {
      headers: roleHeaders("user"),
      data: {
        ...Object.fromEntries(COPY_FIELDS.map((key) => [key, copy[key]])),
        headline: "Staff Backend Engineer",
      },
    });
    expect(edited.ok(), await edited.text()).toBeTruthy();
    await page.reload();
    await expect(board).toHaveAttribute("data-state", "editor");
    await showChanges.click();
    await expect(showChanges).toHaveAccessibleDescription(
      `Compared with ${CV_NAME}: 1 change`,
    );
    const identity = rows.first();
    await expect(
      identity.getByRole("button", {
        name: "Identity and contact",
        exact: true,
      }),
    ).toHaveAccessibleDescription(/1 change$/);
    await identity
      .getByRole("button", { name: "Identity and contact", exact: true })
      .click();
    await expect(
      identity.getByRole("button", { name: "Changed: Headline", exact: true }),
    ).toBeVisible();
    await expectPhoneTargets(page, 20, [
      // Today's CvChangedMarker, desktop sized beside a changed field.
      '[data-slot="cv-diff-changed"]',
    ]);
    await expectNoSidewaysScroll(page);

    // Back "Application": that application's screen.
    await top.getByRole("link", { name: "Application", exact: true }).click();
    await page.waitForURL(
      (url) =>
        url.pathname === "/applications" &&
        url.searchParams.get("focus") === copyAppId,
    );
    await expect(
      page.locator(
        `[data-slot="phone-application"][data-application-id="${copyAppId}"]`,
      ),
    ).toBeVisible();

    // Closed through the API (bodyless): the copy reads only.
    const finalized = await request.post(
      apiUrl(`/applications/${copyAppId}/finalize`),
      { headers: { Cookie: authCookieHeader("user") } },
    );
    expect(finalized.ok(), await finalized.text()).toBeTruthy();
    await page.goto(`/applications/cv?id=${copyAppId}`);
    await expect(board).toHaveAttribute("data-state", "editor");
    const banner = page.locator('[data-slot="cv-copy-read-only"]');
    await expect(banner).toHaveAttribute("role", "status");
    await expect(banner).toContainText("This application is closed.");
    await expect(banner).toContainText("Reopen it to edit this CV.");
    await expect(
      page.getByRole("button", { name: "Save CV copy", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Delete copy", exact: true }),
    ).toHaveCount(0);
    for (const name of [
      "Download PDF",
      "Download Markdown",
      "Download changes as PDF",
      "Download changes as Markdown",
    ]) {
      await expect(
        page.getByRole("button", { name, exact: true }),
      ).toBeVisible();
    }
    // Back, Show changes and its input, two Download changes, nine rows,
    // Download PDF and Markdown.
    await expectPhoneTargets(page, 15);
    await expectNoSidewaysScroll(page);
  });

  test("/cli signed in: the Cli board's floating button offers Go to Dashboard; the header no link but home", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/cli");

    const phone = page.locator('[data-slot="cli-phone"]');
    const dashboard = phone
      .locator('[data-slot="landing-phone-cta"]')
      .getByRole("link", { name: "Go to Dashboard", exact: true });
    await expect(dashboard).toBeInViewport();
    await expect(dashboard).toHaveAttribute("href", "/dashboard");
    const header = phone.getByRole("banner");
    await expect(header.getByRole("link")).toHaveCount(1);
    await expect(
      header.getByRole("link", { name: "Dashboard", exact: true }),
    ).toHaveCount(0);
    await expect(
      phone.getByRole("link", { name: "Sign in with Borderless", exact: true }),
    ).toHaveCount(0);
    await expectThePair(page);
    await expectPhoneTargets(page, 13);
    await expectNoSidewaysScroll(page);
  });

  test("Admin is an administrator's only: the address sends e2e-user back to Today", async ({
    page,
  }) => {
    await loginAs(page, "user");
    for (const path of [
      "/admin",
      "/admin/users",
      "/admin/companies",
      "/admin/platforms",
    ]) {
      await page.goto(path);
      await page.waitForURL("**/dashboard");
      await expect(page.locator('[data-slot="phone-today"]')).toBeVisible();
    }
  });
});

test.describe("the admin console below md", () => {
  test.describe.configure({ mode: "serial" });

  const LABEL = "e2e phone webhook";
  /** Synthetic: the API only checks the shape and never posts on save. */
  const HOOK_TAIL = "e2e-dummy-phone-webhook-not-real";
  const HOOK_URL = `https://discord.com/api/webhooks/123456789012345678/${HOOK_TAIL}`;
  /** Added through the v3 sheet and deleted through its delete sheet. */
  const SHEET_LABEL = "e2e phone sheet webhook";
  const SHEET_TAIL = "e2e-dummy-token-not-real";
  const SHEET_URL = `https://discord.com/api/webhooks/000000000000000000/${SHEET_TAIL}`;

  const stamp = Date.now();
  /** Private, made by e2e-user through the API; approved on the phone. */
  const APPROVE = `e2e-phone-approve-${stamp}`;
  const APPROVE_URL = "https://e2e-phone-approve.example";
  /** Private, made by e2e-user; one application uses it, so it cannot be deleted. */
  const USED = `e2e-phone-used-${stamp}`;
  const USED_URL = "https://e2e-phone-used.example";
  /** The platform that application uses (the first of `/supports`). */
  let usedPlatform = { id: "", name: "" };
  let approveId = "";
  let usedCompanyId = "";

  /** e2e-user's `e2e-phone-*` applications, then every `e2e-phone-*` company. */
  async function deleteOwnCatalogRows(request: APIRequestContext) {
    const apps = await getJson<Array<{ id: string; company_name: string }>>(
      request,
      "user",
      "/applications",
    );
    for (const app of apps) {
      if (!app.company_name.startsWith("e2e-phone-")) continue;
      const deleted = await request.delete(apiUrl(`/applications/${app.id}`), {
        headers: roleHeaders("user"),
      });
      expect(deleted.ok(), await deleted.text()).toBeTruthy();
    }
    const { items } = await getJson<{
      items: Array<{ id: string; name: string }>;
    }>(request, "admin", "/admin/companies?search=e2e-phone-&per_page=100");
    for (const row of items) {
      if (!row.name.startsWith("e2e-phone-")) continue;
      const deleted = await request.delete(
        apiUrl(`/admin/companies/${row.id}`),
        { headers: roleHeaders("admin") },
      );
      expect(deleted.ok(), await deleted.text()).toBeTruthy();
    }
  }

  async function createCompany(
    request: APIRequestContext,
    name: string,
    url: string,
  ): Promise<string> {
    const created = await request.post(apiUrl("/companies"), {
      headers: roleHeaders("user"),
      data: { name, url },
    });
    expect(created.ok(), await created.text()).toBeTruthy();
    return ((await created.json()) as { id: string }).id;
  }

  async function deleteOwnWebhooks(request: APIRequestContext) {
    const rows = await getJson<Array<{ id: string; label: string | null }>>(
      request,
      "admin",
      "/admin/report-webhooks",
    );
    for (const row of rows) {
      if (row.label !== LABEL && row.label !== SHEET_LABEL) continue;
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

    await deleteOwnCatalogRows(request);
    approveId = await createCompany(request, APPROVE, APPROVE_URL);
    usedCompanyId = await createCompany(request, USED, USED_URL);
    const { platforms } = await getJson<{
      platforms: Array<{ id: string; name: string }>;
    }>(request, "user", "/supports");
    usedPlatform = platforms[0];
    const application = await request.post(apiUrl("/applications"), {
      headers: roleHeaders("user"),
      data: {
        company: usedCompanyId,
        platform_id: usedPlatform.id,
        role: "Phone Catalog Engineer",
        mode: "active",
        application_date: new Date(Date.now() - 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10),
      },
    });
    expect(application.ok(), await application.text()).toBeTruthy();
  });

  test.afterAll(async ({ request }) => {
    await deleteOwnWebhooks(request);
    await clearOptOut(request, "jobs");
    await deleteOwnCatalogRows(request);
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

  test("the Admin row opens the console: seven chips, the Dashboard and Jobs boards under Admin Console", async ({
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
  });

  test("Report webhooks: the v3 cards under its own h1; Edit's sheet cancelled, a webhook added and deleted through the sheets", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");
    await tapChip(page, "Report webhooks", "/admin/report-webhooks");

    // The section heads itself (v3/AdminWebhook); no "Admin Console" here.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText([
      "Report webhooks",
    ]);
    await expect(
      page.getByText(
        "Each webhook holds one or more badges. A member's biweekly report is posted to every webhook that holds their BASE or PSP badge.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.getByText("Admin Console", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('[data-slot="phone-top-bar-end"]')).toContainText(
      "System",
    );

    // The API-made webhook: its card, the masked address only.
    const row = page
      .locator('li[data-slot="report-webhook-row"]')
      .filter({ hasText: LABEL });
    await expect(row.locator('[data-slot="report-webhook-url"]')).toHaveText(
      "https://discord.com/api/webhooks/123456789012345678/…real",
    );
    await expect(row.locator('[data-slot="report-webhook-badge"]')).toHaveText([
      "PSP",
    ]);
    await expect(
      row.getByRole("button", { name: `Edit ${LABEL}` }),
    ).toBeVisible();
    await expect(
      row.getByRole("button", { name: `Delete ${LABEL}` }),
    ).toBeVisible();
    expect(await page.content()).not.toContain(HOOK_TAIL);
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    // Edit: the current masked address and a blank field, then Cancel.
    await row.getByRole("button", { name: `Edit ${LABEL}` }).click();
    const edit = page.getByRole("dialog", { name: "Edit webhook" });
    await expect(edit).toBeVisible();
    await expect(edit.getByLabel("Webhook URL")).toHaveValue("");
    await expect(
      edit.locator('[data-slot="report-webhook-url-current"]'),
    ).toHaveText("https://discord.com/api/webhooks/123456789012345678/…real");
    await expect(edit.getByText("Current:", { exact: false })).toBeVisible();
    await expect(edit.getByRole("checkbox", { name: "PSP" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(
      edit.getByRole("button", { name: "Save changes" }),
    ).toBeVisible();
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);
    await edit.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(edit).toHaveCount(0);

    // Add through the sheet: the address, BASE and its own label.
    await page.getByRole("button", { name: "Add webhook" }).click();
    const add = page.getByRole("dialog", { name: "Add webhook" });
    await expect(add).toBeVisible();
    await expect(add.getByLabel("Webhook URL")).toBeFocused();
    await expect(add.getByRole("group", { name: "Badges" })).toBeVisible();
    await expectPhoneTargets(page, 8);
    await expectNoSidewaysScroll(page);
    await add.getByLabel("Webhook URL").fill(SHEET_URL);
    await add.getByRole("checkbox", { name: "BASE" }).click();
    await expect(add.getByRole("checkbox", { name: "BASE" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await add.getByLabel("Label").fill(SHEET_LABEL);
    await add.getByRole("button", { name: "Save webhook" }).click();
    await expect(add).toHaveCount(0);

    const added = page
      .locator('li[data-slot="report-webhook-row"]')
      .filter({ hasText: SHEET_LABEL });
    await expect(
      added.locator('[data-slot="report-webhook-badge"]'),
    ).toHaveText(["BASE"]);
    await expect(added.locator('[data-slot="report-webhook-url"]')).toHaveText(
      "https://discord.com/api/webhooks/000000000000000000/…real",
    );
    expect(await page.content()).not.toContain(SHEET_TAIL);
    await expectNoSidewaysScroll(page);

    // Delete through the board's sheet: Cancel first, then Delete.
    await added.getByRole("button", { name: `Delete ${SHEET_LABEL}` }).click();
    const remove = page.getByRole("alertdialog", { name: "Delete webhook?" });
    await expect(remove).toBeVisible();
    await expect(
      remove.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expect(remove).toContainText(
      `Reports from Borderless BASE members will no longer be posted to ${SHEET_LABEL}. This cannot be undone.`,
    );
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);
    await remove.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(remove).toHaveCount(0);
    await expect(added).toHaveCount(0);
    await expect(row).toHaveCount(1);
    expect(await page.content()).not.toContain(SHEET_TAIL);
    expect(await page.content()).not.toContain(HOOK_TAIL);
  });

  test("Users: the v3 board under its own h1, the sort chips and a user's details sheet", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");
    await tapChip(page, "Users", "/admin/users");

    const title = page.getByRole("heading", {
      level: 1,
      name: "User Management",
    });
    await expect(title).toBeVisible();
    await expect(title).toHaveClass(/ph-h1-26/);
    await expect(
      page.getByText("View, search, and manage all platform users"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await expect(page.locator('[data-slot="admin-phone-content"]')).toHaveCount(
      0,
    );

    const search = page.getByRole("searchbox", { name: "Search users" });
    await expect(search).toHaveAttribute("placeholder", "Search users...");
    const listed = page.waitForResponse(
      (response) =>
        response.url().includes("/admin/users?") &&
        response.url().includes("search=e2e") &&
        response.ok(),
    );
    await search.fill("e2e");
    await listed;
    const rows = page.locator('li[data-slot="admin-user-row"]');
    const userRow = rows.filter({
      has: page.locator(".ph-au-name", { hasText: /^e2e-user$/ }),
    });
    await expect(userRow).toHaveCount(1);
    await expect(rows.filter({ hasText: "e2e-admin" })).toHaveCount(1);
    await expect(page.locator('[data-slot="user-count"]')).toHaveText(
      /^\d+ users?$/,
    );
    await expect(
      userRow.getByText(/^Apps \d+ · Offers \d+ · Denials \d+$/),
    ).toBeVisible();

    // The five chips; the current one presses, again reverses its order.
    const sort = page.getByRole("group", { name: "Sort users by" });
    await expect(sort.getByRole("button")).toHaveText([
      "Joined↓",
      "User",
      "Apps",
      "Offers",
      "Denials",
    ]);
    await sort
      .getByRole("button", { name: "Sort by Apps", exact: true })
      .click();
    const apps = sort.locator('[data-sort="total_applications"]');
    await expect(apps).toHaveAttribute("aria-pressed", "true");
    await expect(apps).toHaveAccessibleName("Sort by Apps, descending");
    await expect(apps.locator(".ph-au-arrow")).toHaveText("↓");
    await expect(sort.locator('[data-sort="joined_at"]')).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await apps.click();
    await expect(apps).toHaveAccessibleName("Sort by Apps, ascending");
    await expect(apps.locator(".ph-au-arrow")).toHaveText("↑");
    await expect(userRow).toHaveCount(1);

    // The administrator toggle is here and named, but never pressed.
    await expect(
      userRow.getByRole("button", { name: "Toggle user admin" }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.waitForLoadState("networkidle");
    await expectPhoneTargets(page, 20);
    await expectNoSidewaysScroll(page);

    const open = userRow.getByRole("button", { name: "View user details" });
    await open.click();
    const sheet = page.getByRole("dialog", { name: "e2e-user", exact: true });
    await expect(sheet).toBeVisible();
    const facts = sheet.locator('[data-slot="user-detail-facts"]');
    await expect(facts.locator("dt").first()).toHaveText("Email");
    await expect(facts.locator("dt").nth(1)).toHaveText("GitHub ID");
    await expect(
      sheet.getByRole("heading", { level: 3, name: "Application Stats" }),
    ).toBeVisible();
    await expect(
      sheet.locator('[data-slot="user-detail-stats"] dt'),
    ).toHaveText(["Total", "Offers", "Denials", "Active"]);
    await expectPhoneTargets(page, 20);
    await expectNoSidewaysScroll(page);
    await sheet.getByRole("button", { name: "Close", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(open).toBeFocused();
  });

  test("Companies and Platforms: the v3 boards, the Private filter, Add cancelled, and Delete unavailable on a used row", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");

    for (const kind of [
      {
        chip: "Companies",
        path: "/admin/companies",
        title: "Company Management",
        lead: "Manage companies available on the platform",
        search: "Search companies",
        add: "Add Company",
        used: USED,
        usedId: usedCompanyId,
      },
      {
        chip: "Platforms",
        path: "/admin/platforms",
        title: "Platforms",
        lead: "Manage the platforms users pick for their applications",
        search: "Search platforms",
        add: "Add Platform",
        used: usedPlatform.name,
        usedId: usedPlatform.id,
      },
    ]) {
      await tapChip(page, kind.chip, kind.path);
      await expect(
        page.getByRole("heading", { level: 1, name: kind.title, exact: true }),
      ).toHaveClass(/ph-h1-26/);
      await expect(page.getByText(kind.lead)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
      const cards = page.locator('li[data-slot="catalog-row"]');
      await expect(cards.first()).toBeVisible();

      // Private: only private rows, the seg pressed.
      const seg = page.getByRole("group", { name: "Visibility" });
      await seg.getByRole("button", { name: "Private", exact: true }).click();
      await expect(
        seg.getByRole("button", { name: "Private", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.locator('li[data-slot="catalog-row"]:not([data-private])'),
      ).toHaveCount(0);
      await seg.getByRole("button", { name: "All", exact: true }).click();
      await expect(
        seg.getByRole("button", { name: "All", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");

      // Add opens its sheet; Cancel closes it with nothing sent.
      await page.getByRole("button", { name: kind.add, exact: true }).click();
      const add = page.getByRole("dialog", { name: kind.add });
      await expect(add).toBeVisible();
      await expect(add.getByRole("textbox", { name: "Name" })).toBeFocused();
      await expectNoSidewaysScroll(page);
      await add.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(add).toHaveCount(0);

      // A row an application uses: Delete announced unavailable, with its reason.
      const listed = page.waitForResponse(
        (response) =>
          response.url().includes(`${kind.path}?`) &&
          response.url().includes("search=") &&
          response.ok(),
      );
      await page.getByRole("searchbox", { name: kind.search }).fill(kind.used);
      await listed;
      const used = page.locator(
        `li[data-slot="catalog-row"][data-catalog-id="${kind.usedId}"]`,
      );
      await expect(used).toHaveAttribute("data-used", "true");
      const del = used.getByRole("button", {
        name: `Delete ${kind.used}`,
        exact: true,
      });
      await expect(del).toHaveAttribute("aria-disabled", "true");
      await expect(del).toHaveAccessibleDescription(
        "Cannot delete: used by applications",
      );
      // Focusable, and pressing it opens nothing (Playwright's click waits
      // for an enabled control, so the press goes through the keyboard).
      await del.focus();
      await expect(del).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("alertdialog")).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await expectPhoneTargets(page, 12);
      await expectNoSidewaysScroll(page);
      await page.getByRole("searchbox", { name: kind.search }).fill("");
    }
  });

  test("an administrator approves a private company on a phone without a sideways scroll", async ({
    page,
    request,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/companies");
    const listed = page.waitForResponse(
      (response) =>
        response.url().includes("/admin/companies?") &&
        response.url().includes(`search=${APPROVE}`) &&
        response.ok(),
    );
    await page
      .getByRole("searchbox", { name: "Search companies" })
      .fill(APPROVE);
    await listed;
    const row = page.locator(
      `li[data-slot="catalog-row"][data-catalog-id="${approveId}"]`,
    );
    await expect(row).toHaveAttribute("data-private", "true");
    await expect(row.locator('[data-slot="catalog-meta"]')).toContainText(
      "Added by e2e-user",
    );

    await row
      .getByRole("button", { name: `Approve ${APPROVE}`, exact: true })
      .click();
    const sheet = page.getByRole("alertdialog", {
      name: `Approve ${APPROVE}?`,
    });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText(
      `${APPROVE} becomes public: every user sees it in their company list and can pick it.`,
    );
    await expect(sheet).toContainText(
      "It keeps e2e-user as the user who added it.",
    );
    await expect(sheet).toContainText("It cannot be made private again.");
    await expect(
      sheet.getByRole("button", { name: "Cancel", exact: true }),
    ).toBeFocused();
    await expectPhoneTargets(page, 4);
    await expectNoSidewaysScroll(page);

    await sheet.getByRole("button", { name: "Approve", exact: true }).click();
    await expect(sheet).toHaveCount(0);
    await expect(row).not.toHaveAttribute("data-private");
    await expect(
      row.getByRole("button", { name: `Approve ${APPROVE}` }),
    ).toHaveCount(0);
    await expectNoSidewaysScroll(page);

    const { items } = await getJson<{
      items: Array<{ name: string; is_public: boolean }>;
    }>(request, "admin", `/admin/companies?search=${APPROVE}`);
    expect(items.find((item) => item.name === APPROVE)?.is_public).toBe(true);
  });

  test("Features: the v3 cards under its own h1, one per feature; the jobs card opens its page", async ({
    page,
    request,
  }) => {
    const seeded = await getJson<Array<{ key: string; name: string }>>(
      request,
      "admin",
      "/admin/features",
    );
    expect(seeded.map((feature) => feature.key)).toContain("jobs");

    await loginAs(page, "admin");
    await page.goto("/admin");
    await tapChip(page, "Features", "/admin/features");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText([
      "Features",
    ]);
    await expect(
      page.getByText(
        "A new feature starts in beta: only users on its beta list and admins have it. Release it to give it to everyone.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(page.locator('[data-slot="admin-phone-content"]')).toHaveCount(
      0,
    );

    // One card per row of the `features` table, as the API lists them.
    const cards = page.locator('li[data-slot="feature-row"]');
    await expect(cards).toHaveCount(seeded.length);
    for (let index = 0; index < seeded.length; index += 1) {
      await expect(cards.nth(index)).toHaveAttribute(
        "data-feature-key",
        seeded[index].key,
      );
    }
    const jobs = cards.filter({
      has: page.locator('[data-slot="feature-key"]', { hasText: /^jobs$/ }),
    });
    await expect(jobs.getByRole("link", { name: "Job board" })).toHaveAttribute(
      "href",
      "/admin/features/view?key=jobs",
    );
    await expect(jobs.locator('[data-slot="feature-you"]')).toContainText(
      "You",
    );
    await expect(jobs.locator('[data-slot="feature-beta-count"]')).toHaveText(
      /^\d[\d,]*$/,
    );
    await expectPhoneTargets(page, 7 + seeded.length);
    await expectNoSidewaysScroll(page);

    await jobs.getByRole("link", { name: "Job board" }).click();
    await page.waitForURL("**/admin/features/view?key=jobs");
    await expect(
      page.getByRole("heading", { level: 1, name: "Job board" }),
    ).toBeVisible();
  });

  test("a feature: back Features and the System pill, no chips; Your access, the beta list, Add user searched then Done, the stage sheet cancelled", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/features/view?key=jobs");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText([
      "Job board",
    ]);
    // The bar: back to Features and the System pill; no chips, no Admin Console.
    const back = page
      .locator('[data-slot="phone-top-bar"]')
      .getByRole("link", { name: "Features", exact: true });
    await expect(back).toHaveAttribute("href", "/admin/features");
    await expect(page.locator('[data-slot="phone-top-bar-end"]')).toContainText(
      "System",
    );
    await expect(chips(page)).toHaveCount(0);
    await expect(page.getByText("Admin Console", { exact: true })).toHaveCount(
      0,
    );
    await expect(page.locator('[data-slot="feature-key"]')).toHaveText("jobs");

    // Your access: the switch is there, never pressed.
    const access = page.getByRole("region", { name: "Your access" });
    await expect(
      access.getByRole("switch", { name: "Use this feature myself" }),
    ).toBeVisible();
    await expect(
      access.locator('[data-slot="feature-own-access-reason"]'),
    ).toHaveText(/^You (have|don't have) this feature/);

    // The beta list holds e2e-user (the seed's).
    const list = page.getByRole("region", { name: "Beta list" });
    await expect(
      list.locator('[data-slot="feature-beta-list-count"]'),
    ).toHaveText(/^\d+ users?$/);
    await list
      .getByRole("searchbox", { name: "Search the beta list" })
      .fill("e2e-user");
    const member = list.locator(
      'li[data-slot="feature-beta-user"][data-username="e2e-user"]',
    );
    await expect(member).toBeVisible();
    await expect(
      member.getByRole("button", { name: "Remove e2e-user" }),
    ).toBeVisible();
    await list
      .getByRole("searchbox", { name: "Search the beta list" })
      .fill("");
    await expect(member).toBeVisible();
    await page.waitForLoadState("networkidle");
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);

    // Add user: search everyone, then Done (nobody is added).
    await list.getByRole("button", { name: "Add user", exact: true }).click();
    const add = page.getByRole("dialog", {
      name: "Add users to the beta list",
    });
    await expect(add).toBeVisible();
    const search = add.getByRole("searchbox", { name: "Search users" });
    await expect(search).toBeFocused();
    await search.fill("e2e");
    await expect(
      add.getByRole("button", { name: "e2e-user is on the list" }),
    ).toBeVisible();
    await expect(
      add
        .locator(
          'li[data-slot="feature-add-user-row"][data-username="e2e-admin"]',
        )
        .getByText("Admin", { exact: true }),
    ).toBeVisible();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);
    await add.getByRole("button", { name: "Done", exact: true }).click();
    await expect(add).toHaveCount(0);

    // The stage sheet: opened, then Cancel (never confirmed).
    const stage = page.locator('[data-slot="feature-stage-action"]');
    const releasing =
      (await stage.getAttribute("data-next-stage")) === "general";
    await stage.click();
    const sheet = page.getByRole("alertdialog", {
      name: releasing
        ? "Release Job board to everyone?"
        : "Move Job board back to beta?",
    });
    await expect(sheet).toBeVisible();
    const cancel = sheet.getByRole("button", { name: "Cancel", exact: true });
    await expect(cancel).toBeFocused();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);
    await cancel.click();
    await expect(sheet).toHaveCount(0);
    await expect(stage).toBeFocused();
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
