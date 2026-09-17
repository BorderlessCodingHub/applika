import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationCvPage } from "./application-cv-page";
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
 */

const getCopy = vi.fn();
const createCopy = vi.fn();
const updateCopy = vi.fn();
const removeCopy = vi.fn();
const listBaseCvs = vi.fn();
const getApplications = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    tailoredCvs: {
      get: (...args: unknown[]) => getCopy(...args),
      create: (...args: unknown[]) => createCopy(...args),
      update: (...args: unknown[]) => updateCopy(...args),
      remove: (...args: unknown[]) => removeCopy(...args),
    },
    baseCvs: {
      list: (...args: unknown[]) => listBaseCvs(...args),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
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
    skills: ["Python"],
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
  skills: ["Python", "Postgres"],
  experience: [
    {
      id: "e-1",
      company: "Stripe",
      role: "Senior Backend Engineer",
      period: "2021 — Present",
      bullets: ["Cut settlement latency by 40%"],
    },
  ],
  projects: [
    { id: "p-1", name: "Ledger", description: "Double-entry ledger." },
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

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <ApplicationCvPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(payload.skills).toEqual(["Python", "Postgres"]);
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
    getApplications.mockResolvedValue([{ ...APPLICATION, finalized: true }]);
    getCopy.mockResolvedValue(COPY);
    renderPage();

    expect(await screen.findByRole("status")).toHaveTextContent("finalized");
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
});
