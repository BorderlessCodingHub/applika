import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type Locator,
  type Page,
} from "@playwright/test";

import {
  SEEDED_USERS,
  apiUrl,
  authCookieHeader,
  loginAs,
  seededUserId,
  type SeededRole,
} from "./support/auth";

/**
 * Beta features end to end against the REAL stack (PRD 0013, KODI-054, T050).
 *
 * The admin screens at `/admin/features` drive the real KODI-052 API and the
 * real KODI-053 gate: the rail, `/jobs` and `GET /jobs` follow what the admin
 * does, on the next page load, with no deploy (AC7). No `page.route`, no
 * mocked API.
 *
 * The seed (`backend/app/scripts/seed_e2e.py`, every run) starts `jobs` in
 * beta with `e2e-user` on the list, `e2e-discord` off it and no opt-out of
 * `e2e-admin`. Serial: one feature row, one beta list. `afterAll` puts that
 * state back even when a test fails (stage beta, `e2e-discord` and `e2e-admin`
 * off the list, the admin's opt-out deleted), so a rerun or the next spec
 * starts from the seed.
 */

test.describe.configure({ mode: "serial" });

const FEATURE_PAGE = "/admin/features/view?key=jobs";
/** The `jobs` row's name, from migration `641001baff09`. */
const FEATURE_NAME = "Job board";
const DISCORD = SEEDED_USERS.discord.username;
const ADMIN = SEEDED_USERS.admin.username;

/**
 * The admin's primary nav without `jobs`: six ungated entries plus CVs (an
 * admin has `cvs` as an admin); `jobs` adds one, an admin adds "Admin".
 */
const BASE_LINKS = 7;
/** `e2e-discord` has no `cvs` (the seed leaves it off that list): one fewer. */
const DISCORD_BASE_LINKS = BASE_LINKS - 1;

/** AC7: "applies from the user's next request … no deploy and no restart". */
const AC7_BUDGET_MS = 60_000;

const REASON = {
  admin: "You have this feature because you're an admin.",
  off: "You don't have this feature because you turned it off.",
  list: "You have this feature because you're on the beta list.",
  general: "You have this feature because it's released to everyone.",
} as const;

const HINT = {
  list: "You're on the beta list, so you keep access. Remove yourself from the list to hide it.",
  general:
    "Released to everyone. Your choice applies again if it moves back to beta.",
} as const;

function headers(role: SeededRole) {
  return { Cookie: authCookieHeader(role), "Content-Type": "application/json" };
}

async function expectOk(
  response: Awaited<ReturnType<APIRequestContext["get"]>>,
) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** The seeded state back: stage beta, discord and admin off the list, no opt-out. */
async function restoreSeedState(request: APIRequestContext) {
  await expectOk(
    await request.patch(apiUrl("/admin/features/jobs"), {
      headers: headers("admin"),
      data: { stage: "beta" },
    }),
  );
  for (const role of ["discord", "admin"] as const) {
    await expectOk(
      await request.delete(
        apiUrl(`/admin/features/jobs/users/${seededUserId(role)}`),
        { headers: headers("admin") },
      ),
    );
  }
  await expectOk(
    await request.delete(apiUrl("/admin/features/jobs/opt-out"), {
      headers: headers("admin"),
    }),
  );
}

/** The usernames on the `jobs` beta list, as the API has them. */
async function betaListUsernames(request: APIRequestContext) {
  const response = await request.get(
    apiUrl("/admin/features/jobs/users?per_page=100"),
    { headers: headers("admin") },
  );
  await expectOk(response);
  const body = (await response.json()) as {
    items: Array<{ username: string }>;
  };
  return body.items.map((item) => item.username).sort();
}

async function jobsStatus(request: APIRequestContext, role: SeededRole) {
  const response = await request.get(apiUrl("/jobs"), {
    headers: headers(role),
  });
  return response.status();
}

/** A second, independent browser session for `role`. */
async function openAs(browser: Browser, role: SeededRole): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await loginAs(page, role);
  return page;
}

function rail(page: Page): Locator {
  return page.locator("aside").getByRole("navigation", { name: "Primary" });
}

function railJobs(page: Page): Locator {
  return rail(page).getByRole("link", { name: "Jobs", exact: true });
}

/**
 * Runs `navigate` (a goto or a reload) and waits for its `/users/me/features`
 * answer: the gated Jobs entry joins the rail only after it, so a rail
 * assertion made earlier could pass against the not-yet-gated nav.
 */
