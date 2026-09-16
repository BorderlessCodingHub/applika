import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E — drives the REAL application stack (KODI-001 / R-002).
 *
 * `scripts/e2e.sh` at the repo root is the single entry point: it builds and
 * starts `docker-compose.e2e.yml` (the built API, the built static frontend
 * behind nginx, a real Postgres migrated with `alembic upgrade head` and a real
 * Redis), seeds two real users, exports the `E2E_*` variables this config and
 * `e2e/support/auth.ts` read, runs this suite and tears the stack down.
 *
 * There is deliberately NO `webServer` block and NO request mocking: the stack
 * is provisioned outside Playwright, and every request a spec makes hits the
 * real API against the real database (`.claude/rules/quality-gates.md`).
 *
 * Applika is TWO origins: the browser loads pages from `E2E_BASE_URL`
 * (nginx, :8180) while the page's XHRs go to `E2E_API_URL` (:8100). Cookies
 * ignore the port, so one cookie set on host `127.0.0.1` authenticates both.
 *
 * The suite runs SERIALLY (`workers: 1`, `fullyParallel: false`) because every
 * spec shares the one real database.
 */
const BASE_URL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:8180";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // On CI, "github" annotates the failing lines inline in the PR; the html
  // reporter is what the workflow uploads as an artifact on failure, so it has
  // to be produced too (`open: "never"` keeps it from trying to launch a
  // browser on the runner).
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
