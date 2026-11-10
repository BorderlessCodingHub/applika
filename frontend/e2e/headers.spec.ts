import {
  expect,
  test,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import { loginAs } from "./support/auth";
import { COOKIE_NOTICE_ACKNOWLEDGED } from "./support/cookie-notice";
import {
  PHONE,
  expectNoSidewaysScroll,
  expectPhoneTargets,
} from "./support/phone";

/**
 * The headers on the real stack, in the owner's order.
 *
 * Below md, `/` and `/cli` share one public phone header: the "applika.dev"
 * home link, the theme toggle, then the language toggle with its flags only
 * (each radio still named English / Português). It holds no Sign in or
 * Dashboard link: the floating button at the bottom of both pages carries
 * them ("Sign in with Borderless" to /login, "Go to Dashboard" to /dashboard
 * once signed in). The header stays on one row from 320 to 430 px wide,
 * signed out and signed in, in English and Portuguese, light and dark.
 *
 * At md and up the public header (`/`, `/cli`, `/cookie-policy`) reads the
 * logo, the theme toggle, the language switcher, then Sign in or Dashboard;
 * signed in, the app header holds the cycle selector at the left and the
 * agenda button, the theme toggle and the language switcher at the right.
 *
 * Read-only: the seeded `e2e-user` is signed in with `loginAs` (cookies
 * only, no new session); the language and the theme are switched in each
 * test's own browser context.
 */

test.describe.configure({ mode: "serial" });

const WIDTHS = [320, 360, 375, 390, 414, 430] as const;
const DESKTOP = { width: 1280, height: 800 } as const;

/** The phone trees whose header is `PhoneLandingHeader`, and their 44px floors. */
const PHONE_PAGES = [
  // home, theme, English, Português, View on GitHub, Cookie policy, the CTA.
  { path: "/", tree: "landing-phone", targets: 7 },
  // home, theme, English, Português, two PyPI, four Copy, home page,
  // Cookie policy, the CTA.
  { path: "/cli", tree: "cli-phone", targets: 13 },
] as const;

const CTA_WORDS = {
  en: { out: "Sign in with Borderless", in: "Go to Dashboard" },
  pt: { out: "Entrar com a Borderless", in: "Ir para o painel" },
} as const;

type Lang = keyof typeof CTA_WORDS;
type Box = { x: number; y: number; width: number; height: number };

function tree(page: Page, slot: string): Locator {
  return page.locator(`[data-slot="${slot}"]`);
}

async function newPhonePage(browser: Browser, signedIn: boolean) {
  const context = await browser.newContext({
    viewport: PHONE,
    storageState: COOKIE_NOTICE_ACKNOWLEDGED,
  });
  const page = await context.newPage();
  if (signedIn) await loginAs(page, "user");
  return { context, page };
}

/** Switches the language from the phone header's flags; `html[lang]` follows. */
async function pickLanguage(page: Page, slot: string, lang: Lang) {
  await tree(page, slot)
    .getByRole("banner")
    .getByRole("radio", { name: lang === "en" ? "English" : "Português" })
    .click();
  await expect(page.locator("html")).toHaveAttribute(
    "lang",
    lang === "en" ? "en" : "pt-BR",
  );
}

/** The page's theme toggle, until `html` has (or lacks) `dark`. */
async function pickTheme(page: Page, dark: boolean) {
  const html = page.locator("html");
  if (
    (await html.getAttribute("class"))?.split(/\s+/).includes("dark") !== dark
  ) {
    await page
      .getByRole("button", { name: /^(Toggle theme|Alternar tema)$/ })
      .click();
  }
  await expect(html).toHaveClass(dark ? /\bdark\b/ : /^(?!.*\bdark\b)/);
}

/** The phone header's four controls and its height, read from the page. */
async function measureHeader(page: Page, slot: string) {
  const header = tree(page, slot).getByRole("banner");
  const controls = header.locator("a, button, [role='radio']");
  return {
    header: (await header.boundingBox()) as Box,
    names: await controls.evaluateAll((nodes) =>
      nodes.map(
        (node) =>
          `${node.tagName.toLowerCase()}:${node.getAttribute("role") ?? ""}:${node.getAttribute("aria-label") ?? node.textContent?.trim() ?? ""}`,
      ),
    ),
    boxes: (await controls.evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height };
      }),
    )) as Box[],
    // The words drawn on screen (sr-only names left out).
    text: await header.evaluate((node) =>
      Array.from(node.querySelectorAll<HTMLElement>("*"))
        .filter((el) => !el.closest(".sr-only") && el.children.length === 0)
        .map((el) => el.textContent ?? "")
        .join("")
        .trim(),
    ),
  };
}

