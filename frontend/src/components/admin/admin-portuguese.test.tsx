import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompaniesPage } from "@/app/(protected)/admin/companies/companies-page";
import { PlatformsPage } from "@/app/(protected)/admin/platforms/platforms-page";
import { UsersPage } from "@/app/(protected)/admin/users/users-page";
import { AdminNav } from "@/components/admin/admin-nav";
import { AdminStatCards } from "@/components/admin/admin-stat-cards";
import { SeniorityDonut } from "@/components/admin/seniority-donut";
import { growthMonthLabel } from "@/components/admin/user-growth-chart";
import {
  useCreateAdminCompany,
  useCreateAdminPlatform,
  useCreateReportWebhook,
  useDeleteAdminCompany,
  useDeleteAdminPlatform,
  useDeleteReportWebhook,
  useUpdateAdminCompany,
  useUpdateAdminPlatform,
  useUpdateAdminUser,
  useUpdateReportWebhook,
} from "@/hooks/use-admin";
import { services } from "@/services/services";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The admin area in Portuguese: the section nav, the catalog tables (headers,
 * a date, counts), the confirm dialogs, the users screen, the dashboard words
 * and a toast through `use-admin`. User content (names, URLs, usernames,
 * emails) stays as sent. The error readers of the catalog pages go through the
 * code lookup: a known code shows the catalog words, never a `detail` that
 * differs.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/companies",
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getCompanies: vi.fn(),
      publishCompany: vi.fn(),
      deleteCompany: vi.fn(),
      createCompany: vi.fn(),
      getPlatforms: vi.fn(),
      publishPlatform: vi.fn(),
      deletePlatform: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
      getStats: vi.fn(),
      getSeniorityBreakdown: vi.fn(),
      updateUser: vi.fn(),
      updateCompany: vi.fn(),
      createPlatform: vi.fn(),
      updatePlatform: vi.fn(),
      createReportWebhook: vi.fn(),
      updateReportWebhook: vi.fn(),
      deleteReportWebhook: vi.fn(),
    },
  },
}));

function client() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={client()}>{children}</QueryClientProvider>
  );
}

function refusal(status: number, data: unknown) {
  return { isAxiosError: true, response: { status, data } };
}

const PUBLIC_COMPANY = {
  id: "c-1",
  name: "Acme Inc",
  url: "https://acme.example",
  is_active: true,
  is_public: true,
  applications_count: 1234,
  created_by: { id: "u-1", username: "alice" },
  created_at: "2026-10-14T12:00:00Z",
};

const PRIVATE_COMPANY = {
  id: "c-2",
  name: "Small Co",
  url: "https://small.example",
  is_active: false,
  is_public: false,
  applications_count: 0,
  created_by: { id: "u-2", username: "bob" },
  created_at: "2026-10-14T12:00:00Z",
};

const PRIVATE_PLATFORM = {
  id: "p-2",
  name: "Hiring Hub",
  url: null,
  is_public: false,
  applications_count: 0,
  created_by: { id: "u-2", username: "bob" },
  created_at: "2026-10-14T12:00:00Z",
};

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, per_page: 15, total_pages: 1 };
}

beforeEach(() => {
  vi.mocked(toast.success).mockClear();
  vi.mocked(toast.error).mockClear();
});

