import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";

import { JobsPage } from "./jobs-page";
import { formatJobLastRun } from "@/components/admin/job-sources-copy";
import { DEFAULT_LOCALE } from "@/i18n/config";
import { loadMessages } from "@/i18n/load-messages";
import en from "@/i18n/messages/en.json";
import { setTranslatorLocale } from "@/i18n/translator";
import { services } from "@/services/services";
import type { AdminJobSource } from "@/services/types/admin";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The admin job sources page in Portuguese: headers, the outcome words, the
 * last run date and the counts follow the language; a source's
 * `last_run_error` is data and shows exactly as the API sends it. A run
 * refusal reads by its code, never by its `detail`.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getJobSources: vi.fn(),
      updateJobSource: vi.fn(),
      startJobRun: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const RUN_ERROR =
  "GET https://remoteok.com/api answered 429 Too Many Requests (retry after 3600s)";

const HIMALAYAS: AdminJobSource = {
  id: "s1",
  code: "himalayas",
  name: "Himalayas",
  base_url: "https://himalayas.app/jobs/api",
  platform_id: null,
  is_enabled: true,
  last_run_at: "2026-10-12T14:00:00Z",
  last_run_status: "ok",
  last_run_error: null,
  last_run_found: 1412,
  last_run_saved: 37,
  active_jobs: 1203,
};

const REMOTEOK: AdminJobSource = {
  ...HIMALAYAS,
  id: "s2",
  code: "remoteok",
  name: "RemoteOK",
  base_url: "https://remoteok.com/api",
  last_run_status: "blocked",
  last_run_error: RUN_ERROR,
  last_run_found: null,
  last_run_saved: null,
  active_jobs: 0,
};

function refused(status: number, data: Record<string, unknown>) {
  return Object.assign(new Error(`HTTP ${status}`), {
    isAxiosError: true,
    response: { status, data },
  });
}

function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <JobsPage />
    </QueryClientProvider>
  );
}

function row(name: string) {
  return screen
    .getByRole("rowheader", { name: new RegExp(name) })
    .closest("tr") as HTMLTableRowElement;
}

beforeEach(() => {
  vi.mocked(services.admin.getJobSources).mockReset();
  vi.mocked(services.admin.startJobRun).mockReset();
  vi.mocked(toast.success).mockReset();
});

