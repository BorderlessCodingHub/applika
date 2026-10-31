import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AutosaveStatus } from "@/components/application-drafts/autosave-status";
import { DraftFooterActions } from "@/components/application-drafts/draft-footer-actions";
import {
  DraftLoadMessage,
  DraftNoMasterCv,
  DraftPageHeader,
} from "@/components/application-drafts/draft-page-states";
import { DraftStepper } from "@/components/application-drafts/draft-stepper";
import {
  DraftsSection,
  type DraftsSectionItem,
} from "@/components/application-drafts/drafts-section";
import { LocaleProvider, useLocaleSwitch } from "@/i18n/locale-provider";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The draft flow (`/applications/new-with-cv` and the Drafts tab) in
 * Portuguese: app words translate, the user's own words (role, company) stay
 * as typed, and the last-saved time is written the Portuguese way.
 */

const DRAFT: DraftsSectionItem = {
  id: "d-1",
  company_name: "Acme Inc",
  role: "Senior Engineer",
  has_cv: true,
  created_at: "2026-10-31T13:00:00Z",
  updated_at: "2026-10-31T13:55:00Z",
};

afterEach(() => {
  vi.useRealTimers();
  document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
  document.documentElement.lang = "en";
});

describe("the draft flow in Portuguese", () => {
  it("step 1 and its footer: stepper, missing fields, autosave, buttons", async () => {
    await renderInPortuguese(
      <>
        <DraftStepper
          step="application"
          onStepChange={vi.fn()}
          canOpenCv={false}
        />
        <DraftFooterActions
          step="application"
          status={<AutosaveStatus status="saving" />}
          canContinue={false}
          onContinue={vi.fn()}
          onBack={vi.fn()}
          missing={["company", "role", "platform", "cv"]}
          onFinish={vi.fn()}
        />
      </>,
    );

    const steps = screen.getByRole("navigation", { name: "Passos" });
    expect(
      within(steps).getByRole("button", { name: "Passo 1: Candidatura" }),
    ).toHaveAttribute("aria-current", "step");
    expect(
      within(steps).getByRole("button", { name: "Passo 2: CV" }),
    ).toBeDisabled();
    expect(screen.getByText("Empresa, cargo, plataforma")).toBeInTheDocument();
    expect(screen.getByText("Cópia de um CV principal")).toBeInTheDocument();

    // Step 1 names only its own fields, in on-screen order.
    expect(
      screen.getByText("Faltando: empresa, cargo, plataforma"),
    ).toBeInTheDocument();
    expect(screen.getByText("Salvando...")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar" })).toHaveAttribute(
      "href",
      "/applications",
    );
    const next = screen.getByRole("button", { name: "Seguir para o CV" });
    expect(next).toBeDisabled();
    expect(next).toHaveAccessibleDescription(
      "Faltando: empresa, cargo, plataforma",
    );
    expect(screen.queryByText(/Continue to CV|Missing|Saving/)).toBeNull();
  });

  it("step 2's footer: Back, Finish, the CV copy still missing, a failed save", async () => {
    await renderInPortuguese(
      <DraftFooterActions
        step="cv"
        status={<AutosaveStatus status="error" onRetry={vi.fn()} />}
        canContinue
        onContinue={vi.fn()}
        onBack={vi.fn()}
        missing={["cv"]}
        onFinish={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "Voltar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Concluir" })).toBeDisabled();
    expect(screen.getByText("Faltando: cópia do CV")).toBeInTheDocument();
    expect(screen.getByText("Não salvo")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Tentar de novo" }),
    ).toBeInTheDocument();
  });

  it("the page header keeps the user's role and company as typed", async () => {
    await renderInPortuguese(
      <>
        <DraftPageHeader subtitle="Senior Engineer · Acme Inc" />
        <DraftNoMasterCv />
        <DraftLoadMessage kind="not-found" />
      </>,
    );

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Nova candidatura com CV",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar para candidaturas" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer · Acme Inc")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "Ainda não há um CV principal para copiar",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Criar seu primeiro CV" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Este rascunho não está disponível"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Ir para candidaturas" }),
    ).toBeInTheDocument();
  });

  it("a draft row: Portuguese words and time, the role and company as typed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-31T14:00:00Z"));
    const user = userEvent.setup();
    await renderInPortuguese(
      <DraftsSection drafts={[DRAFT]} onDelete={vi.fn()} />,
    );

    expect(screen.getByText("Acme Inc")).toBeInTheDocument();
    expect(screen.getByText("Senior Engineer")).toBeInTheDocument();
    const saved = screen.getByText("Salvo há 5 minutos");
    // The hover title is the Portuguese date ("31 de out. de 2026, …").
    expect(saved).toHaveAttribute(
      "title",
      expect.stringMatching(/^31 de out\. de 2026/),
    );
    expect(screen.getByText("Cópia do CV")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Retomar Senior Engineer em Acme Inc" }),
    ).toHaveAttribute("href", "/applications/new-with-cv?id=d-1");

    await user.click(
      screen.getByRole("button", {
        name: "Excluir rascunho Senior Engineer em Acme Inc",
      }),
    );
    const dialog = await screen.findByRole("alertdialog");
    expect(
      within(dialog).getByRole("heading", { name: "Excluir este rascunho?" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "O rascunho de Senior Engineer em Acme Inc e a cópia do CV dele são excluídos para sempre. Seus CVs principais não mudam.",
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Excluir rascunho" }),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("button", { name: "Cancelar" }),
    ).toBeInTheDocument();
  });
});

let localeSwitch: ReturnType<typeof useLocaleSwitch> | null = null;
function Grab() {
  const value = useLocaleSwitch();
  useEffect(() => {
    localeSwitch = value;
  });
  return null;
}

function Switchable({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider>
      <Grab />
      {children}
    </LocaleProvider>
  );
}

describe("a language switch re-renders the Drafts tab on its own", () => {
  it("the empty state's link and a row's names follow, with no parent re-render", async () => {
    // The section alone, not inside the applications page: it must subscribe
    // to the language itself.
    render(
      <>
        <DraftsSection drafts={[]} onDelete={vi.fn()} />
        <DraftsSection drafts={[DRAFT]} onDelete={vi.fn()} />
      </>,
      { wrapper: Switchable },
    );
    expect(screen.getByRole("link", { name: "New with CV" })).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Resume Senior Engineer at Acme Inc" }),
    ).toBeVisible();

    await act(async () => {
      localeSwitch!.setLocale("pt-BR");
    });
    await waitFor(() => expect(document.documentElement.lang).toBe("pt-BR"));

    expect(
      await screen.findByRole("link", { name: "Nova com CV" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Retomar Senior Engineer em Acme Inc" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Excluir rascunho Senior Engineer em Acme Inc",
      }),
    ).toBeVisible();
  });
});
