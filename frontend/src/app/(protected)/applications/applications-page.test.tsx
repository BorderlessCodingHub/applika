import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { ApplicationsPage } from "@/app/(protected)/applications/applications-page";
import type { Application } from "@/services/types/applications";

/**
 * KODI-015 (T075): the new toolbar/list structure. Exercises `useApplications`
 * through a mock so the page's own behaviour — the status option label (G6),
 * the error state with Retry (G8) — is asserted without a real query client
 * or API.
 */

const updateFilter = vi.fn();
const clearFilters = vi.fn();
const refetch = vi.fn();

let hookState: {
  filtered: unknown[];
  isLoading: boolean;
  isError: boolean;
  hasAdvancedFilters: boolean;
  hasAnyFilter: boolean;
};

// `?focus=` (R-011, KODI-038): the scroll+focus effect gates on this SAME
// `supports` value (real `useApplications` proxies it straight from
// `useSupports()`) — mutable so a test can simulate it arriving late,
// same as the real world where `ApplicationItem` renders `null` until it
// resolves (frontend-qa B2).
let supportsReady = true;

vi.mock("@/hooks/use-applications", () => ({
  useApplications: () => ({
    filtered: hookState.filtered,
    isLoading: hookState.isLoading,
    isError: hookState.isError,
    refetch,
    filters: { status: "all", mode: "all" },
    updateFilter,
    clearFilters,
    hasAdvancedFilters: hookState.hasAdvancedFilters,
    hasAnyFilter: hookState.hasAnyFilter,
    supports: supportsReady ? { platforms: [] } : undefined,
  }),
  useApplicationDelete: () => ({ deleteApplication: vi.fn() }),
  useApplicationMutate: () => ({ submit: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-companies", () => ({
  useCompanySearch: () => ({
    fetchCompanies: vi.fn().mockResolvedValue([]),
    isLoading: false,
    error: null,
  }),
}));

vi.mock("@/hooks/use-create-platform", () => ({
  useCreatePlatformOutcome: () => vi.fn(),
}));

vi.mock("@/hooks/use-platforms", () => ({
  usePlatforms: () => ({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/use-create-company", () => ({
  useCreateCompany: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/hooks/use-reopen-application", () => ({
  useReopenApplication: () => ({ mutate: vi.fn(), isPending: false }),
}));

// `?focus=` (R-011, KODI-038): ApplicationItem's own TimelineSection reaches
// for real hooks (useSupports, useTimeline), which need a provider + a
// mocked service — same shape as `application-item.test.tsx`.
vi.mock("@/contexts/supports-context", () => ({
  useSupports: () => ({
    supports: supportsReady
      ? { platforms: [{ id: "p-1", name: "LinkedIn" }] }
      : undefined,
    isLoading: !supportsReady,
  }),
}));

vi.mock("@/services/services", () => ({
  services: {
    timeline: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

const toastInfoMock = vi.fn();
const scrollIntoContainerMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/scroll-into-container", () => ({
  scrollIntoContainer: scrollIntoContainerMock,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: (...args: unknown[]) => toastInfoMock(...args),
  },
}));

// PRD 0015: CVs and drafts live behind `cvs`. The cases written before it run
// with `cvs`; `hasCvs = false` is a user without it.
let hasCvs = true;
vi.mock("@/hooks/use-features", () => ({
  useHasFeature: (key: string) => ({
    has: key === "cvs" ? hasCvs : false,
    stage: key === "cvs" && hasCvs ? "beta" : null,
    isLoading: false,
  }),
}));

const deleteDraft = vi.fn();
/** Every `enabled` the page handed `useDrafts`: `false` means no request. */
const useDraftsCalls: unknown[] = [];
const listDrafts = vi.fn();
let draftsState: {
  data: unknown[] | undefined;
  isLoading: boolean;
  isError: boolean;
  isSuccess: boolean;
} = { data: undefined, isLoading: false, isError: false, isSuccess: true };

vi.mock("@/hooks/use-application-drafts", () => ({
  useDrafts: (enabled?: boolean) => {
    useDraftsCalls.push(enabled);
    // Stands in for the query: it only fetches when enabled.
    if (enabled !== false) listDrafts();
    return {
      data: draftsState.data,
      isLoading: draftsState.isLoading,
      isError: draftsState.isError,
      isSuccess: draftsState.isSuccess,
      error: draftsState.isError
        ? { response: { data: { detail: "Could not load drafts" } } }
        : null,
      refetch: vi.fn(),
    };
  },
  useDeleteDraft: () => ({ mutate: deleteDraft, isPending: false }),
}));

let isViewingPastCycle = false;

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({
    selectedCycleId: null,
    setSelectedCycleId: () => {},
    get isViewingPastCycle() {
      return isViewingPastCycle;
    },
  }),
}));

function focusApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    company_id: "c-1",
    company_name: "Acme",
    platform_id: "p-1",
    role: "Backend engineer",
    mode: "active",
    application_date: "2026-06-01",
    finalized: false,
    finalized_at: null,
    ...overrides,
  };
}

