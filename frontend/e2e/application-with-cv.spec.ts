import { expect, test, type APIRequestContext } from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * `/applications/new-with-cv` against the REAL stack (PRD 0010, KODI-033).
 *
 * One draft, start to finish: step 1 (company, role, a brand-new PRIVATE
 * platform), autosave, a full page reload that resumes the same draft from
 * `?id=`, step 2 (pick the seeded master CV, edit the copy, autosave again),
 * then Finish — which turns the draft into a real application and empties the
 * Drafts section. Nothing here is mocked: the platform really is created via
 * `POST /platforms`, the draft via `POST /applications/drafts`, and the final
 * application via `POST /applications/drafts/{id}/finish`.
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
  const response = await request.get(apiUrl("/admin/platforms"), {
    headers: apiHeaders("admin"),
  });
  if (!response.ok()) return;
  const platforms = (await response.json()) as Array<{
    id: string;
    name: string;
  }>;
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

  // AC1 — the new action sits beside the existing one and opens its own page.
  await page.getByRole("link", { name: "New with CV" }).click();
  await expect(page).toHaveURL(/\/applications\/new-with-cv$/);
  await expect(
    page.getByRole("heading", { name: "New application with CV", level: 1 }),
  ).toBeVisible();
  // AC3 — no application date is asked here.
  await expect(page.getByText(/application date/i)).toHaveCount(0);

  // ---- step 1: company (free text), role, a brand-new PRIVATE platform ----
  await page.getByText("Search companies…").click();
  await page.getByPlaceholder(/search companies/i).fill(COMPANY);
  await page.keyboard.press("Escape");

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

  // The finished draft is gone from Drafts (AC11).
  await expect(page.locator('[data-slot="drafts-section"]')).toHaveCount(0);
});
