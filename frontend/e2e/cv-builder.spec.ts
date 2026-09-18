import { readFile } from "node:fs/promises";

import {
  expect,
  test,
  type APIRequestContext,
  type Download,
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
 * locked once the application is finalized. Finally the PDF (KODI-004), which
 * is the one part of this feature the browser cannot fake: the bytes are
 * typeset by RenderCV/Typst on the server (ADR 0011) and only a real API can
 * produce them.
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

const SKILL_CATEGORY = "Languages and frameworks";
const INSTITUTION = "E2E University";

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
      education: [],
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

/**
 * Finalize the application out of band, so the UI meets it already locked.
 *
 * PRD 0008 / ADR 0012, R-032: the web's close dialog now POSTs with NO body
 * for the "none" outcome (idempotent) — this mirrors that, rather than the
 * legacy `{step_id, feedback_id, finalize_date}` shape, which is
 * CLI-0.1.4-only and which the web never sends (`.claude/rules/
 * cli-compatibility.md`). Only `finalized_at` being set matters for this
 * spec's "readable but locked" assertions, so no outcome is needed.
 */
async function finalizeApplication(
  request: APIRequestContext,
  applicationId: string,
) {
  const response = await request.post(
    apiUrl(`/applications/${applicationId}/finalize`),
    { headers: apiHeaders() },
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
  // Skills are CATEGORIES with keywords inside them, not a flat tag list.
  await page.getByRole("button", { name: "Add category" }).click();
  const category = page.getByRole("group", { name: "category 1" });
  await category.getByLabel("Category", { exact: true }).fill(SKILL_CATEGORY);
  await category
    .getByLabel(`Add a keyword to ${SKILL_CATEGORY}`)
    .fill("Python");
  await category
    .getByLabel(`Add a keyword to ${SKILL_CATEGORY}`)
    .press("Enter");
  await category.getByLabel(`Add a keyword to ${SKILL_CATEGORY}`).fill("Go");
  await category
    .getByLabel(`Add a keyword to ${SKILL_CATEGORY}`)
    .press("Enter");

  await page.getByRole("button", { name: "Add education" }).click();
  const qualification = page.getByRole("group", { name: "education 1" });
  await qualification
    .getByLabel("Institution", { exact: true })
    .fill(INSTITUTION);
  await qualification.getByLabel("Degree", { exact: true }).fill("BSc");
  await qualification
    .getByLabel("Field of study", { exact: true })
    .fill("Computer Science");
  // A CV date is a month and a year, typed as MM/yyyy and stored as ISO
  // `YYYY-MM`. `fill()` hands the whole string over in one `input` event and
  // the mask absorbs it; always fill a PADDED month.
  await qualification.getByLabel("Start", { exact: true }).fill("09/2010");
  await qualification.getByLabel("Finish", { exact: true }).fill("06/2013");

  await page.getByRole("button", { name: "Add experience" }).click();
  const role = page.getByRole("group", { name: "experience 1" });
  await role.getByLabel("Company", { exact: true }).fill("Applika");
  await role.getByLabel("Role", { exact: true }).fill("Backend Engineer");
  // A role the user is still in: the start is required, the finish left
  // empty, which is how "present" is said.
  await role.getByLabel("Start", { exact: true }).fill("01/2024");
  await expect(role.getByLabel("Start", { exact: true })).toHaveValue(
    "01/2024",
  );
  await expect(role.getByLabel("Finish", { exact: true })).toHaveValue("");
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
  // The dates round-trip through the API as ISO and come back as MM/yyyy, and
  // the empty finish stays empty.
  await expect(savedRole.getByLabel("Start", { exact: true })).toHaveValue(
    "01/2024",
  );
  await expect(savedRole.getByLabel("Finish", { exact: true })).toHaveValue("");

  // The categories and their keywords survive the round trip, and so does the
  // education section the owner never asked to have cut.
  const savedCategory = page.getByRole("group", { name: "category 1" });
  await expect(
    savedCategory.getByLabel("Category", { exact: true }),
  ).toHaveValue(SKILL_CATEGORY);
  await expect(
    savedCategory.getByRole("button", { name: "Rename Python" }),
  ).toBeVisible();
  await expect(
    savedCategory.getByRole("button", { name: "Rename Go" }),
  ).toBeVisible();

  const savedQualification = page.getByRole("group", { name: "education 1" });
  await expect(
    savedQualification.getByLabel("Institution", { exact: true }),
  ).toHaveValue(INSTITUTION);
  await expect(
    savedQualification.getByLabel("Field of study", { exact: true }),
  ).toHaveValue("Computer Science");
  await expect(
    savedQualification.getByLabel("Start", { exact: true }),
  ).toHaveValue("09/2010");
  await expect(
    savedQualification.getByLabel("Finish", { exact: true }),
  ).toHaveValue("06/2013");

  // And the live preview prints them the way the PDF does: a bold category
  // line, then its keywords joined by a middle dot.
  const preview = page.locator('[data-slot="cv-document"]');
  await expect(preview.getByText(`${SKILL_CATEGORY}:`)).toBeVisible();
  await expect(preview.getByText("Python \u00b7 Go")).toBeVisible();
  await expect(preview.getByText("BSc in Computer Science")).toBeVisible();
  // AC5: the preview prints the date text the PDF prints, `present` and all.
  await expect(preview.getByText("01/2024 - present")).toBeVisible();
  await expect(preview.getByText("09/2010 - 06/2013")).toBeVisible();

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

/** What the document is scrolling, measured in the real browser. */
async function scrollReport(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    const main = document.querySelector("main");
    return {
      innerHeight: window.innerHeight,
      documentScrollHeight: doc.scrollHeight,
      documentClientHeight: doc.clientHeight,
      mainScrollHeight: main?.scrollHeight ?? 0,
      mainClientHeight: main?.clientHeight ?? 0,
    };
  });
}

test("creating a master CV scrolls the editor, never the whole page (AC7)", async ({
  page,
}) => {
  // The owner: "When creating a new master CV, remove the page scroll".
  //
  // The cause was not the editor's height. Radix `Select` renders a visually
  // hidden native `<select>` at `position: absolute` beside every trigger —
  // the "Level" control of a language row. With no positioned ancestor its
  // containing block was the initial containing block, so no `overflow:
  // hidden` clipped it and it stretched `<html>` to roughly four viewports.
  // `/cvs/new` with no language row therefore looked fine and grew a second
  // scrollbar the moment a language was added, which is exactly when the
  // owner saw it.
  await loginAs(page, "user");
  await page.goto("/cvs/new");
  await expect(page.getByLabel("CV label", { exact: true })).toBeVisible();

  const before = await scrollReport(page);
  expect(
    before.documentScrollHeight - before.documentClientHeight,
    `the page scrolls before any Select is mounted: ${JSON.stringify(before)}`,
  ).toBeLessThanOrEqual(1);

  // Add the language row, and with it the Select that used to do the damage.
  await page.getByRole("button", { name: "Add language" }).click();
  const language = page.getByRole("group", { name: "language 1" });
  await language.getByLabel("Language", { exact: true }).fill("English");
  await expect(language.getByRole("combobox", { name: "Level" })).toBeVisible();

  const after = await scrollReport(page);
  expect(
    after.documentScrollHeight - after.documentClientHeight,
    `adding a language grew the page: ${JSON.stringify(after)}`,
  ).toBeLessThanOrEqual(1);
  expect(after.documentScrollHeight).toBeLessThanOrEqual(after.innerHeight + 1);

  // The form is far taller than the viewport, so SOMETHING has to scroll —
  // the editor's own region, which is the whole point of the criterion.
  expect(after.mainScrollHeight).toBeGreaterThan(after.mainClientHeight);

  // And the same holds on the EDIT route, which mounts the same controls.
  await fillRequired(page, "E2E scroll CV");
  await page.getByRole("button", { name: "Create CV" }).click();
  await expect(page).toHaveURL(/\/cvs$/);
  await page.getByRole("link", { name: "Edit E2E scroll CV" }).click();
  await expect(page).toHaveURL(/\/cvs\/editor\?id=/);
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    "E2E scroll CV",
  );

  const edit = await scrollReport(page);
  expect(
    edit.documentScrollHeight - edit.documentClientHeight,
    `the edit route scrolls the page: ${JSON.stringify(edit)}`,
  ).toBeLessThanOrEqual(1);
});

