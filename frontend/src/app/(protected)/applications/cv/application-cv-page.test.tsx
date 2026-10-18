import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { MyFeature } from "@/services/types/features";

import { ApplicationCvPage } from "./application-cv-page";
import { FullWidthRequestProvider } from "@/components/layout/content-width";
import type { Application } from "@/services/types/applications";
import type { BaseCv } from "@/services/types/base-cv";
import type { TailoredCv } from "@/services/types/tailored-cv";

/**
 * `/applications/cv?id=` — the application's CV copy (KODI-003).
 *
 * This suite is the WIRING half of the acceptance criteria: what the page asks
 * the API for, what it does with the answer, and which surface it puts on
 * screen. The presentational half — how the picker and the editor look given
 * their props — is `src/components/tailored-cvs/tailored-cvs-ui.test.tsx`, and
 * the verbs and bodies are `src/hooks/use-tailored-cv.test.tsx`.
 *
 * Criteria proved here: AC1 (no default master CV — the picker is the only way
 * in), AC2 (the lone master CV is preselected and creating uses it), AC4 (a copy
 * whose source is gone keeps its content, says "source CV deleted" and stays
 * editable), AC6 (every section round-trips through the form and back onto the
 * wire), AC7 (delete returns to the picker with every master CV offered again),
 * AC9 (the application's job description sits beside the editor) and AC10 (a
 * finalized or archived application locks both surfaces).
 *
 * KODI-004 adds one more: the PDF export is mounted in BOTH modes and is never
 * disabled by the lock. Refusing to write a finalized copy and refusing to read
 * it are different things (AC1).
 */

const getCopy = vi.fn();
const createCopy = vi.fn();
const updateCopy = vi.fn();
const removeCopy = vi.fn();
const getFit = vi.fn();
const exportCopyPdf = vi.fn();
const exportCopyMarkdown = vi.fn();
const exportCopyDiffMarkdown = vi.fn();
const exportCopyDiffPdf = vi.fn();
const listBaseCvs = vi.fn();
const removeBaseCv = vi.fn();
const exportBaseCvPdf = vi.fn();
const exportBaseCvMarkdown = vi.fn();
const getApplications = vi.fn();

const NO_FILE = { blob: new Blob(["x"]), filename: null };

/** The cases written before PRD 0013 run with `jobs`; PRD 0015 adds `cvs`. */
let myFeatures: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];
const getMyFeatures = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: (...args: unknown[]) => getMyFeatures(...args) },
    tailoredCvs: {
      get: (...args: unknown[]) => getCopy(...args),
      create: (...args: unknown[]) => createCopy(...args),
      update: (...args: unknown[]) => updateCopy(...args),
      remove: (...args: unknown[]) => removeCopy(...args),
      getFit: (...args: unknown[]) => getFit(...args),
      exportPdf: (...args: unknown[]) => exportCopyPdf(...args),
      exportMarkdown: (...args: unknown[]) => exportCopyMarkdown(...args),
      exportDiffMarkdown: (...args: unknown[]) =>
        exportCopyDiffMarkdown(...args),
      exportDiffPdf: (...args: unknown[]) => exportCopyDiffPdf(...args),
    },
    baseCvs: {
      list: (...args: unknown[]) => listBaseCvs(...args),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: (...args: unknown[]) => removeBaseCv(...args),
      exportPdf: (...args: unknown[]) => exportBaseCvPdf(...args),
      exportMarkdown: (...args: unknown[]) => exportBaseCvMarkdown(...args),
    },
    applications: {
      getApplications: (...args: unknown[]) => getApplications(...args),
      createApplication: vi.fn(),
      updateApplication: vi.fn(),
    },
    companies: { searchCompanies: vi.fn().mockResolvedValue([]) },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

let searchParams = new URLSearchParams("id=42");
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => searchParams,
}));

let cycleContext = {
  selectedCycleId: null as string | null,
  setSelectedCycleId: vi.fn(),
  isViewingPastCycle: false,
};
vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => cycleContext,
  CycleProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const APPLICATION: Application = {
  id: "42",
  company_id: "c-1",
  company_name: "Applika",
  platform_id: "p-1",
  role: "Backend Engineer",
  mode: "active",
  application_date: "2026-01-05",
  job_description: "We need someone who has run Postgres in anger.",
  finalized: false,
  finalized_at: null,
};

