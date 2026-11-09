import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ApplicationCvPage } from "@/app/(protected)/applications/cv/application-cv-page";
import { NewCvPage } from "@/app/(protected)/cvs/new/new-cv-page";
import type { BaseCv } from "@/components/base-cvs/types";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import type { Application } from "@/services/types/applications";
import type { MyFeature } from "@/services/types/features";
import type { TailoredCv } from "@/services/types/tailored-cv";
import { pathname, setLocation } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * The v3 CV boards in Portuguese below md: the new master CV page (v3/CVNew)
 * with its rows, the live preview card, the action bar and the limit state;
 * an application's CV copy (v3/ApplicationCV): the picker, the editor and a
 * closed application's copy.
 * The boards' words are today's keys; they follow the language, and no
 * English word of the screen is left on the phone.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  features: { current: [] as { key: string; stage: string }[] },
  getApplications: vi.fn(),
  getCopy: vi.fn(),
  getFit: vi.fn(),
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: SAM, isLoading: false, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const CVS: MyFeature[] = [{ key: "cvs", stage: "beta" }];

vi.mock("@/services/services", () => ({
  services: {
    features: { getMine: () => Promise.resolve(mocks.features.current) },
    applications: {
      getApplications: (...args: unknown[]) => mocks.getApplications(...args),
    },
    tailoredCvs: {
      get: (...args: unknown[]) => mocks.getCopy(...args),
      getFit: (...args: unknown[]) => mocks.getFit(...args),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    baseCvs: {
      list: (...args: unknown[]) => mocks.list(...args),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
  },
}));

type Messages = { [key: string]: string | Messages };

function leaves(tree: Messages, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
}

/** The namespaces the new master CV page reads. */
const SCREEN_NAMESPACES = [
  "cvs.new.",
  "cvs.page.back",
  "cvs.list.loading",
  "cvs.editor.cancel",
  "cvs.sections.",
  "cvs.fields.",
  "cvs.preview.",
  "cvs.export.layoutNotice",
  "phone.cvEditor.",
  "phone.shell.",
  "nav.cvs",
];

const PT = new Map(leaves(ptBR as Messages));

/** Every English word of this screen that Portuguese says differently (no ICU arguments). */
const ENGLISH = new Set(
  leaves(en as Messages)
    .filter(([key]) => SCREEN_NAMESPACES.some((ns) => key.startsWith(ns)))
    .filter(([key, value]) => PT.get(key) !== value && !/[{<]/.test(value))
    .map(([, value]) => value),
);

/** The namespaces an application's CV copy reads (v3/ApplicationCV). */
const COPY_NAMESPACES = [
  "cvs.applicationCv.",
  "cvs.tailored.",
  "cvs.fit.",
  "cvs.diff.",
  "cvs.card.",
  "cvs.new.",
  "cvs.list.",
  "cvs.export.",
  "cvs.sections.",
  "cvs.fields.",
  "phone.applicationCv.",
  "phone.cvEditor.",
  "phone.draft.reordered",
  "phone.cvs.deleting",
  "phone.shell.",
  "jobs.matched",
  "jobs.missing",
  "jobs.noneMatched",
  "jobs.noneMissing",
];

const COPY_ENGLISH = new Set(
  leaves(en as Messages)
    .filter(([key]) => COPY_NAMESPACES.some((ns) => key.startsWith(ns)))
    .filter(([key, value]) => PT.get(key) !== value && !/[{<]/.test(value))
    .map(([, value]) => value),
);

/** English left in the visible words, names and placeholders under `root`. */
function englishLeft(root: HTMLElement, english = ENGLISH): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && english.has(text)) found.push(text);
  }
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(attribute);
      if (value && english.has(value)) found.push(`${attribute}=${value}`);
    }
  }
  return found;
}

const board = () =>
  document.querySelector<HTMLElement>('[data-slot="phone-cv-new"]');

function renderPt() {
  pathname.current = "/cvs/new";
  return renderPhoneScreen("/cvs/new", <NewCvPage />, {
    locale: "pt-BR",
    features: CVS,
  });
}

beforeEach(() => {
  mocks.list.mockReset().mockResolvedValue([]);
  mocks.features.current = CVS;
});

