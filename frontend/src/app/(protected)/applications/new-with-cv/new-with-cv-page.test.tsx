import {
  onlineManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NewWithCvPage } from "./new-with-cv-page";
import { SupportsProvider } from "@/contexts/supports-context";
import type { Draft, DraftInput } from "@/services/types/application-drafts";

/**
 * `/applications/new-with-cv` (PRD 0010, KODI-033; revised KODI-036).
 *
 * AC1/AC3 — step 1 asks for the application date, preset to the browser's own
 * LOCAL calendar day, saved with the draft on autosave, kept on resume, and
 * used to date the application on Finish. `mode` presets to `active`.
 * AC6/AC7 — no draft (and no POST) until company, role and platform are all
 * set; the first save is a POST, every later one a PUT; the URL picks up
 * `?id=`; nothing is ever written to browser storage; a `beforeunload`
 * listener is registered.
 * AC9 — Finish stays disabled with the missing list.
 */

const createDraftMock = vi.fn();
const updateDraftMock = vi.fn();
const getDraftMock = vi.fn();
const finishDraftMock = vi.fn();
const searchCompaniesMock = vi.fn();
const createCompanyMock = vi.fn();
const createPlatformMock = vi.fn();
const listPlatformsMock = vi.fn();
const getSupportsMock = vi.fn();
const listBaseCvsMock = vi.fn();
const getTailoredCvMock = vi.fn();
const updateTailoredCvMock = vi.fn();
const createTailoredCvMock = vi.fn();
const removeTailoredCvMock = vi.fn();
const getFitMock = vi.fn();
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
      create: (...args: unknown[]) => createCompanyMock(...args),
    },
    platforms: {
      list: (...args: unknown[]) => listPlatformsMock(...args),
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
      getFit: (...args: unknown[]) => getFitMock(...args),
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
    job_id: null,
    company_id: input.company_id ?? null,
    company_name: input.company_name ?? "",
    role: input.role ?? "",
    platform_id: input.platform_id ?? "",
    mode: input.mode ?? "active",
    application_date: input.application_date ?? "2026-09-26",
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
  listPlatformsMock.mockResolvedValue([
    { id: "plt-1", name: "LinkedIn", url: null, is_public: true },
  ]);
  listBaseCvsMock.mockResolvedValue([]);
  getTailoredCvMock.mockRejectedValue({
    isAxiosError: true,
    response: { status: 404 },
  });
  getFitMock.mockResolvedValue({
    score: 64,
    matched_keywords: ["rust"],
    missing_keywords: ["kafka"],
  });
  updateDraftMock.mockImplementation((id: string, data: DraftInput) =>
    Promise.resolve(draftFrom({ ...data, id })),
  );
  getDraftMock.mockImplementation((id: string) =>
    Promise.resolve(draftFrom({ id })),
  );
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lastPut = () =>
  updateDraftMock.mock.calls.at(-1)?.[1] as DraftInput | undefined;
function statusState() {
  return document
    .querySelector('[data-slot="autosave-status"]')
    ?.getAttribute("data-state");
}

describe("NewWithCvPage — step 1 fields (AC1/AC3)", () => {
  it("asks for the application date preset to today's local calendar day, and presets Source to Active", async () => {
    vi.stubEnv("TZ", "America/Sao_Paulo");
    const fixed = new Date(2026, 8, 26, 23, 30, 0); // local 2026-09-26 23:30
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);

    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    expect(screen.getByLabelText(/application date/i)).toHaveTextContent(
      "2026-09-26",
    );
    expect(screen.getByRole("combobox", { name: "Source" })).toHaveTextContent(
      /active/i,
    );

    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("accepts today's own preset date in a zone AHEAD of UTC (frontend-qa KODI-036 round 1, B1)", async () => {
    // At 22:30 UTC, Tokyo (UTC+9) is already the NEXT calendar day. The
    // original `new Date(v) <= new Date()` refine compared against UTC "now"
    // and refused this preset as "in the future" — this pins the fix.
    vi.stubEnv("TZ", "Asia/Tokyo");
    const fixed = new Date(Date.UTC(2026, 8, 26, 22, 30, 0));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);

    createDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-tokyo",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        application_date: "2026-09-27",
      }),
    );
    const user = userEvent.setup({ delay: null });
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    expect(screen.getByLabelText(/application date/i)).toHaveTextContent(
      "2026-09-27",
    );
    expect(
      screen.queryByText("Date cannot be in the future"),
    ).not.toBeInTheDocument();

    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Engineer",
    );
    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await user.click(screen.getByRole("combobox", { name: /platform/i }));
    await user.click(await screen.findByRole("option", { name: "LinkedIn" }));

    await waitFor(() => expect(createDraftMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(createDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ application_date: "2026-09-27" }),
    );
    // The draft was actually created (URL picked up ?id=) — the future-date
    // refusal never fired and blocked the save.
    await waitFor(() =>
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringContaining("id=draft-tokyo"),
      ),
    );

    vi.useRealTimers();
    vi.unstubAllEnvs();
  }, 10_000);

  it("the calendar disables a day past today (maxDate wiring, kills a dropped-maxDate mutant)", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findByRole("combobox", { name: /platform/i });

    await user.click(screen.getByLabelText(/application date/i));
    const nextMonth = await screen.findByRole("button", {
      name: "Go to the Next Month",
    });
    // A day in a future month is always past `maxDate={new Date()}` — every
    // day cell in that grid must be disabled.
    await user.click(nextMonth);
    const futureDay = screen.getAllByRole("button", {
      name: /\d{4}$/,
    })[10];
    expect(futureDay).toBeDisabled();
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
    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
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

describe("NewWithCvPage — step 1 Cancel (AC15, KODI-036)", () => {
  it("forces a real top-level navigation when unsaved typing is at risk", async () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    // Before the draft exists, typing alone puts unsaved work at risk.
    await user.type(screen.getByPlaceholderText(/senior engineer/i), "Eng");

    await user.click(screen.getByRole("link", { name: "Cancel" }));

    expect(assignSpy).toHaveBeenCalledWith("/applications");
  });

  it("is a plain link with nothing unsaved", async () => {
    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign: assignSpy },
    });

    renderPage();
    await screen.findByRole("combobox", { name: /platform/i });

    const cancel = screen.getByRole("link", { name: "Cancel" });
    expect(cancel).toHaveAttribute("href", "/applications");

    fireEvent.click(cancel);

    expect(assignSpy).not.toHaveBeenCalled();
  });
});

