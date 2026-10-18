import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import { SEEDED_USERS, apiUrl, loginAs, type SeededRole } from "./support/auth";
import {
  addByUsername,
  betaRow,
  expectOk,
  headers,
  openAs,
  openFeaturePage,
  rail,
  removeUser,
  restoreCvsSeedState,
  setListed,
  settleFeatures,
} from "./support/beta-features";

/**
 * The `cvs` feature end to end against the REAL stack (PRD 0015).
 *
 * The CV builder, the CV copies and the drafts sit behind `cvs` the way the
 * job board sits behind `jobs` (PRD 0013): the API answers 404 without it and
 * the web hides the CVs entry, the CV link, the Drafts tab and "New with CV".
 * The admin adds and removes `e2e-discord` at `/admin/features/view?key=cvs`;
 * e2e-discord follows on its next page load. No `page.route`, no mocked API.
 *
 * The seed (`backend/app/scripts/seed_e2e.py`, every run) starts `cvs` in
 * beta with `e2e-user` on the list, `e2e-discord` off it (and off `jobs`) and
 * no opt-out of `e2e-admin`. Serial: one feature row, one beta list, and the
 * data e2e-discord creates while it has `cvs` is what the later tests read.
 * `beforeAll` and `afterAll` delete e2e-discord's CVs, drafts and
 * applications and put the seed state back (both features in beta,
 * e2e-discord off both lists, the admin's `cvs` opt-out gone), even when a
 * test fails.
 */

test.describe.configure({ mode: "serial" });

/** The `cvs` row's name, from migration `f28e3d9705dd`. */
const FEATURE_NAME = "CV builder";
const DISCORD = SEEDED_USERS.discord.username;
const ADMIN = SEEDED_USERS.admin.username;

/** The six entries no feature gates; `cvs` and `jobs` add one each. */
const UNGATED_LINKS = 6;

/** Every CV route the gate covers: each is the app's "page not found" without `cvs`. */
const CV_ROUTES = [
  "/cvs",
  "/cvs/new",
  "/cvs/editor?id=1",
  "/applications/cv?id=1",
  "/applications/new-with-cv",
] as const;

const NOT_FOUND = "Oops! Page not found";
const INVITATION = "Create a master CV to see how well you fit each job";
const RUN_TIMEOUT = 150_000;

const stamp = Date.now();
const MASTER_CV = `E2E cvs-beta master CV ${stamp}`;
const APP_ROLE = `Cvs Beta Engineer ${stamp}`;
const APP_COMPANY = `Cvs Beta Co ${stamp}`;
const DRAFT_ROLE = `Cvs Beta Draft ${stamp}`;

/** What e2e-discord made while it had `cvs`, and how the API returned it then. */
const made: {
  baseCvId?: string;
  applicationId?: string;
  draftId?: string;
  baseCv?: unknown;
  copy?: unknown;
  draft?: unknown;
} = {};

async function get(
  request: APIRequestContext,
  role: SeededRole,
  path: string,
): Promise<APIResponse> {
  return request.get(apiUrl(path), { headers: headers(role) });
}

async function getJson<T>(
  request: APIRequestContext,
  role: SeededRole,
  path: string,
): Promise<T> {
  const response = await get(request, role, path);
  await expectOk(response);
  return (await response.json()) as T;
}

/**
 * e2e-discord's CVs, drafts and applications gone (a CV copy goes with its
 * application). Deleting them needs `cvs`, so e2e-discord is on the list for
 * the length of the wipe.
 */
async function wipeDiscordData(request: APIRequestContext) {
  await setListed(request, "cvs", "discord", true);
  try {
    const drafts = await getJson<Array<{ id: string }>>(
      request,
      "discord",
      "/applications/drafts",
    );
    for (const draft of drafts) {
      await expectOk(
        await request.delete(apiUrl(`/applications/drafts/${draft.id}`), {
          headers: headers("discord"),
        }),
      );
    }
    const apps = await getJson<Array<{ id: string }>>(
      request,
      "discord",
      "/applications",
    );
    for (const app of apps) {
      await expectOk(
        await request.delete(apiUrl(`/applications/${app.id}`), {
          headers: headers("discord"),
        }),
      );
    }
    const cvs = await getJson<Array<{ id: string }>>(
      request,
      "discord",
      "/base-cvs",
    );
    for (const cv of cvs) {
      await expectOk(
        await request.delete(apiUrl(`/base-cvs/${cv.id}`), {
          headers: headers("discord"),
        }),
      );
    }
  } finally {
    await setListed(request, "cvs", "discord", false);
  }
}

function railCvs(page: Page): Locator {
  return rail(page).getByRole("link", { name: "CVs", exact: true });
}

async function openDashboard(page: Page) {
  return settleFeatures(page, () => page.goto("/dashboard"));
}

