import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CliPage } from "@/app/(public)/cli/cli-page";
import { LoginPage } from "@/app/login/login-page";
import { WelcomeScreen } from "@/components/auth/welcome-screen";
import { CliCodeScreen } from "@/components/cli-code/cli-code-screen";
import { DeviceCodeForm } from "@/components/device/device-code-form";
import { DeviceOutcome } from "@/components/device/device-outcome";
import { DeviceRequestCard } from "@/components/device/device-request-card";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import { HeroSection } from "@/components/landing/hero-section";
import { LandingHeader } from "@/components/landing/landing-header";
import { PhoneLanding } from "@/components/phone/landing/phone-landing";
import { PhonePublicBar } from "@/components/phone/phone-public-bar";
import {
  PhoneDeviceCode,
  PhoneDeviceOutcome,
  PhoneDeviceRequest,
} from "@/components/phone/screens/device-screen";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The public and sign-in screens in Portuguese: landing, sign-in (web and
 * terminal), the terminal code, the welcome choice and device approval, at
 * both widths (the phone trees and views of PRD 0021 too). The device's name
 * and client label come from the API as data and stay exactly as sent; dates
 * follow the language. English is asserted, unchanged, by the screens' own
 * tests. Screens laid out by CSS hold both trees: queries are scoped by the
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
      desktop.getByRole("button", { name: "Entrar com a Borderless" }),
    ).toHaveAccessibleDescription(desktopLead);
    expect(
      desktop.getByText(/^Ainda não tem conta na Borderless\?/),
    ).toHaveTextContent(
      "Ainda não tem conta na Borderless? Criar uma conta na Borderless",
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
        name: "Entrar com a Borderless",
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

  it("writes the terminal hint in Portuguese, the command kept", async () => {
    searchParams = new URLSearchParams("error=AUTH-1019&cli=1");
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Entre no Applika" }),
    ).toBeInTheDocument();
    for (const slot of ["sign-in-desktop", "sign-in-phone"]) {
      const hint = tree(slot).querySelector('[data-slot="sign-in-cli-hint"]');
      expect(hint).toHaveTextContent(
        "Volte ao seu terminal e execute applika login novamente.",
      );
      expect(
        within(hint as HTMLElement).getByText("applika login").tagName,
      ).toBe("CODE");
    }
  });
});

