import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import { setTranslatorLocale } from "@/i18n/translator";
import { renderInPortuguese } from "@/test/portuguese";
import type { UserSession } from "@/services/types/sessions";
import type { User } from "@/services/types/users";

import { DevicesTab } from "./devices-tab";
import { GithubRestoreCard } from "./github-restore-card";
import { GithubRestoreNotice } from "./github-restore-notice";
import { UserProfileView } from "./profile-view";

/**
 * The profile and its Devices tab in Portuguese: every word translated, the
 * dates and the salary written the Brazilian way, and what the API sends as
 * data (device name, client label) or the user typed (names, company, bio)
 * shown exactly as sent.
 */

vi.mock("@/services/services", () => ({
  services: {
    auth: { startGithubRestore: vi.fn(), confirmMembership: vi.fn() },
    users: { deleteMe: vi.fn() },
  },
}));

vi.mock("@/components/ui/avatar", () => ({
  Avatar: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
  AvatarFallback: ({ children }: { children: ReactNode }) => (
    <span>{children}</span>
  ),
}));

const USER: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  first_name: "Ada",
  last_name: "Lovelace",
  current_role: "Staff Engineer",
  current_company: "Acme Analytical",
  current_salary: 12000,
  salary_currency: "BRL",
  salary_period: "monthly",
  experience_years: 1,
  seniority_level: "mid_level",
  availability: "open_to_work",
  bio: "I build analytical engines.",
  github_id: null,
  badges: [{ badge: "borderless_psp", granted_at: "2026-10-01T00:00:00Z" }],
  borderless: {
    status: "active",
    expires_at: "2026-11-05T00:00:00Z",
    email: "ada@borderless.example",
  },
  github_restore: { available: true, prompt: false },
} as User;

function withQuery(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const CURRENT: UserSession = {
  id: "101",
  client_type: "web",
  sign_in_method: "borderless",
  device_name: "Chrome on macOS",
  client_label: "Chrome 141 on macOS",
  created_ip: "203.0.113.7",
  last_ip: "203.0.113.9",
  created_at: "2026-10-01T09:00:00Z",
  last_used_at: "2026-10-15T08:30:00Z",
  expires_at: "2026-10-22T08:30:00Z",
  ended_at: null,
  status: "active",
  current: true,
};

const CLI: UserSession = {
  ...CURRENT,
  id: "102",
  client_type: "cli",
  sign_in_method: "cli_device",
  device_name: "e2e-laptop",
  client_label: "applika-cli 1.1.0",
  created_ip: null,
  last_ip: null,
  last_used_at: null,
  current: false,
};

const REVOKED: UserSession = {
  ...CLI,
  id: "201",
  device_name: "Firefox on Linux",
  client_label: "Firefox 130 on Linux",
  ended_at: "2026-10-06T10:00:00Z",
  status: "revoked",
};

const AVAILABLE = ptBR.options.availability.open_to_work;

describe("profile in Portuguese", () => {
  it("translates the profile and keeps the user's words as typed", async () => {
    await renderInPortuguese(
      withQuery(
        <UserProfileView
          user={USER}
          userStats={{
            total_applications: 12,
            success_rate: 8,
            offers: 1,
            denials: 2,
            active: 9,
          }}
          onEditClick={vi.fn()}
        />,
      ),
    );

    expect(screen.getByRole("button", { name: "Editar" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Detalhes" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Selos" })).toBeVisible();
    expect(screen.getByText("3/6 conquistados")).toBeInTheDocument();
    expect(screen.getByText("Primeiro passo")).toBeInTheDocument();
    expect(screen.getByText("Levando a sério")).toBeInTheDocument();
    expect(screen.getByText("Salário")).toBeInTheDocument();
    expect(screen.getByText(AVAILABLE)).toBeInTheDocument();
    // The salary is grouped the Brazilian way, the period in Portuguese.
    expect(screen.getByText(/12\.000 \/ mensal$/)).toBeInTheDocument();
    expect(screen.getByText("1 ano")).toBeInTheDocument();
    expect(screen.getByText("Pleno")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Excluir conta" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Restaurar dados do GitHub" }),
    ).toBeVisible();
    // The PSP chip keeps its brand word; its name is Portuguese.
    expect(
      screen.getByRole("img", { name: "Membro Borderless PSP" }),
    ).toHaveTextContent("PSP");
    // User content, never translated.
    expect(
      screen.getByRole("heading", { level: 1, name: "Ada Lovelace" }),
    ).toBeVisible();
    expect(screen.getByText("I build analytical engines.")).toBeVisible();
    expect(screen.getByText(/Staff Engineer/)).toHaveTextContent(
      "Staff Engineer em Acme Analytical",
    );
  });

  it("asks for the Portuguese delete phrase", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(
      withQuery(<UserProfileView user={USER} onEditClick={vi.fn()} />),
    );

    await user.click(screen.getByRole("button", { name: "Excluir sua conta" }));
    const input = screen.getByLabelText(
      "Para confirmar, digite excluir ada abaixo:",
    );
    const confirm = screen.getByRole("button", {
      name: "Entendo, excluir minha conta",
    });
    expect(confirm).toBeDisabled();
    await user.type(input, "excluir ada");
    expect(confirm).toBeEnabled();
  });

  it("shows the restore outcome in Portuguese", async () => {
    await renderInPortuguese(
      <GithubRestoreNotice status="not_found" onDismiss={vi.fn()} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Nenhuma conta antiga do Applika foi encontrada para esta conta do GitHub. Nada foi alterado.",
    );
    expect(
      screen.getByRole("button", { name: "Dispensar aviso" }),
    ).toBeVisible();
  });

  it("words the restore card in Portuguese", async () => {
    await renderInPortuguese(<GithubRestoreCard onRestore={vi.fn()} />);
    expect(
      screen.getByRole("heading", { name: "Conta antiga do GitHub" }),
    ).toBeVisible();
    expect(screen.getByText(/O GitHub pede sua aprovação/)).toBeVisible();
  });
});

