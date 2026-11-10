import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { PhoneLandingHeader } from "./phone-landing-header";

/**
 * The public phone header of v2/Landing and v3/Cli, in the owner's order:
 * the Applika icon as the home link, then the theme toggle, the language
 * toggle with its flags only, and the sign-in button: "Sign in" to /login
 * signed out (and while the session loads), "Dashboard" to /dashboard signed
 * in, the words the desktop `LandingHeader` uses.
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

const signInButton = (header: HTMLElement) =>
  header.querySelector<HTMLElement>('[data-slot="landing-phone-sign-in"]')!;

/** The words the header draws: its text without the screen-reader-only names. */
function drawnText(header: HTMLElement) {
  const copy = header.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(".sr-only").forEach((node) => node.remove());
  return copy.textContent;
}

describe("PhoneLandingHeader", () => {
  it("is the board's header: the home link is the Applika icon alone", () => {
    renderHeader();
    const header = screen.getByRole("banner");

    expect(header).toHaveClass("ph-landing-header", "min-h-16", "flex-wrap");
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveClass("ph-landing-home");
    // No words: the icon, hidden from assistive tech, names nothing.
    expect(home).toHaveTextContent(/^$/);
    expect(home.children).toHaveLength(1);
    expect(home.firstElementChild?.tagName.toLowerCase()).toBe("svg");
    expect(home.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(drawnText(header)).not.toMatch(/applika|\.dev/i);
  });

  it("orders the home link, the theme toggle, the language toggle, then Sign in", () => {
    renderHeader();
    const header = screen.getByRole("banner");
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    const theme = within(header).getByRole("button", { name: /toggle theme/i });
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });
    const signIn = within(header).getByRole("link", { name: "Sign in" });

    expect(controls(header)).toEqual([
      home,
      theme,
      within(group).getByRole("radio", { name: "English" }),
      within(group).getByRole("radio", { name: "Português" }),
      signIn,
    ]);
    // The theme toggle and the switcher share the 44px pair, theme first;
    // the button follows the pair on the right side.
    expect(theme.nextElementSibling).toBe(group);
    expect(group.parentElement).toBe(theme.parentElement);
    expect(group.parentElement).toHaveClass("ph-pair");
    expect(group.parentElement?.nextElementSibling).toBe(signIn);
    expect(signIn.parentElement).toHaveClass("ph-landing-actions");
    expect(signIn.parentElement?.parentElement).toBe(header);
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
    ["while the session loads", { isAuthenticated: true, isLoading: true }],
  ])("%s: Sign in, the phone's small primary button, to /login", (_, state) => {
    auth = state;
    renderHeader();
    const header = screen.getByRole("banner");
    const button = signInButton(header);

    expect(within(header).getAllByRole("link")).toHaveLength(2);
    expect(button).toBe(within(header).getByRole("link", { name: "Sign in" }));
    expect(button).toHaveAttribute("href", "/login");
    expect(button).toHaveTextContent(/^Sign in$/);
    expect(button).toHaveClass(
      "ph-btn",
      "ph-pri",
      "ph-sm",
      "whitespace-nowrap",
    );
    expect(
      within(header).queryByRole("link", { name: /dashboard/i }),
    ).toBeNull();
    // The words drawn in the header are the button's alone.
    expect(drawnText(header)).toBe("Sign in");
  });

  it("signed in: Dashboard, to /dashboard, in the same place", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderHeader();
    const header = screen.getByRole("banner");
    const button = signInButton(header);

    expect(within(header).getAllByRole("link")).toHaveLength(2);
    expect(button).toBe(
      within(header).getByRole("link", { name: "Dashboard" }),
    );
    expect(button).toHaveAttribute("href", "/dashboard");
    expect(button).toHaveClass("ph-btn", "ph-pri", "ph-sm");
    expect(controls(header).at(-1)).toBe(button);
    expect(within(header).queryByRole("link", { name: /sign in/i })).toBeNull();
    expect(drawnText(header)).toBe("Dashboard");
  });

  it("changes only the button between signed out and signed in", () => {
    const first = renderHeader();
    const signedOut = first.container.innerHTML;
    first.unmount();
    auth = { isAuthenticated: true, isLoading: false };
    const signedIn = renderHeader().container.innerHTML;
    expect(signedIn).not.toBe(signedOut);
    expect(
      signedIn
        .replace('href="/dashboard"', 'href="/login"')
        .replace(">Dashboard<", ">Sign in<"),
    ).toBe(signedOut);
  });
});
