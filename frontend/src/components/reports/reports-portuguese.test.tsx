import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";
import type { ReportDetailResponse } from "@/services/types/reports";

import { ReportForm } from "./report-form";
import { ReportsList } from "./report-list";
import { ReportReadOnly, formatReportDay } from "./report-view";

/**
 * The reports in Portuguese: the list, the form (its calendar names the month
 * in Portuguese) and the read-only report, with their numbers and dates
 * written the Brazilian way. What the user typed stays as typed.
 */

vi.mock("@/hooks/use-repports", () => ({
  useReports: () => ({
    reports: [
      { day: 1, status: "submitted", submitted_at: "2026-10-01T00:00:00Z" },
      { day: 14, status: "pending", submitted_at: null },
      { day: 28, status: "future", submitted_at: null },
    ],
    currentDay: 15,
    isLoading: false,
  }),
  useReportSubmit: () => ({ submit: vi.fn(), isSubmitting: false }),
}));

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({ selectedCycleId: null, isViewingPastCycle: false }),
}));

const REPORT: ReportDetailResponse = {
  report: { day: 1, phase: 1, submitted: false, submitted_at: null },
  can_submit: true,
  period: { start_date: "2026-10-01", end_date: "2026-10-14" },
  metrics: {
    applications_count: 12,
    initial_screenings_count: 3,
    interviews_completed_fortnight: 2,
    active_processes_count: 4,
    offers_count: 1,
    total_applications_count: 1234,
    callback_rate: 0.255,
    offer_rate: 0.031,
    overall_conversion_rate: 0.1,
    total_initial_screenings_count: 3,
  },
  manual_metrics: {
    mock_interviews_count: 2,
    linkedin_posts_count: 1,
    strategic_connections_count: 5,
    biggest_win: "Got the Acme final round",
    biggest_challenge: "Take-home tests",
    next_fortnight_goal: "Close one offer",
  },
};

describe("reports in Portuguese", () => {
  it("lists the reports with Portuguese words and statuses", async () => {
    await renderInPortuguese(
      <ReportsList onFillReport={vi.fn()} onViewReport={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", { name: "Meus relatórios — 120 dias" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Você está no/)).toHaveTextContent(
      "Você está no dia 15 do desafio",
    );
    expect(screen.getByText("Dica")).toBeInTheDocument();
    expect(screen.getByText("Atuais")).toBeInTheDocument();
    expect(screen.getByText("Próximos")).toBeInTheDocument();
    expect(screen.getByText("Dia 14")).toBeInTheDocument();
    expect(screen.getAllByText("Fase 1")).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Preencher" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Ver" })).toBeVisible();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
    // Legend + the row badge.
    expect(screen.getAllByText("Pendente").length).toBeGreaterThan(1);
    expect(screen.queryByText("Fill Report")).toBeNull();
  });

  it("names the calendar's month in Portuguese in the form", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(
      <ReportForm
        dayInterval={1}
        reportData={REPORT}
        onStartDateChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Relatório — dia 1 de 120" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Métricas calculadas automaticamente"),
    ).toBeVisible();
    // 25.5%, 3.1% and 1234 written the Brazilian way.
    expect(screen.getByText("1.234")).toBeInTheDocument();
    expect(screen.getByText("25,5%")).toBeInTheDocument();
    expect(screen.getByText("3,1%")).toBeInTheDocument();
    expect(screen.getByText("Início do desafio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enviar relatório" }),
    ).toBeVisible();
    // The user's own words are never translated.
    expect(screen.getByDisplayValue("Got the Acme final round")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /2026-10-01/ }));
    const calendar = await screen.findByRole("grid");
    expect(calendar).toHaveAccessibleName(/outubro/i);
    expect(screen.getByText(/outubro 2026/i)).toBeInTheDocument();
    expect(screen.queryByText(/October/)).toBeNull();
  });

  it("validates in Portuguese", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(
      <ReportForm
        dayInterval={1}
        reportData={{
          ...REPORT,
          manual_metrics: { ...REPORT.manual_metrics!, biggest_win: "" },
        }}
        onStartDateChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Enviar relatório" }));
    expect(
      await screen.findByText("A maior conquista é obrigatória"),
    ).toBeInTheDocument();
  });

  it("writes the read-only report's start day as DD/MM/YYYY", async () => {
    await renderInPortuguese(
      <ReportReadOnly dayInterval={14} reportData={REPORT} />,
    );

    expect(screen.getByDisplayValue("01/10/2026")).toBeInTheDocument();
    expect(screen.getByText("Voltar aos relatórios")).toBeInTheDocument();
    expect(screen.getByText("Fase 1")).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeVisible();
  });

  it("keeps the English report words and ISO day unchanged", () => {
    render(<ReportReadOnly dayInterval={14} reportData={REPORT} />);

    expect(screen.getByDisplayValue("2026-10-01")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Report — Day 14 of 120" }),
    ).toBeInTheDocument();
    const totals = screen
      .getByText("Total Applications")
      .closest("div")!.parentElement!;
    expect(within(totals).getByText("1234")).toBeInTheDocument();
    expect(screen.getByText("25.5%")).toBeInTheDocument();
    expect(formatReportDay(undefined, "en")).toBe("—");
  });
});
