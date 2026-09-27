import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ReactNode } from "react";

import { useCreatePlatformOutcome } from "@/hooks/use-create-platform";
import { services } from "@/services/services";

/** PRD 0010 (KODI-033, T079/AC17): the hook-level 409 -> "exists" translation. */

vi.mock("@/services/services", () => ({
  services: {
    platforms: { create: vi.fn() },
    supports: { getSupports: vi.fn() },
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useCreatePlatformOutcome", () => {
  it("resolves 'created' with the new platform on success", async () => {
    vi.mocked(services.platforms.create).mockResolvedValue({
      id: "p-1",
      name: "Wellfound",
      url: null,
      is_public: false,
    });

    const { result } = renderHook(() => useCreatePlatformOutcome(), {
      wrapper,
    });

    const outcome = await result.current({ name: "Wellfound", url: null });

    expect(outcome).toEqual({
      status: "created",
      platform: { id: "p-1", name: "Wellfound", url: null, is_public: false },
    });
  });

  it("on a 409, refetches supports and resolves 'exists' with the colliding platform (AC17)", async () => {
    vi.mocked(services.platforms.create).mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 409,
        data: { detail: "A platform with this name already exists: LinkedIn" },
      },
    });
    vi.mocked(services.supports.getSupports).mockResolvedValue({
      platforms: [{ id: "p-1", name: "LinkedIn", url: null, is_public: true }],
    });

    const { result } = renderHook(() => useCreatePlatformOutcome(), {
      wrapper,
    });

    const outcome = await result.current({ name: "linkedin", url: null });

    await waitFor(() =>
      expect(outcome).toEqual({
        status: "exists",
        message: "A platform with this name already exists: LinkedIn",
        platform: { id: "p-1", name: "LinkedIn", url: null, is_public: true },
      }),
    );
  });

  it("resolves 'failed' with the server's message on any other error", async () => {
    vi.mocked(services.platforms.create).mockRejectedValue({
      isAxiosError: true,
      response: { status: 500, data: { detail: "Server exploded" } },
    });

    const { result } = renderHook(() => useCreatePlatformOutcome(), {
      wrapper,
    });

    const outcome = await result.current({ name: "X", url: null });

    expect(outcome).toEqual({ status: "failed", message: "Server exploded" });
  });
});
