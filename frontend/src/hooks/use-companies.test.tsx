import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

import { useCompanySearch } from "@/hooks/use-companies";
import { api } from "@/lib/api-client";

/**
 * KODI-035 remediation r2 (QA finding 1): the component tests all mock
 * `fetchCompanies`, so nothing below `CompanySelect` proved a blank query
 * actually hits `GET /companies` with no `name` (the "list on open" case,
 * AC1 (b)) rather than `GET /companies?name=`. This runs the REAL hook and
 * the REAL `CompanyService`, stubbing only `api.get`.
 */

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

afterEach(() => vi.restoreAllMocks());

describe("useCompanySearch", () => {
  it("a blank query hits GET /companies with no name param (list on open)", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({
      data: [{ id: "co-1", name: "Acme Inc", url: null, is_public: true }],
    });
    const { result } = renderHook(() => useCompanySearch(), { wrapper });

    let companies: Awaited<ReturnType<typeof result.current.fetchCompanies>> =
      [];
    await act(async () => {
      companies = await result.current.fetchCompanies("");
    });

    expect(get).toHaveBeenCalledWith("/companies");
    expect(companies).toEqual([
      { id: "co-1", name: "Acme Inc", url: null, is_public: true },
    ]);
  });

  it("a typed query hits GET /companies?name= with the trimmed, lower-cased text", async () => {
    const get = vi.spyOn(api, "get").mockResolvedValue({ data: [] });
    const { result } = renderHook(() => useCompanySearch(), { wrapper });

    await act(async () => {
      await result.current.fetchCompanies(" Acme ");
    });

    await waitFor(() =>
      expect(get).toHaveBeenCalledWith("/companies?name=acme"),
    );
  });
});
