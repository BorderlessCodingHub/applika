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

  it("shows the Active status pill with tone=success (KODI-015 G1/G2)", () => {
    renderItem(baseApplication());
    const pill = screen.getByText("Active").closest("[data-tone]");
    expect(pill).toHaveAttribute("data-tone", "success");
  });

  it("composes accessible names with the role and company (WCAG 2.5.3, KODI-015)", () => {
    renderItem(baseApplication());
    expect(
      screen.getByRole("button", {
        name: "Edit Backend engineer at Acme",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "CV for Backend engineer at Acme",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Delete Backend engineer at Acme",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).toBeInTheDocument();
  });
});

describe("ApplicationItem — defaultExpanded (R-011, KODI-038)", () => {
  it("starts expanded when defaultExpanded is true", async () => {
    renderItem(baseApplication(), { defaultExpanded: true });
    expect(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Platform")).toBeInTheDocument();
  });

  it("starts closed when defaultExpanded is absent (today's behaviour)", () => {
    renderItem(baseApplication());
    expect(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Platform")).not.toBeInTheDocument();
  });
});

describe("ApplicationItem — archived cycle", () => {
  it("only offers CV and the chevron (page passes undefined handlers)", () => {
    renderItem(baseApplication(), {
      onEditClick: undefined,
      onFinalizeClick: undefined,
      onDeleteClick: undefined,
      onReopenClick: undefined,
    });
    expect(screen.queryByTitle("Edit")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Close")).not.toBeInTheDocument();
    expect(screen.queryByTitle("Delete")).not.toBeInTheDocument();
    expect(screen.getByTitle("CV")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /details for/i }),
    ).toBeInTheDocument();
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

  it("shows the neutral Closed status pill, not an outcome (KODI-015 G1)", () => {
    renderItem(
      baseApplication({
        finalized: true,
        finalized_at: "2026-06-10T00:00:00Z",
      }),
    );
    expect(
      screen.getAllByText(APPLICATION_CLOSED_LABEL).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Offer")).not.toBeInTheDocument();
    expect(screen.queryByText("Denied")).not.toBeInTheDocument();
    const pill = screen
      .getAllByText(APPLICATION_CLOSED_LABEL)[0]
      .closest("[data-tone]");
    expect(pill).toHaveAttribute("data-tone", "neutral");
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

describe("ApplicationItem — details tile order (KODI-015 G4/G5)", () => {
  it("renders the five image tiles first, then the extras, with Notes last", async () => {
    const user = userEvent.setup();
    renderItem(
      baseApplication({
        experience_level: "senior",
        work_mode: "remote",
        link_to_job: "https://example.com/job",
        country: "Brazil",
        currency: "USD",
        salary_period: "monthly",
        salary_range_min: 4000,
        salary_range_max: 6000,
        expected_salary: 5000,
        observation: "olar",
      }),
    );
    await user.click(screen.getByText("Backend engineer"));
    await screen.findByText("Platform");

    const dts = screen.getAllByRole("term").map((dt) => dt.textContent?.trim());
    expect(dts).toEqual([
      "Platform",
      "Source",
      "Date",
      "Experience",
      "Work Mode",
      "Job posting",
      "Country",
      "Salary Range",
      "Expected Salary",
      "Notes",
    ]);
  });
});

describe("ApplicationItem — salary display (AC22)", () => {
  it("shows the ISO currency code on the row, never a symbol", async () => {
    const user = userEvent.setup();
    renderItem(
      baseApplication({
        currency: "SEK",
        salary_period: "annually",
        salary_range_min: 50000,
        salary_range_max: 60000,
      }),
    );
    await user.click(screen.getByText("Backend engineer"));
    const label = await screen.findByText("Salary Range");
    // The value sits in the label's sibling <p> (same pattern as the
    // dashboard stat cards). Grouping is locale-dependent; the ISO prefix
    // (never a symbol) is what AC22 pins.
    const range = label.nextElementSibling;
    expect(range).toHaveTextContent("SEK");
    expect(range).toHaveTextContent(
      new Intl.NumberFormat(undefined).format(50000),
    );
    expect(range).not.toHaveTextContent(/kr/i);
  });
});
