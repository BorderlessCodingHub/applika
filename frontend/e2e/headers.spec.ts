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
 * Below md, `/` and `/cli` share one public phone header: the Applika icon
 * as the home link (no words), then the theme toggle, the language toggle
 * with its flags only (each radio still named English / Português), and the
 * sign-in button: "Sign in" to /login, "Dashboard" to /dashboard once signed
 * in ("Entrar" / "Painel" in Portuguese), the page's one sign-in link. The
 * header stays on one row from 320 to 430 px wide, signed out and signed in,
 * in English and Portuguese, light and dark.
 *
 * Every pair reads theme, then language: `/login` (the phone top bar's right
 * side below md, top 20 / right 24 at md and up), `/cli/code` (top right at
 * both widths) and `/cookie-policy`'s phone bar.
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
  // home, theme, English, Português, Sign in, View on GitHub, Cookie policy.
  { path: "/", tree: "landing-phone", targets: 7 },
  // home, theme, English, Português, Sign in, two PyPI, four Copy, home
  // page, Cookie policy.
  { path: "/cli", tree: "cli-phone", targets: 13 },
] as const;

/** The header's words by language: the home link's name, the button's words. */
const WORDS = {
  en: {
    home: "Applika.dev home",
    theme: "Toggle theme",
    out: "Sign in",
    in: "Dashboard",
  },
  pt: {
    home: "Página inicial do Applika.dev",
    theme: "Alternar tema",
    out: "Entrar",
    in: "Painel",
  },
} as const;

type Lang = keyof typeof WORDS;
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

/** The phone header's five controls and its height, read from the page. */
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
 * One row, in order: home, theme, English, Português, the button, each at
 * least 44×44, their middles on one line, inside the viewport; the header 64
 * tall (its one-row height). The only drawn words are the button's.
 */
async function expectOneRowHeader(
  page: Page,
  slot: string,
  lang: Lang,
  state: "out" | "in",
  label: string,
) {
  const words = WORDS[lang];
  const header = tree(page, slot).getByRole("banner");
  await expect(header.getByRole("link"), label).toHaveCount(2);
  const home = header.locator('a[href="/"]');
  await expect(home, label).toHaveCount(1);
  await expect(home, label).toHaveAccessibleName(words.home);
  await expect(home, label).toHaveText("");
  const button = header.getByRole("link", { name: words[state], exact: true });
  await expect(button, label).toHaveText(words[state]);
  await expect(button, label).toHaveAttribute(
    "href",
    state === "in" ? "/dashboard" : "/login",
  );
  const english = header.getByRole("radio", { name: "English", exact: true });
  const portuguese = header.getByRole("radio", {
    name: "Português",
    exact: true,
  });
  await expect(english, label).toHaveAttribute("lang", "en");
  await expect(portuguese, label).toHaveAttribute("lang", "pt-BR");
  await expect(english, label).toHaveText("");
  await expect(portuguese, label).toHaveText("");

  // Widths are read in the page's own font, never its fallback.
  await page.evaluate(() => document.fonts.ready);
  const measured = await measureHeader(page, slot);
  expect(measured.names, label).toEqual([
    `a::${words.home}`,
    `button::${words.theme}`,
    "button:radio:English",
    "button:radio:Português",
    `a::${words[state]}`,
  ]);
  // Only the button's words: no applika.dev, EN or BR.
  expect(measured.text, label).toBe(words[state]);
  await expect(header, label).not.toContainText(
    /[Aa]pplika|\.dev|\bEN\b|\bBR\b/,
  );
  const [homeBox, theme, en, pt, action] = measured.boxes;
  // Left to right, as in the DOM, with no overlap.
  expect(homeBox.x, label).toBeGreaterThanOrEqual(0);
  expect(homeBox.x + homeBox.width, label).toBeLessThanOrEqual(theme.x + 0.5);
  expect(theme.x + theme.width, label).toBeLessThanOrEqual(en.x + 0.5);
  expect(en.x + en.width, label).toBeLessThanOrEqual(pt.x + 0.5);
  expect(pt.x + pt.width, label).toBeLessThanOrEqual(action.x + 0.5);
  // One row: every middle within 2px of the home link's.
  const middle = (box: Box) => box.y + box.height / 2;
  for (const box of [theme, en, pt, action]) {
    expect(Math.abs(middle(box) - middle(homeBox)), label).toBeLessThanOrEqual(
      2,
    );
  }
  for (const box of measured.boxes) {
    expect(box.width, label).toBeGreaterThanOrEqual(44 - 0.5);
    expect(box.height, label).toBeGreaterThanOrEqual(44 - 0.5);
  }
  // Inside the viewport: the button clear of the right edge.
  const viewport = page.viewportSize()!;
  expect(action.x + action.width, label).toBeLessThanOrEqual(viewport.width);
  expect(measured.header.height, label).toBeCloseTo(64, 0);
  return measured.header.height;
}

