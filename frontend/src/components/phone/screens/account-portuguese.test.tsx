import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import AccountRoute from "@/app/(protected)/account/page";
import InsightsRoute from "@/app/(protected)/insights/page";
import { AppShell } from "@/components/layout/app-shell";
import { navItemsFor } from "@/components/layout/nav";
import { CycleProvider } from "@/contexts/cycle-context";
import { USER_QUERY_KEY } from "@/hooks/use-user";
import type { User } from "@/services/types/users";
import { mockPhoneViewport } from "@/test/phone";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The phone shell and the Account hub in Portuguese: every word the K1
 * screens add, and the reused ones they show, follow the language switch.
 */

let currentUser: User | null = null;

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: currentUser, logout: vi.fn() }),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "dark", setTheme: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

vi.mock("@/components/applications/application-form-sheet", () => ({
  ApplicationFormSheet: () => null,
}));

vi.mock("@/services/services", () => ({
  services: {
    cycles: { getCycles: () => Promise.resolve([]) },
    sessions: {
      list: () =>
        Promise.resolve([
          { id: "a", status: "active" },
          { id: "b", status: "active" },
        ]),
    },
    reports: {
      fetchReports: () =>
        Promise.resolve({
          reports: [],
          current_day: 5,
          current_phase: 1,
          start_date: "2026-11-01",
        }),
    },
  },
}));

const SAM: User = {
  id: "u1",
  username: "scarter",
  email: "sam@example.com",
  first_name: "Sam",
  last_name: "Carter",
  github_id: null,
  is_admin: true,
  badges: [{ badge: "borderless_psp", granted_at: "2026-10-01" }],
  borderless: { status: "active", email: "sam@example.com", checked_at: null },
  github_restore: { available: false, prompt: false },
};

async function renderPhone(path: string, page: React.ReactNode = null) {
  mockPhoneViewport();
  currentUser = SAM;
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  client.setQueryData(USER_QUERY_KEY, SAM);
  return renderInPortuguese(
    <QueryClientProvider client={client}>
      <CycleProvider>
        <AppShell
          activePath={path}
          navItems={navItemsFor(
            true,
            [
              { key: "jobs", stage: "beta" },
              { key: "cvs", stage: "beta" },
            ],
            { hasReportsBadge: true },
          )}
          user={SAM}
          onLogout={vi.fn()}
        >
          {page}
        </AppShell>
      </CycleProvider>
    </QueryClientProvider>,
    { localeSwitch: true },
  );
}

describe("phone shell in Portuguese", () => {
  // The avatar is each board header's own now (core-screens-portuguese.test.tsx).
  it("names the tab bar, its tabs and Add", async () => {
    await renderPhone("/dashboard");

    const nav = screen.getByRole("navigation", { name: "Principal" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((tab) => tab.textContent),
    ).toEqual(["Hoje", "Funil", "Agenda", "Insights"]);
    expect(
      screen.getByRole("button", { name: "Adicionar" }),
    ).toBeInTheDocument();
  });

  it.each([
    ["/account", "Voltar"],
    ["/jobs", "Conta"],
    ["/applications/cv", "Candidatura"],
    ["/jobs/view", "Vagas"],
    ["/reports/3", "Relatórios"],
    ["/applications/new-with-cv", "Candidaturas"],
    ["/admin/features/view", "Recursos"],
    ["/admin/supports", "Admin"],
  ])("names the back link on %s %s", async (path, label) => {
    await renderPhone(path);

    expect(
      within(screen.getByRole("banner")).getByRole("link"),
    ).toHaveAccessibleName(label);
  });

  it("titles Insights", async () => {
    await renderPhone("/insights", <InsightsRoute />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Insights" }),
    ).toBeInTheDocument();
  });
});

describe("Account hub in Portuguese", () => {
  it("words every section, row, meta and action", async () => {
    await renderPhone("/account", <AccountRoute />);

    expect(screen.getByText("Membro Borderless PSP")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver perfil" }),
    ).toBeInTheDocument();

    const workspace = screen.getByRole("region", {
      name: "Espaço de trabalho",
    });
    expect(within(workspace).getAllByRole("link")).toHaveLength(4);
    expect(
      within(workspace).getByRole("link", { name: "Vagas" }),
    ).toHaveAccessibleDescription("Beta");
    await waitFor(() =>
      expect(
        within(workspace).getByRole("link", { name: "Relatórios" }),
      ).toHaveAccessibleDescription("Dia 5"),
    );
    expect(
      within(workspace).getByRole("link", { name: "Ciclos" }),
    ).toHaveAccessibleDescription("Ciclo atual");

    const account = screen.getByRole("region", { name: "Conta" });
    expect(
      within(account).getByRole("link", { name: "Perfil" }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(account).getByRole("link", { name: "Dispositivos e CLI" }),
      ).toHaveAccessibleDescription("2 conectados"),
    );
    expect(
      within(account).getByRole("link", { name: "Conectar um dispositivo" }),
    ).toHaveAccessibleDescription("XXXX-XXXX");
    expect(
      within(account).getByRole("link", { name: "Admin" }),
    ).toHaveAccessibleDescription("Sistema");

    const language = screen.getByRole("radiogroup", { name: "Idioma" });
    expect(
      within(language)
        .getAllByRole("radio")
        .map((radio) => [radio.textContent, radio.getAttribute("lang")]),
    ).toEqual([
      ["English", "en"],
      ["Português (BR)", "pt-BR"],
    ]);
    expect(
      within(language).getByRole("radio", { name: "Português (BR)" }),
    ).toHaveAttribute("aria-checked", "true");

    const theme = screen.getByRole("radiogroup", { name: "Tema" });
    expect(
      within(theme)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Claro", "Escuro"]);

    expect(
      screen.getByRole("button", { name: "Enviar feedback" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sair" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Política de cookies" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Applika.dev · código aberto")).toBeInTheDocument();
  });

  it("offers Entrar novamente while a badge waits for a sign-in", async () => {
    mockPhoneViewport();
    const waiting: User = {
      ...SAM,
      borderless: { ...SAM.borderless!, status: "needs_reconnect" },
    };
    currentUser = waiting;
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(USER_QUERY_KEY, waiting);
    await renderInPortuguese(
      <QueryClientProvider client={client}>
        <CycleProvider>
          <AppShell
            activePath="/account"
            navItems={navItemsFor(false, [], { hasReportsBadge: true })}
            user={waiting}
            onLogout={vi.fn()}
          >
            <AccountRoute />
          </AppShell>
        </CycleProvider>
      </QueryClientProvider>,
      { localeSwitch: true },
    );

    expect(
      screen.getByRole("button", { name: "Entrar novamente" }),
    ).toBeInTheDocument();
  });
});
