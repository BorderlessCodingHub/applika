import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAs, type SeededRole } from "./support/auth";
import { showCookieNotice } from "./support/cookie-notice";
import { expectNoSidewaysScroll } from "./support/phone";

/**
 * App shell — responsive behaviour and keyboard traversal (PRD 0006 R-017,
 * R-018, R-020; ADR-0027 below md).
 *
 * Below md (ADR-0027, PRD 0021) a signed-in page renders in the phone shell:
 * no rail, no navigation menu, a bottom tab bar on Today, Pipeline, Agenda
 * and Insights, back bars elsewhere, and the Account hub behind the initials.
 * It is EXERCISED at a phone viewport. `playwright.config.ts` ships a single
 * Desktop Chrome project, so the viewport is overridden per describe block
 * instead of adding a project. At md and up the shell is unchanged.
 *
 * Everything here runs against the REAL stack `frontend/scripts/e2e.sh` stands up, and
 * asserts on roles, accessible names and GEOMETRY — never on class names — so
 * it survives a later repaint.
 *
 * Serial-safe: every case is read-only against the shared real database. The
 * only writes are to `localStorage` in the test's own fresh browser context.
 */

/** iPhone-class portrait viewport: below the shell's only breakpoint, `md`. */
const MOBILE = { width: 390, height: 844 };
/** Comfortably above `md` (48rem / 768px). */
const DESKTOP = { width: 1280, height: 800 };

const COOKIE_NOTICE = '[role="dialog"][aria-label="Cookie notice"]';
const CLI_BANNER = '[role="region"][aria-label="applika-cli announcement"]';

/**
 * The primary entries a non-admin sees, in display order. "Jobs" and "CVs"
 * are there because the seeded `e2e-user` is on both the `jobs` and the `cvs`
 * beta lists (the e2e seed); a user with one of them sees seven, with neither
 * six.
 *
 * Kept BY HAND rather than derived from `PRIMARY_NAV`: this suite asserts tab
 * order and hit-testing against the list, so a derived copy would follow an
 * accidental nav change instead of catching it. The price is that the constant
 * can rot — KODI-002 inserting `/cvs` went unnoticed here — so the rail test
 * below pins it to the rendered nav, exactly and in order, and fails with the
 * whole list in the diff the moment the two disagree.
 */
const PRIMARY_LABELS = [
  "Dashboard",
  "Applications",
  "Jobs",
  "CVs",
  "Agenda",
  "Reports",
  "Cycles",
  "Profile",
];

async function openDashboard(page: Page, role: SeededRole = "user") {
  await loginAs(page, role);
  // The gated Jobs entry joins the nav only once `/users/me/features`
  // answers (KODI-053), AFTER the h1: wait for it, or a Tab walk or an entry
  // count can run against the nav without Jobs (KODI-054 QA, a load flake).
  const features = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/users/me/features") &&
      response.request().method() === "GET",
  );
  await page.goto("/dashboard");
  const body = (await (await features).json()) as {
    features: Array<{ key: string }>;
  };
  // At md and up today's dashboard; below md the Today board (PRD 0021),
  // whose h1 is the greeting.
  const phone = (page.viewportSize()?.width ?? 1280) < 768;
  await expect(
    phone
      ? page.locator('[data-slot="phone-today"]').getByRole("heading", {
          level: 1,
        })
      : page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
  // At md+ the rail proves the render too; below md there is no rail, and
  // the received answer is what the Account hub lists.
  const rail = page.locator("aside");
  if (
    body.features.some((feature) => feature.key === "jobs") &&
    (await rail.isVisible())
  ) {
    await expect(
      rail.getByRole("link", { name: "Jobs", exact: true }),
    ).toBeVisible();
  }
}

const menuTrigger = (page: Page) =>
  page.getByRole("button", { name: "Open navigation menu" });

/**
 * Wait until a locator's rectangle stops moving.
 *
 * The panel slides in and the cookie notice fades up; measuring mid-animation
 * would compare rectangles that are not where they end up.
 */
