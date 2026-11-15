import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  SEEDED_USERS,
  apiUrl,
  authCookieHeader,
  loginAs,
  mcpBearerHeader,
  seededMcpToken,
} from "./support/auth";
import { MCP_TOKEN_REFUSED, mcpCall } from "./support/mcp";

/**
 * Devices (PRD 0014, ADR-0028) against the real stack: the built API and
 * web, Postgres, Redis. The other device is an MCP connection, the only
 * client besides the browser since the CLI was retired.
 *
 * Serial, and careful with shared state: the sessions this spec ends are
 * e2e-user's seeded MCP session ("e2e-mcp") and the one MCP token test 2
 * creates (its name carries this run's mark); e2e-user's web session, which
 * every later spec signs in with, is the current one and is never revoked.
 *
 * Both tokens are real credentials: no trace, no screenshot, no video, no
 * failure page snapshot (`PLAYWRIGHT_NO_COPY_PROMPT`), and no assertion
 * compares against a token (the checks are statuses and booleans).
 */

test.describe.configure({ mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

const SEEDED_MCP_DEVICE = "e2e-mcp";
const OTHER_DEVICE = `e2e-devices-other-${Date.now().toString(36)}`;

let noCopyPrompt: string | undefined;

test.beforeAll(() => {
  noCopyPrompt = process.env.PLAYWRIGHT_NO_COPY_PROMPT;
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
});

test.afterAll(() => {
  if (noCopyPrompt === undefined) delete process.env.PLAYWRIGHT_NO_COPY_PROMPT;
  else process.env.PLAYWRIGHT_NO_COPY_PROMPT = noCopyPrompt;
});

function deviceName(page: Page, name: string): Locator {
  return page.getByRole("heading", { level: 3, name, exact: true });
}

async function openDevices(page: Page) {
  await page.goto("/profile");
  await page.getByRole("tab", { name: "Devices", exact: true }).click();
  await expect(page.locator('[data-slot="devices-tab"]')).toHaveAttribute(
    "data-state",
    "ready",
  );
}

/** "Ended (last 30 days)" starts closed; its rows mount once it is open. */
async function openEnded(page: Page) {
  const toggle = page.getByRole("button", {
    name: "Ended (last 30 days)",
    exact: true,
  });
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test.describe("devices", () => {
  test("Devices tab lists this device and the seeded MCP connection; Revoke refuses its next call", async ({
    page,
    request,
  }) => {
    // Control: the seeded MCP session answers before the revoke, as its user.
    const before = await mcpCall(request, seededMcpToken(), "tools/call", {
      name: "whoami",
      arguments: {},
    });
    expect(before.status()).toBe(200);
    const who = (await before.json()).result as {
      isError: boolean;
      structuredContent: { username: string };
    };
    expect(who.isError).toBe(false);
    expect(who.structuredContent.username).toBe(SEEDED_USERS.user.username);

    // The cookie is the only REST credential: the token opens no REST route.
    const rest = await request.get(apiUrl("/users/me"), {
      headers: { Authorization: mcpBearerHeader() },
    });
    expect(rest.status()).toBe(401);

    await loginAs(page, "user");
    await openDevices(page);

    const active = page.locator('[data-slot="active-devices"]');
    const current = active.locator('[data-slot="device-row"][data-current]');
    await expect(current).toHaveCount(1);
    await expect(current.locator('[data-slot="this-device"]')).toHaveText(
      "This device",
    );
    await expect(current.locator('[data-slot="device-status"]')).toHaveText(
      "Active",
    );

    const mcpRow = active
      .locator('[data-slot="device-row"]')
      .filter({ has: deviceName(page, SEEDED_MCP_DEVICE) });
    await expect(mcpRow).toHaveCount(1);
    await expect(mcpRow).toHaveAttribute("data-status", "active");
    await expect(mcpRow.getByText("MCP token", { exact: true })).toBeVisible();
    await expect(mcpRow.getByText("AI app (MCP)")).toBeVisible();
    await expect(mcpRow.locator('[data-slot="mcp-scope"]')).toHaveText(
      "Read only",
    );
    for (const term of [
      "Client",
      "How it signed in",
      "IP address",
      "Granted",
      "Last used",
      "Ends if unused",
    ]) {
      await expect(
        mcpRow.getByRole("term").filter({ hasText: term }).first(),
      ).toBeVisible();
    }

    // Cancel first: nothing happens.
    await mcpRow.getByRole("button", { name: "Revoke", exact: true }).click();
    let dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      `Revoke access for ${SEEDED_MCP_DEVICE}?`,
    );
    await expect(dialog).toContainText(
      "Apps that use this token lose access on their next call.",
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(mcpRow).toHaveAttribute("data-status", "active");

    await mcpRow.getByRole("button", { name: "Revoke", exact: true }).click();
    dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();

    // The row moves to Ended, saying how it ended.
    await openEnded(page);
    const ended = page.locator('[data-slot="ended-devices"]');
    const endedRow = ended
      .locator('[data-slot="device-row"]')
      .filter({ has: deviceName(page, SEEDED_MCP_DEVICE) });
    await expect(endedRow).toHaveAttribute("data-status", "revoked");
    await expect(endedRow.locator('[data-slot="device-status"]')).toHaveText(
      "Revoked",
    );

    // The revoked MCP connection is refused on its next call.
    const after = await mcpCall(request, seededMcpToken(), "tools/list");
    expect(after.status()).toBe(401);
    expect(await after.json()).toEqual(MCP_TOKEN_REFUSED);

    // This device is still signed in.
    await page.reload();
    await page.getByRole("tab", { name: "Devices", exact: true }).click();
    await expect(
      page.locator('[data-slot="active-devices"] [data-current]'),
    ).toHaveCount(1);
  });

  test("Sign out all other devices ends an MCP connection and keeps this device", async ({
    page,
    request,
  }) => {
    // A second device for e2e-user: an MCP token created with the page's
    // own cookie, exactly as the MCP tab creates one.
    const created = await request.post(apiUrl("/users/me/mcp-tokens"), {
      headers: {
        Cookie: authCookieHeader("user"),
        "Content-Type": "application/json",
      },
      data: { name: OTHER_DEVICE, scope: ["read"] },
    });
    expect(created.status()).toBe(201);
    const token = ((await created.json()) as { token: string }).token;
    const control = await mcpCall(request, token, "tools/list");
    expect(control.status()).toBe(200);

    // Safe on the shared database: e2e-user's seeded web session is the
    // current one and stays; "e2e-mcp" is already revoked (test 1).
    await loginAs(page, "user");
    await openDevices(page);
    const other = page
      .locator('[data-slot="active-devices"] [data-slot="device-row"]')
      .filter({ has: deviceName(page, OTHER_DEVICE) });
    await expect(other).toHaveAttribute("data-status", "active");

    await page.locator('[data-slot="sign-out-others"]').click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(/Sign out \d+ other devices?\?/);
    await expect(dialog).toContainText("MCP connections stop working.");
    await dialog
      .getByRole("button", { name: "Sign out other devices", exact: true })
      .click();

    await openEnded(page);
    const ended = page
      .locator('[data-slot="ended-devices"] [data-slot="device-row"]')
      .filter({ has: deviceName(page, OTHER_DEVICE) });
    await expect(ended).toHaveAttribute("data-status", "revoked");
    await expect(
      page.locator('[data-slot="active-devices"] [data-slot="device-row"]'),
    ).toHaveCount(1);
    await expect(
      page.locator('[data-slot="active-devices"] [data-current]'),
    ).toHaveCount(1);
    await expect(page.locator('[data-slot="sign-out-others"]')).toHaveAttribute(
      "aria-disabled",
      "true",
    );

    const after = await mcpCall(request, token, "tools/list");
    expect(after.status()).toBe(401);
    expect(await after.json()).toEqual(MCP_TOKEN_REFUSED);
  });
});
