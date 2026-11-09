import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPage } from "@/app/(protected)/admin/admin-page";
import { JobsPage } from "@/app/(protected)/admin/jobs/jobs-page";
import AdminLayout from "@/app/(protected)/admin/layout";
import { ReportWebhooksPage } from "@/app/(protected)/admin/report-webhooks/report-webhooks-page";
import { CyclesPage } from "@/app/(protected)/cycles/cycles-page";
import { ProfilePage } from "@/app/(protected)/profile/profile-page";
import { ReportDayRoute } from "@/app/(protected)/reports/[day]/report-day-route";
import ReportPage from "@/app/(protected)/reports/page";
import type { ReportDaysType } from "@/services/types/reports";
import type { User } from "@/services/types/users";
import { pathname, setLocation } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * Profile, Devices, Cycles, Reports (open and closed), a report day and the
 * admin boards in Portuguese: the boards' new words and the reused ones
 * follow the language, with no English left on the phone screen.
 */

const mocks = vi.hoisted(() => ({
  user: { current: null as User | null },
}));

vi.mock("@/contexts/auth-context", async () => {
  const { useUserProfile } = await import("@/hooks/use-user");
  return {
    useAuth: () => ({
      user: useUserProfile(false).data ?? null,
      isLoading: false,
      logout: vi.fn(),
    }),
  };
});

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("@/services/services", () => ({
  services: {
    statistics: {
      getGeneralStats: () =>
        Promise.resolve({
          total_applications: 12,
          success_rate: 8,
          offers: 1,
          denials: 2,
          active: 9,
        }),
    },
    sessions: {
      list: () =>
        Promise.resolve([
          {
            id: "s1",
            client_type: "web",
            sign_in_method: "borderless",
            device_name: "Chrome no macOS",
            client_label: "Navegador",
            created_ip: "203.0.113.4",
            last_ip: "203.0.113.4",
            created_at: "2026-11-01T10:00:00Z",
            last_used_at: null,
            expires_at: "2026-11-15T10:00:00Z",
            ended_at: null,
            status: "active",
            current: true,
          },
          {
            id: "s2",
            client_type: "cli",
            sign_in_method: "cli_device",
            device_name: "e2e-cli",
            client_label: "applika-cli",
            created_ip: null,
            last_ip: null,
            created_at: "2026-11-01T10:00:00Z",
            last_used_at: null,
            expires_at: "2026-11-15T10:00:00Z",
            ended_at: null,
            status: "active",
            current: false,
          },
        ]),
    },
    cycles: {
      getCycles: () =>
        Promise.resolve([
          {
            id: "c1",
            name: "Primavera 2026",
            created_at: "2026-09-01T10:00:00Z",
            updated_at: null,
          },
        ]),
    },
    reports: {
      fetchReports: () =>
        Promise.resolve({
          reports: [
            { day: 1, status: "submitted", submitted_at: "2026-10-15" },
            { day: 14, status: "pending", submitted_at: null },
            { day: 28, status: "future", submitted_at: null },
          ],
          current_day: 14,
          current_phase: 1,
          start_date: "2026-10-15",
        }),
      fetchReportDetail: () =>
        Promise.resolve({
          report: { day: 14, phase: 1, submitted: false, submitted_at: null },
          metrics: {
            applications_count: 8,
            initial_screenings_count: 2,
            interviews_completed_fortnight: 3,
            active_processes_count: 4,
            offers_count: 1,
            total_applications_count: 34,
            callback_rate: 0.41,
            offer_rate: 0.06,
            overall_conversion_rate: 0.1,
            total_initial_screenings_count: 14,
          },
          can_submit: true,
          period: { start_date: "2026-10-15", end_date: "2026-10-28" },
        }),
    },
    admin: {
      getStats: () =>
        Promise.resolve({
          total_users: 1284,
          active_users_30d: 412,
          new_users_7d: 37,
          total_applications: 18402,
          total_offers: 91,
          total_denials: 2310,
          avg_applications_per_user: 14.3,
          global_success_rate: 6.8,
          total_finalized: 3000,
          finalization_rate: 16,
          applications_last_30d: 1200,
        }),
      getUserGrowth: () =>
        Promise.resolve([
          { date: "2026-06-01", label: "", total_users: 0, new_users: 38 },
          { date: "2026-11-01", label: "", total_users: 0, new_users: 112 },
        ]),
      getTopPlatforms: () =>
        Promise.resolve([
          { name: "LinkedIn", total_across_users: 6120, unique_users: 9 },
        ]),
      getJobSources: () =>
        Promise.resolve([
          {
            id: "s1",
            code: "himalayas",
            name: "Himalayas",
            base_url: "https://himalayas.app/jobs/api",
            platform_id: null,
            is_enabled: true,
            last_run_at: null,
            last_run_status: null,
            last_run_error: null,
            last_run_found: null,
            last_run_saved: null,
            active_jobs: 0,
          },
        ]),
      getReportWebhooks: () =>
        Promise.resolve([
          {
            id: "w1",
            label: null,
            badges: ["borderless_base"],
            webhook_url_masked: "example.invalid/hooks/••••ummy",
            created_at: "2026-10-01T10:00:00Z",
            updated_at: null,
          },
        ]),
    },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const MEMBER: User = {
  ...SAM,
  current_role: "Engenheira",
  current_company: "Acme",
  is_admin: true,
  badges: [{ badge: "borderless_base", granted_at: "2026-10-01" }],
  borderless: { status: "active", email: "sam@example.com", checked_at: null },
};

const NOW = new Date(2026, 10, 11, 9, 0);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mocks.user.current = MEMBER;
  setLocation("/");
});

afterEach(() => {
  vi.useRealTimers();
});

function renderPt(path: string, page: React.ReactNode, user: User = MEMBER) {
  pathname.current = path;
  return renderPhoneScreen(path, page, { locale: "pt-BR", user });
}

describe("the account area in Portuguese below md", () => {
  it("Profile", async () => {
    await renderPt("/profile", <ProfilePage />);

    const nav = screen.getByRole("navigation", { name: "Seções do perfil" });
    expect(within(nav).getByRole("link", { name: "Perfil" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(nav).getByRole("link", { name: "Dispositivos" }),
    ).toBeVisible();
    expect(screen.getByText("Engenheira em Acme")).toBeInTheDocument();
    expect(screen.getByText("Membro Borderless BASE")).toBeInTheDocument();
    expect(await screen.findByText("3/6 conquistados")).toBeInTheDocument();
    expect(screen.getByText("Primeiro passo")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Editar" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conta" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir sua conta" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/earned|Delete your account/)).toBeNull();
  });

  it("Devices", async () => {
    vi.useRealTimers();
    const user = userEvent.setup();
    setLocation("/profile?tab=devices");
    await renderPt("/profile", <ProfilePage />);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Ativos" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Este dispositivo")).toBeInTheDocument();
    expect(
      screen.getAllByRole("term").map((term) => term.textContent),
    ).toContain("Endereço IP");
    expect(
      screen.getByRole("region", { name: "Encerrados (últimos 30 dias)" }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Revogar o acesso de e2e-cli" }),
    );
    const sheet = screen.getByRole("alertdialog", {
      name: "Revogar o acesso de e2e-cli?",
    });
    expect(
      within(sheet)
        .getAllByRole("button")
        .map((button) => button.textContent),
    ).toEqual(["Cancelar", "Revogar acesso"]);
  });

  it("Cycles", async () => {
    await renderPt("/cycles", <CyclesPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Ciclos" }),
    ).toBeInTheDocument();
    const current = screen.getByRole("region", { name: "Ciclo atual" });
    expect(within(current).getByText("Ativo")).toBeInTheDocument();
    expect(
      await within(current).findByText(
        "12 candidaturas · 1 oferta · desde 1 de set.",
      ),
    ).toBeInTheDocument();
    expect(
      within(current).getByRole("button", { name: "Novo ciclo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Arquivados" }),
    ).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "Ver" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Excluir Primavera 2026" }),
    ).toBeInTheDocument();
  });

  it("Reports, open and closed", async () => {
    const { unmount } = await renderPt("/reports", <ReportPage />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Meus relatórios — 120 dias",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("progressbar", { name: "Progresso do desafio" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Fase 1 · vence em 28 de out.")).toBeVisible();
    expect(screen.getByRole("link", { name: "Preencher" })).toBeInTheDocument();
    expect(screen.getByText("Dia 28 · Fase 1")).toBeInTheDocument();
    expect(screen.getByText("Indisponível")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conta" })).toBeInTheDocument();
    unmount();

    await renderPt("/reports", <ReportPage />, { ...SAM, badges: [] });
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Os relatórios são para membros BASE e PSP da Borderless",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar novamente" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: "Visitar a Borderless Abre em uma nova aba.",
      }),
    ).toBeInTheDocument();
  });

  it("a report day", async () => {
    await renderPt(
      "/reports/14",
      <ReportDayRoute day={14 as ReportDaysType} />,
    );

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Relatório — dia 14 de 120",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Relatórios",
      }),
    ).toBeInTheDocument();
    expect(
      await within(screen.getByRole("banner")).findByText("Pendente"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Maior conquista" }),
    ).toHaveAccessibleDescription("280 caracteres");
    expect(
      screen.getByRole("button", { name: "Enviar relatório" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeInTheDocument();
  });

  it("the admin dashboard and its header", async () => {
    await renderPt(
      "/admin",
      <AdminLayout>
        <AdminPage />
      </AdminLayout>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Console de administração",
      }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "Seções da administração",
    });
    expect(within(nav).getByRole("link", { name: "Painel" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Sistema")).toBeInTheDocument();
    expect(await screen.findByText("Total de usuários")).toBeInTheDocument();
    expect(screen.getByText("Últimos 6 meses")).toBeInTheDocument();
    expect(
      await screen.findByRole("img", {
        name: "Novos usuários por mês, de 38 em junho a 112 em novembro",
      }),
    ).toBeInTheDocument();
  });

  it("the admin Jobs and Report webhooks boards", async () => {
    const { unmount } = await renderPt("/admin/jobs", <JobsPage />);
    expect(
      await screen.findByRole("switch", { name: "Coletar de Himalayas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Executar agora" }),
    ).toBeInTheDocument();
    unmount();

    // v3/AdminWebhook (PRD 0022): the section heads itself with its lead.
    await renderPt(
      "/admin/report-webhooks",
      <AdminLayout>
        <ReportWebhooksPage />
      </AdminLayout>,
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Webhooks de relatório" }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(
      screen.getByText(
        "Cada webhook tem um ou mais selos. O relatório quinzenal de um membro é enviado a todo webhook que tem o selo BASE ou PSP dele.",
      ),
    ).toHaveClass("ph-lead");
    expect(
      screen.getByRole("button", { name: "Adicionar webhook" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Editar webhook sem rótulo" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir webhook sem rótulo" }),
    ).toBeInTheDocument();
  });
});
