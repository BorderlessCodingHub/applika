import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewWithCvPage } from "@/app/(protected)/applications/new-with-cv/new-with-cv-page";
import { CvsPage } from "@/app/(protected)/cvs/cvs-page";
import { CvEditorPage } from "@/app/(protected)/cvs/editor/cv-editor-page";
import { JobsPage } from "@/app/(protected)/jobs/jobs-page";
import { JobViewPage } from "@/app/(protected)/jobs/view/job-view-page";
import {
  makeDetail,
  makeJob,
  makePage,
} from "@/components/jobs/job-test-fixtures";
import { SupportsProvider } from "@/contexts/supports-context";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import type { MyFeature } from "@/services/types/features";
import { pathname, setLocation } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * Jobs, a job (and its Start application sheet), the new application with
 * CV (both steps), CVs and the CV editor in Portuguese below md: the boards'
 * new words and the reused ones follow the language, and no English message
 * is left on screen (text, `aria-label`, `placeholder`, `title`), the way the
 * e2e pt-BR sweep reads a page. Data (a job's title, a CV's name) shows as sent.
 */

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const FEATURES: MyFeature[] = [
  { key: "jobs", stage: "beta" },
  { key: "cvs", stage: "beta" },
];

const MASTER = {
  id: "7",
  name: "CV Backend",
  full_name: "Sam Carter",
  headline: "Engenheira de Backend",
  location: "Lisboa",
  email: "sam@example.com",
  phone: null,
  summary: "Doze letras",
  links: [{ id: "l1", label: "GitHub", url: "https://github.com/sam" }],
  skills: [{ id: "s1", category: "Linguagens", keywords: ["Rust", "Go"] }],
  experience: [
    {
      id: "e1",
      company: "Acme",
      role: "Engenheira",
      start: "2021-03",
      bullets: [],
    },
  ],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
  created_at: "2026-10-01T10:00:00Z",
  updated_at: "2026-10-30T10:00:00Z",
};

const COPY = {
  ...MASTER,
  id: "copy-1",
  application_id: "draft-9",
  base_cv_id: "7",
  base_snapshot: null,
  was_ai_generated: false,
  adjustments: [{ section: "skills", description: "Rust primeiro" }],
};

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: async () => FEATURES },
    jobs: {
      list: async () =>
        makePage(
          [
            makeJob({ title: "Engenheiro Rust Sênior", tags: ["rust"] }),
            makeJob({
              id: "102",
              title: "Engenheira de Plataforma",
              application: { id: "d1", is_draft: true },
            }),
          ],
          { total: 30, total_pages: 2 },
        ),
      get: async () =>
        makeDetail({
          title: "Engenheiro Rust Sênior",
          description_text: "Rust e Kafka todos os dias.",
        }),
      dismiss: vi.fn(),
      restore: vi.fn(),
    },
    jobSearches: { list: async () => [] },
    baseCvs: {
      list: async () => [MASTER],
      get: async () => MASTER,
      update: vi.fn(),
      remove: vi.fn(),
      exportPdf: vi.fn(),
    },
    applicationDrafts: {
      list: async () => [],
      get: async (id: string) => ({
        id,
        job_id: null,
        company_id: null,
        company_name: "Acme",
        role: "Engenheira",
        platform_id: "plt-1",
        mode: "active",
        application_date: "2026-10-30",
        job_description: "Rust e Kafka.",
        has_cv: id === "draft-cv",
        created_at: "2026-10-30T10:00:00Z",
        updated_at: null,
      }),
      create: vi.fn(),
      update: vi.fn(),
      finish: vi.fn(),
      createFromJob: vi.fn(),
    },
    companies: { searchCompanies: async () => [], create: vi.fn() },
    platforms: {
      list: async () => [
        { id: "plt-1", name: "LinkedIn", url: null, is_public: true },
      ],
      create: vi.fn(),
    },
    supports: {
      getSupports: async () => ({
        platforms: [
          { id: "plt-1", name: "LinkedIn", url: null, is_public: true },
        ],
      }),
    },
    tailoredCvs: {
      get: async (id: string) => {
        if (id === "draft-cv") return { ...COPY, application_id: id };
        throw { isAxiosError: true, response: { status: 404 } };
      },
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      getFit: async () => ({
        score: 64,
        matched_keywords: ["rust"],
        missing_keywords: ["kafka"],
      }),
    },
  },
}));

