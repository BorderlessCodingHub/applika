import { expect, test } from "@playwright/test";

import { loginAs } from "./support/auth";

/**
 * Protected route guard (KODI-001 / R-005).
 *
 * Applika is a static export, so there is no server middleware: identity is
 * resolved on the CLIENT by `(protected)/layout.tsx`, which calls the real
 * `GET /api/users/me` and `router.replace("/login")` when that comes back
 * unauthenticated. The redirect therefore happens after hydration — every
 * assertion below waits for the URL rather than reading it straight after
 * `goto`.
 *
 * Nothing is mocked. The signed-out case is genuinely signed out (the real API
 * answers 401); the signed-in case carries the real seeded session cookie.
 */

/** Every signed-in page must be behind the guard, not just the dashboard. */
const PROTECTED_PATHS = [
  "/dashboard",
  "/applications",
  "/agenda",
  "/cycles",
  "/reports",
  "/profile",
  "/admin",
];

test.describe("anonymous visitors are sent to /login", () => {
  for (const path of PROTECTED_PATHS) {
    test(`${path} redirects an anonymous visitor to /login`, async ({
      page,
    }) => {
      await page.goto(path);

      await page.waitForURL("**/login");
      await expect(
        page.getByRole("button", { name: /Login with GitHub/i }),
      ).toBeVisible();
    });
  }
});

test("a real session reaches the protected page instead of /login", async ({
  page,
}) => {
  // The control for the tests above: proves they fail for lack of a session,
  // not because the route is broken for everyone.
  await loginAs(page, "user");
  await page.goto("/dashboard");

  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe("/dashboard");
});