const MASTER_CVS: BaseCv[] = [
  {
    id: "7",
    name: "Backend CV",
    full_name: "Ada Lovelace",
    headline: "Senior Backend Engineer",
    location: "London",
    email: "ada@example.com",
    phone: null,
    summary: "Eight years on payment systems.",
    links: [],
    skills: [
      { id: "s-1", category: "Languages and frameworks", keywords: ["Python"] },
    ],
    education: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  },
  {
    id: "8",
    name: "Frontend CV",
    full_name: "Ada Lovelace",
    headline: "Senior Frontend Engineer",
    location: "London",
    email: "ada@example.com",
    phone: null,
    summary: "Also does React.",
    links: [],
    skills: [],
    education: [],
    experience: [],
    projects: [],
    certifications: [],
    languages: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: null,
  },
];

const FIT = {
  score: 72,
  matched_keywords: ["python", "postgres"],
  missing_keywords: ["kubernetes"],
};

/** A copy with every section populated, so the round trip has something to lose. */
const COPY: TailoredCv = {
  id: "9001",
  application_id: "42",
  base_cv_id: "7",
  base_snapshot: null,
  was_ai_generated: false,
  adjustments: [],
  name: "Backend CV for Applika",
  full_name: "Ada Lovelace",
  headline: "Senior Backend Engineer",
  location: "London",
  email: "ada@example.com",
  phone: "+44 20 7946 0958",
  summary: "Eight years on payment systems.",
  links: [{ id: "l-1", label: "GitHub", url: "https://github.com/ada" }],
  skills: [
    {
      id: "s-1",
      category: "Languages and frameworks",
      keywords: ["Python", "Postgres"],
    },
  ],
  experience: [
    {
      id: "e-1",
      company: "Stripe",
      role: "Senior Backend Engineer",
      start: "2021-03",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [
    { id: "p-1", name: "Ledger", description: "Double-entry ledger." },
  ],
  education: [
    {
      id: "d-1",
      institution: "University of Edinburgh",
      degree: "BSc",
      area: "Computer Science",
      start: "2010-09",
      end: "2013-06",
    },
  ],
  certifications: [{ id: "k-1", name: "AWS SAA", issuer: "Amazon" }],
  languages: [{ id: "g-1", name: "English", level: "Native" }],
  created_at: "2026-01-06T00:00:00Z",
  updated_at: null,
};

/** The API's real answer for an application that has no copy. */
function noCopy() {
  return {
    isAxiosError: true,
    response: { status: 404, data: { detail: "CV copy not found" } },
  };
}

// Tracks whether the page asks the shell for the full width (KODI-017, AC1),
// without paying for a real `AppShell` (its header pulls in cycles/statistics
// queries this suite does not mock). `release` is returned fresh per call, the
// same COUNT contract `useFullWidthRequests` implements.
let fullWidthRequest: ReturnType<typeof vi.fn>;

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // Seeded, as after the shell's own fetch.
  client.setQueryData(MY_FEATURES_QUERY_KEY, myFeatures);
  return render(
    <QueryClientProvider client={client}>
      <FullWidthRequestProvider value={fullWidthRequest}>
        <ApplicationCvPage />
      </FullWidthRequestProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  myFeatures = [
    { key: "jobs", stage: "beta" },
    { key: "cvs", stage: "beta" },
  ];
  getMyFeatures.mockImplementation(async () => myFeatures);
  fullWidthRequest = vi.fn(() => vi.fn());
  searchParams = new URLSearchParams("id=42");
  cycleContext = {
    selectedCycleId: null,
    setSelectedCycleId: vi.fn(),
    isViewingPastCycle: false,
  };
  getApplications.mockResolvedValue([APPLICATION]);
  listBaseCvs.mockResolvedValue(MASTER_CVS);
  getCopy.mockRejectedValue(noCopy());
  createCopy.mockResolvedValue(COPY);
  updateCopy.mockResolvedValue(COPY);
  removeCopy.mockResolvedValue(undefined);
  getFit.mockResolvedValue(FIT);
  removeBaseCv.mockResolvedValue(undefined);
  exportBaseCvPdf.mockResolvedValue({
    blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    filename: null,
  });
  // No `Content-Disposition` on purpose: the page must fall back to the slug of
  // the copy's own label, which is the rule the server uses too.
  exportCopyPdf.mockResolvedValue({
    blob: new Blob(["%PDF-1.7"], { type: "application/pdf" }),
    filename: null,
  });
  exportCopyMarkdown.mockResolvedValue(NO_FILE);
  exportCopyDiffMarkdown.mockResolvedValue(NO_FILE);
  exportCopyDiffPdf.mockResolvedValue(NO_FILE);
  exportBaseCvMarkdown.mockResolvedValue(NO_FILE);
  URL.createObjectURL = (() =>
    "blob:applika/pdf") as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = () => {};
});

describe("ApplicationCvPage", () => {
  it("offers the picker — never a default CV — and copies the one the user picks (AC1)", async () => {
    const user = userEvent.setup();
    renderPage();

    // Two master CVs: nothing is chosen for the user, so nothing can be copied
    // until they choose. There is no default master CV in this product.
    const create = await screen.findByRole("button", {
      name: "Create the CV copy",
    });
    expect(create).toBeDisabled();
    expect(createCopy).not.toHaveBeenCalled();

    await user.click(screen.getByRole("radio", { name: /Frontend CV/ }));
    await user.click(create);

    await waitFor(() =>
      expect(createCopy).toHaveBeenCalledWith("42", "8", "copy"),
    );
  });

  it("preselects the only master CV and copies it without a second choice (AC2)", async () => {
    const user = userEvent.setup();
    listBaseCvs.mockResolvedValue([MASTER_CVS[0]]);
    renderPage();

    const create = await screen.findByRole("button", {
      name: "Create the CV copy",
    });
    // Enabled straight away: the lone option selected itself.
    await waitFor(() => expect(create).toBeEnabled());
    expect(screen.getByRole("radio", { name: /Backend CV/ })).toBeChecked();

    await user.click(create);
    await waitFor(() =>
      expect(createCopy).toHaveBeenCalledWith("42", "7", "copy"),
    );
  });

  it("opens the copy in the editor and sends every section back on save (AC6)", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    renderPage();

    const label = await screen.findByLabelText("CV label");
    expect(label).toHaveValue("Backend CV for Applika");
    expect(screen.getByLabelText("Phone")).toHaveValue("+44 20 7946 0958");
    const role = screen.getByRole("group", { name: /experience 1/i });
    expect(within(role).getByLabelText("Company")).toHaveValue("Stripe");

    await user.clear(label);
    await user.type(label, "Backend CV, tailored");
    await user.click(screen.getByRole("button", { name: "Save CV copy" }));

    await waitFor(() => expect(updateCopy).toHaveBeenCalledTimes(1));
    const [applicationId, payload] = updateCopy.mock.calls[0];
    expect(applicationId).toBe("42");
    expect(payload.name).toBe("Backend CV, tailored");
    // Every section survives the round trip, ids included.
    expect(payload.links[0].id).toBe("l-1");
    expect(payload.skills).toEqual([
      {
        id: "s-1",
        category: "Languages and frameworks",
        keywords: ["Python", "Postgres"],
      },
    ]);
    expect(payload.education[0].id).toBe("d-1");
    expect(payload.experience[0].id).toBe("e-1");
    expect(payload.experience[0].bullets).toEqual([
      "Cut settlement latency by 40%",
    ]);
    expect(payload.projects[0].id).toBe("p-1");
    expect(payload.certifications[0].id).toBe("k-1");
    expect(payload.languages[0].id).toBe("g-1");
  });

  it("keeps a copy whose master CV was deleted, and says so (AC4)", async () => {
    getCopy.mockResolvedValue({ ...COPY, base_cv_id: null });
    renderPage();

    expect(await screen.findByText("source CV deleted")).toBeInTheDocument();
    // The content is all still there and still editable.
    expect(screen.getByLabelText("CV label")).toHaveValue(
      "Backend CV for Applika",
    );
    expect(screen.getByLabelText("Full name")).toBeEnabled();
    expect(screen.getByRole("button", { name: "Save CV copy" })).toBeEnabled();
  });

  it("names the master CV the copy came from while it still exists (AC4)", async () => {
    getCopy.mockResolvedValue(COPY);
    renderPage();

    expect(
      await screen.findByText("Copied from Backend CV"),
    ).toBeInTheDocument();
    expect(screen.queryByText("source CV deleted")).not.toBeInTheDocument();
  });

  it("shows the application's job description beside the editor (AC9)", async () => {
    getCopy.mockResolvedValue(COPY);
    renderPage();

    const panel = await screen.findByRole("region", {
      name: "Job description text",
    });
    expect(panel).toHaveTextContent(
      "We need someone who has run Postgres in anger.",
    );
  });

  it("deletes the copy behind a confirm and returns to the picker (AC7)", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Delete this CV copy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      // Testing Library matches the accessible name in full, so this is the
      // dialog's own Delete and not the trigger.
      within(dialog).getByRole("button", { name: "Delete" }),
    );

    await waitFor(() => expect(removeCopy).toHaveBeenCalledWith("42"));

    // Back to the picker, with every master CV on offer again.
    expect(
      await screen.findByRole("button", { name: "Create the CV copy" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: "Save CV copy" }),
    ).not.toBeInTheDocument();
  });

  it("locks the editor of a finalized application but still shows the copy (AC10)", async () => {
    getApplications.mockResolvedValue([
      { ...APPLICATION, finalized: true, finalized_at: "2026-01-10T12:00:00Z" },
    ]);
    getCopy.mockResolvedValue(COPY);
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent(
      "This application is closed.",
    );
    expect(screen.getByLabelText("CV label")).toHaveValue(
      "Backend CV for Applika",
    );
    expect(screen.getByLabelText("Full name")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Save CV copy" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Delete this CV copy" }),
    ).not.toBeInTheDocument();
    // ...and the ONE footer control a locked copy keeps: the download (AC1).
    expect(screen.getByRole("button", { name: "Download PDF" })).toBeEnabled();
  });

  it("downloads a finalized application's CV copy anyway (KODI-004, AC1)", async () => {
    const saved: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });
    getApplications.mockResolvedValue([
      { ...APPLICATION, finalized: true, finalized_at: "2026-01-10T12:00:00Z" },
    ]);
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Download PDF" }),
    );

    // Keyed by the APPLICATION id, and refused by nothing: the route carries no
    // finalized/archived guard, so neither does the page.
    await waitFor(() => expect(exportCopyPdf).toHaveBeenCalledWith("42"));
    await waitFor(() => expect(saved).toEqual(["backend-cv-for-applika.pdf"]));
    click.mockRestore();
  });

  it("says the preview is not the PDF, beside the preview and the button (AC3)", async () => {
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await screen.findByRole("button", { name: "Download PDF" });
    // Twice on the page: once in the preview's own caption, once tied to the
    // download action through `aria-describedby`.
    expect(
      screen.getAllByText("Preview does not show the final PDF layout."),
    ).toHaveLength(2);
  });

  it("refuses to start a copy on an application in a closed cycle (AC10)", async () => {
    cycleContext = {
      selectedCycleId: "c-2024",
      setSelectedCycleId: vi.fn(),
      isViewingPastCycle: true,
    };
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent("closed cycle");
    expect(
      screen.queryByRole("button", { name: "Create the CV copy" }),
    ).not.toBeInTheDocument();
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("asks for nothing when the URL names no application", async () => {
    searchParams = new URLSearchParams();
    renderPage();

    expect(
      await screen.findByText("No application selected"),
    ).toBeInTheDocument();
    expect(getCopy).not.toHaveBeenCalled();
  });

  it("deletes a master CV from the picker, clearing the selection if it was selected, and re-preselects the lone survivor (AC2)", async () => {
    const user = userEvent.setup();
    // The mutation invalidates the master-CV list and the query refetches; the
    // mock mirrors the real API dropping the deleted CV from that refetch.
    removeBaseCv.mockImplementation(async (id: string) => {
      listBaseCvs.mockResolvedValue(MASTER_CVS.filter((cv) => cv.id !== id));
    });
    renderPage();

    await user.click(await screen.findByRole("radio", { name: /Frontend CV/ }));
    await user.click(
      screen.getByRole("button", { name: "Delete Frontend CV" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(removeBaseCv).toHaveBeenCalledWith("8"));
    // The deleted CV is gone and was the selection, so the lone survivor
    // ("Backend CV") re-preselects and Create is enabled again.
    await waitFor(() =>
      expect(screen.getByRole("radio", { name: /Backend CV/ })).toBeChecked(),
    );
    expect(
      screen.getByRole("button", { name: "Create the CV copy" }),
    ).toBeEnabled();
    expect(screen.queryByText("Frontend CV")).not.toBeInTheDocument();
  });

  it("downloads a master CV's PDF from the picker (AC2)", async () => {
    const saved: string[] = [];
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(function (this: HTMLAnchorElement) {
        saved.push(this.download);
      });
    renderPage();

    await userEvent.click(
      await screen.findByRole("button", { name: "Download PDF Backend CV" }),
    );

    await waitFor(() => expect(exportBaseCvPdf).toHaveBeenCalledWith("7"));
    await waitFor(() => expect(saved).toEqual(["backend-cv.pdf"]));
    click.mockRestore();
  });

  describe("full width only when the editor is on screen (KODI-017, AC1)", () => {
    it("does not ask for the full width while the application is loading", () => {
      getApplications.mockReturnValue(new Promise(() => {}));
      renderPage();
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width when the application cannot be opened", async () => {
      getApplications.mockResolvedValue([]);
      renderPage();
      await screen.findByText("Could not open this application");
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width on the picker's list state", async () => {
      renderPage();
      await screen.findByRole("button", { name: "Create the CV copy" });
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width while the picker's master CVs are loading", async () => {
      listBaseCvs.mockReturnValue(new Promise(() => {}));
      renderPage();
      await screen.findByLabelText("Loading your master CVs");
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width when the picker's master CVs fail to load", async () => {
      listBaseCvs.mockRejectedValue({
        isAxiosError: true,
        response: { status: 500, data: { detail: "boom" } },
      });
      renderPage();
      await screen.findByText("Could not load your master CVs");
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width on the picker's empty state", async () => {
      listBaseCvs.mockResolvedValue([]);
      renderPage();
      await screen.findByRole("heading", { name: "No master CVs yet" });
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width on the picker's read-only state", async () => {
      cycleContext = {
        selectedCycleId: "c-2024",
        setSelectedCycleId: vi.fn(),
        isViewingPastCycle: true,
      };
      renderPage();
      await screen.findByRole("status");
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width while the CV copy is loading", async () => {
      getCopy.mockReturnValue(new Promise(() => {}));
      renderPage();
      await screen.findByLabelText("Loading this CV copy");
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("does not ask for the full width when the CV copy fails to load", async () => {
      getCopy.mockRejectedValue({
        isAxiosError: true,
        response: { status: 500, data: { detail: "boom" } },
      });
      renderPage();
      await screen.findByText("Could not load this CV copy");
      expect(fullWidthRequest).not.toHaveBeenCalled();
    });

    it("asks for the full width once the editable editor is on screen", async () => {
      getCopy.mockResolvedValue(COPY);
      renderPage();
      await screen.findByLabelText("CV label");
      expect(fullWidthRequest).toHaveBeenCalledTimes(1);
    });

    it("asks for the full width in the read-only editor too", async () => {
      getApplications.mockResolvedValue([
        {
          ...APPLICATION,
          finalized: true,
          finalized_at: "2026-01-10T12:00:00Z",
        },
      ]);
      getCopy.mockResolvedValue(COPY);
      renderPage();
      await screen.findByRole("status");
      expect(fullWidthRequest).toHaveBeenCalledTimes(1);
    });
  });
});

describe("the diff baseline resolution (KODI-017)", () => {
  /** A master CV that has since drifted from what the snapshot captured. */
  const DRIFTED_MASTER: BaseCv = {
    ...MASTER_CVS[0],
    headline: "Staff Backend Engineer",
  };

  it("prefers `base_snapshot` over the current master CV, even when both resolve", async () => {
    // The snapshot still says "Senior Backend Engineer" (COPY's own headline);
    // the "current" master CV was edited afterwards. If the page compared
    // against the master instead, the diff would report a headline change
    // that the user never made.
    listBaseCvs.mockResolvedValue([DRIFTED_MASTER, MASTER_CVS[1]]);
    getCopy.mockResolvedValue({
      ...COPY,
      base_snapshot: {
        name: COPY.name,
        full_name: COPY.full_name,
        headline: COPY.headline,
        location: COPY.location,
        email: COPY.email,
        phone: COPY.phone,
        summary: COPY.summary,
        links: COPY.links,
        skills: COPY.skills,
        experience: COPY.experience,
        projects: COPY.projects,
        education: COPY.education,
        certifications: COPY.certifications,
        languages: COPY.languages,
      },
    });
    renderPage();

    expect(
      await screen.findByText(/Compared with Backend CV: no changes/),
    ).toBeInTheDocument();
  });

  it("falls back to the current master CV when there is no snapshot", async () => {
    // Matches COPY's own content field for field, except the headline — so
    // the fallback-to-master diff reports EXACTLY one change, isolating the
    // resolution rule from every other field the two fixtures might differ on.
    // `BaseCv.name` IS the "CV label" content field `diffCv` compares (the
    // same one the badge/label text reads), so it has to match COPY's own
    // name too, or it would count as a SECOND change alongside the headline.
    const matchingMaster: BaseCv = {
      id: "7",
      name: COPY.name,
      full_name: COPY.full_name,
      headline: "Staff Backend Engineer",
      location: COPY.location,
      email: COPY.email,
      phone: COPY.phone,
      summary: COPY.summary,
      links: COPY.links,
      skills: COPY.skills,
      experience: COPY.experience,
      projects: COPY.projects,
      education: COPY.education,
      certifications: COPY.certifications,
      languages: COPY.languages,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: null,
    };
    listBaseCvs.mockResolvedValue([matchingMaster, MASTER_CVS[1]]);
    getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    renderPage();

    expect(
      await screen.findByText(/Compared with Backend CV for Applika: 1 change/),
    ).toBeInTheDocument();
  });

  it("only 409 disables the diff downloads; a transient failure does not stick", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    exportCopyDiffPdf.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 500,
        data: new Blob([JSON.stringify({ detail: "Render failed" })]),
      },
    });
    renderPage();

    const pdfButton = await screen.findByRole("button", {
      name: "Download changes as PDF",
    });
    await user.click(pdfButton);
    // A transient 500 must not leave the row disabled — only a 409 ("no
    // baseline") does, and clicking again must still be possible.
    await waitFor(() => expect(pdfButton).toBeEnabled());
  });

  it("disables both diff downloads with the server's reason on a 409", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    exportCopyDiffPdf.mockRejectedValueOnce({
      isAxiosError: true,
      response: {
        status: 409,
        data: new Blob([
          JSON.stringify({
            detail: "This CV copy has no baseline to compare with.",
          }),
        ]),
      },
    });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Download changes as PDF" }),
    );

    await waitFor(() =>
      expect(
        screen.getByText("This CV copy has no baseline to compare with."),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: "Download changes as PDF" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Download changes as Markdown" }),
    ).toBeDisabled();
  });

  it("says downloads reflect the last saved version while the form is dirty", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    renderPage();

    const headline = await screen.findByLabelText("Headline", {
      exact: true,
    });
    expect(
      screen.queryByText("Downloads reflect the last saved version."),
    ).toBeNull();

    await user.type(headline, "!");
    expect(
      await screen.findByText("Downloads reflect the last saved version."),
    ).toBeInTheDocument();
  });
});

