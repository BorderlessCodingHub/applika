import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DashboardPage } from "@/app/(protected)/dashboard/dashboard-page";
import { renderInPortuguese } from "@/test/portuguese";
import type { TrendPoint } from "@/services/types/statistics";

import { trendDayLabel } from "./application-trend-chart";
import { buildConversionRows } from "./step-conversion-chart";
import { CustomTooltip } from "./chart-styles";
import { PlatformBreakdown } from "./platform-breakdown";
import { StatCards } from "./stat-cards";

/**
 * The dashboard in Portuguese: headings and card labels translated, numbers
 * with a decimal comma and dot grouping, the trend's days as DD/MM and the
 * chart stage names through `stageLabel`. Platform names are data: as sent.
 */

vi.mock("@/hooks/use-statistics", () => ({
  useGeneralStats: () => ({
    isLoading: false,
    data: {
      total_applications: 1234,
      offers: 2,
      denials: 3,
      success_rate: 33.3,
      active: 4,
    },
  }),
  usePlatformStats: () => ({
    isLoading: false,
    data: [
      { id: "p1", name: "LinkedIn Jobs", total_applications: 3 },
      { id: "p2", name: "Glassdoor", total_applications: 5 },
    ],
  }),
  useTrends: () => ({ isLoading: true, data: [] }),
  useStepConversion: () => ({ isLoading: true, data: [] }),
  useStepAvgDays: () => ({ isLoading: true, data: [] }),
  useModeStats: () => ({ isLoading: true, data: undefined }),
}));

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({ selectedCycleId: null, isViewingPastCycle: true }),
}));

function valueOf(label: string) {
  return screen.getByText(label).nextElementSibling?.textContent;
}

describe("dashboard in Portuguese", () => {
  it("writes the stat numbers the Brazilian way", async () => {
    await renderInPortuguese(<StatCards />);

    expect(valueOf("Total")).toBe("1.234");
    expect(valueOf("Taxa de sucesso")).toBe("33,3%");
    expect(valueOf("Ativas")).toBe("4");
    expect(valueOf("Ofertas")).toBe("2");
    expect(valueOf("Recusas")).toBe("3");
  });

  it("keeps the English numbers byte-identical", () => {
    render(<StatCards />);

    expect(valueOf("Total")).toBe("1234");
    expect(valueOf("Success Rate")).toBe("33.3%");
  });

  it("translates the page headings", async () => {
    await renderInPortuguese(<DashboardPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Painel" }),
    ).toBeVisible();
    expect(screen.getByText("Vendo um ciclo arquivado")).toBeVisible();
    expect(screen.getByText("Tendência de candidaturas")).toBeVisible();
    expect(screen.getByText("Conversão por etapa")).toBeVisible();
    expect(screen.getByText("Média de dias / etapa")).toBeVisible();
    expect(screen.getByText("Por plataforma")).toBeVisible();
    expect(screen.getByText("Ativas x passivas")).toBeVisible();
  });

  it("shows platform names as sent, with Portuguese percentages", async () => {
    await renderInPortuguese(<PlatformBreakdown />);

    expect(screen.getByText("LinkedIn Jobs")).toBeVisible();
    expect(screen.getByText("Glassdoor")).toBeVisible();
    expect(screen.getByText("62,5%")).toBeVisible();
    expect(screen.getByText("37,5%")).toBeVisible();
  });

  it("formats a tooltip number by language", async () => {
    const payload = [{ value: 3.5, name: "x", payload: {} }];
    await renderInPortuguese(
      <CustomTooltip active payload={payload as never} label="Triagem" />,
    );
    expect(screen.getByText("3,5")).toBeVisible();
  });

  it("writes the trend's days as DD/MM in Portuguese and MM-DD in English", () => {
    const point: TrendPoint = {
      application_date: "2026-10-05",
      total_applications: 2,
      label: "10-05",
    };
    expect(trendDayLabel(point, "pt-BR")).toBe("05/10");
    expect(trendDayLabel(point, "en")).toBe("10-05");
  });

  it("labels the chart stages through the translated stageLabel", async () => {
    await renderInPortuguese(<span />);
    const rows = buildConversionRows([]);
    expect(rows[0].fullLabel).toBe("Entrevista - Desconhecida");
    expect(rows.map((r) => r.shortLabel)).toContain("Triagem");
  });
});
