import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewWithCvPage } from "./new-with-cv-page";
import { SupportsProvider } from "@/contexts/supports-context";
import type { Draft, DraftInput } from "@/services/types/application-drafts";

/**
 * `/applications/new-with-cv` (PRD 0010, KODI-033).
 *
 * AC2/AC3 — no application-date question, `mode` preset `active`.
 * AC6/AC7 — no draft (and no POST) until company, role and platform are all
 * set; the first save is a POST, every later one a PUT; the URL picks up
 * `?id=`; nothing is ever written to browser storage; a `beforeunload`
 * listener is registered.
 * AC9 — Finish stays disabled with the missing list.
 * AC3 — Finish sends the browser's own LOCAL calendar day.
 */

const createDraftMock = vi.fn();
const updateDraftMock = vi.fn();
const getDraftMock = vi.fn();
const finishDraftMock = vi.fn();
const searchCompaniesMock = vi.fn();
const createPlatformMock = vi.fn();
const getSupportsMock = vi.fn();
const listBaseCvsMock = vi.fn();
const getTailoredCvMock = vi.fn();
const updateTailoredCvMock = vi.fn();
const createTailoredCvMock = vi.fn();
const removeTailoredCvMock = vi.fn();
const replaceMock = vi.fn();
const pushMock = vi.fn();
let searchParams = new URLSearchParams();

vi.mock("@/services/services", () => ({
  services: {
    applicationDrafts: {
      list: vi.fn().mockResolvedValue([]),
      get: (...args: unknown[]) => getDraftMock(...args),
      create: (...args: unknown[]) => createDraftMock(...args),
      update: (...args: unknown[]) => updateDraftMock(...args),
      remove: vi.fn(),
      finish: (...args: unknown[]) => finishDraftMock(...args),
    },
    companies: {
      searchCompanies: (...args: unknown[]) => searchCompaniesMock(...args),
      create: vi.fn(),
    },
    platforms: {
      create: (...args: unknown[]) => createPlatformMock(...args),
    },
    supports: {
      getSupports: (...args: unknown[]) => getSupportsMock(...args),
    },
    baseCvs: {
      list: (...args: unknown[]) => listBaseCvsMock(...args),
    },
    tailoredCvs: {
      get: (...args: unknown[]) => getTailoredCvMock(...args),
      create: (...args: unknown[]) => createTailoredCvMock(...args),
      update: (...args: unknown[]) => updateTailoredCvMock(...args),
      remove: (...args: unknown[]) => removeTailoredCvMock(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
  useSearchParams: () => searchParams,
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SupportsProvider>
        <NewWithCvPage />
      </SupportsProvider>
    </QueryClientProvider>,
  );
}

function draftFrom(
  input: Partial<DraftInput> & { id?: string; has_cv?: boolean },
): Draft {
  return {
    id: input.id ?? "draft-1",
    company_id: input.company_id ?? null,
    company_name: input.company_name ?? "",
    role: input.role ?? "",
    platform_id: input.platform_id ?? "",
    mode: input.mode ?? "active",
    has_cv: input.has_cv ?? false,
    created_at: "2026-09-26T10:00:00Z",
    updated_at: "2026-09-26T10:00:00Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams();
  searchCompaniesMock.mockResolvedValue([]);
  getSupportsMock.mockResolvedValue({
    platforms: [{ id: "plt-1", name: "LinkedIn", url: null, is_public: true }],
  });
  listBaseCvsMock.mockResolvedValue([]);
  getTailoredCvMock.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404 },
  });
  updateDraftMock.mockImplementation((id: string, data: DraftInput) =>
    Promise.resolve(draftFrom({ ...data, id })),
  );
  getDraftMock.mockImplementation((id: string) =>
    Promise.resolve(draftFrom({ id })),
  );
});

describe("NewWithCvPage — step 1 fields (AC2/AC3)", () => {
  it("asks for no application date and presets Source to Active", async () => {
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    expect(screen.queryByText(/application date/i)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveTextContent(
      /active/i,
    );
  });

  it("renders the two-step stepper with step 2 disabled until a draft exists", async () => {
    renderPage();
    await screen.findByRole("combobox", { name: /platform/i });

    const cvStep = screen.getByRole("button", { name: /step 2: cv/i });
    expect(cvStep).toBeDisabled();
  });
});

describe("NewWithCvPage — autosave gating and draft creation (AC6/AC7)", () => {
  it("sends no request before company, role and platform are all set", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    await user.type(screen.getByPlaceholderText(/senior engineer/i), "Eng");
    await new Promise((resolve) => setTimeout(resolve, 1300));

    expect(createDraftMock).not.toHaveBeenCalled();
  }, 10_000);

  it("POSTs once the three fields are set, then PUTs on later edits and replaces the URL", async () => {
    createDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });

    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Engineer",
    );
    await user.click(screen.getByText("Search companies…"));
    await user.type(screen.getByPlaceholderText(/search companies/i), "Acme");
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("combobox", { name: /platform/i }));
    await user.click(await screen.findByRole("option", { name: "LinkedIn" }));

    await waitFor(() => expect(createDraftMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(replaceMock).toHaveBeenCalledWith(
      expect.stringContaining("id=draft-9"),
    );

    await user.type(screen.getByPlaceholderText(/senior engineer/i), " Two");

    await waitFor(() => expect(updateDraftMock).toHaveBeenCalled(), {
      timeout: 3000,
    });
    expect(updateDraftMock.mock.calls[0][0]).toBe("draft-9");
  });

  it("never touches browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Engineer",
    );

    expect(setItem).not.toHaveBeenCalled();
  });

  it("registers a beforeunload listener", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    renderPage();
    await screen.findByRole("combobox", { name: /platform/i });

    expect(addSpy.mock.calls.some(([type]) => type === "beforeunload")).toBe(
      true,
    );
  });

  it("the beforeunload handler actually prevents the default while typing is unsaved", async () => {
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    // Before the draft exists, `formState.isDirty` alone drives the risk flag.
    await user.type(screen.getByPlaceholderText(/senior engineer/i), "Eng");

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
  });

  it("does NOT warn before any typing has happened", async () => {
    renderPage();
    await screen.findByRole("combobox", { name: /platform/i });

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });
});

