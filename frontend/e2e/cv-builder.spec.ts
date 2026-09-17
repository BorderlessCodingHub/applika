import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * Master CV builder against the REAL stack (KODI-002 / R-001, R-002, R-003).
 *
 * Drives the whole life of a master CV through the UI — create it, see it in
 * the list, edit it, delete it — and then proves the cap is visible: at three
 * CVs the create affordance is really disabled and says the limit is three.
 *
 * The suite shares ONE real database (`workers: 1`), so this spec cleans up
 * after itself. Nothing in the seed creates a base CV, so every row under
 * `/base-cvs` for the seeded `user` belongs to this spec and is fair game.
 */

const CV_NAME = "E2E master CV";
const CV_RENAMED = "E2E master CV, edited";

function apiHeaders() {
  return {
    Cookie: authCookieHeader("user"),
    "Content-Type": "application/json",
  };
}

/** Delete every master CV the seeded user holds. */
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

/** Create a master CV out of band, to reach a starting state quickly. */
async function seedBaseCv(request: APIRequestContext, name: string) {
  const response = await request.post(apiUrl("/base-cvs"), {
    headers: apiHeaders(),
    data: {
      name,
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
      certifications: [],
      languages: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * Dismiss the cookie notice.
 *
 * It is a `z-40` FIXED panel in the bottom-right corner, and the editor's
 * submit footer is `z-30` STICKY in that same corner — so until the notice is
 * dismissed it sits on top of "Create CV" and "Save changes" and swallows the
 * click. A real user dismisses it once and never sees it again; every test here
 * starts from a fresh browser context with empty localStorage, so every test
 * has to do what that user did. This is a real first-visit overlap, reported
 * upward as a finding, not worked around silently.
 */
async function dismissCookieNotice(page: Page) {
  const notice = page.getByRole("dialog", { name: "Cookie notice" });
  await notice.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
  if (await notice.isVisible()) {
    await notice.getByRole("button", { name: "Got it" }).click();
    await expect(notice).toBeHidden();
  }
}

/** Fill the fields the form requires. */
async function fillRequired(page: Page, label: string) {
  await page.getByLabel("CV label", { exact: true }).fill(label);
  await page.getByLabel("Full name", { exact: true }).fill("E2E Candidate");
  await page.getByLabel("Headline", { exact: true }).fill("Senior Engineer");
  await page
    .getByLabel("Email", { exact: true })
    .fill("e2e-user@e2e.applika.dev");
  await page.getByLabel("Location", { exact: true }).fill("Remote");
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Written by the E2E suite against the real stack.");
}

test.beforeEach(async ({ request }) => {
  await wipeBaseCvs(request);
});

test.afterEach(async ({ request }) => {
  await wipeBaseCvs(request);
});

test("a master CV can be created, listed, edited and deleted", async ({
  page,
}) => {
  await loginAs(page, "user");
  await page.goto("/cvs");
  await dismissCookieNotice(page);

  // ---- create ---------------------------------------------------------
  await expect(
    page.getByRole("heading", { name: "CVs", level: 1 }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Create your first CV" }).click();
  await expect(page).toHaveURL(/\/cvs\/new/);

  await fillRequired(page, CV_NAME);
  await page.getByLabel("Add a skill").fill("Python");
  await page.getByLabel("Add a skill").press("Enter");

  await page.getByRole("button", { name: "Add experience" }).click();
  const role = page.getByRole("group", { name: "experience 1" });
  await role.getByLabel("Company", { exact: true }).fill("Applika");
  await role.getByLabel("Role", { exact: true }).fill("Backend Engineer");
  await role.getByLabel("Period", { exact: true }).fill("2024 — Present");
  // The UI calls it a highlight; the wire calls it `bullets`. Round-trip it.
  await role.getByRole("button", { name: "Add highlight" }).click();
  await role
    .getByLabel("Highlight 1", { exact: true })
    .fill("Cut settlement latency by 40%");

  await page.getByRole("button", { name: "Create CV" }).click();

  // ---- list -----------------------------------------------------------
  await expect(page).toHaveURL(/\/cvs$/);
  await expect(page.getByText(CV_NAME, { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: `Edit ${CV_NAME}` }),
  ).toBeVisible();

  // ---- edit -----------------------------------------------------------
  await page.getByRole("link", { name: `Edit ${CV_NAME}` }).click();
  await expect(page).toHaveURL(/\/cvs\/editor\?id=/);

  const label = page.getByLabel("CV label", { exact: true });
  // What came back off the wire is what the form opens with.
  await expect(label).toHaveValue(CV_NAME);
  await expect(page.getByRole("group", { name: "experience 1" })).toBeVisible();
  const savedRole = page.getByRole("group", { name: "experience 1" });
  await expect(savedRole.getByLabel("Company", { exact: true })).toHaveValue(
    "Applika",
  );
  await expect(
    savedRole.getByLabel("Highlight 1", { exact: true }),
  ).toHaveValue("Cut settlement latency by 40%");

  await label.fill(CV_RENAMED);
  await page.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/cvs$/);
  await expect(page.getByText(CV_RENAMED, { exact: true })).toBeVisible();
  await expect(page.getByText(CV_NAME, { exact: true })).toHaveCount(0);

  // ---- delete ---------------------------------------------------------
  await page.getByRole("button", { name: `Delete ${CV_RENAMED}` }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Delete this master CV?")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  await expect(page.getByText(CV_RENAMED, { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "No master CVs yet" }),
  ).toBeVisible();
});

test("at three master CVs the create affordance is disabled and says why", async ({
  page,
  request,
}) => {
  await seedBaseCv(request, "E2E CV one");
  await seedBaseCv(request, "E2E CV two");
  await seedBaseCv(request, "E2E CV three");

  await loginAs(page, "user");
  await page.goto("/cvs");

  const create = page.getByRole("button", { name: "New master CV" });
  await expect(create).toBeVisible();
  await expect(create).toBeDisabled();
  // The words are ON SCREEN — not a tooltip, not a title attribute.
  await expect(page.getByText("the limit is three")).toBeVisible();
  await expect(page.getByRole("link", { name: "New master CV" })).toHaveCount(
    0,
  );
});

test("the API refuses a fourth master CV and the user is told what it said", async ({
  page,
  request,
}) => {
  await seedBaseCv(request, "E2E CV one");
  await seedBaseCv(request, "E2E CV two");

  await loginAs(page, "user");
  // Straight to the form with two CVs in hand, then a third lands out of band
  // between the render and the submit — the race AC2 names. The server is the
  // only thing that can see it, and its message is what the user reads.
  await page.goto("/cvs/new");
  await dismissCookieNotice(page);
  await fillRequired(page, "E2E CV four");
  await seedBaseCv(request, "E2E CV three");

  await page.getByRole("button", { name: "Create CV" }).click();

  // Whatever the API put in `detail`, verbatim, in a toast.
  await expect(page.getByText(/limit/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/cvs\/new/);
});
