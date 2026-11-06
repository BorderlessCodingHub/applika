import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ReportWebhooksPage } from "./report-webhooks-page";
import { services } from "@/services/services";
import type { AdminReportWebhook } from "@/services/types/admin";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The report webhooks page in Portuguese: the page, the list, the confirm
 * dialog and the form validation follow the language; the label and the
 * masked address are data and stay as sent. A server answer reads by its
 * code, never by its `detail`.
 */

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getReportWebhooks: vi.fn(),
      createReportWebhook: vi.fn(),
      updateReportWebhook: vi.fn(),
      deleteReportWebhook: vi.fn(),
    },
  },
}));

const VALID_URL =
  "https://discord.com/api/webhooks/123456789012345678/abcdefghijklmnopqrstuvwxyz";

const BOTH: AdminReportWebhook = {
  id: "w3",
  label: "Shared channel",
  badges: ["borderless_base", "borderless_psp"],
  webhook_url_masked:
    "https://discord.com/api/webhooks/323456789012345678/…efgh",
  created_at: "2026-10-01T00:00:00Z",
  updated_at: null,
};

const UNLABELLED: AdminReportWebhook = {
  ...BOTH,
  id: "w4",
  label: null,
  badges: [],
  webhook_url_masked:
    "https://discord.com/api/webhooks/423456789012345678/…ijkl",
};

function coded(status: number, body: Record<string, unknown>) {
  return new AxiosError("Error", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data: body,
  });
}

function page() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <ReportWebhooksPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.mocked(services.admin.getReportWebhooks).mockReset();
  vi.mocked(services.admin.createReportWebhook).mockReset();
  vi.mocked(services.admin.deleteReportWebhook).mockReset();
});

async function submitAdd(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Adicionar webhook" }));
  await user.type(screen.getByLabelText("URL do webhook"), VALID_URL);
  await user.click(screen.getByRole("checkbox", { name: "BASE" }));
  await user.click(screen.getByRole("button", { name: "Salvar webhook" }));
}

describe("ReportWebhooksPage in Portuguese", () => {
  it("translates the page and the list; the label and address stay as sent", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([
      BOTH,
      UNLABELLED,
    ]);
    await renderInPortuguese(page());

    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Webhooks de relatório",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Shared channel")).toBeInTheDocument();
    expect(screen.getByText(BOTH.webhook_url_masked)).toBeInTheDocument();
    expect(screen.getByText("Webhook sem rótulo")).toBeInTheDocument();
    expect(screen.getByText("Sem selo, não recebe nada")).toBeInTheDocument();
    expect(screen.getAllByText("Selos")).toHaveLength(2);
    expect(
      screen.getByRole("button", { name: "Editar Shared channel" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Excluir webhook 423456789012345678",
      }),
    ).toBeInTheDocument();
  });

  it("the empty state reads in Portuguese", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    await renderInPortuguese(page());
    expect(await screen.findByText("Nenhum webhook ainda")).toBeInTheDocument();
  });

  it("the delete confirm names the badges in Portuguese", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([BOTH]);
    vi.mocked(services.admin.deleteReportWebhook).mockResolvedValue();
    const user = userEvent.setup();
    await renderInPortuguese(page());
    await screen.findByText("Shared channel");

    await user.click(
      screen.getByRole("button", { name: "Excluir Shared channel" }),
    );
    const confirm = await screen.findByRole("alertdialog");
    expect(
      within(confirm).getByRole("heading", { name: "Excluir o webhook?" }),
    ).toBeInTheDocument();
    expect(confirm).toHaveTextContent(
      "Os relatórios dos membros BASE e PSP da Borderless deixarão de ser enviados para Shared channel. Isso não pode ser desfeito.",
    );
    await user.click(within(confirm).getByRole("button", { name: "Excluir" }));
    await waitFor(() =>
      expect(services.admin.deleteReportWebhook).toHaveBeenCalledWith("w3"),
    );
  });

  it("an unlabelled row with no badge gets its own sentence", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([UNLABELLED]);
    const user = userEvent.setup();
    await renderInPortuguese(page());
    await screen.findByText("Webhook sem rótulo");

    await user.click(
      screen.getByRole("button", {
        name: "Excluir webhook 423456789012345678",
      }),
    );
    expect(await screen.findByRole("alertdialog")).toHaveTextContent(
      "Este webhook não recebe relatórios hoje. A exclusão não pode ser desfeita.",
    );
  });

  it("the form and its validation read in Portuguese", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    const user = userEvent.setup();
    await renderInPortuguese(page());
    await screen.findByText("Nenhum webhook ainda");

    await user.click(screen.getByRole("button", { name: "Adicionar webhook" }));
    const dialog = screen.getByRole("dialog");
    expect(
      within(dialog).getByRole("heading", { name: "Adicionar webhook" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText("Relatórios de membros PSP da Borderless."),
    ).toBeInTheDocument();
    await user.type(screen.getByLabelText("Rótulo"), "x".repeat(101));
    await user.click(screen.getByRole("button", { name: "Salvar webhook" }));

    expect(
      await screen.findByText("A URL do webhook é obrigatória"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Escolha pelo menos um selo: BASE ou PSP"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("O rótulo deve ter no máximo 100 caracteres"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: /^Cancelar$/ }),
    ).toBeInTheDocument();
  });

  it("a coded 409 reads the catalog words in Portuguese, never the detail", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockRejectedValue(
      coded(409, { detail: "server words", code: "ADM-1018" }),
    );
    const user = userEvent.setup();
    await renderInPortuguese(page());
    await screen.findByText("Nenhum webhook ainda");
    await submitAdd(user);

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="report-webhook-form-error"]'),
      ).toHaveTextContent(/^Este webhook já está configurado$/),
    );
  });

  it("a coded 422 with params reads the catalog words in English, never the detail", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockRejectedValue(
      coded(422, {
        detail: "server words",
        code: "ADM-1017",
        params: { max: 100 },
      }),
    );
    const user = userEvent.setup();
    render(page());
    await screen.findByText("No webhooks yet");
    await user.click(screen.getByRole("button", { name: "Add webhook" }));
    await user.type(screen.getByLabelText("Webhook URL"), VALID_URL);
    await user.click(screen.getByRole("checkbox", { name: "BASE" }));
    await user.click(screen.getByRole("button", { name: "Save webhook" }));

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="report-webhook-form-error"]'),
      ).toHaveTextContent(/^Label must be at most 100 characters$/),
    );
  });

  it("no words in the body: the fallback line in Portuguese", async () => {
    vi.mocked(services.admin.getReportWebhooks).mockResolvedValue([]);
    vi.mocked(services.admin.createReportWebhook).mockRejectedValue(
      coded(500, {}),
    );
    const user = userEvent.setup();
    await renderInPortuguese(page());
    await screen.findByText("Nenhum webhook ainda");
    await submitAdd(user);

    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="report-webhook-form-error"]'),
      ).toHaveTextContent(
        /^Não foi possível salvar o webhook\. Tente novamente\.$/,
      ),
    );
  });
});
