import { AxiosError, AxiosHeaders } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { useMutateUserProfile } from "@/hooks/use-user";

/**
 * T042/T043 (KODI-041): a rate-limited profile update shows the server's
 * own `detail` in the usual error toast instead of the fixed "Failed to
 * update profile" text (R-025); any other failure keeps that fixed text.
 */

const updateMe = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    users: {
      updateMe: (...args: unknown[]) => updateMe(...args),
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
