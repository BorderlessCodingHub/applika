import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

import { apiUrl, authCookieHeader, loginAs } from "./support/auth";

/**
 * The CV builder against the REAL stack (KODI-002 and KODI-003).
 *
 * Two surfaces, one spec, because they are one feature. First the MASTER CV:
 * its whole life through the UI — create, list, edit, delete — and the cap made
 * visible at three. Then the application's CV COPY (KODI-003): picked from a
 * master CV, tailored beside the job description, deleted, picked again, and
 * locked once the application is finalized.
 *
 * The suite shares ONE real database (`workers: 1`), so this spec cleans up
 * after itself. Nothing in the seed creates a base CV or an application, so
 * every row under `/base-cvs` and `/applications` for the seeded `user` belongs
 * to this spec and is fair game.
 */

const CV_NAME = "E2E master CV";
const CV_RENAMED = "E2E master CV, edited";
const CV_TAILORED = "E2E master CV, tailored to Applika";
const COMPANY = "E2E Applika";
const ROLE = "E2E Backend Engineer";
const JOB_DESCRIPTION =
  "We need someone who has run Postgres in anger and can talk about it.";

const COOKIE_NOTICE = '[role="dialog"][aria-label="Cookie notice"]';

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
async function seedBaseCv(
  request: APIRequestContext,
  name: string,
): Promise<string> {
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
  return ((await response.json()) as { id: string }).id;
}

/** Delete every application the seeded user holds, and with it every CV copy. */
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

