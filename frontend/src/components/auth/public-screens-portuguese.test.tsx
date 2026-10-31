import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LoginPage } from "@/app/login/login-page";
import { WelcomeScreen } from "@/components/auth/welcome-screen";
import { CliCodeScreen } from "@/components/cli-code/cli-code-screen";
import { DeviceCodeForm } from "@/components/device/device-code-form";
import { DeviceOutcome } from "@/components/device/device-outcome";
import { DeviceRequestCard } from "@/components/device/device-request-card";
import { FeedbackDialog } from "@/components/applications/feedback-dialog";
import { HeroSection } from "@/components/landing/hero-section";
import { LandingHeader } from "@/components/landing/landing-header";
import { renderInPortuguese } from "@/test/portuguese";
import { services } from "@/services/services";

/**
 * The public and sign-in screens in Portuguese: landing, sign-in (web and
 * terminal), the terminal code, the welcome choice and device approval. The
 * device's name and client label come from the API as data and stay exactly
 * as sent; dates follow the language. English is asserted, unchanged, by the
 * screens' existing tests.
 */

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
    auth: { borderlessSignIn: vi.fn() },
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
  it("writes the web sign-in in Portuguese", async () => {
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Entre no Applika" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Criar uma conta na Borderless" }),
    ).toHaveAccessibleDescription("Abre em uma nova aba.");
  });

  it("validates the empty form in Portuguese", async () => {
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });
    await userEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(
      await screen.findByText("Digite seu e-mail da Borderless"),
    ).toBeInTheDocument();
    expect(screen.getByText("Digite sua senha")).toBeInTheDocument();
    expect(services.auth.borderlessSignIn).not.toHaveBeenCalled();
  });

  it("writes the terminal sign-in in Portuguese, the command kept", async () => {
    searchParams = new URLSearchParams("cli=1");
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    expect(
      screen.getByRole("heading", { level: 1, name: "Entre no applika-cli" }),
    ).toBeInTheDocument();
    const note = document.querySelector('[data-slot="sign-in-cli-note"]');
    expect(note).toHaveTextContent(
      "Este acesso conclui o applika login no seu terminal.",
    );
    expect(within(note as HTMLElement).getByText("applika login").tagName).toBe(
      "CODE",
    );
  });

  it("explains a lapsed terminal sign-in in Portuguese", async () => {
    searchParams = new URLSearchParams("cli=1");
    vi.mocked(services.auth.borderlessSignIn).mockResolvedValue({
      new_account: false,
      redirect_to: null,
    } as never);
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "ada@example.com");
    await user.type(screen.getByLabelText("Senha"), "secret");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const error = document.querySelector('[data-slot="sign-in-error"]');
    expect(
      await within(error as HTMLElement).findByText(
        /O acesso pelo terminal expirou/,
      ),
    ).toBeInTheDocument();
    expect(error).toHaveTextContent(
      "Execute applika login no seu terminal novamente.",
    );
  });
});

describe("terminal code and welcome in Portuguese", () => {
  it("writes the terminal code screen in Portuguese, the code as sent", async () => {
    await renderInPortuguese(<CliCodeScreen code="abc" state="xyz" />, {
      localeSwitch: true,
    });

    expect(
      screen.getByRole("heading", { name: "Entre no applika-cli" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copiar" })).toBeInTheDocument();
    expect(screen.getByText("abc#xyz")).toBeInTheDocument();
  });

  it("says the code is missing in Portuguese", async () => {
    await renderInPortuguese(<CliCodeScreen code={null} state={null} />, {
      localeSwitch: true,
    });
    expect(
      screen.getByText("Falta o código neste link de acesso."),
    ).toBeInTheDocument();
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

function refusal(status: number, data: unknown) {
  return new AxiosError("refused", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: String(status),
    headers: new AxiosHeaders(),
    config: {} as never,
    data,
  });
}

describe("sign-in refusal in Portuguese", () => {
  it("reads a known error code in Portuguese, never its English detail", async () => {
    vi.mocked(services.auth.borderlessSignIn).mockRejectedValue(
      refusal(401, { detail: "Invalid email or password", code: "AUTH-1004" }),
    );
    await renderInPortuguese(<LoginPage />, {
      wrapper: withQueries,
      localeSwitch: true,
    });

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("E-mail"), "ada@example.com");
    await user.type(screen.getByLabelText("Senha"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    const error = document.querySelector('[data-slot="sign-in-error"]');
    expect(
      await within(error as HTMLElement).findByText(
        "E-mail ou senha inválidos",
      ),
    ).toBeInTheDocument();
    expect(error).not.toHaveTextContent("Invalid email or password");
  });
});
