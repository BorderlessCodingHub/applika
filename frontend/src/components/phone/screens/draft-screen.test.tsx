import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewWithCvPage } from "@/app/(protected)/applications/new-with-cv/new-with-cv-page";
import { SupportsProvider } from "@/contexts/supports-context";
import type { Draft, DraftInput } from "@/services/types/application-drafts";
import type { MyFeature } from "@/services/types/features";
import {
  pathname,
  routerPush,
  routerReplace,
  setLocation,
} from "@/test/navigation";
import {
  SAM,
  renderPhoneScreen,
  renderShellAcrossMd,
} from "@/test/phone-screens";

/**
 * `/applications/new-with-cv` below md: v2/Draft on the page's own forms,
 * autosave loops and calls (the page renders `DraftScreen` after its hooks).
 */

const mocks = vi.hoisted(() => ({
  features: { current: [] as MyFeature[] },
  getDraft: vi.fn(),
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  finishDraft: vi.fn(),
  searchCompanies: vi.fn(),
  listPlatforms: vi.fn(),
  listBaseCvs: vi.fn(),
  getTailoredCv: vi.fn(),
  createTailoredCv: vi.fn(),
  updateTailoredCv: vi.fn(),
  getFit: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: () => Promise.resolve(mocks.features.current) },
    applicationDrafts: {
      list: vi.fn().mockResolvedValue([]),
      get: (...args: unknown[]) => mocks.getDraft(...args),
      create: (...args: unknown[]) => mocks.createDraft(...args),
      update: (...args: unknown[]) => mocks.updateDraft(...args),
      remove: vi.fn(),
      finish: (...args: unknown[]) => mocks.finishDraft(...args),
    },
    companies: {
      searchCompanies: (...args: unknown[]) => mocks.searchCompanies(...args),
      create: vi.fn(),
    },
    platforms: {
      list: (...args: unknown[]) => mocks.listPlatforms(...args),
      create: vi.fn(),
    },
    supports: {
      getSupports: () =>
        Promise.resolve({
          platforms: [
            { id: "plt-1", name: "LinkedIn", url: null, is_public: true },
          ],
        }),
    },
    baseCvs: { list: (...args: unknown[]) => mocks.listBaseCvs(...args) },
    tailoredCvs: {
      get: (...args: unknown[]) => mocks.getTailoredCv(...args),
      create: (...args: unknown[]) => mocks.createTailoredCv(...args),
      update: (...args: unknown[]) => mocks.updateTailoredCv(...args),
      remove: vi.fn(),
      getFit: (...args: unknown[]) => mocks.getFit(...args),
    },
  },
}));

const JOBS_AND_CVS: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "general" },
];
const CVS_ONLY: MyFeature[] = [{ key: "cvs", stage: "general" }];

function draftFrom(input: Partial<Draft> = {}): Draft {
  return {
    id: "draft-9",
    job_id: null,
    company_id: null,
    company_name: "Acme",
    role: "Engineer",
    platform_id: "plt-1",
    mode: "active",
    application_date: "2026-09-26",
    has_cv: false,
    job_description: "Rust and Kafka every day.",
    created_at: "2026-09-26T10:00:00Z",
    updated_at: null,
    ...input,
  } as Draft;
}

const MASTER = {
  id: "base-1",
  name: "Backend CV",
  updated_at: "2026-10-30T10:00:00Z",
};