/** The rail's entry count, and CVs with its "Beta" or absent. */
async function expectRail(page: Page, links: number, cvs: "beta" | "none") {
  await expect(rail(page).getByRole("link")).toHaveCount(links);
  if (cvs === "none") {
    await expect(railCvs(page)).toHaveCount(0);
    return;
  }
  await expect(railCvs(page)).toBeVisible();
  await expect(railCvs(page)).toHaveAccessibleDescription("Beta");
  await expect(railCvs(page)).toHaveText(/^CVs Beta$/);
}

/** Every request the page sends for a CV, a CV copy or a draft. */
function watchCvRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on("request", (request) => {
    const { pathname } = new URL(request.url());
    if (
      /\/base-cvs(\/|$)/.test(pathname) ||
      /\/applications\/drafts(\/|$)/.test(pathname) ||
      /\/applications\/[^/]+\/cv(\/|$)/.test(pathname)
    ) {
      seen.push(`${request.method()} ${pathname}`);
    }
  });
  return seen;
}

/** The applications page, its list loaded. */
async function openApplications(page: Page) {
  await page.goto("/applications");
  await expect(
    page.getByRole("heading", { name: "Applications", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "New Application" }),
  ).toBeVisible();
}

function cvLink(page: Page): Locator {
  return page.getByRole("link", {
    name: `CV for ${APP_ROLE} at ${APP_COMPANY}`,
  });
}

async function firstPlatformId(request: APIRequestContext): Promise<string> {
  const data = await getJson<{ platforms: Array<{ id: string }> }>(
    request,
    "discord",
    "/supports",
  );
  expect(data.platforms.length).toBeGreaterThan(0);
  return data.platforms[0].id;
}