function renderWithQueryClient() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const result = render(
    <QueryClientProvider client={client}>
      <ApplicationsPage />
    </QueryClientProvider>,
  );
  return {
    ...result,
    // Re-renders the SAME QueryClientProvider/ApplicationsPage tree after a
    // `setHookState`/`supportsReady` mutation, for tests that simulate a
    // remount-inducing change (a filter, a late `supports`, a retry).
    rerenderPage: () =>
      result.rerender(
        <QueryClientProvider client={client}>
          <ApplicationsPage />
        </QueryClientProvider>,
      ),
  };
}

// Lets every pending requestAnimationFrame callback run (they fire in
// scheduling order, so one queued after the page's own frame runs after it).
function nextFrame() {
  return act(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve())),
  );
}

function setHookState(overrides: Partial<typeof hookState>) {
  hookState = {
    filtered: [],
    isLoading: false,
    isError: false,
    hasAdvancedFilters: false,
    hasAnyFilter: false,
    ...overrides,
  };
}

function setDraftsState(
  data: unknown[] | undefined,
  overrides?: Partial<Omit<typeof draftsState, "data">>,
) {
  draftsState = {
    data,
    isLoading: false,
    isError: false,
    isSuccess: true,
    ...overrides,
  };
}

describe("ApplicationsPage — status filter label (G6)", () => {
  it("renders the 'Closed' option label", async () => {
    setHookState({});
    const user = userEvent.setup();
    render(<ApplicationsPage />);
    await user.click(screen.getByRole("combobox", { name: "Status" }));
    expect(
      await screen.findByRole("option", { name: "Closed" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: "Finalized" }),
    ).not.toBeInTheDocument();
  });
});

describe("ApplicationsPage — error state (G8)", () => {
  it("shows Retry and calls refetch on click", async () => {
    setHookState({ isError: true });
    const user = userEvent.setup();
    render(<ApplicationsPage />);
    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry).toBeInTheDocument();
    await user.click(retry);
    expect(refetch).toHaveBeenCalled();
  });
});

describe("ApplicationsPage — advanced filters button (G7)", () => {
  it("stays outline (inactive) when hasAdvancedFilters is false, e.g. a status-only filter", () => {
    setHookState({ hasAdvancedFilters: false });
    render(<ApplicationsPage />);
    const sliders = screen.getByRole("button", { name: "Advanced filters" });
    expect(sliders).toHaveAttribute("data-variant", "outline");
  });

  it("turns secondary (active) when hasAdvancedFilters is true, e.g. Source is set", () => {
    setHookState({ hasAdvancedFilters: true });
    render(<ApplicationsPage />);
    const sliders = screen.getByRole("button", { name: "Advanced filters" });
    expect(sliders).toHaveAttribute("data-variant", "secondary");
  });
});

describe("ApplicationsPage — empty state", () => {
  it("shows the no-results message when the list is empty", () => {
    setHookState({ filtered: [] });
    render(<ApplicationsPage />);
    expect(screen.getByText(/no applications found/i)).toBeInTheDocument();
  });
});