const COPY = {
  id: "copy-1",
  application_id: "draft-9",
  name: "Copy",
  full_name: "Sam Carter",
  headline: "Backend Engineer",
  location: "Lisbon",
  email: "sam@example.com",
  phone: "",
  summary: "Twelve chars",
  links: [],
  skills: [{ id: "s1", category: "Languages", keywords: ["Rust", "Go"] }],
  experience: [
    {
      id: "e1",
      company: "Acme",
      role: "Engineer",
      start: "2021-03",
      bullets: [],
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
  base_cv_id: "base-1",
  base_snapshot: null,
  was_ai_generated: false,
  adjustments: [{ section: "skills", description: "Rust first" }],
  created_at: "2026-10-30T10:00:00Z",
  updated_at: null,
};

const NO_COPY = { isAxiosError: true, response: { status: 404 } };

/** The server's draft: what the last POST or PUT stored. */
let stored: Draft;

beforeEach(() => {
  mocks.features.current = JOBS_AND_CVS;
  stored = draftFrom();
  mocks.getDraft.mockReset().mockImplementation(async () => stored);
  mocks.createDraft.mockReset().mockImplementation(async (data: DraftInput) => {
    stored = draftFrom({ ...data, id: "draft-new" } as Partial<Draft>);
    return stored;
  });
  mocks.updateDraft
    .mockReset()
    .mockImplementation(async (id: string, data: DraftInput) => {
      stored = draftFrom({ ...stored, ...data, id } as Partial<Draft>);
      return stored;
    });
  mocks.finishDraft.mockReset().mockResolvedValue({ id: "draft-9" });
  mocks.searchCompanies.mockReset().mockResolvedValue([]);
  mocks.listPlatforms
    .mockReset()
    .mockResolvedValue([
      { id: "plt-1", name: "LinkedIn", url: null, is_public: true },
    ]);
  mocks.listBaseCvs.mockReset().mockResolvedValue([MASTER]);
  mocks.getTailoredCv.mockReset().mockRejectedValue(NO_COPY);
  mocks.createTailoredCv.mockReset().mockResolvedValue(COPY);
  mocks.updateTailoredCv.mockReset().mockResolvedValue(COPY);
  mocks.getFit.mockReset().mockResolvedValue({
    score: 64,
    matched_keywords: ["rust"],
    missing_keywords: ["kafka"],
  });
  routerPush.mockReset();
  routerReplace
    .mockReset()
    .mockImplementation((url: string) =>
      window.history.replaceState(null, "", url),
    );
  pathname.current = "/applications/new-with-cv";
  setLocation("/applications/new-with-cv");
});

const page = (
  <SupportsProvider>
    <NewWithCvPage />
  </SupportsProvider>
);

const renderDraft = (features: MyFeature[] = JOBS_AND_CVS) => {
  mocks.features.current = features;
  return renderPhoneScreen("/applications/new-with-cv", page, { features });
};

const status = () =>
  document.querySelector('[data-slot="autosave-status"]') as HTMLElement;

describe("the new application with CV below md", () => {
  it("renders the Draft board's step 1: back to Applications, the steps, the board's six fields, then More details", async () => {
    const user = userEvent.setup();
    await renderDraft();

    const bar = screen.getByRole("banner");
    expect(
      within(bar).getByRole("link", { name: "Applications" }),
    ).toHaveAttribute("href", "/applications");
    expect(within(bar).getByRole("status")).toHaveAttribute(
      "data-slot",
      "autosave-status",
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "New application with CV",
      }),
    ).toHaveClass("ph-h1", "ph-dr-h1");
    expect(
      screen.getByText(
        "Fill in the application, then tailor a copy of one of your master CVs. It saves as a draft while you type.",
      ),
    ).toHaveClass("ph-lead");

    const steps = screen.getByRole("navigation", { name: "Steps" });
    expect(steps).toHaveClass("ph-dr-steps");
    const one = within(steps).getByRole("button", {
      name: "Step 1: Application",
    });
    expect(one).toHaveAttribute("aria-current", "step");
    expect(one).toHaveClass("ph-step", "ph-on");
    expect(
      within(steps).getByRole("button", { name: "Step 2: CV" }),
    ).toHaveAttribute("aria-disabled", "true");

    const fields = document.querySelector(
      '[data-slot="draft-application-step"]',
    ) as HTMLElement;
    const labels = Array.from(fields.querySelectorAll(".ph-lbl"))
      .filter((label) => !label.closest('[data-slot="draft-more-details"]'))
      .map((label) => label.textContent);
    expect(labels).toEqual([
      "Company",
      "Role",
      "Platform",
      "Experience",
      "Work mode",
      "Job description",
    ]);
    expect(screen.getByPlaceholderText("e.g. Senior Engineer")).toHaveClass(
      "ph-input",
    );

    // The application date is under More details (Plan corrections 3).
    const more = screen.getByRole("button", { name: "More details" });
    expect(more).toHaveAttribute("aria-expanded", "false");
    expect(more).toHaveAccessibleDescription("Date, source, link, salary");
    expect(
      document.querySelector('[data-slot="draft-more-details"]'),
    ).not.toBeVisible();
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText(/application date/i)).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveTextContent(
      /active/i,
    );

    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/applications");
    expect(
      screen.getByRole("button", { name: "Continue to CV" }),
    ).toHaveAttribute("aria-disabled", "true");
    expect(
      document.querySelector('[data-slot="draft-missing"]'),
    ).toHaveTextContent(/company/i);
  });

  it("creates the draft once company, role and platform are set, and says Saved", async () => {
    const user = userEvent.setup();
    await renderDraft();

    await user.type(
      screen.getByPlaceholderText("e.g. Senior Engineer"),
      "Engineer",
    );
    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await user.click(screen.getByRole("combobox", { name: "Platform" }));
    await user.click(await screen.findByRole("option", { name: "LinkedIn" }));

    await waitFor(() => expect(mocks.createDraft).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(mocks.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    await waitFor(() => expect(window.location.search).toBe("?id=draft-new"));
    await waitFor(() =>
      expect(status()).toHaveAttribute("data-state", "saved"),
    );
    expect(status()).toHaveTextContent("Saved");
    expect(
      screen.getByRole("button", { name: "Continue to CV" }),
    ).not.toHaveAttribute("aria-disabled");
  }, 15_000);

  it("opens More details by itself when a field inside it starts failing", async () => {
    const user = userEvent.setup();
    stored = draftFrom({ link_to_job: "not a url" });
    setLocation("/applications/new-with-cv?id=draft-9");
    await renderDraft();
    await screen.findByDisplayValue("Engineer");
    const more = screen.getByRole("button", { name: "More details" });
    expect(more).toHaveAttribute("aria-expanded", "false");

    // The autosave validates the whole form: the stored link fails, folded.
    await user.type(screen.getByRole("textbox", { name: "Role" }), " II");
    await waitFor(() => expect(more).toHaveAttribute("aria-expanded", "true"), {
      timeout: 3000,
    });
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  }, 15_000);

  it("step 2 without a copy: the tailor switch (with jobs and a saved job description), the master CV options and Create the CV copy", async () => {
    const user = userEvent.setup();
    setLocation("/applications/new-with-cv?id=draft-9&step=cv");
    await renderDraft();

    const steps = await screen.findByRole("navigation", { name: "Steps" });
    await waitFor(() =>
      expect(
        within(steps).getByRole("button", { name: "Step 2: CV" }),
      ).toHaveAttribute("aria-current", "step"),
    );
    const tailor = await screen.findByRole("switch", {
      name: "Tailor by keywords",
    });
    expect(tailor).toHaveAccessibleDescription(
      "Reorders skills and bullets by how well they match the job description.",
    );
    expect(tailor).toHaveAttribute("aria-checked", "false");
    const options = screen.getByRole("radiogroup", {
      name: "Choose a master CV",
    });
    // A lone master CV is preselected.
    expect(
      within(options).getByRole("radio", { name: "Backend CV" }),
    ).toBeChecked();
    expect(
      within(options).getByRole("radio", { name: "Backend CV" }),
    ).toHaveAccessibleDescription("Updated Oct 30, 2026");

    await user.click(tailor);
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );
    expect(mocks.createTailoredCv).toHaveBeenCalledWith(
      "draft-9",
      "base-1",
      "keywords",
    );
  });

  it("step 2 with no master CV invites to write one", async () => {
    mocks.listBaseCvs.mockResolvedValue([]);
    setLocation("/applications/new-with-cv?id=draft-9&step=cv");
    await renderDraft();

    const card = await waitFor(() => {
      const found = document.querySelector('[data-slot="draft-no-master-cv"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(
      within(card).getByRole("link", { name: "Create your first CV" }),
    ).toHaveAttribute("href", "/cvs/new");
  });

  it("step 2 with a copy: the board's summary rows, Reordered, the CV fit panel, the inline editor and Finish", async () => {
    const user = userEvent.setup();
    stored = draftFrom({ has_cv: true });
    mocks.getTailoredCv.mockResolvedValue(COPY);
    setLocation("/applications/new-with-cv?id=draft-9&step=cv");
    await renderDraft();

    const copy = await waitFor(() => {
      const found = document.querySelector('[data-slot="draft-cv-copy"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(
      within(copy).getByText("CV copy").closest(".ph-pill"),
    ).not.toBeNull();
    expect(
      await within(copy).findByText("Copied from Backend CV"),
    ).toBeInTheDocument();
    const rows = within(copy).getByRole("list", { name: "CV copy sections" });
    expect(
      Array.from(rows.querySelectorAll("li.ph-sec-row")).map((row) =>
        row.getAttribute("data-section"),
      ),
    ).toEqual([
      "identity",
      "summary",
      "experience",
      "skills",
      "projects",
      "education",
    ]);
    const identity = rows.querySelector('[data-section="identity"]')!;
    expect(within(identity as HTMLElement).getByText("Sam Carter")).toHaveClass(
      "ph-mono",
    );
    const skills = rows.querySelector('[data-section="skills"]') as HTMLElement;
    expect(
      within(skills).getByText("Reordered").closest(".ph-pill.ph-pri"),
    ).not.toBeNull();
    expect(
      within(
        rows.querySelector('[data-section="experience"]') as HTMLElement,
      ).getByText("1 role"),
    ).toBeInTheDocument();

    // The jobs-only fit panel, with today's data-slot.
    expect(
      await waitFor(() => {
        const panel = document.querySelector('[data-slot="cv-fit-panel"]');
        expect(panel).not.toBeNull();
        return panel;
      }),
    ).toBeInTheDocument();

    // "Edit the CV copy" edits it in place (the page's form, autosaved).
    const edit = screen.getByRole("button", { name: "Edit the CV copy" });
    await user.click(edit);
    const editor = document.querySelector(
      '[data-slot="draft-cv-editor"]',
    ) as HTMLElement;
    expect(
      within(editor).getByRole("heading", {
        level: 2,
        name: "Edit the CV copy",
      }),
    ).toBeInTheDocument();
    const done = within(editor).getByRole("button", { name: "Done" });
    expect(done).toHaveFocus();
    expect(
      within(editor).getByRole("heading", { level: 3, name: "Links" }),
    ).toBeInTheDocument();
    const fullName = within(editor).getByDisplayValue("Sam Carter");
    await user.type(fullName, " Jr");
    await waitFor(
      () =>
        expect(mocks.updateTailoredCv).toHaveBeenCalledWith(
          "draft-9",
          expect.objectContaining({ full_name: "Sam Carter Jr" }),
        ),
      { timeout: 3000 },
    );
    await user.click(done);
    expect(
      screen.getByRole("button", { name: "Edit the CV copy" }),
    ).toHaveFocus();

    const finish = screen.getByRole("button", { name: "Finish" });
    expect(finish).not.toHaveAttribute("aria-disabled");
    expect(screen.getByRole("button", { name: "Back" })).toHaveClass(
      "ph-dr-lead-btn",
    );
    await user.click(finish);
    await waitFor(() => expect(mocks.finishDraft).toHaveBeenCalled());
    await waitFor(() =>
      expect(routerPush).toHaveBeenCalledWith("/applications"),
    );
  }, 15_000);

  it("without jobs: no tailor switch and no CV fit (no fit request), the copy still works", async () => {
    stored = draftFrom({ has_cv: true });
    mocks.getTailoredCv.mockResolvedValue(COPY);
    setLocation("/applications/new-with-cv?id=draft-9&step=cv");
    await renderDraft(CVS_ONLY);

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="draft-cv-copy"]'),
      ).not.toBeNull(),
    );
    expect(document.querySelector('[data-slot="cv-fit-panel"]')).toBeNull();
    expect(mocks.getFit).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("switch", { name: "Tailor by keywords" }),
    ).toBeNull();
  });

  it("without cvs: page not found and no draft or CV request", async () => {
    setLocation("/applications/new-with-cv?id=draft-9");
    await renderDraft([{ key: "jobs", stage: "beta" }]);

    expect(
      await screen.findByRole("heading", { level: 1, name: "404" }),
    ).toBeInTheDocument();
    expect(mocks.getDraft).not.toHaveBeenCalled();
    expect(mocks.listBaseCvs).not.toHaveBeenCalled();
    expect(mocks.getTailoredCv).not.toHaveBeenCalled();
  });

  it("shows the loading skeleton, then a draft that is gone, and a failure with Retry", async () => {
    const user = userEvent.setup();
    setLocation("/applications/new-with-cv?id=gone");
    mocks.getDraft.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 404, data: { detail: "Not found" } },
    });
    const { unmount } = await renderDraft();
    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Loading this draft");
    const gone = await waitFor(() => {
      const found = document.querySelector('[data-slot="draft-not-found"]');
      expect(found).not.toBeNull();
      return found as HTMLElement;
    });
    expect(within(gone).getByText("This draft is not available")).toBeVisible();
    expect(
      within(gone).getByRole("link", { name: "Go to applications" }),
    ).toHaveAttribute("href", "/applications");
    unmount();

    setLocation("/applications/new-with-cv?id=draft-9");
    mocks.getDraft.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: { detail: "Drafts are down" } },
    });
    await renderDraft();
    expect(await screen.findByText("Drafts are down")).toBeInTheDocument();
    expect(screen.getByText("Could not load this draft")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByDisplayValue("Engineer")).toBeInTheDocument();
  });
});