describe("NewWithCvPage — Finish (AC9, AC1)", () => {
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

  it("finishes with the draft's own stored application date, not today's, and navigates on success (AC1)", async () => {
    // The draft's stored date is a PAST day, deliberately different from
    // "now" below — Finish must send that STORED value, never a freshly
    // computed calendar day, proving the date travels with the draft (AC1)
    // rather than being stamped at finish time.
    vi.stubEnv("TZ", "America/Sao_Paulo");
    const fixed = new Date(2026, 8, 26, 23, 30, 0); // local "now" 2026-09-26
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);

    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        application_date: "2026-09-10",
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
    expect(finishDraftMock).toHaveBeenCalledWith("draft-9", "2026-09-10");

    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("presets a brand-new draft's application date to the browser's LOCAL calendar day, never toISOString(), and autosaves it", async () => {
    // Pinned to a non-UTC zone (CI runs TZ=UTC): at 23:30 local in
    // America/Sao_Paulo (UTC-3) it is already 2026-09-27 in UTC, so a
    // `toISOString()` regression sends the WRONG day and this test catches it
    // — under TZ=UTC the two dates coincide and the mutant would slip through.
    vi.stubEnv("TZ", "America/Sao_Paulo");
    const fixed = new Date(2026, 8, 26, 23, 30, 0); // local 2026-09-26 23:30
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(fixed);

    createDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        application_date: "2026-09-26",
      }),
    );
    const user = userEvent.setup({ delay: null });
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Engineer",
    );
    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await user.click(screen.getByRole("combobox", { name: /platform/i }));
    await user.click(await screen.findByRole("option", { name: "LinkedIn" }));

    await waitFor(() => expect(createDraftMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(createDraftMock).toHaveBeenCalledWith(
      expect.objectContaining({ application_date: "2026-09-26" }),
    );

    vi.useRealTimers();
    vi.unstubAllEnvs();
  }, 10_000);
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

describe("NewWithCvPage — step 1 survives Back (AC5, QA round 1 B1)", () => {
  it("keeps the picked company visible after Continue -> Back on a NEW draft", async () => {
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
    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await user.click(screen.getByRole("combobox", { name: /platform/i }));
    await user.click(await screen.findByRole("option", { name: "LinkedIn" }));
    await waitFor(() => expect(createDraftMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(screen.getByText("Acme")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to CV" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));

    await screen.findByPlaceholderText(/senior engineer/i);
    expect(screen.queryByText("Search companies…")).not.toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  }, 15_000);

  it("keeps a company CHANGED after resume visible (not reverted) after Continue -> Back", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_id: "cmp-A",
        company_name: "Alpha",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    searchCompaniesMock.mockResolvedValue([
      { id: "cmp-B", name: "Beta", url: "https://beta.io", is_public: true },
    ]);
    updateDraftMock.mockImplementation((id: string, data: DraftInput) =>
      Promise.resolve(
        draftFrom({
          ...data,
          id,
          company_name:
            data.company_id === "cmp-B"
              ? "Beta"
              : data.company_id === "cmp-A"
                ? "Alpha"
                : data.company_name,
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Alpha"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Beta",
    );
    await user.click(await screen.findByText("Beta"));
    await waitFor(() => expect(lastPut()?.company_id).toBe("cmp-B"), {
      timeout: 3000,
    });

    await user.click(screen.getByRole("button", { name: "Continue to CV" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));
    await screen.findByPlaceholderText(/senior engineer/i);
    // Give the autosave a full debounce window to (wrongly) re-send Alpha.
    await sleep(1600);

    expect(lastPut()?.company_id).toBe("cmp-B");
    expect(lastPut()?.company_name).toBe("Beta");
    expect(screen.getByText("Beta")).toBeInTheDocument();
  }, 20_000);

  it("keeps a free-text company's confirmed URL after Continue -> Back", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_id: null,
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    createCompanyMock.mockResolvedValue({
      company: {
        id: "cmp-N",
        name: "Acme",
        url: "https://acme.com",
        is_public: false,
      },
      created: true,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.type(screen.getByLabelText(/^url/i), "https://acme.com");
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await waitFor(() => expect(lastPut()?.company_id).toBe("cmp-N"), {
      timeout: 3000,
    });

    await user.click(screen.getByRole("button", { name: "Continue to CV" }));
    await user.click(await screen.findByRole("button", { name: "Back" }));

    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(lastPut()?.company_id).toBe("cmp-N");
  }, 20_000);

  // The Back BUTTON is one of three paths that put step 1 back on screen —
  // the stepper's own tab and the CV step's "Add a job description" link are
  // the other two (QA round 1 re-verification, findings 2). Each goes through
  // the SAME `goToStep` wrapper, but only the Back button had a committed
  // test; these two close that gap.
  it("keeps a company CHANGED after resume visible via the STEPPER TAB, not the Back button", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_id: "cmp-A",
        company_name: "Alpha",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    searchCompaniesMock.mockResolvedValue([
      { id: "cmp-B", name: "Beta", url: "https://beta.io", is_public: true },
    ]);
    updateDraftMock.mockImplementation((id: string, data: DraftInput) =>
      Promise.resolve(
        draftFrom({
          ...data,
          id,
          company_name:
            data.company_id === "cmp-B"
              ? "Beta"
              : data.company_id === "cmp-A"
                ? "Alpha"
                : data.company_name,
        }),
      ),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Alpha"));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Beta",
    );
    await user.click(await screen.findByText("Beta"));
    await waitFor(() => expect(lastPut()?.company_id).toBe("cmp-B"), {
      timeout: 3000,
    });
    const putsBefore = updateDraftMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Continue to CV" }));
    await user.click(
      await screen.findByRole("button", { name: "Step 1: Application" }),
    );
    await screen.findByPlaceholderText(/senior engineer/i);
    await sleep(1600);

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
    for (const call of updateDraftMock.mock.calls.slice(putsBefore)) {
      expect((call[1] as DraftInput).company_id).toBe("cmp-B");
    }
  }, 20_000);

  it("keeps a free-text company's confirmed URL when returning via 'Add a job description'", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=application");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_id: null,
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: true,
      }),
    );
    getTailoredCvMock.mockResolvedValue(SAVED_CV);
    createCompanyMock.mockResolvedValue({
      company: {
        id: "cmp-N",
        name: "Acme",
        url: "https://acme.com",
        is_public: false,
      },
      created: true,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.type(screen.getByLabelText(/^url/i), "https://acme.com");
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await waitFor(() => expect(lastPut()?.company_id).toBe("cmp-N"), {
      timeout: 3000,
    });
    const putsBefore = updateDraftMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Continue to CV" }));
    await user.click(
      await screen.findByRole("button", { name: "Add a job description" }),
    );
    expect(screen.getByText("Acme")).toBeInTheDocument();
    await sleep(1600);
    for (const call of updateDraftMock.mock.calls.slice(putsBefore)) {
      expect((call[1] as DraftInput).company_id).toBe("cmp-N");
    }
  }, 20_000);
});

describe("NewWithCvPage — autosave race safety (QA round 1 B2)", () => {
  it("a change typed while the first POST is in flight becomes a PUT, never a second POST", async () => {
    let resolvePost: (d: Draft) => void = () => {};
    createDraftMock.mockImplementation(
      () =>
        new Promise<Draft>((resolve) => {
          resolvePost = resolve;
        }),
    );
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("combobox", { name: /platform/i });
    await user.type(
      screen.getByPlaceholderText(/senior engineer/i),
      "Engineer",
    );
    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await user.click(screen.getByRole("combobox", { name: /platform/i }));
    await user.click(await screen.findByRole("option", { name: "LinkedIn" }));
    await waitFor(() => expect(createDraftMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });

    // A second change lands (and its own 1s debounce elapses) WHILE the first
    // POST is still unresolved — this is the race B2 exploited.
    await user.type(screen.getByPlaceholderText(/senior engineer/i), " Two");
    await sleep(1400);
    await act(async () => {
      resolvePost(
        draftFrom({
          id: "draft-9",
          company_name: "Acme",
          role: "Engineer",
          platform_id: "plt-1",
        }),
      );
    });
    await sleep(1500);

    expect(createDraftMock).toHaveBeenCalledTimes(1);
    expect(updateDraftMock).toHaveBeenCalledWith(
      "draft-9",
      expect.objectContaining({ role: "Engineer Two" }),
    );
  }, 20_000);
});

describe("NewWithCvPage — new company reuse and confirm-only creation (AC16/AC18, KODI-035 T111)", () => {
  it("POSTs a brand-new company only once the picker's create form is submitted, and the PUT carries the returned id (AC18)", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_id: null,
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    createCompanyMock.mockResolvedValue({
      company: {
        id: "cmp-N",
        name: "Acme",
        url: "https://acme.com",
        is_public: false,
      },
      created: true,
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.type(screen.getByLabelText(/^url/i), "https://acme.com");
    await sleep(1400);
    expect(createCompanyMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /^add company$/i }));
    await waitFor(
      () =>
        expect(createCompanyMock).toHaveBeenCalledWith({
          name: "Acme",
          url: "https://acme.com",
        }),
      { timeout: 3000 },
    );
    await waitFor(() => expect(lastPut()?.company_id).toBe("cmp-N"), {
      timeout: 3000,
    });
    expect(createCompanyMock).toHaveBeenCalledTimes(1);
  }, 15_000);

  it("does not create a company from an unsubmitted, half-typed URL while another field autosaves (D3)", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_id: null,
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("combobox", { name: "Company" }));
    await user.type(
      screen.getByPlaceholderText(/search or add a company/i),
      "Acme",
    );
    await user.click(await screen.findByText('Create "Acme"'));
    await user.type(screen.getByLabelText(/^url/i), "https://acme.co");

    fireEvent.change(screen.getByPlaceholderText(/senior engineer/i), {
      target: { value: "Engineer X" },
    });
    await waitFor(() => expect(lastPut()?.role).toBe("Engineer X"), {
      timeout: 3000,
    });
    await sleep(300);

    expect(screen.getByLabelText(/^url/i)).toHaveValue("https://acme.co");
    expect(createCompanyMock).not.toHaveBeenCalled();
  }, 15_000);
});

describe("NewWithCvPage — required-fields message and full-body PUT (AC7/AC8)", () => {
  it("clearing a required field sends nothing and shows the exact required-fields copy", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByPlaceholderText(/senior engineer/i);
    await user.clear(role);
    await sleep(1500);

    expect(updateDraftMock).not.toHaveBeenCalled();
    expect(
      screen.getByText("Not saved: company, role and platform are required"),
    ).toBeInTheDocument();
  }, 15_000);

  it("a failed save keeps the typing, shows Not saved with Retry, and the next change sends the latest FULL body (AC8)", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    updateDraftMock.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 500, data: "Internal Server Error" },
    });
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByPlaceholderText(/senior engineer/i);
    await user.type(role, " A");
    await waitFor(() => expect(statusState()).toBe("error"), {
      timeout: 3000,
    });
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(role).toHaveValue("Engineer A");

    await user.type(role, "B");
    await waitFor(() => expect(updateDraftMock).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    const body = lastPut()!;
    expect(body.role).toBe("Engineer AB");
    for (const key of [
      "company_id",
      "company_name",
      "role",
      "platform_id",
      "mode",
      "application_date",
      "link_to_job",
      "observation",
      "expected_salary",
      "salary_range_min",
      "salary_range_max",
      "currency",
      "salary_period",
      "experience_level",
      "work_mode",
      "country",
      "job_description",
    ]) {
      expect(Object.prototype.hasOwnProperty.call(body, key), key).toBe(true);
    }
    await waitFor(() => expect(statusState()).toBe("saved"));
  }, 15_000);

  it("typing the job description on step 1 is part of the autosaved payload (AC2)", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    const user = userEvent.setup();
    renderPage();

    const jobDescription = await screen.findByLabelText("Job description");
    await user.type(jobDescription, "We need a Rust wizard");

    await waitFor(
      () => expect(lastPut()?.job_description).toBe("We need a Rust wizard"),
      { timeout: 3000 },
    );
  }, 15_000);
});

