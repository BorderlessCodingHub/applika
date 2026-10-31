import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import NotFound from "@/app/not-found";
import { Header } from "@/components/layout/header";
import { ADMIN_NAV, PRIMARY_NAV, navItemsFor } from "@/components/layout/nav";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { UserMenu } from "@/components/layout/user-menu";
import type { User } from "@/services/types/users";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The signed-in shell in Portuguese: the accessible names the e2e suite and
 * screen readers address (menu triggers, the home link, the nav and its
 * entries, the account menu), the agenda popover and the not-found page.
 * English is asserted, unchanged, by the existing shell tests.
 */

const useAgendaMock = vi.fn();
vi.mock("@/hooks/use-user", () => ({
  useAgenda: (...args: unknown[]) => useAgendaMock(...args),
}));

const user: User = {
  id: "u1",
  username: "ada",
  email: "ada@example.com",
  github_id: 1,
  badges: [],
  borderless: null,
  github_restore: { available: false, prompt: false },
};

function today(offsetDays = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

describe("shell in Portuguese", () => {
  it("names the header's controls in Portuguese", async () => {
    useAgendaMock.mockReturnValue({ data: [] });
    await renderInPortuguese(
      <Header
        user={user}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        onOpenMobileNav={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Abrir menu de navegação" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Página inicial do Applika.dev" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Alternar tema" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próximas etapas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Abrir menu da conta" }),
    ).toBeInTheDocument();
  });

  it("writes the agenda popover, its day headings and stage labels in Portuguese", async () => {
    useAgendaMock.mockReturnValue({
      data: [
        {
          id: "1",
          step_id: null,
          step_date: today(),
          step_name: null,
          step_color: null,
          event_type: "interview",
          interview_type: "technical",
          application_id: "app-1",
          company_name: "Acme",
          role: "Backend engineer",
        },
        {
          id: "2",
          step_id: null,
          step_date: today(1),
          step_name: null,
          step_color: null,
          event_type: "offer",
          interview_type: null,
          application_id: "app-2",
          company_name: "Globex",
          role: "Staff engineer",
        },
        {
          id: "3",
          step_id: null,
          step_date: today(3),
          step_name: null,
          step_color: null,
          event_type: "denied",
          interview_type: null,
          application_id: "app-3",
          company_name: "Initech",
          role: "Engineer",
        },
      ],
    });
    await renderInPortuguese(
      <Header
        user={user}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        onOpenMobileNav={vi.fn()}
      />,
    );

    // The count badge follows the words in the trigger's name.
    await userEvent.click(
      screen.getByRole("button", { name: /^Próximas etapas/ }),
    );

    expect(
      screen.getByRole("heading", { name: "Próximas etapas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ver tudo" })).toBeInTheDocument();
    expect(screen.getByText("Hoje")).toBeInTheDocument();
    expect(screen.getByText("Amanhã")).toBeInTheDocument();
    expect(screen.getByText("Entrevista - Técnica")).toBeInTheDocument();
    expect(screen.getByText("Oferta")).toBeInTheDocument();
    expect(screen.getByText("Recusada")).toBeInTheDocument();
    // A later day is written the Portuguese way: "terça, 3 de nov".
    expect(
      screen.getByText(/^[a-zà-ú-]+\.?, \d{1,2} de [a-zà-ú]+\.?$/),
    ).toBeInTheDocument();
    // User content is never translated.
    expect(screen.getByText("Backend engineer")).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });

  it("says the agenda is empty in Portuguese", async () => {
    useAgendaMock.mockReturnValue({ data: [] });
    await renderInPortuguese(
      <Header
        user={user}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        onOpenMobileNav={vi.fn()}
      />,
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Próximas etapas" }),
    );
    expect(
      screen.getByText("Nenhuma etapa nos próximos 7 dias"),
    ).toBeInTheDocument();
  });

  it("names the nav and its entries in Portuguese; Admin keeps its word", async () => {
    const items = navItemsFor(
      true,
      [
        { key: "jobs", stage: "beta" },
        { key: "cvs", stage: "general" },
      ],
      { hasReportsBadge: true },
    );
    await renderInPortuguese(<SidebarNav items={items} activePath="/jobs" />);

    const nav = screen.getByRole("navigation", { name: "Principal" });
    const names = within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent?.trim());
    expect(names).toEqual([
      "Painel",
      "Candidaturas",
      "Vagas Beta",
      "CVs",
      "Agenda",
      "Relatórios",
      "Ciclos",
      "Perfil",
      "Admin",
    ]);
    expect(within(nav).getByText("Sistema")).toBeInTheDocument();
    expect(
      within(nav).getByRole("link", { name: "Vagas" }),
    ).toHaveAccessibleDescription("Beta");
  });

  it("keeps the labels live: the same entries read English again under en", () => {
    // The Portuguese test above read these same objects; the translator is
    // back on `en` now, and a beta copy keeps its getter.
    expect(PRIMARY_NAV.map((item) => item.label)).toEqual([
      "Dashboard",
      "Applications",
      "Jobs",
      "CVs",
      "Agenda",
      "Reports",
      "Cycles",
      "Profile",
    ]);
    expect(ADMIN_NAV.group).toBe("System");
    const [jobs] = navItemsFor(false, [{ key: "jobs", stage: "beta" }]).filter(
      (item) => item.href === "/jobs",
    );
    expect(jobs).toMatchObject({ label: "Jobs", beta: true });
  });

  it("writes the account menu in Portuguese, the username as typed", async () => {
    await renderInPortuguese(
      <UserMenu
        user={user}
        onLogout={vi.fn()}
        onFeedback={vi.fn()}
        variant="card"
      />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: "Abrir menu da conta de ada" }),
    );
    const menu = await screen.findByRole("menu");
    expect(
      within(menu).getByRole("menuitem", { name: "Perfil" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Feedback" }),
    ).toBeInTheDocument();
    expect(
      within(menu).getByRole("menuitem", { name: "Sair" }),
    ).toBeInTheDocument();
    expect(within(menu).getByText("ada@example.com")).toBeInTheDocument();
  });

  it("shows the not-found page in Portuguese", async () => {
    await renderInPortuguese(<NotFound />);

    expect(screen.getByRole("heading", { name: "404" })).toBeInTheDocument();
    expect(screen.getByText("Ops! Página não encontrada")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar ao início" }),
    ).toHaveAttribute("href", "/");
  });
});
