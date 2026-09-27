import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * The agenda page against the REAL stack (KODI-037/KODI-038, R-011/R-012).
 *
 * One seeded application carries two INTERVIEW events (KODI-016: the agenda
 * only lists interviews) — one a few days in the future, one a few days in
 * the past, both inside the ±30-day window `GET /users/me/agenda` reads
 * (`backend/CLAUDE.md`, **Agenda**). That single application exercises the
 * whole slice: Upcoming/Past tabs and their counts, the search filter, the
 * hyphenated stage pill, the `.ics` download filename, the chevron's
 * read-only timeline (both events, no actions — R-012) and the note row's
 * link into `/applications?focus=` landing on the expanded row (R-011).
 *
 * Seeding/cleanup mirrors `e2e/timeline.spec.ts`: API seeding via
 * `apiUrl`/`authCookieHeader`, `afterAll` deletes the application. The suite
 * shares ONE real database (`workers: 1`).
 */

function apiHeaders() {
  return {
    Cookie: authCookieHeader("user"),
    "Content-Type": "application/json",
  };
}

/** The first real seeded platform id (SUP-001 catalog). */
async function firstPlatformId(request: APIRequestContext): Promise<string> {
  const response = await request.get(apiUrl("/supports"), {
    headers: apiHeaders(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const data = (await response.json()) as {
    platforms: Array<{ id: string }>;
  };
  expect(data.platforms.length).toBeGreaterThan(0);
  return data.platforms[0].id;
}

/** `YYYY-MM-DD`, `offsetDays` from today (negative for the past). */
function dateOffset(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Create a parent application via the REAL API; return its id. */
async function seedApplication(
  request: APIRequestContext,
  role: string,
  company: string,
): Promise<string> {
  const platformId = await firstPlatformId(request);
  const response = await request.post(apiUrl("/applications"), {
    headers: apiHeaders(),
    data: {
      company: { name: company, url: null },
      platform_id: platformId,
      role,
      mode: "active",
      application_date: dateOffset(-5),
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

/** Add an interview timeline event to the seeded application. */
async function seedInterview(
  request: APIRequestContext,
  applicationId: string,
  overrides: {
    event_date: string;
    interview_type: string;
    observation?: string;
  },
) {
  const response = await request.post(
    apiUrl(`/applications/${applicationId}/timeline`),
    {
      headers: apiHeaders(),
      data: {
        event_type: "interview",
        start_time: "10:00:00",
        end_time: "11:00:00",
        timezone: "UTC",
        ...overrides,
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

async function deleteApplication(
  request: APIRequestContext,
  applicationId: string,
) {
  const deleted = await request.delete(
    apiUrl(`/applications/${applicationId}`),
    { headers: apiHeaders() },
  );
  expect(deleted.ok(), await deleted.text()).toBeTruthy();
}

/** The agenda card for `role`, scoped by its own `data-step-id`-bearing article. */
function agendaCard(page: Page, role: string) {
  return page.locator('[data-slot="agenda-item-card"]', { hasText: role });
}

const stamp = Date.now();
const role = `Agenda Engineer ${stamp}`;
const company = `Agenda Co ${stamp}`;
let applicationId: string;

test.describe("Agenda: tabs, search, calendar file, read-only timeline, the applications link", () => {
  test.beforeAll(async ({ request }) => {
    applicationId = await seedApplication(request, role, company);
    // Upcoming: a few days ahead, well inside the +30-day window.
    await seedInterview(request, applicationId, {
      event_date: dateOffset(5),
      interview_type: "technical",
      observation: `Upcoming screen ${stamp}`,
    });
    // Past: a few days back, well inside the -30-day window.
    await seedInterview(request, applicationId, {
      event_date: dateOffset(-3),
      interview_type: "hiring_manager",
      observation: `Past screen ${stamp}`,
    });
  });

  test.afterAll(async ({ request }) => {
    await deleteApplication(request, applicationId);
  });

  test("Upcoming is selected with the right count and stage pill; Past lists the other event", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/agenda");

    const upcomingTab = page.getByRole("tab", { name: /upcoming \(\d+\)/i });
    await expect(upcomingTab).toHaveAttribute("data-state", "active");

    const card = agendaCard(page, role);
    await expect(card).toBeVisible();
    await expect(card.getByText("Interview - Technical")).toBeVisible();

    await page.getByRole("tab", { name: /past/i }).click();
    const pastCard = agendaCard(page, role);
    await expect(pastCard).toBeVisible();
    await expect(
      pastCard.getByText("Interview - Hiring manager"),
    ).toBeVisible();
  });

  test("search narrows both tabs' counts", async ({ page }) => {
    await loginAs(page, "user");
    await page.goto("/agenda");

    await page.getByPlaceholder("Search applications...").fill(company);
    await expect(
      page.getByRole("tab", { name: /upcoming \(1\)/i }),
    ).toBeVisible();

    await page
      .getByPlaceholder("Search applications...")
      .fill("no such company at all");
    await expect(
      page.getByRole("tab", { name: /upcoming \(0\)/i }),
    ).toBeVisible();
    await expect(page.getByRole("tab", { name: /past \(0\)/i })).toBeVisible();
  });

  test("the .ics download filename carries the hyphenated stage label", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/agenda");

    const card = agendaCard(page, role);
    const started = page.waitForEvent("download");
    await card.getByRole("button", { name: /add .* to calendar/i }).click();
    const download = await started;
    expect(download.suggestedFilename()).toBe(
      `${company}-Interview - Technical.ics`,
    );
  });

  test("the chevron reveals both events read-only, and starts closed", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/agenda");

    const card = agendaCard(page, role);
    const region = card.getByRole("region", {
      name: `Timeline for ${role} at ${company}`,
    });
    await expect(region).toHaveCount(0);

    await card
      .getByRole("button", { name: `Timeline for ${role} at ${company}` })
      .click();

    await expect(region).toBeVisible();
    await expect(region.getByText("2 events")).toBeVisible();
    await expect(region.getByText(`Upcoming screen ${stamp}`)).toBeVisible();
    await expect(region.getByText(`Past screen ${stamp}`)).toBeVisible();
    // Read-only: no per-event actions menu anywhere in the region.
    await expect(region.getByRole("button")).toHaveCount(0);
  });

  test("the note row's link opens /applications with that row expanded", async ({
    page,
  }) => {
    await loginAs(page, "user");
    await page.goto("/agenda");

    const card = agendaCard(page, role);
    await card
      .getByRole("link", { name: `Open ${role} at ${company}` })
      .click();

    await page.waitForURL("**/applications");
    expect(new URL(page.url()).search).toBe("");

    await expect(
      page.getByRole("button", {
        name: `Details for ${role} at ${company}`,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      page.getByRole("heading", { name: "Timeline", level: 2 }),
    ).toBeVisible();
  });
});
