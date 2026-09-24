import { expect, test } from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * KODI-022 (plan 0009 · Frontend) — the profile "Connected accounts" card,
 * driven against the REAL backend (no mocking, `.claude/rules/quality-gates.md`).
 *
 * Serial on purpose: the last test disconnects the seeded `e2e-discord` user
 * for real, so an earlier test asserting the LINKED state must run before it.
 * `scripts/e2e.sh` re-seeds `discord_id` on every run, so a rerun of this
 * suite always starts from `e2e-discord` linked again.
 *
 * Real discord.com is NEVER reached: `page.route("**://discord.com/**", ...)`
 * aborts the navigation before it leaves the browser and we assert on the
 * ATTEMPTED url instead of following it.
 *
 * Name/text traps (`.claude/agent-memory/ui-designer/
 * project-accessible-name-collisions.md`): "Connect Discord" is a substring
 * of "Disconnect Discord", and the card's "Discord connected" badge is a
 * substring of the linked notice's longer sentence — every locator below uses
 * `exact: true` or scopes to `[data-provider="discord"]`.
 */

test.describe.configure({ mode: "serial" });

test.describe("KODI-022 connected accounts — Discord", () => {
  test("an unlinked user sees Connect Discord", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/profile");

    await expect(
      page.getByRole("heading", { name: "Connected accounts" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect Discord", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Disconnect Discord", exact: true }),
    ).toHaveCount(0);
  });

  test("Connect asks Discord only for identify+guilds+guilds.members.read, never reaching discord.com", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/profile");

    let attemptedUrl: string | null = null;
    await page.route("**://discord.com/**", async (route) => {
      attemptedUrl = route.request().url();
      await route.abort();
    });

    await page
      .getByRole("button", { name: "Connect Discord", exact: true })
      .click();

    await expect
      .poll(() => attemptedUrl, {
        message: "expected a navigation attempt to discord.com",
      })
      .not.toBeNull();

    const url = new URL(attemptedUrl as unknown as string);
    expect(url.hostname).toBe("discord.com");
    expect(url.pathname).toBe("/oauth2/authorize");
    // AC11 (frontend proof, KODI-024): identity, the servers the user is
    // in, and the user's roles in those servers - and nothing more.
    expect(url.searchParams.get("scope")).toBe(
      "identify guilds guilds.members.read",
    );
    expect(url.searchParams.get("state")).toBeTruthy();
  });

  test("a conflict outcome shows the conflict notice, clears the URL and keeps the card unlinked", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/profile?account=discord&status=conflict");

    await expect(
      page.getByText(
        "This Discord account is linked to another Applika account",
        { exact: true },
      ),
    ).toBeVisible();

    await expect(page).toHaveURL(/\/profile$/);

    // AC4 (frontend proof): the card stays unlinked — Connect is still offered.
    await expect(
      page.getByRole("button", { name: "Connect Discord", exact: true }),
    ).toBeVisible();
  });

  test("a linked user sees Discord connected and no Connect action", async ({
    page,
  }) => {
    await loginAs(page, "discord");
    await page.goto("/profile");

    const discordRow = page.locator('li[data-provider="discord"]');
    await expect(
      discordRow.getByText("Discord connected", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Connect Discord", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Disconnect Discord", exact: true }),
    ).toBeVisible();
  });

  test("LAST: Disconnect clears the link — Connect reappears and the API reports discord_linked: false", async ({
    page,
  }) => {
    await loginAs(page, "discord");
    await page.goto("/profile");

    await page
      .getByRole("button", { name: "Disconnect Discord", exact: true })
      .click();
    await page.getByRole("button", { name: "Disconnect", exact: true }).click();

    // AC6 (frontend proof): after Disconnect, Connect Discord is offered again.
    await expect(
      page.getByRole("button", { name: "Connect Discord", exact: true }),
    ).toBeVisible();
    await expect(
      page
        .locator('li[data-provider="discord"]')
        .getByText("Discord connected", { exact: true }),
    ).toHaveCount(0);

    const res = await page.request.get(apiUrl("/users/me"), {
      headers: { Cookie: authCookieHeader("discord") },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { discord_linked: boolean };
    expect(body.discord_linked).toBe(false);
  });
});
