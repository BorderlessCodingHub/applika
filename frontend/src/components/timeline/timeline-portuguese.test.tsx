import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TimelineEventForm } from "@/components/timeline/timeline-event-form";
import { TimelineSection } from "@/components/timeline/timeline-section";
import { services } from "@/services/services";
import type { Application } from "@/services/types/applications";
import type { TimelineEvent } from "@/services/types/timeline";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The timeline in Portuguese: the panel, its cards (stage, type, reason,
 * dates and salary written the pt-BR way), the event dialog in add and close
 * mode with a validation message, and a toast. The user's notes stay as sent.
 * English is asserted, unchanged, by the timeline's existing tests.
 */

vi.mock("@/contexts/cycle-context", () => ({
  useCycleContext: () => ({
    selectedCycleId: null,
    setSelectedCycleId: () => {},
    isViewingPastCycle: false,
  }),
}));

const toastError = vi.fn();
const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: (...args: unknown[]) => toastSuccess(...args),
  },
}));

vi.mock("@/services/services", () => ({
  services: {
    timeline: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

const application: Application = {
  id: "app-1",
  company_id: "c-1",
  company_name: "Acme",
  platform_id: "p-1",
  role: "Backend engineer",
  mode: "active",
  application_date: "2026-06-01",
  finalized: false,
  finalized_at: null,
};

function event(overrides: Partial<TimelineEvent>): TimelineEvent {
  return {
    id: "e-1",
    application_id: "app-1",
    user_id: "u-1",
    event_type: "interview",
    interview_type: null,
    denied_reason: null,
    event_date: "2026-07-03",
    start_time: null,
    end_time: null,
    timezone: null,
    observation: null,
    salary_period: null,
    salary_amount: null,
    salary_currency: null,
    created_at: "2026-07-03T00:00:00Z",
    updated_at: null,
    ...overrides,
  };
}

function withQueries({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  toastError.mockReset();
  toastSuccess.mockReset();
});

async function renderSection(events: TimelineEvent[]) {
  vi.mocked(services.timeline.list).mockResolvedValue(events);
  await renderInPortuguese(<TimelineSection application={application} />, {
    wrapper: withQueries,
  });
  await screen.findByRole("heading", { name: "Linha do tempo" });
}

describe("timeline in Portuguese", () => {
  it("writes the panel and its cards in Portuguese, notes as sent", async () => {
    await renderSection([
      event({
        id: "e-3",
        event_type: "interview",
        interview_type: "technical",
        event_date: "2026-07-03",
        start_time: "10:00",
        end_time: "11:00",
        timezone: "America/Sao_Paulo",
        observation: "Bring the portfolio",
      }),
      event({
        id: "e-2",
        event_type: "offer",
        event_date: "2026-07-02",
        salary_amount: "160000",
        salary_currency: "BRL",
        salary_period: "monthly",
      }),
      event({
        id: "e-1",
        event_type: "denied",
        denied_reason: "salary_mismatch",
        event_date: "2026-07-01",
      }),
    ]);

    expect(
      screen.getByText(
        "Acompanhe o progresso da candidatura ao longo do processo seletivo.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar evento" }),
    ).toBeInTheDocument();

    // Stage, type and reason vocabulary.
    expect(screen.getByText("Entrevista")).toBeInTheDocument();
    expect(screen.getByText("Oferta")).toBeInTheDocument();
    expect(screen.getByText("Recusada")).toBeInTheDocument();
    expect(screen.getByText("Técnica")).toBeInTheDocument();
    expect(screen.getByText(/Tipo de entrevista:/)).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, node) =>
          node?.textContent === "Feedback: Salário incompatível" &&
          node.tagName === "P",
      ),
    ).toBeInTheDocument();

    // Dates and amounts the way Portuguese writes them.
    expect(screen.getByText("sex., 3 de jul. de 2026")).toBeInTheDocument();
    expect(screen.getByText("qua., 1 de jul. de 2026")).toBeInTheDocument();
    expect(screen.getByText(/BRL 160\.000 \/mês/)).toBeInTheDocument();
    expect(screen.getByText(/Salário oferecido:/)).toBeInTheDocument();

    // The user's note is never translated.
    expect(screen.getByText("Bring the portfolio")).toBeInTheDocument();

    // The card menu's accessible name, and its items.
    const menu = screen.getByRole("button", {
      name: "Ações do evento: Entrevista - Técnica, sex., 3 de jul. de 2026",
    });
    await userEvent.setup().click(menu);
    expect(
      await screen.findByRole("menuitem", { name: "Editar" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Excluir" }),
    ).toBeInTheDocument();
  });

  it("says the timeline is empty in Portuguese", async () => {
    await renderSection([]);
    expect(screen.getByText("Nenhum evento ainda")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Registre entrevistas, ofertas e recusas para contar a história desta candidatura.",
      ),
    ).toBeInTheDocument();
  });

  it("writes the add dialog in Portuguese: labels, a validation message, the close box, the toast", async () => {
    const user = userEvent.setup();
    vi.mocked(services.timeline.create).mockResolvedValue(
      event({ id: "e-new" }),
    );
    await renderSection([]);

    await user.click(
      screen.getAllByRole("button", { name: "Adicionar evento" })[0],
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Adicionar evento",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Registre uma entrevista, oferta ou recusa para esta candidatura.",
    );
    expect(
      within(dialog).getByRole("radiogroup", { name: "Tipo de evento" }),
    ).toBeInTheDocument();
    expect(within(dialog).getByText("Tipo de entrevista")).toBeInTheDocument();
    expect(within(dialog).getByText("Horário (opcional)")).toBeInTheDocument();
    expect(
      within(dialog).getByText("Anotações (opcional)"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByPlaceholderText(
        "Qualquer coisa que você queira lembrar…",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();

    // An offer: the salary group, the close box, and a validation message.
    await user.click(within(dialog).getByRole("radio", { name: "Oferta" }));
    expect(within(dialog).getByText("Detalhes da oferta")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("checkbox", { name: "Encerrar a candidatura" }),
    ).toBeChecked();
    expect(
      within(dialog).getByText("Você pode reabri-la depois."),
    ).toBeInTheDocument();
    await user.click(
      within(dialog).getByRole("button", { name: "Adicionar evento" }),
    );
    expect(
      await within(dialog).findByText("Informe o valor oferecido"),
    ).toBeInTheDocument();
    expect(toastError).toHaveBeenCalledWith(
      "Corrija os campos destacados antes de encerrar",
    );

    // Back to an interview: it saves, and the toast is Portuguese.
    await user.click(within(dialog).getByRole("radio", { name: "Entrevista" }));
    await user.click(
      within(dialog).getByRole("button", { name: "Adicionar evento" }),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith("Evento adicionado"),
    );
  });

  it("writes the close dialog in Portuguese", async () => {
    await renderInPortuguese(
      <TimelineEventForm
        purpose="close"
        applicationId="app-1"
        open
        onOpenChange={vi.fn()}
        otherEvents={[]}
      />,
      { wrapper: withQueries },
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Encerrar candidatura",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Encerrar é reversível: nada é excluído e você pode reabrir esta candidatura a qualquer momento.",
    );
    const outcome = within(dialog).getByRole("radiogroup", {
      name: "Resultado",
    });
    expect(
      within(outcome)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Nenhum", "Oferta", "Recusada"]);
    expect(
      within(dialog).getByText(
        "Encerrar sem resultado. Nada é adicionado à linha do tempo.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Encerrar" }),
    ).toBeInTheDocument();
  });
});
