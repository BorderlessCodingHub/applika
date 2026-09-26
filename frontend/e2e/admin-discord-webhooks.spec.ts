import { expect, test } from "@playwright/test";

import { loginAs } from "./support/auth";

/**
 * KODI-027 (plan 0009 · Frontend) — the admin Discord webhooks page, driven
 * against the REAL backend (no mocking, `.claude/rules/quality-gates.md`).
 * The backend never calls Discord on save (non-goal, plan 0009): a
 * valid-FORMAT fake webhook URL is enough, `discord.com` is never reached by
 * this suite at all.
 *
 * Serial on purpose: add -> edit -> delete is one lifecycle against the same
 * real row, and the delete at the end is this suite's own cleanup — a rerun
 * must not accumulate rows in the shared database.
 *
 * Name/text traps (`.claude/agent-memory/ui-designer/
 * project-accessible-name-collisions.md`): "Add webhook" is both a button
 * and the dialog's name (scope by role), and "Delete" is a substring of
 * "Delete <target>" (scope to the row's own button).
 */

test.describe.configure({ mode: "serial" });

// Valid-format, fake ids/token — never a real Discord webhook. Unique per
// run so a rerun of this suite never collides with a leftover row.
const GUILD_ID = "987654321098765432";
const OTHER_ROLE_ID = "111111111111111112";
const RUN_TOKEN = `e2e${Date.now()}${Math.random().toString(36).slice(2)}`
  .padEnd(24, "0")
  .slice(0, 32);
const WEBHOOK_ID = "123456789012345678";
const WEBHOOK_URL = `https://discord.com/api/webhooks/${WEBHOOK_ID}/${RUN_TOKEN}`;
const LABEL = "E2E report webhook";

test.describe("KODI-027 admin — Discord webhooks", () => {
  test("a non-admin cannot reach the page", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/admin/discord-webhooks");

    await page.waitForURL("**/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
  });

  test("an admin adds a webhook and sees only its masked address", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/discord-webhooks");

    await expect(
      page.getByRole("heading", { name: "Discord webhooks" }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Add webhook" }).click();
    const dialog = page.getByRole("dialog", { name: "Add webhook" });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel("Webhook URL").fill(WEBHOOK_URL);
    await dialog.getByLabel("Server id").fill(GUILD_ID);
    await dialog.getByLabel("Label").fill(LABEL);
    await dialog.getByRole("button", { name: "Save webhook" }).click();

    await expect(dialog).toBeHidden();

    const row = page
      .locator('li[data-slot="discord-webhook-row"]')
      .filter({ hasText: LABEL });
    await expect(row).toBeVisible();
    await expect(row.locator('[data-slot="discord-webhook-guild"]')).toHaveText(
      GUILD_ID,
    );

    // AC9: only the masked form is ever shown — never the real token.
    const maskedText = await row
      .locator('[data-slot="discord-webhook-url"]')
      .innerText();
    expect(maskedText).not.toContain(RUN_TOKEN);
    expect(maskedText.startsWith("https://discord.com/api/webhooks/")).toBe(
      true,
    );
    const pageContent = await page.content();
    expect(pageContent).not.toContain(RUN_TOKEN);
  });

  test("an admin edits the webhook's roles without resending the URL", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/discord-webhooks");

    const row = page
      .locator('li[data-slot="discord-webhook-row"]')
      .filter({ hasText: LABEL });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: `Edit ${LABEL}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit webhook" });
    await expect(dialog).toBeVisible();

    // The stored URL is a secret: the edit form always opens blank.
    await expect(dialog.getByLabel("Webhook URL")).toHaveValue("");

    await dialog.getByLabel("Role ids").fill(OTHER_ROLE_ID);
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    await expect(
      row.locator('[data-slot="discord-webhook-roles"]'),
    ).toContainText(OTHER_ROLE_ID);

    const pageContent = await page.content();
    expect(pageContent).not.toContain(RUN_TOKEN);
  });

  test("an admin deletes the webhook (cleanup)", async ({ page }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/discord-webhooks");

    const row = page
      .locator('li[data-slot="discord-webhook-row"]')
      .filter({ hasText: LABEL });
    await expect(row).toBeVisible();

    await row.getByRole("button", { name: `Delete ${LABEL}` }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(row).toHaveCount(0);
  });
});