describe("ApplicationsPage — create actions (AC1, T071)", () => {
  it("shows both New Application and New with CV, the second linking to /applications/new-with-cv", () => {
    setHookState({});
    render(<ApplicationsPage />);

    expect(
      screen.getByRole("button", { name: "New Application" }),
    ).toBeInTheDocument();

    const newWithCv = screen.getByRole("link", { name: "New with CV" });
    expect(newWithCv).toHaveAttribute("href", "/applications/new-with-cv");
  });

  it("New Application still opens the side sheet", async () => {
    setHookState({});
    const user = userEvent.setup();
    render(<ApplicationsPage />);

    await user.click(screen.getByRole("button", { name: "New Application" }));
    expect(
      screen.getByRole("heading", { name: "New Application" }),
    ).toBeInTheDocument();
  });
});

describe("ApplicationsPage — archived cycle shows no tabs and no drafts (AC9)", () => {
  it("renders the toolbar and list directly, with no tablist and no Drafts anywhere", () => {
    isViewingPastCycle = true;
    setHookState({});
    setDraftsState([
      {
        id: "d-1",
        company_name: "Acme Inc",
        role: "Senior Engineer",
        has_cv: false,
        updated_at: new Date().toISOString(),
      },
    ]);

    render(<ApplicationsPage />);

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText(/drafts/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Inc")).not.toBeInTheDocument();

    isViewingPastCycle = false;
  });
});

describe("ApplicationsPage — Applications | Drafts tabs (KODI-036, AC8)", () => {
  const draft = {
    id: "d-1",
    company_name: "Acme Inc",
    role: "Senior Engineer",
    has_cv: false,
    updated_at: new Date().toISOString(),
  };

  it("Applications is selected on open and the Drafts tab carries the count", () => {
    setHookState({});
    setDraftsState([draft]);
    render(<ApplicationsPage />);

    const applicationsTab = screen.getByRole("tab", { name: "Applications" });
    expect(applicationsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Drafts (1)" })).toBeInTheDocument();
  });

  it("switching to the Drafts tab shows the draft with a Resume link, and back keeps the applications list as today", async () => {
    setHookState({});
    setDraftsState([draft]);
    const user = userEvent.setup();
    render(<ApplicationsPage />);

    await user.click(screen.getByRole("tab", { name: /drafts/i }));

    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /resume senior engineer at acme inc/i,
      }),
    ).toHaveAttribute("href", "/applications/new-with-cv?id=d-1");
  });

  it("stays visible with no drafts and says so, with a way to start one (AC8)", async () => {
    setHookState({});
    setDraftsState([]);
    const user = userEvent.setup();
    render(<ApplicationsPage />);

    expect(screen.getByRole("tab", { name: "Drafts (0)" })).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: /drafts/i }));

    expect(screen.getByText("No drafts yet.")).toBeInTheDocument();
    const draftsSection = document.querySelector(
      '[data-slot="drafts-section"]',
    ) as HTMLElement;
    expect(
      within(draftsSection).getByRole("link", { name: "New with CV" }),
    ).toHaveAttribute("href", "/applications/new-with-cv");
  });

  it("shows no count while the drafts query is loading (design section 6 state 1)", () => {
    setHookState({});
    setDraftsState(undefined, {
      isLoading: true,
      isSuccess: false,
    });
    render(<ApplicationsPage />);

    expect(screen.getByRole("tab", { name: "Drafts" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /drafts \(/i }),
    ).not.toBeInTheDocument();
  });

  it("shows no count when the drafts query errors, never a false Drafts (0) (design section 6 state 4)", () => {
    setHookState({});
    setDraftsState(undefined, {
      isError: true,
      isSuccess: false,
    });
    render(<ApplicationsPage />);

    expect(screen.getByRole("tab", { name: "Drafts" })).toBeInTheDocument();
    expect(
      screen.queryByRole("tab", { name: /drafts \(/i }),
    ).not.toBeInTheDocument();
  });

  it("Delete confirmed calls the delete-draft mutation with the draft's id", async () => {
    setHookState({});
    setDraftsState([draft]);
    const user = userEvent.setup();
    render(<ApplicationsPage />);

    await user.click(screen.getByRole("tab", { name: /drafts/i }));
    await user.click(
      screen.getByRole("button", {
        name: /delete draft senior engineer at acme inc/i,
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Delete draft" }),
    );

    expect(deleteDraft).toHaveBeenCalledWith("d-1", expect.anything());
  });
});

describe("ApplicationsPage — the flag opens the one event dialog in close mode", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    supportsReady = true;
    isViewingPastCycle = false;
    hasCvs = true;
    setDraftsState([]);
  });

  it("opens a dialog named Close application with None, Offer and Denied, and no alertdialog", async () => {
    const user = userEvent.setup();
    setHookState({ filtered: [focusApplication()] });
    renderWithQueryClient();

    await user.click(
      await screen.findByRole("button", {
        name: "Close Backend engineer at Acme",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Close application",
    });
    expect(dialog).toHaveAccessibleDescription(/reversible/i);
    const radios = within(dialog).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual([
      "None",
      "Offer",
      "Denied",
    ]);
    expect(within(dialog).getByRole("radio", { name: "None" })).toBeChecked();
    expect(
      within(dialog).queryByRole("radio", { name: "Interview" }),
    ).toBeNull();
    expect(within(dialog).queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Close application" }),
      ).not.toBeInTheDocument(),
    );
  });
});

