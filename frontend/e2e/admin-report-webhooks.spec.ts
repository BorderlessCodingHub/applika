import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * Admin report webhooks (ADR-0024) on the real stack: add one with a badge,
 * see only its masked address, change the badge without resending the URL,
 * and delete it as the spec's own cleanup. The backend never calls Discord on
 * save, so a valid-format fake address is enough; nothing reaches discord.com.
 */

test.describe.configure({ mode: "serial" });

const LABEL = "e2e report webhook";
const TOKEN = "e2eSecretTokenAbcdefghijklmnopqrstuv";
const WEBHOOK_URL = `https://discord.com/api/webhooks/123456789012345678/${TOKEN}`;

interface ReportWebhookRow {
  id: string;
  label: string | null;
  badge: string | null;
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
  test("an admin adds a webhook for BASE and sees only its masked address (AC18, AC19)", async ({
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
    await dialog.getByRole("radio", { name: "BASE" }).check();
    await dialog.getByLabel("Label").fill(LABEL);
    await dialog.getByRole("button", { name: "Save webhook" }).click();
    await expect(dialog).toBeHidden();

    const rows = (await listWebhooks(request)).filter((r) => r.label === LABEL);
    expect(rows).toHaveLength(1);
    expect(rows[0].badge).toBe("borderless_base");
    expect(rows[0].webhook_url_masked).toBe(
      "https://discord.com/api/webhooks/123456789012345678/…stuv",
    );

    const row = page.locator(
      `[data-slot="report-webhook-row"][data-webhook-id="${rows[0].id}"]`,
    );
    await expect(row).toHaveAttribute("data-badge", "borderless_base");
    await expect(row.locator('[data-slot="report-webhook-url"]')).toHaveText(
      rows[0].webhook_url_masked,
    );
    expect(await page.content()).not.toContain(TOKEN);
  });

  test("changing the badge keeps the stored URL, which reopens blank (AC18)", async ({
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
    await dialog.getByRole("radio", { name: "PSP" }).check();
    await dialog.getByRole("button", { name: "Save changes" }).click();
    await expect(dialog).toBeHidden();

    const row = page.locator(
      `[data-slot="report-webhook-row"][data-webhook-id="${before.id}"]`,
    );
    await expect(row).toHaveAttribute("data-badge", "borderless_psp");
    const [after] = (await listWebhooks(request)).filter(
      (r) => r.id === before.id,
    );
    expect(after.badge).toBe("borderless_psp");
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

  test("a non-admin is refused the report webhooks (AC18)", async ({
    request,
  }) => {
    const response = await request.get(apiUrl("/admin/report-webhooks"), {
      headers: { Cookie: authCookieHeader("user") },
    });
    expect(response.status()).toBe(403);
  });
});
