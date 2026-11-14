import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LandingHeader } from "@/components/landing/landing-header";
import { LocaleProvider } from "@/i18n/locale-provider";
import { renderInPortuguese } from "@/test/portuguese";

/**
 * The public header at md and up (`/`, `/cli`, `/cookie-policy`), in the
 * owner's order: the logo, then the theme toggle, the language switcher and
 * Sign in, or Dashboard once signed in.
 */

let auth = { isAuthenticated: false, isLoading: false };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

beforeEach(() => {
  auth = { isAuthenticated: false, isLoading: false };
});

function expectOrder(words: {
  home: string;
  theme: string;
  language: string;
  action: string;
  href: string;
}) {
  const banner = screen.getByRole("banner");
  const home = within(banner).getByRole("link", { name: words.home });
  const theme = within(banner).getByRole("button", { name: words.theme });
  const group = within(banner).getByRole("radiogroup", {
    name: words.language,
  });
  const [english, portuguese] = within(group).getAllByRole("radio");
  const action = within(banner).getByRole("link", { name: words.action });

  expect(
    Array.from(
      banner.querySelectorAll<HTMLElement>("a, button, [role='radio']"),
    ),
  ).toEqual([home, theme, english, portuguese, action]);
  expect(home).toHaveAttribute("href", "/");
  expect(action).toHaveAttribute("href", words.href);
  // Theme, language and the action are siblings in that order.
  expect(theme.nextElementSibling).toBe(group);
  expect(group.nextElementSibling).toBe(action);
  // The switcher keeps its EN / BR text at md and up.
  expect(group).not.toHaveAttribute("data-flags-only");
  expect(english).toHaveTextContent("EN");
  expect(portuguese).toHaveTextContent("BR");
}

describe("LandingHeader: the public order at md and up", () => {
  it("signed out: logo, theme, language, Sign in", () => {
    render(<LandingHeader />, { wrapper: LocaleProvider });
    expectOrder({
      home: "Applika.dev home",
      theme: "Toggle theme",
      language: "Toggle language",
      action: "Sign in",
      href: "/login",
    });
  });

  it("signed in: logo, theme, language, Dashboard", () => {
    auth = { isAuthenticated: true, isLoading: false };
    render(<LandingHeader />, { wrapper: LocaleProvider });
    expectOrder({
      home: "Applika.dev home",
      theme: "Toggle theme",
      language: "Toggle language",
      action: "Dashboard",
      href: "/dashboard",
    });
  });

  it("in Portuguese, signed out: logo, tema, idioma, Entrar", async () => {
    await renderInPortuguese(<LandingHeader />, { localeSwitch: true });
    expectOrder({
      home: "Página inicial do Applika.dev",
      theme: "Alternar tema",
      language: "Alternar idioma",
      action: "Entrar",
      href: "/login",
    });
  });

  it("in Portuguese, signed in: logo, tema, idioma, Painel", async () => {
    auth = { isAuthenticated: true, isLoading: false };
    await renderInPortuguese(<LandingHeader />, { localeSwitch: true });
    expectOrder({
      home: "Página inicial do Applika.dev",
      theme: "Alternar tema",
      language: "Alternar idioma",
      action: "Painel",
      href: "/dashboard",
    });
  });
});
