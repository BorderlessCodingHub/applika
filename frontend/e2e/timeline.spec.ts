import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * The application timeline, close and reopen, against the REAL stack
 * (PRD 0008, ADR 0012, PRD 0016): the add-an-event happy path, extended per
 * the owner's decisions:
 * applika has no application detail route (a non-goal for this slice), so the
 * flow happens on `/applications`, expanding the row inline; and closing is
 * the SAME event dialog as Add event, opened from the row's flag in close
 * mode: a `dialog` named "Close application" offering None, Offer and Denied
 * (never Interview), opening on None, with no checkbox — there is no separate
 * close `alertdialog` any more.
 *
 * Flow 1: add an interview (the dialog offers three types and opens on
 * Interview / Unknown) -> add a denied event (interview type select hidden)
 * -> close from the flag with None (the dialog offers None, Offer and Denied
 * with None checked, and says closing is "reversible") -> the UI offers no
 * way to add an event while closed, and the API itself refuses one (409) ->
 * reopen -> add one more event to prove the application is writable again.
 *
 * Flow 2: close with Offer (the salary triad, `annually`, a NON-legacy
 * currency) -> the offer event renders in the (read-only) timeline with its
 * formatted salary -> closed still refuses a new event -> reopen.
 *
 * Add event with an Offer or Denied shows a "Close the application" box
 * before Cancel, ticked on every open: ticked, the save records the event
 * AND closes the application (one finalize request); unticked, it only adds
 * the event. The tests that add an Offer or Denied to an application that
 * must stay open untick it first. Flow 3: Add event -> Offer with the box
 * ticked -> "Closed", the offer on the read-only timeline, no Add event ->
 * reopen -> Add event -> Denied, unticked -> saved, the row stays "Active"
 * with its flag.
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
  test("adds an interview and a denied event, closes with no outcome, refuses further edits, reopens, and accepts a new event", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Timeline Engineer ${stamp}`;
    const company = `Timeline Co ${stamp}`;
    const appId = await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");

    // KODI-015 G1/G2: an open application shows the "Active" status pill.
    // Scoped to this application's own row (`aria-labelledby` names it by
    // company) rather than `.first()`, and not `exact` — the pill's
    // accessible name carries a sr-only "Status: " prefix in the same
    // element, the same convention `getByText("Closed")` already relies on
    // elsewhere in this file.
    await expect(
      page.getByRole("article", { name: company }).getByText("Active"),
    ).toBeVisible();

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

    // Three event types only (ADR 0020): no Note, no Feedback. A new event
    // opens on Interview of type Unknown, before anything is clicked.
    const eventTypes = dialog
      .getByRole("radiogroup", { name: "Event type" })
      .getByRole("radio");
    await expect(eventTypes).toHaveCount(3);
    await expect(eventTypes).toHaveText(["Interview", "Offer", "Denied"]);
    await expect(
      dialog.getByRole("radio", { name: "Interview", exact: true }),
    ).toBeChecked();
    await expect(dialog.getByRole("radio", { name: "Note" })).toHaveCount(0);
    await expect(dialog.getByRole("radio", { name: "Feedback" })).toHaveCount(
      0,
    );
    const interviewTypeSelect = dialog.getByRole("combobox", {
      name: "Interview type",
    });
    await expect(interviewTypeSelect).toBeVisible();
    await expect(interviewTypeSelect).toHaveText(/unknown/i);

    // ---- The interview-only schedule inputs show for Interview (AC2, KODI-014) ----
    await expect(dialog.getByLabel("Start")).toBeVisible();
    await expect(dialog.getByLabel("End")).toBeVisible();
    await expect(
      dialog.getByRole("combobox", { name: "Timezone" }),
    ).toBeVisible();

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

    // ---- Add a denied event: the interview type select does NOT show -----
    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Denied", exact: true }).click();
    await expect(
      dialog.getByRole("combobox", { name: "Interview type" }),
    ).not.toBeVisible();

    // ---- The schedule inputs disappear for Denied (AC2) ------------------
    await expect(dialog.getByLabel("Start")).not.toBeVisible();
    await expect(dialog.getByLabel("End")).not.toBeVisible();
    await expect(
      dialog.getByRole("combobox", { name: "Timezone" }),
    ).not.toBeVisible();

    const noteText = `Recruiter follow-up ${stamp}`;
    await dialog.getByLabel(/notes/i).fill(noteText);
    // Unticked: the denied event is only added, the row stays open for the
    // flag below.
    const closeBox = dialog.getByRole("checkbox", {
      name: "Close the application",
    });
    await expect(closeBox).toBeChecked();
    await closeBox.uncheck();
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(noteText)).toBeVisible({ timeout: 15_000 });

    // ---- Close with no outcome: the confirmation says "reversible" -------
    await page
      .getByRole("button", { name: `Close ${role} at ${company}`, exact: true })
      .click();
    const closeDialog = page.getByRole("dialog", {
      name: "Close application",
    });
    await expect(closeDialog).toBeVisible();
    await expect(closeDialog.getByText(/reversible/i)).toBeVisible();
    // The close dialog offers None, Offer and Denied — never Interview —
    // opens on None, and shows no "close the application" checkbox.
    await expect(closeDialog.getByRole("radio")).toHaveText([
      "None",
      "Offer",
      "Denied",
    ]);
    await expect(
      closeDialog.getByRole("radio", { name: "None", exact: true }),
    ).toBeChecked();
    await expect(
      closeDialog.getByRole("radio", { name: "Interview" }),
    ).toHaveCount(0);
    await expect(closeDialog.getByRole("checkbox")).toHaveCount(0);
    // None shows no date and no notes.
    await expect(closeDialog.getByLabel("Date")).toHaveCount(0);
    await expect(closeDialog.getByLabel(/notes/i)).toHaveCount(0);
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
        data: {
          event_type: "interview",
          interview_type: "unknown",
          event_date: yesterday(),
        },
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
    // Saved as it opens: an interview of type Unknown.
    await expect(
      dialog.getByRole("radio", { name: "Interview", exact: true }),
    ).toBeChecked();
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

    await page
      .getByRole("button", { name: `Close ${role} at ${company}`, exact: true })
      .click();
    const closeDialog = page.getByRole("dialog", {
      name: "Close application",
    });
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

  test("Add event with an Offer and the box ticked closes the application; a Denied with the box unticked keeps it open", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Close Box Engineer ${stamp}`;
    const company = `Close Box Co ${stamp}`;
    const appId = await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    const row = page.getByRole("article", { name: company });
    // The status pill, not any "Active" text: the expanded row also lists the
    // application's mode, "Active".
    const statusPill = row.locator('[data-slot="application-status-pill"]');
    await expect(statusPill).toHaveText(/active/i);
    await openRow(page, role);

    // ---- Ticked: the offer is recorded and the application closes --------
    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    let dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();
    // Interview (the type it opens on) shows no box.
    await expect(dialog.getByRole("checkbox")).toHaveCount(0);

    await dialog.getByRole("radio", { name: "Offer", exact: true }).click();
    let closeBox = dialog.getByRole("checkbox", {
      name: "Close the application",
    });
    await expect(closeBox).toBeVisible();
    await expect(closeBox).toBeChecked();
    await expect(dialog.getByText("You can reopen it later.")).toBeVisible();
    await dialog.getByRole("radio", { name: "Monthly" }).click();
    await dialog.getByLabel("Amount").fill("8200");
    await dialog.getByRole("combobox", { name: "Currency" }).click();
    await page.getByRole("option", { name: "EUR", exact: true }).click();

    const finalized = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" &&
        response.url().endsWith(`/applications/${appId}/finalize`),
    );
    await dialog.getByRole("button", { name: "Add event" }).click();
    expect((await finalized).status()).toBe(200);
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(statusPill).toHaveText(/closed/i, { timeout: 15_000 });
    await expect(page.getByText(/this application is closed/i)).toBeVisible();
    await expect(page.getByText("Offer", { exact: true })).toBeVisible();
    await expect(page.getByText(/EUR\s*8,200\s*\/mo/)).toBeVisible();
    await expect(page.getByRole("button", { name: /add event/i })).toHaveCount(
      0,
    );

    // ---- Reopen, then a Denied with the box unticked stays open ------------
    await page.getByRole("button", { name: /reopen/i }).click();
    await expect(statusPill).toHaveText(/active/i, { timeout: 15_000 });

    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("radio", { name: "Denied", exact: true }).click();
    closeBox = dialog.getByRole("checkbox", { name: "Close the application" });
    // Ticked again on this new open.
    await expect(closeBox).toBeChecked();
    await closeBox.uncheck();
    await expect(closeBox).not.toBeChecked();
    const deniedNote = `Kept open ${stamp}`;
    await dialog.getByLabel(/notes/i).fill(deniedNote);
    await dialog.getByRole("button", { name: "Add event" }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText(deniedNote)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Denied", { exact: true })).toBeVisible();
    await expect(statusPill).toHaveText(/active/i);
    await expect(page.getByText(/this application is closed/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: `Close ${role} at ${company}`,
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /add event/i }).first(),
    ).toBeVisible();
  });
});

