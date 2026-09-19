import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
const exportCopyPdf = vi.fn();
const listBaseCvs = vi.fn();
const removeBaseCv = vi.fn();
const exportBaseCvPdf = vi.fn();
const getApplications = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    tailoredCvs: {
      get: (...args: unknown[]) => getCopy(...args),
      create: (...args: unknown[]) => createCopy(...args),
      update: (...args: unknown[]) => updateCopy(...args),
      remove: (...args: unknown[]) => removeCopy(...args),
      exportPdf: (...args: unknown[]) => exportCopyPdf(...args),
    },
    baseCvs: {
      list: (...args: unknown[]) => listBaseCvs(...args),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: (...args: unknown[]) => removeBaseCv(...args),
      exportPdf: (...args: unknown[]) => exportBaseCvPdf(...args),
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

/** A copy with every section populated, so the round trip has something to lose. */
const COPY: TailoredCv = {
  id: "9001",
  application_id: "42",
  base_cv_id: "7",
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
      expect(createCopy).toHaveBeenCalledWith("42", { base_cv_id: "8" }),
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
      expect(createCopy).toHaveBeenCalledWith("42", { base_cv_id: "7" }),
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
