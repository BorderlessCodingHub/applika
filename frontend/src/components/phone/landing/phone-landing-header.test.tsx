import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { PhoneLandingHeader } from "./phone-landing-header";

/**
 * The public phone header of v2/Landing and v3/Cli: the home link, the one
 * language + theme pair (the boards draw only the logo and Sign in; the pair
 * stays, mobile-design rule 5), then Sign in, or Dashboard once signed in.
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

describe("PhoneLandingHeader", () => {
  it("is the board's header: the home link with the logo, then the pair and Sign in", () => {
    renderHeader();
    const header = screen.getByRole("banner");

    expect(header).toHaveClass("ph-landing-header", "min-h-16", "flex-wrap");
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveClass("min-h-11");
    expect(home).toHaveTextContent("applika.dev");
    expect(home.querySelector("svg")).toHaveAttribute("aria-hidden", "true");

    const signIn = within(header).getByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(signIn).toHaveClass("min-h-11", "text-[15px]", "font-semibold");
    expect(
      within(header).queryByRole("link", { name: "Dashboard" }),
    ).toBeNull();
  });

  it("holds exactly one language + theme pair, before Sign in", () => {
    renderHeader();
    const header = screen.getByRole("banner");

    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });
    expect(within(group).getByRole("radio", { name: "English" })).toBeChecked();
    expect(
      within(group).getByRole("radio", { name: "Português" }),
    ).toBeInTheDocument();
    const theme = within(header).getByRole("button", { name: /toggle theme/i });
    expect(group.nextElementSibling).toBe(theme);
    expect(group.parentElement).toHaveClass("ph-pair");
    const signIn = within(header).getByRole("link", { name: "Sign in" });
    expect(
      theme.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("signed in: Dashboard to /dashboard instead of Sign in", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderHeader();
    const header = screen.getByRole("banner");

    expect(
      within(header).getByRole("link", { name: "Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(within(header).queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("while the session loads it offers Sign in", () => {
    auth = { isAuthenticated: true, isLoading: true };
    renderHeader();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull();
  });
});
