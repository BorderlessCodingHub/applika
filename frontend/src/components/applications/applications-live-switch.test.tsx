import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import { ApplicationItem } from "@/components/applications/application-item";
import { LocaleProvider, useLocaleSwitch } from "@/i18n/locale-provider";
import { services } from "@/services/services";
import type { Application } from "@/services/types/applications";

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
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/services", () => ({
  services: {
    applications: {
      createApplication: vi.fn(),
      updateApplication: vi.fn(),
      deleteApplication: vi.fn(),
    },
    timeline: {
      list: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));
vi.mock("@/hooks/use-companies", () => ({
  useCompanySearch: () => ({
    fetchCompanies: vi.fn().mockResolvedValue([]),
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/use-create-platform", () => ({
  useCreatePlatformOutcome: () => vi.fn(),
}));
vi.mock("@/hooks/use-create-company", () => ({
  useCreateCompany: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/use-platforms", () => ({
  usePlatforms: () => ({
    data: [{ id: "p-1", name: "LinkedIn", url: null, is_public: true }],
    isLoading: false,
  }),
}));

let sw: ReturnType<typeof useLocaleSwitch> | null = null;
function Grab() {
  const localeSwitch = useLocaleSwitch();
  useEffect(() => {
    sw = localeSwitch;
  });
  return null;
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <Grab />
        {children}
      </LocaleProvider>
    </QueryClientProvider>
  );
}

afterEach(() => {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  document.documentElement.lang = "en";
});

const app: Application = {
  id: "app-1",
  company_id: "c-1",
  company_name: "Acme Corp",
  platform_id: "p-1",
  role: "Backend engineer",
  mode: "passive",
  application_date: "2026-06-01",
  finalized: false,
  finalized_at: null,
  expected_salary: 160000,
  currency: "BRL",
  salary_period: "monthly",
  country: "Germany",
  observation: "Call back on Monday",
};

async function toPt() {
  await act(async () => {
    sw!.setLocale("pt-BR");
  });
  await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
}

describe("a language switch re-renders applications and the timeline in place", () => {
  it("an expanded row and its timeline swap to Portuguese and back", async () => {
    vi.mocked(services.timeline.list).mockResolvedValue([
      {
        id: "e-1",
        application_id: "app-1",
        user_id: "u-1",
        event_type: "offer",
        interview_type: null,
        denied_reason: null,
        event_date: "2026-07-03",
        start_time: null,
        end_time: null,
        timezone: null,
        observation: "Bring the portfolio",
        salary_period: "monthly",
        salary_amount: "160000",
        salary_currency: "BRL",
        created_at: "2026-07-03T00:00:00Z",
        updated_at: null,
      },
    ] as never);
    render(
      <>
        <ApplicationItem
          app={app}
          showCvLink
          onEditClick={vi.fn()}
          onFinalizeClick={vi.fn()}
          onDeleteClick={vi.fn()}
        />
      </>,
      { wrapper: Providers },
    );
    await userEvent.click(
      screen.getByRole("button", {
        name: "Details for Backend engineer at Acme Corp",
      }),
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getAllByText("2026-06-01").length).toBeGreaterThan(0);
    expect(screen.getByText("Expected Salary")).toBeInTheDocument();
    await screen.findByRole("heading", { name: "Timeline" });
    expect(screen.getAllByText("Fri, Jul 3, 2026").length).toBeGreaterThan(0);

    await toPt();

    // Same tree (details still expanded), words and formats swapped.
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
    expect(screen.getAllByText("01/06/2026").length).toBeGreaterThan(0);
    expect(screen.getByText("Pretensão salarial")).toBeInTheDocument();
    expect(screen.getByText("Passiva")).toBeInTheDocument();
    expect(screen.getAllByText(/BRL 160\.000 \/mês/).length).toBeGreaterThan(1);
    expect(
      screen.getByRole("button", {
        name: "Encerrar Backend engineer em Acme Corp",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "CV de Backend engineer em Acme Corp" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Linha do tempo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar evento" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("sex., 3 de jul. de 2026").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Salário oferecido:/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /^Ações do evento: Oferta, sex\., 3 de jul\. de 2026$/,
      }),
    ).toBeInTheDocument();
    // User content as sent.
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Call back on Monday")).toBeInTheDocument();
    expect(screen.getByText("Bring the portfolio")).toBeInTheDocument();
    // No English left from this tree's app words.
    for (const en of [
      "Active",
      "Expected Salary",
      "Timeline",
      "Add event",
      "Offered salary",
    ]) {
      expect(screen.queryAllByText(en)).toHaveLength(0);
    }
  });

  it("the form sheet swaps its labels and keeps a half-typed value", async () => {
    render(
      <ApplicationFormSheet open onOpenChange={vi.fn()} application={null} />,
      {
        wrapper: Providers,
      },
    );
    const sheet = screen.getByRole("dialog");
    const role = within(sheet).getByLabelText("Role*");
    await userEvent.type(role, "Half typed");
    expect(
      within(sheet).getByRole("heading", { name: "New Application" }),
    ).toBeInTheDocument();

    await toPt();

    expect(
      within(sheet).getByRole("heading", { name: "Nova candidatura" }),
    ).toBeInTheDocument();
    const roleAfter = within(sheet).getByLabelText("Cargo*");
    expect(roleAfter).toBe(role);
    expect(roleAfter).toHaveValue("Half typed");
    expect(
      within(sheet).getByRole("button", { name: "Criar candidatura" }),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });
});
