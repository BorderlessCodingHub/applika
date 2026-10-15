import { expect, test, type Locator, type Page } from "@playwright/test";

import { apiUrl, cliBearerHeader, loginAs } from "./support/auth";

/**
 * Devices and CLI device sign-in (KODI-058, PRD 0014, ADR-0019) against the
 * real stack: the built API and web, Postgres, Redis.
 *
 * Serial, and careful with shared state: the only session this spec ends is
 * e2e-user's seeded CLI session ("e2e-cli"); e2e-user's web session, which
 * every later spec signs in with, is never revoked, and "Sign out all other
 * devices" is never confirmed here. The device grant in test 2 adds one more
 * CLI session for e2e-user, which nothing else counts.
 */

const SEEDED_CLI_DEVICE = "e2e-cli";
const GRANTED_DEVICE = "e2e-device-grant";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

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

interface DeviceCode {
  device_code: string;
  user_code: string;
  verification_uri_complete: string;
  interval: number;
}

test.describe.configure({ mode: "serial" });

test.describe("devices", () => {
  test("Devices tab lists this device and the seeded CLI; Revoke refuses the CLI's next request", async ({
    page,
    request,
  }) => {
    // Control: the seeded CLI session works before the revoke.
    const before = await request.get(apiUrl("/users/me"), {
      headers: { Authorization: cliBearerHeader() },
    });
    expect(before.status()).toBe(200);

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

    const cliRow = active
      .locator('[data-slot="device-row"]')
      .filter({ has: deviceName(page, SEEDED_CLI_DEVICE) });
    await expect(cliRow).toHaveCount(1);
    await expect(cliRow).toHaveAttribute("data-status", "active");
    await expect(cliRow.getByText("Approved with a device code")).toBeVisible();
    for (const term of [
      "Client",
      "How it signed in",
      "IP address",
      "Granted",
      "Last used",
      "Expires",
    ]) {
      await expect(
        cliRow.getByRole("term").filter({ hasText: term }).first(),
      ).toBeVisible();
    }

    // Cancel first: nothing happens.
    await cliRow.getByRole("button", { name: "Revoke", exact: true }).click();
    let dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText(
      `Revoke access for ${SEEDED_CLI_DEVICE}?`,
    );
    await dialog.getByRole("button", { name: "Cancel" }).click();
    await expect(dialog).toBeHidden();
    await expect(cliRow).toHaveAttribute("data-status", "active");

    await cliRow.getByRole("button", { name: "Revoke", exact: true }).click();
    dialog = page.getByRole("alertdialog");
    await dialog
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();

    // The row moves to Ended, saying how it ended.
    const ended = page.locator('[data-slot="ended-devices"]');
    const endedRow = ended
      .locator('[data-slot="device-row"]')
      .filter({ has: deviceName(page, SEEDED_CLI_DEVICE) });
    await expect(endedRow).toHaveAttribute("data-status", "revoked");
    await expect(endedRow.locator('[data-slot="device-status"]')).toHaveText(
      "Revoked",
    );

    // AC1: the revoked CLI is refused on its next request.
    const after = await request.get(apiUrl("/users/me"), {
      headers: { Authorization: cliBearerHeader() },
    });
    expect(after.status()).toBe(401);

    // This device is still signed in.
    await page.reload();
    await page.getByRole("tab", { name: "Devices", exact: true }).click();
    await expect(
      page.locator('[data-slot="active-devices"] [data-current]'),
    ).toHaveCount(1);
  });

  test("a device code approved on /device gets its own session and is listed", async ({
    page,
    request,
  }) => {
    const codeResponse = await request.post(apiUrl("/auth/device/code"), {
      data: { device_name: GRANTED_DEVICE },
    });
    expect(codeResponse.status()).toBe(200);
    const code = (await codeResponse.json()) as DeviceCode;
    expect(code.user_code).toMatch(/^[A-Z]{4}-[A-Z]{4}$/);

    // Before approval the CLI's poll is pending.
    const pending = await request.post(apiUrl("/auth/token"), {
      data: { grant_type: DEVICE_GRANT, device_code: code.device_code },
    });
    expect(pending.status()).toBe(400);
    expect((await pending.json()).error).toBe("authorization_pending");

    await loginAs(page, "user");
    await page.goto(code.verification_uri_complete);
    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in a device" }),
    ).toBeVisible();
    await expect(page.getByLabel("Device code")).toHaveValue(code.user_code);
    await page.getByRole("button", { name: "Continue" }).click();

    const card = page.locator('[data-slot="device-request"]');
    await expect(
      card.getByRole("heading", { name: "A device wants to sign in" }),
    ).toBeVisible();
    await expect(card.locator('[data-slot="device-request-name"]')).toHaveText(
      GRANTED_DEVICE,
    );
    await expect(card.locator('[data-slot="device-request-code"]')).toHaveText(
      code.user_code,
    );
    await expect(card.getByText("Requested")).toBeVisible();
    await expect(card.getByText("IP address")).toBeVisible();
    await expect(
      card.getByText("Only approve if you started this sign-in yourself"),
    ).toBeVisible();
    await card.getByRole("button", { name: "Approve", exact: true }).click();

    await expect(
      page.getByRole("heading", {
        name: "Device signed in. You can return to your terminal.",
      }),
    ).toBeVisible();

    // Wait out the poll interval so the grant is not answered slow_down.
    await page.waitForTimeout(code.interval * 1000);
    const grant = await request.post(apiUrl("/auth/token"), {
      data: { grant_type: DEVICE_GRANT, device_code: code.device_code },
    });
    expect(grant.status()).toBe(200);
    const tokens = (await grant.json()) as {
      access_token: string;
      token_type: string;
      refresh_token: string;
    };
    expect(tokens.token_type).toBe("Bearer");
    expect(tokens.refresh_token).toBeTruthy();

    const me = await request.get(apiUrl("/users/me"), {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    expect(me.status()).toBe(200);

    // A code works once: approving again on the web is refused in words.
    await page.goto(code.verification_uri_complete);
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(
      page.locator('[data-slot="device-code-error"]'),
    ).not.toBeEmpty();

    await page.goto("/profile?tab=devices");
    const granted = page
      .locator('[data-slot="active-devices"]')
      .locator('[data-slot="device-row"]')
      .filter({ has: deviceName(page, GRANTED_DEVICE) });
    await expect(granted).toHaveAttribute("data-status", "active");
    await expect(
      granted.getByText("Approved with a device code"),
    ).toBeVisible();
  });

  test("a signed-out /device?code= returns to /device with the code after sign-in", async ({
    page,
    request,
  }) => {
    const codeResponse = await request.post(apiUrl("/auth/device/code"), {
      data: { device_name: "e2e-return-to" },
    });
    const code = (await codeResponse.json()) as DeviceCode;

    await page.goto(`/device?code=${code.user_code}`);
    await page.waitForURL("**/login");

    await loginAs(page, "user");
    await page.goto("/dashboard");

    await page.waitForURL(
      (url) =>
        url.pathname.replace(/\/$/, "") === "/device" &&
        url.searchParams.get("code") === code.user_code,
    );
    await expect(page.getByLabel("Device code")).toHaveValue(code.user_code);

    // Consumed once: the dashboard stays the dashboard afterwards.
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/dashboard");

    // Tidy: deny the pending code.
    await page.goto(`/device?code=${code.user_code}`);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("button", { name: "Deny", exact: true }).click();
    await expect(
      page.getByRole("heading", {
        name: "Sign-in denied. The device was not signed in.",
      }),
    ).toBeVisible();
  });

  test("/cli/code shows code#state to paste into the terminal, signed out", async ({
    page,
  }) => {
    await page.goto("/cli/code?code=e2e-code&state=e2e-state");

    await expect(
      page.getByRole("heading", { level: 1, name: "Sign in to applika-cli" }),
    ).toBeVisible();
    await expect(
      page.getByText("Paste this code into your terminal"),
    ).toBeVisible();
    await expect(page.locator('[data-slot="cli-code-value"]')).toHaveText(
      "e2e-code#e2e-state",
    );
    await expect(page.getByRole("button", { name: "Copy" })).toBeVisible();
    expect(new URL(page.url()).pathname.replace(/\/$/, "")).toBe("/cli/code");
  });
});
