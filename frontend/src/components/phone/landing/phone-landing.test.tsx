import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { PhoneLanding } from "./phone-landing";

/**
 * v2/Landing below md: the board's sections and words, the theme + language
 * pair in its header (once, flags only, no Sign in link) and the sticky CTA
 * to /login; signed in, the CTA leads to the dashboard as the desktop does.
 */

let auth = { isAuthenticated: false, isLoading: false };

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => auth,
}));

function renderLanding() {
  return render(<PhoneLanding />, { wrapper: LocaleProvider });
}

const root = () =>
  document.querySelector<HTMLElement>('[data-slot="landing-phone"]')!;
const cta = () =>
  document.querySelector<HTMLElement>('[data-slot="landing-phone-cta"]')!;

beforeEach(() => {
  auth = { isAuthenticated: false, isLoading: false };
});

describe("PhoneLanding", () => {
  it("is phone-only, on the board's root", () => {
    renderLanding();
    expect(root()).toHaveClass("ph-app", "md:hidden");
  });

  it("draws the board's sections in order, with its words", () => {
    renderLanding();
    const main = screen.getByRole("main");

    expect(
      within(main).getByText("Free & open-source job tracker"),
    ).toBeInTheDocument();
    expect(within(main).getByRole("heading", { level: 1 })).toHaveTextContent(
      "Manage your job search with clarity.",
    );
    expect(
      within(main).getByRole("region", { name: "Product preview" }),
    ).toBeInTheDocument();
    expect(
      within(main)
        .getAllByRole("heading", { level: 2 })
        .map((h) => h.textContent),
    ).toEqual([
      "Track every application",
      "Never miss an interview",
      "Learn what works",
      "Up and running in minutes",
      "Open source, built in the open",
    ]);
    const steps = within(main).getByRole("list");
    expect(within(steps).getAllByRole("listitem")).toHaveLength(3);
    expect(steps).toHaveTextContent("01");
    expect(steps).toHaveTextContent("03");
    expect(within(main).getByRole("figure")).toHaveTextContent(
      "Matheus Oliveira",
    );
    expect(
      within(main).getByRole("link", { name: "View on GitHub" }),
    ).toHaveAttribute("href", "https://github.com/applikadev");
  });

  it("hides the preview card from screen readers: it is a picture of the app", () => {
    renderLanding();
    const preview = screen.getByRole("region", { name: "Product preview" });
    expect(preview.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("holds one theme + language pair, in the header, and no Sign in there", () => {
    renderLanding();
    const header = screen.getByRole("banner");

    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });
    const theme = within(header).getByRole("button", { name: /toggle theme/i });
    expect(theme.nextElementSibling).toBe(group);
    expect(group).toHaveAttribute("data-flags-only", "");
    const home = within(header).getByRole("link", { name: "Applika.dev home" });
    expect(home).toHaveAttribute("href", "/");
    expect(
      home.compareDocumentPosition(theme) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(header).getAllByRole("link")).toEqual([home]);
  });

  it("keeps a sign-in action in reach: the sticky CTA to /login", () => {
    renderLanding();

    expect(cta()).toHaveClass("ph-landing-cta");
    const link = within(cta()).getByRole("link", {
      name: "Sign in with Borderless",
    });
    expect(link).toHaveAttribute("href", "/login");
    expect(link).toHaveClass("ph-landing-cta-btn");
    // The CTA is the root's last child, so `sticky bottom-0` holds it in view.
    expect(root().lastElementChild).toBe(cta());
  });

  it("links the footer to the cookie policy", () => {
    renderLanding();
    const footer = screen.getByRole("contentinfo");

    expect(
      within(footer).getByRole("link", { name: "Cookie policy" }),
    ).toHaveAttribute("href", "/cookie-policy");
    expect(footer).toHaveTextContent("© Applika.dev");
  });

  it("signed in: Go to Dashboard below, to /dashboard; the header has no Dashboard", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderLanding();

    expect(
      within(cta()).getByRole("link", { name: "Go to Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(root().lastElementChild).toBe(cta());
    expect(
      within(screen.getByRole("banner")).queryByRole("link", {
        name: /dashboard/i,
      }),
    ).toBeNull();
    expect(
      screen.queryByRole("link", { name: /sign in with borderless/i }),
    ).toBeNull();
  });

  it("while the session loads it offers the signed-out CTA", () => {
    auth = { isAuthenticated: true, isLoading: true };
    renderLanding();

    expect(
      within(cta()).getByRole("link", { name: "Sign in with Borderless" }),
    ).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /dashboard/i })).toBeNull();
  });
});