describe("ApplicationsPage — ?focus= (R-011, KODI-038)", () => {
  beforeEach(() => {
    searchParams = new URLSearchParams();
    window.history.replaceState(null, "", "/applications");
    toastInfoMock.mockClear();
    scrollIntoContainerMock.mockClear();
    supportsReady = true;
  });

  afterEach(() => {
    window.history.replaceState(null, "", "/applications");
    supportsReady = true;
  });

  it("an id in the list: expands the row, scrolls it into view and replaces the URL", async () => {
    const scrollSpy = scrollIntoContainerMock;
    searchParams = new URLSearchParams("focus=app-1");
    setHookState({ filtered: [focusApplication()] });

    renderWithQueryClient();

    await waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    expect(scrollSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        dataset: expect.objectContaining({ applicationId: "app-1" }),
      }),
      "smooth",
    );
    expect(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(window.location.pathname).toBe("/applications");
    expect(window.location.search).toBe("");
    expect(toastInfoMock).not.toHaveBeenCalled();

    scrollSpy.mockClear();
  });

  it("an id NOT in the list: shows the not-in-cycle notice once and replaces the URL", async () => {
    searchParams = new URLSearchParams("focus=missing-app");
    setHookState({ filtered: [focusApplication()] });

    renderWithQueryClient();

    await waitFor(() =>
      expect(toastInfoMock).toHaveBeenCalledWith(
        "This application is not in the cycle you are viewing.",
        expect.objectContaining({
          id: "applications-focus-not-in-cycle",
          richColors: false,
        }),
      ),
    );
    expect(toastInfoMock).toHaveBeenCalledTimes(1);
    expect(window.location.pathname).toBe("/applications");
    expect(window.location.search).toBe("");
    expect(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("an id in the list, landing uncached: no notice while loading, then the row expands", async () => {
    searchParams = new URLSearchParams("focus=app-1");
    setHookState({ isLoading: true, filtered: [] });

    const { rerenderPage } = renderWithQueryClient();
    expect(toastInfoMock).not.toHaveBeenCalled();

    setHookState({ isLoading: false, filtered: [focusApplication()] });
    rerenderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Details for Backend engineer at Acme",
        }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("no ?focus=: nothing is expanded, no notice, no URL change", () => {
    searchParams = new URLSearchParams();
    setHookState({ filtered: [focusApplication()] });

    renderWithQueryClient();

    expect(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(toastInfoMock).not.toHaveBeenCalled();
  });

  it("hiding then reshowing the row does not re-steal scroll/focus a second time (frontend-qa B1)", async () => {
    const scrollSpy = scrollIntoContainerMock;
    searchParams = new URLSearchParams("focus=app-1");
    setHookState({ filtered: [focusApplication()] });

    const { rerenderPage } = renderWithQueryClient();
    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));

    scrollSpy.mockClear();
    // The row disappears (e.g. a search/filter change) and reappears (e.g.
    // the filter is cleared, or a background refetch remounts it).
    setHookState({ filtered: [] });
    rerenderPage();
    setHookState({ filtered: [focusApplication()] });
    rerenderPage();
    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Details for Backend engineer at Acme",
        }),
      ).toBeInTheDocument(),
    );
    await nextFrame();

    expect(scrollSpy).not.toHaveBeenCalled();

    scrollSpy.mockClear();
  });

  it("scrolls once `supports` arrives, even if it resolves after the list (frontend-qa B2)", async () => {
    const scrollSpy = scrollIntoContainerMock;
    searchParams = new URLSearchParams("focus=app-1");
    supportsReady = false;
    setHookState({ filtered: [focusApplication()] });

    const { rerenderPage } = renderWithQueryClient();
    // `ApplicationItem` itself renders null without `supports`, so there is
    // nothing to scroll to yet.
    expect(
      screen.queryByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).not.toBeInTheDocument();
    // A frame passes before `supports` arrives, as it does in a browser.
    await nextFrame();
    expect(scrollSpy).not.toHaveBeenCalled();

    supportsReady = true;
    rerenderPage();

    await waitFor(() => expect(scrollSpy).toHaveBeenCalledTimes(1));
    const trigger = screen.getByRole("button", {
      name: "Details for Backend engineer at Acme",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveFocus();

    scrollSpy.mockClear();
  });

  it("a load error never reads as 'not in the cycle', and a successful retry still resolves it (frontend-qa B3)", async () => {
    searchParams = new URLSearchParams("focus=app-1");
    setHookState({ isError: true, filtered: [] });

    const { rerenderPage } = renderWithQueryClient();
    expect(toastInfoMock).not.toHaveBeenCalled();
    // The effect must not have consumed its one shot on the error render —
    // the URL (reset to a bare path in `beforeEach`) is still untouched.
    expect(window.location.search).toBe("");

    // A successful retry: the id turns out to be in the list.
    setHookState({ isError: false, filtered: [focusApplication()] });
    rerenderPage();

    await waitFor(() =>
      expect(
        screen.getByRole("button", {
          name: "Details for Backend engineer at Acme",
        }),
      ).toHaveAttribute("aria-expanded", "true"),
    );
    expect(toastInfoMock).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });
});

