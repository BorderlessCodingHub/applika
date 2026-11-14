import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { useDrafts } from "@/hooks/use-application-drafts";
import { useBaseCvs } from "@/hooks/use-base-cvs";
import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import type { MyFeature } from "@/services/types/features";

/**
 * PRD 0015: master CVs and drafts live behind `cvs`. Without it the API
 * answers 404, so neither list is asked for at all.
 */

const listBaseCvs = vi.fn();
const listDrafts = vi.fn();
let myFeatures: MyFeature[] = [];

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: async () => myFeatures },
    baseCvs: { list: (...args: unknown[]) => listBaseCvs(...args) },
    applicationDrafts: { list: (...args: unknown[]) => listDrafts(...args) },
  },
}));

function wrapper(features: MyFeature[] | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (features) client.setQueryData(MY_FEATURES_QUERY_KEY, features);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  listBaseCvs.mockResolvedValue([]);
  listDrafts.mockResolvedValue([]);
});

describe("useBaseCvs", () => {
  it("asks for no master CV without cvs", async () => {
    myFeatures = [{ key: "jobs", stage: "beta" }];
    const { result } = renderHook(() => useBaseCvs(), {
      wrapper: wrapper(myFeatures),
    });

    // Let the features refetch settle: the query must still be idle.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.fetchStatus).toBe("idle");
    expect(result.current.isSuccess).toBe(false);
    expect(listBaseCvs).not.toHaveBeenCalled();
  });

  it("asks for no master CV while the features are loading", async () => {
    myFeatures = [{ key: "cvs", stage: "beta" }];
    const { result } = renderHook(() => useBaseCvs(), {
      wrapper: wrapper(undefined),
    });

    expect(result.current.fetchStatus).toBe("idle");
    expect(listBaseCvs).not.toHaveBeenCalled();
    // Then the answer arrives with cvs, and the list follows.
    await waitFor(() => expect(listBaseCvs).toHaveBeenCalledTimes(1));
  });

  it("lists the master CVs with cvs", async () => {
    myFeatures = [{ key: "cvs", stage: "general" }];
    const { result } = renderHook(() => useBaseCvs(), {
      wrapper: wrapper(myFeatures),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listBaseCvs).toHaveBeenCalledTimes(1);
  });
});

describe("useDrafts", () => {
  it("asks for no draft when disabled (no cvs)", async () => {
    const { result } = renderHook(() => useDrafts(false), {
      wrapper: wrapper([]),
    });

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(result.current.fetchStatus).toBe("idle");
    expect(listDrafts).not.toHaveBeenCalled();
  });

  it("lists the drafts when enabled", async () => {
    const { result } = renderHook(() => useDrafts(true), {
      wrapper: wrapper([]),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(listDrafts).toHaveBeenCalledTimes(1);
  });
});