describe("NewWithCvPage — CV copy autosave and step 2 job description/diff (AC4/AC7)", () => {
  it("PUTs a CV copy edit through autosave ~1s later, with no save button on screen", async () => {
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
    getTailoredCvMock.mockResolvedValue(SAVED_CV);
    updateTailoredCvMock.mockImplementation(
      (_id: string, data: object) =>
        Promise.resolve({ ...SAVED_CV, ...data }) as Promise<typeof SAVED_CV>,
    );
    const user = userEvent.setup();
    renderPage();

    const headline = await screen.findByLabelText("Headline", {
      exact: true,
    });
    await user.clear(headline);
    await user.type(headline, "Tailored");
    await sleep(400);
    expect(updateTailoredCvMock).not.toHaveBeenCalled();

    await waitFor(() => expect(updateTailoredCvMock).toHaveBeenCalledTimes(1), {
      timeout: 3000,
    });
    expect(updateTailoredCvMock.mock.calls[0][0]).toBe("draft-9");
    expect(
      (updateTailoredCvMock.mock.calls[0][1] as { headline: string }).headline,
    ).toBe("Tailored");
    expect(
      screen.queryByRole("button", { name: /^save/i }),
    ).not.toBeInTheDocument();
  }, 15_000);

  it("shows the application's job description beside the editor and the diff summary against the master (AC4)", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue({
      ...draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: true,
      }),
      job_description: "We need a Rust wizard",
    } as Draft);
    getTailoredCvMock.mockResolvedValue({
      ...SAVED_CV,
      base_snapshot: { ...SAVED_CV, headline: "Master headline" },
    });
    renderPage();

    await screen.findByLabelText("Headline", { exact: true });
    expect(
      await screen.findByText(/We need a Rust wizard/),
    ).toBeInTheDocument();
    expect(await screen.findByText(/Compared with/i)).toBeInTheDocument();
  }, 15_000);
});

