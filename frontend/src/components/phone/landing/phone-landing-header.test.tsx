import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { PhoneLandingHeader } from "./phone-landing-header";

/**
 * The public phone header of v2/Landing and v3/Cli, in the owner's order:
 * the "applika.dev" home link, the theme toggle, then the language toggle
 * with its flags only. No Sign in or Dashboard link: the floating
 * `PhoneLandingCta` carries them. The header reads no session, so it is the
 * same signed out, signed in and while the session loads.
 */

let auth = { isAuthenticated: false, isLoading: false };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

function renderHeader() {
  return render(<PhoneLandingHeader />, { wrapper: LocaleProvider });
}

beforeEach(() => {
  auth = { isAuthenticated: false, isLoading: false };
});

/** Every focusable control of the header, in DOM order. */
function controls(header: HTMLElement) {
  return Array.from(
    header.querySelectorAll<HTMLElement>("a, button, [role='radio']"),
  );
}

describe("PhoneLandingHeader", () => {
  it("is the board's header: the home link with the logo and applika.dev", () => {
    renderHeader();
    const header = screen.getByRole("banner");

    expect(header).toHaveClass("ph-landing-header", "min-h-16", "flex-wrap");
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveClass("min-h-11");
    expect(home).toHaveTextContent("applika.dev");
    expect(home.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("orders the home link, the theme toggle, then the language toggle", () => {
    renderHeader();
    const header = screen.getByRole("banner");
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    const theme = within(header).getByRole("button", { name: /toggle theme/i });
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });

    expect(controls(header)).toEqual([
      home,
      theme,
      within(group).getByRole("radio", { name: "English" }),
      within(group).getByRole("radio", { name: "Português" }),
    ]);
    // The theme toggle and the switcher share the 44px pair, theme first.
    expect(theme.nextElementSibling).toBe(group);
    expect(group.parentElement).toBe(theme.parentElement);
    expect(group.parentElement).toHaveClass("ph-pair", "ml-auto");
  });

  it("shows the language toggle's flags only, each radio keeping its endonym and lang", () => {
    renderHeader();
    const header = screen.getByRole("banner");

    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });
    expect(group).toHaveAttribute("data-flags-only", "");
    const english = within(group).getByRole("radio", { name: "English" });
    const portuguese = within(group).getByRole("radio", { name: "Português" });
    expect(english).toBeChecked();
    expect(english).toHaveAttribute("lang", "en");
    expect(portuguese).toHaveAttribute("lang", "pt-BR");
    for (const radio of [english, portuguese]) {
      // The flag alone, hidden from assistive tech: no EN / BR text.
      expect(radio).toHaveTextContent(/^$/);
      expect(radio.children).toHaveLength(1);
      expect(radio.firstElementChild?.tagName.toLowerCase()).toBe("svg");
      expect(radio.firstElementChild).toHaveAttribute("aria-hidden", "true");
    }
    expect(header).not.toHaveTextContent(/\bEN\b|\bBR\b/);
  });

  it.each([
    ["signed out", { isAuthenticated: false, isLoading: false }],
    ["signed in", { isAuthenticated: true, isLoading: false }],
    ["while the session loads", { isAuthenticated: true, isLoading: true }],
  ])("%s: no Sign in or Dashboard link, only the home link", (_, state) => {
    auth = state;
    renderHeader();
    const header = screen.getByRole("banner");

    expect(within(header).getAllByRole("link")).toHaveLength(1);
    expect(
      within(header).queryByRole("link", { name: /sign in|dashboard/i }),
    ).toBeNull();
    expect(header).not.toHaveTextContent(/sign in|dashboard/i);
  });

  it("renders the same markup whatever the session", () => {
    const first = renderHeader();
    const signedOut = first.container.innerHTML;
    first.unmount();
    auth = { isAuthenticated: true, isLoading: false };
    const signedIn = renderHeader().container.innerHTML;
    expect(signedIn).toBe(signedOut);
  });
});
