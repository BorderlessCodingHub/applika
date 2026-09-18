import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SupportsPage } from "./supports-page";
import { services } from "@/services/services";

/**
 * PRD 0008 / ADR 0012, R-021: admins can no longer create, edit or delete step
 * or feedback definitions. Pins T045/T046 — the admin supports page has no
 * step/feedback section, only Platforms.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getPlatforms: vi.fn(),
    },
  },
}));

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SupportsPage />
    </QueryClientProvider>,
  );
}

describe("SupportsPage", () => {
  it("shows only the Platforms section — no step or feedback definitions", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue([
      { id: "1", name: "LinkedIn", url: "https://linkedin.com" },
    ]);

    renderPage();

    await waitFor(() =>
      expect(screen.getByText("LinkedIn")).toBeInTheDocument(),
    );

    expect(screen.getByText("Add Platform")).toBeInTheDocument();
    expect(screen.queryByText("Step Definitions")).not.toBeInTheDocument();
    expect(screen.queryByText("Feedback Definitions")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Step")).not.toBeInTheDocument();
    expect(screen.queryByText("Add Feedback")).not.toBeInTheDocument();
  });
});