test("the live preview left-aligns languages at any count (AC6)", async ({
  page,
}) => {
  // The owner: "during live preview of the CV, the languages is alignes to
  // the center when I have only one languages or two, but when i download the
  // file as pdf, the languages is aligned to the left … fix the live preview
  // to align to the left as well and remove the dots in live preview only
  // display the language name and the level."
  //
  // Only a real browser has the geometry to prove it, so this is measured,
  // not asserted on a class.
  await loginAs(page, "user");
  await page.goto("/cvs/new");
  await fillRequired(page, "E2E languages CV");

  const preview = page.locator('[data-slot="cv-document"]');
  // Scoped to the languages ATOM, not to `getByRole("list")` on the whole
  // preview: the paginated document's sheets are themselves an ordered list
  // (KODI-008), so a bare list locator now matches two elements.
  const list = preview
    .locator('[data-cv-block="languages:grid"]')
    .getByRole("list");

  for (const [index, name] of ["English", "Portuguese"].entries()) {
    await page.getByRole("button", { name: "Add language" }).click();
    await page
      .getByRole("group", { name: `language ${index + 1}` })
      .getByLabel("Language", { exact: true })
      .fill(name);

    await expect(preview.getByText(name, { exact: true })).toBeVisible();

    const listBox = await list.boundingBox();
    const firstEntry = await list.getByRole("listitem").first().boundingBox();
    expect(listBox, "the languages list is not laid out").not.toBeNull();
    expect(firstEntry, "the first language has no box").not.toBeNull();

    // Hard left: the first entry starts at the list's own left edge, whether
    // there is one language or two. `justify-around` put it in the middle.
    expect(
      firstEntry!.x - listBox!.x,
      `${index + 1} language(s) are not left-aligned`,
    ).toBeLessThanOrEqual(2);
  }

  // Name and level, and no separator dot of any kind.
  const languagesText = (await list.textContent()) ?? "";
  expect(languagesText).toContain("English");
  expect(languagesText).toContain("Proficient");
  expect(languagesText).not.toContain("\u00b7");
  expect(languagesText).not.toContain("\u2022");
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
  await expect(page.getByText("This application is closed.")).toBeVisible();

  // Still READABLE: the whole copy is on screen, just not editable.
  const label = page.getByLabel("CV label", { exact: true });
  await expect(label).toHaveValue(CV_NAME);
  await expect(label).toBeDisabled();
  await expect(
    page.getByRole("region", { name: "Job description text" }),
  ).toContainText(JOB_DESCRIPTION);

  // There is nothing to WRITE by accident: every control that changes the copy
  // is gone from the footer, not merely disabled.
  await expect(page.getByRole("button", { name: "Save CV copy" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Delete this CV copy" }),
  ).toHaveCount(0);

  // What the footer DOES keep is the download (KODI-004, AC1): refusing to let
  // a finalized copy be written is not the same as refusing to let it be read.
  const download = page.getByRole("button", { name: "Download PDF" });
  await expect(download).toBeVisible();
  await expect(download).toBeEnabled();
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);
  await expectReachableWithCookieNoticeUp(page, "Download PDF");

  await expectPdfRoute(request, `/applications/${applicationId}/cv/pdf`);

  const started = page.waitForEvent("download");
  await download.click();
  const saved = await started;
  expect(saved.suggestedFilename()).toBe("e2e-master-cv.pdf");
  expect((await readDownload(saved)).subarray(0, 5).toString("latin1")).toBe(
    "%PDF-",
  );
});

/* ---------------------------------------------------------------------------
 * KODI-004 — the server-rendered PDF.
 * ------------------------------------------------------------------------ */

/** The words AC3 requires, verbatim. Kept in sync with `CV_PDF_LAYOUT_NOTICE`. */
const PDF_LAYOUT_NOTICE = "Preview does not show the final PDF layout.";

/**
 * The route really answers with a PDF.
 *
 * Out of band on purpose: `page.waitForEvent("download")` proves the BUTTON
 * works, but the browser hands back a saved file, not a response — the status,
 * the `Content-Type` and the `Content-Disposition` are only visible from here.
 * Same real session either way.
 */
async function expectPdfRoute(request: APIRequestContext, path: string) {
  const response = await request.post(apiUrl(path), {
    headers: { Cookie: authCookieHeader("user") },
  });

  expect(response.status(), await response.text()).toBe(200);
  expect(response.headers()["content-type"]).toContain("application/pdf");
  // Exposed across origins by `expose_headers`, or the browser could not name
  // the file at all and every download would land on the fallback slug.
  expect(response.headers()["content-disposition"]).toMatch(
    /^attachment; filename="[a-z0-9-]+\.pdf"$/,
  );

  const body = await response.body();
  expect(body.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  expect(body.byteLength).toBeGreaterThan(1000);
}

/** The bytes the browser actually saved, read back off disk. */
async function readDownload(download: Download): Promise<Buffer> {
  const path = await download.path();
  expect(path, "the browser saved no file").not.toBeNull();
  return readFile(path!);
}

test("a master CV downloads as a PDF the server typeset", async ({
  page,
  request,
}) => {
  const baseCvId = await seedBaseCv(request, CV_NAME);

  // The route itself, before the UI: a failure here is the backend's.
  await expectPdfRoute(request, `/base-cvs/${baseCvId}/pdf`);

  await loginAs(page, "user");
  await page.goto(`/cvs/editor?id=${baseCvId}`);
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_NAME,
  );

  // AC3 — said twice on this page: once under the preview it qualifies, once
  // beside the action it warns about.
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);

  // The export lives in the same sticky footer as the submit, so it inherits
  // the cookie-bar invariant the rest of this file pins.
  const download = page.getByRole("button", { name: "Download PDF" });
  await expect(download).toBeEnabled();
  await expectReachableWithCookieNoticeUp(page, "Download PDF");

  const started = page.waitForEvent("download");
  await download.click();
  const saved = await started;

  // Named by the server from the CV's own label, and really a PDF on disk.
  expect(saved.suggestedFilename()).toBe("e2e-master-cv.pdf");
  const bytes = await readDownload(saved);
  expect(bytes.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  // Nothing was written: a render is a read of the stored CV.
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_NAME,
  );
});

test("an application's CV copy downloads as a PDF", async ({
  page,
  request,
}) => {
  const baseCvId = await seedBaseCv(request, CV_NAME);
  const applicationId = await seedApplication(request, JOB_DESCRIPTION);
  await seedTailoredCv(request, applicationId, baseCvId);

  await expectPdfRoute(request, `/applications/${applicationId}/cv/pdf`);

  await loginAs(page, "user");
  await page.goto(`/applications/cv?id=${applicationId}`);
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_NAME,
  );
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);

  await expectReachableWithCookieNoticeUp(page, "Download PDF");
  const started = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download PDF" }).click();
  const saved = await started;

  expect(saved.suggestedFilename()).toBe("e2e-master-cv.pdf");
  expect((await readDownload(saved)).subarray(0, 5).toString("latin1")).toBe(
    "%PDF-",
  );
});

/* ---------------------------------------------------------------------------
 * KODI-008 — the live preview flowed across real A4 sheets, on the full width.
 *
 * The owner: "if possible, make the preview during CV creation create pages if
 * the document become too large, use A4 dimensions" and "also, use the full
 * page width for this page".
 *
 * Every criterion below is measured in a REAL browser, because it cannot be
 * proved anywhere else: the flow engine distributes the CV by the heights the
 * layout engine reports, and jsdom reports every one of them as zero. The
 * arithmetic itself is unit-tested with injected heights in
 * `src/components/base-cvs/use-cv-page-flow.test.tsx`; what is here is whether
 * real text, in real line boxes, at the real column width, lands where the
 * engine says it does.
 * ------------------------------------------------------------------------ */

/** One sheet of the live preview. */
const SHEET = '[data-slot="cv-page"]';

/** One long bullet: ~3 wrapped lines on the sheet's 680px content column. */
function bulkBullet(role: number, index: number): string {
  return (
    `Owned subsystem ${role}.${index} end to end: designed the schema, wrote ` +
    "the migrations, shipped the endpoints and the background workers behind " +
    "them, and carried the on-call pager for the result through two peak " +
    "seasons without an unplanned outage."
  );
}

/** One experience entry tall enough to move the page count on its own. */
function bulkRole(index: number) {
  return {
    id: `x-${index}`,
    company: `E2E Company ${index}`,
    role: "Backend Engineer",
    location: "Remote",
    company_description: "A company the E2E suite invented for its height.",
    start: "2019-01",
    end: "2021-12",
    bullets: Array.from({ length: 6 }, (_, b) => bulkBullet(index, b)),
  };
}