/**
 * One row, in order: home, theme, English, Português, each at least 44×44,
 * their middles on one line; the header 64 tall (its one-row height).
 */
async function expectOneRowHeader(page: Page, slot: string, label: string) {
  const header = tree(page, slot).getByRole("banner");
  await expect(header.getByRole("link"), label).toHaveCount(1);
  await expect(header.locator('a[href="/"]'), label).toHaveCount(1);
  const english = header.getByRole("radio", { name: "English", exact: true });
  const portuguese = header.getByRole("radio", {
    name: "Português",
    exact: true,
  });
  await expect(english, label).toHaveAttribute("lang", "en");
  await expect(portuguese, label).toHaveAttribute("lang", "pt-BR");
  await expect(english, label).toHaveText("");
  await expect(portuguese, label).toHaveText("");

  const measured = await measureHeader(page, slot);
  expect(measured.names, label).toEqual([
    expect.stringMatching(/^a::/),
    expect.stringMatching(/^button::(Toggle theme|Alternar tema)$/),
    "button:radio:English",
    "button:radio:Português",
  ]);
  // Only the home link's words: no Sign in, Dashboard, EN or BR.
  expect(measured.text, label).toBe("applika.dev");
  await expect(header, label).not.toContainText(
    /Sign in|Dashboard|Entrar|Painel|\bEN\b|\bBR\b/,
  );
  const [home, theme, en, pt] = measured.boxes;
  // Left to right, as in the DOM.
  expect(home.x, label).toBeLessThan(theme.x);
  expect(theme.x + theme.width, label).toBeLessThanOrEqual(en.x + 0.5);
  expect(en.x + en.width, label).toBeLessThanOrEqual(pt.x + 0.5);
  // One row: every middle within 2px of the home link's.
  const middle = (box: Box) => box.y + box.height / 2;
  for (const box of [theme, en, pt]) {
    expect(Math.abs(middle(box) - middle(home)), label).toBeLessThanOrEqual(2);
  }
  for (const box of measured.boxes) {
    expect(box.width, label).toBeGreaterThanOrEqual(44 - 0.5);
    expect(box.height, label).toBeGreaterThanOrEqual(44 - 0.5);
  }
  // Inside the viewport, the last flag clear of the right edge.
  const viewport = page.viewportSize()!;
  expect(pt.x + pt.width, label).toBeLessThanOrEqual(viewport.width);
  expect(measured.header.height, label).toBeCloseTo(64, 0);
  return measured.header.height;
}

/** The floating button: on screen, its words and its target. */
async function expectFloatingButton(
  page: Page,
  slot: string,
  words: string,
  href: string,
  label: string,
) {
  const block = tree(page, slot).locator('[data-slot="landing-phone-cta"]');
  const links = block.getByRole("link");
  await expect(links, label).toHaveCount(1);
  const link = links.first();
  await expect(link, label).toHaveAccessibleName(words);
  await expect(link, label).toHaveText(words);
  await expect(link, label).toHaveAttribute("href", href);
  await expect(link, label).toBeInViewport();
}

