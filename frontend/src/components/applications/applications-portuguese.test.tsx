import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ApplicationFormSheet } from "@/components/applications/application-form-sheet";
import {
  formatApplicationDay,
  formatDate,
  formatSalary,
} from "@/components/applications/application-format";
import { ApplicationItem } from "@/components/applications/application-item";
import { NewApplicationActions } from "@/components/applications/new-application-actions";
import {
  useApplicationDelete,
  useApplicationMutate,
} from "@/hooks/use-applications";
import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import { setTranslatorLocale } from "@/i18n/translator";
import type { Application } from "@/services/types/applications";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The applications screens in Portuguese: the row, its actions' accessible
 * names, the day and the salary written the pt-BR way, the create sheet and
 * the hooks' toasts. What the user typed (company, role, notes, country)
 * stays as sent. English is asserted, unchanged, by the existing tests.
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

const createApplication = vi.fn();
const deleteApplication = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    applications: {
      createApplication: (...args: unknown[]) => createApplication(...args),
      updateApplication: vi.fn(),
      deleteApplication: (...args: unknown[]) => deleteApplication(...args),
    },
    timeline: {
      list: vi.fn().mockResolvedValue([]),
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

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

afterEach(() => {
  vi.mocked(toast.success).mockClear();
});

function withQueries({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const application: Application = {
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

describe("applications in Portuguese", () => {
  it("writes the row in Portuguese: status, actions, day and salary; user text as sent", async () => {
    await renderInPortuguese(
      <ApplicationItem
        app={application}
        showCvLink
        onEditClick={vi.fn()}
        onFinalizeClick={vi.fn()}
        onDeleteClick={vi.fn()}
      />,
      { wrapper: withQueries },
    );

    // The user's own words, untouched.
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("Backend engineer")).toBeInTheDocument();
    // The status pill and its screen-reader prefix.
    expect(screen.getByText("Ativa")).toBeInTheDocument();
    expect(screen.getByText("Status:")).toBeInTheDocument();
    // "<action> <role> em <company>".
    for (const name of [
      "Editar Backend engineer em Acme Corp",
      "Encerrar Backend engineer em Acme Corp",
      "Excluir Backend engineer em Acme Corp",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: "CV de Backend engineer em Acme Corp" }),
    ).toBeInTheDocument();
    // The day, the Brazilian way.
    expect(screen.getByText("01/06/2026")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", {
        name: "Detalhes de Backend engineer em Acme Corp",
      }),
    );
    expect(screen.getByText("Plataforma")).toBeInTheDocument();
    expect(screen.getByText("Origem")).toBeInTheDocument();
    expect(screen.getByText("Passiva")).toBeInTheDocument();
    expect(screen.getByText("Pretensão salarial")).toBeInTheDocument();
    expect(screen.getByText("BRL 160.000 /mês")).toBeInTheDocument();
    expect(screen.getByText("País")).toBeInTheDocument();
    expect(screen.getByText("Germany")).toBeInTheDocument();
    expect(screen.getByText("Anotações")).toBeInTheDocument();
    expect(screen.getByText("Call back on Monday")).toBeInTheDocument();
  });

  it("writes the create actions in Portuguese", async () => {
    await renderInPortuguese(
      <NewApplicationActions onNewApplication={vi.fn()} showNewWithCv />,
    );
    expect(
      screen.getByRole("button", { name: "Nova candidatura" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Nova com CV" }),
    ).toBeInTheDocument();
  });

  it("writes the create sheet in Portuguese, its errors included", async () => {
    await renderInPortuguese(
      <ApplicationFormSheet open onOpenChange={vi.fn()} application={null} />,
      { wrapper: withQueries },
    );
    const sheet = screen.getByRole("dialog");
    expect(
      within(sheet).getByRole("heading", { name: "Nova candidatura" }),
    ).toBeInTheDocument();
    for (const heading of [
      "Cargo e empresa",
      "Detalhes",
      "Anúncio e anotações",
    ]) {
      expect(
        within(sheet).getByRole("heading", { name: heading }),
      ).toBeInTheDocument();
    }
    expect(within(sheet).getByLabelText("Cargo*")).toBeInTheDocument();
    expect(within(sheet).getByText("Data da candidatura")).toBeInTheDocument();
    expect(
      within(sheet).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();

    await userEvent.click(
      within(sheet).getByRole("button", { name: "Criar candidatura" }),
    );
    expect(
      await within(sheet).findByText("O cargo é obrigatório"),
    ).toBeInTheDocument();
    expect(
      within(sheet).getByText("A empresa é obrigatória"),
    ).toBeInTheDocument();
    expect(createApplication).not.toHaveBeenCalled();
  });

  it("toasts the hooks' outcomes in Portuguese", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    createApplication.mockResolvedValue({ id: "app-2" });
    deleteApplication.mockResolvedValue(undefined);

    const created = renderHook(() => useApplicationMutate({}), {
      wrapper: withQueries,
    });
    await act(() =>
      created.result.current.submit(
        {} as Parameters<typeof created.result.current.submit>[0],
      ),
    );
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Candidatura criada"),
    );

    const deleted = renderHook(() => useApplicationDelete(), {
      wrapper: withQueries,
    });
    await act(() => deleted.result.current.deleteApplication("app-1"));
    await vi.waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Candidatura excluída"),
    );
  });
});

describe("application-format by language", () => {
  it("writes a day, a date and a salary the way each language writes them", async () => {
    // English: the words and digits the screens have always shown.
    expect(formatApplicationDay("2026-06-01", "en")).toBe("2026-06-01");
    expect(formatDate("2026-06-01")).toBe("Jun 1");
    expect(
      formatSalary({
        salaryRangeMax: "1234.5",
        currency: "EUR",
        salaryPeriod: "annually",
      }),
    ).toBe("Up to EUR 1,234.50 /yr");

    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    expect(formatApplicationDay("2026-06-01")).toBe("01/06/2026");
    expect(formatDate("2026-06-01")).toBe("1 de jun.");
    expect(
      formatSalary({
        salaryRangeMax: "1234.5",
        currency: "EUR",
        salaryPeriod: "annually",
      }),
    ).toBe("Até EUR 1.234,50 /ano");

    setTranslatorLocale("en", en);
    expect(formatDate("2026-06-01")).toBe("Jun 1");
  });
});
