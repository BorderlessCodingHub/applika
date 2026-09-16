import { expect, test, type Locator, type Page } from "@playwright/test";

import { loginAs, type SeededRole } from "./support/auth";

/**
 * App shell — responsive behaviour and keyboard traversal (KODI-004 / R-017,
 * R-018, R-019, R-020).
 *
 * Criterion 5 ("on narrow screens the sidebar collapses into a menu the user
 * can open and close") is a NARROW-SCREEN behaviour, so it is EXERCISED at a
 * phone viewport rather than asserted at a desktop one. `playwright.config.ts`
 * ships a single Desktop Chrome project, so the viewport is overridden per
 * describe block instead of adding a project.
 *
 * Everything here runs against the REAL stack `scripts/e2e.sh` stands up, and
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

const SHEET_PANEL = '[data-slot="sheet-content"]';
const COOKIE_NOTICE = '[role="dialog"][aria-label="Cookie notice"]';
const CLI_BANNER = '[role="region"][aria-label="applika-cli announcement"]';

/** The primary entries a non-admin sees, in display order. */
const PRIMARY_LABELS = [
  "Dashboard",
  "Applications",
  "Agenda",
  "Reports",
  "Cycles",
  "Profile",
];

async function openDashboard(page: Page, role: SeededRole = "user") {
  await loginAs(page, role);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Dashboard", level: 1 }),
  ).toBeVisible();
}

const menuTrigger = (page: Page) =>
  page.getByRole("button", { name: "Open navigation menu" });

/** The mobile navigation panel. Named, because the cookie notice is a dialog too. */
const navSheet = (page: Page) =>
  page.getByRole("dialog", { name: "Navigation" });

