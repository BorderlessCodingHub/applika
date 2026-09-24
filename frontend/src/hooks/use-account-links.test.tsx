import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useStartDiscordLink, useUnlinkDiscord } from "./use-account-links";
import { USER_QUERY_KEY } from "./use-user";

/**
 * KODI-022 (plan 0009, T049/T052/T061/T063) — the Discord account-link
 * mutation hooks. Asserts the wire call each makes through `services.auth`,
 * the navigation/toast/invalidate side effects on success, and the 503 vs.
 * generic-error toast split for `useStartDiscordLink`.
 */

const startDiscordLink = vi.fn();
const unlinkDiscord = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    auth: {
      startDiscordLink: (...args: unknown[]) => startDiscordLink(...args),
      unlinkDiscord: (...args: unknown[]) => unlinkDiscord(...args),
    },
  },
}));

vi.mock("@/lib/api-client", () => ({
  getApiError: (error: { response?: { data?: { detail?: string } } }): string =>
    error?.response?.data?.detail ?? "Something went wrong",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useStartDiscordLink", () => {
  it("navigates to the authorize_url on success", async () => {
    startDiscordLink.mockResolvedValueOnce({
      authorize_url: "https://discord.com/oauth2/authorize?scope=identify",
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    const client = new QueryClient();
    const { result } = renderHook(() => useStartDiscordLink(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(startDiscordLink).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith(
      "https://discord.com/oauth2/authorize?scope=identify",
    );
    vi.unstubAllGlobals();
  });

  it("toasts 'Discord linking is unavailable' on a 503", async () => {
    startDiscordLink.mockRejectedValueOnce({
      response: {
        status: 503,
        data: { detail: "Discord linking is not configured" },
      },
    });

    const client = new QueryClient();
    const { result } = renderHook(() => useStartDiscordLink(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("Discord linking is unavailable");
  });

  it("toasts the server's error detail on a non-503 error", async () => {
    startDiscordLink.mockRejectedValueOnce({
      response: { status: 401, data: { detail: "Not authenticated" } },
    });

    const client = new QueryClient();
    const { result } = renderHook(() => useStartDiscordLink(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("Not authenticated");
  });
});

describe("useUnlinkDiscord", () => {
  it("invalidates USER_QUERY_KEY and toasts success on success", async () => {
    unlinkDiscord.mockResolvedValueOnce({ provider: "discord", linked: false });

    const client = new QueryClient();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUnlinkDiscord(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(unlinkDiscord).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: USER_QUERY_KEY }),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it("toasts the server's error detail on error", async () => {
    unlinkDiscord.mockRejectedValueOnce({
      response: { status: 500, data: { detail: "boom" } },
    });

    const client = new QueryClient();
    const { result } = renderHook(() => useUnlinkDiscord(), {
      wrapper: makeWrapper(client),
    });

    result.current.mutate();
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(toast.error).toHaveBeenCalledWith("boom");
  });
});
