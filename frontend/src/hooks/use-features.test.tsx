import {
  QueryClient,
  QueryClientProvider,
  focusManager,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MY_FEATURES_QUERY_KEY,
  useHasFeature,
  useMyFeatures,
} from "@/hooks/use-features";

/**
 * KODI-053 (PRD 0013): the caller's features. Loading and failure both read
 * as "no features", and nothing is cached for long (AC2).
 */

const getMine = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: (...args: unknown[]) => getMine(...args) },
  },
}));

function wrapperWith(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function newClient() {
  // The app's own defaults: a 5-minute staleTime the hook must override.
  return new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
}

beforeEach(() => {
  getMine.mockReset();
});

describe("useMyFeatures", () => {
  it("returns the features the server answers, under ['user', 'features']", async () => {
    getMine.mockResolvedValue([{ key: "jobs", stage: "beta" }]);
    const client = newClient();
    const { result } = renderHook(() => useMyFeatures(), {
      wrapper: wrapperWith(client),
    });

    expect(result.current.isLoading).toBe(true);
    expect(result.current.features).toEqual([]);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features).toEqual([{ key: "jobs", stage: "beta" }]);
    expect(MY_FEATURES_QUERY_KEY).toEqual(["user", "features"]);
    expect(client.getQueryData(MY_FEATURES_QUERY_KEY)).toEqual([
      { key: "jobs", stage: "beta" },
    ]);
  });

  it("treats a failed call as an empty list, never loading forever", async () => {
    getMine.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useMyFeatures(), {
      wrapper: wrapperWith(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.features).toEqual([]);
  });

  it("asks nothing while disabled, and reads as no features", () => {
    const { result } = renderHook(() => useMyFeatures(false), {
      wrapper: wrapperWith(newClient()),
    });

    expect(getMine).not.toHaveBeenCalled();
    expect(result.current.features).toEqual([]);
  });

  it("asks again on the next mount: no long cache (AC2)", async () => {
    getMine.mockResolvedValue([{ key: "jobs", stage: "beta" }]);
    const client = newClient();
    const first = renderHook(() => useMyFeatures(), {
      wrapper: wrapperWith(client),
    });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    first.unmount();

    getMine.mockResolvedValue([]);
    const second = renderHook(() => useMyFeatures(), {
      wrapper: wrapperWith(client),
    });
    await waitFor(() => expect(getMine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(second.result.current.features).toEqual([]));
  });

  it("asks again when the window regains focus", async () => {
    getMine.mockResolvedValue([{ key: "jobs", stage: "general" }]);
    const { result } = renderHook(() => useMyFeatures(), {
      wrapper: wrapperWith(newClient()),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    getMine.mockResolvedValue([]);
    act(() => {
      focusManager.setFocused(false);
      focusManager.setFocused(true);
    });
    await waitFor(() => expect(getMine).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.features).toEqual([]));
    act(() => focusManager.setFocused(undefined));
  });
});

describe("useHasFeature", () => {
  it("is has: false while loading, so nothing flashes in", () => {
    getMine.mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() => useHasFeature("jobs"), {
      wrapper: wrapperWith(newClient()),
    });

    expect(result.current).toEqual({
      has: false,
      stage: null,
      isLoading: true,
    });
  });

  it("reports the stage of a feature the caller has", async () => {
    getMine.mockResolvedValue([{ key: "jobs", stage: "beta" }]);
    const { result } = renderHook(() => useHasFeature("jobs"), {
      wrapper: wrapperWith(newClient()),
    });

    await waitFor(() =>
      expect(result.current).toEqual({
        has: true,
        stage: "beta",
        isLoading: false,
      }),
    );
  });

  it("is has: false for a key the server did not return", async () => {
    getMine.mockResolvedValue([]);
    const { result } = renderHook(() => useHasFeature("jobs"), {
      wrapper: wrapperWith(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toEqual({
      has: false,
      stage: null,
      isLoading: false,
    });
  });

  it("is has: false when the call fails", async () => {
    getMine.mockRejectedValue(new Error("500"));
    const { result } = renderHook(() => useHasFeature("jobs"), {
      wrapper: wrapperWith(newClient()),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.has).toBe(false);
  });
});
