import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { FeaturesPage } from "./features-page";
import { FeatureViewPage } from "./view/feature-view-page";
import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import { setTranslatorLocale } from "@/i18n/translator";
import { services } from "@/services/services";
import type { AdminUserRow, PaginatedResponse } from "@/services/types/admin";
import type {
  AdminFeature,
  AdminFeatureUser,
  AdminFeatureUsersPage,
} from "@/services/types/features";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The admin features screens in Portuguese: the list (headers, stage, a
 * grouped count, a date), the feature page (own access, the stage and
 * remove confirms, the add-user dialog), data shown as sent (the feature's
 * name, description and key, usernames, emails), a live switch, and the
 * page's error reader going through the code lookup, never `detail`.
 */

let searchParams = new URLSearchParams("key=jobs");

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getFeatures: vi.fn(),
      getFeatureUsers: vi.fn(),
      addFeatureUser: vi.fn(),
      removeFeatureUser: vi.fn(),
      setFeatureStage: vi.fn(),
      optOutFeature: vi.fn(),
      optInFeature: vi.fn(),
      getUsers: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const NOON = "2026-10-14T12:00:00Z";

const JOBS: AdminFeature = {
  key: "jobs",
  name: "Jobs",
  description: "Job board with saved searches.",
  stage: "beta",
  beta_user_count: 1234,
  released_at: null,
  updated_at: NOON,
  me: { has: true, via: "admin", opted_out: false },
};

const REPORTS: AdminFeature = {
  key: "reports-v2",
  name: "Reports v2",
  description: null,
  stage: "general",
  beta_user_count: 1,
  released_at: NOON,
  updated_at: NOON,
  me: { has: true, via: "general", opted_out: true },
};

const ALICE: AdminFeatureUser = {
  user_id: "101",
  username: "alice",
  email: "alice@example.com",
  added_at: NOON,
  added_by: { id: "1", username: "root-admin" },
};

function usersPage(items: AdminFeatureUser[]): AdminFeatureUsersPage {
  return {
    items,
    total: items.length,
    page: 1,
    per_page: 25,
    total_pages: items.length ? 1 : 0,
  };
}

