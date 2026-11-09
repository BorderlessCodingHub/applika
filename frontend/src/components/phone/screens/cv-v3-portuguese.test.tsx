import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NewCvPage } from "@/app/(protected)/cvs/new/new-cv-page";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import type { MyFeature } from "@/services/types/features";
import { pathname } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * The v3 CV boards in Portuguese below md: the new master CV page (v3/CVNew)
 * with its rows, the live preview card, the action bar and the limit state.
 * The boards' words are today's keys; they follow the language, and no
 * English word of the screen is left on the phone.
 */

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
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
    features: { getMine: () => Promise.resolve(CVS) },
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

/** English left in the visible words, names and placeholders under `root`. */
function englishLeft(root: HTMLElement): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim();
    if (text && ENGLISH.has(text)) found.push(text);
  }
  for (const element of root.querySelectorAll("*")) {
    for (const attribute of ["aria-label", "placeholder", "title"]) {
      const value = element.getAttribute(attribute);
      if (value && ENGLISH.has(value)) found.push(`${attribute}=${value}`);
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
