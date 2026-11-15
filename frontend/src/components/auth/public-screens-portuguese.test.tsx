import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { McpPage } from "@/app/(public)/mcp/mcp-page";
import { LoginPage } from "@/app/login/login-page";
import { WelcomeScreen } from "@/components/auth/welcome-screen";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import { HeroSection } from "@/components/landing/hero-section";
import { LandingHeader } from "@/components/landing/landing-header";
import { PhoneLanding } from "@/components/phone/landing/phone-landing";
import { PhonePublicBar } from "@/components/phone/phone-public-bar";
import { APP_CONFIG } from "@/config";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The public and sign-in screens in Portuguese: landing, the MCP page,
 * sign-in and the welcome choice, at both widths (the phone trees and views of
 * PRD 0021 too). English is asserted, unchanged, by the screens' own tests. Screens laid out by CSS hold both trees: queries are scoped by the
 * tree's `data-slot`.
 */

const tree = (slot: string) =>
  document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;

let searchParams = new URLSearchParams();
let auth = { isAuthenticated: false, isLoading: false };

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => searchParams,
}));

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

vi.mock("@/services/services", () => ({
  services: {
    auth: { borderlessLoginUrl: vi.fn(() => "http://api.test/login") },
    feedbacks: { create: vi.fn() },
  },
}));

function withQueries({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  searchParams = new URLSearchParams();
  auth = { isAuthenticated: false, isLoading: false };
});

