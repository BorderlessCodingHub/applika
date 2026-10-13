import {
  expect,
  test,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * The job board end to end against the REAL stack (PRD 0012, KODI-049, T101).
 *
 * The e2e compose runs the real `worker` and `scheduler` from the API image
 * with `JOBS_SCRAPERS=fixture`: every enabled source is served from
 * `backend/tests/fixtures/jobs/postings.json`, so nothing here ever reaches
 * himalayas.app or remoteok.com. The scheduler's cron never fires during a run
 * (`0 0 1 1 *`); the only run is the admin's "Run now". The job links point at
 * the real boards and are never followed. No `page.route`, no mocked API.
 *
 * Serial: the admin run fills the board the user half reads, and the user half
 * is one lifecycle (master CV -> saved search -> draft -> application). Other
 * specs share the seeded user; this one wipes the user's drafts, applications,
 * master CVs and saved searches before it starts, and `afterAll` deletes what
 * it made, restores any dismissal and turns every source back on.
 */

test.describe.configure({ mode: "serial" });

// The browser runs on UTC, the API container's clock. BACKEND GAP (KODI-049,
// reported, not patched here): `POST /applications/drafts/from-job` dates the
// draft with the server's `date.today()` (UTC). West of UTC in the evening the
// browser's local day is still "yesterday", so step 1 refuses the draft's own
// date as "in the future" and Finish says "Some application fields need fixing
// before this can finish." Pinning the zone keeps this spec about the job
// board until the backend dates the draft in the user's day.
test.use({ timezoneId: "UTC" });

/** A long master CV name with a long unbroken word: the 375px check (KODI-048 follow-up). */
const MASTER_CV =
  "E2E Jobs master CV Pneumonoultramicroscopicsilicovolcanoconiosis-backend";
const BACKEND_JOB = "Senior Python Backend Engineer";
const PLATFORM_JOB = "Platform Engineer";
const SAVED_SEARCH = "E2E search";
const RUN_TIMEOUT = 120_000;

type Role = "user" | "admin";

function headers(role: Role = "user") {
  return { Cookie: authCookieHeader(role), "Content-Type": "application/json" };
}

async function getJson<T>(
  request: APIRequestContext,
  path: string,
  role: Role = "user",
): Promise<T> {
  const response = await request.get(apiUrl(path), { headers: headers(role) });
  expect(response.ok(), `${path}: ${await response.text()}`).toBeTruthy();
  return (await response.json()) as T;
}

async function deleteEach(
  request: APIRequestContext,
  listPath: string,
  itemPath: (id: string) => string,
) {
  const items = await getJson<Array<{ id: string }>>(request, listPath);
  for (const item of items) {
    const deleted = await request.delete(apiUrl(itemPath(item.id)), {
      headers: headers(),
    });
    expect(deleted.ok(), await deleted.text()).toBeTruthy();
  }
}

/** Everything of the seeded user's this spec creates, gone. */
async function wipeUserState(request: APIRequestContext) {
  await deleteEach(
    request,
    "/applications/drafts",
    (id) => `/applications/drafts/${id}`,
  );
  await deleteEach(request, "/applications", (id) => `/applications/${id}`);
  await deleteEach(request, "/job-searches", (id) => `/job-searches/${id}`);
  await deleteEach(request, "/base-cvs", (id) => `/base-cvs/${id}`);
}

/** Restores every job the seeded user dismissed (the spec restores its own; this is the safety net). */
async function restoreDismissals(request: APIRequestContext) {
  const page = await getJson<{
    items: Array<{ id: string; dismissed: boolean }>;
  }>(request, "/jobs?include_dismissed=true&page=1");
  for (const job of page.items) {
    if (!job.dismissed) continue;
    await request.delete(apiUrl(`/jobs/${job.id}/dismissal`), {
      headers: headers(),
    });
  }
}

/** Every job source back on — this spec turns RemoteOK off and on. */
async function enableAllSources(request: APIRequestContext) {
  const sources = await getJson<Array<{ id: string; is_enabled: boolean }>>(
    request,
    "/admin/jobs/sources",
    "admin",
  );
  for (const source of sources) {
    if (source.is_enabled) continue;
    const patched = await request.patch(
      apiUrl(`/admin/jobs/sources/${source.id}`),
      { headers: headers("admin"), data: { is_enabled: true } },
    );
    expect(patched.ok(), await patched.text()).toBeTruthy();
  }
}

/**
 * The master CV: a skill category that does not match the backend job before
 * one that does, and an experience entry whose matching bullet comes second,
 * so "Tailor by keywords" has something to move in both sections.
 */
async function seedMasterCv(request: APIRequestContext): Promise<string> {
  const response = await request.post(apiUrl("/base-cvs"), {
    headers: headers(),
    data: {
      name: MASTER_CV,
      full_name: "E2E Candidate",
      headline: "Backend Engineer",
      location: "Remote",
      email: "e2e-user@e2e.applika.dev",
      phone: null,
      summary: "Seeded by the jobs E2E suite.",
      links: [],
      skills: [
        { id: "s-design", category: "Design", keywords: ["Figma", "Sketch"] },
        {
          id: "s-backend",
          category: "Backend",
          keywords: ["Go", "Python", "FastAPI", "PostgreSQL"],
        },
      ],
      experience: [
        {
          id: "e-1",
          company: "E2E Previous Co",
          role: "Engineer",
          start: "2020-01",
          end: null,
          bullets: [
            "Ran the office book club",
            "Built Python services with FastAPI on PostgreSQL",
          ],
        },
      ],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

function sourceRow(page: Page, code: string): Locator {
  return page.locator(
    `tr[data-slot="job-source-row"][data-source-code="${code}"]`,
  );
}

/** Column order: Source (th) | On | Last run | Status | Found | Saved | Listed jobs | Last error. */
const LISTED_JOBS_CELL = 5;

async function lastRunAt(page: Page, code: string): Promise<string | null> {
  return sourceRow(page, code).locator("time").getAttribute("datetime");
}

async function listedJobs(page: Page, code: string): Promise<number> {
  const text = await sourceRow(page, code)
    .getByRole("cell")
    .nth(LISTED_JOBS_CELL)
    .innerText();
  return Number(text.replace(/[^\d]/g, "") || "0");
}

/** Run now, accepting "Run started" — or a 409 if a run is somehow still going. */
async function runNow(page: Page) {
  await page.getByRole("button", { name: "Run now" }).click();
  await expect(
    page
      .getByText("Run started", { exact: true })
      .or(page.getByText("A run is already in progress", { exact: true })),
  ).toBeVisible();
  await expect(
    page.getByText("Background service unavailable", { exact: true }),
  ).toHaveCount(0);
}

/** `main` is the shell's scroll container: measure it AND the document. */
async function expectNoSidewaysScroll(page: Page, where: string) {
  const metrics = await page.evaluate(() => {
    const main = document.querySelector("main");
    const doc = document.documentElement;
    const limit = (main?.getBoundingClientRect().right ?? doc.clientWidth) + 1;
    // The deepest elements poking past the right edge: named in the failure.
    const culprits = Array.from(main?.querySelectorAll("*") ?? [])
      .filter((el) => el.getBoundingClientRect().right > limit)
      .filter((el) =>
        Array.from(el.children).every(
          (child) => child.getBoundingClientRect().right <= limit,
        ),
      )
      .slice(0, 5)
      .map(
        (el) =>
          `${el.tagName.toLowerCase()}[${el.getAttribute("data-slot") ?? ""}] ${(el.textContent ?? "").slice(0, 60)}`,
      );
    return {
      culprits,
      mainScroll: main?.scrollWidth ?? -1,
      mainClient: main?.clientWidth ?? -1,
      docScroll: doc.scrollWidth,
      docClient: doc.clientWidth,
    };
  });
  const detail = `${where} scrolled sideways at 375px: ${JSON.stringify(metrics)}`;
  expect(metrics.mainScroll, detail).toBeLessThanOrEqual(
    metrics.mainClient + 1,
  );
  expect(metrics.docScroll, detail).toBeLessThanOrEqual(metrics.docClient + 1);
}

function jobArticle(page: Page, title: string): Locator {
  return page.getByRole("article", { name: title, exact: true });
}

test.beforeAll(async ({ request }) => {
  await enableAllSources(request);
  await wipeUserState(request);
});

test.afterAll(async ({ request }) => {
  await restoreDismissals(request);
  await wipeUserState(request);
  await enableAllSources(request);
});

test("admin: Run now collects from both sources; a source turned off is skipped (R-033..R-035)", async ({
  page,
}) => {
  test.setTimeout(4 * RUN_TIMEOUT);
  await loginAs(page, "admin");
  await page.goto("/admin/jobs");

  await expect(
    page.getByRole("heading", { name: "Job sources", level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Admin sections" })
      .getByRole("link", { name: "Jobs" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(sourceRow(page, "himalayas")).toBeVisible();
  await expect(sourceRow(page, "remoteok")).toBeVisible();
  await expect(
    page.getByRole("switch", { name: "Collect from Himalayas" }),
  ).toBeChecked();
  await expect(
    page.getByRole("switch", { name: "Collect from RemoteOK" }),
  ).toBeChecked();

  // ---- Run now -> both sources read OK with listed jobs (R-033, R-035) ----
  await runNow(page);
  await expect(async () => {
    await page.reload();
    for (const code of ["himalayas", "remoteok"]) {
      await expect(
        sourceRow(page, code).locator('[data-slot="job-source-outcome"]'),
      ).toHaveAttribute("data-status", "ok", { timeout: 2_000 });
      expect(await listedJobs(page, code)).toBeGreaterThan(0);
    }
  }).toPass({ timeout: RUN_TIMEOUT, intervals: [2_000] });
  await expect(
    sourceRow(page, "himalayas").getByText("OK", { exact: true }),
  ).toBeVisible();
  await expect(sourceRow(page, "himalayas").locator("time")).toHaveText(/UTC$/);

  // ---- RemoteOK off; persisted across a reload (R-034) --------------------
  const remoteOk = page.getByRole("switch", { name: "Collect from RemoteOK" });
  await remoteOk.click();
  await expect(remoteOk).not.toBeChecked();
  await expect(sourceRow(page, "remoteok")).toHaveAttribute(
    "data-enabled",
    "false",
  );
  await expect(remoteOk).not.toHaveAttribute("aria-busy", "true");
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Collect from RemoteOK" }),
  ).not.toBeChecked();

  // ---- A run skips the source that is off (AC5, end to end) ---------------
  const himalayasBefore = await lastRunAt(page, "himalayas");
  const remoteOkBefore = await lastRunAt(page, "remoteok");
  expect(himalayasBefore).not.toBeNull();
  expect(remoteOkBefore).not.toBeNull();
  await expect(async () => {
    // A 409 here means the first run still holds the lock: try again.
    await runNow(page);
    await expect(async () => {
      await page.reload();
      expect(await lastRunAt(page, "himalayas")).not.toBe(himalayasBefore);
    }).toPass({ timeout: 20_000, intervals: [2_000] });
  }).toPass({ timeout: RUN_TIMEOUT });
  expect(await lastRunAt(page, "remoteok")).toBe(remoteOkBefore);
  // Off keeps its last outcome: no "Off" status (D47).
  await expect(
    sourceRow(page, "remoteok").locator('[data-slot="job-source-outcome"]'),
  ).toHaveAttribute("data-status", "ok");

  // ---- RemoteOK back on ----------------------------------------------------
  await page.getByRole("switch", { name: "Collect from RemoteOK" }).click();
  await expect(sourceRow(page, "remoteok")).toHaveAttribute(
    "data-enabled",
    "true",
  );
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Collect from RemoteOK" }),
  ).toBeChecked();

  // ---- 375px: the page never scrolls sideways; the table scrolls inside ----
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(sourceRow(page, "himalayas")).toBeVisible();
  await expectNoSidewaysScroll(page, "/admin/jobs");
});

test("user: list, filters, saved search, fit, tailored draft, Applied, dismiss (R-012..R-031)", async ({
  page,
  request,
}) => {
  test.setTimeout(4 * RUN_TIMEOUT);
  await seedMasterCv(request);
  await loginAs(page, "user");

  // ---- /jobs: the fixture jobs, each with a fit once the worker scored it --
  await page.goto("/jobs");
  await expect(
    page.getByRole("heading", { name: "Jobs", level: 1 }),
  ).toBeVisible();
  await expect(async () => {
    await page.reload();
    await expect(jobArticle(page, BACKEND_JOB)).toBeVisible({ timeout: 5_000 });
    await expect(
      jobArticle(page, BACKEND_JOB).locator('[data-slot="fit-badge"]'),
    ).toHaveText(/Fit \d+%/, { timeout: 2_000 });
  }).toPass({ timeout: RUN_TIMEOUT, intervals: [2_000] });
  await expect(jobArticle(page, PLATFORM_JOB)).toBeVisible();

  // ---- search + source filter, held by the URL (R-031) --------------------
  await page.getByRole("searchbox", { name: "Search jobs" }).fill("Python");
  await expect(page).toHaveURL(/[?&]search=Python/);
  await page.getByRole("combobox", { name: "Source" }).click();
  await page.getByRole("option", { name: "Himalayas", exact: true }).click();
  await expect(page).toHaveURL(/[?&]source=himalayas/);
  await expect(page.locator('[data-slot="job-list-item"]')).toHaveCount(1);
  await expect(jobArticle(page, BACKEND_JOB)).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("searchbox", { name: "Search jobs" }),
  ).toHaveValue("Python");
  await expect(page.locator('[data-slot="job-list-item"]')).toHaveCount(1);

  // ---- save it, clear, apply it again -> the same filters -----------------
  await page.getByRole("button", { name: "Saved searches" }).click();
  await page.getByRole("button", { name: "Save current search" }).click();
  const saveDialog = page.getByRole("dialog", { name: "Save current search" });
  await saveDialog.getByLabel("Name").fill(SAVED_SEARCH);
  await saveDialog.getByRole("button", { name: "Save search" }).click();
  await expect(saveDialog).toBeHidden();

  await page.getByRole("button", { name: "Clear all filters" }).click();
  await expect(page).not.toHaveURL(/search=|source=/);
  await expect(
    page.getByRole("searchbox", { name: "Search jobs" }),
  ).toHaveValue("");
  await expect(jobArticle(page, PLATFORM_JOB)).toBeVisible();

  await page.getByRole("button", { name: "Saved searches" }).click();
  await page.getByRole("button", { name: SAVED_SEARCH, exact: true }).click();
  await expect(page).toHaveURL(/[?&]search=Python/);
  await expect(page).toHaveURL(/[?&]source=himalayas/);
  await expect(
    page.getByRole("searchbox", { name: "Search jobs" }),
  ).toHaveValue("Python");
  await expect(page.locator('[data-slot="job-list-item"]')).toHaveCount(1);

  // ---- 375px with a long CV name: no sideways scroll on the list ----------
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(jobArticle(page, BACKEND_JOB)).toBeVisible();
  await expectNoSidewaysScroll(page, "/jobs");
  await page.setViewportSize({ width: 1280, height: 800 });

  // ---- the job: its fit, matched and missing (R-012) -----------------------
  await jobArticle(page, BACKEND_JOB)
    .getByRole("link", { name: BACKEND_JOB })
    .click();
  await expect(page).toHaveURL(/\/jobs\/view\?id=/);
  await expect(
    page.getByRole("heading", { name: BACKEND_JOB, level: 1 }),
  ).toBeVisible();
  const fitList = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Your fit" }) });
  await expect(fitList.getByRole("heading", { name: MASTER_CV })).toBeVisible();
  await expect(fitList.locator('[data-slot="fit-badge"]')).toHaveText(
    /Fit \d+%/,
  );
  const matched = fitList.locator(
    '[data-slot="fit-keyword-group"][data-kind="matched"]',
  );
  const missing = fitList.locator(
    '[data-slot="fit-keyword-group"][data-kind="missing"]',
  );
  await expect(matched.getByText(/python/i).first()).toBeVisible();
  await expect(missing.getByRole("listitem").first()).toBeVisible();

  await page.setViewportSize({ width: 375, height: 812 });
  await expect(fitList.getByRole("heading", { name: MASTER_CV })).toBeVisible();
  await expectNoSidewaysScroll(page, "/jobs/view");
  await page.setViewportSize({ width: 1280, height: 800 });

  // ---- Start application -> CV -> Tailor by keywords -> Create draft -------
  await page.getByRole("button", { name: "Start application" }).click();
  const start = page.getByRole("dialog", { name: "Start an application" });
  await start.getByRole("radio", { name: MASTER_CV }).click();
  await start.getByRole("radio", { name: "Tailor by keywords" }).click();
  await start.getByRole("button", { name: "Create draft" }).click();

  await expect(page).toHaveURL(/\/applications\/new-with-cv\?id=[^&]+&step=cv/);
  await expect(page.getByText(`Copied from ${MASTER_CV}`)).toBeVisible();

  // R-028: the fit of the copy against the job description.
  const fitPanel = page.locator('[data-slot="cv-fit-panel"]');
  await expect(fitPanel).toHaveAttribute("data-state", "ready");
  await expect(
    fitPanel.getByRole("button", { name: "CV fit for this job" }),
  ).toBeVisible();
  await expect(fitPanel.locator('[data-slot="fit-badge"]')).toHaveText(
    /Fit \d+%/,
  );
  await expect(
    fitPanel.locator('[data-slot="fit-keyword-group"][data-kind="matched"]'),
  ).toContainText(/python/i);

  // R-025: "Show changes" lists what the keyword tailoring reordered.
  await expect(
    page.getByRole("list", { name: "Reordered by job match" }),
  ).toHaveCount(0);
  await page.getByRole("switch", { name: "Show changes" }).click();
  const moves = page.getByRole("list", { name: "Reordered by job match" });
  await expect(moves).toBeVisible();
  await expect(moves).toContainText("Skill categories");
  await expect(moves).toContainText("Bullets reordered by job match");
  await expect(
    page.locator('[data-slot="cv-diff-count"][data-reordered]').first(),
  ).toContainText("reordered");

  // The draft CV step at 375px: no sideways scroll either.
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(fitPanel).toBeVisible();
  await expectNoSidewaysScroll(page, "/applications/new-with-cv (step 2)");
  await page.setViewportSize({ width: 1280, height: 800 });

  // ---- finish -> the job reads "Applied" and links the application (R-030) --
  const finish = page.getByRole("button", { name: "Finish" });
  await expect(finish).toBeEnabled();
  await finish.click();
  await expect(page).toHaveURL(/\/applications$/);

  await page.goto("/jobs");
  const applied = jobArticle(page, BACKEND_JOB).getByRole("link", {
    name: "Applied",
    exact: true,
  });
  await expect(applied).toBeVisible();
  await expect(applied).toHaveAttribute("href", /\/applications\?focus=/);

  // ---- start again -> "Open application" (R-021) ---------------------------
  await jobArticle(page, BACKEND_JOB)
    .getByRole("button", { name: "Start application" })
    .click();
  const again = page.getByRole("dialog", { name: "Start an application" });
  await again.getByRole("button", { name: "Create draft" }).click();
  await expect(
    again.getByText("You already have an application for this job"),
  ).toBeVisible();
  await expect(
    again.getByRole("link", { name: "Open application" }),
  ).toHaveAttribute("href", /\/applications\?focus=/);
  await again.getByRole("button", { name: "Close" }).first().click();
  await expect(again).toBeHidden();

  // ---- dismiss another job -> gone; Show dismissed -> Restore (R-029) ------
  await jobArticle(page, PLATFORM_JOB)
    .getByRole("button", { name: "Dismiss" })
    .click();
  await expect(jobArticle(page, PLATFORM_JOB)).toHaveCount(0);

  await page.getByLabel("Show dismissed").click();
  await expect(page).toHaveURL(/include_dismissed=/);
  const dismissed = jobArticle(page, PLATFORM_JOB);
  await expect(dismissed).toBeVisible();
  await expect(dismissed.getByText("Dismissed", { exact: true })).toBeVisible();
  await dismissed.getByRole("button", { name: "Restore" }).click();
  await expect(
    dismissed.getByRole("button", { name: "Dismiss" }),
  ).toBeVisible();

  await page.getByLabel("Show dismissed").click();
  await expect(page).not.toHaveURL(/include_dismissed=/);
  await expect(jobArticle(page, PLATFORM_JOB)).toBeVisible();
});