describe("Devices tab in Portuguese", () => {
  it("translates the tab and shows device names and client labels as sent", async () => {
    await renderInPortuguese(
      <DevicesTab
        sessions={[CURRENT, CLI, REVOKED]}
        onRevoke={vi.fn()}
        onRevokeOthers={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Ativos" })).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Encerrados (últimos 30 dias)" }),
    ).toBeVisible();

    const current = within(
      document.querySelector<HTMLElement>('[data-session-id="101"]')!,
    );
    // AC3: the API's data, exactly as it sends it, in both languages.
    expect(
      current.getByRole("heading", { name: "Chrome on macOS" }),
    ).toBeVisible();
    expect(current.getByText("Chrome 141 on macOS")).toBeVisible();
    expect(current.getByText("Este dispositivo")).toBeVisible();
    expect(current.getByText("Ativo")).toBeVisible();
    expect(current.getByText("Cliente")).toBeVisible();
    expect(current.getByText("Como entrou")).toBeVisible();
    expect(current.getByText("Borderless no navegador")).toBeVisible();
    expect(current.getByText("Entrou pelo IP 203.0.113.7")).toBeVisible();
    expect(current.getByRole("button", { name: "Sair" })).toBeVisible();
    // Dates the Brazilian way: "15 de out. de 2026, …".
    const lastUsed = current.getByText("Último uso").nextElementSibling!;
    expect(lastUsed.textContent).toMatch(
      /^15 de out\. de 2026, \d{1,2}:\d{2}$/,
    );

    const cli = within(
      document.querySelector<HTMLElement>('[data-session-id="102"]')!,
    );
    expect(cli.getByText("applika-cli 1.1.0")).toBeVisible();
    expect(cli.getByText("Aprovado com código de dispositivo")).toBeVisible();
    expect(cli.getByText("Nunca")).toBeVisible();
    expect(cli.getByText("IP de entrada não registrado")).toBeVisible();
    expect(cli.getByRole("button", { name: "Revogar" })).toBeVisible();

    const revoked = within(
      document.querySelector<HTMLElement>('[data-session-id="201"]')!,
    );
    expect(revoked.getByText("Firefox 130 on Linux")).toBeVisible();
    expect(revoked.getByText("Revogado")).toBeVisible();
    expect(revoked.getByText("Encerrado")).toBeVisible();

    expect(
      screen.getByRole("button", {
        name: "Desconectar os outros dispositivos",
      }),
    ).toBeVisible();
  });

  it("confirms a revoke in Portuguese, naming the device as sent", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(
      <DevicesTab
        sessions={[CURRENT, CLI]}
        onRevoke={vi.fn()}
        onRevokeOthers={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Revogar" }));
    const dialog = screen.getByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", {
        name: "Revogar o acesso de e2e-laptop?",
      }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Revogar acesso" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeVisible();
  });

  it("counts the other devices in Portuguese", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(
      <DevicesTab
        sessions={[CURRENT, CLI, { ...CLI, id: "103" }]}
        onRevoke={vi.fn()}
        onRevokeOthers={vi.fn()}
      />,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Desconectar os outros dispositivos",
      }),
    );
    expect(
      within(screen.getByRole("alertdialog")).getByRole("heading", {
        name: "Desconectar 2 outros dispositivos?",
      }),
    ).toBeVisible();
  });
});

describe("Devices tab language switch", () => {
  it("re-renders its words and dates when the language changes", async () => {
    const pt = await loadMessages("pt-BR");
    const user = userEvent.setup();

    function Switcher({ children }: { children: ReactNode }) {
      const [locale, setLocale] = useState<"en" | "pt-BR">("en");
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setTranslatorLocale("pt-BR", pt);
              setLocale("pt-BR");
            }}
          >
            switch
          </button>
          <NextIntlClientProvider
            locale={locale}
            messages={locale === "pt-BR" ? pt : en}
            timeZone="UTC"
          >
            {children}
          </NextIntlClientProvider>
        </>
      );
    }

    // The tab is one element created once: only its own subscription
    // (`useLocale`) can re-render it after the switch.
    render(
      <Switcher>
        <DevicesTab
          sessions={[CURRENT, REVOKED]}
          onRevoke={vi.fn()}
          onRevokeOthers={vi.fn()}
        />
      </Switcher>,
    );
    expect(screen.getByRole("heading", { name: "Active" })).toBeVisible();
    expect(screen.getByText("Revoked")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "switch" }));

    expect(screen.getByRole("heading", { name: "Ativos" })).toBeVisible();
    expect(screen.getByText("Revogado")).toBeVisible();
    expect(screen.getByText("Entrou pelo IP 203.0.113.7")).toBeVisible();
    expect(screen.getAllByText(/de out\. de 2026/).length).toBeGreaterThan(0);
  });
});
