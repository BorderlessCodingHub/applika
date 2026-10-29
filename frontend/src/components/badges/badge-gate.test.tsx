import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { BadgeGate, BadgeGateView } from "./badge-gate";
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

describe("BadgeGateView focus after the membership is confirmed", () => {
  /** The reports render a skeleton first, then their h1 a tick later. */
  function SlowReports() {
    const [ready, setReady] = useState(false);
    useEffect(() => {
      const id = setTimeout(() => setReady(true), 30);
      return () => clearTimeout(id);
    }, []);
    return ready ? <h1>My Reports</h1> : <div>Loading reports</div>;
  }

  function renderView(state: "unconfirmed" | "held", focusable = true) {
    return (
      <BadgeGateView
        state={state}
        confirm={
          focusable ? <button type="button">Confirm membership</button> : null
        }
      >
        <SlowReports />
      </BadgeGateView>
    );
  }

  it("lands on the reports' h1 once it appears", async () => {
    const { rerender } = render(renderView("unconfirmed"));
    screen.getByRole("button", { name: "Confirm membership" }).focus();

    // The confirmed form unmounts its focused button: focus falls to body.
    rerender(renderView("held"));
    expect(document.activeElement).toBe(document.body);

    const heading = await screen.findByRole("heading", { name: "My Reports" });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(heading).toHaveAttribute("tabindex", "-1");
  });

  it("leaves focus alone when the user already moved it", async () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const { rerender } = render(renderView("unconfirmed"));

    rerender(renderView("held"));
    act(() => outside.focus());

    const heading = await screen.findByRole("heading", { name: "My Reports" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heading).not.toHaveFocus();
    expect(outside).toHaveFocus();
    outside.remove();
  });

  it("never steals focus on a first render that is already held", async () => {
    render(renderView("held"));

    const heading = await screen.findByRole("heading", { name: "My Reports" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(heading).not.toHaveFocus();
  });
});
