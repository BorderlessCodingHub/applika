import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { loadMessages } from "@/i18n/load-messages";

import { PhoneLandingCta } from "./phone-landing-cta";

/**
 * v2/Landing's floating action below md, on `/` and `/cli`: today's landing
 * button, unchanged. Signed out (or while the session loads) "Sign in with
 * Borderless" to /login; signed in "Go to Dashboard" to /dashboard.
 */

let auth = { isAuthenticated: false, isLoading: false };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

beforeEach(() => {
  auth = { isAuthenticated: false, isLoading: false };
});

const block = () =>
  document.querySelector<HTMLElement>('[data-slot="landing-phone-cta"]')!;

async function renderIn(locale: "en" | "pt-BR") {
  const messages = await loadMessages(locale);
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    );
  }
  return render(<PhoneLandingCta />, { wrapper: Wrapper });
}

describe("PhoneLandingCta", () => {
  it.each([
    ["en", "signed out", false, false, "Sign in with Borderless", "/login"],
    ["en", "loading", true, true, "Sign in with Borderless", "/login"],
    ["en", "signed in", true, false, "Go to Dashboard", "/dashboard"],
    ["pt-BR", "signed out", false, false, "Entrar com a Borderless", "/login"],
    ["pt-BR", "loading", true, true, "Entrar com a Borderless", "/login"],
    ["pt-BR", "signed in", true, false, "Ir para o painel", "/dashboard"],
  ] as const)(
    "%s, %s: one link %s",
    async (locale, _, isAuthenticated, isLoading, name, href) => {
      auth = { isAuthenticated, isLoading };
      await renderIn(locale);

      expect(block()).toHaveClass("ph-landing-cta");
      const links = within(block()).getAllByRole("link");
      expect(links).toHaveLength(1);
      expect(links[0]).toHaveAccessibleName(name);
      expect(links[0]).toHaveTextContent(name);
      expect(links[0]).toHaveAttribute("href", href);
      expect(links[0]).toHaveClass("ph-landing-cta-btn");
    },
  );

  it("is the one block: no other control beside the link", async () => {
    await renderIn("en");
    expect(block().children).toHaveLength(1);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