/** A master CV whose experience section holds `roles` bulky entries. */
async function seedBulkyBaseCv(
  request: APIRequestContext,
  roles: number,
): Promise<string> {
  const response = await request.post(apiUrl("/base-cvs"), {
    headers: apiHeaders(),
    data: {
      name: CV_NAME,
      full_name: "E2E Candidate",
      headline: "Engineer",
      location: "Remote",
      email: "e2e-user@e2e.applika.dev",
      phone: null,
      summary: "Seeded by the E2E suite.",
      links: [],
      skills: [],
      experience: Array.from({ length: roles }, (_, index) => bulkRole(index)),
      projects: [],
      education: [],
      certifications: [],
      languages: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return ((await response.json()) as { id: string }).id;
}

/**
 * How many sheets the preview settled on.
 *
 * The distribution is measured in a layout effect and re-measured once the
 * webfont has swapped in, so the count is read only after `document.fonts` is
 * ready AND two consecutive reads agree. Without that this reads the
 * single-sheet fallback the first paint legitimately renders.
 */
async function settledSheetCount(page: Page): Promise<number> {
  await expect(page.locator(SHEET).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));

  let previous = -1;
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const count = await page.locator(SHEET).count();
    if (count === previous) return count;
    previous = count;
    await page.waitForTimeout(80);
  }
  return previous;
}

/** Open a master CV in the editor and wait for its preview to settle. */
async function openSettledEditor(page: Page, cvId: string): Promise<number> {
  await page.goto(`/cvs/editor?id=${cvId}`);
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_NAME,
  );
  return settledSheetCount(page);
}

test("the live preview flows a long CV across real A4 sheets (AC1, AC2, AC3)", async ({
  page,
  request,
}) => {
  const cvId = await seedBulkyBaseCv(request, 12);

  await loginAs(page, "user");
  const sheets = await openSettledEditor(page, cvId);

  // ---- AC1: it really continues onto further sheets --------------------
  expect(
    sheets,
    "a twelve-role CV did not overflow a single A4 sheet",
  ).toBeGreaterThan(1);
  // Numbered in order, which is what makes them PAGES rather than cards.
  expect(
    await page
      .locator(SHEET)
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-page")),
      ),
  ).toEqual(Array.from({ length: sheets }, (_, i) => String(i + 1)));

  // ---- AC2: no break falls inside an entry or inside a bullet ----------
  // Only a real browser can say this: it is a statement about boxes. Every
  // atom must lie WHOLLY inside the sheet that holds it — not merely be a
  // child of it, which the markup guarantees for free — so a miscalculated
  // flow that let an entry run past the paper's edge would be caught here and
  // nowhere else. And every bullet must still be inside its own entry's atom.
  const layout = await page.evaluate((sheetSelector) => {
    const problems: string[] = [];
    const placed: string[] = [];

    for (const sheet of Array.from(
      document.querySelectorAll<HTMLElement>(sheetSelector),
    )) {
      const paper = sheet.firstElementChild as HTMLElement;
      const paperBox = paper.getBoundingClientRect();
      const page = sheet.getAttribute("data-page");

      for (const block of Array.from(
        sheet.querySelectorAll<HTMLElement>("[data-cv-block]"),
      )) {
        const key = block.getAttribute("data-cv-block") ?? "?";
        placed.push(key);

        const box = block.getBoundingClientRect();
        if (
          box.top < paperBox.top - 1.5 ||
          box.bottom > paperBox.bottom + 1.5
        ) {
          problems.push(
            `${key} is cut by sheet ${page}: block ${box.top.toFixed(1)}-` +
              `${box.bottom.toFixed(1)}, sheet ${paperBox.top.toFixed(1)}-` +
              `${paperBox.bottom.toFixed(1)}`,
          );
        }

        for (const bullet of Array.from(block.querySelectorAll("li"))) {
          if (bullet.closest(sheetSelector) !== sheet) {
            problems.push(`a bullet of ${key} left sheet ${page}`);
          }
        }
      }
    }

    return { problems, placed };
  }, SHEET);

  expect(layout.problems).toEqual([]);
  // Every atom placed exactly once: nothing duplicated across sheets, and
  // nothing dropped on the way.
  expect(new Set(layout.placed).size).toBe(layout.placed.length);
  expect(layout.placed).toHaveLength(
    await page.locator("[data-cv-block]").count(),
  );

  // ---- AC3: each sheet says which page it is, and how many there are ---
  for (let number = 1; number <= sheets; number += 1) {
    await expect(page.getByText(`Page ${number} of ${sheets}`)).toHaveCount(1);
    await expect(
      page
        .locator(SHEET)
        .nth(number - 1)
        .getByText(`${number} / ${sheets}`, { exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByText(`CV preview: ${sheets} pages.`)).toHaveCount(1);

  // ---- KODI-006's AC7, at the viewport where a tall preview could break it
  // A multi-page preview is exactly the height that used to have nowhere to go
  // but the document. It lands in the pane's own capped scroll at `md` and up,
  // and in `main`'s below it — never in `<html>`'s.
  const scroll = await scrollReport(page);
  expect(
    scroll.documentScrollHeight - scroll.documentClientHeight,
    `a ${sheets}-page preview grew the page: ${JSON.stringify(scroll)}`,
  ).toBeLessThanOrEqual(1);

  // The notice is untouched and still said twice, and it does MORE work now
  // that the preview looks like paginated A4 (KODI-004 AC3).
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);
});

test("the preview crosses from one sheet to two exactly at the boundary (AC4)", async ({
  page,
  request,
}) => {
  // The interesting case is not "a short CV is one page" — it is the CROSSING.
  // A flow that pre-opens a sheet renders the stray empty second page one
  // entry too early, and a flow that closes one too late clips. So the CV is
  // grown one real entry at a time until the count moves, and BOTH sides of
  // that one step are asserted.
  await loginAs(page, "user");

  /** The sheet count at the previous step, so the CROSSING can be asserted. */
  let before = 0;
  let boundary = 0;

  for (let roles = 1; roles <= 10; roles += 1) {
    await wipeBaseCvs(request);
    const cvId = await seedBulkyBaseCv(request, roles);
    const count = await openSettledEditor(page, cvId);

    if (count > 1) {
      boundary = roles;
      // One entry added one page. A flow that closed a sheet too late would
      // have jumped two.
      expect(count, `${roles} roles rendered ${count} sheets`).toBe(2);
      break;
    }

    // Still one sheet, and one sheet ONLY — no stray empty second page.
    expect(count, `${roles} roles rendered ${count} sheets`).toBe(1);
    await expect(page.locator(SHEET)).toHaveCount(1);
    await expect(page.getByText("Page 1 of 1")).toHaveCount(1);
    await expect(page.getByText("CV preview: 1 page.")).toHaveCount(1);
    before = count;
  }

  expect(
    boundary,
    "the CV never overflowed within ten roles, so no boundary was crossed",
  ).toBeGreaterThan(1);
  // The step BEFORE the crossing was exactly one sheet and the step AFTER is
  // exactly two. That is AC4 stated at the only place it can fail.
  expect(before).toBe(1);
  await expect(page.locator(SHEET)).toHaveCount(2);
  await expect(page.getByText("Page 2 of 2")).toHaveCount(1);
  await expect(page.getByText("CV preview: 2 pages.")).toHaveCount(1);
});

/** The shell's content container, and how much width it leaves unspent. */
async function contentGeometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const box = main?.firstElementChild as HTMLElement | null;
    if (!main || !box) throw new Error("the shell rendered no content box");

    const mainBox = main.getBoundingClientRect();
    const contentBox = box.getBoundingClientRect();
    const preview = document.querySelector('[data-slot="cv-document"]');
    const previewBox = preview?.getBoundingClientRect();
    const padding = Number.parseFloat(getComputedStyle(box).paddingRight);

    return {
      mainWidth: Math.round(mainBox.width),
      contentWidth: Math.round(contentBox.width),
      /** Width of the shell the content container does not use at all. */
      dead: Math.round(mainBox.width - contentBox.width),
      /** Gap between the preview's right edge and the container's. */
      previewGap: previewBox
        ? Math.round(contentBox.right - padding - previewBox.right)
        : -1,
    };
  });
}