describe("NewWithCvPage — offline autosave (KODI-034, AC7, PRD 0010 edge case l.148)", () => {
  afterEach(() => {
    // Never leak "offline" into a later test regardless of pass/fail.
    onlineManager.setOnline(true);
  });

  it("with the browser offline, autosave goes to Not saved (not stuck on Saving...), keeps what was typed, and saves once back online", async () => {
    searchParams = new URLSearchParams("id=draft-9");
    getDraftMock.mockResolvedValue(
      draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
      }),
    );
    // `networkMode: "always"` makes the mutationFn run even while
    // `onlineManager` reports offline, so the SERVICE call itself has to be
    // the one that fails, exactly like a real fetch would offline.
    updateDraftMock.mockRejectedValueOnce(new Error("network error"));
    const user = userEvent.setup();
    renderPage();

    const role = await screen.findByPlaceholderText(/senior engineer/i);

    onlineManager.setOnline(false);
    await user.type(role, " A");

    // The bug this pins: with the default `networkMode: "online"`, TanStack
    // Query PAUSES the mutation while offline instead of running it, so the
    // status sticks on "saving" forever instead of failing into "error".
    await waitFor(() => expect(statusState()).toBe("error"), {
      timeout: 3000,
    });
    expect(statusState()).not.toBe("saving");
    expect(screen.getByText("Not saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    expect(role).toHaveValue("Engineer A");

    onlineManager.setOnline(true);
    await user.type(role, "B");

    await waitFor(() => expect(updateDraftMock).toHaveBeenCalledTimes(2), {
      timeout: 3000,
    });
    expect(lastPut()?.role).toBe("Engineer AB");
    await waitFor(() => expect(statusState()).toBe("saved"));
  }, 15_000);
});

