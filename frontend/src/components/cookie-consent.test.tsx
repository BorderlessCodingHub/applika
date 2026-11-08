import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";

import { COOKIE_NOTICE_HEIGHT_VAR, CookieConsent } from "./cookie-consent";

/**
 * The cookie notice: a floating card in the bottom-right corner.
 *
 * Three properties hang off this file:
 *  - it is on screen until the user acknowledges it, and the acknowledgement is
 *    persisted under `applika.cookie-notice-ack`;
 *  - while it is up it RESERVES its height plus its margins on the document, so
 *    it cannot cover a control — an in-page `sticky bottom-0` footer included;
 *  - once dismissed it reserves nothing.
 */

const STORAGE_KEY = "applika.cookie-notice-ack";
/** The height jsdom is told the card has; jsdom itself lays nothing out. */
const CARD_HEIGHT = 96;
/** The card's 16px margin below it and again above it. */
const RESERVED = `${CARD_HEIGHT + 32}px`;

const reserved = () =>
  document.documentElement.style.getPropertyValue(COOKIE_NOTICE_HEIGHT_VAR);

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.style.removeProperty(COOKIE_NOTICE_HEIGHT_VAR);
  // jsdom lays nothing out, so every rect is 0x0 and a measured reservation
  // would be indistinguishable from no reservation. Give the card a height.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    height: CARD_HEIGHT,
    width: 1280,
    top: 0,
    left: 0,
    right: 1280,
    bottom: CARD_HEIGHT,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
  document.documentElement.style.removeProperty(COOKIE_NOTICE_HEIGHT_VAR);
});

describe("CookieConsent", () => {
  it("renders the notice when it has not been acknowledged", () => {
    render(<CookieConsent />);

    const notice = screen.getByRole("dialog", { name: "Cookie notice" });
    expect(notice).toBeInTheDocument();
    expect(notice).toHaveTextContent("We use essential cookies");
    expect(screen.getByRole("link", { name: "Learn more" })).toHaveAttribute(
      "href",
      "/cookie-policy",
    );
    expect(screen.getByRole("button", { name: "Got it" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Dismiss cookie notice" }),
    ).toBeInTheDocument();
  });

  it("stays hidden once the acknowledgement is already stored", () => {
    window.localStorage.setItem(STORAGE_KEY, "1");

    render(<CookieConsent />);

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(reserved()).toBe("");
  });

  it("reserves its measured height and margins on the document while it is up", () => {
    render(<CookieConsent />);

    expect(reserved()).toBe(RESERVED);
  });

  it("hides, stores the acknowledgement and reserves nothing once dismissed", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    // Removed, not zeroed: nothing is left reserving space on the page.
    expect(reserved()).toBe("");
  });

  it("dismisses from the close control too", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);

    await user.click(
      screen.getByRole("button", { name: "Dismiss cookie notice" }),
    );

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
    expect(reserved()).toBe("");
  });
});

describe("CookieConsent in Portuguese (Brazil)", () => {
  it("translates the notice, its link and its buttons", () => {
    render(
      <NextIntlClientProvider
        locale="pt-BR"
        messages={ptBR as unknown as typeof en}
        timeZone="UTC"
      >
        <CookieConsent />
      </NextIntlClientProvider>,
    );

    const notice = screen.getByRole("dialog", { name: "Aviso de cookies" });
    expect(notice).toHaveTextContent("Usamos cookies essenciais");
    expect(notice).toHaveTextContent(
      "Não usamos cookies de análise, publicidade ou rastreamento.",
    );
    expect(screen.getByRole("link", { name: "Saiba mais" })).toHaveAttribute(
      "href",
      "/cookie-policy",
    );
    expect(screen.getByRole("button", { name: "Entendi" })).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Fechar aviso de cookies" }),
    ).toBeVisible();
  });
});
