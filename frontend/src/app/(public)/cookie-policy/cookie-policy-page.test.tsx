import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";

import en from "@/i18n/messages/en.json";
import ptBR from "@/i18n/messages/pt-BR.json";

import { CookiePolicyPage } from "./cookie-policy-page";

function rowFor(name: string) {
  const cell = screen.getByRole("cell", { name });
  return cell.closest("tr") as HTMLTableRowElement;
}

describe("CookiePolicyPage", () => {
  it("lists the language cookie: what it holds and how long it lasts", () => {
    render(<CookiePolicyPage />);

    expect(
      screen.getByRole("heading", { level: 1, name: "Cookie Policy" }),
    ).toBeVisible();
    const row = within(rowFor("NEXT_LOCALE"));
    expect(row.getByText(/holds en \(English\) or pt-BR/)).toBeVisible();
    expect(row.getByText("1 year (readable by the page)")).toBeVisible();
    expect(row.getByText("Preference")).toBeVisible();
    // The session cookies are still there.
    expect(rowFor("__access")).toBeTruthy();
    expect(rowFor("__refresh")).toBeTruthy();
    expect(screen.getByText(/Last updated: October 31, 2026/)).toBeVisible();
  });

  it("reads in Portuguese (Brazil), dates included", () => {
    render(
      <NextIntlClientProvider
        locale="pt-BR"
        messages={ptBR as unknown as typeof en}
        timeZone="UTC"
      >
        <CookiePolicyPage />
      </NextIntlClientProvider>,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Política de Cookies" }),
    ).toBeVisible();
    expect(
      screen.getByText("Última atualização: 31 de outubro de 2026"),
    ).toBeVisible();
    const row = within(rowFor("NEXT_LOCALE"));
    expect(row.getByText("1 ano (legível pela página)")).toBeVisible();
    expect(row.getByText("Preferência")).toBeVisible();
    expect(
      screen.getByRole("link", { name: "página inicial" }),
    ).toHaveAttribute("href", "/");
  });
});