for (const { path, tree: slot, targets } of PHONE_PAGES) {
  test(`${path} below md: the header is home, theme, flags, then Sign in or Dashboard on one row from 320 to 430, signed out and in, EN (dark) and PT (light)`, async ({
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
            heights.push(
              await expectOneRowHeader(page, slot, lang, state, label),
            );
            // The header's button is the page's one Sign in or Dashboard.
            await expect(
              tree(page, slot).getByRole("link", {
                name: /sign in|dashboard|entrar|painel/i,
              }),
              label,
            ).toHaveCount(1);
            await expectPhoneTargets(page, targets);
            if (width === 320) await expectNoSidewaysScroll(page);
          }
          // Signing in only swaps the button's words: the row keeps its height.
          expect(heights[1], `${path} ${width}px ${lang}`).toBe(heights[0]);
        }
      }

      // The button leads where it says.
      await out.page.setViewportSize(PHONE);
      await out.page.goto(path);
      await pickLanguage(out.page, slot, "en");
      await tree(out.page, slot)
        .getByRole("banner")
        .getByRole("link", { name: "Sign in", exact: true })
        .click();
      await out.page.waitForURL("**/login");
      await inn.page.setViewportSize(PHONE);
      await inn.page.goto(path);
      await pickLanguage(inn.page, slot, "en");
      await tree(inn.page, slot)
        .getByRole("banner")
        .getByRole("link", { name: "Dashboard", exact: true })
        .click();
      await inn.page.waitForURL("**/dashboard");
    } finally {
      await out.context.close();
      await inn.context.close();
    }
  });
}

/**
 * The public screens whose pair sits outside a header, and the box that
 * holds it at each width: `/login`'s bar, `/cli/code`'s top-right box, and
 * `/cookie-policy`'s phone bar (at md and up it is `LandingHeader`'s, below).
 */
const PAIR_SCREENS = [
  {
    path: "/login",
    pair: '[data-slot="sign-in-bar"] .ph-pair',
    widths: [PHONE, DESKTOP],
    back: "Back to home",
    // Back to home, theme, English, Português, Continue with Borderless.
    targets: 5,
  },
  {
    path: "/cli/code?code=e2e-code&state=e2e-state",
    pair: ".ph-pair",
    widths: [PHONE, DESKTOP],
    back: null,
    // theme, English, Português, Copy.
    targets: 4,
  },
  {
    path: "/cookie-policy",
    pair: '[data-slot="phone-public-bar"] .ph-pair',
    widths: [PHONE],
    back: "Home",
    // Home, theme, English, Português.
    targets: 4,
  },
] as const;

for (const {
  path,
  pair: pairSelector,
  widths,
  back,
  targets,
} of PAIR_SCREENS) {
  const name = path.split("?")[0];
  test(`${name} holds the theme toggle, then the language toggle, at ${widths.map((w) => w.width).join(" and ")}`, async ({
    page,
  }) => {
    for (const viewport of widths) {
      const label = `${name} ${viewport.width}px`;
      await page.setViewportSize(viewport);
      await page.goto(path);
      const pair = page.locator(pairSelector).filter({ visible: true });
      await expect(pair, label).toHaveCount(1);
      const theme = page.getByRole("button", {
        name: "Toggle theme",
        exact: true,
      });
      const group = page.getByRole("radiogroup", { name: "Toggle language" });
      await expect(theme, label).toHaveCount(1);
      await expect(group, label).toHaveCount(1);
      await expect(group, label).toBeVisible();

      // In the DOM: the pair's first child is the theme toggle, its second
      // the language toggle (EN, then BR).
      expect(
        await pair.evaluate((node) =>
          Array.from(node.children).map(
            (child) =>
              child.getAttribute("role") ??
              child.querySelector(".sr-only")?.textContent ??
              "",
          ),
        ),
        label,
      ).toEqual(["Toggle theme", "radiogroup"]);
      await expect(group.getByRole("radio"), label).toHaveText(["EN", "BR"]);

      // On screen: theme left of the switcher, on one row, inside the page.
      const themeBox = (await theme.boundingBox())!;
      const groupBox = (await group.boundingBox())!;
      expect(themeBox.x + themeBox.width, label).toBeLessThanOrEqual(
        groupBox.x + 0.5,
      );
      expect(
        Math.abs(
          themeBox.y + themeBox.height / 2 - (groupBox.y + groupBox.height / 2),
        ),
        label,
      ).toBeLessThanOrEqual(2);
      expect(groupBox.x + groupBox.width, label).toBeLessThanOrEqual(
        viewport.width,
      );
      if (viewport === PHONE) {
        // Below md: the back link at the left of the same bar.
        if (back) {
          const link = page.getByRole("link", { name: back, exact: true });
          await expect(link, label).toBeVisible();
          expect((await link.boundingBox())!.x, label).toBeLessThan(themeBox.x);
        }
        await expectPhoneTargets(page, targets);
        await expectNoSidewaysScroll(page);
      } else if (name === "/login") {
        // At md and up: top 20, right 24.
        const pairBox = (await pair.boundingBox())!;
        expect(pairBox.y, label).toBeCloseTo(20, 0);
        expect(viewport.width - (pairBox.x + pairBox.width), label).toBeCloseTo(
          24,
          0,
        );
      }
    }
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
