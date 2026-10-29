import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ReportDayPage from "./page";
import type { ReportDaysType } from "@/services/types/reports";
import type { User } from "@/services/types/users";

/** `/reports/[day]` sits behind the same membership gate as `/reports` (ADR-0024). */

let user: User | null = null;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user, isLoading: false }),
}));

vi.mock("@/services/services", () => ({
  services: { auth: { confirmMembership: vi.fn() } },
}));

const ReportDayClient = vi.fn(() => <h1>Report day</h1>);
vi.mock("./report-day-page", () => ({
  ReportDayClient: () => ReportDayClient(),
}));

const BASE: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: null,
  badges: [{ badge: "borderless_base", granted_at: "2026-10-01T00:00:00Z" }],
  borderless: {
    status: "active",
    expires_at: "2026-11-05T00:00:00Z",
    email: "ada@borderless.example",
  },
  github_restore: { available: false, prompt: false },
};

async function renderDay() {
  const element = await ReportDayPage({
    params: Promise.resolve({ day: 14 as ReportDaysType }),
  });
  render(
    <QueryClientProvider client={new QueryClient()}>
      {element}
    </QueryClientProvider>,
  );
}

describe("/reports/[day] gate", () => {
  it("explains and mounts no report without a badge", async () => {
    user = { ...BASE, badges: [] };
    ReportDayClient.mockClear();
    await renderDay();

    expect(
      screen.getByRole("heading", {
        name: "Reports are for Borderless BASE and PSP members",
      }),
    ).toBeInTheDocument();
    expect(ReportDayClient).not.toHaveBeenCalled();
  });

  it("asks for the password while the badge does not count", async () => {
    user = {
      ...BASE,
      borderless: { ...BASE.borderless!, status: "expired" },
    };
    ReportDayClient.mockClear();
    await renderDay();

    expect(
      screen.getByRole("heading", {
        name: "Sign in again to confirm your membership",
      }),
    ).toBeInTheDocument();
    expect(ReportDayClient).not.toHaveBeenCalled();
  });

  it("shows the report while the badge is held", async () => {
    user = BASE;
    await renderDay();

    expect(
      screen.getByRole("heading", { name: "Report day" }),
    ).toBeInTheDocument();
  });
});