test.describe("Timeline: denied reason (AC4, KODI-014)", () => {
  test("records a denied event with a reason, created through the form, and shows it on the card", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Denied Engineer ${stamp}`;
    const company = `Denied Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Denied", exact: true }).click();
    const reasonSelect = dialog.getByRole("combobox", { name: "Reason" });
    await expect(reasonSelect).toBeVisible();
    await expect(reasonSelect).toHaveText(/unknown/i);

    await reasonSelect.click();
    await page.getByRole("option", { name: "Ghosted", exact: true }).click();
    await expect(reasonSelect).toHaveText(/ghosted/i);

    const closeBox = dialog.getByRole("checkbox", {
      name: "Close the application",
    });
    await expect(closeBox).toBeChecked();
    await closeBox.uncheck();
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText("Denied", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    // The reason badge's visible text is "Ghosted", preceded by a sr-only
    // "Reason: " prefix in the same element (same pattern as the interview
    // type badge above) — not an exact match on "Ghosted" alone.
    await expect(page.getByText(/feedback:\s*ghosted/i)).toBeVisible();
  });

  test("hides the Feedback title line when the denied reason is left Unknown (G3, KODI-015)", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Denied Unknown Engineer ${stamp}`;
    const company = `Denied Unknown Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Denied", exact: true }).click();
    // Leave the reason select at its default (Unknown).
    const closeBox = dialog.getByRole("checkbox", {
      name: "Close the application",
    });
    await expect(closeBox).toBeChecked();
    await closeBox.uncheck();
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText("Denied", { exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/feedback:/i)).toHaveCount(0);
  });

  test("closes with a denied outcome and a reason", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Denied Close Engineer ${stamp}`;
    const company = `Denied Close Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page
      .getByRole("button", { name: `Close ${role} at ${company}`, exact: true })
      .click();
    const closeDialog = page.getByRole("dialog", {
      name: "Close application",
    });
    await expect(closeDialog).toBeVisible();

    await closeDialog
      .getByRole("radio", { name: "Denied", exact: true })
      .click();
    const reasonSelect = closeDialog.getByRole("combobox", { name: "Reason" });
    await expect(reasonSelect).toBeVisible();
    await expect(reasonSelect).toHaveText(/unknown/i);
    await reasonSelect.click();
    await page
      .getByRole("option", { name: "Position filled", exact: true })
      .click();

    await closeDialog
      .getByRole("button", { name: "Close application" })
      .click();
    await expect(closeDialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText("Closed").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText("Denied", { exact: true })).toBeVisible();
    await expect(page.getByText(/feedback:\s*position filled/i)).toBeVisible();
  });
});

