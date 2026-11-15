import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
} from "@playwright/test";

import { SEEDED_USERS, apiUrl, loginAs } from "./support/auth";
import {
  PHONE,
  expectNoSidewaysScroll,
  expectPhoneTargets,
  undersizedControls,
} from "./support/phone";

/**
 * Profile › MCP and the MCP server (PRD 0023, ADR-0028) against the real
 * stack: the built API and web, Postgres, Redis. A token is created in the
 * web's MCP tab, then used on `POST <api>/mcp` exactly as an AI app would:
 * its scope decides the tools it lists and runs, and once revoked (in
 * Devices, in the MCP tab, on the phone) its next call is refused.
 *
 * The tokens are real credentials minted at run time: each lives in one
 * local variable of its test and nowhere else. No trace, no screenshot, no
 * video, no failure page snapshot (`PLAYWRIGHT_NO_COPY_PROMPT`), and no
 * assertion ever compares against a token (a failure message would print
 * it): the checks are booleans. The dialog that shows a token is closed
 * before anything else is asserted.
 *
 * Shared state: serial; e2e-user's web session is never revoked and "Sign
 * out all other devices" is never confirmed. The spec revokes the three
 * tokens it creates, and only those (each name carries this run's mark), so
 * no other spec's active-device counts move.
 */

test.describe.configure({ mode: "serial" });
test.use({ trace: "off", screenshot: "off", video: "off" });

const RUN = Date.now().toString(36);
const READ_ONLY = `e2e-mcp-read-${RUN}`;
const READ_WRITE = `e2e-mcp-write-${RUN}`;
const PHONE_TOKEN = `e2e-mcp-phone-${RUN}`;

/** `applika_mcp_` and 43 URL-safe characters (the backend's shape). */
const TOKEN_SHAPE = /^applika_mcp_[A-Za-z0-9_-]{43}$/;

const WRITE_TOOLS = [
  "create_application",
  "edit_application",
  "finalize_application",
  "reopen_application",
  "add_timeline_event",
  "edit_timeline_event",
];
const DELETE_TOOLS = ["delete_timeline_event"];

let noCopyPrompt: string | undefined;

test.beforeAll(() => {
  // The failure page snapshot (error-context.md) would hold a shown token.
  noCopyPrompt = process.env.PLAYWRIGHT_NO_COPY_PROMPT;
  process.env.PLAYWRIGHT_NO_COPY_PROMPT = "1";
});

test.afterAll(() => {
  if (noCopyPrompt === undefined) delete process.env.PLAYWRIGHT_NO_COPY_PROMPT;
  else process.env.PLAYWRIGHT_NO_COPY_PROMPT = noCopyPrompt;
});

let rpcId = 0;

/** One JSON-RPC call to the hosted MCP server, as an AI app sends it. */
async function mcp(
  request: APIRequestContext,
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<APIResponse> {
  rpcId += 1;
  try {
    return await request.post(apiUrl("/mcp"), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json, text/event-stream",
        "Content-Type": "application/json",
      },
      data: {
        jsonrpc: "2.0",
        id: rpcId,
        method,
        ...(params ? { params } : {}),
      },
    });
  } catch {
    // Playwright's call log lists the request's headers, the bearer among
    // them: a call that gets no answer fails with these words only.
    throw new Error(`POST /mcp ${method} got no answer`);
  }
}

async function toolNames(
  request: APIRequestContext,
  token: string,
): Promise<string[]> {
  const response = await mcp(request, token, "tools/list");
  expect(response.status()).toBe(200);
  const body = (await response.json()) as {
    result: { tools: { name: string }[] };
  };
  return body.result.tools.map((tool) => tool.name);
}

async function expectRefused(request: APIRequestContext, token: string) {
  const refused = await mcp(request, token, "tools/list");
  expect(refused.status()).toBe(401);
  expect(await refused.json()).toEqual({
    detail:
      "MCP token invalid, revoked or expired. Create a new one in Applika: Profile > MCP.",
    code: "AUTH-1051",
  });
}