describe("landing in Portuguese", () => {
  it("writes the header and hero in Portuguese, brand names kept", async () => {
    await renderInPortuguese(
      <>
        <LandingHeader />
        <HeroSection />
      </>,
      { localeSwitch: true },
    );

    expect(
      screen.getByRole("link", { name: "Página inicial do Applika.dev" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Gerencie sua busca de emprego com clareza",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Comece grátis" }),
    ).toBeInTheDocument();
  });

  it("offers the dashboard in Portuguese to a signed-in visitor", async () => {
    auth = { isAuthenticated: true, isLoading: false };
    await renderInPortuguese(<LandingHeader />, { localeSwitch: true });
    expect(screen.getByRole("link", { name: "Painel" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });
});

describe("sign-in in Portuguese", () => {
  it("writes the web sign-in in Portuguese: one button, no field", async () => {
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    // Below md, option C: today's words, the logo before the button's label.
    const phoneLead =
      "Entre com a Borderless. Ela confirma que é você e traz você de volta para cá.";
    const phone = within(tree("sign-in-phone"));
    expect(
      phone.getByRole("heading", {
        level: 1,
        name: "Uma conta para toda a sua busca de emprego",
      }),
    ).toBeInTheDocument();
    expect(phone.getByText(phoneLead)).toBeInTheDocument();
    expect(
      phone.getByRole("button", { name: "Continuar com a Borderless" }),
    ).toHaveAccessibleDescription(phoneLead);
    expect(
      phone.getByRole("link", { name: "Não tenho conta na Borderless" }),
    ).toHaveAccessibleDescription("Abre em uma nova aba.");
    expect(
      phone.getByRole("img", { name: "com a Borderless" }),
    ).toHaveAttribute("src", "/borderless-logo.png");

    // At md and up, option A: the paired tiles, A's lead, button and sign-up line.
    const desktopLead =
      "Use sua conta Borderless. A Borderless confirma que é você e traz você de volta para cá.";
    const desktop = within(tree("sign-in-desktop"));
    expect(
      desktop.getByRole("heading", { level: 1, name: "Entre no Applika" }),
    ).toBeInTheDocument();
    expect(desktop.getByText(desktopLead)).toBeInTheDocument();
    expect(
      desktop.getByRole("button", { name: "Continuar com a Borderless" }),
    ).toHaveAccessibleDescription(desktopLead);
    expect(desktop.getByText(/^Não tem uma conta ainda\?/)).toHaveTextContent(
      "Não tem uma conta ainda? Criar uma conta na Borderless",
    );
    expect(
      desktop.getByRole("link", { name: "Criar uma conta na Borderless" }),
    ).toHaveAccessibleDescription("Abre em uma nova aba.");
    expect(
      desktop
        .getAllByRole("img")
        .map(
          (img) => img.getAttribute("aria-label") ?? img.getAttribute("alt"),
        ),
    ).toEqual(["Applika", "Borderless"]);
    expect(desktop.queryByRole("region")).toBeNull();

    // The decorative logo in both buttons.
    for (const slot of ["sign-in-phone", "sign-in-desktop"]) {
      expect(
        tree(slot).querySelector(
          '[data-action="sign-in-borderless"] [data-slot="sign-in-logo"]',
        ),
      ).toHaveAttribute("alt", "");
    }
    expect(
      screen.getByRole("link", { name: "Voltar ao início" }),
    ).toHaveAttribute("href", "/");
    expect(document.querySelectorAll("input")).toHaveLength(0);
  });

  it("says it is opening Borderless in Portuguese", async () => {
    vi.stubGlobal("location", { ...window.location, assign: vi.fn() });
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    await userEvent.click(
      within(tree("sign-in-desktop")).getByRole("button", {
        name: "Continuar com a Borderless",
      }),
    );

    expect(
      document.querySelector('[data-slot="sign-in-pending-status"]'),
    ).toHaveTextContent("Abrindo a Borderless…");
    for (const slot of ["sign-in-desktop", "sign-in-phone"]) {
      expect(
        tree(slot).querySelector('[data-action="sign-in-borderless"]'),
      ).toHaveTextContent("Abrindo a Borderless…");
    }
    vi.unstubAllGlobals();
  });
});

describe("welcome in Portuguese", () => {
  it("writes the welcome choice in Portuguese", async () => {
    await renderInPortuguese(
      <WelcomeScreen onRestore={vi.fn()} onStartFresh={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Já usou o Applika com o GitHub?",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restaurar seus dados do GitHub" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Começar do zero" }),
    ).toBeInTheDocument();
  });
});

describe("phone welcome in Portuguese", () => {
  it("names the choice and its button in Portuguese", async () => {
    const { PhoneWelcomeScreen } =
      await import("@/components/auth/welcome-screen");
    await renderInPortuguese(
      <PhoneWelcomeScreen onRestore={vi.fn()} onStartFresh={vi.fn()} />,
    );

    const group = screen.getByRole("radiogroup", { name: "Como começar" });
    expect(
      within(group).getByRole("radio", { name: "Recupere sua conta antiga" }),
    ).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "Comece com uma conta vazia" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Restaurar seus dados do GitHub" }),
    ).toBeInTheDocument();
  });
});

describe("phone landing and public bar in Portuguese", () => {
  it("writes the Landing board in Portuguese, the pair and the header's Entrar", async () => {
    await renderInPortuguese(<PhoneLanding />, { localeSwitch: true });

    // jsdom's name computation pads the highlighted word: read the text.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Gerencie sua busca de emprego com clareza.",
    );
    expect(
      screen.getByText(
        "Rastreador de candidaturas gratuito e de código aberto",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        level: 2,
        name: "Pronto para usar em minutos",
      }),
    ).toBeInTheDocument();
    // The header: home, theme, the flags (named by their endonyms), then Entrar.
    const header = within(screen.getByRole("banner"));
    expect(
      header.getByRole("link", { name: "Página inicial do Applika.dev" }),
    ).toHaveAttribute("href", "/");
    const group = header.getByRole("radiogroup", { name: "Alternar idioma" });
    expect(
      header.getByRole("button", { name: "Alternar tema" }).nextElementSibling,
    ).toBe(group);
    expect(
      within(group).getByRole("radio", { name: "Português" }),
    ).toBeChecked();
    expect(group).not.toHaveTextContent(/EN|BR/);
    const entrar = header.getByRole("link", { name: "Entrar" });
    expect(entrar).toHaveAttribute("href", "/login");
    expect(entrar).toHaveTextContent(/^Entrar$/);
    // The header's Entrar is the page's one sign-in link.
    expect(screen.getAllByRole("link", { name: /entrar/i })).toEqual([entrar]);
    expect(screen.getByRole("link", { name: "Ver no GitHub" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Política de cookies" }),
    ).toHaveAttribute("href", "/cookie-policy");
  });

  it("offers Painel to a signed-in visitor, in the header", async () => {
    auth = { isAuthenticated: true, isLoading: false };
    await renderInPortuguese(<PhoneLanding />, { localeSwitch: true });
    const header = within(screen.getByRole("banner"));

    expect(header.getByRole("link", { name: "Painel" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(header.queryByRole("link", { name: "Entrar" })).toBeNull();
  });

  it("names the public bar's back link in Portuguese", async () => {
    await renderInPortuguese(<PhonePublicBar />, { localeSwitch: true });

    expect(screen.getByRole("link", { name: "Início" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      screen.getByRole("radiogroup", { name: "Alternar idioma" }),
    ).toBeInTheDocument();
  });
});

describe("the Applika MCP page in Portuguese", () => {
  it("writes both trees in Portuguese, app names and the address kept", async () => {
    await renderInPortuguese(<McpPage />, { localeSwitch: true });
    const phone = within(tree("mcp-phone"));
    const desktop = within(tree("mcp-desktop"));

    for (const view of [phone, desktop]) {
      expect(view.getByText("Servidor MCP")).toBeInTheDocument();
      expect(
        view.getByRole("heading", {
          level: 1,
          name: "O Applika no seu assistente de IA",
        }),
      ).toBeInTheDocument();
      expect(
        view
          .getAllByRole("heading", { level: 2 })
          .map((heading) => heading.textContent),
      ).toEqual([
        "Conecte em três passos",
        "Endereço do servidor",
        "Funciona com",
        "O que seu assistente pode fazer",
        "Você escolhe o alcance",
        "Você continua no controle",
      ]);
      expect(
        view
          .getAllByRole("heading", { level: 3 })
          .map((heading) => heading.textContent),
      ).toEqual(["Crie um token", "Copie a configuração", "Cole e peça"]);
      expect(
        view.getByRole("link", { name: "Criar um token" }),
      ).toHaveAttribute("href", "/profile?tab=mcp");
      expect(
        view.getByRole("button", { name: "Copiar o endereço do servidor" }),
      ).toBeInTheDocument();
      // Product names are data: the same in every language.
      expect(view.getByText("Claude Code")).toBeInTheDocument();
      expect(view.getByText("Gemini CLI")).toBeInTheDocument();
      expect(view.getByText("Leitura e escrita")).toBeInTheDocument();
    }

    // The phone tree's own header and footer.
    const header = within(phone.getByRole("banner"));
    expect(
      header.getByRole("radiogroup", { name: "Alternar idioma" }),
    ).toHaveAttribute("data-flags-only", "");
    expect(header.getByRole("link", { name: "Entrar" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(phone.getByRole("link", { name: "Início" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      phone.getByRole("link", { name: "Política de cookies" }),
    ).toHaveAttribute("href", "/cookie-policy");
    expect(phone.getByRole("contentinfo")).toHaveTextContent("© Applika.dev");
  });

  it("says the address was copied, in Portuguese", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderInPortuguese(<McpPage />, { localeSwitch: true });
    const phone = within(tree("mcp-phone"));

    await user.click(
      phone.getByRole("button", { name: "Copiar o endereço do servidor" }),
    );

    expect(writeText).toHaveBeenCalledWith(APP_CONFIG.mcp.endpoint);
    expect(
      phone.getByRole("button", { name: "Endereço do servidor copiado" }),
    ).toBeInTheDocument();
    expect(phone.getByRole("status")).toHaveTextContent(
      "Endereço do servidor copiado",
    );
  });

  it("offers Painel to a signed-in visitor, in the phone header", async () => {
    auth = { isAuthenticated: true, isLoading: false };
    await renderInPortuguese(<McpPage />, { localeSwitch: true });
    const header = within(within(tree("mcp-phone")).getByRole("banner"));

    expect(header.getByRole("link", { name: "Painel" })).toHaveAttribute(
      "href",
      "/dashboard",
    );
    expect(header.queryByRole("link", { name: "Entrar" })).toBeNull();
  });
});

describe("feedback dialog in Portuguese", () => {
  it("writes the dialog in Portuguese with the count by locale", async () => {
    await renderInPortuguese(<FeedbackDialog open onOpenChange={vi.fn()} />);
    const dialog = screen.getByRole("dialog", {
      name: "Avalie sua experiência",
    });
    expect(within(dialog).getByText("2.000 caracteres")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Enviar feedback" }),
    ).toBeInTheDocument();
  });
});

describe("sign-in refusal in Portuguese (AC21)", () => {
  it.each([
    ["AUTH-1005", "Verifique seu e-mail na Borderless primeiro"],
    [
      "AUTH-1046",
      "O acesso expirou ou foi iniciado em outro navegador. Comece de novo",
    ],
    ["AUTH-1047", "A Borderless não concluiu o acesso. Tente entrar novamente"],
    [
      "AUTH-1048",
      "Não foi possível verificar a resposta da Borderless. Tente entrar novamente",
    ],
    [
      "AUTH-1049",
      "Seu acesso pela Borderless terminou. Entre novamente com a Borderless",
    ],
    ["AUTH-1017", "A Borderless está indisponível, tente novamente mais tarde"],
    [
      "AUTH-1006",
      "Este e-mail pertence a uma conta Applika vinculada a outra conta Borderless. Entre com essa conta Borderless ou entre em contato com o suporte",
    ],
  ])(
    "reads ?error=%s in Portuguese, never its English words",
    async (code, words) => {
      searchParams = new URLSearchParams({ error: code });
      await renderInPortuguese(<LoginPage />, {
        wrapper: withQueries,
        localeSwitch: true,
      });

      const error = document.querySelector('[data-slot="sign-in-error"]');
      expect(error).toHaveAttribute("data-code", code);
      expect(
        await within(error as HTMLElement).findByText(words),
      ).toBeInTheDocument();
    },
  );

  it.each(["NOPE-0000", "AUTH-1019"])(
    "an unlisted code (%s) reads the generic line in Portuguese",
    async (code) => {
      searchParams = new URLSearchParams({ error: code });
      await renderInPortuguese(<LoginPage />, {
        wrapper: withQueries,
        localeSwitch: true,
      });

      expect(
        document.querySelector('[data-slot="sign-in-error"]'),
      ).toHaveTextContent("Algo deu errado");
    },
  );
});