test("the CV pages spend the whole shell width (AC5)", async ({
  page,
  request,
}) => {
  // The owner: "also, use the full page width for this page" — his
  // screenshot showed the dead space to the right of the editor. Asserted as
  // GEOMETRY on all three CV routes, never as a class: a capped container is
  // only visible as width nobody uses.
  const cvId = await seedBaseCv(request, CV_NAME);
  const applicationId = await seedApplication(request, JOB_DESCRIPTION);
  await seedTailoredCv(request, applicationId, cvId);

  await loginAs(page, "user");
  // Wider than `max-w-7xl`, or the reading column would not bind and there
  // would be no dead space to remove. 1920px (Recommended, owner-ordered
  // KODI-013 addendum) so the >100px dead-space precondition holds reliably;
  // this widens only the viewport this test runs at, never the layout itself.
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto("/applications");
  await expect(
    page.getByRole("heading", { name: "Applications", level: 1 }),
  ).toBeVisible();
  const capped = await contentGeometry(page);
  expect(
    capped.dead,
    "the reading column does not bind at 1920px, so this test proves nothing",
  ).toBeGreaterThan(100);

  for (const route of [
    "/cvs/new",
    `/cvs/editor?id=${cvId}`,
    `/applications/cv?id=${applicationId}`,
  ]) {
    await page.goto(route);
    await expect(page.locator('[data-slot="cv-document"]')).toBeVisible();

    const full = await contentGeometry(page);
    expect(full.dead, `${route} leaves dead space`).toBeLessThanOrEqual(1);
    expect(full.contentWidth, route).toBeGreaterThan(capped.contentWidth);
    // And the preview really reaches that edge: the editor and the preview
    // share the width rather than the form taking all of the new room.
    expect(
      full.previewGap,
      `${route} leaves the preview short of the edge`,
    ).toBeLessThanOrEqual(40);
    expect(full.previewGap, route).toBeGreaterThanOrEqual(0);
  }
});