describe("the draft across md (PRD 0021 edge case)", () => {
  it("swaps the layout and keeps what autosave saved; a change typed within the last second before crossing is dropped", async () => {
    const user = userEvent.setup();
    setLocation("/applications/new-with-cv?id=draft-9");
    mocks.features.current = JOBS_AND_CVS;
    const { viewport } = renderShellAcrossMd(
      "/applications/new-with-cv",
      page,
      { features: JOBS_AND_CVS },
    );

    const role = await screen.findByDisplayValue("Engineer");
    expect(document.querySelector('[data-slot="phone-draft"]')).not.toBeNull();

    // Typed, then left a second: autosave PUTs it.
    await user.type(role, " II");
    await waitFor(
      () =>
        expect(mocks.updateDraft).toHaveBeenLastCalledWith(
          "draft-9",
          expect.objectContaining({ role: "Engineer II" }),
        ),
      { timeout: 3000 },
    );
    await waitFor(() =>
      expect(status()).toHaveAttribute("data-state", "saved"),
    );
    const puts = mocks.updateDraft.mock.calls.length;

    // Typed, then the screen crosses md before the debounce fires.
    await user.type(role, "I");
    viewport.setPhone(false);

    expect(document.querySelector('[data-slot="phone-draft"]')).toBeNull();
    expect(await screen.findByDisplayValue("Engineer II")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Engineer III")).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(mocks.updateDraft).toHaveBeenCalledTimes(puts);
    expect(stored.role).toBe("Engineer II");
    expect(window.location.search).toBe("?id=draft-9");
  }, 15_000);
});