/** Every English message with no arguments whose Portuguese twin differs. */
function englishMessages(): Set<string> {
  const found = new Set<string>();
  const walk = (english: unknown, portuguese: unknown) => {
    if (typeof english === "string") {
      if (
        typeof portuguese === "string" &&
        portuguese !== english &&
        !/[{}<]/.test(english) &&
        english.trim().length > 1
      ) {
        found.add(english.trim());
      }
      return;
    }
    if (english && typeof english === "object") {
      for (const [key, value] of Object.entries(english)) {
        walk(value, (portuguese as Record<string, unknown> | undefined)?.[key]);
      }
    }
  };
  walk(en, ptBR);
  return found;
}

const ENGLISH = englishMessages();

/** English left on screen: a text node, or an `aria-label`/`placeholder`/`title`. */
function englishOnScreen(): string[] {
  const left: string[] = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && ENGLISH.has(text)) left.push(text);
  }
  for (const element of document.body.querySelectorAll(
    "[aria-label], [placeholder], [title]",
  )) {
    for (const name of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(name)?.trim();
      if (value && ENGLISH.has(value)) left.push(`${name}=${value}`);
    }
  }
  return left;
}

beforeEach(() => {
  setLocation("/");
});

async function renderPt(path: string, url: string, page: React.ReactNode) {
  pathname.current = path;
  setLocation(url);
  return renderPhoneScreen(path, page, { locale: "pt-BR", features: FEATURES });
}