test("the preview restacks and stays usable below md (AC6)", async ({
  page,
  request,
}) => {
  const cvId = await seedBulkyBaseCv(request, 4);

  await loginAs(page, "user");
  await page.setViewportSize({ width: 390, height: 844 });
  const sheets = await openSettledEditor(page, cvId);
  expect(sheets).toBeGreaterThanOrEqual(1);

  // Restacked: the preview is BELOW the form, not a second column beside it.
  const label = await page
    .getByLabel("CV label", { exact: true })
    .boundingBox();
  const preview = await page.locator('[data-slot="cv-document"]').boundingBox();
  expect(label, "the form did not render").not.toBeNull();
  expect(preview, "the preview did not render").not.toBeNull();
  expect(preview!.y).toBeGreaterThan(label!.y + label!.height);

  const metrics = await page.evaluate((sheetSelector) => {
    const doc = document.documentElement;
    const sheet = document.querySelector<HTMLElement>(sheetSelector);
    const frame = document.querySelector<HTMLElement>(
      '[data-slot="cv-document"]',
    )?.parentElement;

    return {
      innerWidth: window.innerWidth,
      innerHeight: window.innerHeight,
      documentScrollWidth: doc.scrollWidth,
      documentScrollHeight: doc.scrollHeight,
      sheetWidth: sheet?.getBoundingClientRect().width ?? -1,
      sheetRight: sheet?.getBoundingClientRect().right ?? -1,
      frameWidth: frame?.clientWidth ?? -1,
    };
  }, SHEET);

  // Usable: the sheet fills the column it is in and nothing runs off the side.
  expect(metrics.sheetWidth).toBeGreaterThan(metrics.frameWidth - 2);
  expect(metrics.sheetRight).toBeLessThanOrEqual(metrics.innerWidth + 1);
  expect(
    metrics.documentScrollWidth,
    `the paginated preview widened the page: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.innerWidth + 1);

  // KODI-006's AC7 holds at this viewport too: the added height lands in the
  // editor's own scroll, never in the document's.
  expect(
    metrics.documentScrollHeight,
    `the paginated preview grew the page: ${JSON.stringify(metrics)}`,
  ).toBeLessThanOrEqual(metrics.innerHeight + 1);

  // Readable: the page indicator is NOT inside the sheet's `scale()`. At a
  // scale near 0.45 an 11px folio would render at 5px, which is the whole
  // reason the transform is applied per sheet and not to the stack.
  const indicator = page.getByText(`Page 1 of ${sheets}`).locator("..");
  await expect(indicator).toHaveCSS("font-size", "11px");
  const indicatorBox = await indicator.boundingBox();
  expect(indicatorBox!.height).toBeGreaterThan(8);

  // And it still says the words.
  await expect(page.getByText(`Page 1 of ${sheets}`)).toHaveCount(1);
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);
});

/* ===========================================================================
 * KODI-009 — the frontend improvements the owner asked for last.
 *
 * "instead of listing the keywords, now lists only the categories, change this
 * to display all keywords inside all categories in skills and add a button to
 * download the CV. During CV creation or edir, increace the preview width size
 * keep 50/50 "w-1/2" to the CV form and "w-1/2" to CV preview. A third
 * improvement, make each section in the form colapsable, do the same to each
 * experience inside Experience section (keep open as default when i open the
 * page)".
 *
 * These four live HERE rather than in a unit test because every one of them is
 * a statement about real geometry or a real download: jsdom reports every
 * height as zero, lays nothing out, and has no download manager.
 * ======================================================================== */

/** The nine form sections, in the owner's order (links above summary, AC7). */
const FORM_SECTIONS = [
  "Identity and contact",
  "Links",
  "Summary",
  "Skills",
  "Experience",
  "Projects",
  "Education",
  "Certifications",
  "Languages",
] as const;

/** The disclosure button of a form section — the heading IS the trigger. */
function sectionHeader(page: Page, title: string) {
  return page.locator('[data-slot="cv-section-trigger"]', {
    hasText: title,
  });
}

test("every form section and every experience entry collapses, none of them starts closed (AC4, AC5)", async ({
  page,
  request,
}) => {
  const cvId = await seedBulkyBaseCv(request, 2);

  await loginAs(page, "user");
  await openSettledEditor(page, cvId);

  // ---- AC4: nine disclosures, all of them OPEN when the page opens -----
  // `aria-expanded`, never `aria-controls`: Radix only points the trigger at
  // its panel while the panel is mounted, which is the very state under test.
  const triggers = page.locator('[data-slot="cv-section-trigger"]');
  await expect(triggers).toHaveCount(FORM_SECTIONS.length);
  for (const title of FORM_SECTIONS) {
    await expect(
      sectionHeader(page, title),
      `${title} did not open expanded`,
    ).toHaveAttribute("aria-expanded", "true");
  }

  // ---- AC4: it really folds the fields away, in a real browser ---------
  const summaryField = page.getByLabel("Summary", { exact: true });
  await expect(summaryField).toBeVisible();
  await sectionHeader(page, "Summary").click();
  await expect(sectionHeader(page, "Summary")).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await expect(summaryField).toBeHidden();
  // Its neighbours are untouched.
  await expect(page.getByLabel("CV label", { exact: true })).toBeVisible();

  await sectionHeader(page, "Summary").click();
  await expect(summaryField).toBeVisible();

  // ---- AC5: each experience entry is a disclosure of its own -----------
  const rows = page.locator('[data-slot="cv-item-trigger"]');
  // Only Experience: two rows, and no other section grew one.
  await expect(rows).toHaveCount(2);
  for (const index of [0, 1]) {
    await expect(rows.nth(index)).toHaveAttribute("aria-expanded", "true");
  }

  const first = page.getByRole("group", { name: "experience 1" });
  const second = page.getByRole("group", { name: "experience 2" });
  await expect(first.getByLabel("Company", { exact: true })).toBeVisible();

  await rows.nth(0).click();
  await expect(rows.nth(0)).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByLabel("Company", { exact: true })).toBeHidden();
  // Independent: role 2 stayed exactly where it was.
  await expect(rows.nth(1)).toHaveAttribute("aria-expanded", "true");
  await expect(second.getByLabel("Company", { exact: true })).toBeVisible();

  // A row added afterwards is born OPEN, like the ones that were there.
  await page.getByRole("button", { name: "Add experience" }).click();
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toHaveAttribute("aria-expanded", "true");
  await expect(
    page.getByRole("group", { name: "experience 3" }).getByLabel("Company", {
      exact: true,
    }),
  ).toBeVisible();
});

test("the page never scrolls, sections expanded OR collapsed (AC4 vs KODI-006 AC7)", async ({
  page,
  request,
}) => {
  // The invariant most at risk in this slice. KODI-006's AC7 is "remove the
  // page scroll" and collapsing nine sections changes the document's height by
  // most of a CV — in both directions. So it is measured in both states, on
  // the twelve-role CV that needs several A4 sheets.
  const cvId = await seedBulkyBaseCv(request, 12);

  await loginAs(page, "user");
  const sheets = await openSettledEditor(page, cvId);
  expect(sheets).toBeGreaterThan(1);

  const expanded = await scrollReport(page);
  expect(
    expanded.documentScrollHeight - expanded.documentClientHeight,
    `expanded, the page scrolls: ${JSON.stringify(expanded)}`,
  ).toBeLessThanOrEqual(1);
  // Something still has to scroll — the editor's own region.
  expect(expanded.mainScrollHeight).toBeGreaterThan(expanded.mainClientHeight);

  // ---- collapse every one of the nine ---------------------------------
  for (const title of FORM_SECTIONS) {
    await sectionHeader(page, title).click();
    await expect(sectionHeader(page, title)).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  }
  // The collapse animation has to finish before the height means anything.
  await expect(page.getByLabel("Summary", { exact: true })).toBeHidden();
  await page.waitForTimeout(400);

  const collapsed = await scrollReport(page);
  expect(
    collapsed.documentScrollHeight - collapsed.documentClientHeight,
    `collapsed, the page scrolls: ${JSON.stringify(collapsed)}`,
  ).toBeLessThanOrEqual(1);
  // Losing the fields really did shorten the column — otherwise this test
  // would pass on a layout where collapsing changed nothing at all.
  expect(
    collapsed.mainScrollHeight,
    `collapsing the sections did not shorten the editor: ${JSON.stringify(collapsed)}`,
  ).toBeLessThan(expanded.mainScrollHeight);

  // ---- and back ---------------------------------------------------------
  for (const title of FORM_SECTIONS) {
    await sectionHeader(page, title).click();
  }
  await expect(page.getByLabel("Summary", { exact: true })).toBeVisible();
  await page.waitForTimeout(400);

  const reopened = await scrollReport(page);
  expect(
    reopened.documentScrollHeight - reopened.documentClientHeight,
    `re-expanded, the page scrolls: ${JSON.stringify(reopened)}`,
  ).toBeLessThanOrEqual(1);

  console.log(
    `[KODI-009] no-page-scroll, ${sheets} A4 sheets — ` +
      `expanded ${JSON.stringify(expanded)} | ` +
      `collapsed ${JSON.stringify(collapsed)} | ` +
      `re-expanded ${JSON.stringify(reopened)}`,
  );
});

test("the form and the preview each take half the editor, with no cap on either (AC3)", async ({
  page,
  request,
}) => {
  // The owner: "increace the preview width size keep 50/50 "w-1/2" to the CV
  // form and "w-1/2" to CV preview". This REVERSES KODI-008, which capped the
  // preview at `2xl` and gave the surplus to the form — so the assertion is
  // that neither side is wider than the other, at a width where the old cap
  // used to bind.
  const cvId = await seedBulkyBaseCv(request, 12);

  await loginAs(page, "user");

  for (const width of [1280, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    const sheets = await openSettledEditor(page, cvId);
    expect(sheets).toBeGreaterThan(0);

    const halves = await page.evaluate(() => {
      const split = document.querySelector<HTMLElement>("form > div.grid");
      const form = split?.firstElementChild as HTMLElement | null;
      const preview = document.querySelector<HTMLElement>(
        'aside[aria-label="CV preview"]',
      );
      if (!split || !form || !preview) throw new Error("the editor restacked");
      return {
        split: Math.round(split.getBoundingClientRect().width),
        form: Math.round(form.getBoundingClientRect().width),
        preview: Math.round(preview.getBoundingClientRect().width),
      };
    });

    // Half and half. The one pixel of slack is sub-pixel rounding on an odd
    // available width, not a cap.
    expect(
      Math.abs(halves.form - halves.preview),
      `${width}px is not a 50/50 split: ${JSON.stringify(halves)}`,
    ).toBeLessThanOrEqual(1);
    // And both halves really grow with the shell: a cap would pin one of them.
    expect(halves.form).toBeGreaterThan(0);
    expect(halves.form * 2).toBeGreaterThan(halves.split - 48);

    console.log(
      `[KODI-009] 50/50 at ${width}px: ${JSON.stringify(halves)}, ${sheets} sheets`,
    );
  }

  // Below `md` the two stack, form first — the halves are a `md:` rule, not a
  // 50% the phone inherits.
  await page.setViewportSize({ width: 390, height: 844 });
  await openSettledEditor(page, cvId);
  const stacked = await page.evaluate(() => {
    const form = document
      .querySelector<HTMLElement>('[data-slot="cv-section"]')
      ?.getBoundingClientRect();
    const preview = document
      .querySelector<HTMLElement>('aside[aria-label="CV preview"]')
      ?.getBoundingClientRect();
    return {
      inner: window.innerWidth,
      previewWidth: Math.round(preview?.width ?? -1),
      previewTop: Math.round(preview?.top ?? -1),
      formTop: Math.round(form?.top ?? -1),
      formWidth: Math.round(form?.width ?? -1),
    };
  });
  // Stacked, form first, and each of them spends the whole narrow column.
  expect(stacked.previewTop).toBeGreaterThan(stacked.formTop);
  expect(stacked.previewWidth).toBeGreaterThan(stacked.inner / 2);
  expect(
    Math.abs(stacked.previewWidth - stacked.formWidth),
  ).toBeLessThanOrEqual(1);
});

test("the 50/50 split moves the preview's scale, never its page count (KODI-008)", async ({
  page,
  request,
}) => {
  // The page count is the A4 sheet's business: `cv-page-sheet.tsx` lays the
  // document out at a FIXED A4 content width and the column only scales the
  // result. So widening the preview from KODI-008's `38rem` cap to a true half
  // must not repaginate the CV — which is the one way this slice could have
  // broken KODI-008's pagination. Measured at three widths, including the one
  // the old cap was written for.
  const cvId = await seedBulkyBaseCv(request, 12);

  await loginAs(page, "user");

  const counts: Record<number, number> = {};
  for (const width of [1024, 1280, 1600, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    counts[width] = await openSettledEditor(page, cvId);
    await expect(page.getByText(`Page 1 of ${counts[width]}`)).toHaveCount(1);
  }

  console.log(`[KODI-009] A4 page counts by width: ${JSON.stringify(counts)}`);

  const values = Object.values(counts);
  expect(
    values.every((count) => count === values[0]),
    JSON.stringify(counts),
  ).toBe(true);
  expect(values[0]).toBeGreaterThan(1);
});

test("the CV list downloads any of its CVs as the PDF the server typeset (AC2)", async ({
  page,
  request,
}) => {
  // The owner: "add a button to download the CV" on `/cvs`. Same export route
  // the editor uses (ADR 0011) — the proof is that real Typst bytes come back
  // for the CV that was pressed, named after THAT CV.
  await seedBaseCv(request, CV_NAME);
  await seedBaseCv(request, CV_RENAMED);

  await loginAs(page, "user");
  await page.goto("/cvs");
  await expect(page.getByText(CV_NAME, { exact: true })).toBeVisible();

  // One download per tile, each named after its own CV. `exact` matters here:
  // `CV_NAME` is a PREFIX of `CV_RENAMED`, and Playwright's name match is a
  // substring one — which is exactly the confusion a per-tile action has to
  // survive.
  await expect(
    page.getByRole("button", { name: `Download PDF ${CV_NAME}`, exact: true }),
  ).toBeEnabled();
  const renamed = page.getByRole("button", {
    name: `Download PDF ${CV_RENAMED}`,
    exact: true,
  });
  await expect(renamed).toBeEnabled();

  const started = page.waitForEvent("download");
  await renamed.click();
  const saved = await started;

  // The SECOND CV's document, not the first: the id travels with the press.
  expect(saved.suggestedFilename()).toBe("e2e-master-cv-edited.pdf");
  expect((await readDownload(saved)).subarray(0, 5).toString("latin1")).toBe(
    "%PDF-",
  );

  // Nothing was navigated or deleted: a render is a read.
  await expect(page).toHaveURL(/\/cvs$/);
  await expect(page.getByText(CV_RENAMED, { exact: true })).toBeVisible();
});

/** A keyword at the schema's ceiling: 100 characters, wider than any tile. */
const LONG_KEYWORD = "a".repeat(100);

test("the CV list shows every keyword of every skill category as a badge (AC1)", async ({
  page,
  request,
}) => {
  // The owner, round 3: "i said to display all keywords of all categories but
  // still in badges as was in the first place (but do not display skills
  // repetedly)". So: badges, every keyword, no category labels, no "+N", and
  // a keyword that sits under two categories appears ONCE.
  const categories = [
    { id: "s-1", category: "Languages", keywords: ["Python", "TypeScript"] },
    { id: "s-2", category: "Data stores", keywords: ["PostgreSQL", "Redis"] },
    { id: "s-3", category: "Platform", keywords: ["Docker", "Kubernetes"] },
    // "Docker" again, and "python" in another casing: two skills the tile has
    // to collapse into the badges it already shows.
    { id: "s-4", category: "Cloud", keywords: ["AWS", "Terraform", "Docker"] },
    { id: "s-5", category: "Practices", keywords: ["python"] },
    // A keyword at the schema's ceiling (`BASE_CV_MAX.skillKeyword` = 100).
    // It is wider than the tile, and the shell column is `overflow-hidden`, so
    // it is the case that catches a badge which refuses to wrap.
    { id: "s-6", category: "Long", keywords: [LONG_KEYWORD] },
  ];
  /** The eight distinct skills, in the order the categories declare them. */
  const distinct = [
    "Python",
    "TypeScript",
    "PostgreSQL",
    "Redis",
    "Docker",
    "Kubernetes",
    "AWS",
    "Terraform",
    LONG_KEYWORD,
  ];
  const response = await request.post(apiUrl("/base-cvs"), {
    headers: apiHeaders(),
    data: {
      name: CV_NAME,
      full_name: "E2E Candidate",
      headline: "Engineer",
      location: "Remote",
      email: "e2e-user@e2e.applika.dev",
      phone: null,
      summary: "Seeded by the E2E suite.",
      links: [],
      skills: categories,
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();

  await loginAs(page, "user");
  await page.goto("/cvs");
  const tile = page
    .locator('[data-slot="card"]')
    .filter({ hasText: CV_NAME })
    .first();
  await expect(tile).toBeVisible();

  // Badges, in category order, each keyword exactly once and spelled the way
  // its first occurrence was typed.
  const badges = tile.locator('[data-slot="badge"]');
  await expect(badges).toHaveText(distinct);
  for (const keyword of distinct) {
    await expect(
      tile.locator('[data-slot="badge"]', { hasText: keyword }),
      `${keyword} is missing or repeated`,
    ).toHaveCount(1);
  }
  // The lower-case duplicate did NOT get a badge of its own.
  await expect(badges.filter({ hasText: /^Docker$/ })).toHaveCount(1);

  // The category names are the DOCUMENT's headings, not the tile's, and the
  // plain-text treatment the owner rejected is gone.
  for (const entry of categories) {
    await expect(tile.getByText(entry.category, { exact: true })).toHaveCount(
      0,
    );
  }
  await expect(tile.locator("dl")).toHaveCount(0);

  // Nine distinct keywords, and the tile counts what the user can SEE rather
  // than hiding a "+N".
  await expect(tile.getByText("9 keywords")).toBeVisible();
  await expect(page.getByText(/\+\d+ more/)).toHaveCount(0);

  // Really painted: every badge has real height and sits inside its row, so
  // none of them is clipped away by an overflow rule.
  const clipped = await tile.evaluate((card: HTMLElement) => {
    const chips = Array.from(
      card.querySelectorAll<HTMLElement>('[data-slot="badge"]'),
    );
    if (chips.length === 0) return "no badges";
    const row = chips[0].parentElement;
    if (!row) return "no badge row";
    const rowBox = row.getBoundingClientRect();
    for (const chip of chips) {
      const box = chip.getBoundingClientRect();
      if (box.height < 1) return `${chip.textContent} has no height`;
      if (box.width < 1) return `${chip.textContent} has no width`;
      if (box.bottom > rowBox.bottom + 1) return `${chip.textContent} is cut`;
      // The one that catches a `whitespace-nowrap` badge: a keyword wider
      // than the tile overhangs to the RIGHT, and the shell clips it away.
      if (box.right > rowBox.right + 1) return `${chip.textContent} overhangs`;
    }
    return null;
  });
  expect(clipped).toBeNull();
});

/* ==========================================================================
 * KODI-009, round 2 — the owner's three refinements (criteria 10, 11, 12).
 *
 * The owner: "remove the button to insert a new link/category/etc from the
 * category header and put inside the colapsable section, preferable bellow
 * from the last item added. And align the chevron icons to the center
 * vercially of the component. One last thing, when I scroll the page the live
 * preciew creates a gap from the top of the page".
 *
 * All three are GEOMETRY, and jsdom reports every height as zero. The
 * structural half of criterion 10 is pinned in
 * `src/components/base-cvs/cv-form-disclosure.test.tsx`; what only a real
 * engine can answer is here.
 * ====================================================================== */

/** The card of one section, located by its trigger's visible title. */
function sectionCard(page: Page, title: string) {
  return page
    .locator('[data-slot="cv-section"]')
    .filter({ has: sectionHeader(page, title) });
}

test("the whole section header toggles it, and a collapsed section offers no add control (10)", async ({
  page,
  request,
}) => {
  const cvId = await seedBulkyBaseCv(request, 2);

  await loginAs(page, "user");
  await openSettledEditor(page, cvId);

  const trigger = sectionHeader(page, "Experience");
  const add = page.getByRole("button", { name: "Add experience" });

  // ---- the add control is INSIDE the collapsible body -------------------
  const content = sectionCard(page, "Experience").locator(
    '[data-slot="cv-section-content"]',
  );
  await expect(
    content.getByRole("button", { name: "Add experience" }),
  ).toBeVisible();

  // ---- and geometrically BELOW the last row ----------------------------
  const lastRow = sectionCard(page, "Experience")
    .locator('[data-slot="cv-repeatable-item"]')
    .last();
  const rowBox = await lastRow.boundingBox();
  const addBox = await add.boundingBox();
  expect(rowBox && addBox).toBeTruthy();
  expect(
    addBox!.y,
    `the add control is not below the last row: ${JSON.stringify({ rowBox, addBox })}`,
  ).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height);

  // ---- the WHOLE header is the hit area --------------------------------
  // Pressed at its far RIGHT edge, over the chevron — a point that belonged
  // to the Add button before this change and to nothing at all after it.
  // `page.mouse` works in VIEWPORT coordinates and does not auto-scroll, so
  // the header has to be on screen before its box means anything.
  const header = sectionCard(page, "Experience").locator(
    '[data-slot="cv-section-header"]',
  );
  await header.scrollIntoViewIfNeeded();
  const headerBox = await header.boundingBox();
  expect(headerBox).toBeTruthy();
  await page.mouse.click(
    headerBox!.x + headerBox!.width - 12,
    headerBox!.y + headerBox!.height / 2,
  );
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  // ---- collapsed: no add control anywhere in the card -------------------
  await expect(add).toHaveCount(0);
  await expect(
    sectionCard(page, "Experience").getByRole("button"),
    "a collapsed section still exposes a control other than its own trigger",
  ).toHaveCount(1);

  // Re-open from the far LEFT of the header, over the icon tile. Collapsing
  // shortened the column, so the header moved: measure it again.
  await header.scrollIntoViewIfNeeded();
  const reopenBox = (await header.boundingBox())!;
  await page.mouse.click(reopenBox.x + 12, reopenBox.y + reopenBox.height / 2);
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(add).toBeVisible();

  // ---- an EMPTY section still offers one, below its hint ---------------
  const emptyHint = page.getByText("No projects yet.");
  await emptyHint.scrollIntoViewIfNeeded();
  await expect(emptyHint).toBeVisible();
  const addProject = page.getByRole("button", { name: "Add project" });
  const hintBox = await emptyHint.boundingBox();
  const addProjectBox = await addProject.boundingBox();
  expect(addProjectBox!.y).toBeGreaterThanOrEqual(hintBox!.y + hintBox!.height);

  // And it still adds: the control works where it now lives.
  await addProject.click();
  await expect(page.getByRole("group", { name: "project 1" })).toBeVisible();
});

test("every chevron sits on the vertical centre of its own header (11)", async ({
  page,
  request,
}) => {
  // The owner: "align the chevron icons to the center vercially of the
  // component". The header is two lines (title plus description), so
  // `items-start` pinned the chevron to the top of the first line. This
  // measures the icon's centre against the header's, in pixels.
  const cvId = await seedBulkyBaseCv(request, 2);

  await loginAs(page, "user");
  await openSettledEditor(page, cvId);

  const offsets = await page.evaluate(() => {
    const out: Array<{
      title: string;
      off: number;
      headerHeight: number;
    }> = [];
    for (const header of document.querySelectorAll(
      '[data-slot="cv-section-header"]',
    )) {
      const trigger = header.querySelector('[data-slot="cv-section-trigger"]');
      // The chevron is the header's own direct child, not the trigger's.
      const icon = header.querySelector(":scope > svg");
      if (!trigger || !icon) continue;
      const h = header.getBoundingClientRect();
      const i = icon.getBoundingClientRect();
      out.push({
        title: (trigger.textContent ?? "").trim(),
        off: Math.abs(i.top + i.height / 2 - (h.top + h.height / 2)),
        headerHeight: Math.round(h.height),
      });
    }
    return out;
  });

  expect(offsets.length, "no section chevrons found").toBe(
    FORM_SECTIONS.length,
  );
  for (const entry of offsets) {
    // Two-line headers really are two lines — otherwise centring is trivial.
    expect(
      entry.headerHeight,
      `${entry.title} has a one-line header, so this proves nothing`,
    ).toBeGreaterThan(56);
    expect(
      entry.off,
      `${entry.title}: chevron is ${entry.off.toFixed(1)}px off the header's centre`,
    ).toBeLessThanOrEqual(1);
  }

  // The Experience ROW triggers carry a chevron too, on a one-line header.
  const rowOffsets = await page.evaluate(() => {
    const out: number[] = [];
    for (const trigger of document.querySelectorAll(
      '[data-slot="cv-item-trigger"]',
    )) {
      const row = trigger.parentElement!;
      const icon = trigger.querySelector("svg")!;
      const r = row.getBoundingClientRect();
      const i = icon.getBoundingClientRect();
      out.push(Math.abs(i.top + i.height / 2 - (r.top + r.height / 2)));
    }
    return out;
  });
  expect(rowOffsets.length).toBe(2);
  for (const off of rowOffsets) {
    expect(
      off,
      `a row chevron is ${off.toFixed(1)}px off centre`,
    ).toBeLessThanOrEqual(1);
  }

  console.log(`[KODI-009] chevron offsets — ${JSON.stringify(offsets)}`);
});

