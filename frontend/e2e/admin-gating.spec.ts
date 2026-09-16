import { expect, test } from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * Admin gating (KODI-001 / R-005).
 *
 * Two seeded identities, both real: `e2e-user` (`is_admin: false`) and
 * `e2e-admin` (`is_admin: true`). Gating is client-side (`AdminGuard`) because
 * the frontend is a static export — a signed-in non-admin is bounced with
 * `router.replace("/dashboard")`, NOT to `/login` and NOT to a 403 page.
 *
 * Assertions are on roles and visible text only, so the suite survives the
 * visual upgrade: the Admin nav item is asserted by its link role and name, not
 * by the styling that marks it out today.
 */

const ADMIN_PATHS = [
  "/admin",
  "/admin/companies",
  "/admin/supports",
  "/admin/users",
];

test.describe("a non-admin cannot reach the admin surface", () => {
  for (const path of ADMIN_PATHS) {
    test(`${path} bounces a signed-in non-admin to /dashboard`, async ({
      page,
    }) => {
      await loginAs(page, "user");
      await page.goto(path);

      await page.waitForURL("**/dashboard");
      await expect(
        page.getByRole("heading", { name: "Dashboard" }),
      ).toBeVisible();
    });
  }

  test("the Admin nav item is hidden from a non-admin", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Admin", exact: true }),
    ).toHaveCount(0);
  });

  test("the real API refuses admin data for a non-admin", async ({
    request,
  }) => {
    // The client-side guard is a UX affordance; this is the assertion that the
    // data is actually protected. Same real session cookie the browser carries.
    const response = await request.get(apiUrl("/admin/users"), {
      headers: { cookie: authCookieHeader("user") },
    });

    expect(response.status()).toBe(403);
  });
});

test.describe("an admin reaches the admin surface", () => {
  test("the Admin nav item is shown to an admin", async ({ page }) => {
    // The control: proves the assertions above detect a hidden item rather than
    // a nav that never renders the item for anyone.
    await loginAs(page, "admin");
    await page.goto("/dashboard");
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();

    // `.first()` rather than a bare locator: today the nav renders once, but a
    // later slice may mount the same items in a desktop rail AND a mobile
    // drawer, which would make a bare locator a strict-mode violation and break
    // a spec that is supposed to survive the repaint. "At least one visible
    // Admin link" is the property we actually care about. The negative
    // assertion above needs no such guard — `toHaveCount(0)` is exact.
    await expect(
      page.getByRole("link", { name: "Admin", exact: true }).first(),
    ).toBeVisible();
  });

  test("an admin lands on the admin console instead of being bounced", async ({
    page,
  }) => {
    await loginAs(page, "admin");
    await page.goto("/admin");

    await expect(
      page.getByRole("heading", { name: "Admin Console" }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe("/admin");
  });

  test("the real API serves admin data to an admin", async ({ request }) => {
    const response = await request.get(apiUrl("/admin/users"), {
      headers: { cookie: authCookieHeader("admin") },
    });

    expect(response.status()).toBe(200);
  });
});