function yesterday(): string {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/** The jobs on the board (as the admin): a collection run first if there are none yet. */
async function ensureJobs(request: APIRequestContext) {
  const page = await getJson<{ total: number }>(request, "admin", "/jobs");
  if (page.total > 0) return;
  const run = await request.post(apiUrl("/admin/jobs/runs"), {
    headers: headers("admin"),
  });
  // 409: a run is already going, which fills the board just the same.
  expect([202, 409], await run.text()).toContain(run.status());
  await expect(async () => {
    const after = await getJson<{ total: number }>(request, "admin", "/jobs");
    expect(after.total).toBeGreaterThan(0);
  }).toPass({ timeout: RUN_TIMEOUT, intervals: [2_000] });
}

test.beforeAll(async ({ request }) => {
  await restoreCvsSeedState(request);
  await wipeDiscordData(request);
});

test.afterAll(async ({ request }) => {
  await wipeDiscordData(request);
  await restoreCvsSeedState(request);
});

test("e2e-discord without cvs: no CVs entry, the CV routes are not found, no Drafts, no New with CV, the API answers 404 (AC2, AC7)", async ({
  page,
  request,
}) => {
  await loginAs(page, "discord");
  const seen = watchCvRequests(page);

  expect(await openDashboard(page)).toEqual([]);
  await expectRail(page, UNGATED_LINKS, "none");

  for (const route of CV_ROUTES) {
    await page.goto(route);
    await expect(page.getByText(NOT_FOUND), route).toBeVisible();
  }

  await openApplications(page);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await expect(page.getByRole("tab", { name: /Drafts/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New with CV" })).toHaveCount(0);

  // The web only follows the API: the API is the rule.
  expect((await get(request, "discord", "/base-cvs")).status()).toBe(404);
  expect((await get(request, "discord", "/applications/drafts")).status()).toBe(
    404,
  );
  // Not one CV or draft request left the browser.
  expect(seen).toEqual([]);
});

test("an admin adds e2e-discord to cvs: CVs and its Beta label show, and the CV routes open (AC1, AC3)", async ({
  page,
  browser,
  request,
}) => {
  const discord = await openAs(browser, "discord");
  try {
    await loginAs(page, "admin");
    await openFeaturePage(page, "cvs", FEATURE_NAME);
    await addByUsername(page, DISCORD);
    await expect(
      betaRow(page, DISCORD).locator(
        '[data-slot="feature-beta-user-added-by"]',
      ),
    ).toHaveText(ADMIN);

    expect(await openDashboard(discord)).toEqual(["cvs"]);
    await expectRail(discord, UNGATED_LINKS + 1, "beta");

    await discord.goto("/cvs");
    const heading = discord.getByRole("heading", { name: "CVs", level: 1 });
    await expect(heading).toBeVisible();
    // The label sits beside the h1, never inside it.
    const badge = discord.locator('main [data-slot="beta-badge"]');
    await expect(badge).toHaveText("Beta");
    await expect(heading.locator('[data-slot="beta-badge"]')).toHaveCount(0);
    await expect(discord.getByText(NOT_FOUND)).toHaveCount(0);

    // What e2e-discord owns while it has cvs: a master CV, an application
    // with its CV copy, and a draft. AC5 reads them back later.
    const cvResponse = await request.post(apiUrl("/base-cvs"), {
      headers: headers("discord"),
      data: {
        name: MASTER_CV,
        full_name: "E2E Discord",
        headline: "Backend Engineer",
        location: "Remote",
        email: SEEDED_USERS.discord.email,
        phone: null,
        summary: "Seeded by the cvs-beta E2E suite.",
        links: [],
        skills: [
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
            bullets: ["Built Python services with FastAPI on PostgreSQL"],
          },
        ],
        projects: [],
        education: [],
        certifications: [],
        languages: [],
      },
    });
    await expectOk(cvResponse);
    made.baseCvId = ((await cvResponse.json()) as { id: string }).id;

    const platformId = await firstPlatformId(request);
    const appResponse = await request.post(apiUrl("/applications"), {
      headers: headers("discord"),
      data: {
        company: { name: APP_COMPANY, url: null },
        platform_id: platformId,
        role: APP_ROLE,
        mode: "active",
        application_date: yesterday(),
      },
    });
    await expectOk(appResponse);
    made.applicationId = ((await appResponse.json()) as { id: string }).id;
    await expectOk(
      await request.post(apiUrl(`/applications/${made.applicationId}/cv`), {
        headers: headers("discord"),
        data: { base_cv_id: made.baseCvId },
      }),
    );

    const draftResponse = await request.post(apiUrl("/applications/drafts"), {
      headers: headers("discord"),
      data: {
        company_id: null,
        company_name: APP_COMPANY,
        role: DRAFT_ROLE,
        platform_id: platformId,
        mode: "active",
        application_date: yesterday(),
      },
    });
    await expectOk(draftResponse);
    made.draftId = ((await draftResponse.json()) as { id: string }).id;

    made.baseCv = await getJson(
      request,
      "discord",
      `/base-cvs/${made.baseCvId}`,
    );
    made.copy = await getJson(
      request,
      "discord",
      `/applications/${made.applicationId}/cv`,
    );
    made.draft = await getJson(
      request,
      "discord",
      `/applications/drafts/${made.draftId}`,
    );

    // With cvs the applications page has its tabs, New with CV and the CV link.
    await openApplications(discord);
    await expect(discord.getByRole("tab", { name: /Drafts/ })).toBeVisible();
    await expect(
      discord.getByRole("link", { name: "New with CV" }),
    ).toBeVisible();
    await expect(cvLink(discord)).toBeVisible();
  } finally {
    await discord.context().close();
  }
});

test("with jobs but without cvs: no fit, no Start application, no invitation, and the server sends no fit (AC4)", async ({
  page,
  request,
}) => {
  test.setTimeout(2 * RUN_TIMEOUT);
  await ensureJobs(request);
  await setListed(request, "jobs", "discord", true);

  // With both features, e2e-discord's master CV gets a fit from the worker.
  let jobId = "";
  await expect(async () => {
    const jobs = await getJson<{
      items: Array<{ id: string; best_fit: unknown }>;
    }>(request, "discord", "/jobs?per_page=50");
    const fitted = jobs.items.find((job) => job.best_fit !== null);
    expect(fitted, "a job with a fit for e2e-discord").toBeDefined();
    jobId = fitted!.id;
  }).toPass({ timeout: RUN_TIMEOUT, intervals: [2_000] });

  // The admin takes e2e-discord off cvs; jobs stays.
  await loginAs(page, "admin");
  await openFeaturePage(page, "cvs", FEATURE_NAME);
  await removeUser(page, DISCORD);
  await page.context().clearCookies();

  await loginAs(page, "discord");
  const seen = watchCvRequests(page);
  expect(await openDashboard(page)).toEqual(["jobs"]);
  await expectRail(page, UNGATED_LINKS + 1, "none");
  await expect(
    rail(page).getByRole("link", { name: "Jobs", exact: true }),
  ).toBeVisible();

  // The server sends no fit: read off the browser's own GET /jobs.
  const listResponse = page.waitForResponse(
    (response) =>
      response.url().split("?")[0] === apiUrl("/jobs") &&
      response.request().method() === "GET",
  );
  await page.goto("/jobs");
  const list = (await (await listResponse).json()) as {
    items: Array<{ best_fit: unknown }>;
  };
  expect(list.items.length).toBeGreaterThan(0);
  expect(list.items.every((job) => job.best_fit === null)).toBe(true);

  await expect(
    page.getByRole("heading", { name: "Jobs", level: 1 }),
  ).toBeVisible();
  await expect(
    page.locator('[data-slot="job-list-item"]').first(),
  ).toBeVisible();
  await expect(
    page.getByText("Remote jobs from Himalayas and RemoteOK.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-slot="fit-badge"]')).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start application" }),
  ).toHaveCount(0);
  await expect(page.getByText(INVITATION)).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Sort" })).toHaveCount(0);

  // The job's own page: no fit list, no Start (so no "Tailor by keywords").
  const detailResponse = page.waitForResponse(
    (response) =>
      response.url().split("?")[0] === apiUrl(`/jobs/${jobId}`) &&
      response.request().method() === "GET",
  );
  await page.goto(`/jobs/view?id=${jobId}`);
  const detail = (await (await detailResponse).json()) as {
    fits: unknown[];
    best_fit: unknown;
  };
  expect(detail.fits).toEqual([]);
  expect(detail.best_fit).toBeNull();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your fit" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start application" }),
  ).toHaveCount(0);
  await expect(page.getByText("Tailor by keywords")).toHaveCount(0);
  await expect(page.getByText(INVITATION)).toHaveCount(0);

  // Starting a draft from a job needs both features.
  const fromJob = await request.post(apiUrl("/applications/drafts/from-job"), {
    headers: headers("discord"),
    data: { job_id: jobId },
  });
  expect(fromJob.status()).toBe(404);
  expect(seen).toEqual([]);
});

