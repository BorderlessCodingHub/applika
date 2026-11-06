import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * Admin report webhooks (ADR-0024) on the real stack: add one holding BASE and
 * PSP, see both badges and only its masked address, narrow the set to PSP
 * without resending the URL, and delete it as the spec's own cleanup. The
 * backend never posts to a webhook on save, so a valid-format fake address is
 * enough; nothing leaves the stack.
 */

test.describe.configure({ mode: "serial" });

const LABEL = "e2e report webhook";
const TOKEN = "e2eSecretTokenAbcdefghijklmnopqrstuv";
const WEBHOOK_URL = `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`;

interface ReportWebhookRow {
  id: string;
  label: string | null;
  badges: string[];
  webhook_url_masked: string;
}

const admin = () => ({ Cookie: authCookieHeader("admin") });

async function listWebhooks(request: APIRequestContext) {
  const response = await request.get(apiUrl("/admin/report-webhooks"), {
    headers: admin(),
  });
  expect(response.status()).toBe(200);
  return (await response.json()) as ReportWebhookRow[];
}

/** Rows this spec made, left over from a run that failed half-way. */
async function deleteOwnRows(request: APIRequestContext) {
  for (const row of await listWebhooks(request)) {
    if (row.label === LABEL) {
      await request.delete(apiUrl(`/admin/report-webhooks/${row.id}`), {
        headers: admin(),
      });
    }
  }
}

test.beforeAll(async ({ request }) => {
  await deleteOwnRows(request);
});

test.afterAll(async ({ request }) => {
  await deleteOwnRows(request);
});

test.describe("report webhooks", () => {
  test("an admin adds a webhook for BASE and PSP and sees only its masked address (R-029, AC19)", async ({
    page,
    request,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin/report-webhooks");
    await expect(
      page.getByRole("heading", { name: "Report webhooks", level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Report webhooks" }),
    ).toHaveAttribute("aria-current", "page");

    await page.getByRole("button", { name: "Add webhook" }).click();
    const dialog = page.getByRole("dialog", { name: "Add webhook" });
    await dialog.getByLabel("Webhook URL").fill(WEBHOOK_URL);
    const badges = dialog.getByRole("group", { name: "Badges" });
    await badges.getByRole("checkbox", { name: "BASE" }).check();
    await badges.getByRole("checkbox", { name: "PSP" }).check();
    await dialog.getByLabel("Label").fill(LABEL);
    await dialog.getByRole("button", { name: "Save webhook" }).click();
    await expect(dialog).toBeHidden();

    const rows = (await listWebhooks(request)).filter((r) => r.label === LABEL);
    expect(rows).toHaveLength(1);
    expect(rows[0].badges).toEqual(["borderless_base", "borderless_psp"]);
    expect(rows[0].webhook_url_masked).toBe(
      "https://discord.com/api/webhooks/123456789012345678/…stuv",
    );

    const row = page.locator(
      `[data-slot="report-webhook-row"][data-webhook-id="${rows[0].id}"]`,
    );
    await expect(row).toHaveAttribute(
      "data-badges",
      "borderless_base borderless_psp",
    );
    await expect(row.locator('[data-slot="report-webhook-badge"]')).toHaveText([
      "BASE",
      "PSP",
    ]);
    await expect(row.locator('[data-slot="report-webhook-url"]')).toHaveText(
      rows[0].webhook_url_masked,
    );
    expect(await page.content()).not.toContain(TOKEN);
  });

  test("narrowing the badges to PSP keeps the stored URL, which reopens blank (R-029)", async ({
    page,
    request,
  }) => {
    const [before] = (await listWebhooks(request)).filter(
      (r) => r.label === LABEL,
    );
    await loginAs(page, "admin");
    await page.goto("/admin/report-webhooks");

    await page.getByRole("button", { name: `Edit ${LABEL}` }).click();
    const dialog = page.getByRole("dialog", { name: "Edit webhook" });
    await expect(dialog.getByLabel("Webhook URL")).toHaveValue("");
    await expect(dialog.getByText(before.webhook_url_masked)).toBeVisible();
    await expect(dialog.getByRole("checkbox", { name: "BASE" })).toBeChecked();
    await expect(dialog.getByRole("checkbox", { name: "PSP" })).toBeChecked();
    await dialog.getByRole("checkbox", { name: "BASE" }).uncheck();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    const row = page.locator(
      `[data-slot="report-webhook-row"][data-webhook-id="${before.id}"]`,
    );
    await expect(row).toHaveAttribute("data-badges", "borderless_psp");
    await expect(row.locator('[data-slot="report-webhook-badge"]')).toHaveText([
      "PSP",
    ]);
    const [after] = (await listWebhooks(request)).filter(
      (r) => r.id === before.id,
    );
    expect(after.badges).toEqual(["borderless_psp"]);
    expect(after.webhook_url_masked).toBe(before.webhook_url_masked);
    expect(await page.content()).not.toContain(TOKEN);
  });

  test("an admin removes the webhook", async ({ page, request }) => {
    const [row] = (await listWebhooks(request)).filter(
      (r) => r.label === LABEL,
    );
    await loginAs(page, "admin");
    await page.goto("/admin/report-webhooks");

    await page.getByRole("button", { name: `Delete ${LABEL}` }).click();
    const confirm = page.getByRole("alertdialog");
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(
      page.locator(
        `[data-slot="report-webhook-row"][data-webhook-id="${row.id}"]`,
      ),
    ).toHaveCount(0);
    expect(
      (await listWebhooks(request)).some((r) => r.id === row.id),
    ).toBeFalsy();
  });

  test("a non-admin is refused the report webhooks (R-029)", async ({
    request,
  }) => {
    const response = await request.get(apiUrl("/admin/report-webhooks"), {
      headers: { Cookie: authCookieHeader("user") },
    });
    expect(response.status()).toBe(403);
  });
});
