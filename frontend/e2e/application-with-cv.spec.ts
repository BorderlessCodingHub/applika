import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * `/applications/new-with-cv` against the REAL stack (PRD 0010, KODI-033;
 * revised KODI-036).
 *
 * One draft, start to finish: step 1 (company, role, a brand-new PRIVATE
 * platform, a PAST application date), autosave, a full page reload that
 * resumes the same draft from `?id=`, step 2 (pick the seeded master CV, edit
 * the copy, autosave again), then Finish — which turns the draft into a real
 * application dated with that same day, and empties the Drafts tab. Nothing
 * here is mocked: the platform really is created via `POST /platforms`, the
 * draft via `POST /applications/drafts`, and the final application via
 * `POST /applications/drafts/{id}/finish`.
 */

const ROLE = "E2E New-With-CV Engineer";
const COMPANY = "E2E New-With-CV Co";
const PLATFORM = "E2E Private Board";
const MASTER_CV = "E2E new-with-cv master";

function apiHeaders(role: "user" | "admin" = "user") {
  return {
    Cookie: authCookieHeader(role),
    "Content-Type": "application/json",
  };
}

async function wipeDrafts(request: APIRequestContext) {
  const response = await request.get(apiUrl("/applications/drafts"), {
    headers: apiHeaders(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  for (const draft of (await response.json()) as Array<{ id: string }>) {
    const deleted = await request.delete(
      apiUrl(`/applications/drafts/${draft.id}`),
      { headers: apiHeaders() },
    );
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
}

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

async function wipeBaseCvs(request: APIRequestContext) {
  const response = await request.get(apiUrl("/base-cvs"), {
    headers: apiHeaders(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  for (const cv of (await response.json()) as Array<{ id: string }>) {
    const deleted = await request.delete(apiUrl(`/base-cvs/${cv.id}`), {
      headers: apiHeaders(),
    });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
}

/** Deletes every admin-visible platform whose name starts with `E2E Private`. */
async function wipeE2ePlatforms(request: APIRequestContext) {
  const response = await request.get(
    apiUrl("/admin/platforms?search=E2E Private"),
    { headers: apiHeaders("admin") },
  );
  if (!response.ok()) return;
  const { items: platforms } = (await response.json()) as {
    items: Array<{ id: string; name: string }>;
  };
  for (const platform of platforms) {
    if (!platform.name.startsWith("E2E Private")) continue;
    await request.delete(apiUrl(`/admin/platforms/${platform.id}`), {
      headers: apiHeaders("admin"),
    });
  }
}

async function seedMasterCv(request: APIRequestContext): Promise<string> {
  const response = await request.post(apiUrl("/base-cvs"), {
    headers: apiHeaders(),
    data: {
      name: MASTER_CV,
      full_name: "E2E Candidate",
      headline: "Engineer",
      location: "Remote",
      email: "e2e-user@e2e.applika.dev",
      phone: null,
      summary: "Seeded by the E2E suite.",
      links: [],
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

test.beforeEach(async ({ request }) => {
  await wipeDrafts(request);
  await wipeApplications(request);
  await wipeBaseCvs(request);
});

test.afterEach(async ({ request }) => {
  await wipeDrafts(request);
  await wipeApplications(request);
  await wipeBaseCvs(request);
  await wipeE2ePlatforms(request);
});

test("a draft created with New with CV autosaves, resumes and finishes into a real application", async ({
  page,
  request,
}) => {
  await seedMasterCv(request);

  await loginAs(page, "user");
  await page.goto("/applications");

  // AC5/R-003 — the new action sits beside the existing one and opens its own page.
  await page.getByRole("link", { name: "New with CV" }).click();
  await expect(page).toHaveURL(/\/applications\/new-with-cv$/);
  await expect(
    page.getByRole("heading", { name: "New application with CV", level: 1 }),
  ).toBeVisible();

  // AC14 — at 390px step 1 never scrolls sideways.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel(/application date/i)).toBeVisible();
  const step1Metrics = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    step1Metrics.scrollWidth,
    `step 1 scrolled sideways at 390px: ${JSON.stringify(step1Metrics)}`,
  ).toBeLessThanOrEqual(step1Metrics.clientWidth + 1);
  await page.setViewportSize({ width: 1280, height: 800 });

  // AC1/AC3 — step 1 asks for the application date, refusing a future one.
  const dateTrigger = page.getByLabel(/application date/i);
  await dateTrigger.click();
  const calendar = page.locator('[data-slot="popover-content"]');
  await calendar
    .getByRole("button", { name: "Go to the Previous Month" })
    .click();
  await calendar.getByText("15", { exact: true }).click();
  const dateText = (await dateTrigger.textContent()) ?? "";
  const pickedDate = dateText.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  expect(pickedDate, `no date was parsed from "${dateText}"`).toBeTruthy();

  // ---- step 1: company (free text), role, a brand-new PRIVATE platform ----
  await page.getByRole("combobox", { name: "Company", exact: true }).click();
  await page.getByPlaceholder(/search or add a company/i).fill(COMPANY);
  await page.getByText(`Create "${COMPANY}"`).click();
  await page.getByRole("button", { name: "Add company" }).click();

  // AC2/R-019 — no URL given, the name stays free text on this application only.
  await expect(page.getByText(COMPANY, { exact: true })).toBeVisible();

  await page.getByPlaceholder(/senior engineer/i).fill(ROLE);

  await page.getByRole("combobox", { name: /platform/i }).click();
  await page.getByPlaceholder(/search or add a platform/i).fill(PLATFORM);
  await page.getByText(`Create "${PLATFORM}"`).click();
  await page.getByLabel("Name", { exact: true }).fill(PLATFORM);
  await page.getByRole("button", { name: "Add platform" }).click();

  // AC14/AC15 — the new platform is private, badged "Only you".
  await expect(page.getByText("Only you")).toBeVisible();

  // AC6/AC7 — the draft now exists and autosaves; the URL picks up `?id=`.
  await expect(page).toHaveURL(/\/applications\/new-with-cv\?id=/);
  await expect(
    page.locator('[data-slot="autosave-status"][data-state="saved"]'),
  ).toBeVisible();

  const draftUrl = page.url();

  // ---- reload: the SAME draft resumes on step 1 (no CV copy yet, AC12) ----
  await page.reload();
  await expect(page).toHaveURL(draftUrl);
  await expect(page.getByPlaceholder(/senior engineer/i)).toHaveValue(ROLE);
  await expect(page.getByRole("combobox", { name: /platform/i })).toContainText(
    PLATFORM,
  );
  await expect(page.getByText("Only you")).toBeVisible();
  // B5 (QA round 1): a free-text (`company_id: null`) company used to render
  // the picker blank on resume even though the draft held the right name.
  await expect(page.getByText(COMPANY, { exact: true })).toBeVisible();

  // ---- step 2: pick the seeded master CV, edit the copy ------------------
  await page.getByRole("button", { name: "Continue to CV" }).click();
  await expect(
    page.getByRole("button", { name: "Step 2: CV" }),
  ).toHaveAttribute("aria-current", "step");

  await page.getByRole("button", { name: "Create the CV copy" }).click();
  await expect(page.getByText(`Copied from ${MASTER_CV}`)).toBeVisible();

  await page.getByLabel("Headline", { exact: true }).fill("Tailored Engineer");
  await expect(
    page.locator('[data-slot="autosave-status"][data-state="saved"]'),
  ).toBeVisible();

  // ---- Finish: turns the draft into a real application (AC10) ------------
  const finish = page.getByRole("button", { name: "Finish" });
  await expect(finish).toBeEnabled();
  await finish.click();

  await expect(page).toHaveURL(/\/applications$/);
  await expect(
    page.getByRole("button", { name: `Edit ${ROLE} at ${COMPANY}` }),
  ).toBeVisible();

  // AC1 — the finished application is dated with the SAME day step 1 picked.
  await expect(page.getByText(pickedDate!, { exact: true })).toBeVisible();

  // The Drafts tab replaces the former Drafts section (AC8) and is empty now
  // that the draft finished.
  await page.getByRole("tab", { name: /drafts/i }).click();
  await expect(page.getByText("No drafts yet.")).toBeVisible();
});

test("the side sheet that creates/edits an application without a CV never scrolls sideways at 390px (AC6/AC14)", async ({
  page,
}) => {
  await loginAs(page, "user");
  await page.goto("/applications");
  await page.setViewportSize({ width: 390, height: 844 });

  await page.getByRole("button", { name: "New Application" }).click();
  await expect(
    page.getByRole("heading", { name: "New Application" }),
  ).toBeVisible();

  const sheetMetrics = await page.evaluate(() => {
    const sheet = document.querySelector<HTMLElement>(
      '[data-slot="sheet-content"]',
    );
    return {
      scrollWidth: sheet?.scrollWidth ?? -1,
      clientWidth: sheet?.clientWidth ?? -1,
    };
  });
  expect(
    sheetMetrics.scrollWidth,
    `the side sheet scrolled sideways at 390px: ${JSON.stringify(sheetMetrics)}`,
  ).toBeLessThanOrEqual(sheetMetrics.clientWidth + 1);
});