describe("Markdown downloads beside the PDF ones (KODI-017 part 3)", () => {
  it("mounts the copy's Markdown export beside its PDF one", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    renderPage();

    const button = await screen.findByRole("button", {
      name: "Download Markdown",
    });
    expect(button).toBeEnabled();

    await user.click(button);
    await waitFor(() => expect(exportCopyMarkdown).toHaveBeenCalledWith("42"));
  });

  it("mounts a master CV's Markdown export on the picker's tiles", async () => {
    const user = userEvent.setup();
    renderPage();

    const button = await screen.findByRole("button", {
      name: "Download Markdown Backend CV",
    });
    expect(button).toBeEnabled();

    await user.click(button);
    await waitFor(() => expect(exportBaseCvMarkdown).toHaveBeenCalledWith("7"));
  });
});

describe("the diff download row calls the right mutation per button (KODI-017 part 3)", () => {
  it("Markdown calls exportDiffMarkdown, never exportDiffPdf", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    renderPage();

    await user.click(
      await screen.findByRole("button", {
        name: "Download changes as Markdown",
      }),
    );

    await waitFor(() =>
      expect(exportCopyDiffMarkdown).toHaveBeenCalledWith("42"),
    );
    expect(exportCopyDiffPdf).not.toHaveBeenCalled();
  });

  it("PDF calls exportDiffPdf, never exportDiffMarkdown", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({ ...COPY, base_snapshot: null });
    renderPage();

    await user.click(
      await screen.findByRole("button", { name: "Download changes as PDF" }),
    );

    await waitFor(() => expect(exportCopyDiffPdf).toHaveBeenCalledWith("42"));
    expect(exportCopyDiffMarkdown).not.toHaveBeenCalled();
  });
});

