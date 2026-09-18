import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * The application timeline, close and reopen, against the REAL stack
 * (PRD 0008, ADR 0012). Ported from mynextjob's `e2e/timeline-flow.spec.ts`
 * (add-an-event happy path) and extended per the owner's KODI-012 decisions:
 * applika has no application detail route (a non-goal for this slice), so the
 * flow happens on `/applications`, expanding the row inline; and R-032
 * supersedes mynextjob's confirm-only finalize with an outcome picker.
 *
 * Flow 1: add an interview (interview type select shown, defaults to
 * Unknown) -> add a note (select hidden) -> close with no outcome (the
 * confirmation says "reversible") -> the UI offers no way to add an event
 * while closed, and the API itself refuses one (409) -> reopen -> add one
 * more event to prove the application is writable again.
 *
 * Flow 2: close with outcome "offer" (the salary triad, `annually`, a
 * NON-legacy currency) -> the offer event renders in the (read-only)
 * timeline with its formatted salary -> closed still refuses a new event ->
 * reopen.
 *
 * The suite shares ONE real database (`workers: 1`), so this spec cleans up
 * after itself in `beforeEach`/`afterEach`.
 */

function apiHeaders() {
  return {
    Cookie: authCookieHeader("user"),
    "Content-Type": "application/json",
  };
}

/** Delete every application the seeded user holds. */
async function wipeApplications(request: APIRequestContext) {
  const response = await request.get(apiUrl("/applications"), {
    headers: apiHeaders(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  for (const app of (await response.json()) as Array<{ id: string }>) {
    const deleted = await request.delete(apiUrl(`/applications/${app.id}`), {
      headers: apiHeaders(),
    });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
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

/** Yesterday, as `YYYY-MM-DD`. Never "in the future" whatever the container's clock. */
function yesterday(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
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
      application_date: yesterday(),
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

/** Expand the application row named by `role`, from the `/applications` list. */
async function openRow(page: Page, role: string) {
  await page.getByText(role, { exact: true }).click();
}

test.beforeEach(async ({ request }) => {
  await wipeApplications(request);
});

test.afterEach(async ({ request }) => {
  await wipeApplications(request);
});

test.describe("Timeline: add events, close, reopen", () => {
  test("adds an interview and a note, closes with no outcome, refuses further edits, reopens, and accepts a new event", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Timeline Engineer ${stamp}`;
    const company = `Timeline Co ${stamp}`;
    const appId = await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await expect(
      page.getByRole("heading", { name: "Timeline", level: 2 }),
    ).toBeVisible();

    // ---- Add an interview: the interview type select shows, default Unknown ----
    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    let dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Interview", exact: true }).click();
    const interviewTypeSelect = dialog.getByRole("combobox", {
      name: "Interview type",
    });
    await expect(interviewTypeSelect).toBeVisible();
    await expect(interviewTypeSelect).toHaveText(/unknown/i);

    const interviewNote = `Phone screen booked ${stamp}`;
    await dialog.getByLabel(/notes/i).fill(interviewNote);
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText(interviewNote)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Interview", { exact: true })).toBeVisible();
    // The interview-type badge's visible text is "Unknown", preceded by a
    // sr-only "Interview type: " prefix in the same element — not an exact
    // match on "Unknown" alone.
    await expect(page.getByText(/interview type:\s*unknown/i)).toBeVisible();

    // ---- Add a note: the interview type select does NOT show -------------
    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Note", exact: true }).click();
    await expect(
      dialog.getByRole("combobox", { name: "Interview type" }),
    ).not.toBeVisible();

    const noteText = `Recruiter follow-up ${stamp}`;
    await dialog.getByLabel(/notes/i).fill(noteText);
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(noteText)).toBeVisible({ timeout: 15_000 });

    // ---- Close with no outcome: the confirmation says "reversible" -------
    await page.getByRole("button", { name: "Close", exact: true }).click();
    const closeDialog = page.getByRole("alertdialog");
    await expect(closeDialog).toBeVisible();
    await expect(closeDialog.getByText(/reversible/i)).toBeVisible();
    await closeDialog
      .getByRole("button", { name: "Close application" })
      .click();
    await expect(closeDialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText("Closed").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/this application is closed/i)).toBeVisible();

    // ---- Closed: the UI offers no way to add an event ---------------------
    await expect(page.getByRole("button", { name: /add event/i })).toHaveCount(
      0,
    );

    // ---- Closed: the API itself refuses a new event (409) -----------------
    const refused = await request.post(
      apiUrl(`/applications/${appId}/timeline`),
      {
        headers: apiHeaders(),
        data: { event_type: "note", event_date: yesterday() },
      },
    );
    expect(refused.status()).toBe(409);

    // ---- Reopen -------------------------------------------------------------
    await page.getByRole("button", { name: /reopen/i }).click();
    await expect(page.getByText("Closed")).toHaveCount(0, { timeout: 15_000 });

    // ---- Reopened: a new event can be added again --------------------------
    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: "Note", exact: true }).click();
    const postReopenNote = `Reopened and still works ${stamp}`;
    await dialog.getByLabel(/notes/i).fill(postReopenNote);
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(postReopenNote)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("closes with an offer outcome (the salary triad, annually, a non-legacy currency), then refuses further edits and reopens", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Offer Engineer ${stamp}`;
    const company = `Offer Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page.getByRole("button", { name: "Close", exact: true }).click();
    const closeDialog = page.getByRole("alertdialog");
    await expect(closeDialog).toBeVisible();
    await expect(closeDialog.getByText(/reversible/i)).toBeVisible();

    await closeDialog
      .getByRole("radio", { name: "Offer", exact: true })
      .click();

    // The salary triad shows, restricted to monthly|annually (no hourly).
    await expect(
      closeDialog.getByRole("radio", { name: "Hourly" }),
    ).toHaveCount(0);
    await closeDialog.getByRole("radio", { name: "Annually" }).click();
    await closeDialog.getByLabel("Amount").fill("9500");
    await closeDialog.getByRole("combobox", { name: "Currency" }).click();
    await page.getByRole("option", { name: "SEK", exact: true }).click();

    await closeDialog
      .getByRole("button", { name: "Close application" })
      .click();
    await expect(closeDialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText("Closed").first()).toBeVisible({
      timeout: 15_000,
    });

    // The offer event renders on the (read-only) timeline with its salary.
    await expect(page.getByText("Offer", { exact: true })).toBeVisible();
    await expect(page.getByText(/SEK\s*9,500\s*\/yr/)).toBeVisible();

    // Closed: the UI offers no way to add an event.
    await expect(page.getByRole("button", { name: /add event/i })).toHaveCount(
      0,
    );

    // Reopen.
    await page.getByRole("button", { name: /reopen/i }).click();
    await expect(page.getByText("Closed")).toHaveCount(0, { timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: /add event/i }).first(),
    ).toBeVisible();
  });
});