describe("NewWithCvPage — Finish (AC9, AC3)", () => {
  it("shows the missing list and keeps Finish disabled without company, role, platform, CV", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(draftFrom({ id: "draft-9" }));

    renderPage();

    const finish = await screen.findByRole("button", { name: /^finish$/i });
    expect(finish).toBeDisabled();
    expect(screen.getByText(/missing:/i)).toHaveTextContent(
      /company, role, platform, cv copy/i,
    );
  });

  it("sends the browser's local calendar day, never toISOString(), and navigates on success", async () => {
    // Pinned to a non-UTC zone (CI runs TZ=UTC): at 23:30 local in
    // America/Sao_Paulo (UTC-3) it is already 2026-09-27 in UTC, so a
    // `toISOString()` regression sends the WRONG day and this test catches it
    // — under TZ=UTC the two dates coincide and the mutant would slip through.
    vi.stubEnv("TZ", "America/Sao_Paulo");
    const fixed = new Date(2026, 8, 26, 23, 30, 0); // local 2026-09-26 23:30
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);

    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    getTailoredCvMock.mockResolvedValue({
      id: "draft-9",
      name: "Copy",
      full_name: "A",
      headline: "H",
      location: "L",
      email: "a@example.com",
      phone: "",
      summary: "S",
      links: [],
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
      base_cv_id: "base-1",
      base_snapshot: null,
    });
    finishDraftMock.mockResolvedValue({ id: "app-1" });

    const user = userEvent.setup({ delay: null });
    renderPage();

    await screen.findByRole("button", { name: /^finish$/i });
    await waitFor(
      () =>
        expect(screen.getByRole("button", { name: /^finish$/i })).toBeEnabled(),
      { timeout: 3000 },
    );
    await user.click(screen.getByRole("button", { name: /^finish$/i }));

    await waitFor(() => expect(finishDraftMock).toHaveBeenCalled());
    expect(finishDraftMock).toHaveBeenCalledWith("draft-9", "2026-09-26");

    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
});

