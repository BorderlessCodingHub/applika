import {
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { JobsPage } from "@/app/(protected)/jobs/jobs-page";
import { JobViewPage } from "@/app/(protected)/jobs/view/job-view-page";
import { JobDetailView, JobNotListed } from "@/components/jobs/job-detail-view";
import { StartApplicationDialog } from "@/components/jobs/start-application-dialog";
import {
  jobCountLabel,
  moreFiltersLabel,
  publishedLabel,
  publishedTitle,
  summarizeJobFilters,
} from "@/components/jobs/job-copy";
import {
  makeCv,
  makeDetail,
  makeJob,
  makePage,
} from "@/components/jobs/job-test-fixtures";
import { MY_FEATURES_QUERY_KEY } from "@/hooks/use-features";
import { jobApiDetail } from "@/hooks/use-jobs";
import { loadMessages } from "@/i18n/load-messages";
import { LocaleProvider, useLocaleSwitch } from "@/i18n/locale-provider";
import { setTranslatorLocale } from "@/i18n/translator";
import { renderInPortuguese } from "@/test/portuguese";
import type { MyFeature } from "@/services/types/features";
import { DEFAULT_JOB_FILTERS } from "@/services/types/jobs";

/**
 * The job board in Portuguese (plan 0019): every word the app owns follows
 * the language — headings, filters, sort, the card, the saved-search dialog,
 * the job view, errors by code — while the posting itself (title, company,
 * location, salary, tags, description, the source's name) shows as sent.
 */

const listJobs = vi.fn();
const getJob = vi.fn();
const dismissJob = vi.fn();
const listBaseCvs = vi.fn();
const listSearches = vi.fn();
const createSearch = vi.fn();
const removeSearch = vi.fn();

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: async () => FEATURES },
    jobs: {
      list: (...args: unknown[]) => listJobs(...args),
      get: (...args: unknown[]) => getJob(...args),
      dismiss: (...args: unknown[]) => dismissJob(...args),
      restore: vi.fn(),
    },
    baseCvs: { list: (...args: unknown[]) => listBaseCvs(...args) },
    jobSearches: {
      list: (...args: unknown[]) => listSearches(...args),
      create: (...args: unknown[]) => createSearch(...args),
      update: vi.fn(),
      remove: (...args: unknown[]) => removeSearch(...args),
    },
    applicationDrafts: { createFromJob: vi.fn() },
  },
}));