/** Where the preview sits relative to the TOP of the shell's scrollport. */
async function previewGapReport(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main")!;
    const aside = document.querySelector<HTMLElement>(
      'aside[aria-label="CV preview"]',
    )!;
    const sheet = aside.querySelector('[data-slot="cv-page"]')!;
    const form = document.querySelector<HTMLElement>(
      '[data-slot="cv-section"]',
    )!;
    const footer = document.querySelector<HTMLElement>(
      'form [class*="sticky"][class*="bottom-0"]',
    );
    const m = main.getBoundingClientRect();
    const round = (n: number) => Math.round(n);
    return {
      scrollTop: round(main.scrollTop),
      scrollportHeight: main.clientHeight,
      footerHeight: footer
        ? round(footer.getBoundingClientRect().height)
        : null,
      // What `CvEditorFooter` published for `max-h-editor-scrollport` to spend.
      reservedFooter: getComputedStyle(
        document.documentElement,
      ).getPropertyValue("--cv-editor-footer-height"),
      // The band of nothing above the first A4 sheet — the owner's complaint.
      sheetGap: round(sheet.getBoundingClientRect().top - m.top),
      asideGap: round(aside.getBoundingClientRect().top - m.top),
      asideHeight: round(aside.getBoundingClientRect().height),
      formGap: round(form.getBoundingClientRect().top - m.top),
      docDelta:
        document.documentElement.scrollHeight -
        document.documentElement.clientHeight,
    };
  });
}

