import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CompaniesPage } from "@/app/(protected)/admin/companies/companies-page";
import AdminLayout from "@/app/(protected)/admin/layout";
import { PlatformsPage } from "@/app/(protected)/admin/platforms/platforms-page";
import { UsersPage } from "@/app/(protected)/admin/users/users-page";
import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";
import type { AdminUserDetail, AdminUserRow } from "@/services/types/admin";
import type { User } from "@/services/types/users";
import { pathname } from "@/test/navigation";
import { SAM, renderPhoneScreen } from "@/test/phone-screens";

/**
 * The v3 admin boards (Users, Companies, Platforms) in Portuguese, with
 * their sheets open: the boards' new words and the reused ones follow the
 * language, and no English word of these screens is left on the phone.
 */

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: ADMIN, isLoading: false, logout: vi.fn() }),
}));

vi.mock("next/navigation", async () => {
  const { navigationMock } = await import("@/test/navigation");
  return navigationMock;
});

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();

const SAMC: AdminUserRow = {
  id: "u-sam",
  username: "samcarter",
  email: "sam@carter.dev",
  github_id: null,
  seniority_level: "senior",
  is_admin: true,
  total_applications: 34,
  offers: 2,
  denials: 9,
  active_applications: 12,
  last_activity: ago(1),
  joined_at: ago(3),
};

const SAM_DETAIL: AdminUserDetail = {
  ...SAMC,
  first_name: "Sam",
  last_name: "Carter",
  current_role: "Engenheiro",
  current_company: "Acme",
  location: "Lisboa",
  availability: "open_to_work",
  bio: "Gosta de sistemas confiáveis.",
  tech_stack: ["Python"],
};

const ROWS = [
  {
    id: "r-1",
    name: "Northwind Labs",
    url: "https://northwindlabs.example",
    is_active: true,
    is_public: true,
    applications_count: 3,
    created_by: { id: "u-1", username: "samcarter" },
    created_at: "2026-10-02T12:00:00Z",
  },
  {
    id: "r-2",
    name: "Pinecone Studio",
    url: null,
    is_active: false,
    is_public: false,
    applications_count: 1,
    created_by: null,
    created_at: "2026-10-28T12:00:00Z",
  },
  {
    id: "r-3",
    name: "Kite",
    url: "https://kite.example",
    is_active: true,
    is_public: false,
    applications_count: 0,
    created_by: { id: "u-2", username: "mila.costa" },
    created_at: "2026-10-29T12:00:00Z",
  },
];

const catalog = () =>
  Promise.resolve({
    items: ROWS,
    total: ROWS.length,
    page: 1,
    per_page: 15,
    total_pages: 2,
  });

vi.mock("@/services/services", () => ({
  services: {
    admin: {
      getUsers: () =>
        Promise.resolve({
          items: [SAMC],
          total: 1,
          page: 1,
          per_page: 15,
          total_pages: 2,
        }),
      getUser: () => Promise.resolve(SAM_DETAIL),
      updateUser: vi.fn(),
      getCompanies: () => catalog(),
      getPlatforms: () => catalog(),
      publishCompany: vi.fn(),
      publishPlatform: vi.fn(),
    },
    cycles: { getCycles: () => Promise.resolve([]) },
    features: { getMine: () => Promise.resolve([]) },
  },
}));

const ADMIN: User = { ...SAM, is_admin: true };

type Messages = { [key: string]: string | Messages };

function leaves(tree: Messages, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : leaves(value, `${prefix}${key}.`),
  );
}

/** The namespaces these three screens read. */
const SCREEN_NAMESPACES = [
  "admin.users.",
  "admin.catalog.",
  "admin.pager.",
  "admin.time.",
  "admin.nav.",
  "phone.adminUsers.",
  "phone.catalog.",
  "phone.admin.",
  "phone.load.",
  "options.seniority.",
  "options.availability.",
  "common.close",
  "nav.system",
];

const PT = new Map(leaves(ptBR as Messages));

/** Every English word of these screens that Portuguese says differently (no ICU arguments). */
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

function renderPt(path: string, page: ReactNode) {
  pathname.current = path;
  return renderPhoneScreen(path, <AdminLayout>{page}</AdminLayout>, {
    locale: "pt-BR",
    user: ADMIN,
  });
}

beforeEach(() => {
  pathname.current = "/admin";
});