describe("NewWithCvPage — step 2 'Tailor by keywords' and the CV fit (KODI-049)", () => {
  function draftWithJd(jd: string | null, hasCv = false): Draft {
    return {
      ...draftFrom({
        id: "draft-9",
        company_name: "Acme",
        role: "Engineer",
        platform_id: "plt-1",
        has_cv: hasCv,
      }),
      job_description: jd,
    } as Draft;
  }

  it("offers the same switch, off, and creates with tailoring: keywords once turned on (R-026)", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(draftWithJd("We need a Rust wizard"));
    listBaseCvsMock.mockResolvedValue([MOCK_BASE_CV]);
    createTailoredCvMock.mockResolvedValue(SAVED_CV);

    const user = userEvent.setup();
    renderPage();

    const toggle = await screen.findByRole("switch", {
      name: "Tailor by keywords",
    });
    expect(toggle).not.toBeChecked();
    await user.click(toggle);
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );

    await waitFor(() =>
      expect(createTailoredCvMock).toHaveBeenCalledWith(
        "draft-9",
        MOCK_BASE_CV.id,
        "keywords",
      ),
    );
  });

  it("creates a verbatim copy when the switch is left off", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(draftWithJd("We need a Rust wizard"));
    listBaseCvsMock.mockResolvedValue([MOCK_BASE_CV]);
    createTailoredCvMock.mockResolvedValue(SAVED_CV);

    const user = userEvent.setup();
    renderPage();

    await screen.findByRole("switch", { name: "Tailor by keywords" });
    await user.click(
      screen.getByRole("button", { name: "Create the CV copy" }),
    );
    await waitFor(() =>
      expect(createTailoredCvMock).toHaveBeenCalledWith(
        "draft-9",
        MOCK_BASE_CV.id,
        "copy",
      ),
    );
  });

  it("renders no switch on a draft with no job description", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(draftWithJd(null));
    listBaseCvsMock.mockResolvedValue([MOCK_BASE_CV]);

    renderPage();

    await screen.findByRole("button", { name: "Create the CV copy" });
    expect(
      screen.queryByRole("switch", { name: "Tailor by keywords" }),
    ).not.toBeInTheDocument();
  });

  it("shows the copy's fit with score, matched and missing beside the job description (R-028)", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(draftWithJd("We need a Rust wizard", true));
    getTailoredCvMock.mockResolvedValue(SAVED_CV);

    renderPage();

    expect(await screen.findByText("Fit 64%")).toBeInTheDocument();
    expect(getFitMock).toHaveBeenCalledWith("draft-9");
    expect(
      screen.getByRole("button", { name: "CV fit for this job" }),
    ).toBeInTheDocument();
    expect(screen.getByText("rust")).toBeInTheDocument();
    expect(screen.getByText("kafka")).toBeInTheDocument();
  }, 15_000);

  it("shows no fit on a draft with no job description", async () => {
    searchParams = new URLSearchParams("id=draft-9&step=cv");
    getDraftMock.mockResolvedValue(draftWithJd(null, true));
    getTailoredCvMock.mockResolvedValue(SAVED_CV);

    renderPage();

    await screen.findByLabelText("Headline", { exact: true });
    expect(screen.queryByText("CV fit for this job")).not.toBeInTheDocument();
    expect(getFitMock).not.toHaveBeenCalled();
  }, 15_000);
});