test.describe("Timeline: timezone pre-fill (AC3, KODI-014)", () => {
  // A real IANA zone, distinct from the container's likely UTC default, so the
  // pre-fill is provably READ from the browser rather than coincidentally
  // matching a hard-coded expectation.
  test.use({ timezoneId: "Pacific/Auckland" });

  test("pre-fills the timezone select with the browser's own zone for a new interview", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Timezone Engineer ${stamp}`;
    const company = `Timezone Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Interview", exact: true }).click();
    const timezoneSelect = dialog.getByRole("combobox", { name: "Timezone" });
    await expect(timezoneSelect).toBeVisible();

    // Read the zone the browser itself resolves, rather than hard-coding a
    // label — proves the pre-fill tracks whatever Intl.DateTimeFormat
    // resolves to, not a zone this suite assumes the browser has.
    const zone = await page.evaluate(
      () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
    expect(zone).toBe("Pacific/Auckland");
    await expect(timezoneSelect).toHaveText(
      new RegExp(zone.replace("/", "\\/")),
    );
  });
});

test.describe("Timeline: schedule display (AC2, KODI-016)", () => {
  test("an interview's card shows the readable zone (underscores as spaces), exactly like the select", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `Schedule Engineer ${stamp}`;
    const company = `Schedule Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    await dialog.getByRole("radio", { name: "Interview", exact: true }).click();
    await dialog.getByLabel("Start").fill("10:00");
    await dialog.getByLabel("End").fill("11:00");

    const timezoneSelect = dialog.getByRole("combobox", { name: "Timezone" });
    await timezoneSelect.click();
    await page
      .getByPlaceholder("Search city, region or offset")
      .fill("Sao Paulo");
    await page.getByRole("option", { name: /Sao Paulo/i }).click();
    await expect(timezoneSelect).toHaveText(/Sao Paulo/);

    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // The card reads the readable form — underscores as spaces — never the
    // raw IANA id the request actually stored and sent.
    await expect(
      page.getByText(/10:00–11:00\s*·\s*America\/Sao Paulo/),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/America\/Sao_Paulo/)).toHaveCount(0);
  });

  test("a non-interview event shows no schedule on its card", async ({
    page,
    request,
  }) => {
    const stamp = Date.now();
    const role = `No Schedule Engineer ${stamp}`;
    const company = `No Schedule Co ${stamp}`;
    await seedApplication(request, role, company);

    await loginAs(page, "user");
    await page.goto("/applications");
    await openRow(page, role);

    await page
      .getByRole("button", { name: /add event/i })
      .first()
      .click();
    const dialog = page.getByRole("dialog", { name: "Add event" });
    await expect(dialog).toBeVisible();

    // Offer: a non-interview type, so the schedule inputs never show.
    await dialog.getByRole("radio", { name: "Offer", exact: true }).click();
    await expect(dialog.getByLabel("Start")).not.toBeVisible();
    await dialog.getByRole("radio", { name: "Monthly" }).click();
    await dialog.getByLabel("Amount").fill("7000");
    await dialog.getByRole("combobox", { name: "Currency" }).click();
    await page.getByRole("option", { name: "EUR", exact: true }).click();
    const noteText = `No schedule note ${stamp}`;
    await dialog.getByLabel(/notes/i).fill(noteText);
    const closeBox = dialog.getByRole("checkbox", {
      name: "Close the application",
    });
    await expect(closeBox).toBeChecked();
    await closeBox.uncheck();
    await dialog.getByRole("button", { name: /add event/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    await expect(page.getByText(noteText)).toBeVisible({ timeout: 15_000 });
    // No time-range text (the "start–end · zone" pattern) renders anywhere
    // on the card — the API never received a schedule for this event.
    await expect(page.getByText(/\d{2}:\d{2}–\d{2}:\d{2}/)).toHaveCount(0);
  });
});