async function waitForStableBox(locator: Locator, label: string) {
  let previous: string | null = null;
  await expect
    .poll(
      async () => {
        const current = JSON.stringify(await locator.boundingBox());
        const settled = current !== "null" && current === previous;
        previous = current;
        return settled;
      },
      {
        message: `${label} never settled into a stable rectangle`,
        timeout: 10_000,
      },
    )
    .toBe(true);
}

const TAB_LABELS = ["Today", "Pipeline", "Agenda", "Insights"];
const TAB_HREFS = ["/dashboard", "/applications", "/agenda", "/insights"];

/** The bottom tab bar: below md it is the only "Primary" navigation. */
const tabBar = (page: Page) =>
  page.getByRole("navigation", { name: "Primary" });

/** The phone avatar: the user's initials, named "Account". */
const avatar = (page: Page) => page.locator('[data-slot="phone-avatar"]');

/** Open a signed-in page and wait for the phone shell to own it. */
async function openPhone(page: Page, path: string, role: SeededRole = "user") {
  await loginAs(page, role);
  // The Account rows follow the gated entries, which join only once
  // `/users/me/features` answers: wait for that answer.
  const features = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/users/me/features") &&
      response.request().method() === "GET",
  );
  await page.goto(path);
  await features;
  await expect(page.locator('[data-slot="phone-shell"]')).toBeVisible();
}

/** The Account hub's sections, regions named by their headings. */
const workspaceRows = (page: Page) =>
  page.getByRole("region", { name: "Workspace" }).getByRole("link");
const accountSection = (page: Page) =>
  page.getByRole("region", { name: "Account", exact: true });

