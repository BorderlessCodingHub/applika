import { expect, test, type Page } from "@playwright/test";

import { loginAs, type SeededRole } from "./support/auth";

/**
 * Page smoke suite (KODI-001 / R-004, R-006).
 *
 * Opens every page of the app against the REAL stack and asserts it actually
 * rendered. Assertions are on VISIBLE TEXT and ARIA ROLES only — never on class
 * names, colours, CSS or screenshots — so this suite passes on today's look and
 * keeps passing after the visual upgrade repaints everything (S2/S3/S4).
 *
 * One data-driven table drives the whole suite: every route appears exactly
 * once, with the identities that may see it and its render assertion.
 */

/**
 * `/cookie-policy` is the 14th page in the acceptance criteria but does NOT
 * exist on this branch — it lives on the unmerged `origin/feature/cookie-policy`.
 * Its row below is complete and parked behind this ONE flag: flip it to `false`
 * the moment that branch merges and the 14th page is covered. Nothing else
 * needs to change.
 */
const COOKIE_POLICY_PENDING = true;

/** `anon` drives the page with no session at all. */
type Visitor = SeededRole | "anon";

interface PageCase {
  /** Route as the browser requests it, relative to `baseURL`. */
  path: string;
  /** Identities that must be able to render this page. */
  visitors: Visitor[];
  /** Proves the page rendered, using visible text / ARIA roles only. */
  assert: (page: Page) => Promise<void>;
  /** When set, the route is not in the tree yet and the case is skipped. */
  pending?: boolean;
  /** Why it is parked — surfaced in the skip annotation. */
  pendingReason?: string;
}

const heading =
  (name: string | RegExp, level?: number) => async (page: Page) => {
    await expect(page.getByRole("heading", { name, level })).toBeVisible();
  };

const PAGES: PageCase[] = [
  // ---- public ----------------------------------------------------------
  {
    path: "/",
    visitors: ["anon"],
    // The landing page's top heading is an h2; there is no h1 on it today.
    assert: heading("Manage your job search with clarity"),
  },
  {
    path: "/login",
    visitors: ["anon"],
    // The h1 is a logo glyph + "pplika.dev", so its accessible name is a poor
    // assertion target. The sign-in control is the page's unambiguous content.
    // It is a LINK, not a button: <Button asChild> renders the <a> underneath.
    assert: async (page) => {
      await expect(
        page.getByRole("link", { name: /Login with GitHub/i }),
      ).toBeVisible();
    },
  },
  {
    path: "/cookie-policy",
    visitors: ["anon"],
    assert: heading(/Cookie Policy/i),
    pending: COOKIE_POLICY_PENDING,
    pendingReason:
      "/cookie-policy is not on this branch yet — it ships with " +
      "origin/feature/cookie-policy. Flip COOKIE_POLICY_PENDING to false when " +
      "that branch merges.",
  },

  // ---- signed-in -------------------------------------------------------
  {
    path: "/dashboard",
    visitors: ["user", "admin"],
    assert: heading("Dashboard", 1),
  },
  {
    path: "/applications",
    visitors: ["user", "admin"],
    assert: heading("Applications", 1),
  },
  {
    path: "/agenda",
    visitors: ["user", "admin"],
    assert: heading("Agenda", 1),
  },
  {
    path: "/cycles",
    visitors: ["user", "admin"],
    assert: heading("Cycles", 1),
  },
  {
    path: "/reports",
    visitors: ["user", "admin"],
    assert: heading(/My Reports/, 1),
  },
  {
    // `generateStaticParams` emits one page per entry of `ReportDays`
    // (1, 14, 28 … 120), so `/reports/1` is a real statically exported route.
    path: "/reports/1",
    visitors: ["user", "admin"],
    assert: heading(/Report — Day 1 of/, 1),
  },
  {
    path: "/profile",
    visitors: ["user", "admin"],
    // The h1 is the user's display name (data-dependent); "Details" is the
    // first unconditional static heading on the page.
    assert: heading("Details"),
  },

  // ---- admin -----------------------------------------------------------
  {
    path: "/admin",
    visitors: ["admin"],
    assert: heading("Admin Console", 1),
  },
  {
    path: "/admin/companies",
    visitors: ["admin"],
    assert: heading("Company Management", 1),
  },
  {
    path: "/admin/supports",
    visitors: ["admin"],
    assert: heading("Supports Data", 1),
  },
  {
    path: "/admin/users",
    visitors: ["admin"],
    assert: heading("User Management", 1),
  },
];

test.describe("every page renders against the real stack", () => {
  for (const pageCase of PAGES) {
    for (const visitor of pageCase.visitors) {
      test(`${pageCase.path} renders for ${visitor}`, async ({ page }) => {
        test.skip(pageCase.pending === true, pageCase.pendingReason ?? "");

        // Smoke-level guard: an uncaught exception means the page did not
        // really come up, even if some text happens to be on screen.
        const pageErrors: Error[] = [];
        page.on("pageerror", (error) => pageErrors.push(error));

        if (visitor !== "anon") {
          await loginAs(page, visitor);
        }

        await page.goto(pageCase.path);
        await pageCase.assert(page);

        expect(
          pageErrors.map((error) => error.message),
          `uncaught client-side error on ${pageCase.path}`,
        ).toEqual([]);
      });
    }
  }
});

test("the suite covers every page named in the acceptance criteria", () => {
  // Guards the table itself: a route silently dropped from PAGES would make the
  // suite pass while covering less. 14 routes, one of them parked.
  expect(PAGES).toHaveLength(14);
  expect(PAGES.filter((pageCase) => pageCase.pending)).toHaveLength(
    COOKIE_POLICY_PENDING ? 1 : 0,
  );
});