describe("JobsPage in Portuguese", () => {
  it("translates the headers, the outcomes and the counts; last_run_error stays as sent", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([
      HIMALAYAS,
      REMOTEOK,
    ]);
    await renderInPortuguese(page());

    expect(
      await screen.findByRole("heading", { level: 1, name: "Fontes de vagas" }),
    ).toBeInTheDocument();
    const table = screen.getByRole("table", { name: "Fontes de vagas" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "Fonte",
      "Ativa",
      "Última execução",
      "Status",
      "Encontradas",
      "Salvas",
      "Vagas ativas",
      "Último erro",
    ]);

    const himalayas = row("Himalayas");
    expect(
      within(himalayas).getByRole("switch", { name: "Coletar de Himalayas" }),
    ).toBeChecked();
    expect(within(himalayas).getByText("1.412")).toBeInTheDocument();
    expect(within(himalayas).getByText("1.203")).toBeInTheDocument();
    expect(within(himalayas).getByText(/^OK$/)).toBeInTheDocument();
    expect(
      within(himalayas).getByText(/^12 de out\.( de 2026)? 14:00 UTC$/),
    ).toHaveAttribute("dateTime", HIMALAYAS.last_run_at);

    const remoteok = row("RemoteOK");
    expect(within(remoteok).getByText("Bloqueada")).toBeInTheDocument();
    expect(within(remoteok).getByText("remoteok.com")).toBeInTheDocument();
    // R-021: the worker's error is data, shown exactly as sent.
    expect(
      remoteok.querySelector('[data-slot="job-source-error"]'),
    ).toHaveTextContent(
      new RegExp(`^${RUN_ERROR.replace(/[.()?]/g, "\\$&")}$`),
    );
    expect(within(remoteok).getAllByText("Nenhum")).toHaveLength(2);
  });

  it("a source that never ran says so in Portuguese", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([
      {
        ...REMOTEOK,
        last_run_at: null,
        last_run_status: null,
        last_run_error: null,
      },
    ]);
    await renderInPortuguese(page());
    const remoteok = await screen.findByRole("rowheader", {
      name: /RemoteOK/,
    });
    const tr = remoteok.closest("tr") as HTMLElement;
    expect(within(tr).getByText("Nunca")).toBeInTheDocument();
    expect(within(tr).getByText("Ainda não executada")).toBeInTheDocument();
  });

  it("Run now toasts in Portuguese", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockResolvedValue({ queued: true });
    await renderInPortuguese(page());
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(
      screen.getByRole("button", { name: "Executar agora" }),
    );
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Execução iniciada"),
    );
  });

  it("a coded 409 reads the catalog words in Portuguese, never the detail", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockRejectedValue(
      refused(409, { detail: "server words", code: "ADM-1009" }),
    );
    await renderInPortuguese(page());
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(
      screen.getByRole("button", { name: "Executar agora" }),
    );
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="job-run-notice-message"]'),
      ).toHaveTextContent(/^Uma execução já está em andamento$/),
    );
    expect(
      screen.getByRole("button", { name: "Dispensar mensagem" }),
    ).toBeInTheDocument();
  });

  it("a coded 503 reads the catalog words in English too, never the detail", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockRejectedValue(
      refused(503, { detail: "server words", code: "ADM-1010" }),
    );
    render(page());
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(screen.getByRole("button", { name: "Run now" }));
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="job-run-notice-message"]'),
      ).toHaveTextContent(/^Background service unavailable$/),
    );
  });

  it("no words in the body: the fallback line in Portuguese", async () => {
    vi.mocked(services.admin.getJobSources).mockResolvedValue([HIMALAYAS]);
    vi.mocked(services.admin.startJobRun).mockRejectedValue(refused(500, {}));
    await renderInPortuguese(page());
    await screen.findByRole("rowheader", { name: /Himalayas/ });

    await userEvent.click(
      screen.getByRole("button", { name: "Executar agora" }),
    );
    expect(
      await screen.findByText(
        "Não foi possível iniciar uma execução. Tente novamente.",
      ),
    ).toBeInTheDocument();
  });
});

describe("formatJobLastRun", () => {
  const now = new Date("2026-10-14T18:30:00Z");

  it("keeps the English words byte for byte", () => {
    expect(formatJobLastRun("2026-10-14T14:00:00Z", now)).toBe(
      "Today 14:00 UTC",
    );
    expect(formatJobLastRun("2026-10-13T09:05:00Z", now)).toBe(
      "Yesterday 09:05 UTC",
    );
    expect(formatJobLastRun("2026-10-03T14:00:00Z", now)).toBe(
      "Oct 3 14:00 UTC",
    );
    expect(formatJobLastRun("2025-10-03T14:00:00Z", now)).toBe(
      "Oct 3, 2025 14:00 UTC",
    );
    expect(formatJobLastRun(null, now)).toBe("Never");
  });

  it("writes the day the Portuguese way, still in UTC", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    try {
      expect(formatJobLastRun("2026-10-14T14:00:00Z", now)).toBe(
        "Hoje 14:00 UTC",
      );
      expect(formatJobLastRun("2026-10-13T23:30:00Z", now)).toBe(
        "Ontem 23:30 UTC",
      );
      expect(formatJobLastRun("2026-10-03T14:00:00Z", now)).toBe(
        "3 de out. 14:00 UTC",
      );
      expect(formatJobLastRun("2025-10-03T14:00:00Z", now)).toBe(
        "3 de out. de 2025 14:00 UTC",
      );
      expect(formatJobLastRun(null, now)).toBe("Nunca");
    } finally {
      setTranslatorLocale(DEFAULT_LOCALE, en);
    }
  });
});
