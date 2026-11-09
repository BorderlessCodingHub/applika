import { render, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LocaleProvider } from "@/i18n/locale-provider";
import { renderInPortuguese } from "@/test/portuguese";

import { CookiePolicyPage } from "./cookie-policy-page";

/**
 * Both widths' trees are in the DOM (CSS shows one): today's table at md and
 * up, v2/CookiePolicy's list below md under the phone public bar (which holds
 * the language switcher, so the render needs a `LocaleProvider`).
 */

function tree(slot: "cookie-policy-desktop" | "cookie-policy-phone") {
  return document.querySelector<HTMLElement>(`[data-slot="${slot}"]`)!;
}

function rowFor(name: string) {
  const cell = within(tree("cookie-policy-desktop")).getByRole("cell", {
    name,
  });
  return cell.closest("tr") as HTMLTableRowElement;
}

function phoneRow(name: string) {
  return tree("cookie-policy-phone").querySelector<HTMLElement>(
    `li[data-slot="cookie-row"][data-cookie="${name}"]`,
  )!;
}

describe("CookiePolicyPage", () => {
  it("lists the language cookie: what it holds and how long it lasts", () => {
    render(<CookiePolicyPage />, { wrapper: LocaleProvider });

    const desktop = within(tree("cookie-policy-desktop"));
    expect(
      desktop.getByRole("heading", { level: 1, name: "Cookie Policy" }),
    ).toBeVisible();
    const row = within(rowFor("NEXT_LOCALE"));
    expect(row.getByText(/holds en \(English\) or pt-BR/)).toBeVisible();
    expect(row.getByText("1 year (readable by the page)")).toBeVisible();
    expect(row.getByText("Preference")).toBeVisible();
    // The session cookies are still there.
    expect(rowFor("__access")).toBeTruthy();
    expect(rowFor("__refresh")).toBeTruthy();
    expect(desktop.getByText(/Last updated: October 31, 2026/)).toBeVisible();
  });

  it("below md: the board's list, the same rows and words, under Home and the pair", () => {
    render(<CookiePolicyPage />, { wrapper: LocaleProvider });

    const phone = tree("cookie-policy-phone");
    const view = within(phone);
    expect(phone).toHaveClass("md:hidden");
    expect(
      view.getByRole("heading", { level: 1, name: "Cookie Policy" }),
    ).toBeInTheDocument();
    expect(view.getByText("Legal")).toBeInTheDocument();
    expect(
      view.getByText("Last updated: October 31, 2026"),
    ).toBeInTheDocument();
    const bar = phone.querySelector<HTMLElement>(
      '[data-slot="phone-public-bar"]',
    )!;
    expect(within(bar).getByRole("link", { name: "Home" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(
      within(bar).getByRole("radiogroup", { name: "Toggle language" }),
    ).toBeInTheDocument();

    // The same cookies as the table, in its order.
    const desktopNames = [
      ...tree("cookie-policy-desktop").querySelectorAll("tbody tr"),
    ].map((tr) => tr.querySelector("td")?.textContent);
    const phoneNames = [
      ...phone.querySelectorAll('li[data-slot="cookie-row"]'),
    ].map((li) => li.getAttribute("data-cookie"));
    expect(phoneNames).toEqual(desktopNames);

    const locale = phoneRow("NEXT_LOCALE");
    expect(locale).toHaveTextContent(/holds en \(English\) or pt-BR/);
    expect(locale).toHaveTextContent("1 year (readable by the page)");
    expect(locale).toHaveTextContent("Preference");
    expect(locale.querySelector("code")).toHaveTextContent("NEXT_LOCALE");
    for (const title of [
      "What are cookies?",
      "Third-party cookies",
      "Managing cookies",
    ]) {
      expect(
        view.getByRole("heading", { level: 2, name: title }),
      ).toBeInTheDocument();
    }
  });

  it("reads in Portuguese (Brazil), dates included", async () => {
    await renderInPortuguese(<CookiePolicyPage />, { localeSwitch: true });

    for (const slot of [
      "cookie-policy-desktop",
      "cookie-policy-phone",
    ] as const) {
      const view = within(tree(slot));
      expect(
        view.getByRole("heading", { level: 1, name: "Política de Cookies" }),
      ).toBeInTheDocument();
      expect(
        view.getByText("Última atualização: 31 de outubro de 2026"),
      ).toBeInTheDocument();
    }
    const row = within(rowFor("NEXT_LOCALE"));
    expect(row.getByText("1 ano (legível pela página)")).toBeVisible();
    expect(row.getByText("Preferência")).toBeVisible();
    expect(phoneRow("NEXT_LOCALE")).toHaveTextContent(
      "1 ano (legível pela página)",
    );
    expect(phoneRow("NEXT_LOCALE")).toHaveTextContent("Preferência");
    expect(
      within(tree("cookie-policy-desktop")).getByRole("link", {
        name: "página inicial",
      }),
    ).toHaveAttribute("href", "/");
    expect(
      within(tree("cookie-policy-phone")).getByRole("link", { name: "Início" }),
    ).toHaveAttribute("href", "/");
  });
});
