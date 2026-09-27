import { AxiosError, AxiosHeaders } from "axios";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "@/contexts/auth-context";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

/**
 * T043 (KODI-041): a 429 on the auth refresh (or the /users/me refetch
 * behind it) is temporary — the session must stay signed in and the query
 * must retry after the server's own `Retry-After`, never flip to
 * `isAuthError`/`isUserError`. A real 401 keeps today's behaviour.
 *
 * Uses fake timers throughout, so every wait is a manual `flush()` — a
 * `waitFor` from Testing Library polls with the REAL `setTimeout`, which
 * fake timers replace, and would hang until the suite's own real-time
 * timeout.
 */

vi.mock("@/services/services", () => ({
  services: {
    auth: { refresh: vi.fn() },
    users: { getMe: vi.fn() },
  },
}));

// React (the scheduler package) settles a batched update through a real
// timer tick, not a bare microtask — `advanceTimersByTimeAsync(0)` alone
// never lets the render commit under fake timers. A tiny nonzero advance
// on top of whatever the caller asks for is enough to drain it.
async function flush(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms + 10);
  });
}

function rateLimitError(retryAfterSeconds: number) {
  const headers = new AxiosHeaders();
  headers.set("retry-after", String(retryAfterSeconds));
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

function unauthorizedError() {
  return new AxiosError(
    "Unauthorized",
    "ERR_BAD_REQUEST",
    undefined,
    undefined,
    {
      status: 401,
      statusText: "Unauthorized",
      headers: new AxiosHeaders(),
      config: {} as never,
      data: { detail: "Not authenticated" },
    },
  );
}

function user(): User {
  return {
    id: "u-1",
    username: "octocat",
    email: "octocat@example.com",
    github_id: "1",
    discord: null,
    discord_linked: false,
  };
}

function AuthState() {
  const { isLoading, isAuthenticated } = useAuth();
  return (
    <div>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="authenticated">{String(isAuthenticated)}</span>
    </div>
  );
}

function renderAuth() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 5 * 60 * 1000 } },
  });
  render(
    <QueryClientProvider client={client}>
      <AuthProvider>
        <AuthState />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("AuthProvider — 429 handling (T040/T041)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("a refresh 429 with Retry-After 30 keeps a cached session authenticated, and retries at 30s", async () => {
    vi.mocked(services.auth.refresh)
      .mockResolvedValueOnce({ detail: "refreshed" }) // initial success
      .mockRejectedValueOnce(rateLimitError(30)) // then 429
      .mockResolvedValueOnce({ detail: "refreshed" }); // retry succeeds
    vi.mocked(services.users.getMe).mockResolvedValue(user());

    renderAuth();
    await flush();

    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(services.auth.refresh).toHaveBeenCalledTimes(1);

    // Poll interval is 10 minutes; force the next refresh — which will 429.
    await flush(10 * 60_000);
    expect(services.auth.refresh).toHaveBeenCalledTimes(2);

    // While the 429 retry is pending, the session must stay authenticated.
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("loading").textContent).toBe("false");

    // Retry-After is 30s: nothing happens before that.
    await flush(29_000);
    expect(services.auth.refresh).toHaveBeenCalledTimes(2);

    await flush(1_000);
    expect(services.auth.refresh).toHaveBeenCalledTimes(3);
    expect(screen.getByTestId("authenticated").textContent).toBe("true");
  });

  it("a cold-load 429 stays loading, then authenticated once the retry succeeds", async () => {
    vi.mocked(services.auth.refresh)
      .mockRejectedValueOnce(rateLimitError(1))
      .mockResolvedValueOnce({ detail: "refreshed" });
    vi.mocked(services.users.getMe).mockResolvedValue(user());

    renderAuth();
    await flush();

    // Cold load: no cached data yet, so the 429 must not redirect — isLoading
    // stays true rather than the query settling into isError.
    expect(services.auth.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("loading").textContent).toBe("true");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");

    await flush(1_000);

    expect(screen.getByTestId("authenticated").textContent).toBe("true");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("a real 401 is not authenticated", async () => {
    vi.mocked(services.auth.refresh).mockRejectedValue(unauthorizedError());
    vi.mocked(services.users.getMe).mockResolvedValue(user());

    renderAuth();
    await flush();

    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
  });

  it("a /users/me 429 keeps the session authenticated", async () => {
    vi.mocked(services.auth.refresh).mockResolvedValue({ detail: "refreshed" });
    vi.mocked(services.users.getMe)
      .mockRejectedValueOnce(rateLimitError(1))
      .mockResolvedValueOnce(user());

    renderAuth();
    await flush();

    expect(services.users.getMe).toHaveBeenCalledTimes(1);
    // The profile refetch 429'd, but auth itself is fine — the session must
    // not be reported as signed out while the retry is pending.
    expect(screen.getByTestId("authenticated").textContent).toBe("false");
    expect(screen.getByTestId("loading").textContent).toBe("true");

    await flush(1_000);

    expect(screen.getByTestId("authenticated").textContent).toBe("true");
  });
});