async function openMenu(page: Page): Promise<Locator> {
  await menuTrigger(page).click();
  const sheet = navSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

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

test.describe("below md the sidebar collapses into a menu", () => {
  test.use({ viewport: MOBILE });

  test("the rail is gone and the menu trigger takes its place", async ({
    page,
  }) => {
    await openDashboard(page);

    // The rail is the only <aside> in the shell; below `md` it is display:none.
    await expect(page.locator("aside")).toBeHidden();
    // With the rail hidden and the panel closed, no primary nav is on screen.
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(
      0,
    );

    await expect(menuTrigger(page)).toBeVisible();
  });

  test("opening the menu reveals the navigation in a modal dialog", async ({
    page,
  }) => {
    await openDashboard(page);
    const sheet = await openMenu(page);

    // Modality, asserted by BEHAVIOUR rather than by `aria-modal`: Radix marks
    // everything outside the portal `aria-hidden` instead of setting
    // `aria-modal` on the panel, so while the panel is open the page behind it
    // is gone from the accessibility tree — the trigger included.
    await expect(sheet).toHaveAttribute("data-state", "open");
    await expect(menuTrigger(page)).toHaveCount(0);

    await expect(
      sheet.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();

    for (const label of PRIMARY_LABELS) {
      await expect(sheet.getByRole("link", { name: label })).toBeVisible();
    }

    // The controls the header cannot hold below `md` move in here with it.
    await expect(
      sheet.getByRole("button", { name: "Open account menu" }),
    ).toBeVisible();
    await expect(
      sheet.getByRole("link", { name: "Applika.dev home" }),
    ).toBeVisible();
  });

  test("the cookie notice and the CLI banner do not cover the open menu", async ({
    page,
  }) => {
    // This is T047's literal wording, and the regression it guards is real:
    // the cookie notice used to sit at `z-50` — the same layer as the sheet —
    // and is rendered AFTER the page content, so it won the tie and floated
    // over the open panel.
    await openDashboard(page);

    const notice = page.locator(COOKIE_NOTICE);
    const banner = page.locator(CLI_BANNER);
    // A fresh context has acknowledged neither, so both must really be on
    // screen. Without them the rest of this test proves nothing.
    await expect(notice).toBeVisible();
    await expect(banner).toBeVisible();

    const sheet = await openMenu(page);
    await waitForStableBox(sheet, "the navigation panel");
    await waitForStableBox(notice, "the cookie notice");

    const report = await page.evaluate(
      ({ panelSelector, noticeSelector, bannerSelector }) => {
        const panel = document.querySelector<HTMLElement>(panelSelector);
        if (!panel) throw new Error("the navigation panel is not in the DOM");

        const panelRect = panel.getBoundingClientRect();
        const rectOf = (selector: string) =>
          document
            .querySelector<HTMLElement>(selector)
            ?.getBoundingClientRect();
        const intersects = (a: DOMRect | undefined, b: DOMRect) =>
          !!a &&
          a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top;

        const describe = (element: Element | null) => {
          if (!element) return "nothing";
          const label =
            element.getAttribute("aria-label") ??
            element.textContent?.trim().slice(0, 40) ??
            "";
          return `<${element.tagName.toLowerCase()}> ${label}`.trim();
        };

        // Every control the user has to be able to reach inside the panel.
        const controls = Array.from(
          panel.querySelectorAll<HTMLElement>("a[href], button"),
        );

        const obstructed = controls
          .map((control) => {
            const rect = control.getBoundingClientRect();
            const x = Math.round(rect.left + rect.width / 2);
            const y = Math.round(rect.top + rect.height / 2);
            const topmost = document.elementFromPoint(x, y);
            if (topmost && panel.contains(topmost)) return null;
            return {
              control: describe(control),
              at: `${x},${y}`,
              coveredBy: describe(topmost),
            };
          })
          .filter((entry) => entry !== null);

        return {
          controlCount: controls.length,
          noticeOverlapsPanel: intersects(rectOf(noticeSelector), panelRect),
          bannerOverlapsPanel: intersects(rectOf(bannerSelector), panelRect),
          obstructed,
        };
      },
      {
        panelSelector: SHEET_PANEL,
        noticeSelector: COOKIE_NOTICE,
        bannerSelector: CLI_BANNER,
      },
    );

    // Brand, close, six primary entries and the account menu.
    expect(report.controlCount).toBe(PRIMARY_LABELS.length + 3);

    // Guard against a vacuous pass: the two pieces of chrome must genuinely
    // share screen space with the panel, or hit-testing proves nothing.
    expect(
      report.noticeOverlapsPanel,
      "the cookie notice does not even reach the panel's footprint — this case would pass without testing anything",
    ).toBe(true);
    expect(
      report.bannerOverlapsPanel,
      "the CLI banner does not even reach the panel's footprint — this case would pass without testing anything",
    ).toBe(true);

    // The real assertion: at the centre of every control in the panel, the
    // topmost element is part of the panel.
    expect(
      report.obstructed,
      "something is painted over the open navigation menu",
    ).toEqual([]);
  });

  test("the close control closes the menu", async ({ page }) => {
    await openDashboard(page);
    const sheet = await openMenu(page);

    await sheet.getByRole("button", { name: "Close navigation menu" }).click();

    await expect(sheet).toBeHidden();
    await expect(menuTrigger(page)).toBeVisible();
  });

  test("choosing an entry navigates and closes the menu", async ({ page }) => {
    await openDashboard(page);
    const sheet = await openMenu(page);

    await sheet.getByRole("link", { name: "Applications" }).click();

    await page.waitForURL("**/applications");
    await expect(
      page.getByRole("heading", { name: "Applications", level: 1 }),
    ).toBeVisible();
    // The shell stays mounted across a client-side navigation, so the panel
    // only closes because the entry reports the navigation back to it.
    await expect(sheet).toBeHidden();
  });

  test("clicking the overlay closes the menu", async ({ page }) => {
    await openDashboard(page);
    const sheet = await openMenu(page);
    await waitForStableBox(sheet, "the navigation panel");

    // Deliberately to the right of the 17rem panel, and above the cookie
    // notice, so the click lands on the overlay itself.
    await page
      .locator('[data-slot="sheet-overlay"]')
      .click({ position: { x: 340, y: 420 } });

    await expect(sheet).toBeHidden();
  });

  test("the menu is traversable by keyboard and hands focus back on Escape", async ({
    page,
  }) => {
    await openDashboard(page);

    const trigger = menuTrigger(page);
    await trigger.focus();
    await expect(trigger).toBeFocused();
    await page.keyboard.press("Enter");

    const sheet = navSheet(page);
    await expect(sheet).toBeVisible();

    // Focus moves into the panel, onto the close control. Radix deliberately
    // skips anchors when it picks the initial target, so the brand link is not
    // it — the first non-link tabbable control is.
    const closeControl = sheet.getByRole("button", {
      name: "Close navigation menu",
    });
    await expect(closeControl).toBeFocused();

    const tabOrder: Locator[] = [
      ...PRIMARY_LABELS.map((label) =>
        sheet.getByRole("link", { name: label }),
      ),
      sheet.getByRole("button", { name: "Open account menu" }),
      // Focus is TRAPPED in the panel: tabbing past the last control wraps
      // round to the first one in the panel rather than escaping to the page.
      sheet.getByRole("link", { name: "Applika.dev home" }),
      closeControl,
    ];

    for (const target of tabOrder) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
    }

    // Shift+Tab retraces the same order.
    await page.keyboard.press("Shift+Tab");
    await expect(
      sheet.getByRole("link", { name: "Applika.dev home" }),
    ).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    // Focus comes back to the control that opened the panel. Radix cannot do
    // this on its own here (the sheet is controlled and has no Dialog.Trigger),
    // so `AppShell` restores it by hand — without that a keyboard user is
    // dropped on <body>.
    await expect(trigger).toBeFocused();
  });

  test("Enter on a focused entry navigates, so the menu is usable without a pointer", async ({
    page,
  }) => {
    await openDashboard(page);
    const sheet = await openMenu(page);

    await sheet.getByRole("link", { name: "Cycles" }).focus();
    await page.keyboard.press("Enter");

    await page.waitForURL("**/cycles");
    await expect(
      page.getByRole("heading", { name: "Cycles", level: 1 }),
    ).toBeVisible();
    await expect(sheet).toBeHidden();
  });

  test("the account menu in the panel keeps profile, feedback and logout", async ({
    page,
  }) => {
    await openDashboard(page);
    const sheet = await openMenu(page);

    // Scoped to the panel: below `md` the same control also exists in the
    // header, and an unscoped locator is a strict-mode violation.
    await sheet.getByRole("button", { name: "Open account menu" }).click();

    const menu = page.getByRole("menu");
    await expect(menu.getByRole("menuitem", { name: "Profile" })).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Feedback" }),
    ).toBeVisible();
    await expect(menu.getByRole("menuitem", { name: "Logout" })).toBeVisible();
  });

  test("the panel leaks no Admin entry to a non-admin", async ({ page }) => {
    await openDashboard(page, "user");
    const sheet = await openMenu(page);

    // The panel mounts a SECOND copy of the nav. The admin-gating suite's
    // count-0 assertion is exact, so a leak here would break it too.
    await expect(sheet.getByRole("link", { name: "Admin" })).toHaveCount(0);
    // The control: the entries that should be here are here.
    await expect(sheet.getByRole("link", { name: "Dashboard" })).toBeVisible();
  });

  test("the panel shows exactly one Admin entry to an admin", async ({
    page,
  }) => {
    await openDashboard(page, "admin");
    const sheet = await openMenu(page);

    const admin = sheet.getByRole("link", { name: "Admin" });
    await expect(admin).toHaveCount(1);
    await expect(admin).toHaveAttribute("href", "/admin");
  });

  test("the header keeps the cycle selector, agenda and theme toggle", async ({
    page,
  }) => {
    await openDashboard(page);
    const header = page.locator("header");

    await expect(header.getByRole("combobox")).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Upcoming steps" }),
    ).toBeVisible();
    await expect(
      header.getByRole("button", { name: "Toggle theme" }),
    ).toBeVisible();
  });
});

test.describe("at md and above the shell renders a fixed rail", () => {
  test.use({ viewport: DESKTOP });

  test("the rail is visible and the menu trigger is not", async ({ page }) => {
    await openDashboard(page);

    const rail = page.locator("aside");
    await expect(rail).toBeVisible();
    await expect(
      rail.getByRole("navigation", { name: "Primary" }),
    ).toBeVisible();
    for (const label of PRIMARY_LABELS) {
      await expect(rail.getByRole("link", { name: label })).toBeVisible();
    }

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

  test("tab order in the rail runs brand, entries, account menu", async ({
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

    // The CLI promo banner stays at the top of the content column.
    await expect(page.locator(CLI_BANNER)).toBeVisible();

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