describe("the v3 admin boards in Portuguese below md", () => {
  it("guards the check: it knows the screens' English words", () => {
    for (const word of [
      "Search users",
      "Sort by",
      "View user details",
      "Application Stats",
      "Cannot delete: used by applications",
      "Previous page",
      "Add Company",
      "Private",
    ]) {
      expect(ENGLISH.has(word), word).toBe(true);
    }
  });

  it("Users, with a user's details open", async () => {
    const user = userEvent.setup();
    await renderPt("/admin/users", <UsersPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Gestão de usuários" }),
    ).toHaveClass("ph-h1", "ph-h1-26");
    expect(
      screen.getByText(
        "Veja, busque e gerencie todos os usuários da plataforma",
      ),
    ).toHaveClass("ph-lead");
    expect(await screen.findByText("samcarter")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: "Buscar usuários" }),
    ).toHaveAttribute("placeholder", "Buscar usuários...");
    expect(screen.getByText("1 usuário")).toBeInTheDocument();
    expect(screen.getByText("Ordenar por")).toBeInTheDocument();
    const sort = screen.getByRole("group", { name: "Ordenar usuários por" });
    expect(
      within(sort)
        .getAllByRole("button")
        .map((chip) => chip.getAttribute("aria-label")),
    ).toEqual([
      "Ordenar por Cadastro, decrescente",
      "Ordenar por Usuário",
      "Ordenar por Candidaturas",
      "Ordenar por Ofertas",
      "Ordenar por Recusas",
    ]);
    expect(screen.getByText("há 3 dias")).toBeInTheDocument();
    expect(screen.getByText("Sênior")).toBeInTheDocument();
    expect(
      screen.getByText("Candidaturas 34 · Ofertas 2 · Recusas 9"),
    ).toBeInTheDocument();
    expect(screen.getByText("Página 1 de 2")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ver detalhes do usuário" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "samcarter" });
    expect(await within(sheet).findByText("E-mail")).toBeInTheDocument();
    for (const word of [
      "ID do GitHub",
      "Nome",
      "Cargo",
      "Empresa",
      "Senioridade",
      "Localização",
      "Disponibilidade",
      "Aberto a oportunidades",
      "Estatísticas de candidaturas",
      "Ativas",
      "Tecnologias",
    ]) {
      expect(within(sheet).getByText(word), word).toBeInTheDocument();
    }
    expect(
      within(sheet).getByRole("button", { name: "Fechar" }),
    ).toBeInTheDocument();

    expect(englishLeft(document.body)).toEqual([]);
  });

  it.each([
    {
      kind: "company",
      path: "/admin/companies",
      page: <CompaniesPage />,
      title: "Gestão de empresas",
      add: "Adicionar empresa",
      list: "lista de empresas",
    },
    {
      kind: "platform",
      path: "/admin/platforms",
      page: <PlatformsPage />,
      title: "Plataformas",
      add: "Adicionar plataforma",
      list: "lista de plataformas",
    },
  ])(
    "$kind, with Add, Approve and Delete open",
    async ({ kind, path, page, title, add, list }) => {
      const user = userEvent.setup();
      await renderPt(path, page);

      expect(
        screen.getByRole("heading", { level: 1, name: title }),
      ).toHaveClass("ph-h1", "ph-h1-26");
      expect(await screen.findByText("Northwind Labs")).toBeInTheDocument();
      const seg = screen.getByRole("group", { name: "Visibilidade" });
      expect(
        within(seg)
          .getAllByRole("button")
          .map((b) => b.textContent),
      ).toEqual(["Todas", "Públicas", "Privadas"]);
      // Zero reads plural in Portuguese, one singular (the `=0` case).
      expect(
        Array.from(
          document.querySelectorAll('[data-slot="catalog-meta"]'),
          (meta) => meta.textContent,
        ),
      ).toEqual([
        "Adicionada por samcarter · 3 candidaturas · Criada em 2 de out. de 2026",
        "Adicionada por —Não registrado · 1 candidatura · Criada em 28 de out. de 2026",
        "Adicionada por mila.costa · 0 candidaturas · Criada em 29 de out. de 2026",
      ]);
      expect(
        screen.getAllByText("Não é possível excluir: usada em candidaturas"),
      ).toHaveLength(2);
      expect(
        screen.getByRole("navigation", {
          name:
            kind === "company"
              ? "Páginas de empresas"
              : "Páginas de plataformas",
        }),
      ).toBeInTheDocument();
      if (kind === "company") {
        expect(
          screen.getByRole("switch", {
            name: "Alternar status de Northwind Labs",
          }),
        ).toBeInTheDocument();
        expect(screen.getAllByText("ativa").length).toBeGreaterThan(0);
      }
      expect(englishLeft(document.body)).toEqual([]);

      await user.click(screen.getByRole("button", { name: add }));
      const form = await screen.findByRole("dialog", { name: add });
      await user.click(within(form).getByRole("button", { name: "Criar" }));
      expect(
        await within(form).findByText("O nome é obrigatório"),
      ).toBeInTheDocument();
      expect(englishLeft(document.body)).toEqual([]);
      await user.click(within(form).getByRole("button", { name: "Cancelar" }));
      await waitFor(() =>
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Aprovar Kite" }));
      const approve = await screen.findByRole("alertdialog", {
        name: "Aprovar Kite?",
      });
      expect(
        within(approve).getByText(
          `Kite passa a ser pública: todos os usuários a veem na ${list} e podem escolhê-la.`,
        ),
      ).toBeInTheDocument();
      expect(
        within(approve).getByText(
          "mila.costa continua registrado como quem a adicionou.",
        ),
      ).toBeInTheDocument();
      expect(englishLeft(document.body)).toEqual([]);
      await user.click(
        within(approve).getByRole("button", { name: "Cancelar" }),
      );
      await waitFor(() =>
        expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Excluir Kite" }));
      const remove = await screen.findByRole("alertdialog", {
        name: "Excluir Kite",
      });
      expect(
        within(remove).getByText("Essa ação não pode ser desfeita."),
      ).toBeInTheDocument();
      expect(englishLeft(document.body)).toEqual([]);
    },
  );
});