for (const { path, tree: slot, targets } of PHONE_PAGES) {
  test(`${path} below md: the header is home, theme, flags on one row from 320 to 430, signed out and in, EN (dark) and PT (light); the floating button carries Sign in or Dashboard`, async ({
    browser,
  }) => {
    test.setTimeout(240_000);
    const out = await newPhonePage(browser, false);
    const inn = await newPhonePage(browser, true);
    try {
      for (const lang of ["en", "pt"] as const) {
        for (const width of WIDTHS) {
          const heights: number[] = [];
          for (const [state, page] of [
            ["out", out.page],
            ["in", inn.page],
          ] as const) {
            const label = `${path} ${width}px ${lang} signed ${state}`;
            await page.setViewportSize({ width, height: PHONE.height });
            await page.goto(path);
            await expect(tree(page, slot), label).toBeVisible();
            if (width === WIDTHS[0]) {
              // Each context switches once per language: EN dark, PT light.
              await pickLanguage(page, slot, lang);
              await pickTheme(page, lang === "en");
            }
            await expectFloatingButton(
              page,
              slot,
              CTA_WORDS[lang][state],
              state === "in" ? "/dashboard" : "/login",
              label,
            );
            heights.push(await expectOneRowHeader(page, slot, label));
            await expectPhoneTargets(page, targets);
            if (width === 320) await expectNoSidewaysScroll(page);
          }
          // Signing in changes nothing in the header.
          expect(heights[1], `${path} ${width}px ${lang}`).toBe(heights[0]);
        }
      }

      // The floating button leads where it says.
      await out.page.setViewportSize(PHONE);
      await out.page.goto(path);
      await pickLanguage(out.page, slot, "en");
      await tree(out.page, slot)
        .locator('[data-slot="landing-phone-cta"]')
        .getByRole("link")
        .click();
      await out.page.waitForURL("**/login");
      await inn.page.setViewportSize(PHONE);
      await inn.page.goto(path);
      await tree(inn.page, slot)
        .locator('[data-slot="landing-phone-cta"]')
        .getByRole("link")
        .click();
      await inn.page.waitForURL("**/dashboard");
    } finally {
      await out.context.close();
      await inn.context.close();
    }
  });

  test(`${path} below md: nothing ends under the floating button, and Tab never parks focus under it`, async ({
    page,
  }) => {
    await page.setViewportSize(PHONE);
    await page.goto(path);
    const root = tree(page, slot);
    await expect(root).toBeVisible();
    const button = root.locator(".ph-landing-cta-btn");
    await expect(button).toBeInViewport();

    /** Is the focused control drawn under the floating button? */
    const coveredFocus = () =>
      page.evaluate(() => {
        const active = document.activeElement as HTMLElement | null;
        const cta = document.querySelector<HTMLElement>(
          '[data-slot="landing-phone-cta"]',
        );
        if (!active || !cta || cta.contains(active)) return null;
        const btn = cta.querySelector<HTMLElement>(".ph-landing-cta-btn")!;
        const a = active.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        const overlaps =
          a.bottom > b.top &&
          a.top < b.bottom &&
          a.right > b.left &&
          a.left < b.right;
        return overlaps
          ? `${active.textContent?.trim() || active.getAttribute("aria-label")}`
          : null;
      });

    // Tab from the top to the floating button: every stop stays clear of it.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.locator("body").click({ position: { x: 1, y: 1 } });
    let reached = false;
    for (let step = 0; step < 40 && !reached; step++) {
      await page.keyboard.press("Tab");
      expect(await coveredFocus(), `Tab stop ${step}`).toBeNull();
      reached = await page.evaluate(() =>
        Boolean(
          document
            .querySelector('[data-slot="landing-phone-cta"]')
            ?.contains(document.activeElement),
        ),
      );
    }
    expect(reached, "Tab reaches the floating button").toBe(true);

    // At full scroll every control is above the floating button, uncovered.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    const covered = await page.evaluate((selector) => {
      const cta = document.querySelector<HTMLElement>(
        '[data-slot="landing-phone-cta"]',
      )!;
      return Array.from(
        document.querySelectorAll<HTMLElement>(
          `${selector} a[href], ${selector} button`,
        ),
      )
        .filter((node) => !cta.contains(node))
        .filter((node) => {
          const r = node.getBoundingClientRect();
          return (
            r.width > 1 && r.height > 1 && r.bottom > 0 && r.top < innerHeight
          );
        })
        .filter((node) => {
          const r = node.getBoundingClientRect();
          const hit = document.elementFromPoint(
            r.left + r.width / 2,
            r.top + r.height / 2,
          );
          return !(hit && (node === hit || node.contains(hit)));
        })
        .map(
          (node) => node.textContent?.trim() || node.getAttribute("aria-label"),
        );
    }, `[data-slot="${slot}"]`);
    expect(covered).toEqual([]);
  });
}