async function openMcpTab(page: Page) {
  await page.goto("/profile?tab=mcp");
  await expect(
    page.getByRole("tab", { name: "MCP", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(page.locator('[data-slot="mcp-tab"]')).toHaveAttribute(
    "data-state",
    "ready",
  );
}

/**
 * Creates a token in the open desktop dialog and returns it, having read the
 * shown configurations; the dialog is closed (Done) before it returns.
 */
async function createOnDesktop(
  page: Page,
  name: string,
  scope: "Read only" | "Read and write" | "Full access",
): Promise<string> {
  await page.locator('[data-slot="mcp-new-token"]').click();
  const dialog = page.locator('[data-slot="mcp-dialog"][data-step="create"]');
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("radio", { name: "Read and write", exact: true }),
  ).toBeChecked();
  const nameField = dialog.getByRole("textbox", { name: "Name", exact: true });
  await expect(nameField).toHaveValue("MCP connection");
  await nameField.fill(name);
  await dialog.getByRole("radio", { name: scope, exact: true }).check();
  await dialog.locator('[data-action="create-mcp-token"]').click();

  const result = page.locator('[data-slot="mcp-dialog"][data-step="result"]');
  await expect(result).toBeVisible();
  const token =
    (await result.locator('[data-slot="mcp-token-value"]').textContent()) ?? "";
  // Booleans only from here to Done: a failure message never prints a token.
  const shaped = TOKEN_SHAPE.test(token);
  const configs: Record<string, boolean> = {};
  for (const client of [
    "claude_code",
    "claude_desktop",
    "cursor",
    "vscode",
    "codex",
    "gemini",
    "other",
  ]) {
    await result
      .locator(`[data-slot="mcp-clients"] [data-client="${client}"]`)
      .click();
    const text =
      (await result
        .locator(`[data-slot="mcp-config"][data-client="${client}"]`)
        .textContent()) ?? "";
    configs[client] =
      text.includes(`Bearer ${token}`) && text.includes(apiUrl("/mcp"));
  }
  await result.locator('[data-action="mcp-token-done"]').click();
  await expect(page.locator('[data-slot="mcp-dialog"]')).toHaveCount(0);

  expect(shaped, "the token has the applika_mcp_ shape").toBe(true);
  expect(configs, "every config holds the token and the address").toEqual({
    claude_code: true,
    claude_desktop: true,
    cursor: true,
    vscode: true,
    codex: true,
    gemini: true,
    other: true,
  });
  // Shown once: gone from the page once the dialog closed.
  const html = await page.content();
  expect(html.includes(token), "the token left the page").toBe(false);
  return token;
}

test.describe("Profile › MCP and the MCP server", () => {
  test("a Read only token: created in the MCP tab, no write tool, whoami answers, a write is refused AUTH-1052, revoked in Devices it gets 401", async ({
    page,
    request,
  }) => {
    await loginAs(page, "user");
    await openMcpTab(page);
    // Profile | MCP | Devices, MCP between the two (the owner's order).
    await expect(page.getByRole("tab")).toHaveText([
      "Profile",
      "MCP",
      "Devices",
    ]);
    await expect(page.locator('[data-slot="mcp-address"]')).toContainText(
      apiUrl("/mcp"),
    );

    const token = await createOnDesktop(page, READ_ONLY, "Read only");

    // The new connection is listed with its name and scope.
    const row = page
      .locator('[data-slot="mcp-row"]')
      .filter({ hasText: READ_ONLY });
    await expect(row).toHaveCount(1);
    await expect(row.locator('[data-slot="mcp-scope"]')).toHaveText(
      "Read only",
    );

    // tools/list: the read tools, no write and no delete tool.
    const tools = await toolNames(request, token);
    expect(tools).toContain("whoami");
    expect(tools).toContain("list_applications");
    for (const name of [...WRITE_TOOLS, ...DELETE_TOOLS]) {
      expect(tools, name).not.toContain(name);
    }

    // whoami acts as its user.
    const who = await mcp(request, token, "tools/call", {
      name: "whoami",
      arguments: {},
    });
    expect(who.status()).toBe(200);
    const whoAnswer = (await who.json()).result as {
      isError: boolean;
      structuredContent: { username: string };
    };
    expect(whoAnswer.isError).toBe(false);
    expect(whoAnswer.structuredContent.username).toBe(
      SEEDED_USERS.user.username,
    );

    // A tool outside the scope: refused with its numbered code.
    const write = await mcp(request, token, "tools/call", {
      name: "create_application",
      arguments: {},
    });
    expect(write.status()).toBe(200);
    const writeAnswer = (await write.json()).result as {
      isError: boolean;
      structuredContent: { code: string; detail: string };
    };
    expect(writeAnswer.isError).toBe(true);
    expect(writeAnswer.structuredContent.code).toBe("AUTH-1052");

    // An MCP token is no web credential: the REST API refuses it.
    const rest = await request.get(apiUrl("/users/me"), {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(rest.status()).toBe(401);

    // Devices lists it with its scope; Revoke there ends it.
    await page.getByRole("tab", { name: "Devices", exact: true }).click();
    await expect(page.locator('[data-slot="devices-tab"]')).toHaveAttribute(
      "data-state",
      "ready",
    );
    const device = page
      .locator('[data-slot="active-devices"] [data-slot="device-row"]')
      .filter({
        has: page.getByRole("heading", {
          level: 3,
          name: READ_ONLY,
          exact: true,
        }),
      });
    await expect(device).toHaveCount(1);
    await expect(device.getByText("MCP token", { exact: true })).toBeVisible();
    await expect(device.locator('[data-slot="mcp-scope"]')).toHaveText(
      "Read only",
    );
    await expect(device.getByText("AI app (MCP)")).toBeVisible();
    await expect(
      device.getByRole("term").filter({ hasText: "Ends if unused" }),
    ).toBeVisible();
    await device.getByRole("button", { name: "Revoke", exact: true }).click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(
      "Apps that use this token lose access on their next call.",
    );
    await confirm
      .getByRole("button", { name: "Revoke access", exact: true })
      .click();
    await expect(device).toHaveCount(0);

    await expectRefused(request, token);
    // This device is still signed in.
    await expect(
      page.locator('[data-slot="active-devices"] [data-current]'),
    ).toHaveCount(1);
  });

  test("a Read and write token lists the write tools, no delete tool, and Revoke in the MCP tab ends it", async ({
    page,
    request,
  }) => {
    await loginAs(page, "user");
    await openMcpTab(page);

    const token = await createOnDesktop(page, READ_WRITE, "Read and write");

    const tools = await toolNames(request, token);
    for (const name of WRITE_TOOLS) expect(tools, name).toContain(name);
    for (const name of DELETE_TOOLS) expect(tools, name).not.toContain(name);

    const row = page
      .locator('[data-slot="mcp-row"]')
      .filter({ hasText: READ_WRITE });
    await expect(row.locator('[data-slot="mcp-scope"]')).toHaveText(
      "Read and write",
    );
    // The call above is its last use: the row says so, with its IP.
    await page.reload();
    await expect(page.locator('[data-slot="mcp-tab"]')).toHaveAttribute(
      "data-state",
      "ready",
    );
    await expect(row.getByText("Never", { exact: true })).toHaveCount(0);
    await expect(row.getByText("Not recorded", { exact: true })).toHaveCount(0);

    await row
      .getByRole("button", { name: `Revoke the token ${READ_WRITE}` })
      .click();
    const confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(`Revoke the token ${READ_WRITE}?`);
    await confirm
      .getByRole("button", { name: "Revoke token", exact: true })
      .click();
    await expect(row).toHaveCount(0);

    await expectRefused(request, token);
  });
});

test.describe("Profile › MCP and /mcp on a phone (390×844)", () => {
  test.use({ viewport: PHONE });

  test("/mcp is the phone page: 44px targets, no sideways scroll, light and dark", async ({
    page,
  }) => {
    await page.goto("/mcp");
    const phone = page.locator('[data-slot="mcp-phone"]');
    await expect(phone).toBeVisible();
    await expect(page.locator('[data-slot="mcp-desktop"]')).toBeHidden();
    await expectPhoneTargets(page, 9);
    await expectNoSidewaysScroll(page);

    const html = page.locator("html");
    await expect(html).toHaveClass(/\bdark\b/);
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(html).not.toHaveClass(/\bdark\b/);
    await expect(
      phone.getByRole("link", { name: "Create a token", exact: true }),
    ).toBeVisible();
    await expectNoSidewaysScroll(page);
    await page
      .getByRole("button", { name: "Toggle theme", exact: true })
      .click();
    await expect(html).toHaveClass(/\bdark\b/);
  });

  test("the MCP tab: create in a sheet, the token once with the configs, revoke behind a sheet, refused after", async ({
    page,
    request,
  }) => {
    await loginAs(page, "user");
    await page.goto("/profile?tab=mcp");
    const screen = page.locator('[data-slot="phone-mcp"]');
    await expect(screen).toBeVisible();
    await expect(
      page
        .getByRole("navigation", { name: "Profile sections" })
        .getByRole("link", { name: "MCP", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    // The earlier tokens are revoked: McpEmpty, whole.
    const empty = screen.locator('[data-slot="mcp-empty"]');
    await expect(empty).toBeVisible();
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);

    await empty.locator('[data-slot="mcp-empty-create"]').click();
    const sheet = page.getByRole("dialog", { name: "New MCP token" });
    await expect(sheet).toBeVisible();
    await expect(
      sheet.getByRole("radio", { name: "Read and write", exact: true }),
    ).toBeChecked();
    await sheet
      .getByRole("textbox", { name: "Name", exact: true })
      .fill(PHONE_TOKEN);
    await sheet
      .getByRole("radio", { name: "Full access", exact: true })
      .check();
    await expectPhoneTargets(page, 6);
    await sheet.locator('[data-action="create-mcp-token"]').click();

    const result = page.getByRole("dialog", { name: "Your token is ready" });
    await expect(result).toBeVisible();
    const token =
      (await result.locator('[data-slot="mcp-token-value"]').textContent()) ??
      "";
    const shaped = TOKEN_SHAPE.test(token);
    await result
      .locator('[data-slot="mcp-clients"] [data-client="cursor"]')
      .click();
    const cursor =
      (await result
        .locator('[data-slot="mcp-config"][data-client="cursor"]')
        .textContent()) ?? "";
    const filled = cursor.includes(`Bearer ${token}`);
    // The result sheet keeps 44px targets and no sideways scroll (the chips
    // and the configuration scroll inside their own rows). Measured now,
    // asserted once the token is off screen (the lists hold control names).
    const targets = await undersizedControls(page);
    const sideways = await page.evaluate(() => {
      const doc = document.documentElement;
      return doc.scrollWidth - doc.clientWidth;
    });
    await result.locator('[data-action="mcp-token-done"]').click();
    await expect(result).toBeHidden();
    expect(shaped, "the token has the applika_mcp_ shape").toBe(true);
    expect(filled, "Cursor's config holds the token").toBe(true);
    expect(targets.count, "controls measured").toBeGreaterThanOrEqual(10);
    expect(targets.small, "controls under 44×44").toEqual([]);
    expect(sideways, "sideways scroll in px").toBe(0);

    // Full access: the delete tool too.
    const tools = await toolNames(request, token);
    for (const name of [...WRITE_TOOLS, ...DELETE_TOOLS]) {
      expect(tools, name).toContain(name);
    }

    // Main, with the new connection: Revoke behind its sheet.
    const card = screen
      .locator('li[data-slot="mcp-row"]')
      .filter({ hasText: PHONE_TOKEN });
    await expect(card).toHaveCount(1);
    await expect(card.locator('[data-slot="mcp-scope"]')).toHaveText(
      "Full access",
    );
    await expectPhoneTargets(page, 6);
    await expectNoSidewaysScroll(page);
    await card
      .getByRole("button", { name: `Revoke the token ${PHONE_TOKEN}` })
      .click();
    const confirm = page.getByRole("alertdialog", {
      name: `Revoke the token ${PHONE_TOKEN}?`,
    });
    await confirm.locator('[data-action="confirm-revoke-mcp"]').click();
    await expect(card).toHaveCount(0);
    await expect(empty).toBeVisible();

    await expectRefused(request, token);
  });
});
