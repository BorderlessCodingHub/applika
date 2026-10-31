import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderInPortuguese } from "@/test/portuguese";

import { BaseCvList } from "./base-cv-list";
import type { BaseCv } from "./types";

/**
 * The master CV gallery in Portuguese: the app's words translate, the date is
 * written the pt-BR way, and the user's own words (the CV name, the person,
 * the keywords) stay exactly as typed.
 */

function cv(over: Partial<BaseCv> = {}): BaseCv {
  return {
    id: "1",
    name: "Backend CV",
    full_name: "Ada Lovelace",
    headline: "Senior Backend Engineer",
    location: "London",
    email: "ada@example.com",
    phone: null,
    summary: "Eight years on payment systems.",
    links: [],
    skills: [{ id: "s-1", category: "Stack", keywords: ["Python"] }],
    experience: [],
    projects: [],
    education: [],
    certifications: [],
    languages: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-10-20T12:00:00Z",
    ...over,
  };
}

const props = {
  editHref: (item: BaseCv) => `/cvs/editor?id=${item.id}`,
  newHref: "/cvs/new",
  onDelete: vi.fn(),
  onExport: vi.fn(),
};

describe("the master CV gallery in Portuguese", () => {
  it("translates the tile, dates it the pt-BR way and keeps the CV's own words", async () => {
    await renderInPortuguese(<BaseCvList cvs={[cv()]} {...props} />);

    expect(screen.getByText("Atualizado em 20 de out. de 2026")).toBeVisible();
    expect(
      screen.getByText("0 cargos · 0 projetos · 0 idiomas · 1 palavra-chave"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Editar Backend CV" }),
    ).toHaveTextContent("Editar");
    expect(
      screen.getByRole("button", { name: "Excluir Backend CV" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Novo CV principal" }),
    ).toBeVisible();
    expect(screen.getByText("2 de 3 espaços livres")).toBeVisible();

    // User content is never translated.
    expect(screen.getByRole("heading", { name: "Backend CV" })).toBeVisible();
    expect(screen.getByText("Python")).toBeVisible();
    expect(screen.queryByText(/Updated|roles|Edit\b/)).not.toBeInTheDocument();
  });

  it("asks before deleting, in Portuguese, naming the CV as typed", async () => {
    await renderInPortuguese(<BaseCvList cvs={[cv()]} {...props} />);

    await userEvent.click(
      screen.getByRole("button", { name: "Excluir Backend CV" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByText("Excluir este CV principal?"),
    ).toBeVisible();
    expect(
      within(dialog).getByText(
        '"Backend CV" e tudo o que ele contém serão removidos de vez. Isso não pode ser desfeito.',
      ),
    ).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeVisible();
  });

  it("says the empty and the error states in Portuguese", async () => {
    const { unmount } = await renderInPortuguese(
      <BaseCvList cvs={[]} {...props} />,
    );
    expect(
      screen.getByRole("heading", { name: "Nenhum CV principal ainda" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Criar seu primeiro CV" }),
    ).toBeVisible();
    unmount();

    await renderInPortuguese(
      <BaseCvList cvs={undefined} error="boom" onRetry={vi.fn()} {...props} />,
    );
    expect(
      screen.getByText("Não foi possível carregar seus CVs principais"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Tentar de novo" }),
    ).toBeVisible();
  });

  it("names the at-limit reason in Portuguese", async () => {
    await renderInPortuguese(
      <BaseCvList
        cvs={[
          cv(),
          cv({ id: "2", name: "Data CV" }),
          cv({ id: "3", name: "ML CV" }),
        ]}
        {...props}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Novo CV principal" }),
    ).toHaveAccessibleDescription(
      "Você já tem 3 CVs principais — o limite é três. Exclua um para criar outro.",
    );
  });
});
