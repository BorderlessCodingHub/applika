import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";

import { PhoneLanding } from "./phone-landing";

/**
 * v2/Landing below md: the board's sections and words, the language + theme
 * pair in its header (once), "Sign in" there and the sticky CTA, both to
 * /login; signed in, both lead to the dashboard as the desktop does.
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

  it("holds one language + theme pair, in the header, before Sign in", () => {
    renderLanding();
    const header = screen.getByRole("banner");

    expect(
      screen.getAllByRole("radiogroup", { name: "Toggle language" }),
    ).toHaveLength(1);
    const group = within(header).getByRole("radiogroup", {
      name: "Toggle language",
    });
    const theme = within(header).getByRole("button", { name: /toggle theme/i });
    expect(group.nextElementSibling).toBe(theme);
    expect(
      within(header).getByRole("link", { name: "Applika.dev home" }),
    ).toHaveAttribute("href", "/");
    const signIn = within(header).getByRole("link", { name: "Sign in" });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(
      theme.compareDocumentPosition(signIn) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
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

  it("signed in: Dashboard in the header and Go to Dashboard below, both to /dashboard", () => {
    auth = { isAuthenticated: true, isLoading: false };
    renderLanding();

    expect(
      within(screen.getByRole("banner")).getByRole("link", {
        name: "Dashboard",
      }),
    ).toHaveAttribute("href", "/dashboard");
    expect(
      within(cta()).getByRole("link", { name: "Go to Dashboard" }),
    ).toHaveAttribute("href", "/dashboard");
    expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  });

  it("while the session loads it offers the signed-out links", () => {
    auth = { isAuthenticated: true, isLoading: true };
    renderLanding();

    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login",
    );
  });
});
