import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgendaRoute from "@/app/(protected)/agenda/page";
import ApplicationsRoute from "@/app/(protected)/applications/page";
import DashboardRoute from "@/app/(protected)/dashboard/page";
import InsightsRoute from "@/app/(protected)/insights/page";
import type { AgendaStep, Application } from "@/services/types/applications";
import { pathname, setLocation } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * Today, Pipeline, the quick add, the Application screen, the Agenda and
 * Insights in Portuguese: the boards' words and the reused ones follow the
 * language, with no English left on the phone screen.
 */

const mocks = vi.hoisted(() => ({
  getApplications: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("@/contexts/agenda-notifications-context", () => ({
  useAgendaNotifications: () => ({ toggle: vi.fn(), isEnabled: () => false }),
}));

const NOW = new Date(2026, 10, 11, 9, 0);

const AGENDA: AgendaStep[] = [
  {
    id: "e1",
    step_date: "2026-11-11",
    event_type: "interview",
    interview_type: "technical",
    start_time: "14:00:00",
    end_time: "15:00:00",
    application_id: "a1",
    company_name: "Northwind Labs",
    role: "Engenheira de backend",
  },
  {
    id: "e2",
    step_date: "2026-11-12",
    event_type: "interview",
    interview_type: "initial_screening",
    start_time: "11:00:00",
    application_id: "a2",
    company_name: "Lumen Health",
    role: "Staff",
  },
];

const APPS: Application[] = [
  {
    id: "a1",
    company_id: null,
    company_name: "Northwind Labs",
    platform_id: "p1",
    role: "Engenheira de backend",
    mode: "active",
    application_date: "2026-10-01",
    work_mode: "remote",
    finalized: false,
    finalized_at: null,
    last_step: { id: "s", name: "Phase 2", color: "#000", date: "2026-10-20" },
  },
  {
    id: "a2",
    company_id: null,
    company_name: "Lumen Health",
    platform_id: "p1",
    role: "Staff",
    mode: "active",
    application_date: "2026-11-01",
    finalized: true,
    finalized_at: "2026-11-05T00:00:00Z",
    last_step: { id: "s", name: "Denied", color: "#000", date: "2026-11-05" },
  },
];

vi.mock("@/services/services", () => ({
  services: {
    applications: { getApplications: mocks.getApplications },
    applicationDrafts: { list: () => Promise.resolve([]) },
    statistics: {
      getGeneralStats: () =>
        Promise.resolve({
          total_applications: 34,
          success_rate: 5.9,
          offers: 2,
          denials: 9,
          active: 12,
        }),
      getStepConversion: () => Promise.resolve([]),
      getStepAvgDays: () => Promise.resolve([]),
      getModeStats: () => Promise.resolve({ active: 28, passive: 6 }),
    },
    users: { getAgenda: () => Promise.resolve(AGENDA) },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
    platforms: {
      list: () => Promise.resolve([{ id: "p1", name: "LinkedIn", url: null }]),
    },
    timeline: { list: () => Promise.resolve([]) },
  },
}));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.getApplications.mockReset().mockResolvedValue(APPS);
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderIn(path: string, page: React.ReactNode) {
  pathname.current = path;
  return renderPhoneScreen(path, page, { locale: "pt-BR" });
}

describe("the core phone screens in Portuguese", () => {
  it("Today: the greeting, the next interview, the numbers, attention and Coming up", async () => {
    await renderIn("/dashboard", <DashboardRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Bom dia, Sam" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Quarta-feira, 11 de novembro"),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Próxima entrevista · em 5 h"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Entrevista técnica" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abrir" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar ao calendário" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Ativas")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Precisa da sua atenção" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Sem atualização há 22 dias"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Atualizar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Encerrar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "A seguir" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Triagem inicial" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conta" })).toHaveTextContent("SC");
    expect(screen.queryByText(/Needs your attention|Coming up/)).toBeNull();
  });

  it("Pipeline and the quick add", async () => {
    const user = userEvent.setup();
    setLocation("/applications");
    await renderIn("/applications", <ApplicationsRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Funil" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Ciclo atual · 2 candidaturas"),
    ).toBeInTheDocument();
    const pills = within(screen.getByRole("tablist")).getAllByRole("tab");
    expect(pills.map((pill) => pill.textContent)).toEqual([
      "Todas 2",
      "Técnica 1",
      "Triagem 0",
      "Enviada 0",
      "Oferta 0",
      "Encerrada 1",
    ]);
    expect(screen.getByText("Parada")).toBeInTheDocument();
    expect(screen.getByText("Recusada")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Buscar candidaturas" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Adicionar" }));
    const sheet = screen.getByRole("dialog", { name: "Adicionar candidatura" });
    expect(
      within(sheet).getByRole("radiogroup", {
        name: "Onde você se candidatou?",
      }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Adicionar ao funil" }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "Hoje" })).toBeChecked();
  });

  it("the Application screen", async () => {
    setLocation("/applications?focus=a1");
    await renderIn("/applications", <ApplicationsRoute />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Northwind Labs" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Funil" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Mais ações" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Histórico" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Remoto")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Atualizar" }),
    ).toBeInTheDocument();
    expect(
      document.querySelector('[data-action="close-application"]'),
    ).toHaveTextContent("Encerrar");
  });

  it("the Agenda", async () => {
    await renderIn("/agenda", <AgendaRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Agenda" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Novembro de 2026")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Semana anterior" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("em 5 h")).toBeInTheDocument();
    expect(screen.getByText("Técnica")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Depois" })).toBeInTheDocument();
  });

  it("Insights", async () => {
    pathname.current = "/insights";
    await renderIn("/insights", <InsightsRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Ciclo atual" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Taxa de sucesso" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("5,9%")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Funil de etapas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Enviada → Triagem")).toBeInTheDocument();
    expect(screen.getByText("Triagem → Técnica")).toBeInTheDocument();
    expect(screen.getByText("Técnica → Oferta")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Ativas x passivas" }),
    ).toBeInTheDocument();
  });
});