test("the live preview does not gap from the top of the page as it scrolls (12)", async ({
  page,
  request,
}) => {
  // The owner: "when I scroll the page the live preciew creates a gap from the
  // top of the page".
  //
  // ROOT CAUSE, measured: the pane was stuck at `md:top-20` inside `main` —
  // but `main` IS the scrollport and the shell `Header` is its SIBLING, above
  // it, so that 5rem cleared nothing and was dead band; and the pane's own cap
  // was `calc(100dvh - cookie - 12rem)`, measuring the VIEWPORT while living
  // in a scrollport one header shorter, with `12rem` the hand-tuned lump that
  // hid the difference. The first sheet sat 104px below the top of the
  // scrollport at every scroll position while the form column ran to 0.
  //
  // The assertion is the owner's own test: scroll, then look at the top.
  const cvId = await seedBulkyBaseCv(request, 12);

  await loginAs(page, "user");
  await openSettledEditor(page, cvId);

  const at: Record<string, Awaited<ReturnType<typeof previewGapReport>>> = {};
  for (const top of [0, 400, 1000, 2500]) {
    await page.evaluate((t) => {
      document.querySelector("main")!.scrollTop = t;
    }, top);
    await page.waitForTimeout(200);
    at[`scroll_${top}`] = await previewGapReport(page);
  }

  // The three positions past the page heading, where the pane is really stuck.
  const scrolled = [at.scroll_400, at.scroll_1000, at.scroll_2500];

  // 1. The form column really does reach the top of the scrollport once
  //    scrolled — otherwise "a gap above the preview" means nothing.
  for (const report of scrolled) {
    expect(report.formGap).toBeLessThanOrEqual(0);
  }

  // 2. The gap above the first sheet does not GROW as the page scrolls, and
  //    never exceeds the pane's own visible chrome. 32px is the "Live
  //    preview" label plus its gap with room to spare; the old layout sat at
  //    104px and could not pass this.
  for (const report of scrolled) {
    expect(
      report.sheetGap,
      `the preview gaps from the top of the page: ${JSON.stringify(report)}`,
    ).toBeLessThanOrEqual(32);
  }
  expect(
    Math.max(...scrolled.map((r) => r.sheetGap)) -
      Math.min(...scrolled.map((r) => r.sheetGap)),
    "the gap moves while scrolling",
  ).toBeLessThanOrEqual(1);

  // 3. The pane is stuck to the top of the scrollport itself, and is sized
  //    from the SCROLLPORT MINUS the sticky submit row it shares that
  //    scrollport with: no slack, no overflow, and nothing left under the bar.
  //
  //    It used to be the FULL scrollport, and that was the defect — the row is
  //    `sticky bottom-0` INSIDE `main`, so the pane's last band was painted
  //    over, and that band is the `<figcaption>` carrying the layout notice.
  //    The footer now publishes its measured height and
  //    `max-h-editor-scrollport` subtracts it. Assertion 5 below hit-tests the
  //    consequence; this one pins the arithmetic that produces it.
  for (const report of scrolled) {
    expect(report.asideGap).toBe(0);
    expect(
      report.footerHeight,
      "the editor renders no sticky footer at all",
    ).toBeGreaterThan(0);
    expect(
      report.reservedFooter.trim(),
      `the footer reserved nothing: ${JSON.stringify(report)}`,
    ).toBe(`${report.footerHeight}px`);
    expect(
      Math.abs(
        report.asideHeight - (report.scrollportHeight - report.footerHeight!),
      ),
      `the pane is not the scrollport minus the footer: ${JSON.stringify(report)}`,
    ).toBeLessThanOrEqual(1);
  }

  // 4. And none of it gave the page a scrollbar back (KODI-006 AC7).
  for (const key of Object.keys(at)) {
    expect(at[key].docDelta, `${key} scrolls the document`).toBeLessThanOrEqual(
      1,
    );
  }

  console.log(`[KODI-009] preview top gap — ${JSON.stringify(at)}`);
});

/* ===========================================================================
 * KODI-009 (13) — the layout notice is ON SCREEN, not under the submit row.
 * ======================================================================== */

/**
 * The preview's `<figcaption>` really belongs to ITSELF at its own centre.
 *
 * Sibling of `expectReachableWithCookieNoticeUp`, and the same technique for
 * the mirror-image bug. That helper proves the VIEWPORT-pinned cookie bar does
 * not cover an in-page sticky footer. This one proves the SCROLLPORT-pinned
 * sticky footer does not cover the preview caption above it — which it did,
 * completely, at `md` and up.
 *
 * Why it matters most on `/cvs/new`: the editors mount `ExportCvButton` in the
 * footer and it carries a second, visible copy of the notice, so the hidden
 * caption there was a duplicate. `/cvs/new` has NO export button — the server
 * typesets the STORED CV, so there is nothing to render until it has been saved
 * once — which made the caption the only copy on screen, and it was entirely
 * occluded.
 *
 * jsdom reports every height as zero, so this is only provable in a real
 * browser, by hit-test rather than by reading CSS: the arithmetic in
 * `max-h-editor-scrollport` can be right and still land wrong.
 */