const urlListeners = new Set<() => void>();
function useTestSearchParams() {
  const search = useSyncExternalStore(
    (listener) => {
      urlListeners.add(listener);
      return () => urlListeners.delete(listener);
    },
    () => window.location.search,
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => useTestSearchParams(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const FEATURES: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];

/** An axios-shaped rejection carrying an error code, as the API sends it. */
function codedError(status: number, detail: string, code: string) {
  return Object.assign(new Error(`Request failed with status ${status}`), {
    isAxiosError: true,
    response: { status, data: { detail, code } },
  });
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(MY_FEATURES_QUERY_KEY, FEATURES);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const originalPush = window.history.pushState.bind(window.history);
const originalReplace = window.history.replaceState.bind(window.history);

beforeEach(() => {
  originalReplace(null, "", "/jobs");
  const notify = () => urlListeners.forEach((listener) => listener());
  window.history.pushState = (...args: Parameters<History["pushState"]>) => {
    originalPush(...args);
    notify();
  };
  window.history.replaceState = (
    ...args: Parameters<History["replaceState"]>
  ) => {
    originalReplace(...args);
    notify();
  };
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  };
  listJobs.mockReset().mockResolvedValue(
    makePage([
      makeJob({
        tags: ["python", "django", "c", "d", "e", "f", "g", "h"],
      }),
    ]),
  );
  getJob.mockReset().mockResolvedValue(makeDetail());
  dismissJob.mockReset().mockResolvedValue(undefined);
  listBaseCvs.mockReset().mockResolvedValue([makeCv("7", "Backend CV")]);
  listSearches.mockReset().mockResolvedValue([]);
  createSearch.mockReset().mockResolvedValue({});
  removeSearch.mockReset().mockResolvedValue(undefined);
  vi.mocked(toast.error).mockReset();
});

afterEach(() => {
  window.history.pushState = originalPush;
  window.history.replaceState = originalReplace;
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  document.documentElement.lang = "en";
});

describe("/jobs in Portuguese", () => {
  it("the heading, filters, sort and a card are in Portuguese; the posting stays as sent", async () => {
    const user = userEvent.setup();
    await renderInPortuguese(<JobsPage />, { wrapper: Providers });

    expect(
      screen.getByRole("heading", { level: 1, name: "Vagas" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Vagas remotas do Himalayas e do RemoteOK, comparadas com seus CVs principais.",
      ),
    ).toBeInTheDocument();

    const filters = screen.getByRole("search", { name: "Filtrar vagas" });
    expect(
      within(filters).getByRole("searchbox", { name: "Buscar vagas" }),
    ).toHaveAttribute("placeholder", "Cargo, empresa ou texto");
    expect(
      within(filters).getByRole("combobox", { name: "Fonte" }),
    ).toHaveTextContent("Todas as fontes");
    const sort = within(filters).getByRole("combobox", { name: "Ordenar" });
    expect(sort).toHaveTextContent("Recentes");
    expect(within(filters).getByLabelText("Mostrar dispensadas")).toBeVisible();

    await user.click(
      within(filters).getByRole("button", { name: "Mais filtros" }),
    );
    expect(within(filters).getByLabelText("Tags")).toHaveAttribute(
      "placeholder",
      "Adicione uma tag e pressione Enter",
    );
    expect(
      within(filters).getByLabelText("Aderência mínima"),
    ).toHaveTextContent("Qualquer aderência");
    expect(
      within(filters).getByLabelText("Publicada há no máximo"),
    ).toHaveTextContent("Qualquer data");

    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    // The count, in Portuguese.
    expect(screen.getByText("1 vaga")).toBeInTheDocument();
    for (const name of ["Dispensar", "Iniciar candidatura"]) {
      expect(within(card).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(within(card).getByText("Aderência 72%")).toBeInTheDocument();
    expect(within(card).getByText("+2 outras")).toBeInTheDocument();
    // Posting data from the API, as sent (AC5, AC8).
    for (const text of [
      "Acme Remote",
      "Himalayas",
      "Worldwide",
      "$120k - $150k",
      "python",
    ]) {
      expect(within(card).getByText(text)).toBeInTheDocument();
    }
    // The relative date, by date-fns' Portuguese.
    expect(card.querySelector("time")?.textContent).toMatch(/^há /);

    await user.click(sort);
    expect(
      await screen.findByRole("option", { name: "Aderência" }),
    ).toBeInTheDocument();
  });

  it("the saved-search dialog is in Portuguese, and a 409 reads its code's words", async () => {
    const user = userEvent.setup();
    createSearch.mockRejectedValue(
      codedError(
        409,
        "A saved search with this name already exists",
        "JOB-1004",
      ),
    );
    await renderInPortuguese(<JobsPage />, { wrapper: Providers });

    await user.click(screen.getByRole("button", { name: /^Buscas salvas/ }));
    expect(await screen.findByText("Nenhuma busca salva ainda")).toBeVisible();
    expect(screen.getByText("0 de 10")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Salvar a busca atual" }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Salvar a busca atual",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Salva o texto da busca, os filtros e a ordenação com um nome.",
    );
    // An empty name: the schema's message, in Portuguese.
    await user.click(
      within(dialog).getByRole("button", { name: "Salvar busca" }),
    );
    expect(
      await within(dialog).findByText("Dê um nome a esta busca"),
    ).toBeVisible();

    await user.type(within(dialog).getByLabelText("Nome"), "Remoto Python");
    await user.click(
      within(dialog).getByRole("button", { name: "Salvar busca" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Já existe uma busca salva com este nome",
    );
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });

  it("a saved-search failure with no words shows the generic line in Portuguese", async () => {
    const user = userEvent.setup();
    createSearch.mockRejectedValue(
      Object.assign(new Error("boom"), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      }),
    );
    await renderInPortuguese(<JobsPage />, { wrapper: Providers });
    await user.click(screen.getByRole("button", { name: /^Buscas salvas/ }));
    await user.click(
      await screen.findByRole("button", { name: "Salvar a busca atual" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Salvar a busca atual",
    });
    await user.type(within(dialog).getByLabelText("Nome"), "Remoto");
    await user.click(
      within(dialog).getByRole("button", { name: "Salvar busca" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Algo deu errado. Tente de novo.",
    );
  });

  it("a saved-search delete failure with no words shows the generic line in Portuguese", async () => {
    const user = userEvent.setup();
    listSearches.mockResolvedValue([
      {
        id: "s-1",
        name: "Remoto",
        filters: DEFAULT_JOB_FILTERS,
        created_at: "2026-10-01T00:00:00Z",
        updated_at: "2026-10-01T00:00:00Z",
      },
    ]);
    removeSearch.mockRejectedValue(
      Object.assign(new Error("boom"), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      }),
    );
    await renderInPortuguese(<JobsPage />, { wrapper: Providers });
    await user.click(screen.getByRole("button", { name: /^Buscas salvas/ }));
    await user.click(
      await screen.findByRole("button", { name: "Excluir Remoto" }),
    );
    const dialog = await screen.findByRole("alertdialog", {
      name: "Excluir esta busca salva?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Excluir busca" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Algo deu errado. Tente de novo.",
    );
  });

  it("a failed dismissal toasts its code's words in Portuguese", async () => {
    const user = userEvent.setup();
    dismissJob.mockRejectedValue(codedError(404, "Job not found", "JOB-1001"));
    await renderInPortuguese(<JobsPage />, { wrapper: Providers });

    const card = await screen.findByRole("article", {
      name: "Senior Backend Engineer",
    });
    await user.click(within(card).getByRole("button", { name: "Dispensar" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Vaga não encontrada"),
    );
  });

  it("a failed load shows the Portuguese title and the generic line", async () => {
    listJobs.mockRejectedValue(
      Object.assign(new Error("boom"), {
        isAxiosError: true,
        response: { status: 500, data: { detail: [{ msg: "x" }] } },
      }),
    );
    await renderInPortuguese(<JobsPage />, { wrapper: Providers });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Não foi possível carregar as vagas");
    expect(alert).toHaveTextContent("Algo deu errado");
    expect(
      within(alert).getByRole("button", { name: "Tentar de novo" }),
    ).toBeInTheDocument();
  });
});

describe("the job view in Portuguese", () => {
  const now = new Date("2026-10-12T12:00:00Z");

  it("labels, fit and actions are in Portuguese; the posting stays as sent", async () => {
    await renderInPortuguese(
      <JobDetailView
        job={makeDetail({
          application: { id: "9", is_draft: false },
          is_active: false,
        })}
        cvs={[makeCv("7", "Backend CV"), makeCv("8", "Frontend CV")]}
        onStart={() => {}}
        onDismiss={() => {}}
        onRestore={() => {}}
        now={now}
      />,
      { wrapper: Providers },
    );

    expect(
      screen.getByRole("link", { name: "Voltar para as vagas" }),
    ).toHaveAttribute("href", "/jobs");
    expect(screen.getByText("há 3 dias")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver no Himalayas" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Site da empresa" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Enviada" })).toHaveAttribute(
      "href",
      "/applications?focus=9",
    );
    expect(
      screen.getByRole("button", { name: "Iniciar candidatura" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Dispensar" })).toBeVisible();
    expect(
      screen.getByText(
        "Esta vaga não está mais listada. Você ainda a vê porque iniciou uma candidatura a partir dela.",
      ),
    ).toBeVisible();

    const fit = screen.getByRole("region", { name: "Sua aderência" });
    expect(within(fit).getByText("Aderência 72%")).toBeVisible();
    expect(within(fit).getByText("Encontradas")).toBeVisible();
    expect(within(fit).getByText("Faltando")).toBeVisible();
    // A CV with no fit row yet.
    expect(within(fit).getByText("Sem aderência")).toBeVisible();

    expect(screen.getByRole("region", { name: "Descrição" })).toHaveTextContent(
      "We build APIs.",
    );
    for (const text of [
      "Senior Backend Engineer",
      "Acme Remote",
      "Worldwide",
    ]) {
      expect(screen.getByText(text)).toBeInTheDocument();
    }
  });

  it("a failed job load says so in Portuguese", async () => {
    originalReplace(null, "", "/jobs/view?id=101");
    getJob.mockRejectedValue(
      Object.assign(new Error("boom"), {
        isAxiosError: true,
        response: { status: 500, data: {} },
      }),
    );
    await renderInPortuguese(<JobViewPage />, { wrapper: Providers });
    const alert = await screen.findByRole("alert");
    expect(
      within(alert).getByRole("heading", {
        level: 1,
        name: "Não foi possível carregar esta vaga",
      }),
    ).toBeInTheDocument();
    expect(alert).toHaveTextContent("Algo deu errado");
    expect(
      screen.getByRole("link", { name: "Voltar para as vagas" }),
    ).toBeInTheDocument();
  });

  it("the start dialog is in Portuguese; the job and CV names stay as sent", async () => {
    const user = userEvent.setup();
    const { rerender } = await renderInPortuguese(
      <StartApplicationDialog
        open
        onOpenChange={() => {}}
        job={{ title: "Senior Backend Engineer", company_name: "Acme Remote" }}
        cvs={[{ id: "7", name: "Backend CV", fit: 100 }]}
        canTailor
        onSubmit={() => {}}
      />,
    );
    const dialog = screen.getByRole("dialog", {
      name: "Iniciar uma candidatura",
    });
    expect(dialog).toHaveAccessibleDescription(
      "Cria um rascunho a partir de Senior Backend Engineer em Acme Remote. Você o conclui na próxima página.",
    );
    expect(within(dialog).getByText("CV principal")).toBeVisible();
    expect(
      within(dialog).getByRole("radio", { name: "Backend CV" }),
    ).toBeChecked();
    expect(within(dialog).getByText("Aderência 100%")).toBeVisible();
    expect(within(dialog).getByRole("radio", { name: "Sem CV" })).toBeVisible();
    expect(within(dialog).getByText("Cópia do CV")).toBeVisible();
    expect(
      within(dialog).getByRole("radio", { name: "Cópia fiel" }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole("radio", { name: "Adaptar por palavras-chave" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Criar rascunho" }),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeVisible();

    rerender(
      <StartApplicationDialog
        open
        onOpenChange={() => {}}
        job={{ title: "Senior Backend Engineer", company_name: "Acme Remote" }}
        cvs={[]}
        canTailor
        onSubmit={() => {}}
        conflict={{ application: { id: "9", is_draft: true } }}
      />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Você já tem uma candidatura para esta vaga",
    );
    expect(
      screen.getByRole("link", { name: "Abrir rascunho" }),
    ).toBeInTheDocument();
  });

  it("a job no longer listed says so in Portuguese", async () => {
    await renderInPortuguese(<JobNotListed />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Esta vaga não está mais listada",
      }),
    ).toBeInTheDocument();
  });
});

describe("job board dates and numbers follow the language", () => {
  const posted = "2026-10-09T12:00:00Z";
  const now = new Date("2026-10-12T12:00:00Z");

  it("English keeps today's words", () => {
    expect(jobCountLabel(1234)).toBe("1,234 jobs");
    expect(jobCountLabel(1)).toBe("1 job");
    expect(moreFiltersLabel(2)).toBe("More filters (2 active)");
    expect(publishedLabel(posted, now)).toBe("3 days ago");
    expect(publishedTitle(posted)).toMatch(/^Oct 9, 2026/);
    expect(
      summarizeJobFilters({
        ...DEFAULT_JOB_FILTERS,
        sort: "fit",
        min_fit: 60,
        posted_within_days: 7,
        include_dismissed: true,
      }),
    ).toBe("Best fit · Fit 60%+ · 7 days · With dismissed");
  });

  it("Portuguese groups numbers and writes dates its way", async () => {
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    expect(jobCountLabel(1234)).toBe("1.234 vagas");
    expect(jobCountLabel(0)).toBe("0 vagas");
    expect(jobCountLabel(1)).toBe("1 vaga");
    expect(moreFiltersLabel(0)).toBe("Mais filtros");
    expect(moreFiltersLabel(1)).toBe("Mais filtros (1 ativo)");
    expect(moreFiltersLabel(2)).toBe("Mais filtros (2 ativos)");
    expect(publishedLabel(posted, now)).toBe("há 3 dias");
    expect(publishedLabel(now.toISOString(), now)).toBe("agora mesmo");
    expect(publishedTitle(posted)).toMatch(/^9 de out\. de 2026/);
    expect(
      summarizeJobFilters({
        ...DEFAULT_JOB_FILTERS,
        sort: "fit",
        min_fit: 60,
        posted_within_days: 1,
        include_dismissed: true,
      }),
    ).toBe("Melhor aderência · Aderência 60%+ · 1 dia · Com dispensadas");
  });

  it("jobApiDetail's own fallback follows the language", async () => {
    const wordless = { isAxiosError: true, response: { data: {} } };
    expect(jobApiDetail(wordless)).toBe("Something went wrong. Try again.");
    setTranslatorLocale("pt-BR", await loadMessages("pt-BR"));
    expect(jobApiDetail(wordless)).toBe("Algo deu errado. Tente de novo.");
  });
});

let localeSwitch: ReturnType<typeof useLocaleSwitch> | null = null;
function Grab() {
  const current = useLocaleSwitch();
  useEffect(() => {
    localeSwitch = current;
  });
  return null;
}

describe("a language switch re-renders the job board in place (AC2)", () => {
  it("words swap at once; the typed search and the open panel stay", async () => {
    const user = userEvent.setup();
    render(
      <Providers>
        <LocaleProvider>
          <Grab />
          <JobsPage />
        </LocaleProvider>
      </Providers>,
    );
    await screen.findByRole("article", { name: "Senior Backend Engineer" });
    const search = screen.getByRole("searchbox", { name: "Search jobs" });
    await user.type(search, "rust");
    await user.click(screen.getByRole("button", { name: "More filters" }));

    await act(async () => {
      localeSwitch!.setLocale("pt-BR");
    });
    await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));

    expect(
      await screen.findByRole("heading", { level: 1, name: "Vagas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Buscar vagas" })).toHaveValue(
      "rust",
    );
    expect(screen.getByLabelText("Aderência mínima")).toBeVisible();
    const card = screen.getByRole("article", {
      name: "Senior Backend Engineer",
    });
    expect(
      within(card).getByRole("button", { name: "Dispensar" }),
    ).toBeVisible();
    expect(within(card).getByText("Aderência 72%")).toBeVisible();

    await act(async () => {
      localeSwitch!.setLocale("en");
    });
    await waitFor(() => expect(document.documentElement.lang).toBe("en"));
    expect(
      await screen.findByRole("heading", { level: 1, name: "Jobs" }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /^Dismiss$/ }),
    ).toBeVisible();
  });
});