test.describe("at md and up", () => {
  test.use({ viewport: DESKTOP });

  /** The public header's controls left to right: logo, theme, EN, BR, the action. */
  async function expectPublicOrder(
    page: Page,
    words: { theme: string; action: string; href: string },
    label: string,
  ) {
    const banner = page.getByRole("banner");
    await expect(banner, label).toHaveCount(1);
    const controls = banner.locator("a, button, [role='radio']");
    await expect(controls, label).toHaveCount(5);
    const logo = controls.nth(0);
    await expect(logo, label).toHaveAttribute("href", "/");
    await expect(controls.nth(1), label).toHaveAccessibleName(words.theme);
    await expect(controls.nth(2), label).toHaveAccessibleName("English");
    await expect(controls.nth(2), label).toHaveText("EN");
    await expect(controls.nth(3), label).toHaveAccessibleName("Português");
    await expect(controls.nth(3), label).toHaveText("BR");
    await expect(controls.nth(4), label).toHaveAccessibleName(words.action);
    await expect(controls.nth(4), label).toHaveAttribute("href", words.href);
    const xs = await controls.evaluateAll((nodes) =>
      nodes.map((node) => node.getBoundingClientRect().x),
    );
    expect(xs, label).toEqual([...xs].sort((a, b) => a - b));
    // The four controls after the logo share one row.
    const tops = await controls.evaluateAll((nodes) =>
      nodes.map((node) => {
        const r = node.getBoundingClientRect();
        return r.y + r.height / 2;
      }),
    );
    for (const top of tops.slice(1)) {
      expect(Math.abs(top - tops[1]), label).toBeLessThanOrEqual(2);
    }
  }

  test("the public header of /, /cli and /cookie-policy: logo, theme, language, Sign in or Dashboard (light and dark, English and Portuguese)", async ({
    page,
    browser,
  }) => {
    for (const path of ["/", "/cli", "/cookie-policy"]) {
      await page.goto(path);
      await expectPublicOrder(
        page,
        { theme: "Toggle theme", action: "Sign in", href: "/login" },
        `${path} signed out`,
      );
    }
    // Light, in Portuguese, from the header's own controls.
    await page.goto("/");
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
    await page.getByRole("radio", { name: "Português", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
    for (const path of ["/", "/cli", "/cookie-policy"]) {
      await page.goto(path);
      await expectPublicOrder(
        page,
        { theme: "Alternar tema", action: "Entrar", href: "/login" },
        `${path} signed out, pt, light`,
      );
    }

    // Signed in: Dashboard in the same place, dark.
    const context = await browser.newContext({
      viewport: DESKTOP,
      storageState: COOKIE_NOTICE_ACKNOWLEDGED,
    });
    try {
      const signedIn = await context.newPage();
      await loginAs(signedIn, "user");
      for (const path of ["/", "/cli", "/cookie-policy"]) {
        await signedIn.goto(path);
        await expect(
          signedIn.getByRole("banner").getByRole("link", { name: "Dashboard" }),
        ).toBeVisible();
        await expectPublicOrder(
          signedIn,
          { theme: "Toggle theme", action: "Dashboard", href: "/dashboard" },
          `${path} signed in`,
        );
      }
      await expect(signedIn.locator("html")).toHaveClass(/\bdark\b/);
    } finally {
      await context.close();
    }
  });

  test("signed in, the app header: the cycle selector at the left; the agenda, the theme and the language at the right (dark English, light Portuguese)", async ({
    page,
  }) => {
    await loginAs(page, "user");
    for (const lang of ["en", "pt"] as const) {
      await page.goto("/dashboard");
      const header = page.locator("header").first();
      const cycle = header.getByRole("combobox");
      await expect(cycle).toBeVisible();
      if (lang === "pt") {
        await header.getByRole("button", { name: "Toggle theme" }).click();
        await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);
        await header.getByRole("radio", { name: "Português" }).click();
        await expect(page.locator("html")).toHaveAttribute("lang", "pt-BR");
      } else {
        await expect(page.locator("html")).toHaveClass(/\bdark\b/);
      }
      const words =
        lang === "en"
          ? { agenda: /^Upcoming steps/, theme: "Toggle theme" }
          : { agenda: /^Próximas etapas/, theme: "Alternar tema" };
      const agenda = header.getByRole("button", { name: words.agenda });
      const theme = header.getByRole("button", {
        name: words.theme,
        exact: true,
      });
      const english = header.getByRole("radio", { name: "English" });
      const portuguese = header.getByRole("radio", { name: "Português" });
      for (const control of [agenda, theme, english, portuguese]) {
        await expect(control).toBeVisible();
      }

      // Every visible control of the header, left to right.
      const visible = await header
        .locator("a, button, [role='combobox'], [role='radio']")
        .evaluateAll((nodes) =>
          nodes
            .filter((node) => {
              const r = node.getBoundingClientRect();
              return r.width > 1 && r.height > 1;
            })
            .map((node) => ({
              name:
                node.getAttribute("role") === "combobox"
                  ? "cycle"
                  : (node.getAttribute("aria-label") ??
                    node.textContent?.trim() ??
                    ""),
              x: node.getBoundingClientRect().x,
            })),
        );
      expect(visible.map((v) => v.x)).toEqual(
        [...visible.map((v) => v.x)].sort((a, b) => a - b),
      );
      const names = visible.map((v) => v.name);
      expect(names[0]).toBe("cycle");
      expect(names.slice(-4)).toEqual([
        expect.stringMatching(words.agenda),
        words.theme,
        "English",
        "Português",
      ]);
      // The cycle selector sits in the left half; the four sit at the right edge.
      const headerBox = (await header.boundingBox())!;
      const cycleBox = (await cycle.boundingBox())!;
      const portugueseBox = (await portuguese.boundingBox())!;
      expect(cycleBox.x + cycleBox.width).toBeLessThan(
        headerBox.x + headerBox.width / 2,
      );
      expect(
        headerBox.x + headerBox.width - (portugueseBox.x + portugueseBox.width),
      ).toBeLessThanOrEqual(32);
    }
    // Back to English, so the context leaves nothing behind.
    await page
      .locator("header")
      .first()
      .getByRole("radio", { name: "English" })
      .click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