describe("the v3 CV boards in Portuguese below md", () => {
  it("guards the check: it knows the screen's English words", () => {
    for (const word of [
      "New master CV",
      "Create CV",
      "Live preview",
      "Preview does not show the final PDF layout.",
      "Identity and contact",
      "Back to CVs",
      "Needs a fix",
      "CV preview pages",
    ]) {
      expect(ENGLISH.has(word), word).toBe(true);
    }
  });

  it("/cvs/new: the rows, the live preview card and the bar", async () => {
    const user = userEvent.setup();
    await renderPt();

    await waitFor(() => expect(board()).toHaveAttribute("data-state", "form"));
    // The shell's bar (the CV sheet's own <header> reads as a banner in jsdom).
    const bar = within(
      document.querySelector<HTMLElement>('[data-slot="phone-top-bar"]')!,
    );
    expect(bar.getByRole("link", { name: "CVs" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(bar.getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "Novo CV principal" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Escreva uma vez. Toda candidatura que você adaptar começa daqui.",
      ),
    ).toBeInTheDocument();

    const identity = screen.getByRole("button", {
      name: "Identidade e contato",
    });
    expect(identity).toHaveAttribute("aria-expanded", "true");
    expect(identity).toHaveAccessibleDescription(
      "O cabeçalho do topo do seu CV, mais o nome pelo qual você reconhece este CV.",
    );
    expect(
      screen.getByRole("button", { name: "Habilidades" }),
    ).toHaveAccessibleDescription(
      "Agrupe suas habilidades em categorias. Cada categoria sai impressa em uma linha própria.",
    );

    const card = screen.getByRole("region", { name: "Pré-visualização" });
    expect(
      within(card).getByRole("group", {
        name: "Páginas da pré-visualização do CV",
      }),
    ).toBeInTheDocument();
    expect(within(card).getByText("Página 1 de 1")).toBeInTheDocument();
    expect(
      screen.getAllByText(
        "A pré-visualização não mostra o layout final do PDF.",
      ),
    ).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/cvs",
    );
    expect(
      screen.getByRole("button", { name: "Criar CV" }),
    ).toBeInTheDocument();
    expect(englishLeft(document.body)).toEqual([]);

    // An empty list row, opened; then a failed submit marks Identity.
    await user.click(screen.getByRole("button", { name: "Links" }));
    expect(
      screen.getByRole("button", { name: "Identidade e contato" }),
    ).toHaveAttribute("aria-expanded", "false");
    await user.click(screen.getByRole("button", { name: "Criar CV" }));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Identidade e contato" }),
      ).toHaveAccessibleDescription("Precisa de ajuste"),
    );
    expect(englishLeft(document.body)).toEqual([]);
  });

  it("/cvs/new at three master CVs: the limit sentence and Voltar para os CVs", async () => {
    mocks.list.mockResolvedValue([{ id: "1" }, { id: "2" }, { id: "3" }]);
    await renderPt();

    expect(
      await screen.findByText(
        "Você já tem 3 CVs principais — o limite é três. Exclua um para criar outro.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para os CVs" }),
    ).toHaveAttribute("href", "/cvs");
    expect(englishLeft(document.body)).toEqual([]);
  });

  it("/cvs/new while the count loads: Carregando seus CVs principais", async () => {
    mocks.list.mockReturnValue(new Promise(() => {}));
    await renderPt();

    expect(
      document.querySelector('[data-slot="phone-skeleton"]'),
    ).toHaveTextContent("Carregando seus CVs principais");
    expect(englishLeft(document.body)).toEqual([]);
  });
});

const MASTER: BaseCv = {
  id: "7",
  name: "Backend 2026",
  full_name: "Sam Carter",
  headline: "Senior Backend Engineer",
  location: "Lisbon",
  email: "sam@example.com",
  phone: null,
  summary: "Eight years on payment systems.",
  links: [],
  skills: [
    {
      id: "s1",
      category: "Backend",
      keywords: ["Python", "FastAPI", "PostgreSQL"],
    },
  ],
  experience: [],
  projects: [],
  education: [],
  certifications: [],
  languages: [],
  created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-30T12:00:00Z",
};

const APPLICATION: Application = {
  id: "42",
  company_id: "c-1",
  company_name: "Northwind Labs",
  platform_id: "p-1",
  role: "Senior Backend Engineer",
  mode: "active",
  application_date: "2026-10-20",
  job_description: "Northwind needs PostgreSQL every day.",
  finalized: false,
  finalized_at: null,
};

const COPY: TailoredCv = {
  ...MASTER,
  id: "9001",
  application_id: "42",
  base_cv_id: "7",
  base_snapshot: null,
  was_ai_generated: false,
  adjustments: [
    {
      section: "skills",
      description: "Keywords reordered by job match in 1 category",
    },
  ],
};

const copyBoard = () =>
  document.querySelector<HTMLElement>('[data-slot="phone-application-cv"]');

function renderCopyPt() {
  pathname.current = "/applications/cv";
  setLocation("/applications/cv?id=42");
  mocks.features.current = [...CVS, { key: "jobs", stage: "beta" }];
  return renderPhoneScreen("/applications/cv", <ApplicationCvPage />, {
    locale: "pt-BR",
    features: mocks.features.current as MyFeature[],
  });
}

