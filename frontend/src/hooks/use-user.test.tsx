import { AxiosError, AxiosHeaders } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useMutateUserProfile, useUserProfile } from "@/hooks/use-user";

/**
 * T042/T043 (KODI-041): a rate-limited profile update shows the server's
 * own `detail` in the usual error toast instead of the fixed "Failed to
 * update profile" text (R-025); any other failure keeps that fixed text.
 */

const updateMe = vi.fn();
const getMe = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    users: {
      updateMe: (...args: unknown[]) => updateMe(...args),
      getMe: (...args: unknown[]) => getMe(...args),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function rateLimitError() {
  const headers = new AxiosHeaders();
  headers.set("retry-after", "30");
  return new AxiosError(
    "Too Many Requests",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 429,
      statusText: "Too Many Requests",
      headers,
      config: {} as never,
      data: { detail: "Too many requests. Try again in 30 seconds." },
    },
  );
}

function serverError() {
  return new AxiosError(
    "Server error",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 500,
      statusText: "Internal Server Error",
      headers: new AxiosHeaders(),
      config: {} as never,
      data: { detail: "Internal error" },
    },
  );
}

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useMutateUserProfile — 429 toast (T042)", () => {
  it("shows the server's detail on a 429", async () => {
    updateMe.mockRejectedValueOnce(rateLimitError());
    const { result } = renderHook(() => useMutateUserProfile(), {
      wrapper: wrapper(),
    });

    result.current.submit({ first_name: "Ada" }).catch(() => {});

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Too many requests. Try again in 30 seconds.",
      ),
    );
  });

  it("still shows the fixed message on a non-429 failure", async () => {
    updateMe.mockRejectedValueOnce(serverError());
    const { result } = renderHook(() => useMutateUserProfile(), {
      wrapper: wrapper(),
    });

    result.current.submit({ first_name: "Ada" }).catch(() => {});

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to update profile"),
    );
  });
});

function unavailableError() {
  const headers = new AxiosHeaders();
  headers.set("retry-after", "5");
  return new AxiosError(
    "Service Unavailable",
    "ERR_BAD_RESPONSE",
    undefined,
    undefined,
    {
      status: 503,
      statusText: "Service Unavailable",
      headers,
      config: {} as never,
      data: { detail: "Session service unavailable" },
    },
  );
}

/**
 * KODI-058 (ADR-0019 "fail closed"): a `/users/me` 503 is Redis being down.
 * `useUserProfile` must not settle into `isError` (AuthContext would read
 * that as signed out); it retries after the server's `Retry-After: 5`.
 */
describe("useUserProfile — 503 is temporary (KODI-058)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    getMe.mockReset();
  });

  async function advance(ms: number) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  it("never errors on a 503 and retries after 5 s", async () => {
    getMe
      .mockRejectedValueOnce(unavailableError())
      .mockResolvedValueOnce({ id: "u1", username: "ada" });
    const { result } = renderHook(() => useUserProfile(), {
      wrapper: wrapper(),
    });

    await advance(10);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(false);
    expect(result.current.isPending).toBe(true);

    await advance(4_000);
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(result.current.isError).toBe(false);

    await advance(1_000);
    expect(getMe).toHaveBeenCalledTimes(2);
    expect(result.current.isError).toBe(false);
    expect(result.current.data).toEqual({ id: "u1", username: "ada" });
  });

  it("a 500 still settles into isError at once", async () => {
    getMe.mockRejectedValueOnce(serverError());
    const { result } = renderHook(() => useUserProfile(), {
      wrapper: wrapper(),
    });

    await advance(10);
    expect(result.current.isError).toBe(true);
    expect(getMe).toHaveBeenCalledTimes(1);
  });
});