async function settleFeatures(page: Page, navigate: () => Promise<unknown>) {
  const features = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname.endsWith("/users/me/features") &&
      response.request().method() === "GET",
  );
  await navigate();
  const body = (await (await features).json()) as {
    features: Array<{ key: string }>;
  };
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(rail(page)).toBeVisible();
  return body.features.some((feature) => feature.key === "jobs");
}

/** Opens the dashboard once the caller's features have answered. */
async function openDashboard(page: Page) {
  return settleFeatures(page, () => page.goto("/dashboard"));
}

/** Reloads the dashboard once the caller's features have answered. */
async function reloadDashboard(page: Page) {
  return settleFeatures(page, () => page.reload());
}

async function expectRail(
  page: Page,
  links: number,
  jobs: "beta" | "general" | "none",
) {
  await expect(rail(page).getByRole("link")).toHaveCount(links);
  if (jobs === "none") {
    await expect(railJobs(page)).toHaveCount(0);
    return;
  }
  await expect(railJobs(page)).toBeVisible();
  if (jobs === "beta") {
    await expect(railJobs(page)).toHaveAccessibleDescription("Beta");
  } else {
    await expect(railJobs(page)).not.toHaveAccessibleDescription(/Beta/);
  }
}

function reason(page: Page): Locator {
  return page.locator('[data-slot="feature-own-access-reason"]');
}

function hint(page: Page): Locator {
  return page.locator('[data-slot="feature-own-access-hint"]');
}

function ownSwitch(page: Page): Locator {
  return page.getByRole("switch", { name: "Use this feature myself" });
}

function betaRow(page: Page, username: string): Locator {
  return page.locator(
    `tr[data-slot="feature-beta-user"][data-username="${username}"]`,
  );
}

async function openFeaturePage(page: Page) {
  await page.goto(FEATURE_PAGE);
  await expect(
    page.getByRole("heading", { name: FEATURE_NAME, level: 1 }),
  ).toBeVisible();
  await expect(reason(page)).toBeVisible();
}

/** Adds `username` through the "Add user" dialog (search by username, AC3). */
async function addByUsername(page: Page, username: string) {
  await page.getByRole("button", { name: "Add user" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Add users to the beta list",
  });
  await dialog.getByRole("searchbox", { name: "Search users" }).fill(username);
  await dialog
    .getByRole("button", { name: `Add ${username}`, exact: true })
    .click();
  await expect(
    dialog.locator('[data-slot="feature-add-user-status"]'),
  ).toHaveText(`${username} is on the beta list now.`);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();
  await expect(betaRow(page, username)).toBeVisible();
}

/** Removes `username` behind its confirm (AC4). */
async function removeUser(page: Page, username: string) {
  await page
    .getByRole("button", { name: `Remove ${username}`, exact: true })
    .click();
  const confirm = page.getByRole("alertdialog");
  await expect(confirm).toContainText(`Remove ${username} from the beta list?`);
  await confirm.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(confirm).toBeHidden();
  await expect(betaRow(page, username)).toHaveCount(0);
}

test.afterAll(async ({ request }) => {
  await restoreSeedState(request);
});