describe("an application's CV copy in Portuguese below md", () => {
  beforeEach(() => {
    mocks.list.mockResolvedValue([MASTER]);
    mocks.getApplications.mockReset().mockResolvedValue([APPLICATION]);
    mocks.getCopy.mockReset().mockRejectedValue({
      isAxiosError: true,
      response: { status: 404, data: { detail: "CV copy not found" } },
    });
    mocks.getFit.mockReset().mockResolvedValue({
      score: 72,
      matched_keywords: ["postgresql"],
      missing_keywords: ["kafka"],
    });
  });

  it("guards the check: it knows the copy's English words", () => {
    for (const word of [
      "Application CV",
      "Choose a master CV",
      "Create the CV copy",
      "Tailor by keywords",
      "Save CV copy",
      "Delete copy",
      "Show changes",
      "Downloads reflect the last saved version.",
      "Show more",
      "Application",
      "Reordered",
    ]) {
      expect(COPY_ENGLISH.has(word), word).toBe(true);
    }
  });

  it("the picker: Candidatura, the choice and its actions, the tile, Tailor and the bar", async () => {
    await renderCopyPt();

    await waitFor(() =>
      expect(copyBoard()).toHaveAttribute("data-state", "picker"),
    );
    const bar = within(
      document.querySelector<HTMLElement>('[data-slot="phone-top-bar"]')!,
    );
    expect(bar.getByRole("link", { name: "Candidatura" })).toHaveAttribute(
      "href",
      "/applications?focus=42",
    );
    expect(bar.getByText("Beta")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 1, name: "CV da candidatura" }),
    ).toBeInTheDocument();
    const group = await screen.findByRole("group", {
      name: "Escolha um CV principal",
    });
    const radio = within(group).getByRole("radio", { name: "Backend 2026" });
    await waitFor(() => expect(radio).toBeChecked());
    expect(radio).toHaveAccessibleDescription(/^Atualizado em /);
    for (const name of [
      "Baixar PDF de Backend 2026",
      "Baixar Markdown de Backend 2026",
      "Excluir Backend 2026",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("link", { name: "Editar Backend 2026" }),
    ).toHaveTextContent("Editar");
    expect(
      screen.getByRole("link", { name: /^Novo CV principal 2 de 3/ }),
    ).toHaveAttribute("href", "/cvs/new");
    expect(
      screen.getByRole("switch", { name: "Adaptar por palavras-chave" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Criar a cópia do CV" }),
    ).toBeInTheDocument();
    expect(englishLeft(document.body, COPY_ENGLISH)).toEqual([]);
  });

  it("the editor: source, job description, fit, Changes, the rows Reordenada, downloads and the bar", async () => {
    const user = userEvent.setup();
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPt();

    await waitFor(() =>
      expect(copyBoard()).toHaveAttribute("data-state", "editor"),
    );
    expect(
      await screen.findByText("Copiado de Backend 2026"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Descrição da vaga" }),
    ).toHaveTextContent("Vem da candidatura. Somente leitura aqui.");
    const fit = await screen.findByRole("region", {
      name: "Aderência do CV à vaga",
    });
    await waitFor(() => expect(fit).toHaveAttribute("data-state", "ready"));
    expect(
      within(fit).getByRole("list", { name: "Encontradas" }),
    ).toBeInTheDocument();
    expect(
      within(fit).getByRole("list", { name: "Faltando" }),
    ).toBeInTheDocument();

    const changes = await screen.findByRole("region", { name: "Alterações" });
    const toggle = within(changes).getByRole("switch", {
      name: "Mostrar alterações",
    });
    expect(toggle).toHaveAccessibleDescription(
      "Comparado com Backend 2026: nenhuma alteração",
    );
    await user.click(toggle);
    expect(
      within(changes).getByRole("list", {
        name: "Reordenado pela aderência à vaga",
      }),
    ).toHaveTextContent("Habilidades");
    for (const name of [
      "Baixar alterações em PDF",
      "Baixar alterações em Markdown",
    ]) {
      expect(within(changes).getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      within(changes).getByText("Os downloads refletem a última versão salva."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Habilidades" }),
    ).toHaveAccessibleDescription("1 grupo · 3 palavras-chave · Reordenada");
    for (const name of ["Baixar PDF", "Baixar Markdown", "Excluir cópia"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Salvar cópia do CV" }),
    ).toHaveAttribute("type", "submit");
    expect(englishLeft(document.body, COPY_ENGLISH)).toEqual([]);
  });

  it("a closed application's copy: Esta candidatura está encerrada., no Salvar, no Excluir cópia", async () => {
    mocks.getApplications.mockResolvedValue([
      { ...APPLICATION, finalized: true, finalized_at: "2026-10-25T10:00:00Z" },
    ]);
    mocks.getCopy.mockResolvedValue(COPY);
    await renderCopyPt();

    await waitFor(() =>
      expect(copyBoard()).toHaveAttribute("data-state", "editor"),
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "Esta candidatura está encerrada.Reabra-a para editar este CV.",
    );
    expect(
      screen.queryByRole("button", { name: "Salvar cópia do CV" }),
    ).toBeNull();
    expect(screen.queryByRole("button", { name: "Excluir cópia" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Baixar PDF" }),
    ).toBeInTheDocument();
    expect(englishLeft(document.body, COPY_ENGLISH)).toEqual([]);
  });
});