describe("the job, CV and draft boards in Portuguese below md", () => {
  it("Jobs", async () => {
    const user = userEvent.setup();
    await renderPt("/jobs", "/jobs", <JobsPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Vagas" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Conta" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Buscar vagas" }),
    ).toHaveAttribute("placeholder", "Buscar vagas");
    const toolbar = screen.getByRole("toolbar", {
      name: "Ordenação e filtros",
    });
    for (const chip of [
      "Aderência",
      "Recentes",
      "Todas as fontes",
      "Mais filtros",
    ]) {
      expect(within(toolbar).getByRole("button", { name: chip })).toBeVisible();
    }
    const card = await screen.findByRole("article", {
      name: "Engenheiro Rust Sênior",
    });
    expect(within(card).getByText("Aderência 72%")).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: "Dispensar" }),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("article", { name: "Engenheira de Plataforma" }),
      ).getByRole("link", { name: "Rascunho" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mostrar mais" })).toBeVisible();
    expect(screen.getByText("Novas vagas chegam a cada hora.")).toBeVisible();
    expect(englishOnScreen()).toEqual([]);

    await user.click(
      within(toolbar).getByRole("button", { name: "Mais filtros" }),
    );
    const sheet = screen.getByRole("dialog", { name: "Mais filtros" });
    expect(within(sheet).getByRole("button", { name: "Pronto" })).toBeVisible();
    expect(englishOnScreen()).toEqual([]);
  });

  it("a job and its Start application sheet", async () => {
    const user = userEvent.setup();
    await renderPt("/jobs/view", "/jobs/view?id=101", <JobViewPage />);

    await screen.findByRole("heading", {
      level: 1,
      name: "Engenheiro Rust Sênior",
    });
    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Vagas" }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Site da empresa",
      }),
    ).toBeInTheDocument();
    const fit = screen.getByRole("region", { name: "Sua aderência" });
    expect(
      await within(fit).findByRole("tab", { name: "CV Backend · 72%" }),
    ).toBeInTheDocument();
    expect(within(fit).getByText("Aderência forte")).toBeInTheDocument();
    expect(within(fit).getByText("Encontradas")).toBeInTheDocument();
    expect(within(fit).getByText("Faltando")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Descrição" })).toBeVisible();
    expect(englishOnScreen()).toEqual([]);

    await user.click(
      screen.getByRole("button", { name: "Iniciar candidatura" }),
    );
    const sheet = screen.getByRole("dialog", {
      name: "Iniciar uma candidatura",
    });
    expect(
      within(sheet).getByRole("radiogroup", { name: "CV principal" }),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("radio", { name: "Sem CV" })).toBeVisible();
    expect(
      within(sheet).getByRole("radio", { name: "Cópia fiel" }),
    ).toBeChecked();
    expect(
      within(sheet).getByRole("radio", { name: "Adaptar por palavras-chave" }),
    ).toBeVisible();
    expect(
      within(sheet).getByRole("button", { name: "Criar rascunho" }),
    ).toBeVisible();
    expect(englishOnScreen()).toEqual([]);
  });

  it("the new application with CV, step 1 and step 2", async () => {
    const user = userEvent.setup();
    const page = (
      <SupportsProvider>
        <NewWithCvPage />
      </SupportsProvider>
    );
    const { unmount } = await renderPt(
      "/applications/new-with-cv",
      "/applications/new-with-cv?id=draft-9",
      page,
    );

    await screen.findByDisplayValue("Engenheira");
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Nova candidatura com CV",
      }),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Candidaturas",
      }),
    ).toBeInTheDocument();
    const steps = screen.getByRole("navigation", { name: "Passos" });
    expect(
      within(steps).getByRole("button", { name: "Passo 1: Candidatura" }),
    ).toHaveAttribute("aria-current", "step");
    await user.click(screen.getByRole("button", { name: "Mais detalhes" }));
    expect(
      screen.getByRole("button", { name: "Seguir para o CV" }),
    ).toBeVisible();
    expect(englishOnScreen()).toEqual([]);
    unmount();

    await renderPt(
      "/applications/new-with-cv",
      "/applications/new-with-cv?id=draft-cv&step=cv",
      page,
    );
    expect(
      await screen.findByRole("list", { name: "Seções da cópia do CV" }),
    ).toBeInTheDocument();
    expect(await screen.findByText("Reordenada")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        document.querySelector('[data-slot="cv-fit-panel"]'),
      ).not.toBeNull(),
    );
    expect(englishOnScreen()).toEqual([]);
    await user.click(
      screen.getByRole("button", { name: "Editar a cópia do CV" }),
    );
    expect(
      screen.getByRole("button", { name: "Identidade e contato" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(englishOnScreen()).toEqual([]);
  });

  it("CVs and its delete sheet", async () => {
    const user = userEvent.setup();
    await renderPt("/cvs", "/cvs", <CvsPage />);

    await screen.findByRole("heading", { level: 2, name: "CV Backend" });
    expect(
      screen.getByRole("heading", { level: 1, name: "CVs" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Editar CV Backend" }),
    ).toBeVisible();
    expect(screen.getByText("Atualizado em 30 de out. de 2026")).toBeVisible();
    expect(screen.getByText("Novo CV principal")).toBeVisible();
    expect(screen.getByText("2 de 3 espaços livres")).toBeVisible();
    expect(englishOnScreen()).toEqual([]);

    await user.click(
      screen.getByRole("button", { name: "Excluir CV Backend" }),
    );
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
    expect(englishOnScreen()).toEqual([]);
  });

  it("the CV editor", async () => {
    await renderPt("/cvs/editor", "/cvs/editor?id=7", <CvEditorPage />);

    expect(await screen.findByDisplayValue("Sam Carter")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Editar CV principal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Baixar PDF" }),
    ).toHaveTextContent("PDF");
    expect(
      screen.getByRole("button", { name: "Links" }),
    ).toHaveAccessibleDescription("1 link");
    expect(
      screen.getByRole("button", { name: "Salvar alterações" }),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: "Cancelar" })).toBeVisible();
    expect(englishOnScreen()).toEqual([]);
  });
});
