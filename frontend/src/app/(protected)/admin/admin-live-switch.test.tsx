import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { isValidElement, useEffect, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CompaniesPage } from "./companies/companies-page";
import { FeatureViewPage } from "./features/view/feature-view-page";
import { JobsPage } from "./jobs/jobs-page";
import { ReportWebhooksPage } from "./report-webhooks/report-webhooks-page";
import { UsersPage } from "./users/users-page";
import { ActivityHeatmap } from "@/components/admin/activity-heatmap";
import { AdminNav } from "@/components/admin/admin-nav";
import {
  donutInnerLabel,
  SeniorityDonut,
} from "@/components/admin/seniority-donut";
import { TopCompaniesPanel } from "@/components/admin/top-companies-panel";
import { UserActivityTable } from "@/components/admin/user-activity-table";
import { LocaleProvider, useLocaleSwitch } from "@/i18n/locale-provider";
import { services } from "@/services/services";
import type { AdminJobSource } from "@/services/types/admin";

/**
 * AC2 on the admin screens: picking BR in the switcher turns what is already
 * on screen into Portuguese, with no remount. Words computed through the
 * module translator during render (error readers, liveCopy objects) only
 * follow when the component subscribes, so each screen is driven through a
 * real `LocaleProvider` switch.
 */

let searchParams = new URLSearchParams("key=jobs");
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
  usePathname: () => "/admin",
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));
vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getFeatures: vi.fn(),
      getFeatureUsers: vi.fn(),
      getUsers: vi.fn(),
      getUser: vi.fn(),
      getJobSources: vi.fn(),
      startJobRun: vi.fn(),
      updateJobSource: vi.fn(),
      getActivityHeatmap: vi.fn(),
      getSeniorityBreakdown: vi.fn(),
      getTopCompanies: vi.fn(),
      getCompanies: vi.fn(),
      getReportWebhooks: vi.fn(),
    },
  },
}));

let localeSwitch: ReturnType<typeof useLocaleSwitch> | null = null;
function GrabSwitch() {
  const current = useLocaleSwitch();
  useEffect(() => {
    localeSwitch = current;
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
        <GrabSwitch />
        {children}
      </LocaleProvider>
    </QueryClientProvider>
  );
}

async function switchToPortuguese() {
  await act(async () => {
    localeSwitch!.setLocale("pt-BR");
  });
  await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));
}