/** An API refusal with its catalog code and English `detail`. */
function coded(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

/** ADM-1008 with server wording that differs from the catalog's. */
const FEATURE_MISSING = {
  detail: "Feature row is gone (server wording)",
  code: "ADM-1008",
};

function client() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

const admin = vi.mocked(services.admin);

beforeEach(() => {
  searchParams = new URLSearchParams("key=jobs");
  for (const fn of Object.values(admin)) vi.mocked(fn).mockReset();
  admin.getFeatures.mockResolvedValue([JOBS, REPORTS]);
  admin.getFeatureUsers.mockResolvedValue(usersPage([ALICE]));
  admin.removeFeatureUser.mockResolvedValue(undefined);
  admin.addFeatureUser.mockResolvedValue(undefined);
});

describe("admin features in Portuguese", () => {
  it("the list: headers, stage, grouped count, date, access words; data as sent", async () => {
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeaturesPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Recursos" }),
    ).toBeInTheDocument();
    const headers = screen
      .getAllByRole("columnheader")
      .map((node) => node.textContent);
    expect(headers).toEqual([
      "Chave",
      "Nome",
      "Fase",
      "Usuários beta",
      "Liberado em",
      "Você",
    ]);

    const jobs = document.querySelector(
      'tr[data-feature-key="jobs"]',
    ) as HTMLElement;
    // Data: name, description and key exactly as the API sends them.
    expect(within(jobs).getByRole("link", { name: "Jobs" })).toBeVisible();
    expect(
      within(jobs).getByText("Job board with saved searches."),
    ).toBeVisible();
    expect(within(jobs).getByText("jobs")).toBeVisible();
    expect(within(jobs).getByText("Beta")).toBeVisible();
    expect(within(jobs).getByText("1.234")).toBeVisible();
    expect(within(jobs).getByText("Não liberado")).toBeVisible();
    expect(within(jobs).getByText("Sim, como administrador")).toBeVisible();

    const reports = document.querySelector(
      'tr[data-feature-key="reports-v2"]',
    ) as HTMLElement;
    expect(within(reports).getByText("Geral")).toBeVisible();
    expect(within(reports).getByText("Sem descrição")).toBeVisible();
    expect(within(reports).getByText("14 de out. de 2026")).toBeVisible();
    expect(within(reports).getByText("Sim, liberado para todos")).toBeVisible();
  });

  it("the feature page: header, own access, beta list with a pt date", async () => {
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Chave")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Seu acesso" })).toBeVisible();
    expect(
      screen.getByText("Você tem este recurso porque é administrador."),
    ).toBeVisible();
    expect(
      screen.getByRole("switch", { name: "Quero usar este recurso" }),
    ).toBeVisible();
    expect(screen.getByRole("heading", { name: "Lista beta" })).toBeVisible();
    expect(
      screen.getByRole("searchbox", { name: "Buscar na lista beta" }),
    ).toHaveAttribute("placeholder", "Buscar por nome de usuário");

    const row = await screen.findByRole("rowheader", { name: /alice/ });
    expect(within(row).getByText("alice@example.com")).toBeInTheDocument();
    expect(
      within(row).getByText("Adicionado em 14 de out. de 2026 por root-admin"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 usuário")).toBeInTheDocument();
    expect(
      screen
        .getAllByRole("columnheader")
        .map((node) => node.textContent)
        .slice(0, 3),
    ).toEqual(["Usuário", "Adicionado em", "Adicionado por"]);
  });

  it("the release confirm reads in Portuguese, the name as sent", async () => {
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Liberar para todos" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Liberar Jobs para todos?" }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Todos os usuários recebem Jobs, inclusive os administradores que o desativaram.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Cancelar$/ }),
    );
    expect(admin.setFeatureStage).not.toHaveBeenCalled();
  });

  it("the move-back confirm reads in Portuguese", async () => {
    searchParams = new URLSearchParams("key=reports-v2");
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Voltar para beta" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Voltar Reports v2 para beta?",
      }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "Usuários que não estão nesta lista nem são administradores perdem o acesso.",
    );
  });

  it("the remove confirm reads in Portuguese", async () => {
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Remover alice" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Remover alice da lista beta?",
      }),
    ).toBeVisible();
    expect(dialog).toHaveTextContent(
      "alice perde Jobs no próximo carregamento de página, a menos que seja administrador.",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: /^Remover$/ }),
    );
    await waitFor(() =>
      expect(admin.removeFeatureUser).toHaveBeenCalledWith("jobs", "101"),
    );
  });

  it("the add-user dialog reads in Portuguese; usernames and emails as sent", async () => {
    admin.getUsers.mockResolvedValue({
      items: [
        {
          id: "7",
          username: "maria",
          email: "maria@example.com",
          is_admin: true,
        } as AdminUserRow,
      ],
      total: 1500,
      page: 1,
      per_page: 10,
      total_pages: 150,
    } as PaginatedResponse<AdminUserRow>);
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Adicionar usuário" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Adicionar usuários à lista beta",
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        "Digite um nome de usuário ou e-mail para encontrar um usuário.",
      ),
    ).toBeVisible();
    await userEvent.type(
      within(dialog).getByRole("searchbox", { name: "Buscar usuários" }),
      "mar",
    );
    const add = await within(dialog).findByRole("button", {
      name: "Adicionar maria",
    });
    expect(within(dialog).getByText("maria@example.com")).toBeVisible();
    expect(
      within(dialog).getByText(
        "Mostrando 1 de 1.500. Digite mais para refinar a busca.",
      ),
    ).toBeVisible();
    await userEvent.click(add);
    expect(
      await within(dialog).findByText("maria está na lista beta agora."),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Pronto" }),
    ).toBeVisible();
  });

  it("switching the language re-renders the list without a remount", async () => {
    const messages = await loadMessages("pt-BR");
    function Switchable({ children }: { children: ReactNode }) {
      const [pt, setPt] = useState(false);
      return (
        <NextIntlClientProvider
          locale={pt ? "pt-BR" : "en"}
          messages={pt ? ptBR : en}
          timeZone="UTC"
        >
          <button
            type="button"
            onClick={() => {
              setTranslatorLocale("pt-BR", messages);
              setPt(true);
            }}
          >
            switch to pt-BR
          </button>
          {children}
        </NextIntlClientProvider>
      );
    }
    render(
      <QueryClientProvider client={client()}>
        <FeaturesPage />
      </QueryClientProvider>,
      { wrapper: Switchable },
    );
    expect(
      await screen.findByRole("columnheader", { name: "Beta users" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "switch to pt-BR" }),
    );
    expect(
      await screen.findByRole("columnheader", { name: "Usuários beta" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1.234")).toBeInTheDocument();
    expect(screen.getByText("14 de out. de 2026")).toBeInTheDocument();
  });
});

describe("the feature page's error reader goes through the code lookup", () => {
  it("an unknown key's 404 shows the catalog words, not the server's detail (en)", async () => {
    admin.getFeatureUsers.mockRejectedValue(coded(404, FEATURE_MISSING));
    render(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Feature not found",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(FEATURE_MISSING.detail)).toBeNull();
  });

  it("an unknown key's 404 reads in Portuguese", async () => {
    admin.getFeatureUsers.mockRejectedValue(coded(404, FEATURE_MISSING));
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Recurso não encontrado",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Nenhum recurso tem a chave "jobs". Escolha um da lista.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(FEATURE_MISSING.detail)).toBeNull();
  });

  it("a failed stage change keeps the dialog open with the catalog words in Portuguese", async () => {
    admin.setFeatureStage.mockRejectedValue(coded(404, FEATURE_MISSING));
    await renderInPortuguese(
      <QueryClientProvider client={client()}>
        <FeatureViewPage />
      </QueryClientProvider>,
    );

    await userEvent.click(
      await screen.findByRole("button", { name: "Liberar para todos" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Liberar para todos" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      /^Recurso não encontrado$/,
    );
  });
});