test("losing cvs keeps the master CV, the CV copy and the draft, and getting it back returns them unchanged (AC5)", async ({
  page,
  browser,
  request,
}) => {
  expect(made.baseCvId && made.applicationId && made.draftId).toBeTruthy();
  const discord = await openAs(browser, "discord");
  try {
    // Without cvs (the previous test took it away): the data is out of reach…
    for (const path of [
      "/base-cvs",
      `/base-cvs/${made.baseCvId}`,
      `/applications/${made.applicationId}/cv`,
      "/applications/drafts",
      `/applications/drafts/${made.draftId}`,
    ]) {
      expect((await get(request, "discord", path)).status(), path).toBe(404);
    }
    // …and the applications keep working, without the CV link.
    const apps = await getJson<Array<{ id: string }>>(
      request,
      "discord",
      "/applications",
    );
    expect(apps.map((app) => app.id)).toContain(made.applicationId);
    expect(await openDashboard(discord)).not.toContain("cvs");
    await openApplications(discord);
    await expect(discord.getByText(APP_ROLE, { exact: true })).toBeVisible();
    await expect(cvLink(discord)).toHaveCount(0);
    await expect(discord.getByRole("tab", { name: /Drafts/ })).toHaveCount(0);

    // The admin adds e2e-discord back.
    await loginAs(page, "admin");
    await openFeaturePage(page, "cvs", FEATURE_NAME);
    await addByUsername(page, DISCORD);

    expect(
      await getJson(request, "discord", `/base-cvs/${made.baseCvId}`),
    ).toEqual(made.baseCv);
    expect(
      await getJson(
        request,
        "discord",
        `/applications/${made.applicationId}/cv`,
      ),
    ).toEqual(made.copy);
    expect(
      await getJson(request, "discord", `/applications/drafts/${made.draftId}`),
    ).toEqual(made.draft);

    expect(await openDashboard(discord)).toContain("cvs");
    await expect(railCvs(discord)).toHaveAccessibleDescription("Beta");
    await openApplications(discord);
    await expect(cvLink(discord)).toBeVisible();
    await expect(discord.getByRole("tab", { name: /Drafts/ })).toBeVisible();

    await discord.goto(`/cvs/editor?id=${made.baseCvId}`);
    await expect(
      discord.getByRole("heading", { name: "Edit master CV", level: 1 }),
    ).toBeVisible();
    await expect(discord.getByLabel("CV label")).toHaveValue(MASTER_CV);

    // The admin removes e2e-discord again: hidden again on the next load.
    await removeUser(page, DISCORD);
    expect(await openDashboard(discord)).not.toContain("cvs");
    await expect(railCvs(discord)).toHaveCount(0);
    await discord.goto("/cvs");
    await expect(discord.getByText(NOT_FOUND)).toBeVisible();
  } finally {
    await discord.context().close();
  }
});

test("e2e-user, enrolled by the seed, sees CVs with its Beta label (AC3)", async ({
  page,
}) => {
  await loginAs(page, "user");
  expect(await openDashboard(page)).toContain("cvs");
  await expect(railCvs(page)).toHaveAccessibleDescription("Beta");
  await page.goto("/cvs");
  await expect(
    page.getByRole("heading", { name: "CVs", level: 1 }),
  ).toBeVisible();
  await expect(page.locator('main [data-slot="beta-badge"]')).toHaveText(
    "Beta",
  );
});