test.describe("below md the phone shell carries a bottom tab bar", () => {
  test.use({ viewport: MOBILE });

  test("no rail, no navigation menu: the tab bar takes their place", async ({
    page,
  }) => {
    await openDashboard(page);

    // The phone shell renders no rail at all, and no header to hold the menu.
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(menuTrigger(page)).toHaveCount(0);

    const tabs = tabBar(page).getByRole("link");
    await expect(tabs).toHaveText(TAB_LABELS);
    for (const [index, href] of TAB_HREFS.entries()) {
      await expect(tabs.nth(index)).toHaveAttribute("href", href);
    }
    await expect(tabBar(page)).toBeInViewport();
  });

  test("each tab root marks its own tab, and only it", async ({ page }) => {
    await openDashboard(page);

    for (const [index, label] of TAB_LABELS.entries()) {
      if (index > 0) {
        await tabBar(page).getByRole("link", { name: label }).click();
        await page.waitForURL(`**${TAB_HREFS[index]}`);
      }
      const current = tabBar(page).locator('[aria-current="page"]');
      await expect(current).toHaveCount(1);
      await expect(current).toHaveText(label);
    }
    await expect(
      page.getByRole("heading", { name: "Insights", level: 1 }),
    ).toBeVisible();
  });

  test("the tab bar is reachable by keyboard and Enter follows a tab", async ({
    page,
  }) => {
    await openPhone(page, "/insights");
    await expect(
      page.getByRole("heading", { name: "Insights", level: 1 }),
    ).toBeVisible();

    const today = tabBar(page).getByRole("link", { name: "Today" });
    let reached = false;
    for (let presses = 0; presses < 20 && !reached; presses++) {
      await page.keyboard.press("Tab");
      reached = await today.evaluate((el) => el === document.activeElement);
    }
    expect(reached, "Tab never reached the tab bar").toBe(true);

    for (const label of TAB_LABELS.slice(1)) {
      await page.keyboard.press("Tab");
      await expect(
        tabBar(page).getByRole("link", { name: label }),
      ).toBeFocused();
    }
    await page.keyboard.press("Shift+Tab");
    await expect(
      tabBar(page).getByRole("link", { name: "Agenda" }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await page.waitForURL("**/agenda");
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText(
      "Agenda",
    );
  });

  test("the cookie notice covers the tab bar until Got it", async ({
    page,
  }) => {
    // The owner's choice: the notice floats over the page on purpose, and
    // over the tab bar too, until it is acknowledged.
    await showCookieNotice(page);
    await openDashboard(page);

    const notice = page.locator(COOKIE_NOTICE);
    await expect(notice).toBeVisible();
    await waitForStableBox(notice, "the cookie notice");
    await waitForStableBox(tabBar(page), "the tab bar");

    const topmostPerTab = () =>
      page.evaluate(
        ({ noticeSelector }) => {
          const bar = document.querySelector('[data-slot="phone-tab-bar"]');
          if (!bar) throw new Error("the tab bar is not in the DOM");
          const notice = document.querySelector(noticeSelector);
          return Array.from(bar.querySelectorAll("a")).map((tab) => {
            const rect = tab.getBoundingClientRect();
            const topmost = document.elementFromPoint(
              Math.round(rect.left + rect.width / 2),
              Math.round(rect.top + rect.height / 2),
            );
            if (topmost && tab.contains(topmost)) return "tab";
            if (topmost && notice?.contains(topmost)) return "notice";
            return topmost ? `<${topmost.tagName.toLowerCase()}>` : "nothing";
          });
        },
        { noticeSelector: COOKIE_NOTICE },
      );

    // Guard against a vacuous pass: the notice really sits over the bar.
    expect(await topmostPerTab()).toContain("notice");
    expect(await topmostPerTab()).not.toContain("nothing");

    // Its controls are phone controls too: a 44px box both ways.
    for (const control of [
      notice.getByRole("button", { name: "Dismiss cookie notice" }),
      notice.getByRole("button", { name: "Got it" }),
    ]) {
      const box = await control.boundingBox();
      expect(box, "the control has no box").not.toBeNull();
      expect(box!.width + 0.5).toBeGreaterThanOrEqual(44);
      expect(box!.height + 0.5).toBeGreaterThanOrEqual(44);
    }

    await notice.getByRole("button", { name: "Got it" }).click();
    await expect(notice).toBeHidden();

    await expect.poll(topmostPerTab).toEqual(["tab", "tab", "tab", "tab"]);
  });

  test("the initials open the Account hub, which goes Back to Today", async ({
    page,
  }) => {
    await openDashboard(page);

    await expect(avatar(page)).toHaveAccessibleName("Account");
    await expect(avatar(page)).toHaveText(/^[A-Z0-9]{1,2}$/);
    await avatar(page).click();
    await page.waitForURL("**/account");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    const back = page.getByRole("banner").getByRole("link");
    await expect(back).toHaveAccessibleName("Back");
    await back.click();
    await page.waitForURL("**/dashboard");
    await expect(tabBar(page).locator('[aria-current="page"]')).toHaveText(
      "Today",
    );
  });

  test("every tab root shows the initials", async ({ page }) => {
    await openPhone(page, "/dashboard");
    for (const href of TAB_HREFS) {
      await page.goto(href);
      await expect(avatar(page)).toBeVisible();
      await expect(avatar(page)).toHaveAttribute("href", "/account");
    }
  });

  test("the Account hub lists Jobs and CVs and no Admin for a user", async ({
    page,
  }) => {
    await openPhone(page, "/account");

    // e2e-user is on the jobs and cvs beta lists and holds PSP (the seed).
    await expect(workspaceRows(page)).toHaveCount(4);
    for (const [index, name] of [
      "Jobs",
      "CVs",
      "Reports",
      "Cycles",
    ].entries()) {
      await expect(workspaceRows(page).nth(index)).toHaveAccessibleName(name);
    }
    await expect(
      page.getByRole("link", { name: "Jobs", exact: true }),
    ).toHaveAccessibleDescription("Beta");

    const account = accountSection(page);
    await expect(
      account.getByRole("link", { name: "Profile", exact: true }),
    ).toBeVisible();
    await expect(
      account.getByRole("link", { name: "Devices & CLI" }),
    ).toBeVisible();
    await expect(
      account.getByRole("link", { name: "Sign in a device" }),
    ).toBeVisible();
    await expect(account.getByRole("link", { name: "Admin" })).toHaveCount(0);
    await expect(
      page.getByRole("radiogroup", { name: "Language" }),
    ).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Send feedback" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Logout" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Cookie policy" }),
    ).toHaveAttribute("href", "/cookie-policy");
  });

  test("the Account hub shows exactly one Admin to an admin", async ({
    page,
  }) => {
    await openPhone(page, "/account", "admin");

    const admin = accountSection(page).getByRole("link", { name: "Admin" });
    await expect(admin).toHaveCount(1);
    await expect(admin).toHaveAttribute("href", "/admin");
    await expect(admin).toHaveAccessibleDescription("System");
  });

  test("Send feedback opens the feedback dialog", async ({ page }) => {
    await openPhone(page, "/account");

    await page.getByRole("button", { name: "Send feedback" }).click();
    await expect(
      page.getByRole("dialog", { name: "Rate your experience" }),
    ).toBeVisible();
  });

  test("the theme switches from the Account hub", async ({ page }) => {
    await openPhone(page, "/account");
    const theme = page.getByRole("radiogroup", { name: "Theme" });
    const html = page.locator("html");

    await theme.getByRole("radio", { name: "Light" }).click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await expect(theme.getByRole("radio", { name: "Light" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    await theme.getByRole("radio", { name: "Dark", exact: true }).click();
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test("a screen without the tab bar goes back to the screen it came from", async ({
    page,
  }) => {
    await openPhone(page, "/cycles");
    await expect(tabBar(page)).toHaveCount(0);

    const back = page.getByRole("banner").getByRole("link");
    await expect(back).toHaveAccessibleName("Account");
    await back.click();
    await page.waitForURL("**/account");
    await expect(page.getByRole("region", { name: "Workspace" })).toBeVisible();
  });

  test("the chrome and the Account hub give every control 44px both ways", async ({
    page,
  }) => {
    const undersized = () =>
      page.evaluate(() => {
        const shell = document.querySelector('[data-slot="phone-shell"]');
        if (!shell) throw new Error("the phone shell is not in the DOM");
        // The shell's own chrome, the ported hub and the banner the shell
        // renders; today's content on unported screens is not in this ticket.
        const controls = Array.from(
          shell.querySelectorAll<HTMLElement>(
            [
              '[data-slot="phone-shell"] > [data-slot="phone-top-bar"] a',
              '[data-slot="phone-tab-bar"] a',
              '[data-slot="phone-avatar"]',
              '[data-slot="phone-fab"]',
              '[data-slot="phone-account"] a',
              '[data-slot="phone-account"] button',
              '[role="region"][aria-label="applika-cli announcement"] a',
              '[role="region"][aria-label="applika-cli announcement"] button',
            ].join(", "),
          ),
        );
        return {
          count: controls.length,
          small: controls
            .map((control) => {
              const rect = control.getBoundingClientRect();
              return rect.width + 0.5 < 44 || rect.height + 0.5 < 44
                ? `${control.getAttribute("aria-label") ?? control.textContent?.trim()} ${Math.round(rect.width)}x${Math.round(rect.height)}`
                : null;
            })
            .filter((entry) => entry !== null),
        };
      });

    await openPhone(page, "/dashboard");
    await expect(avatar(page)).toBeVisible();
    const dashboard = await undersized();
    expect(dashboard.count).toBeGreaterThanOrEqual(6);
    expect(dashboard.small).toEqual([]);

    // The hub has no applika-cli banner (Today only).
    await page.goto("/account");
    await expect(page.getByRole("region", { name: "Workspace" })).toBeVisible();
    const account = await undersized();
    expect(account.count).toBeGreaterThanOrEqual(14);
    expect(account.small).toEqual([]);
  });

  test("the applika-cli banner shows on Today only, and Dismiss still hides it", async ({
    page,
  }) => {
    await openPhone(page, "/dashboard");
    const banner = page.locator(CLI_BANNER);
    await expect(banner).toBeVisible();
    await expectNoSidewaysScroll(page);

    for (const path of ["/applications", "/agenda", "/insights", "/cvs/new"]) {
      await page.goto(path);
      await expect(page.locator('[data-slot="phone-shell"]')).toBeVisible();
      await expect(page.locator('[data-slot="app-content"]')).not.toBeEmpty();
      await expect(banner, `the banner on ${path}`).toHaveCount(0);
    }

    // Back on Today it is there until dismissed, then gone after a reload.
    await page.goto("/dashboard");
    await expect(banner).toBeVisible();
    await banner
      .getByRole("button", { name: "Dismiss announcement", exact: true })
      .click();
    await expect(banner).toHaveCount(0);
    await page.reload();
    await expect(avatar(page)).toBeVisible();
    await expect(banner).toHaveCount(0);
  });

  test("an admin screen shows no applika-cli banner below md", async ({
    page,
  }) => {
    await openPhone(page, "/admin/companies", "admin");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Company Management",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.locator('li[data-slot="catalog-row"]').first(),
    ).toBeVisible();
    await expect(page.locator(CLI_BANNER)).toHaveCount(0);
  });

  test("turning the screen past md switches the layout and drops the quick add", async ({
    page,
  }) => {
    await openDashboard(page);

    await page.getByRole("button", { name: "Add", exact: true }).click();
    const quickAdd = page.getByRole("dialog", { name: "Add application" });
    await expect(quickAdd).toBeVisible();

    await page.setViewportSize(DESKTOP);
    await expect(page.locator("aside")).toBeVisible();
    await expect(page.locator('[data-slot="phone-tab-bar"]')).toHaveCount(0);
    await expect(quickAdd).toHaveCount(0);
    // Nothing stayed trapped: the rail answers a click.
    await page
      .locator("aside")
      .getByRole("link", { name: "Agenda", exact: true })
      .click();
    await page.waitForURL("**/agenda");

    await page.setViewportSize(MOBILE);
    await expect(tabBar(page)).toBeVisible();
    await expect(page.locator("aside")).toHaveCount(0);
    await expect(quickAdd).toHaveCount(0);
  });
});

test.describe("at md and above the shell renders a fixed rail", () => {
  test.use({ viewport: DESKTOP });

  test("the rail is visible and the menu trigger is not", async ({ page }) => {
    await openDashboard(page);

    const rail = page.locator("aside");
    await expect(rail).toBeVisible();
    const primary = rail.getByRole("navigation", { name: "Primary" });
    await expect(primary).toBeVisible();
    for (const label of PRIMARY_LABELS) {
      await expect(rail.getByRole("link", { name: label })).toBeVisible();
    }

    // The pin for the hand-kept constant above. The loop only proves every
    // expected entry EXISTS; this proves the nav holds exactly those entries,
    // in exactly that order, and nothing else. The brand link sits outside the
    // `Primary` landmark, so the landmark's links are the entries alone.
    // Without this, a nav change surfaces as an unrelated tab-order failure
    // three tests away instead of here, naming the real cause.
    // KODI-053: the Jobs link's TEXT also holds its "Beta" badge while the
    // seeded user's `jobs` is in beta; its accessible name stays "Jobs". The
    // CVs link does the same while `cvs` is in beta.
    await expect(
      primary.getByRole("link"),
      "the rail's entries no longer match PRIMARY_LABELS — update the constant to mirror PRIMARY_NAV in src/components/layout/nav.ts",
    ).toHaveText(
      PRIMARY_LABELS.map((label) =>
        label === "Jobs"
          ? /^Jobs(?: Beta)?$/
          : label === "CVs"
            ? /^CVs(?: Beta)?$/
            : label,
      ),
    );

    // The breakpoint, proved from both sides: no hamburger above `md`.
    await expect(menuTrigger(page)).toHaveCount(0);
  });

  test("the rail marks the current page and only the current page", async ({
    page,
  }) => {
    await openDashboard(page);
    const rail = page.locator("aside");

    await expect(rail.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(rail.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      "/dashboard",
    );

    await rail.getByRole("link", { name: "Reports" }).click();
    await page.waitForURL("**/reports");
    await expect(rail.locator('a[aria-current="page"]')).toHaveAttribute(
      "href",
      "/reports",
    );
  });

  test("tab order in the rail runs brand, entries, the CLI link, account menu", async ({
    page,
  }) => {
    await openDashboard(page);
    const rail = page.locator("aside");

    await rail.getByRole("link", { name: "Applika.dev home" }).focus();

    for (const label of PRIMARY_LABELS) {
      await page.keyboard.press("Tab");
      await expect(rail.getByRole("link", { name: label })).toBeFocused();
    }

    await page.keyboard.press("Tab");
    await expect(
      rail.getByRole("link", { name: "Applika CLI", exact: true }),
    ).toBeFocused();

    await page.keyboard.press("Tab");
    await expect(
      rail.getByRole("button", { name: "Open account menu" }),
    ).toBeFocused();
  });

  test("the shell keeps every control the old header had", async ({ page }) => {
    await openDashboard(page);

    const header = page.locator("header");
    // Cycle selector, agenda notifications and theme toggle stay in the header.
    await expect(header.getByRole("combobox")).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Upcoming steps" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Toggle theme" }),
    ).toBeVisible();

    // The CLI promo banner stays at the top of the content column, on every
    // page at md and up (below md, Today only).
    await expect(page.locator(CLI_BANNER)).toBeVisible();
    for (const path of ["/applications", "/agenda", "/cvs/new"]) {
      await page.goto(path);
      await expect(page.locator("aside")).toBeVisible();
      await expect(
        page.locator(CLI_BANNER),
        `the banner on ${path}`,
      ).toBeVisible();
    }
    await page.goto("/dashboard");

    // Profile, feedback and logout move into the rail's account menu.
    await page
      .locator("aside")
      .getByRole("button", { name: "Open account menu" })
      .click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Profile" })).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Logout" })).toBeVisible();

    // Feedback still opens the dialog it always opened.
    await menu.getByRole("menuitem", { name: "Feedback" }).click();
    await expect(
      page.getByRole("dialog", { name: "Rate your experience" }),
    ).toBeVisible();
  });

  test("the cookie notice does not cover the rail", async ({ page }) => {
    await showCookieNotice(page);
    await openDashboard(page);

    const notice = page.locator(COOKIE_NOTICE);
    await expect(notice).toBeVisible();
    await waitForStableBox(notice, "the cookie notice");

    const obstructed = await page.evaluate((noticeSelector) => {
      const rail = document.querySelector<HTMLElement>("aside");
      if (!rail) throw new Error("the rail is not in the DOM");
      const noticeRect = document
        .querySelector<HTMLElement>(noticeSelector)
        ?.getBoundingClientRect();
      if (!noticeRect) throw new Error("the cookie notice is not in the DOM");

      return Array.from(rail.querySelectorAll<HTMLElement>("a[href], button"))
        .map((control) => {
          const rect = control.getBoundingClientRect();
          const covered =
            noticeRect.left < rect.right &&
            noticeRect.right > rect.left &&
            noticeRect.top < rect.bottom &&
            noticeRect.bottom > rect.top;
          return covered
            ? (control.getAttribute("aria-label") ??
                control.textContent?.trim() ??
                control.tagName)
            : null;
        })
        .filter((entry) => entry !== null);
    }, COOKIE_NOTICE);

    expect(obstructed, "the cookie notice overlaps the rail").toEqual([]);
  });
});
