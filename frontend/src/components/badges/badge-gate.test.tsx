import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadgeGate, BadgeGateView } from "./badge-gate";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import { useReports } from "@/hooks/use-repports";
import { services } from "@/services/services";
import type { User } from "@/services/types/users";

/**
 * The Reports gate (ADR-0024, ADR-0026): no recorded badge explains why
 * Reports are closed; a recorded badge while Borderless refuses applika's
 * grant shows the API's AUTH-1050 words and "Sign in again" (never a password
 * form); a held badge shows the reports. The children (which call the report
 * hooks) mount only while held, and a report request answered 403 AUTH-1050
 * flips the gate.
 */

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  isLoading: false,
}));

// `useAuth().user` is the cached `/users/me`, as in `AuthProvider`.
vi.mock("@/contexts/auth-context", async () => {
  const { useQuery } = await import("@tanstack/react-query");
  return {
    useAuth: () => {
      const { data } = useQuery<User | null>({
        queryKey: ["user", "me"],
        queryFn: () => null,
        enabled: false,
      });
      return {
        user: data ?? null,
        isLoading: mocks.isLoading,
        logout: mocks.logout,
      };
    },
  };
});

vi.mock("@/services/services", () => ({
  services: { reports: { fetchReports: vi.fn() } },
}));

const ACTIVE = {
  status: "active" as const,
  email: "ada@borderless.example",
  checked_at: "2026-11-06T10:00:00Z",
};
const BASE: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: null,
  badges: [{ badge: "borderless_base", granted_at: "2026-10-01T00:00:00Z" }],
  borderless: ACTIVE,
  github_restore: { available: false, prompt: false },
};
const RECONNECT: User = {
  ...BASE,
  borderless: { ...ACTIVE, status: "needs_reconnect" },
};

const AUTH_1050 =
  "Your Borderless sign-in has ended. Sign in again on the applika website to use member features";

const Reports = vi.fn(() => <h1>Biweekly reports</h1>);

function renderGate(user: User | null, children = <Reports />) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  if (user) client.setQueryData(USER_QUERY_KEY, user);
  render(
    <QueryClientProvider client={client}>
      <BadgeGate>{children}</BadgeGate>
    </QueryClientProvider>,
  );
  return client;
}

function gate() {
  return document.querySelector('[data-slot="badge-gate"]');
}

function refusal(status: number, data: unknown) {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data,
  });
}

beforeEach(() => {
  Reports.mockClear();
  mocks.logout.mockReset();
  mocks.isLoading = false;
  vi.mocked(services.reports.fetchReports).mockReset();
});

describe("BadgeGate", () => {
  it("held: shows the reports", () => {
    renderGate(BASE);

    expect(gate()).toHaveAttribute("data-state", "held");
    expect(
      screen.getByRole("heading", { name: "Biweekly reports" }),
    ).toBeInTheDocument();
  });

  it("no recorded badge: explains why, mounts no reports", () => {
    renderGate({ ...BASE, badges: [] });

    expect(gate()).toHaveAttribute("data-state", "none");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Reports are for Borderless BASE and PSP members",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/has no BASE or PSP membership on record/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Visit Borderless" }),
    ).toHaveAttribute("href", "https://borderlesscoding.com");
    expect(Reports).not.toHaveBeenCalled();
  });

  it("needs_reconnect: the AUTH-1050 words and Sign in again, never a password form (AC16)", () => {
    renderGate(RECONNECT);

    expect(gate()).toHaveAttribute("data-state", "needs_reconnect");
    const heading = screen.getByRole("heading", {
      level: 1,
      name: "Sign in again to open your reports",
    });
    expect(heading).toHaveFocus();
    expect(screen.getByText(AUTH_1050)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in again" }),
    ).toHaveAccessibleDescription(AUTH_1050);
    expect(document.querySelectorAll("input")).toHaveLength(0);
    expect(screen.queryByLabelText(/Password/i)).not.toBeInTheDocument();
    expect(Reports).not.toHaveBeenCalled();
  });

  it("Sign in again ends this session and opens /login", async () => {
    renderGate(RECONNECT);

    await userEvent.click(
      screen.getByRole("button", { name: "Sign in again" }),
    );

    expect(mocks.logout).toHaveBeenCalledWith("/login");
  });

  it("loading: a status spinner, no reports", () => {
    mocks.isLoading = true;
    renderGate(null);

    expect(gate()).toHaveAttribute("data-state", "loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(Reports).not.toHaveBeenCalled();
  });
});

describe("BadgeGate: a report request answered 403 AUTH-1050 (AC16)", () => {
  function ReportList() {
    const { isLoading } = useReports();
    return isLoading ? <div>Loading reports</div> : <h1>My Reports</h1>;
  }

  it("flips to its words and Sign in again", async () => {
    vi.mocked(services.reports.fetchReports).mockRejectedValue(
      refusal(403, { detail: AUTH_1050, code: "AUTH-1050" }),
    );
    const client = renderGate(BASE, <ReportList />);

    await waitFor(() =>
      expect(gate()).toHaveAttribute("data-state", "needs_reconnect"),
    );
    expect(screen.getByText(AUTH_1050)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign in again" }),
    ).toBeInTheDocument();
    expect(client.getQueryData<User>(USER_QUERY_KEY)?.borderless?.status).toBe(
      "needs_reconnect",
    );
    expect(services.reports.fetchReports).toHaveBeenCalledTimes(1);
  });

  it("RPT-1001 leaves the cached user alone", async () => {
    vi.mocked(services.reports.fetchReports).mockRejectedValue(
      refusal(403, {
        detail: "Reports are for Borderless BASE and PSP members",
        code: "RPT-1001",
      }),
    );
    const client = renderGate(BASE, <ReportList />);

    // The request settled: the list stops loading, the gate stays open.
    expect(
      await screen.findByRole("heading", { name: "My Reports" }),
    ).toBeInTheDocument();
    expect(services.reports.fetchReports).toHaveBeenCalledTimes(1);
    expect(gate()).toHaveAttribute("data-state", "held");
    expect(client.getQueryData<User>(USER_QUERY_KEY)?.borderless?.status).toBe(
      "active",
    );
  });
});

describe("BadgeGateView", () => {
  it("leaves focus alone when the user is already somewhere", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();

    render(
      <BadgeGateView state="needs_reconnect" onSignInAgain={vi.fn()}>
        <Reports />
      </BadgeGateView>,
    );

    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("mounts the children only while held", () => {
    const { rerender } = render(
      <BadgeGateView state="needs_reconnect" onSignInAgain={vi.fn()}>
        <Reports />
      </BadgeGateView>,
    );
    expect(Reports).not.toHaveBeenCalled();

    rerender(
      <BadgeGateView state="held" onSignInAgain={vi.fn()}>
        <Reports />
      </BadgeGateView>,
    );
    expect(
      screen.getByRole("heading", { name: "Biweekly reports" }),
    ).toBeInTheDocument();
  });
});
