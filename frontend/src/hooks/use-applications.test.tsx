import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { useApplications } from "@/hooks/use-applications";
import { services } from "@/services/services";
import type { Application } from "@/services/types/applications";

/**
 * G7 (KODI-015): `hasAdvancedFilters` must count the panel controls (mode,
 * platform, date range), not the toolbar `status` select. Before this fix the
 * sliders button lit up on a toolbar-only filter and "Clear all" stayed
 * hidden when only a panel field (e.g. Source/mode) was set.
 */

vi.mock("@/contexts/supports-context", () => ({
  useSupports: () => ({
    supports: { platforms: [{ id: "p-1", name: "LinkedIn" }] },
    isLoading: false,
  }),
}));

vi.mock("@/services/services", () => ({
  services: {
    applications: {
      getApplications: vi.fn(),
    },
  },
}));

function application(overrides: Partial<Application> = {}): Application {
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

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe("useApplications — hasAdvancedFilters (G7)", () => {
  it("is false when only the toolbar status filter is set", async () => {
    vi.mocked(services.applications.getApplications).mockResolvedValue([
      application(),
    ]);
    const { result } = renderHook(() => useApplications(null), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.updateFilter("status", "finalized"));
    await waitFor(() =>
      expect(result.current.filters.status).toBe("finalized"),
    );

    expect(result.current.hasAdvancedFilters).toBe(false);
  });

  it("is true when the panel's mode filter is set", async () => {
    vi.mocked(services.applications.getApplications).mockResolvedValue([
      application(),
    ]);
    const { result } = renderHook(() => useApplications(null), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => result.current.updateFilter("mode", "active"));
    await waitFor(() => expect(result.current.filters.mode).toBe("active"));

    expect(result.current.hasAdvancedFilters).toBe(true);
  });

  it("is true when a date range is set", async () => {
    vi.mocked(services.applications.getApplications).mockResolvedValue([
      application(),
    ]);
    const { result } = renderHook(() => useApplications(null), {
      wrapper: wrapper(),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() =>
      result.current.updateFilter("dateRange", { start: "2026-01-01" }),
    );
    await waitFor(() => expect(result.current.filters.dateRange).toBeDefined());

    expect(result.current.hasAdvancedFilters).toBe(true);
  });
});

describe("useApplications — error state (G8)", () => {
  it("exposes isError and refetch when the load fails", async () => {
    vi.mocked(services.applications.getApplications).mockRejectedValue(
      new Error("boom"),
    );
    const { result } = renderHook(() => useApplications(null), {
      wrapper: wrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(typeof result.current.refetch).toBe("function");
  });
});