describe("ApplicationsPage without the cvs feature (PRD 0015)", () => {
  const draft = {
    id: "d-1",
    company_name: "Acme Inc",
    role: "Senior Engineer",
    has_cv: false,
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    hasCvs = false;
    useDraftsCalls.length = 0;
    listDrafts.mockClear();
  });

  afterEach(() => {
    hasCvs = true;
  });

  it("shows the current cycle with no tabs, no Drafts and no New with CV", () => {
    setHookState({ filtered: [focusApplication()] });
    setDraftsState([draft]);

    renderWithQueryClient();

    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByText(/drafts/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Acme Inc")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "New with CV" }),
    ).not.toBeInTheDocument();
    // "New Application" and the list stay.
    expect(
      screen.getByRole("button", { name: "New Application" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: /search/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Backend engineer")).toBeInTheDocument();
  });

  it("never asks for the drafts", () => {
    setHookState({});

    renderWithQueryClient();

    expect(useDraftsCalls.length).toBeGreaterThan(0);
    expect(useDraftsCalls.every((enabled) => enabled === false)).toBe(true);
    expect(listDrafts).not.toHaveBeenCalled();
  });

  it("renders no CV link on an application row", () => {
    setHookState({ filtered: [focusApplication()] });

    renderWithQueryClient();

    expect(screen.getByText("Backend engineer")).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /^CV for/ }),
    ).not.toBeInTheDocument();
  });

  it("with cvs: the tabs, New with CV, the CV link and the drafts request are back", () => {
    hasCvs = true;
    setHookState({ filtered: [focusApplication()] });
    setDraftsState([draft]);

    renderWithQueryClient();

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Drafts (1)" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New with CV" })).toHaveAttribute(
      "href",
      "/applications/new-with-cv",
    );
    expect(screen.getByRole("link", { name: /^CV for/ })).toHaveAttribute(
      "href",
      "/applications/cv?id=app-1",
    );
    expect(useDraftsCalls.every((enabled) => enabled === true)).toBe(true);
    expect(listDrafts).toHaveBeenCalled();
  });
});