/** The seeded lookup rows the application endpoints key off. */
async function supports(request: APIRequestContext) {
  const response = await request.get(apiUrl("/supports"), {
    headers: apiHeaders(),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()) as {
    platforms: Array<{ id: string }>;
    steps: Array<{ id: string; strict: boolean }>;
    feedbacks: Array<{ id: string }>;
  };
}

/** Yesterday, as `YYYY-MM-DD`. Never "in the future" whatever the container's clock. */
function yesterday(): string {
  const date = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
}

/** Create an application out of band. `jobDescription` is optional, as on the API. */
async function seedApplication(
  request: APIRequestContext,
  jobDescription: string | null = null,
): Promise<string> {
  const { platforms } = await supports(request);
  const response = await request.post(apiUrl("/applications"), {
    headers: apiHeaders(),
    data: {
      company: { name: COMPANY, url: null },
      platform_id: platforms[0].id,
      role: ROLE,
      mode: "active",
      application_date: yesterday(),
      job_description: jobDescription,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

/** Make the application's CV copy out of band, from a master CV. */
async function seedTailoredCv(
  request: APIRequestContext,
  applicationId: string,
  baseCvId: string,
) {
  const response = await request.post(
    apiUrl(`/applications/${applicationId}/cv`),
    {
      headers: apiHeaders(),
      data: { base_cv_id: baseCvId },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

/** Finalize the application out of band, so the UI meets it already locked. */
async function finalizeApplication(
  request: APIRequestContext,
  applicationId: string,
) {
  const { steps, feedbacks } = await supports(request);
  // Finalizing accepts a STRICT step definition only
  // (`StepDefinitionRepository.get_by_id_strict_only`); any other one is a 404
  // reading "Step not found or is invalid".
  const strictStep = steps.find((step) => step.strict);
  expect(
    strictStep,
    "the seeded supports data has no strict step definition to finalize with",
  ).toBeDefined();

  const response = await request.post(
    apiUrl(`/applications/${applicationId}/finalize`),
    {
      headers: apiHeaders(),
      data: {
        step_id: strictStep!.id,
        feedback_id: feedbacks[0].id,
        finalize_date: yesterday(),
      },
    },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * The control's own centre really belongs to the control, with the cookie
 * notice UP.
 *
 * This is the inverse of the helper this file used to carry. The notice was a
 * bottom-right `z-40` card sitting on top of the editor's `z-30` sticky submit
 * footer, so every test here had to dismiss it before it could click anything.
 * It is now a full-width bar that RESERVES its own height (`dbbfc3a`), so it
 * cannot reach an in-page sticky footer at any breakpoint. Only a real browser
 * has the layout to prove that; jsdom has none.
 */
async function expectReachableWithCookieNoticeUp(page: Page, label: string) {
  await expect(page.locator(COOKIE_NOTICE)).toBeVisible();

  const coveredBy = await page.evaluate(
    ({ noticeSelector, text }) => {
      const button = Array.from(
        document.querySelectorAll<HTMLButtonElement>("button"),
      ).find((element) => element.textContent?.trim() === text);
      if (!button) return "no such button";

      const rect = button.getBoundingClientRect();
      const topmost = document.elementFromPoint(
        Math.round(rect.left + rect.width / 2),
        Math.round(rect.top + rect.height / 2),
      );
      if (topmost && button.contains(topmost)) return null;

      const notice = document.querySelector(noticeSelector);
      if (notice && topmost && notice.contains(topmost)) {
        return "the cookie notice";
      }
      return `<${topmost?.tagName.toLowerCase() ?? "nothing"}>`;
    },
    { noticeSelector: COOKIE_NOTICE, text: label },
  );

  expect(
    coveredBy,
    `"${label}" is not clickable at its own centre while the cookie notice is up`,
  ).toBeNull();
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
  // Applications first: deleting one takes its CV copy with it (AC12), and a
  // master CV can be deleted whatever still points at it (AC4).
  await wipeApplications(request);
  await wipeBaseCvs(request);
});

test.afterEach(async ({ request }) => {
  await wipeApplications(request);
  await wipeBaseCvs(request);
});

test("a master CV can be created, listed, edited and deleted", async ({
  page,
}) => {
  await loginAs(page, "user");
  await page.goto("/cvs");

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

  // The cookie notice is still up, and the sticky submit footer is reachable
  // anyway. This used to be impossible; `dismissCookieNotice` is gone because
  // of it.
  await expectReachableWithCookieNoticeUp(page, "Create CV");
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
  await fillRequired(page, "E2E CV four");
  await seedBaseCv(request, "E2E CV three");

  await page.getByRole("button", { name: "Create CV" }).click();

  // Whatever the API put in `detail`, verbatim, in a toast.
  await expect(page.getByText(/limit/i).first()).toBeVisible();
  await expect(page).toHaveURL(/\/cvs\/new/);
});

/* ---------------------------------------------------------------------------
 * KODI-003 — the application's CV copy.
 * ------------------------------------------------------------------------ */

test("an application's CV copy is picked, tailored, deleted and picked again", async ({
  page,
  request,
}) => {
  // Exactly one master CV, so the picker has nothing left to ask (AC2).
  await seedBaseCv(request, CV_NAME);
  await seedApplication(request);

  await loginAs(page, "user");
  await page.goto("/applications");

  // ---- AC8: the job description is written on the application form -----
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const sheet = page.getByRole("dialog", { name: "Edit Application" });
  await sheet.getByLabel("Job description").fill(JOB_DESCRIPTION);
  await sheet.getByRole("button", { name: "Save changes" }).click();
  await expect(sheet).toBeHidden();

  // ---- AC1 + AC2: the picker, with the lone master CV already chosen ----
  await page
    .getByRole("link", { name: `CV for ${ROLE} at ${COMPANY}` })
    .click();
  await expect(page).toHaveURL(/\/applications\/cv\?id=/);
  await expect(
    page.getByRole("heading", { name: "Application CV", level: 1 }),
  ).toBeVisible();

  const option = page.getByRole("radio");
  await expect(option).toHaveCount(1);
  await expect(option).toBeChecked();

  const create = page.getByRole("button", { name: "Create the CV copy" });
  await expect(create).toBeEnabled();
  await create.click();

  // ---- the copy is a full snapshot, with the job description beside it (AC9)
  const label = page.getByLabel("CV label", { exact: true });
  await expect(label).toHaveValue(CV_NAME);
  await expect(page.getByText(`Copied from ${CV_NAME}`)).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue(
    "E2E Candidate",
  );
  await expect(
    page.getByRole("region", { name: "Job description text" }),
  ).toContainText(JOB_DESCRIPTION);

  // ---- AC6: every field is editable, and the edit sticks ---------------
  await label.fill(CV_TAILORED);
  await page
    .getByLabel("Summary", { exact: true })
    .fill("Rewritten for this posting by the E2E suite.");
  await expectReachableWithCookieNoticeUp(page, "Save CV copy");
  await page.getByRole("button", { name: "Save CV copy" }).click();
  await expect(page.getByText("CV copy saved")).toBeVisible();

  // The MASTER CV is untouched by any of it — the copy is a copy.
  await page.goto("/cvs");
  await expect(page.getByText(CV_NAME, { exact: true })).toBeVisible();
  await expect(page.getByText(CV_TAILORED, { exact: true })).toHaveCount(0);

  // ---- AC7: delete the copy; the picker comes back, offering the master --
  await page.goto("/applications");
  await page
    .getByRole("link", { name: `CV for ${ROLE} at ${COMPANY}` })
    .click();
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_TAILORED,
  );

  await page.getByRole("button", { name: "Delete this CV copy" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog.getByText("Delete this CV copy?")).toBeVisible();
  await dialog.getByRole("button", { name: "Delete", exact: true }).click();

  const pickAgain = page.getByRole("button", { name: "Create the CV copy" });
  await expect(pickAgain).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(1);

  // A new copy starts from the master CV again, not from the deleted edits.
  await pickAgain.click();
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_NAME,
  );
});

test("a finalized application's CV copy is readable but locked", async ({
  page,
  request,
}) => {
  const baseCvId = await seedBaseCv(request, CV_NAME);
  const applicationId = await seedApplication(request, JOB_DESCRIPTION);
  await seedTailoredCv(request, applicationId, baseCvId);
  await finalizeApplication(request, applicationId);

  await loginAs(page, "user");
  // Straight at the route, which also proves the static export serves
  // `/applications/cv` with a query string on a cold load.
  await page.goto(`/applications/cv?id=${applicationId}`);

  // AC10 — refused, and said out loud rather than left to a failed click.
  await expect(page.getByText("This application is finalized")).toBeVisible();

  // Still READABLE: the whole copy is on screen, just not editable.
  const label = page.getByLabel("CV label", { exact: true });
  await expect(label).toHaveValue(CV_NAME);
  await expect(label).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Job description text" }),
  ).toContainText(JOB_DESCRIPTION);

  // There is nothing to click by accident: the whole footer is gone.
  await expect(page.getByRole("button", { name: "Save CV copy" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Delete this CV copy" }),
  ).toHaveCount(0);
});
