import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { ApplicationItem } from "@/components/applications/application-item";
import { APPLICATION_CLOSED_LABEL } from "@/components/applications/application-close-copy";
import type { Application } from "@/services/types/applications";
import { services } from "@/services/services";

/**
 * PRD 0008 / ADR 0012 (T046): the closed badge + Reopen affordance, both
 * derived purely from `finalized_at`. A closed application hides Add/Edit/
 * Close and offers Reopen instead (the CV link always stays); an open one
 * shows Edit/Close and no Reopen. Delete stays available EITHER way — the
 * API only refuses deleting an ARCHIVED application
 * (`DeleteApplicationUseCase`), not a closed one, and the design spec only
 * calls for Add/Edit/Close to hide when closed.
 */

vi.mock("@/contexts/supports-context", () => ({
  useSupports: () => ({
    supports: { platforms: [{ id: "p-1", name: "LinkedIn" }] },
    isLoading: false,
  }),
}));

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({
    selectedCycleId: null,
    setSelectedCycleId: () => {},
    isViewingPastCycle: false,
  }),
}));

vi.mock("@/services/services", () => ({
  services: {
    timeline: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

function baseApplication(overrides: Partial<Application> = {}): Application {
  return {
    id: "app-1",
    company_id: "c-1",
    company_name: "Acme",
    platform_id: "p-1",
    role: "Backend engineer",
    mode: "active",
    application_date: "2026-06-01",
    finalized: false,
    finalized_at: null,
    ...overrides,
  };
}

function renderItem(app: Application, extraProps = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  return render(
    <ApplicationItem
      app={app}
      onEditClick={() => {}}
      onFinalizeClick={() => {}}
      onDeleteClick={() => {}}
      onReopenClick={() => {}}
      {...extraProps}
    />,
    { wrapper: Wrapper },
  );
}

describe("ApplicationItem — open application", () => {
  it("shows Edit and Close, no closed badge, no Reopen", () => {
    renderItem(baseApplication());
    expect(
      screen.queryByText(APPLICATION_CLOSED_LABEL),
    ).not.toBeInTheDocument();
    expect(screen.getAllByTitle("Edit").length).toBeGreaterThan(0);
    expect(screen.getAllByTitle("Close").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", { name: /reopen/i }),
    ).not.toBeInTheDocument();
  });
});

describe("ApplicationItem — closed application", () => {
  it("shows the closed badge and Reopen; hides Add/Edit/Close", () => {
    renderItem(
      baseApplication({
        finalized: true,
        finalized_at: "2026-06-10T00:00:00Z",
      }),
    );
    expect(
      screen.getAllByText(APPLICATION_CLOSED_LABEL).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /reopen backend engineer at acme/i }),
    ).toBeInTheDocument();
    expect(screen.queryByTitle("Edit")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();
  });

  it("keeps the CV link even when closed", () => {
    renderItem(
      baseApplication({
        finalized: true,
        finalized_at: "2026-06-10T00:00:00Z",
      }),
    );
    expect(screen.getByTitle("CV")).toBeInTheDocument();
  });

  it("keeps Delete even when closed (only archived applications refuse delete)", () => {
    renderItem(
      baseApplication({
        finalized: true,
        finalized_at: "2026-06-10T00:00:00Z",
      }),
    );
    expect(screen.getByTitle("Delete")).toBeInTheDocument();
  });

  it("expanding a closed application's timeline shows no Add event button", async () => {
    const user = userEvent.setup();
    renderItem(
      baseApplication({
        finalized: true,
        finalized_at: "2026-06-10T00:00:00Z",
      }),
    );
    // Expand: click the row (any element inside the clickable header area).
    await user.click(screen.getByText("Backend engineer"));
    expect(
      await screen.findByText(/this application is closed/i),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /add event/i }),
    ).not.toBeInTheDocument();
    expect(services.timeline.list).toHaveBeenCalledWith("app-1");
  });
});
