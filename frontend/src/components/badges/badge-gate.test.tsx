import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadgeGate } from "./badge-gate";
import type { User } from "@/services/types/users";

/**
 * The Reports gate (ADR-0024): no recorded badge explains why Reports are
 * closed; a recorded badge that does not count shows the Borderless password
 * form instead of reports; a held badge shows the reports. The children
 * (which call the report hooks) mount only while held.
 */

const ACTIVE = {
  status: "active" as const,
  expires_at: "2026-11-05T00:00:00Z",
  email: "ada@borderless.example",
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

let auth: { user: User | null; isLoading: boolean } = {
  user: BASE,
  isLoading: false,
};

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

vi.mock("@/services/services", () => ({
  services: { auth: { confirmMembership: vi.fn() } },
}));

const Reports = vi.fn(() => <h1>Biweekly reports</h1>);

function renderGate() {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>
      <BadgeGate>
        <Reports />
      </BadgeGate>
    </QueryClientProvider>,
  );
}

function gate() {
  return document.querySelector('[data-slot="badge-gate"]');
}

beforeEach(() => {
  Reports.mockClear();
});

describe("BadgeGate", () => {
  it("held: shows the reports", () => {
    auth = { user: BASE, isLoading: false };
    renderGate();

    expect(gate()).toHaveAttribute("data-state", "held");
    expect(
      screen.getByRole("heading", { name: "Biweekly reports" }),
    ).toBeInTheDocument();
  });

  it("no recorded badge: explains why, mounts no reports", () => {
    auth = { user: { ...BASE, badges: [] }, isLoading: false };
    renderGate();

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

  it.each(["expired", "needs_reconnect"] as const)(
    "%s: the password form instead of reports",
    (status) => {
      auth = {
        user: { ...BASE, borderless: { ...ACTIVE, status } },
        isLoading: false,
      };
      renderGate();

      expect(gate()).toHaveAttribute("data-state", "unconfirmed");
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Sign in again to confirm your membership",
        }),
      ).toBeInTheDocument();
      expect(screen.getByLabelText("Password")).toHaveFocus();
      expect(
        screen.getByRole("button", { name: "Confirm membership" }),
      ).toBeInTheDocument();
      expect(Reports).not.toHaveBeenCalled();
    },
  );

  it("loading: a status spinner, no reports", () => {
    auth = { user: null, isLoading: true };
    renderGate();

    expect(gate()).toHaveAttribute("data-state", "loading");
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(Reports).not.toHaveBeenCalled();
  });
});