describe("Admin section nav in Portuguese", () => {
  it("names the seven tabs and the landmark in Portuguese, within the 62-character budget", async () => {
    await renderInPortuguese(<AdminNav />);

    const nav = screen.getByRole("navigation", {
      name: "Seções da administração",
    });
    const labels = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent ?? "");
    expect(labels).toEqual([
      "Painel",
      "Usuários",
      "Empresas",
      "Plataformas",
      "Vagas",
      "Recursos",
      "Webhooks",
    ]);
    expect(labels.join("").length).toBeLessThanOrEqual(62);
    expect(within(nav).getByRole("link", { name: "Empresas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("keeps the English tab names on en", () => {
    render(<AdminNav />);
    const nav = screen.getByRole("navigation", { name: "Admin sections" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual([
      "Dashboard",
      "Users",
      "Companies",
      "Platforms",
      "Jobs",
      "Features",
      "Report webhooks",
    ]);
  });
});

describe("Companies page in Portuguese", () => {
  it("translates the header, table headers, count, filter and dates; names and URLs as sent", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      page([PUBLIC_COMPANY, PRIVATE_COMPANY]),
    );
    await renderInPortuguese(<CompaniesPage />, { wrapper: Providers });

    expect(
      await screen.findByRole("heading", { name: "Gestão de empresas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Adicionar empresa" }),
    ).toBeInTheDocument();
    await screen.findByText("Acme Inc");

    const headers = screen
      .getAllByRole("columnheader")
      .map((th) => th.textContent);
    expect(headers).toEqual([
      "Empresa",
      "URL",
      "Status",
      "Adicionada por",
      "Candidaturas",
      "Criada em",
      "Ações",
    ]);
    expect(screen.getByText("2 empresas")).toBeInTheDocument();
    expect(screen.getAllByText("14 de out. de 2026")).toHaveLength(2);
    expect(screen.getByText("1.234")).toBeInTheDocument();
    expect(screen.getByText("ativa")).toBeInTheDocument();
    expect(screen.getByText("inativa")).toBeInTheDocument();
    expect(screen.getByText("Privada")).toBeInTheDocument();
    expect(
      screen.getByRole("radiogroup", { name: "Visibilidade" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Privadas" })).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Buscar empresas" }),
    ).toHaveAttribute("placeholder", "Buscar empresas...");
    expect(
      screen.getByRole("button", { name: "Editar Acme Inc" }),
    ).toBeInTheDocument();
    // AC8: user content as sent.
    expect(screen.getByText("https://acme.example")).toBeInTheDocument();
    expect(screen.getAllByText("alice").length).toBeGreaterThan(0);
  });

  it("the approve confirm reads in Portuguese, and a 409 shows the catalog words for its code", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      page([PRIVATE_COMPANY]),
    );
    vi.mocked(services.admin.publishCompany).mockRejectedValue(
      refusal(409, {
        detail: "Small Co is already public (server wording)",
        code: "ADM-1004",
        params: { name: "Small Co", url: "https://small.example", id: "c-9" },
      }),
    );
    const user = userEvent.setup();
    await renderInPortuguese(<CompaniesPage />, { wrapper: Providers });

    await user.click(
      await screen.findByRole("button", { name: "Aprovar Small Co" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Aprovar Small Co?" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent(
      "Small Co passa a ser pública: todos os usuários a veem na lista de empresas e podem escolhê-la. bob continua registrado como quem a adicionou. Não é possível torná-la privada de novo.",
    );
    expect(
      within(dialog).getByRole("button", { name: /^Cancelar$/ }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Aprovar" }));

    expect(
      await within(dialog).findByText(
        "Já existe uma empresa pública com este nome e URL: Small Co (https://small.example, id c-9)",
      ),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("server wording");
  });

  it("a delete refused with a known code shows the catalog words in the dialog, not the detail", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      page([PRIVATE_COMPANY]),
    );
    vi.mocked(services.admin.deleteCompany).mockRejectedValue(
      refusal(409, {
        detail: "Company still in use (server wording)",
        code: "ADM-1002",
        params: { count: 2 },
      }),
    );
    const user = userEvent.setup();
    await renderInPortuguese(<CompaniesPage />, { wrapper: Providers });

    await user.click(
      await screen.findByRole("button", { name: "Excluir Small Co" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Excluir Small Co" }),
    ).toBeInTheDocument();
    expect(dialog).toHaveTextContent("Essa ação não pode ser desfeita.");
    await user.click(within(dialog).getByRole("button", { name: "Excluir" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent(
      "Não é possível excluir: 2 candidatura(s) fazem referência a esta empresa",
    );
    expect(alert).not.toHaveTextContent("server wording");
  });

  it("on en, the codes decide the words too (never a detail that differs)", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(
      page([PRIVATE_COMPANY]),
    );
    vi.mocked(services.admin.publishCompany).mockRejectedValue(
      refusal(409, {
        detail: "Small Co is already public (server wording)",
        code: "ADM-1004",
        params: { name: "Small Co", url: "https://small.example", id: "c-9" },
      }),
    );
    const user = userEvent.setup();
    render(<CompaniesPage />, { wrapper: Providers });

    await user.click(
      await screen.findByRole("button", { name: "Approve Small Co" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Approve" }));
    expect(
      await within(dialog).findByText(
        "A public company with this name and URL already exists: Small Co (https://small.example, id c-9)",
      ),
    ).toBeInTheDocument();
  });

  it("a required name reads in Portuguese in the add dialog", async () => {
    vi.mocked(services.admin.getCompanies).mockResolvedValue(page([]));
    const user = userEvent.setup();
    await renderInPortuguese(<CompaniesPage />, { wrapper: Providers });

    await user.click(
      await screen.findByRole("button", { name: "Adicionar empresa" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Adicionar empresa" }),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Criar" }));
    expect(
      await within(dialog).findByText("O nome é obrigatório"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Informe uma URL válida"),
    ).toBeInTheDocument();
  });
});

describe("Platforms page in Portuguese", () => {
  it("a colliding approve shows the platform catalog words for its code", async () => {
    vi.mocked(services.admin.getPlatforms).mockResolvedValue(
      page([PRIVATE_PLATFORM]),
    );
    vi.mocked(services.admin.publishPlatform).mockRejectedValue(
      refusal(409, {
        detail: "Hiring Hub is taken (server wording)",
        code: "ADM-1006",
        params: { name: "Hiring Hub", id: "p-9" },
      }),
    );
    const user = userEvent.setup();
    await renderInPortuguese(<PlatformsPage />, { wrapper: Providers });

    expect(
      await screen.findByRole("heading", { name: "Plataformas" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("1 plataforma")).toBeInTheDocument();
    expect(screen.getByText("Sem URL")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Aprovar Hiring Hub" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("na lista de plataformas");
    await user.click(within(dialog).getByRole("button", { name: "Aprovar" }));

    expect(
      await within(dialog).findByText(
        "Já existe uma plataforma pública com este nome: Hiring Hub (id p-9)",
      ),
    ).toBeInTheDocument();
    expect(dialog).not.toHaveTextContent("server wording");
  });
});

describe("Users page in Portuguese", () => {
  it("translates the header, columns, seniority and relative dates; usernames and emails as sent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T12:00:00Z"));
    try {
      vi.mocked(services.admin.getUsers).mockResolvedValue({
        items: [
          {
            id: "u-1",
            username: "maria-souza",
            email: "maria@example.com",
            is_admin: true,
            seniority_level: "mid_level",
            total_applications: 1500,
            offers: 2,
            denials: 3,
            joined_at: "2026-10-28T12:00:00Z",
            last_activity: "2026-10-31T10:00:00Z",
          },
        ],
        total: 1,
        page: 1,
        per_page: 15,
        total_pages: 1,
      } as never);
      await renderInPortuguese(<UsersPage />, { wrapper: Providers });

      expect(
        await screen.findByRole("heading", { name: "Gestão de usuários" }),
      ).toBeInTheDocument();
      await screen.findByText("maria-souza");
      expect(
        screen.getAllByRole("columnheader").map((th) => th.textContent),
      ).toEqual([
        "Usuário",
        "Senioridade",
        "Candidaturas",
        "Ofertas",
        "Recusas",
        "Cadastro",
        "Ações",
      ]);
      expect(screen.getByText("1 usuário")).toBeInTheDocument();
      expect(screen.getByText("Pleno")).toBeInTheDocument();
      expect(screen.getByText("1.500")).toBeInTheDocument();
      expect(screen.getByText("há 3 dias")).toBeInTheDocument();
      expect(screen.getByText("maria@example.com")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Ver detalhes do usuário" }),
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("Buscar usuários...")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Dashboard words in Portuguese", () => {
  it("the stat card labels read in Portuguese, each word within the 12-character budget", async () => {
    vi.mocked(services.admin.getStats).mockResolvedValue({} as never);
    await renderInPortuguese(<AdminStatCards />, { wrapper: Providers });

    for (const label of [
      "Total de usuários",
      "Ativos (30 dias)",
      "Novos (7 dias)",
      "Candidaturas",
      "Média / usuário",
      "Total de ofertas",
      "Total de recusas",
      "Taxa de sucesso",
      "Taxa de encerramento",
      "Candidaturas (30 dias)",
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(label.length).toBeLessThanOrEqual(24);
      for (const part of label.split(" ")) {
        expect(part.length).toBeLessThanOrEqual(12);
      }
    }
  });

  it("the donut's slice count, legend count and centre total are each written the pt-BR way", async () => {
    vi.mocked(services.admin.getSeniorityBreakdown).mockResolvedValue([
      { level: "mid level", count: 1500, color: "#fff" },
      { level: "unknown", count: 2, color: "#000" },
    ] as never);
    await renderInPortuguese(<SeniorityDonut />, { wrapper: Providers });

    const row = (await screen.findByText("Pleno")).parentElement as HTMLElement;
    expect(within(row).getByText("1.500")).toBeInTheDocument();
    const sliceTexts = [...document.querySelectorAll("svg text")].map(
      (node) => node.textContent,
    );
    expect(sliceTexts).toContain("1.500");
    expect(screen.getByText("1.502")).toBeInTheDocument();
    expect(screen.getByText("Desconhecida")).toBeInTheDocument();
  });

  it("the month axis keeps the API label in English and writes it from the date in Portuguese", () => {
    const point = { date: "2026-10-01", label: "Oct 26" };
    expect(growthMonthLabel(point, "en")).toBe("Oct 26");
    expect(growthMonthLabel(point, "pt-BR")).toBe("out/26");
  });
});

type ToastCase = [
  string,
  string,
  keyof typeof services.admin,
  () => { mutateAsync: (variables: never) => Promise<unknown> },
  unknown,
];

describe("use-admin toasts follow the language", () => {
  it("a created company toasts in Portuguese, in English on en", async () => {
    vi.mocked(services.admin.createCompany).mockResolvedValue({} as never);
    const { setTranslatorLocale } = await import("@/i18n/translator");
    const { loadMessages } = await import("@/i18n/load-messages");

    const { result } = renderHook(() => useCreateAdminCompany(), {
      wrapper: Providers,
    });
    await act(() =>
      result.current.mutateAsync({ name: "Acme", url: "https://a.example" }),
    );
    expect(toast.success).toHaveBeenLastCalledWith("Company created");

    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    await act(() =>
      result.current.mutateAsync({ name: "Acme", url: "https://a.example" }),
    );
    expect(toast.success).toHaveBeenLastCalledWith("Empresa criada");
  });

  it.each([
    [
      "userUpdated",
      "Usuário atualizado",
      "updateUser",
      () => useUpdateAdminUser(),
      { id: "u", data: {} },
    ],
    [
      "companyUpdated",
      "Empresa atualizada",
      "updateCompany",
      () => useUpdateAdminCompany(),
      { id: "c", data: {} },
    ],
    [
      "companyDeleted",
      "Empresa excluída",
      "deleteCompany",
      () => useDeleteAdminCompany(),
      "c",
    ],
    [
      "platformCreated",
      "Plataforma criada",
      "createPlatform",
      () => useCreateAdminPlatform(),
      { name: "X" },
    ],
    [
      "platformUpdated",
      "Plataforma atualizada",
      "updatePlatform",
      () => useUpdateAdminPlatform(),
      { id: "p", data: { name: "X" } },
    ],
    [
      "platformDeleted",
      "Plataforma excluída",
      "deletePlatform",
      () => useDeleteAdminPlatform(),
      "p",
    ],
    [
      "webhookAdded",
      "Webhook adicionado",
      "createReportWebhook",
      () => useCreateReportWebhook(),
      { webhook_url: "u", badges: ["borderless_base"] },
    ],
    [
      "webhookUpdated",
      "Webhook atualizado",
      "updateReportWebhook",
      () => useUpdateReportWebhook(),
      { id: "w", data: {} },
    ],
    [
      "webhookDeleted",
      "Webhook excluído",
      "deleteReportWebhook",
      () => useDeleteReportWebhook(),
      "w",
    ],
  ] as ToastCase[])(
    "the %s toast reads in Portuguese",
    async (_, words, call, useHook, variables) => {
      vi.mocked(
        services.admin[call] as () => Promise<unknown>,
      ).mockResolvedValue({});
      const { setTranslatorLocale } = await import("@/i18n/translator");
      const { loadMessages } = await import("@/i18n/load-messages");
      setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));

      const { result } = renderHook(useHook, { wrapper: Providers });
      await act(() =>
        (result.current.mutateAsync as (v: unknown) => Promise<unknown>)(
          variables,
        ),
      );
      expect(toast.success).toHaveBeenLastCalledWith(words);
    },
  );

  it("a refused delete toasts the catalog words for its code in Portuguese", async () => {
    vi.mocked(services.admin.deletePlatform).mockRejectedValue(
      refusal(409, {
        detail: "server wording",
        code: "ADM-1003",
        params: { count: 4 },
      }),
    );
    const { setTranslatorLocale } = await import("@/i18n/translator");
    const { loadMessages } = await import("@/i18n/load-messages");
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));

    const { result } = renderHook(() => useDeleteAdminPlatform(), {
      wrapper: Providers,
    });
    await act(async () => {
      await result.current.mutateAsync("p-1").catch(() => undefined);
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    const message = vi.mocked(toast.error).mock.calls.at(-1)?.[0];
    expect(message).not.toBe("server wording");
    expect(String(message)).toMatch(/^Não é possível excluir: 4 /);
  });
});