async function captionHitTest(page: Page) {
  return page.evaluate((notice) => {
    const caption = Array.from(document.querySelectorAll("figcaption")).find(
      (element) => element.textContent?.includes(notice),
    );
    if (!caption) return { found: false as const };

    const rect = caption.getBoundingClientRect();
    const main = document.querySelector("main")!.getBoundingClientRect();
    const topmost = document.elementFromPoint(
      Math.round(rect.left + rect.width / 2),
      Math.round(rect.top + rect.height / 2),
    );

    const describe = (element: Element | null): string => {
      if (!element) return "nothing";
      if (element.closest('[class*="sticky"][class*="bottom-0"]')) {
        return "the editor's sticky submit footer";
      }
      if (element.closest('[role="dialog"][aria-label="Cookie notice"]')) {
        return "the cookie notice";
      }
      return `<${element.tagName.toLowerCase()}>`;
    };

    // The STICKY COLUMN, not the figure's parent: in `BaseCvEditor` that is
    // the `<aside>` itself, but in `TailoredCvEditor` the figure sits in a
    // `<section>` inside the sticky wrapper, under the job-description panel.
    // Anchoring on the figure's parent would measure a box that is legitimately
    // not at the top of the scrollport there, and the pinned check would fail
    // on a layout that is perfectly correct.
    const column = caption.closest<HTMLElement>('[class*="md:sticky"]');
    const columnRect = column?.getBoundingClientRect() ?? null;
    const footer = document.querySelector<HTMLElement>(
      'form [class*="sticky"][class*="bottom-0"]',
    );
    const footerRect = footer?.getBoundingClientRect() ?? null;

    return {
      found: true as const,
      height: Math.round(rect.height),
      scrollTop: Math.round(
        document.querySelector<HTMLElement>("main")!.scrollTop,
      ),
      // 0 once the pane is really stuck to the top of the scrollport, which is
      // the state the footer can occlude. Before that the caption is simply
      // below the fold, which is not this bug; and at the very END of the
      // scroll the pane un-sticks with its container and rides up, which is
      // not this bug either — the old geometry passes there too.
      columnGap: columnRect ? Math.round(columnRect.top - main.top) : null,
      columnHeight: columnRect ? Math.round(columnRect.height) : null,
      scrollportHeight: Math.round(main.height),
      footerHeight: footerRect ? Math.round(footerRect.height) : null,
      // Negative means the caption ENDS above the top edge of the submit row.
      // This is the whole fix, in one number.
      captionBottomVsFooterTop: footerRect
        ? Math.round(rect.bottom - footerRect.top)
        : null,
      // Positive means the caption hangs past the bottom of the scrollport.
      pastScrollportBottom: Math.round(rect.bottom - main.bottom),
      onScreen: rect.top >= 0 && rect.bottom <= window.innerHeight + 1,
      coveredBy:
        topmost && caption.contains(topmost) ? null : describe(topmost),
    };
  }, PDF_LAYOUT_NOTICE);
}

/**
 * Hit-test the caption in the ONE state the footer could cover it: scrolled far
 * enough that the sticky pane is PINNED to the top of the scrollport and sized
 * to its own cap, with its bottom edge up against the submit row.
 *
 * Neither end of the scroll proves anything. At `scrollTop: 0` the caption is
 * below the fold for the ordinary reason that the page has not been scrolled
 * yet, and `elementFromPoint` outside the viewport returns nothing. At the very
 * END of the scroll the pane un-sticks with its container and rides up, so the
 * caption clears the footer even on the old geometry. `asideGap === 0` and
 * `asideHeight === scrollportHeight - footerHeight` are asserted here precisely
 * so this test cannot quietly drift into one of those two states and keep
 * passing while the defect is back.
 */
async function expectCaptionUnoccluded(page: Page, where: string) {
  // Past the page heading, where the pane is really stuck, and well short of
  // the end of the scroll, where it stops being stuck again.
  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>("main")!;
    main.scrollTop = Math.min(800, Math.round(main.scrollHeight / 2));
  });
  await page.waitForTimeout(200);

  const hit = await captionHitTest(page);

  expect(hit.found, `no <figcaption> carries the notice on ${where}`).toBe(
    true,
  );
  if (!hit.found) return;

  expect(hit.height, `the caption has no height on ${where}`).toBeGreaterThan(
    0,
  );
  expect(
    hit.scrollTop,
    `${where} never scrolled, so the footer was never over the pane`,
  ).toBeGreaterThan(0);

  // The column is stuck to the top of the scrollport: this is the state the
  // old geometry put the caption under the bar in.
  expect(
    hit.columnGap,
    `the preview column is not pinned on ${where}: ${JSON.stringify(hit)}`,
  ).toBe(0);
  expect(
    hit.footerHeight,
    `${where} renders no sticky footer at all`,
  ).toBeGreaterThan(0);
  // The column never claims the band the footer occupies. `<=` rather than
  // `===` because a preview shorter than its cap simply does not reach it (a
  // narrow column scales the A4 sheet down); the EXACT equality on a column
  // that does reach its cap is pinned by the preview-gap test above, on the
  // 12-role CV. On the old geometry this was the full scrollport and it fails.
  expect(
    hit.columnHeight,
    `the column claims the footer's band on ${where}: ${JSON.stringify(hit)}`,
  ).toBeLessThanOrEqual(hit.scrollportHeight - hit.footerHeight! + 1);

  expect(
    hit.onScreen,
    `the caption is off screen on ${where}: ${JSON.stringify(hit)}`,
  ).toBe(true);
  expect(
    hit.pastScrollportBottom,
    `the caption hangs past the scrollport on ${where}: ${JSON.stringify(hit)}`,
  ).toBeLessThanOrEqual(1);

  // The caption ENDS above the top edge of the submit row.
  expect(
    hit.captionBottomVsFooterTop,
    `the caption runs past the top of the submit row on ${where}: ${JSON.stringify(hit)}`,
  ).toBeLessThanOrEqual(1);

  // THE assertion: the caption's own centre belongs to the caption. Before
  // `--cv-editor-footer-height` this said "the editor's sticky submit footer".
  expect(
    hit.coveredBy,
    `the layout notice is covered on ${where} by ${hit.coveredBy}`,
  ).toBeNull();

  console.log(`[KODI-009] caption hit-test ${where} — ${JSON.stringify(hit)}`);
}

test("the layout notice is never under the submit row, on either editor (13)", async ({
  page,
  request,
}) => {
  const cvId = await seedBaseCv(request, CV_NAME);
  await loginAs(page, "user");

  // ---- /cvs/new: the caption is the ONLY copy on screen ----------------
  await page.goto("/cvs/new");
  await expect(page.getByLabel("CV label", { exact: true })).toBeVisible();
  await expect(page.locator(SHEET).first()).toBeVisible();

  // There is no export button here, so there is no second copy to fall back
  // on. This is the assertion that makes the hit-test below load-bearing.
  await expect(page.getByRole("button", { name: "Download PDF" })).toHaveCount(
    0,
  );
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(1);
  await expectCaptionUnoccluded(page, "/cvs/new");

  // Still unoccluded at the bottom edge of the range, where the column is
  // narrowest and the footer closest to wrapping. The height is MEASURED
  // rather than hardcoded precisely so a wrap cannot under-reserve.
  await page.setViewportSize({ width: 768, height: 800 });
  await expect(page.locator(SHEET).first()).toBeVisible();
  await expectCaptionUnoccluded(page, "/cvs/new at md exactly");
  await page.setViewportSize({ width: 1280, height: 720 });

  // ---- /cvs/editor?id=: the caption AND the button's own copy ----------
  await openSettledEditor(page, cvId);
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);
  await expectCaptionUnoccluded(page, "/cvs/editor?id=");

  // The footer is taller here — it carries the export beside Save and Cancel —
  // so the reservation has to TRACK it, not a constant measured on /cvs/new.
  await expectReachableWithCookieNoticeUp(page, "Download PDF");
  await expectCaptionUnoccluded(page, "/cvs/editor?id= with the notice up");

  // ---- /applications/cv?id=: the OTHER editor, whose sticky column also
  // carries the job-description panel above the preview. It shares the footer
  // and the cap, so it shares the defect; measure it rather than assume it.
  const applicationId = await seedApplication(request, JOB_DESCRIPTION);
  await seedTailoredCv(request, applicationId, cvId);
  await page.goto(`/applications/cv?id=${applicationId}`);
  await expect(page.getByLabel("CV label", { exact: true })).toHaveValue(
    CV_NAME,
  );
  await expect(page.locator(SHEET).first()).toBeVisible();
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(2);
  await expectCaptionUnoccluded(page, "/applications/cv?id=");
});

test("the CV gallery says nothing about a preview it does not render (13)", async ({
  page,
  request,
}) => {
  await seedBaseCv(request, CV_NAME);
  await loginAs(page, "user");
  await page.goto("/cvs");

  const download = page.getByRole("button", {
    name: `Download PDF ${CV_NAME}`,
  });
  await expect(download).toBeVisible();

  // The tiles render NO preview, so the preview-is-not-the-PDF notice
  // qualifies nothing here. It used to reach this page `sr-only` through the
  // export button's `aria-describedby` — heard once per tile by a screen
  // reader, seen by nobody. `toHaveCount(0)` covers the sr-only copy too:
  // `getByText` matches it, it is only visually hidden.
  await expect(page.getByText(PDF_LAYOUT_NOTICE)).toHaveCount(0);
  await expect(download).not.toHaveAttribute("aria-describedby", /./);
});
