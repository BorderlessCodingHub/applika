import { expect, test, type Page } from "@playwright/test";

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
 * Read-only: signed out, nothing is written to the shared database.
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
