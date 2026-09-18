import { render, screen } from "@testing-library/react";
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
}));

vi.mock("@/hooks/use-reopen-application", () => ({
  useReopenApplication: () => ({ mutate: vi.fn(), isPending: false }),
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