test("the features list shows jobs with its count, stage and the admin's own access (AC1)", async ({
  page,
}) => {
  await loginAs(page, "admin");
  await page.goto("/admin/features");

  await expect(
    page.getByRole("heading", { name: "Features", level: 1 }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Admin sections" })
      .getByRole("link", { name: "Features" }),
  ).toHaveAttribute("aria-current", "page");

  const row = page.locator(
    'tr[data-slot="feature-row"][data-feature-key="jobs"]',
  );
  await expect(row).toHaveAttribute("data-stage", "beta");
  await expect(row.locator('[data-slot="feature-key"]')).toHaveText("jobs");
  // The seed lists e2e-user only; the admin has it as an admin, uncounted.
  await expect(row.locator('[data-slot="feature-beta-count"]')).toHaveText("1");
  await expect(row).toContainText("Not released");
  await expect(row.locator('[data-slot="feature-you"]')).toHaveText(
    "Yes, as an admin",
  );

  await row.getByRole("link", { name: FEATURE_NAME }).click();
  await page.waitForURL("**/admin/features/view?key=jobs");
  await expect(
    page.getByRole("heading", { name: FEATURE_NAME, level: 1 }),
  ).toBeVisible();
  await expect(betaRow(page, SEEDED_USERS.user.username)).toBeVisible();
});

test("an admin turns jobs off for themselves only, and back on (AC8, AC9)", async ({
  page,
  request,
}) => {
  await loginAs(page, "admin");
  expect(await openDashboard(page)).toBe(true);
  await expectRail(page, BASE_LINKS + 2, "beta");

  await openFeaturePage(page);
  await expect(reason(page)).toHaveText(REASON.admin);
  await expect(ownSwitch(page)).toBeChecked();
  await ownSwitch(page).click();
  await expect(reason(page)).toHaveText(REASON.off);
  await expect(ownSwitch(page)).not.toBeChecked();

  expect(await openDashboard(page)).toBe(false);
  await expectRail(page, BASE_LINKS + 1, "none");
  await page.goto("/jobs");
  await expect(page.getByText("Oops! Page not found")).toBeVisible();
  expect(await jobsStatus(request, "admin")).toBe(404);
  // Admin screens are never gated: the admin still runs the job board.
  await page.goto("/admin/jobs");
  await expect(
    page.getByRole("heading", { name: "Job sources", level: 1 }),
  ).toBeVisible();
  // Only the admin's own view changed: the listed user keeps it.
  expect(await jobsStatus(request, "user")).toBe(200);

  await openFeaturePage(page);
  await expect(reason(page)).toHaveText(REASON.off);
  await ownSwitch(page).click();
  await expect(reason(page)).toHaveText(REASON.admin);
  expect(await openDashboard(page)).toBe(true);
  await expectRail(page, BASE_LINKS + 2, "beta");
  expect(await jobsStatus(request, "admin")).toBe(200);
});

test("an admin adds e2e-discord by username and removes them; e2e-discord follows on reload (AC2-AC4, AC7)", async ({
  page,
  browser,
  request,
}) => {
  const discord = await openAs(browser, "discord");
  try {
    // The protected layout wiring: no jobs (and no cvs), six entries, no Jobs.
    expect(await openDashboard(discord)).toBe(false);
    await expectRail(discord, DISCORD_BASE_LINKS, "none");
    expect(await jobsStatus(request, "discord")).toBe(404);

    await loginAs(page, "admin");
    await openFeaturePage(page);

    const started = Date.now();
    await addByUsername(page, DISCORD);
    await expect(
      betaRow(page, DISCORD).locator(
        '[data-slot="feature-beta-user-added-by"]',
      ),
    ).toHaveText(ADMIN);

    expect(await reloadDashboard(discord)).toBe(true);
    await expect(railJobs(discord)).toBeVisible();
    const elapsed = Date.now() - started;
    expect(
      elapsed,
      `the add reached e2e-discord in ${elapsed} ms`,
    ).toBeLessThan(AC7_BUDGET_MS);
    await expectRail(discord, DISCORD_BASE_LINKS + 1, "beta");
    expect(await jobsStatus(request, "discord")).toBe(200);

    // Adding again changes nothing (AC3): the dialog marks them, the API is idempotent.
    await page.getByRole("button", { name: "Add user" }).click();
    const dialog = page.getByRole("dialog", {
      name: "Add users to the beta list",
    });
    await dialog.getByRole("searchbox", { name: "Search users" }).fill(DISCORD);
    await expect(
      dialog.getByRole("button", { name: `${DISCORD} is on the list` }),
    ).toHaveAttribute("aria-disabled", "true");
    await dialog.getByRole("button", { name: "Done" }).click();
    await expectOk(
      await request.put(
        apiUrl(`/admin/features/jobs/users/${seededUserId("discord")}`),
        { headers: headers("admin") },
      ),
    );
    expect(await betaListUsernames(request)).toEqual(
      [DISCORD, SEEDED_USERS.user.username].sort(),
    );

    // Search by username (AC2).
    const search = page.getByRole("searchbox", {
      name: "Search the beta list",
    });
    await search.fill("discord");
    await expect(betaRow(page, DISCORD)).toBeVisible();
    await expect(betaRow(page, SEEDED_USERS.user.username)).toHaveCount(0);
    await search.fill("");
    await expect(betaRow(page, SEEDED_USERS.user.username)).toBeVisible();

    await removeUser(page, DISCORD);
    expect(await reloadDashboard(discord)).toBe(false);
    await expectRail(discord, DISCORD_BASE_LINKS, "none");
    expect(await jobsStatus(request, "discord")).toBe(404);
    // Removing someone who is not on the list changes nothing (AC4).
    await expectOk(
      await request.delete(
        apiUrl(`/admin/features/jobs/users/${seededUserId("discord")}`),
        { headers: headers("admin") },
      ),
    );
    expect(await betaListUsernames(request)).toEqual([
      SEEDED_USERS.user.username,
    ]);
  } finally {
    await discord.context().close();
  }
});

test("release to everyone and move back to beta keep the list and the admin's choice (AC5, AC6, AC10)", async ({
  page,
  browser,
  request,
}) => {
  const listBefore = await betaListUsernames(request);
  const discord = await openAs(browser, "discord");
  try {
    await loginAs(page, "admin");
    await openFeaturePage(page);
    // The admin's own choice, to prove it survives the release (AC10).
    await ownSwitch(page).click();
    await expect(reason(page)).toHaveText(REASON.off);

    await page.getByRole("button", { name: "Release to everyone" }).click();
    let confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(`Release ${FEATURE_NAME} to everyone?`);
    await confirm.getByRole("button", { name: "Cancel" }).click();
    await expect(
      page.locator('[data-slot="feature-header"] [data-stage]'),
    ).toHaveAttribute("data-stage", "beta");

    await page.getByRole("button", { name: "Release to everyone" }).click();
    confirm = page.getByRole("alertdialog");
    await confirm
      .getByRole("button", { name: "Release to everyone", exact: true })
      .click();
    await expect(confirm).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Move back to beta" }),
    ).toBeVisible();
    await expect(
      page.locator('[data-slot="feature-header"] [data-stage]'),
    ).toHaveAttribute("data-stage", "general");

    // General: on for everyone, admins included; the stored choice is kept, locked.
    await expect(reason(page)).toHaveText(REASON.general);
    await expect(hint(page)).toHaveText(HINT.general);
    await expect(ownSwitch(page)).toHaveAttribute("aria-disabled", "true");
    await expect(ownSwitch(page)).not.toBeChecked();
    expect(await betaListUsernames(request)).toEqual(listBefore);

    expect(await openDashboard(discord)).toBe(true);
    await expectRail(discord, DISCORD_BASE_LINKS + 1, "general");
    expect(await jobsStatus(request, "discord")).toBe(200);
    expect(await jobsStatus(request, "admin")).toBe(200);

    // The list stays editable in general (AC6).
    await addByUsername(page, DISCORD);
    await removeUser(page, DISCORD);
    expect(await betaListUsernames(request)).toEqual(listBefore);

    await page.getByRole("button", { name: "Move back to beta" }).click();
    confirm = page.getByRole("alertdialog");
    await expect(confirm).toContainText(`Move ${FEATURE_NAME} back to beta?`);
    await expect(
      confirm.getByText(
        "Users who are neither on this list nor admins lose access.",
        { exact: true },
      ),
    ).toBeVisible();
    await confirm
      .getByRole("button", { name: "Move back to beta", exact: true })
      .click();
    await expect(confirm).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Release to everyone" }),
    ).toBeVisible();

    // Back in beta: the admin's choice counts again, discord loses it, list unchanged.
    await expect(reason(page)).toHaveText(REASON.off);
    expect(await jobsStatus(request, "admin")).toBe(404);
    expect(await reloadDashboard(discord)).toBe(false);
    await expectRail(discord, DISCORD_BASE_LINKS, "none");
    expect(await jobsStatus(request, "discord")).toBe(404);
    expect(await jobsStatus(request, "user")).toBe(200);
    expect(await betaListUsernames(request)).toEqual(listBefore);

    await ownSwitch(page).click();
    await expect(reason(page)).toHaveText(REASON.admin);
  } finally {
    await discord.context().close();
  }
});

test("an admin on the beta list keeps jobs after turning it off, and is told to leave the list (AC11)", async ({
  page,
  request,
}) => {
  await loginAs(page, "admin");
  await openFeaturePage(page);
  await ownSwitch(page).click();
  await expect(reason(page)).toHaveText(REASON.off);

  await addByUsername(page, ADMIN);
  await expect(reason(page)).toHaveText(REASON.list);
  await expect(hint(page)).toHaveText(HINT.list);
  await expect(ownSwitch(page)).toHaveAttribute("aria-disabled", "true");
  await expect(ownSwitch(page)).not.toBeChecked();
  expect(await jobsStatus(request, "admin")).toBe(200);

  await removeUser(page, ADMIN);
  await expect(reason(page)).toHaveText(REASON.off);
  expect(await jobsStatus(request, "admin")).toBe(404);
  await ownSwitch(page).click();
  await expect(reason(page)).toHaveText(REASON.admin);
});