function coded(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

const admin = vi.mocked(services.admin);

const FEATURE = {
  key: "jobs",
  name: "Job board",
  description: null,
  stage: "beta",
  beta_user_count: 1,
  released_at: null,
  me: { has: true, via: "admin", opted_out: false },
};

const SOURCE: AdminJobSource = {
  id: "s1",
  code: "remoteok",
  name: "RemoteOK",
  base_url: "https://remoteok.com/api",
  platform_id: null,
  is_enabled: true,
  last_run_at: "2026-10-11T23:00:00Z",
  last_run_status: "failed",
  last_run_error: "GET https://remoteok.com/api answered 429",
  last_run_found: 1412,
  last_run_saved: null,
  active_jobs: 0,
};

beforeEach(() => {
  searchParams = new URLSearchParams("key=jobs");
  for (const fn of Object.values(admin)) vi.mocked(fn).mockReset();
});

afterEach(() => {
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  document.documentElement.lang = "en";
});

describe("admin screens follow a live language switch", () => {
  it("the feature view 404 heading turns Portuguese", async () => {
    admin.getFeatures.mockResolvedValue([]);
    admin.getFeatureUsers.mockRejectedValue(
      coded(404, { detail: "server words", code: "ADM-1008" }),
    );
    render(<FeatureViewPage />, { wrapper: Providers });
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Feature not found",
      }),
    ).toBeInTheDocument();

    await switchToPortuguese();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
        /^Recurso não encontrado$/,
      ),
    );
  });

  it("the feature view beta list error turns Portuguese", async () => {
    admin.getFeatures.mockResolvedValue([FEATURE] as never);
    admin.getFeatureUsers.mockRejectedValue(
      coded(403, { detail: "server words", code: "ADM-1008" }),
    );
    render(<FeatureViewPage />, { wrapper: Providers });
    await screen.findByText("Feature not found");

    await switchToPortuguese();
    await screen.findByText("Não foi possível carregar a lista beta");
    expect(screen.getByText("Recurso não encontrado")).toBeInTheDocument();
    expect(screen.queryByText("Feature not found")).not.toBeInTheDocument();
  });

  it("the jobs page: the coded notice, the table and the switch name turn Portuguese", async () => {
    admin.getJobSources.mockResolvedValue([SOURCE]);
    admin.startJobRun.mockRejectedValue(
      coded(409, { detail: "server words", code: "ADM-1009" }),
    );
    const user = userEvent.setup();
    render(<JobsPage />, { wrapper: Providers });
    await user.click(await screen.findByRole("button", { name: "Run now" }));
    await screen.findByText(/^A run is already in progress$/);
    expect(
      screen.getByRole("switch", { name: "Collect from RemoteOK" }),
    ).toBeInTheDocument();

    await switchToPortuguese();
    expect(
      await screen.findByText(/^Uma execução já está em andamento$/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("switch", { name: "Coletar de RemoteOK" }),
    ).toBeInTheDocument();
    expect(screen.getByText("1.412")).toBeInTheDocument();
    // AC5: the source's last error stays as sent.
    expect(
      screen.getByText("GET https://remoteok.com/api answered 429"),
    ).toBeInTheDocument();
  });

  it("the users page and its detail sheet turn Portuguese; the availability is sentence case", async () => {
    const row = {
      id: "u1",
      username: "maria",
      email: "maria@example.com",
      is_admin: false,
      seniority_level: "mid_level",
      total_applications: 1500,
      offers: 2,
      denials: 3,
      active_applications: 4,
      joined_at: new Date(Date.now() - 3 * 86400000).toISOString(),
      last_activity: new Date(Date.now() - 3 * 86400000).toISOString(),
      availability: "open_to_work",
      github_id: 1,
      tech_stack: [],
    };
    admin.getUsers.mockResolvedValue({
      items: [row],
      total: 1500,
      page: 1,
      per_page: 15,
      total_pages: 100,
    } as never);
    admin.getUser.mockResolvedValue(row as never);
    const user = userEvent.setup();
    render(<UsersPage />, { wrapper: Providers });
    await screen.findByText("3d ago");
    expect(screen.getByText("1500 users")).toBeInTheDocument();

    await switchToPortuguese();
    await screen.findByText("há 3 dias");
    expect(screen.getByText("1.500 usuários")).toBeInTheDocument();
    expect(screen.getByText("Pleno")).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 100")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Próxima página" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ver detalhes do usuário" }),
    );
    const availability = await screen.findByText("Aberto a oportunidades");
    expect(availability).not.toHaveClass("capitalize");
  });

  it("the dashboard pieces turn Portuguese", async () => {
    admin.getActivityHeatmap.mockResolvedValue([
      { day: 0, hour: 9, count: 1234 },
    ] as never);
    admin.getSeniorityBreakdown.mockResolvedValue([
      { level: "mid level", count: 1500, color: "#fff" },
      { level: "unknown", count: 2, color: "#000" },
    ] as never);
    admin.getTopCompanies.mockResolvedValue([
      { name: "Acme Inc", total_across_users: 2000, unique_users: 1 },
    ] as never);
    admin.getUsers.mockResolvedValue({
      items: [],
      total: 1500,
      page: 1,
      per_page: 10,
      total_pages: 150,
    } as never);
    render(
      <>
        <AdminNav />
        <ActivityHeatmap />
        <SeniorityDonut />
        <TopCompaniesPanel />
        <UserActivityTable />
      </>,
      { wrapper: Providers },
    );
    await screen.findByText("Activity Heatmap");
    await screen.findByText("Acme Inc");
    // en is today's output: plain digits, no plural on "users".
    expect(screen.getByText("1 users")).toBeInTheDocument();
    expect(screen.getByText("1500 total")).toBeInTheDocument();
    expect(screen.getByText("Mon")).toBeInTheDocument();
    expect(
      document.querySelector('[title="Mon 9:00 — 1234 applications"]'),
    ).not.toBeNull();

    await switchToPortuguese();
    await screen.findByText("Mapa de atividade");
    expect(screen.getByText("Seg")).toBeInTheDocument();
    expect(
      document.querySelector('[title="Seg 9:00 — 1.234 candidaturas"]'),
    ).not.toBeNull();
    expect(screen.getByText("Pleno")).toBeInTheDocument();
    expect(screen.getByText("Desconhecida")).toBeInTheDocument();
    expect(screen.getAllByText("1.500").length).toBeGreaterThan(0);
    expect(screen.getByText("1 usuário")).toBeInTheDocument();
    expect(screen.getByText("2.000")).toBeInTheDocument();
    expect(screen.getByText("1.500 no total")).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Seções da administração" }),
    ).toBeInTheDocument();
  });

  it("the companies page, its approve dialog and the webhook list turn Portuguese", async () => {
    admin.getCompanies.mockResolvedValue({
      items: [
        {
          id: "c-1",
          name: "Acme Inc",
          url: "https://acme.example",
          is_active: true,
          is_public: false,
          applications_count: 0,
          created_by: null,
          created_at: "2026-10-14T12:00:00Z",
        },
      ],
      total: 1,
      page: 1,
      per_page: 15,
      total_pages: 1,
    } as never);
    admin.getReportWebhooks.mockResolvedValue([
      {
        id: "w1",
        label: null,
        webhook_url_masked: "https://discord.com/api/webhooks/123/****",
        badges: ["borderless_base", "borderless_psp"],
      },
    ] as never);
    const user = userEvent.setup();
    render(
      <>
        <CompaniesPage />
        <ReportWebhooksPage />
      </>,
      { wrapper: Providers },
    );
    await screen.findByText("Acme Inc");
    await screen.findByRole("button", { name: "Delete webhook 123" });
    await user.click(screen.getByRole("button", { name: "Approve Acme Inc" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent("It cannot be made private again.");

    await switchToPortuguese();
    await waitFor(() =>
      expect(dialog).toHaveTextContent(
        "Não é possível torná-la privada de novo.",
      ),
    );
    expect(
      within(dialog).getByRole("button", { name: /^Cancelar$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Gestão de empresas")).toBeInTheDocument();
    expect(screen.getByText("14 de out. de 2026")).toBeInTheDocument();
    expect(screen.getByText("1 empresa")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Excluir webhook 123", hidden: true }),
    ).toBeInTheDocument();
  });
});

describe("the seniority donut slice count", () => {
  function slice(locale: string) {
    const node = donutInnerLabel(locale)({
      cx: 100,
      cy: 100,
      midAngle: 45,
      innerRadius: 60,
      outerRadius: 90,
      value: 1400,
      percent: 0.5,
    });
    expect(isValidElement(node)).toBe(true);
    return render(<svg>{node}</svg>).container.textContent;
  }

  it("is written the way the language writes numbers", () => {
    expect(slice("en")).toBe("1400");
    expect(slice("pt-BR")).toBe("1.400");
  });
});
