import { AxiosError, AxiosHeaders } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import {
  useReportDetail,
  useReports,
  useReportSubmit,
} from "@/hooks/use-repports";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import type { User } from "@/services/types/users";

/**
 * T042/T043 (KODI-041): a rate-limited report submit shows the server's
 * own `detail` in the usual error toast instead of the fixed "Failed to
 * submit report" text (R-025); any other failure keeps that fixed text.
 */

const submitReport = vi.fn();
const fetchReports = vi.fn();
const fetchReportDetail = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    reports: {
      submitReport: (...args: unknown[]) => submitReport(...args),
      fetchReports: (...args: unknown[]) => fetchReports(...args),
      fetchReportDetail: (...args: unknown[]) => fetchReportDetail(...args),
    },
    users: { getMe: vi.fn() },
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

describe("useReportSubmit — 429 toast (T042)", () => {
  it("shows the server's detail on a 429", async () => {
    submitReport.mockRejectedValueOnce(rateLimitError());
    const { result } = renderHook(() => useReportSubmit(), {
      wrapper: wrapper(),
    });

    result.current.submit(14 as never, { hours: 2 } as never).catch(() => {});

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Too many requests. Try again in 30 seconds.",
      ),
    );
  });

  it("still shows the fixed message on a non-429 failure", async () => {
    submitReport.mockRejectedValueOnce(serverError());
    const { result } = renderHook(() => useReportSubmit(), {
      wrapper: wrapper(),
    });

    result.current.submit(14 as never, { hours: 2 } as never).catch(() => {});

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to submit report"),
    );
  });
});

/**
 * ADR-0024: the report routes answer 403 unless the BASE or PSP badge counts,
 * so the report queries stay off until the cached user holds one.
 */
const ACTIVE = {
  status: "active" as const,
  expires_at: "2026-11-05T00:00:00Z",
  email: "ada@example.com",
};
const BASE_USER: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: null,
  badges: [{ badge: "borderless_psp", granted_at: "2026-10-01T00:00:00Z" }],
  borderless: ACTIVE,
  github_restore: { available: false, prompt: false },
};

function wrapperWithUser(user: User | undefined) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (user) client.setQueryData(USER_QUERY_KEY, user);
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("report queries follow the membership badge", () => {
  beforeEach(() => {
    fetchReports.mockResolvedValue({
      reports: [],
      current_day: 0,
      current_phase: 0,
      start_date: "",
    });
    fetchReportDetail.mockResolvedValue(null);
  });

  it.each([
    ["no user cached", undefined],
    ["no recorded badge", { ...BASE_USER, badges: [] }],
    [
      "a badge whose access expired",
      { ...BASE_USER, borderless: { ...ACTIVE, status: "expired" as const } },
    ],
    [
      "a badge Borderless refused",
      {
        ...BASE_USER,
        borderless: { ...ACTIVE, status: "needs_reconnect" as const },
      },
    ],
  ])("asks for nothing with %s", async (_label, user) => {
    renderHook(() => useReports(), { wrapper: wrapperWithUser(user) });
    renderHook(() => useReportDetail(14), { wrapper: wrapperWithUser(user) });

    await settle();
    expect(fetchReports).not.toHaveBeenCalled();
    expect(fetchReportDetail).not.toHaveBeenCalled();
  });

  it("asks for the reports while the badge counts", async () => {
    renderHook(() => useReports(), { wrapper: wrapperWithUser(BASE_USER) });
    renderHook(() => useReportDetail(14), {
      wrapper: wrapperWithUser(BASE_USER),
    });

    await waitFor(() => expect(fetchReports).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(fetchReportDetail).toHaveBeenCalledTimes(1));
  });
});
