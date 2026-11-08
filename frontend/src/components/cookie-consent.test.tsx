import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";

import { CookieConsent } from "./cookie-consent";

/**
 * The cookie notice: it is on screen until the user acknowledges it, and the
 * acknowledgement is persisted under `applika.cookie-notice-ack`.
 */

const STORAGE_KEY = "applika.cookie-notice-ack";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
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
  });

  it("hides and stores the acknowledgement once dismissed", async () => {
    const user = userEvent.setup();
    render(<CookieConsent />);

    await user.click(screen.getByRole("button", { name: "Got it" }));

    expect(
      screen.queryByRole("dialog", { name: "Cookie notice" }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("1");
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
