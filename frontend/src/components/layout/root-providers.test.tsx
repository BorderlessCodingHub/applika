import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/theme-toggle";
import type { ReactNode } from "react";

// Keep the test on the theme wiring: stub the providers that do I/O or render
// chrome, so only next-themes drives the class on <html>.
vi.mock("@/contexts/auth-context", () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/cookie-consent", () => ({ CookieConsent: () => null }));

async function renderRootProviders(children: ReactNode = <span>child</span>) {
  // The "system" normalisation runs at module scope, so every case needs a
  // fresh module instance evaluated against the localStorage set just above.
  vi.resetModules();
  const { RootProviders } = await import("./root-providers");
  render(<RootProviders>{children}</RootProviders>);
}

describe("RootProviders theme", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  it("defaults a visitor who never chose a theme to dark", async () => {
    await renderRootProviders();

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(document.documentElement.classList.contains("light")).toBe(false);
  });

  it('respects a saved "light" choice', async () => {
    window.localStorage.setItem("theme", "light");

    await renderRootProviders();

    await waitFor(() => {
      expect(document.documentElement.classList.contains("light")).toBe(true);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");
  });

  it('resolves a saved "system" choice to dark', async () => {
    // Left behind by the release that ran defaultTheme="system" + enableSystem.
    window.localStorage.setItem("theme", "system");

    await renderRootProviders();

    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    // Never the literal "system" class, which is neither light nor dark.
    expect(document.documentElement.classList.contains("system")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });

  // Criterion 5: the toggle survives the switch to a dark default. It is the
  // only way a visitor can reach the light theme now that `enableSystem` is
  // gone, so it needs an assertion that outlives a shell restyle.
  it("toggles between dark and light, and persists the choice", async () => {
    const user = userEvent.setup();
    await renderRootProviders(<ThemeToggle />);

    const toggle = await screen.findByRole("button", { name: /toggle theme/i });
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    await user.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("light")).toBe(true);
    });
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("light");

    await user.click(toggle);
    await waitFor(() => {
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });
    expect(document.documentElement.classList.contains("light")).toBe(false);
    expect(window.localStorage.getItem("theme")).toBe("dark");
  });
});

describe("RootProviders language", () => {
  function Probe() {
    const t = useTranslations("common");
    return <span data-testid="word">{t("cancel")}</span>;
  }

  beforeEach(() => {
    document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    document.cookie = "NEXT_LOCALE=; Path=/; Max-Age=0";
    document.documentElement.lang = "en";
  });

  it("carries the LocaleProvider: the switcher works and a saved pt-BR applies on load", async () => {
    document.cookie = "NEXT_LOCALE=pt-BR; Path=/";
    // Fresh modules, so the toggle shares the providers' LocaleProvider context.
    vi.resetModules();
    const { RootProviders } = await import("./root-providers");
    const { LanguageToggle } = await import("@/components/language-toggle");
    render(
      <RootProviders>
        <LanguageToggle />
        <Probe />
      </RootProviders>,
    );

    // The saved language resolves after mount: words, <html lang> and the pill.
    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancelar"),
    );
    expect(document.documentElement.lang).toBe("pt-BR");
    expect(screen.getByRole("radio", { name: "Português" })).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // A pick swaps back in place.
    await userEvent
      .setup()
      .click(screen.getByRole("radio", { name: "English" }));
    await waitFor(() =>
      expect(screen.getByTestId("word")).toHaveTextContent("Cancel"),
    );
    expect(document.documentElement.lang).toBe("en");
  });
});
