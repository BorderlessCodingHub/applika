import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApplicationsPage } from "@/app/(protected)/applications/applications-page";

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
    supports: { platforms: [] },
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

vi.mock("@/hooks/use-reopen-application", () => ({
  useReopenApplication: () => ({ mutate: vi.fn(), isPending: false }),
}));

const deleteDraft = vi.fn();
let draftsState: { data: unknown[] | undefined } = { data: undefined };

vi.mock("@/hooks/use-application-drafts", () => ({
  useDrafts: () => ({
    data: draftsState.data,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
  useDeleteDraft: () => ({ mutate: deleteDraft, isPending: false }),
}));

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({
    selectedCycleId: null,
    setSelectedCycleId: () => {},
    isViewingPastCycle: false,
  }),
}));

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

function setDraftsState(data: unknown[] | undefined) {
  draftsState = { data };
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

describe("ApplicationsPage — Drafts section wiring (AC11/AC13)", () => {
  const draft = {
    id: "d-1",
    company_name: "Acme Inc",
    role: "Senior Engineer",
    has_cv: false,
    updated_at: new Date().toISOString(),
  };

  it("renders the Drafts section on the page with real draft data", () => {
    setHookState({});
    setDraftsState([draft]);
    render(<ApplicationsPage />);

    expect(screen.getByRole("heading", { name: "Drafts" })).toBeInTheDocument();
    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /resume senior engineer at acme inc/i,
      }),
    ).toHaveAttribute("href", "/applications/new-with-cv?id=d-1");
  });

  it("is absent when there are no drafts", () => {
    setHookState({});
    setDraftsState([]);
    render(<ApplicationsPage />);

    expect(
      screen.queryByRole("heading", { name: "Drafts" }),
    ).not.toBeInTheDocument();
  });

  it("Delete confirmed calls the delete-draft mutation with the draft's id", async () => {
    setHookState({});
    setDraftsState([draft]);
    const user = userEvent.setup();
    render(<ApplicationsPage />);

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