describe("NewWithCvPage — Resume opens the right step (AC12)", () => {
  it("resumes on step 2 when the draft already has a CV copy", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: true,
      }),
    );
    getTailoredCvMock.mockResolvedValue({
      id: "draft-9",
      name: "Copy",
      full_name: "A",
      headline: "H",
      location: "L",
      email: "a@example.com",
      phone: "",
      summary: "S",
      links: [],
      skills: [],
      experience: [],
      projects: [],
      education: [],
      certifications: [],
      languages: [],
      base_cv_id: "base-1",
      base_snapshot: null,
    });

    renderPage();

    await screen.findByText("Copied from a master CV");
    expect(
      screen.queryByPlaceholderText(/senior engineer/i),
    ).not.toBeInTheDocument();
  });

  it("resumes on step 1 when the draft has no CV copy yet", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );

    renderPage();

    expect(await screen.findByPlaceholderText(/senior engineer/i)).toHaveValue(
      "Engineer",
    );
  });
});

const SAVED_CV = {
  id: "draft-9",
  name: "Copy",
  full_name: "A",
  headline: "Original headline",
  location: "L",
  email: "a@example.com",
  phone: "",
  summary: "S",
  links: [],
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
  base_cv_id: "base-1",
  base_snapshot: null,
};

const MOCK_BASE_CV = {
  id: "base-1",
  name: "My Master CV",
  full_name: "A",
  headline: "H",
  location: "L",
  email: "a@example.com",
  phone: "",
  summary: "S",
  links: [],
  skills: [],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
};

describe("NewWithCvPage — CV autosave correctness (AC5/AC7/AC8, QA round 1 B2/B3)", () => {
  it("does NOT PUT the CV copy right after it loads unedited (B2)", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: true,
      }),
    );
    getTailoredCvMock.mockResolvedValue(SAVED_CV);

    renderPage();

    await screen.findByText("Copied from a master CV");
    // Give the ~1s debounce every chance to fire.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1300));
    });

    expect(updateTailoredCvMock).not.toHaveBeenCalled();
  }, 10_000);

  it("keeps an unsaved CV edit across Back to step 1 and forward to step 2 again (B3, AC5/AC8)", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: true,
      }),
    );
    getTailoredCvMock.mockResolvedValue(SAVED_CV);
    // The autosave PUT never resolves in this test — the point is that the
    // EDIT survives the round trip through step 1, not that it gets saved.
    updateTailoredCvMock.mockImplementation(() => new Promise(() => {}));

    const user = userEvent.setup();
    renderPage();

    const headline = await screen.findByLabelText("Headline", {
      exact: true,
    });
    await user.clear(headline);
    await user.type(headline, "Edited headline");
    expect(headline).toHaveValue("Edited headline");

    await user.click(screen.getByRole("button", { name: "Back" }));
    await screen.findByPlaceholderText(/senior engineer/i);

    await user.click(screen.getByRole("button", { name: "Step 2: CV" }));

    expect(
      await screen.findByLabelText("Headline", { exact: true }),
    ).toHaveValue("Edited headline");
  });
});

describe("NewWithCvPage — creating and deleting the CV copy (AC4/AC7, QA round 2 D1/D2)", () => {
  it("fills the editor from the newly created copy, not blank defaults (D1)", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    // The GET 404s until the copy exists; once `useCreateTailoredCv`
    // invalidates the query, the same mock is called again and this time
    // finds the newly created copy — exactly like the real invalidate+refetch.
    getTailoredCvMock
      .mockRejectedValueOnce({
        isAxiosError: true,
        response: { status: 404 },
      })
      .mockResolvedValue(SAVED_CV);
    listBaseCvsMock.mockResolvedValue([MOCK_BASE_CV]);
    createTailoredCvMock.mockResolvedValue(SAVED_CV);

    const user = userEvent.setup();
    renderPage();

    const create = await screen.findByRole("button", {
      name: "Create the CV copy",
    });
    await user.click(create);

    expect(
      await screen.findByLabelText("Headline", { exact: true }),
    ).toHaveValue("Original headline");
  });

  it("brings the picker back after deleting the copy, not the stale one (D2)", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: true,
      }),
    );
    getTailoredCvMock.mockResolvedValue(SAVED_CV);
    removeTailoredCvMock.mockResolvedValue(undefined);
    listBaseCvsMock.mockResolvedValue([MOCK_BASE_CV]);

    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Copied from a master CV");
    // The GET now answers 404 — the copy is gone.
    getTailoredCvMock.mockRejectedValue({
      isAxiosError: true,
      response: { status: 404 },
    });
    await user.click(
      screen.getByRole("button", { name: "Delete this CV copy" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    expect(
      await screen.findByRole("button", { name: "Create the CV copy" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Headline")).not.toBeInTheDocument();
  });
});