describe("terminal code and welcome in Portuguese", () => {
  it("writes the terminal code screen in Portuguese, the code as sent", async () => {
    await renderInPortuguese(<CliCodeScreen code="abc" state="xyz" />, {
      localeSwitch: true,
    });

    for (const slot of ["cli-code-desktop", "cli-code-phone"]) {
      const view = within(tree(slot));
      expect(
        view.getByRole("heading", { name: "Entre no applika-cli" }),
      ).toBeInTheDocument();
      expect(view.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
      expect(view.getByText("abc#xyz")).toBeInTheDocument();
      expect(
        view.getByText("O código funciona uma vez e expira em um minuto."),
      ).toBeInTheDocument();
    }
  });

  it("says the code is missing in Portuguese", async () => {
    await renderInPortuguese(<CliCodeScreen code={null} state={null} />, {
      localeSwitch: true,
    });
    for (const slot of ["cli-code-desktop", "cli-code-phone"]) {
      expect(
        within(tree(slot)).getByText("Falta o código neste link de acesso."),
      ).toBeInTheDocument();
    }
  });

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
  it("writes the Landing board in Portuguese, the pair and the floating sign-in link", async () => {
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
    // The header: home, theme, then the flags (named by their endonyms); no Entrar.
    const header = within(screen.getByRole("banner"));
    expect(header.queryByRole("link", { name: "Entrar" })).toBeNull();
    const group = header.getByRole("radiogroup", { name: "Alternar idioma" });
    expect(
      header.getByRole("button", { name: "Alternar tema" }).nextElementSibling,
    ).toBe(group);
    expect(
      within(group).getByRole("radio", { name: "Português" }),
    ).toBeChecked();
    expect(group).not.toHaveTextContent(/EN|BR/);
    expect(
      within(tree("landing-phone-cta")).getByRole("link", {
        name: "Entrar com a Borderless",
      }),
    ).toHaveAttribute("href", "/login");
    expect(screen.getByRole("link", { name: "Ver no GitHub" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Política de cookies" }),
    ).toHaveAttribute("href", "/cookie-policy");
  });

  it("offers the dashboard in Portuguese to a signed-in visitor, in the floating button", async () => {
    auth = { isAuthenticated: true, isLoading: false };
    await renderInPortuguese(<PhoneLanding />, { localeSwitch: true });

    expect(
      within(tree("landing-phone-cta")).getByRole("link", {
        name: "Ir para o painel",
      }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      within(screen.getByRole("banner")).queryByRole("link", {
        name: "Painel",
      }),
    ).toBeNull();
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

describe("the applika-cli page in Portuguese", () => {
  it("writes v3/Cli and today's page in Portuguese, commands and brand kept", async () => {
    await renderInPortuguese(<CliPage />, { localeSwitch: true });
    const phone = within(tree("cli-phone"));
    const desktop = within(tree("cli-desktop"));

    for (const view of [phone, desktop]) {
      expect(view.getByText("Linha de comando")).toBeInTheDocument();
      expect(
        view.getByRole("heading", { level: 1, name: "applika-cli" }),
      ).toBeInTheDocument();
      expect(
        view
          .getAllByRole("heading", { level: 2 })
          .map((heading) => heading.textContent),
      ).toEqual([
        "Instalação",
        "Entrar",
        "Acompanhe pelo terminal",
        "Ensine seu assistente de IA",
        "Todo o resto",
      ]);
      expect(
        view.getAllByRole("button", { name: "Copiar comando" }),
      ).toHaveLength(4);
      expect(
        view.getByRole("link", { name: "página inicial" }),
      ).toHaveAttribute("href", "/");
    }

    // The phone tree's own header, list and footer.
    const header = within(phone.getByRole("banner"));
    expect(
      header.getByRole("link", { name: "Página inicial do Applika.dev" }),
    ).toHaveAttribute("href", "/");
    expect(header.queryByRole("link", { name: "Entrar" })).toBeNull();
    expect(
      header.getByRole("radiogroup", { name: "Alternar idioma" }),
    ).toHaveAttribute("data-flags-only", "");
    expect(
      within(
        tree("cli-phone").querySelector<HTMLElement>(
          '[data-slot="landing-phone-cta"]',
        )!,
      ).getByRole("link", { name: "Entrar com a Borderless" }),
    ).toHaveAttribute("href", "/login");
    expect(
      phone.getAllByRole("link", { name: "Ver no PyPI Abre em uma nova aba." }),
    ).toHaveLength(2);
    expect(phone.getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "Padrão: seu navegador abre e o login volta sozinho para o terminal.",
      "Navegador em outra máquina: --manual mostra um código no navegador para você colar no terminal.",
      "Sem navegador (SSH, contêineres): --device mostra um código curto para aprovar em qualquer navegador conectado.",
    ]);
    expect(
      phone.getByRole("link", { name: "Política de cookies" }),
    ).toHaveAttribute("href", "/cookie-policy");
    expect(phone.getByRole("contentinfo")).toHaveTextContent("© Applika.dev");
    // The commands stay English.
    expect(
      tree("cli-phone").querySelector('[data-slot="cli-phone-commands"]'),
    ).toHaveTextContent("$ uv tool install applika-cli");
  });

  it("says Copiado once Copy has written the commands", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    await renderInPortuguese(<CliPage />, { localeSwitch: true });
    const phone = within(tree("cli-phone"));

    await user.click(
      phone.getAllByRole("button", { name: "Copiar comando" })[0],
    );

    expect(phone.getByRole("button", { name: "Copiado" })).toBeInTheDocument();
    expect(
      tree("cli-phone").querySelector('[data-slot="cli-phone-copy-status"]'),
    ).toHaveTextContent("Copiado");
  });

  it("offers Ir para o painel to a signed-in visitor, in the floating button", async () => {
    auth = { isAuthenticated: true, isLoading: false };
    await renderInPortuguese(<CliPage />, { localeSwitch: true });
    const header = within(within(tree("cli-phone")).getByRole("banner"));
    const cta = tree("cli-phone").querySelector<HTMLElement>(
      '[data-slot="landing-phone-cta"]',
    )!;

    expect(
      within(cta).getByRole("link", { name: "Ir para o painel" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(header.queryByRole("link", { name: "Painel" })).toBeNull();
    expect(header.queryByRole("link", { name: "Entrar" })).toBeNull();
  });
});

describe("device approval in Portuguese", () => {
  const request = {
    device_name: "ada-laptop",
    client_label: "Chrome on macOS",
    ip: null,
    requested_at: "2026-10-15T14:32:00Z",
    expires_at: "2026-10-15T14:42:00Z",
  };

  it("labels the request in Portuguese and shows the device's data as sent", async () => {
    await renderInPortuguese(
      <DeviceRequestCard
        request={request}
        userCode="BCDF-GHJK"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onUseDifferentCode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Um dispositivo quer entrar" }),
    ).toBeInTheDocument();
    const term = (name: string) =>
      screen.getByText(name, { selector: "dt" }).nextElementSibling;
    expect(term("Dispositivo")).toHaveTextContent("ada-laptop");
    // The client label is data from the API: English, exactly as sent.
    expect(term("Cliente")).toHaveTextContent(/^Chrome on macOS$/);
    expect(term("Endereço IP")).toHaveTextContent("Não registrado");
    // Dates follow the language: "15 de out. de 2026, …".
    expect(term("Solicitado")?.textContent).toMatch(/^15 de out\. de 2026/);
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Usar outro código" }),
    ).toBeInTheDocument();
  });

  it("asks for the whole code in Portuguese", async () => {
    await renderInPortuguese(
      <DeviceCodeForm code="BCD" onCodeChange={vi.fn()} onSubmit={vi.fn()} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Digite as 8 letras do código.",
    );
    expect(screen.getByLabelText("Código do dispositivo")).toBeInTheDocument();
  });

  it("writes both outcomes in Portuguese", async () => {
    const { unmount } = await renderInPortuguese(
      <DeviceOutcome outcome="approved" />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Dispositivo conectado. Você pode voltar ao seu terminal.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ver seus dispositivos" }),
    ).toHaveAttribute("href", "/profile?tab=devices");
    unmount();

    await renderInPortuguese(
      <DeviceOutcome outcome="denied" onStartOver={vi.fn()} />,
    );
    expect(
      screen.getByRole("button", { name: "Digitar outro código" }),
    ).toBeInTheDocument();
  });
});

describe("phone device sign-in in Portuguese", () => {
  const request = {
    device_name: "ada-laptop",
    client_label: "Chrome on macOS",
    ip: null,
    requested_at: "2026-10-15T14:32:00Z",
    expires_at: "2026-10-15T14:42:00Z",
  };

  it("labels the code step in Portuguese", async () => {
    await renderInPortuguese(
      <PhoneDeviceCode code="BCD" onCodeChange={vi.fn()} onSubmit={vi.fn()} />,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Conectar um dispositivo",
      }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continuar" }));
    expect(
      document.querySelector('[data-slot="device-code-error"]'),
    ).toHaveTextContent("Digite as 8 letras do código.");
    expect(screen.getByLabelText("Código do dispositivo")).toBeInTheDocument();
  });

  it("labels the request and its warning in Portuguese, the data as sent", async () => {
    await renderInPortuguese(
      <PhoneDeviceRequest
        request={request}
        userCode="BCDF-GHJK"
        onApprove={vi.fn()}
        onDeny={vi.fn()}
        onUseDifferentCode={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Um dispositivo quer entrar" }),
    ).toBeInTheDocument();
    const term = (name: string) =>
      screen.getByText(name, { selector: "dt" }).nextElementSibling;
    expect(term("Cliente")).toHaveTextContent(/^Chrome on macOS$/);
    expect(term("Endereço IP")).toHaveTextContent("Não registrado");
    expect(term("Solicitado")?.textContent).toMatch(/^15 de out\. de 2026/);
    expect(screen.getByRole("note")).toHaveTextContent(
      "Só aprove se foi você quem iniciou este acesso",
    );
    expect(screen.getByRole("button", { name: "Aprovar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recusar" })).toBeInTheDocument();
  });

  it("writes both outcomes in Portuguese", async () => {
    const { unmount } = await renderInPortuguese(
      <PhoneDeviceOutcome outcome="approved" />,
    );
    expect(
      screen.getByRole("link", { name: "Ver seus dispositivos" }),
    ).toHaveAttribute("href", "/profile?tab=devices");
    unmount();

    await renderInPortuguese(
      <PhoneDeviceOutcome outcome="denied" onStartOver={vi.fn()} />,
    );
    expect(
      screen.getByRole("heading", {
        name: "Acesso recusado. O dispositivo não foi conectado.",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Digitar outro código" }),
    ).toBeInTheDocument();
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

  it("an unlisted code reads the generic line in Portuguese", async () => {
    searchParams = new URLSearchParams({ error: "NOPE-0000" });
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    expect(
      document.querySelector('[data-slot="sign-in-error"]'),
    ).toHaveTextContent("Algo deu errado");
  });
});