describe("Tailor by keywords and the CV fit (KODI-049)", () => {
  const BLANK_JD: Application = { ...APPLICATION, job_description: "   " };

  it("offers the switch, off, when the application has a job description (R-026)", async () => {
    renderPage();

    const toggle = await screen.findByRole("switch", {
      name: "Tailor by keywords",
    });
    expect(toggle).not.toBeChecked();
    expect(toggle).toHaveAccessibleDescription(
      "Reorders skills and bullets by how well they match the job description. No text is added or changed.",
    );
  });

  it("does not render the switch at all with a blank job description", async () => {
    getApplications.mockResolvedValue([BLANK_JD]);
    renderPage();

    await screen.findByRole("button", { name: "Create the CV copy" });
    expect(
      screen.queryByRole("switch", { name: "Tailor by keywords" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Tailor by keywords")).not.toBeInTheDocument();
  });

  it("creates a verbatim copy unless the switch is on, then sends tailoring: keywords", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("radio", { name: /Backend CV/ }));
    await user.click(
      screen.getByRole("switch", { name: "Tailor by keywords" }),
    );
    expect(
      screen.getByRole("switch", { name: "Tailor by keywords" }),
    ).toBeChecked();
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );

    await waitFor(() =>
      expect(createCopy).toHaveBeenCalledWith("42", "7", "keywords"),
    );
  });

  it("shows the fit with its score and both keyword lists once a copy exists (R-028)", async () => {
    getCopy.mockResolvedValue(COPY);
    renderPage();

    const title = await screen.findByRole("button", {
      name: "CV fit for this job",
    });
    const panel = title.closest('[data-slot="cv-fit-panel"]') as HTMLElement;
    expect(getFit).toHaveBeenCalledWith("42");
    expect(await within(panel).findByText("Fit 72%")).toBeInTheDocument();
    expect(within(panel).getByText("python")).toBeInTheDocument();
    expect(within(panel).getByText("postgres")).toBeInTheDocument();
    expect(within(panel).getByText("kubernetes")).toBeInTheDocument();
    expect(within(panel).getByText("Matched")).toBeInTheDocument();
    expect(within(panel).getByText("Missing")).toBeInTheDocument();
    // KODI-050 (owner): the description no longer says "No AI.".
    expect(
      within(panel).getByText(
        "Keyword match between the job description and this CV copy.",
        { exact: true },
      ),
    ).toBeInTheDocument();
    expect(within(panel).queryByText(/No AI/)).not.toBeInTheDocument();
  });

  it("shows the same fit on a finalized (read-only) application", async () => {
    getApplications.mockResolvedValue([
      { ...APPLICATION, finalized: true, finalized_at: "2026-02-01T00:00:00Z" },
    ]);
    getCopy.mockResolvedValue(COPY);
    renderPage();

    expect(
      await screen.findByRole("button", { name: "CV fit for this job" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Fit 72%")).toBeInTheDocument();
  });

  it("shows no fit and asks for none with a blank job description", async () => {
    getApplications.mockResolvedValue([BLANK_JD]);
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await screen.findByRole("button", { name: "Save CV copy" });
    expect(screen.queryByText("CV fit for this job")).not.toBeInTheDocument();
    expect(getFit).not.toHaveBeenCalled();
  });

  it("shows no fit while there is no copy", async () => {
    renderPage();

    await screen.findByRole("button", { name: "Create the CV copy" });
    expect(screen.queryByText("CV fit for this job")).not.toBeInTheDocument();
    expect(getFit).not.toHaveBeenCalled();
  });

  it("shows no fit when the server answers score: null", async () => {
    getCopy.mockResolvedValue(COPY);
    getFit.mockResolvedValue({
      score: null,
      matched_keywords: [],
      missing_keywords: [],
    });
    renderPage();

    await screen.findByRole("button", { name: "Save CV copy" });
    await waitFor(() => expect(getFit).toHaveBeenCalled());
    expect(screen.queryByText("CV fit for this job")).not.toBeInTheDocument();
  });

  it("treats a fit 404 as no panel, not an error", async () => {
    getCopy.mockResolvedValue(COPY);
    getFit.mockRejectedValue(noCopy());
    renderPage();

    await screen.findByRole("button", { name: "Save CV copy" });
    await waitFor(() => expect(getFit).toHaveBeenCalled());
    expect(screen.queryByText("CV fit for this job")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Could not load the fit for this job."),
    ).not.toBeInTheDocument();
  });

  it("says when the fit could not load, and retries", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    getFit
      .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500 } })
      .mockResolvedValueOnce(FIT);
    renderPage();

    expect(
      await screen.findByText("Could not load the fit for this job."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Fit 72%")).toBeInTheDocument();
  });

  it("refetches the fit after the copy is saved", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await screen.findByText("Fit 72%");
    expect(getFit).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Save CV copy" }));
    await waitFor(() => expect(getFit).toHaveBeenCalledTimes(2));
  });

  it("lists the copy's adjustments under 'Reordered by job match' only with Show changes on (R-025)", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({
      ...COPY,
      adjustments: [
        {
          section: "skills",
          description: "Skill categories reordered by job match",
        },
      ],
    });
    renderPage();

    await screen.findByRole("button", { name: "Save CV copy" });
    await waitFor(() =>
      expect(
        screen.getByRole("switch", { name: "Show changes" }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("list", { name: "Reordered by job match" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("switch", { name: "Show changes" }));
    const list = screen.getByRole("list", { name: "Reordered by job match" });
    expect(list).toHaveTextContent("Skill categories reordered by job match");
  });

  it("turns the switch back off after a create, so a later copy is verbatim again", async () => {
    const user = userEvent.setup();
    getCopy.mockRejectedValueOnce(noCopy()).mockResolvedValue(COPY);
    renderPage();

    await user.click(await screen.findByRole("radio", { name: /Backend CV/ }));
    await user.click(
      screen.getByRole("switch", { name: "Tailor by keywords" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );
    await screen.findByRole("button", { name: "Save CV copy" });

    getCopy.mockRejectedValue(noCopy());
    await user.click(
      screen.getByRole("button", { name: "Delete this CV copy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByRole("switch", { name: "Tailor by keywords" }),
    ).not.toBeChecked();
  });

  it("refetches the fit when the copy is deleted and created again", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await screen.findByText("Fit 72%");
    const before = getFit.mock.calls.length;
    getCopy.mockRejectedValue(noCopy());
    await user.click(
      screen.getByRole("button", { name: "Delete this CV copy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("radio", { name: /Backend CV/ }));
    getCopy.mockResolvedValue(COPY);
    getFit.mockResolvedValue({ ...FIT, score: 41 });
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );

    expect(await screen.findByText("Fit 41%")).toBeInTheDocument();
    expect(getFit.mock.calls.length).toBeGreaterThan(before);
  });

  it("says the fit reflects the last saved version while the copy has unsaved edits", async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await screen.findByText("Fit 72%");
    expect(
      screen.queryByText("The fit reflects the last saved version."),
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Headline", { exact: true }), "!");
    expect(
      await screen.findByText("The fit reflects the last saved version."),
    ).toBeInTheDocument();
  });
});

describe("Tailor by keywords and the CV fit behind the jobs feature (KODI-053, PRD 0013)", () => {
  beforeEach(() => {
    myFeatures = [{ key: "cvs", stage: "beta" }];
  });

  it("renders no switch and creates a verbatim copy for a user without jobs", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("radio", { name: /Backend CV/ }));
    expect(
      screen.queryByRole("switch", { name: "Tailor by keywords" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Tailor by keywords")).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );

    await waitFor(() =>
      expect(createCopy).toHaveBeenCalledWith("42", "7", "copy"),
    );
  });

  it("shows no fit panel and asks for no fit for a user without jobs", async () => {
    getCopy.mockResolvedValue(COPY);
    renderPage();

    await screen.findByRole("button", { name: "Save CV copy" });
    // The job description itself still shows: it is the application's own.
    expect(
      screen.getByRole("heading", { level: 2, name: "Job description" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("CV fit for this job")).not.toBeInTheDocument();
    expect(getFit).not.toHaveBeenCalled();
  });

  it('keeps an existing keyword copy\'s "Reordered by job match" list without jobs (AC9)', async () => {
    const user = userEvent.setup();
    getCopy.mockResolvedValue({
      ...COPY,
      adjustments: [
        {
          section: "skills",
          description: "Skill categories reordered by job match",
        },
      ],
    });
    renderPage();

    await screen.findByRole("button", { name: "Save CV copy" });
    await user.click(
      await screen.findByRole("switch", { name: "Show changes" }),
    );
    expect(
      screen.getByRole("list", { name: "Reordered by job match" }),
    ).toHaveTextContent("Skill categories reordered by job match");
    expect(getFit).not.toHaveBeenCalled();
  });

  it("offers the switch and the fit again once the user has jobs back", async () => {
    myFeatures = [
      { key: "jobs", stage: "general" },
      { key: "cvs", stage: "beta" },
    ];
    getCopy.mockResolvedValue(COPY);
    renderPage();

    expect(await screen.findByText("Fit 72%")).toBeInTheDocument();
    expect(getFit).toHaveBeenCalledWith("42");
  });
});

describe("ApplicationCvPage behind the cvs feature (PRD 0015)", () => {
  it("shows the app's page not found and asks for no CV without cvs", async () => {
    myFeatures = [{ key: "jobs", stage: "beta" }];
    renderPage();

    expect(await screen.findByText("Oops! Page not found")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Application CV" }),
    ).not.toBeInTheDocument();
    expect(getCopy).not.toHaveBeenCalled();
    expect(listBaseCvs).not.toHaveBeenCalled();
    expect(getFit).not.toHaveBeenCalled();
  });

  it("puts the Beta badge beside the h1, never inside it, while cvs is in beta", async () => {
    renderPage();

    const heading = await screen.findByRole("heading", {
      level: 1,
      name: "Application CV",
    });
    const badge = screen.getByText("Beta");
    expect(badge).toHaveAttribute("data-slot", "beta-badge");
    expect(heading).not.toContainElement(badge);
    expect(heading.parentElement).toContainElement(badge);
  });

  it("shows no Beta badge once cvs is released", async () => {
    myFeatures = [
      { key: "jobs", stage: "beta" },
      { key: "cvs", stage: "general" },
    ];
    renderPage();

    expect(
      await screen.findByRole("heading", { level: 1, name: "Application CV" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Beta")).not.toBeInTheDocument();
  });
});
